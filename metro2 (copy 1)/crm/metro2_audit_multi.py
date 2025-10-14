#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
metro2_audit_multi.py
---------------------
Parse consumer credit report HTML files, normalize personal info, tradelines,
and inquiries, then run a lightweight Metro-2 compliance audit.

This implementation is intentionally self-contained so that JavaScript tooling
can call it via CLI or import and reuse ``parse_credit_report_html``.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from collections import defaultdict
from dataclasses import dataclass
from datetime import date, datetime
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional, Sequence

from bs4 import BeautifulSoup

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

DATE_FORMATS: Sequence[str] = ("%m/%d/%Y", "%m/%d/%y", "%Y-%m-%d", "%b %d, %Y", "%B %d, %Y")

FIELD_ALIASES: Dict[str, str] = {
    "account #": "account_number",
    "acct #": "account_number",
    "account number": "account_number",
    "account number:": "account_number",
    "account status": "account_status",
    "account status:": "account_status",
    "account type": "account_type",
    "account type:": "account_type",
    "account type - detail": "account_type_detail",
    "bureau code": "bureau_code",
    "credit limit": "credit_limit",
    "credit limit:": "credit_limit",
    "creditor classification": "creditor_class",
    "date closed": "date_closed",
    "date closed:": "date_closed",
    "date first delinquency": "date_of_first_delinquency",
    "date of first delinquency": "date_of_first_delinquency",
    "date of first delinquency:": "date_of_first_delinquency",
    "dofd": "date_of_first_delinquency",
    "dofd:": "date_of_first_delinquency",
    "date last active": "date_last_active",
    "date last payment": "date_last_payment",
    "date of last payment": "date_last_payment",
    "date of last payment:": "date_last_payment",
    "date opened": "date_opened",
    "date opened:": "date_opened",
    "high credit": "high_credit",
    "high credit:": "high_credit",
    "original creditor": "original_creditor",
    "original creditor:": "original_creditor",
    "monthly payment": "monthly_payment",
    "monthly payment:": "monthly_payment",
    "past due": "past_due",
    "past due:": "past_due",
    "past due amount": "past_due",
    "payment history": "payment_history",
    "payment status": "payment_status",
    "payment status:": "payment_status",
    "comments": "comments",
    "comments:": "comments",
    "last reported": "last_reported",
    "last reported:": "last_reported",
    "balance": "balance",
    "balance:": "balance",
}

BUREAUS: Sequence[str] = ("TransUnion", "Experian", "Equifax")


RULEBOOK: Dict[str, Dict[str, Any]] = json.loads(
    """
{
  "MISSING_DOFD": {
    "id": 1,
    "violation": "Missing or invalid Date of First Delinquency",
    "fieldsImpacted": [
      "Date of First Delinquency"
    ],
    "severity": 5,
    "fcraSection": "§ 623(a)(5)",
    "rule": {
      "all": [
        {
          "field": "account_status",
          "eq": "Charge-off"
        },
        {
          "field": "date_first_delinquency",
          "exists": false
        }
      ]
    }
  },
  "LATE_STATUS_NO_PASTDUE": {
    "id": 2,
    "violation": "Payment history inconsistent with status",
    "fieldsImpacted": [
      "Payment History",
      "Account Status"
    ],
    "severity": 4,
    "fcraSection": "§ 607(b)"
  },
  "3": {
    "id": 3,
    "violation": "Account reported as open after closure",
    "fieldsImpacted": [
      "Account Status"
    ],
    "severity": 3,
    "fcraSection": "§ 623(a)(2)",
    "ruleSet": "Account Status & Codes"
  },
  "SL_NO_LATES_DURING_DEFERMENT": {
    "id": 4,
    "violation": "Late payment reported after account paid",
    "fieldsImpacted": [
      "Payment History"
    ],
    "severity": 3,
    "fcraSection": "§ 607(b)"
  },
  "OPEN_ZERO_CL_WITH_HC_COMMENT": {
    "id": 5,
    "violation": "Balance reported greater than credit limit",
    "fieldsImpacted": [
      "Balance",
      "Credit Limit"
    ],
    "severity": 4,
    "fcraSection": "§ 623(a)(1)"
  },
  "INSTALLMENT_WITH_CL": {
    "id": 6,
    "violation": "Incorrect high credit/limit for installment loan",
    "fieldsImpacted": [
      "High Credit",
      "Credit Limit"
    ],
    "severity": 3,
    "fcraSection": "§ 623(a)(1)"
  },
  "DEROG_RATING_BUT_CURRENT": {
    "id": 7,
    "violation": "Payment rating inconsistent with account status",
    "fieldsImpacted": [
      "Payment Rating",
      "Account Status"
    ],
    "severity": 3,
    "fcraSection": "§ 623(a)(1)"
  },
  "8": {
    "id": 8,
    "violation": "Charge-off lacks required DOFD",
    "fieldsImpacted": [
      "Date of First Delinquency",
      "Charge-Off"
    ],
    "severity": 5,
    "fcraSection": "§ 623(a)(5)",
    "ruleSet": "Dates"
  },
  "9": {
    "id": 9,
    "violation": "Missing original creditor name on collection account",
    "fieldsImpacted": [
      "Creditor Name"
    ],
    "severity": 3,
    "fcraSection": "§ 623(a)(1)",
    "ruleSet": "Data Definitions"
  },
  "DUPLICATE_ACCOUNT": {
    "id": 10,
    "violation": "Duplicate account reported",
    "fieldsImpacted": [
      "Account Number"
    ],
    "severity": 3,
    "fcraSection": "§ 607(b)",
    "ruleSet": "Duplicate/Conflicting Reporting"
  },
  "REVOLVING_WITH_TERMS": {
    "id": 11,
    "violation": "Wrong account type (revolving vs installment)",
    "fieldsImpacted": [
      "Account Type"
    ],
    "severity": 2,
    "fcraSection": "§ 607(b)"
  },
  "CURRENT_BUT_PASTDUE": {
    "id": 12,
    "violation": "Past due amount reported on current account",
    "fieldsImpacted": [
      "Past Due",
      "Account Status"
    ],
    "severity": 4,
    "fcraSection": "§ 623(a)(1)",
    "rule": {
      "all": [
        {
          "field": "account_status",
          "eq": "Current"
        },
        {
          "field": "past_due",
          "gt": 0
        }
      ]
    }
  },
  "13": {
    "id": 13,
    "violation": "Account re-aged without proof",
    "fieldsImpacted": [
      "Date Opened",
      "Payment History"
    ],
    "severity": 4,
    "fcraSection": "§ 623(a)(1)"
  },
  "14": {
    "id": 14,
    "violation": "Inaccurate last payment date",
    "fieldsImpacted": [
      "Last Payment Date"
    ],
    "severity": 3,
    "fcraSection": "§ 623(a)(2)"
  },
  "15": {
    "id": 15,
    "violation": "Inaccurate account status code",
    "fieldsImpacted": [
      "Account Status"
    ],
    "severity": 3,
    "fcraSection": "§ 623(a)(1)"
  },
  "16": {
    "id": 16,
    "violation": "Balance reported after bankruptcy discharge",
    "fieldsImpacted": [
      "Balance"
    ],
    "severity": 5,
    "fcraSection": "§ 607(b)"
  },
  "17": {
    "id": 17,
    "violation": "Account reported as active after settlement",
    "fieldsImpacted": [
      "Account Status"
    ],
    "severity": 3,
    "fcraSection": "§ 623(a)(1)"
  },
  "18": {
    "id": 18,
    "violation": "Payment history reported after account closed",
    "fieldsImpacted": [
      "Payment History"
    ],
    "severity": 3,
    "fcraSection": "§ 607(b)"
  },
  "REVOLVING_NO_CL_OR_HC": {
    "id": 19,
    "violation": "Missing credit limit for revolving account",
    "fieldsImpacted": [
      "Credit Limit"
    ],
    "severity": 2,
    "fcraSection": "§ 623(a)(1)"
  },
  "20": {
    "id": 20,
    "violation": "Missing current balance",
    "fieldsImpacted": [
      "Balance"
    ],
    "severity": 2,
    "fcraSection": "§ 623(a)(1)"
  },
  "21": {
    "id": 21,
    "violation": "Consumer statement omitted",
    "fieldsImpacted": [
      "Consumer Statement"
    ],
    "severity": 2,
    "fcraSection": "§ 609(c)"
  },
  "DISPUTE_COMMENT_NEEDS_XB": {
    "id": 22,
    "violation": "Dispute flag missing when account disputed",
    "fieldsImpacted": [
      "Dispute Flag"
    ],
    "severity": 4,
    "fcraSection": "§ 623(a)(3)"
  },
  "23": {
    "id": 23,
    "violation": "Dispute flag left after dispute resolved",
    "fieldsImpacted": [
      "Dispute Flag"
    ],
    "severity": 2,
    "fcraSection": "§ 623(a)(3)"
  },
  "24": {
    "id": 24,
    "violation": "Account opened date after last payment date",
    "fieldsImpacted": [
      "Date Opened",
      "Last Payment Date"
    ],
    "severity": 3,
    "fcraSection": "§ 623(a)(1)"
  },
  "DATE_ORDER_SANITY": {
    "id": 25,
    "violation": "Last reported date before date opened",
    "fieldsImpacted": [
      "Last Reported",
      "Date Opened"
    ],
    "severity": 4,
    "fcraSection": "§ 623(a)(1)"
  },
  "CO_OR_COLLECTION_PASTDUE": {
    "id": 26,
    "violation": "Charge-off amount differs from balance",
    "fieldsImpacted": [
      "Charge-Off Amount",
      "Balance"
    ],
    "severity": 3,
    "fcraSection": "§ 623(a)(1)"
  },
  "27": {
    "id": 27,
    "violation": "Missing creditor classification code",
    "fieldsImpacted": [
      "Creditor Classification"
    ],
    "severity": 2,
    "fcraSection": "§ 623(a)(1)"
  },
  "AU_COMMENT_ECOA_CONFLICT": {
    "id": 28,
    "violation": "Ownership code incorrect",
    "fieldsImpacted": [
      "Ownership Code"
    ],
    "severity": 3,
    "fcraSection": "§ 623(a)(1)"
  },
  "29": {
    "id": 29,
    "violation": "Debt reported as joint when individual",
    "fieldsImpacted": [
      "Ownership Code"
    ],
    "severity": 3,
    "fcraSection": "§ 623(a)(1)"
  },
  "30": {
    "id": 30,
    "violation": "Missing Terms Duration for installment account",
    "fieldsImpacted": [
      "Terms Duration"
    ],
    "severity": 2,
    "fcraSection": "§ 623(a)(1)"
  },
  "CLOSED_BUT_MONTHLY_PAYMENT": {
    "id": 31,
    "violation": "Inaccurate scheduled monthly payment",
    "fieldsImpacted": [
      "Scheduled Monthly Payment"
    ],
    "severity": 2,
    "fcraSection": "§ 623(a)(1)"
  },
  "32": {
    "id": 32,
    "violation": "Portfolio type missing for collection",
    "fieldsImpacted": [
      "Portfolio Type"
    ],
    "severity": 2,
    "fcraSection": "§ 623(a)(1)"
  },
  "33": {
    "id": 33,
    "violation": "Inaccurate collateral code",
    "fieldsImpacted": [
      "Collateral"
    ],
    "severity": 2,
    "fcraSection": "§ 623(a)(1)"
  },
  "34": {
    "id": 34,
    "violation": "Account reported as repossessed but balance >0",
    "fieldsImpacted": [
      "Account Status",
      "Balance"
    ],
    "severity": 3,
    "fcraSection": "§ 623(a)(1)"
  },
  "35": {
    "id": 35,
    "violation": "Missing ECOA code",
    "fieldsImpacted": [
      "ECOA Code"
    ],
    "severity": 3,
    "fcraSection": "§ 623(a)(1)"
  },
  "36": {
    "id": 36,
    "violation": "Payment history blocks incorrect",
    "fieldsImpacted": [
      "Payment History"
    ],
    "severity": 2,
    "fcraSection": "§ 607(b)"
  },
  "STALE_ACTIVE_REPORTING": {
    "id": 37,
    "violation": "Date of last activity inconsistent with status",
    "fieldsImpacted": [
      "Date of Last Activity",
      "Account Status"
    ],
    "severity": 3,
    "fcraSection": "§ 623(a)(1)"
  },
  "38": {
    "id": 38,
    "violation": "Incorrect MOP code",
    "fieldsImpacted": [
      "MOP"
    ],
    "severity": 2,
    "fcraSection": "§ 623(a)(1)"
  },
  "39": {
    "id": 39,
    "violation": "Missing Special Comment code for paid collection",
    "fieldsImpacted": [
      "Special Comment"
    ],
    "severity": 3,
    "fcraSection": "§ 623(a)(1)"
  },
  "DOFD_OBSOLETE_7Y": {
    "id": 40,
    "violation": "Obsolete account still reporting",
    "fieldsImpacted": [
      "Date Opened",
      "Status"
    ],
    "severity": 5,
    "fcraSection": "§ 605(a)"
  },
  "ZERO_BALANCE_BUT_PASTDUE": {
    "id": 41,
    "violation": "Closed account shows past due",
    "fieldsImpacted": [
      "Account Status",
      "Past Due"
    ],
    "severity": 4,
    "fcraSection": "§ 623(a)(1)"
  },
  "42": {
    "id": 42,
    "violation": "Account transferred but still reporting balance",
    "fieldsImpacted": [
      "Account Status",
      "Balance"
    ],
    "severity": 4,
    "fcraSection": "§ 623(a)(1)"
  },
  "43": {
    "id": 43,
    "violation": "Missing bankruptcy chapter",
    "fieldsImpacted": [
      "Bankruptcy Chapter"
    ],
    "severity": 3,
    "fcraSection": "§ 623(a)(1)"
  },
  "44": {
    "id": 44,
    "violation": "Wrong currency code",
    "fieldsImpacted": [
      "Currency Code"
    ],
    "severity": 2,
    "fcraSection": "§ 623(a)(1)"
  },
  "X_BUREAU_FIELD_MISMATCH": {
    "id": 45,
    "violation": "Account status inconsistent across bureaus",
    "fieldsImpacted": [
      "Account Status"
    ],
    "severity": 3,
    "fcraSection": "§ 623(a)(1)"
  },
  "X_BUREAU_UTIL_DISPARITY": {
    "id": 46,
    "violation": "Inaccurate charge-off date",
    "fieldsImpacted": [
      "Charge-Off Date"
    ],
    "severity": 4,
    "fcraSection": "§ 623(a)(1)"
  },
  "47": {
    "id": 47,
    "violation": "Missing first delinquency date on collection",
    "fieldsImpacted": [
      "Date of First Delinquency"
    ],
    "severity": 5,
    "fcraSection": "§ 623(a)(5)"
  },
  "48": {
    "id": 48,
    "violation": "Inaccurate original loan amount",
    "fieldsImpacted": [
      "Original Loan Amount"
    ],
    "severity": 3,
    "fcraSection": "§ 623(a)(1)"
  },
  "49": {
    "id": 49,
    "violation": "Missing secured indicator",
    "fieldsImpacted": [
      "Secured Indicator"
    ],
    "severity": 2,
    "fcraSection": "§ 623(a)(1)"
  },
  "50": {
    "id": 50,
    "violation": "Incorrect FCRA compliance code",
    "fieldsImpacted": [
      "Compliance Code"
    ],
    "severity": 2,
    "fcraSection": "§ 607(b)"
  },
  "51": {
    "id": 51,
    "violation": "Authorized user reported as individual or joint",
    "fieldsImpacted": [
      "ECOA Code",
      "Ownership Code"
    ],
    "severity": 4,
    "fcraSection": "§ 607(b)",
    "snippets": {
      "en": "Per FCRA §607(b), data must be maximally accurate. Reporting an authorized user as an individual or joint obligor misstates liability."
    }
  },
  "52": {
    "id": 52,
    "violation": "Consumer-closed account not labeled 'closed at consumer's request'",
    "fieldsImpacted": [
      "Account Status",
      "Special Comment"
    ],
    "severity": 2,
    "fcraSection": "§ 623(a)(2)",
    "snippets": {
      "en": "Per FCRA §623(a)(2), furnishers must update information for accuracy. Failing to mark an account closed at consumer’s request misrepresents closure."
    }
  },
  "53": {
    "id": 53,
    "violation": "Account sold/assigned but still reported with collectible balance",
    "fieldsImpacted": [
      "Account Status",
      "Balance",
      "Special Comment"
    ],
    "severity": 4,
    "fcraSection": "§ 623(a)(2)",
    "snippets": {
      "en": "Per FCRA §623(a)(2), once a debt is sold or transferred, the original account must reflect $0 balance and transfer notation."
    }
  },
  "54": {
    "id": 54,
    "violation": "Paid charge-off still reporting non-zero balance",
    "fieldsImpacted": [
      "Balance",
      "Special Comment"
    ],
    "severity": 4,
    "fcraSection": "§ 607(b)",
    "snippets": {
      "en": "Per FCRA §607(b), furnishers must maintain accuracy. A paid charge-off must show $0 balance."
    }
  },
  "55": {
    "id": 55,
    "violation": "Settlement not reflected ('settled for less than full balance' missing)",
    "fieldsImpacted": [
      "Account Status",
      "Special Comment",
      "Balance"
    ],
    "severity": 3,
    "fcraSection": "§ 623(a)(2)",
    "snippets": {
      "en": "Per FCRA §623(a)(2), furnishers must update settled debts. Accounts should reflect 'settled for less' when applicable."
    }
  },
  "56": {
    "id": 56,
    "violation": "Collection account includes payment history grid",
    "fieldsImpacted": [
      "Payment History",
      "Portfolio Type"
    ],
    "severity": 3,
    "fcraSection": "§ 607(b)",
    "snippets": {
      "en": "Per FCRA §607(b), data must not mislead. Collections should not carry monthly payment grids."
    }
  },
  "57": {
    "id": 57,
    "violation": "Date closed missing or inconsistent with status",
    "fieldsImpacted": [
      "Date Closed",
      "Account Status"
    ],
    "severity": 3,
    "fcraSection": "§ 623(a)(1)",
    "snippets": {
      "en": "Per FCRA §623(a)(1), accuracy requires closure dates to align with status. Missing or inconsistent dates are misleading."
    }
  },
  "58": {
    "id": 58,
    "violation": "Date closed precedes date opened",
    "fieldsImpacted": [
      "Date Closed",
      "Date Opened"
    ],
    "severity": 3,
    "fcraSection": "§ 607(b)",
    "snippets": {
      "en": "Per FCRA §607(b), dates must be consistent. A closure date earlier than the open date is impossible and inaccurate."
    }
  },
  "59": {
    "id": 59,
    "violation": "High credit missing for charge card (no preset limit)",
    "fieldsImpacted": [
      "High Credit",
      "Credit Limit",
      "Account Type"
    ],
    "severity": 3,
    "fcraSection": "§ 607(b)",
    "snippets": {
      "en": "Per FCRA §607(b), furnishers must provide complete data. Charge cards require reporting of highest balance used."
    }
  },
  "60": {
    "id": 60,
    "violation": "Terms frequency/duration missing on installment loan",
    "fieldsImpacted": [
      "Terms Frequency",
      "Terms Duration"
    ],
    "severity": 2,
    "fcraSection": "§ 623(a)(1)",
    "snippets": {
      "en": "Per FCRA §623(a)(1), furnishers must report accurate account terms. Missing term details make the loan misleading."
    }
  },
  "61": {
    "id": 61,
    "violation": "Scheduled payment amount reported after payoff",
    "fieldsImpacted": [
      "Scheduled Monthly Payment",
      "Account Status"
    ],
    "severity": 2,
    "fcraSection": "§ 607(b)",
    "snippets": {
      "en": "Per FCRA §607(b), reporting a scheduled payment after payoff is inaccurate and must be corrected."
    }
  },
  "62": {
    "id": 62,
    "violation": "Post-discharge late codes on bankruptcy accounts",
    "fieldsImpacted": [
      "Payment History",
      "Special Comment",
      "Balance"
    ],
    "severity": 5,
    "fcraSection": "§ 607(b)",
    "snippets": {
      "en": "Per FCRA §607(b), reporting new lates after bankruptcy discharge misrepresents liability and must be removed."
    }
  },
  "63": {
    "id": 63,
    "violation": "Bankruptcy included account not coded with correct CII/remark",
    "fieldsImpacted": [
      "Consumer Information Indicator",
      "Special Comment"
    ],
    "severity": 4,
    "fcraSection": "§ 623(a)(2)",
    "snippets": {
      "en": "Per FCRA §623(a)(2), bankruptcy-included accounts must be updated with proper coding. Omission misleads about liability."
    }
  },
  "64": {
    "id": 64,
    "violation": "Reaffirmed debt not identified post-bankruptcy",
    "fieldsImpacted": [
      "Special Comment",
      "Consumer Information Indicator"
    ],
    "severity": 3,
    "fcraSection": "§ 623(a)(2)",
    "snippets": {
      "en": "Per FCRA §623(a)(2), reaffirmed debts must be identified clearly after bankruptcy."
    }
  },
  "65": {
    "id": 65,
    "violation": "Natural disaster forbearance not coded (CII 'D')",
    "fieldsImpacted": [
      "Consumer Information Indicator",
      "Special Comment"
    ],
    "severity": 3,
    "fcraSection": "§ 623(a)(2)",
    "snippets": {
      "en": "Per FCRA §623(a)(2), furnishers must update accounts in forbearance due to natural disaster with proper indicator."
    }
  },
  "66": {
    "id": 66,
    "violation": "Active duty alert/indicator omitted when provided",
    "fieldsImpacted": [
      "Consumer Information Indicator"
    ],
    "severity": 3,
    "fcraSection": "§ 605A",
    "snippets": {
      "en": "Per FCRA §605A, CRAs must honor requests for active duty alerts. Omission fails to protect service members."
    }
  },
  "67": {
    "id": 67,
    "violation": "Deceased indicator used without verification",
    "fieldsImpacted": [
      "Consumer Information Indicator"
    ],
    "severity": 5,
    "fcraSection": "§ 607(b)",
    "snippets": {
      "en": "Per FCRA §607(b), furnishers must not report a consumer as deceased without verified evidence."
    }
  },
  "68": {
    "id": 68,
    "violation": "Inconsistent DOFD across multiple tradelines of same debt",
    "fieldsImpacted": [
      "Date of First Delinquency"
    ],
    "severity": 4,
    "fcraSection": "§ 623(a)(5)",
    "snippets": {
      "en": "Per FCRA §623(a)(5), all tradelines for the same debt must share the same DOFD. Inconsistencies unlawfully extend reporting."
    }
  },
  "69": {
    "id": 69,
    "violation": "Charge-off continues accruing new delinquencies",
    "fieldsImpacted": [
      "Payment History",
      "Account Status"
    ],
    "severity": 3,
    "fcraSection": "§ 607(b)",
    "snippets": {
      "en": "Per FCRA §607(b), once charged-off, accounts should not accumulate new late codes."
    }
  },
  "70": {
    "id": 70,
    "violation": "Interest/fees accruing after charge-off not reflected correctly",
    "fieldsImpacted": [
      "Balance",
      "Charge-Off Amount",
      "Special Comment"
    ],
    "severity": 3,
    "fcraSection": "§ 607(b)",
    "snippets": {
      "en": "Per FCRA §607(b), furnishers must reflect accurate balances. Improper handling of interest/fees post-charge-off misleads."
    }
  },
  "71": {
    "id": 71,
    "violation": "Original creditor name missing on sold/collection debt",
    "fieldsImpacted": [
      "Creditor Name",
      "Portfolio Type"
    ],
    "severity": 3,
    "fcraSection": "§ 623(a)(1)",
    "snippets": {
      "en": "Per FCRA §623(a)(1), collections must identify the original creditor. Omission prevents proper verification."
    }
  },
  "72": {
    "id": 72,
    "violation": "Portfolio type inconsistent with account type",
    "fieldsImpacted": [
      "Portfolio Type",
      "Account Type"
    ],
    "severity": 2,
    "fcraSection": "§ 607(b)",
    "snippets": {
      "en": "Per FCRA §607(b), data must be consistent. Portfolio type must align with account type."
    }
  },
  "73": {
    "id": 73,
    "violation": "Collateral/secured indicator conflicts with account type",
    "fieldsImpacted": [
      "Collateral",
      "Secured Indicator",
      "Account Type"
    ],
    "severity": 3,
    "fcraSection": "§ 607(b)",
    "snippets": {
      "en": "Per FCRA §607(b), security indicators must align with account type. Conflicts indicate inaccurate reporting."
    }
  },
  "74": {
    "id": 74,
    "violation": "Missing or invalid creditor classification (industry) code",
    "fieldsImpacted": [
      "Creditor Classification"
    ],
    "severity": 2,
    "fcraSection": "§ 623(a)(1)",
    "snippets": {
      "en": "Per FCRA §623(a)(1), creditor classification must be reported correctly. Missing or invalid codes impair accuracy."
    }
  },
  "75": {
    "id": 75,
    "violation": "Narrative/Special Comment contradicts status (e.g., 'paid' but shows past due)",
    "fieldsImpacted": [
      "Special Comment",
      "Account Status",
      "Past Due"
    ],
    "severity": 3,
    "fcraSection": "§ 607(b)",
    "snippets": {
      "en": "Per FCRA §607(b), remarks must not conflict with status. Contradictions mislead lenders and consumers."
    }
  },
  "76": {
    "id": 76,
    "violation": "Last reported date not refreshed after material update",
    "fieldsImpacted": [
      "Last Reported"
    ],
    "severity": 2,
    "fcraSection": "§ 623(a)(2)",
    "snippets": {
      "en": "Per FCRA §623(a)(2), furnishers must update last reported date when data changes materially."
    }
  },
  "77": {
    "id": 77,
    "violation": "Date of account information (DAI) missing or stale",
    "fieldsImpacted": [
      "Date of Account Information"
    ],
    "severity": 2,
    "fcraSection": "§ 623(a)(2)",
    "snippets": {
      "en": "Per FCRA §623(a)(2), furnishers must provide current account information dates for accuracy."
    }
  },
  "78": {
    "id": 78,
    "violation": "Past-due amount reported on closed, $0 balance account",
    "fieldsImpacted": [
      "Past Due",
      "Account Status",
      "Balance"
    ],
    "severity": 4,
    "fcraSection": "§ 607(b)",
    "snippets": {
      "en": "Per FCRA §607(b), closed accounts with $0 balance cannot show a past-due amount."
    }
  },
  "79": {
    "id": 79,
    "violation": "Open-end account missing credit limit causing inflated utilization",
    "fieldsImpacted": [
      "Credit Limit",
      "Balance"
    ],
    "severity": 3,
    "fcraSection": "§ 607(b)",
    "snippets": {
      "en": "Per FCRA §607(b), omitting a credit limit on revolving accounts misstates utilization ratios."
    }
  },
  "80": {
    "id": 80,
    "violation": "Inaccurate payment rating (e.g., 'OK') while status is delinquent",
    "fieldsImpacted": [
      "Payment Rating",
      "Account Status"
    ],
    "severity": 3,
    "fcraSection": "§ 623(a)(1)",
    "snippets": {
      "en": "Per FCRA §623(a)(1), payment rating must reflect actual status. 'OK' while delinquent is inaccurate."
    }
  }
}

"""
)


def _strip_text(cell: Optional[Any]) -> str:
    if cell is None:
        return ""
    return cell.get_text(" ", strip=True)


def clean_amount(value: Optional[str]) -> float:
    if not value:
        return 0.0
    try:
        return float(re.sub(r"[^\d.-]", "", value))
    except Exception:
        return 0.0


def parse_date(value: Optional[str]) -> Optional[datetime.date]:
    if not value or not value.strip():
        return None
    for fmt in DATE_FORMATS:
        try:
            return datetime.strptime(value.strip(), fmt).date()
        except Exception:
            continue
    return None


def _safe_lower(value: Any) -> str:
    return str(value or "").strip().lower()


def _normalized_account_number(value: Any) -> str:
    raw = str(value or "")
    return "".join(ch for ch in raw if ch.isalnum()).upper()


def _account_number_for(tradeline: Dict[str, Any]) -> str:
    return _normalized_account_number(
        tradeline.get("account_number")
        or tradeline.get("account_#")
        or tradeline.get("number")
        or tradeline.get("acct_number")
    )


def _is_revolving(tradeline: Dict[str, Any]) -> bool:
    acct_type = _safe_lower(tradeline.get("account_type"))
    detail = _safe_lower(tradeline.get("account_type_detail"))
    return any(keyword in acct_type or keyword in detail for keyword in ("revolv", "credit card", "line of credit"))


def _is_installment(tradeline: Dict[str, Any]) -> bool:
    acct_type = _safe_lower(tradeline.get("account_type"))
    detail = _safe_lower(tradeline.get("account_type_detail"))
    return any(keyword in acct_type or keyword in detail for keyword in ("install", "auto loan", "mortgage"))


def _calc_utilization(tradeline: Dict[str, Any]) -> Optional[float]:
    balance = clean_amount(tradeline.get("balance"))
    limit = clean_amount(tradeline.get("credit_limit"))
    high_credit = clean_amount(tradeline.get("high_credit"))
    base = limit if limit > 0 else high_credit if high_credit > 0 else 0
    if base <= 0:
        return None
    return balance / base


def _get_comments(tradeline: Dict[str, Any]) -> str:
    comments = tradeline.get("comments") or tradeline.get("remarks") or tradeline.get("notes") or ""
    return comments


def _get_ecoa(tradeline: Dict[str, Any]) -> str:
    return _safe_lower(
        tradeline.get("ecoa")
        or tradeline.get("ecoa_designator")
        or tradeline.get("ecoa_code")
        or tradeline.get("responsibility")
    )


def _get_compliance_code(tradeline: Dict[str, Any]) -> str:
    return _safe_lower(
        tradeline.get("compliance_condition_code")
        or tradeline.get("compliance_code")
        or tradeline.get("ccc")
    )


def _has_keywords(text: str, keywords: Sequence[str]) -> bool:
    lowered = _safe_lower(text)
    return any(keyword in lowered for keyword in keywords)


def _group_tradelines(tradelines: List[Dict[str, Any]]) -> Dict[tuple[str, str], List[Dict[str, Any]]]:
    groups: Dict[tuple[str, str], List[Dict[str, Any]]] = defaultdict(list)
    counters: Dict[str, int] = defaultdict(int)
    for tl in tradelines:
        creditor = (_safe_lower(tl.get("creditor_name")) or "unknown").upper()
        acct = _account_number_for(tl)
        if not acct:
            suffix = counters[creditor]
            counters[creditor] += 1
            acct = f"__NO_ACCOUNT__#{suffix}"
        groups[(creditor, acct)].append(tl)
    return groups


@dataclass
class AuditPayload:
    personal_information: List[Dict[str, Dict[str, str]]]
    personal_mismatches: List[Dict[str, Any]]
    account_history: List[Dict[str, Any]]
    inquiries: List[Dict[str, str]]
    inquiry_violations: List[Dict[str, Any]]


# ---------------------------------------------------------------------------
# Personal information parsing
# ---------------------------------------------------------------------------

def parse_personal_info(soup: BeautifulSoup) -> List[Dict[str, Dict[str, str]]]:
    results: List[Dict[str, Dict[str, str]]] = []
    for table in soup.find_all("table"):
        header = table.find_previous(string=re.compile(r"personal information", re.I))
        if not header:
            continue
        field_map: Dict[str, Dict[str, str]] = {}
        for row in table.find_all("tr"):
            cells = row.find_all("td")
            if len(cells) < 4:
                continue
            label = _strip_text(cells[0])
            tu, exp, eqf = [_strip_text(c) for c in cells[1:4]]
            field_map[label] = {"TransUnion": tu, "Experian": exp, "Equifax": eqf}
        if field_map:
            results.append(field_map)
    return results


def detect_personal_info_mismatches(personal_info: List[Dict[str, Dict[str, str]]]) -> List[Dict[str, Any]]:
    mismatches: List[Dict[str, Any]] = []
    if not personal_info:
        return mismatches
    info = personal_info[0]
    for field, values in info.items():
        vals = {v.strip().lower() for v in values.values() if v and v.strip()}
        if len(vals) > 1:
            mismatches.append(
                {
                    "id": "PERSONAL_INFO_MISMATCH",
                    "field": field,
                    "title": f"{field} differs between bureaus",
                    "values": values,
                }
            )
    return mismatches


# ---------------------------------------------------------------------------
# Tradeline parsing
# ---------------------------------------------------------------------------

def _normalize_field(label: str) -> str:
    cleaned = re.sub(r"[:：]\s*$", "", label.strip()).strip().lower()
    if cleaned in FIELD_ALIASES:
        return FIELD_ALIASES[cleaned]
    cleaned = re.sub(r"[^a-z0-9]+", "_", cleaned)
    return cleaned.strip("_")


def extract_creditor_name(table: Any) -> Optional[str]:
    text_block = table.get_text(" ", strip=True)
    match = re.match(r"([A-Z0-9\s&.\-]+)\s+TransUnion", text_block)
    return match.group(1).strip() if match else None


def parse_account_history(soup: BeautifulSoup) -> List[Dict[str, Any]]:
    tradelines: List[Dict[str, Any]] = []
    for table in soup.find_all("table"):
        header = table.find_previous(string=re.compile(r"account history", re.I))
        if not header:
            continue
        rows = table.find_all("tr")
        if len(rows) < 2:
            continue
        creditor = extract_creditor_name(table) or "Unknown Creditor"
        field_map: Dict[str, Dict[str, str]] = {}
        for row in rows:
            cells = row.find_all("td")
            if len(cells) < 4:
                continue
            label = _strip_text(cells[0])
            tu, exp, eqf = [_strip_text(c) for c in cells[1:4]]
            field_map[label] = {"TransUnion": tu, "Experian": exp, "Equifax": eqf}
        for bureau in BUREAUS:
            tl: Dict[str, Any] = {"creditor_name": creditor, "bureau": bureau}
            for field, values in field_map.items():
                key = _normalize_field(field)
                tl[key] = values.get(bureau, "")
            tradelines.append(tl)
    return tradelines


# ---------------------------------------------------------------------------
# Inquiry parsing
# ---------------------------------------------------------------------------

def parse_inquiries(soup: BeautifulSoup) -> List[Dict[str, str]]:
    inquiries: List[Dict[str, str]] = []
    for table in soup.find_all("table"):
        header = table.find_previous(string=re.compile(r"inquiries", re.I))
        if not header:
            continue
        rows = table.find_all("tr")
        if len(rows) < 2:
            continue
        headers = [_strip_text(th) for th in rows[0].find_all(["th", "td"])]
        if not any("Creditor" in h for h in headers):
            continue
        for row in rows[1:]:
            cells = row.find_all("td")
            if len(cells) < 4:
                continue
            inquiries.append(
                {
                    "creditor_name": _strip_text(cells[0]),
                    "type_of_business": _strip_text(cells[1]),
                    "date_of_inquiry": _strip_text(cells[2]),
                    "credit_bureau": _strip_text(cells[3]),
                }
            )
    return inquiries


# ---------------------------------------------------------------------------
# Audit rules
# ---------------------------------------------------------------------------

RuleFunc = Callable[[Dict[str, Any], List[Dict[str, Any]], List[Dict[str, Any]]], List[Dict[str, Any]]]


def _violation(rule_id: str, title: str, **extra: Any) -> Dict[str, Any]:
    payload = {"id": rule_id, "title": title}
    if extra:
        payload.update(extra)
    return payload


def r_cross_bureau_field_mismatch(
    tradeline: Dict[str, Any], group_records: List[Dict[str, Any]], all_tradelines: List[Dict[str, Any]]
) -> List[Dict[str, Any]]:
    del all_tradelines
    fields: Dict[str, Callable[[Any], Any]] = {
        "balance": clean_amount,
        "past_due": clean_amount,
        "account_status": _safe_lower,
        "account_type": _safe_lower,
        "payment_status": _safe_lower,
        "date_opened": lambda v: (_safe_lower(v) if v else ""),
        "account_number": _normalized_account_number,
    }
    violations: List[Dict[str, Any]] = []
    for field, normalizer in fields.items():
        values = {
            normalizer(record.get(field))
            for record in group_records
            if record.get(field)
        }
        values = {val for val in values if val not in ("", None)}
        if len(values) > 1 and tradeline.get(field):
            readable = field.replace("_", " ").title()
            violations.append(
                _violation(
                    "CROSS_BUREAU_FIELD_MISMATCH",
                    f"{readable} differs across bureaus",
                    field=field,
                )
            )
    return violations


def r_missing_date_opened(
    tradeline: Dict[str, Any], group_records: List[Dict[str, Any]], all_tradelines: List[Dict[str, Any]]
) -> List[Dict[str, Any]]:
    del group_records, all_tradelines
    if tradeline.get("date_opened"):
        return []
    return [_violation("MISSING_OPEN_DATE", "Missing Date Opened field")]


def r_cross_bureau_utilization_disparity(
    tradeline: Dict[str, Any], group_records: List[Dict[str, Any]], all_tradelines: List[Dict[str, Any]]
) -> List[Dict[str, Any]]:
    del all_tradelines
    utils = []
    for record in group_records:
        util = _calc_utilization(record)
        if util is not None:
            utils.append((record, util))
    if len(utils) < 2:
        return []
    util_values = [util for _, util in utils]
    spread = max(util_values) - min(util_values)
    if spread < 0.25:
        return []
    my_util = next((util for record, util in utils if record is tradeline), None)
    if my_util is None:
        return []
    return [
        _violation(
            "CROSS_BUREAU_UTILIZATION_GAP",
            "Utilization differs sharply between bureaus",
            utilization=round(my_util * 100, 1),
            utilization_spread=round(spread * 100, 1),
        )
    ]


def r_duplicate_account(
    tradeline: Dict[str, Any], group_records: List[Dict[str, Any]], all_tradelines: List[Dict[str, Any]]
) -> List[Dict[str, Any]]:
    del all_tradelines
    acct = _account_number_for(tradeline)
    bureau = tradeline.get("bureau")
    if not acct or not bureau:
        return []
    duplicates = [record for record in group_records if _account_number_for(record) == acct and record.get("bureau") == bureau]
    if len(duplicates) <= 1:
        return []
    return [
        _violation(
            "DUPLICATE_ACCOUNT_ENTRY",
            f"{bureau} lists account {acct} more than once",
            bureau=bureau,
            account_number=acct,
        )
    ]


def r_current_but_pastdue(
    tradeline: Dict[str, Any], group_records: List[Dict[str, Any]], all_tradelines: List[Dict[str, Any]]
) -> List[Dict[str, Any]]:
    del group_records, all_tradelines
    status = _safe_lower(tradeline.get("account_status"))
    past_due = clean_amount(tradeline.get("past_due"))
    if past_due <= 0:
        return []
    if any(keyword in status for keyword in ("current", "pays as agreed", "paid as agreed", "ok")):
        return [_violation("CURRENT_STATUS_WITH_PAST_DUE", "Account marked current while reporting past due balance")]
    return []


def r_zero_balance_but_pastdue(
    tradeline: Dict[str, Any], group_records: List[Dict[str, Any]], all_tradelines: List[Dict[str, Any]]
) -> List[Dict[str, Any]]:
    del group_records, all_tradelines
    balance = clean_amount(tradeline.get("balance"))
    past_due = clean_amount(tradeline.get("past_due"))
    if balance <= 1 and past_due > 0:
        return [_violation("ZERO_BALANCE_WITH_PAST_DUE", "Balance is zero but past due amount reported")]
    return []


def r_late_status_no_pastdue(
    tradeline: Dict[str, Any], group_records: List[Dict[str, Any]], all_tradelines: List[Dict[str, Any]]
) -> List[Dict[str, Any]]:
    del group_records, all_tradelines
    status = _safe_lower(tradeline.get("account_status"))
    past_due = clean_amount(tradeline.get("past_due"))
    if past_due > 0:
        return []
    late_keywords = ("late", "delinquent", "past due", "charge", "collection", "derog", "30", "60", "90")
    if _has_keywords(status, late_keywords):
        return [_violation("LATE_STATUS_NO_PAST_DUE", "Delinquent status without supporting past due amount")]
    return []


def r_open_zero_balance(
    tradeline: Dict[str, Any], group_records: List[Dict[str, Any]], all_tradelines: List[Dict[str, Any]]
) -> List[Dict[str, Any]]:
    del group_records, all_tradelines
    status = _safe_lower(tradeline.get("account_status"))
    balance = clean_amount(tradeline.get("balance"))
    if "open" in status and balance <= 0:
        return [_violation("OPEN_ZERO_BALANCE", "Open account reporting $0 balance")]
    return []


def r_open_zero_cl_with_hc_comment(
    tradeline: Dict[str, Any], group_records: List[Dict[str, Any]], all_tradelines: List[Dict[str, Any]]
) -> List[Dict[str, Any]]:
    del group_records, all_tradelines
    if not _is_revolving(tradeline):
        return []
    status = _safe_lower(tradeline.get("account_status"))
    if "closed" in status:
        return []
    limit = clean_amount(tradeline.get("credit_limit"))
    high_credit = clean_amount(tradeline.get("high_credit"))
    comments = _safe_lower(_get_comments(tradeline))
    if limit == 0 and high_credit > 0 and "high credit" in comments:
        return [
            _violation(
                "REVOLVING_ZERO_LIMIT_COMMENT",
                "Open revolving account has $0 limit while comments cite high credit as proxy",
            )
        ]
    return []


def r_date_order_sanity(
    tradeline: Dict[str, Any], group_records: List[Dict[str, Any]], all_tradelines: List[Dict[str, Any]]
) -> List[Dict[str, Any]]:
    del group_records, all_tradelines
    opened = parse_date(tradeline.get("date_opened"))
    if not opened:
        return []
    bad_fields: List[str] = []
    for field in ("date_last_payment", "last_reported", "date_last_active", "date_closed"):
        dt = parse_date(tradeline.get(field))
        if dt and dt < opened:
            bad_fields.append(field)
    if bad_fields:
        joined = ", ".join(sorted(bad_fields))
        return [
            _violation(
                "DATE_ORDER_SANITY",
                f"Dates {joined} occur before Date Opened",
                fields=bad_fields,
            )
        ]
    return []


def r_high_credit_gt_limit(
    tradeline: Dict[str, Any], group_records: List[Dict[str, Any]], all_tradelines: List[Dict[str, Any]]
) -> List[Dict[str, Any]]:
    del group_records, all_tradelines
    limit = clean_amount(tradeline.get("credit_limit"))
    high_credit = clean_amount(tradeline.get("high_credit"))
    if limit > 0 and high_credit > limit:
        return [_violation("HIGH_CREDIT_GT_LIMIT", "High Credit exceeds reported Credit Limit")]
    return []


def r_revolving_with_terms(
    tradeline: Dict[str, Any], group_records: List[Dict[str, Any]], all_tradelines: List[Dict[str, Any]]
) -> List[Dict[str, Any]]:
    del group_records, all_tradelines
    if not _is_revolving(tradeline):
        return []
    term_fields = ["terms", "term", "loan_term", "months_terms", "scheduled_payment_term"]
    for field in term_fields:
        value = tradeline.get(field)
        if value and re.search(r"\d", str(value)):
            return [
                _violation(
                    "REVOLVING_WITH_TERMS",
                    "Revolving account should not include installment-style term length",
                    field=field,
                )
            ]
    return []


def r_revolving_missing_cl_hc(
    tradeline: Dict[str, Any], group_records: List[Dict[str, Any]], all_tradelines: List[Dict[str, Any]]
) -> List[Dict[str, Any]]:
    del group_records, all_tradelines
    if not _is_revolving(tradeline):
        return []
    status = _safe_lower(tradeline.get("account_status"))
    if any(keyword in status for keyword in ("closed", "paid")):
        return []
    limit = clean_amount(tradeline.get("credit_limit"))
    high_credit = clean_amount(tradeline.get("high_credit"))
    if limit <= 0 and high_credit <= 0:
        return [
            _violation(
                "REVOLVING_MISSING_LIMIT",
                "Open revolving tradeline missing both Credit Limit and High Credit",
            )
        ]
    return []


def r_installment_with_cl(
    tradeline: Dict[str, Any], group_records: List[Dict[str, Any]], all_tradelines: List[Dict[str, Any]]
) -> List[Dict[str, Any]]:
    del group_records, all_tradelines
    if not _is_installment(tradeline):
        return []
    limit = clean_amount(tradeline.get("credit_limit"))
    if limit > 0:
        return [
            _violation(
                "INSTALLMENT_HAS_LIMIT",
                "Installment account should not report a revolving-style credit limit",
                credit_limit=limit,
            )
        ]
    return []


def r_co_collection_pastdue(
    tradeline: Dict[str, Any], group_records: List[Dict[str, Any]], all_tradelines: List[Dict[str, Any]]
) -> List[Dict[str, Any]]:
    del group_records, all_tradelines
    status = _safe_lower(tradeline.get("account_status"))
    past_due = clean_amount(tradeline.get("past_due"))
    if past_due <= 0:
        return []
    if any(keyword in status for keyword in ("charge", "collection", "chargeoff")):
        return [
            _violation(
                "CO_COLLECTION_PAST_DUE",
                "Charge-off/Collection should report $0 past due",
                past_due=past_due,
            )
        ]
    return []


def r_au_comment_ecoa_conflict(
    tradeline: Dict[str, Any], group_records: List[Dict[str, Any]], all_tradelines: List[Dict[str, Any]]
) -> List[Dict[str, Any]]:
    del group_records, all_tradelines
    comments = _safe_lower(_get_comments(tradeline))
    if not _has_keywords(comments, ("authorized user", "usuario autorizado")):
        return []
    ecoa = _get_ecoa(tradeline)
    valid_codes = {"a", "au", "authorized user", "u"}
    if ecoa and ecoa in valid_codes:
        return []
    return [
        _violation(
            "AU_COMMENT_ECOA_CONFLICT",
            "Authorized user comment present without matching ECOA designator",
        )
    ]


def r_derog_rating_but_current(
    tradeline: Dict[str, Any], group_records: List[Dict[str, Any]], all_tradelines: List[Dict[str, Any]]
) -> List[Dict[str, Any]]:
    del group_records, all_tradelines
    status = _safe_lower(tradeline.get("account_status"))
    past_due = clean_amount(tradeline.get("past_due"))
    if past_due > 0 or not any(keyword in status for keyword in ("current", "pays as agreed", "ok")):
        return []
    history = _safe_lower(tradeline.get("payment_history"))
    rating = _safe_lower(tradeline.get("payment_rating"))
    derog_tokens = ("30", "60", "90", "120", "derog", "charge", "collection")
    if any(token in history for token in derog_tokens) or any(token in rating for token in derog_tokens):
        return [
            _violation(
                "DEROG_RATING_BUT_CURRENT",
                "Derogatory history present while account marked current with $0 past due",
            )
        ]
    return []


def r_dispute_comment_needs_xb(
    tradeline: Dict[str, Any], group_records: List[Dict[str, Any]], all_tradelines: List[Dict[str, Any]]
) -> List[Dict[str, Any]]:
    del group_records, all_tradelines
    comments = _safe_lower(_get_comments(tradeline))
    if not _has_keywords(comments, ("dispute", "investigation", "en disputa")):
        return []
    code = _get_compliance_code(tradeline)
    if code == "xb":
        return []
    return [
        _violation(
            "DISPUTE_COMMENT_NEEDS_XB",
            "Dispute language requires XB compliance code",
            compliance_code=code or "",
        )
    ]


def r_closed_but_monthly_payment(
    tradeline: Dict[str, Any], group_records: List[Dict[str, Any]], all_tradelines: List[Dict[str, Any]]
) -> List[Dict[str, Any]]:
    del group_records, all_tradelines
    status = _safe_lower(tradeline.get("account_status"))
    if not _has_keywords(status, ("closed", "paid", "charge", "collection")):
        return []
    payment = clean_amount(tradeline.get("monthly_payment"))
    if payment > 0:
        return [
            _violation(
                "CLOSED_ACCOUNT_MONTHLY_PAYMENT",
                "Closed account still reporting a monthly payment",
                monthly_payment=payment,
            )
        ]
    return []


def r_stale_active_reporting(
    tradeline: Dict[str, Any], group_records: List[Dict[str, Any]], all_tradelines: List[Dict[str, Any]]
) -> List[Dict[str, Any]]:
    del group_records, all_tradelines
    status = _safe_lower(tradeline.get("account_status"))
    if not any(keyword in status for keyword in ("open", "current", "pays as agreed", "ok")):
        return []
    last_reported = parse_date(tradeline.get("last_reported") or tradeline.get("date_last_active"))
    if not last_reported:
        return []
    if (date.today() - last_reported).days > 180:
        return [
            _violation(
                "STALE_ACTIVE_REPORTING",
                "Open/current account has not been updated in over 6 months",
                last_reported=tradeline.get("last_reported"),
            )
        ]
    return []


def r_dofd_obsolete_7y(
    tradeline: Dict[str, Any], group_records: List[Dict[str, Any]], all_tradelines: List[Dict[str, Any]]
) -> List[Dict[str, Any]]:
    del group_records, all_tradelines
    dofd = parse_date(tradeline.get("date_of_first_delinquency"))
    if not dofd:
        return []
    status = _safe_lower(tradeline.get("account_status"))
    derogatory = _has_keywords(status, ("charge", "collection", "late", "delinquent", "derog"))
    if not derogatory:
        return []
    if (date.today() - dofd).days > 365 * 7:
        return [
            _violation(
                "DOFD_OBSOLETE_7Y",
                "Negative account older than 7 years from DOFD",
                date_of_first_delinquency=tradeline.get("date_of_first_delinquency"),
            )
        ]
    return []


def r_3(tradeline: Dict[str, Any], group_records: List[Dict[str, Any]], all_tradelines: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    del group_records, all_tradelines
    closed_date = parse_date(tradeline.get("date_closed"))
    status = _safe_lower(tradeline.get("account_status"))
    if closed_date and any(keyword in status for keyword in ("open", "current", "pays as agreed", "ok")):
        return [
            _violation(
                "METRO2_CODE_3_CONFLICT",
                "Tradeline shows Date Closed but status still reads open/current",
                date_closed=tradeline.get("date_closed"),
            )
        ]
    return []


def r_8(tradeline: Dict[str, Any], group_records: List[Dict[str, Any]], all_tradelines: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    del group_records, all_tradelines
    status = _safe_lower(tradeline.get("account_status"))
    if not _has_keywords(status, ("charge", "chargeoff", "collection")):
        return []
    if tradeline.get("date_of_first_delinquency"):
        return []
    return [
        _violation(
            "METRO2_CODE_8_MISSING_DOFD",
            "Charge-off or collection missing Date of First Delinquency",
        )
    ]


def r_9(tradeline: Dict[str, Any], group_records: List[Dict[str, Any]], all_tradelines: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    del group_records, all_tradelines
    status = _safe_lower(tradeline.get("account_status"))
    if not _has_keywords(status, ("collection",)):
        return []
    if tradeline.get("original_creditor"):
        return []
    return [_violation("METRO2_CODE_9_MISSING_OC", "Collection account missing Original Creditor")]


def r_10(
    tradeline: Dict[str, Any], group_records: List[Dict[str, Any]], all_tradelines: List[Dict[str, Any]]
) -> List[Dict[str, Any]]:
    acct = _account_number_for(tradeline)
    bureau = tradeline.get("bureau")
    if not acct or not bureau:
        return []
    duplicates = [record for record in all_tradelines if record.get("bureau") == bureau and _account_number_for(record) == acct]
    if len(duplicates) <= 1:
        return []
    return [
        _violation(
            "METRO2_CODE_10_DUPLICATE",
            "Duplicate account number detected within same bureau feed",
            bureau=bureau,
            account_number=acct,
        )
    ]


def r_sl_no_lates_during_deferment(
    tradeline: Dict[str, Any], group_records: List[Dict[str, Any]], all_tradelines: List[Dict[str, Any]]
) -> List[Dict[str, Any]]:
    del group_records, all_tradelines
    acct_type = _safe_lower(tradeline.get("account_type"))
    comments = _safe_lower(_get_comments(tradeline))
    keywords = ("student", "education")
    if not any(keyword in acct_type for keyword in keywords):
        return []
    if not _has_keywords(comments, ("defer", "forbear")):
        return []
    history = _safe_lower(tradeline.get("payment_history"))
    if any(token in history for token in ("30", "60", "90", "120", "late")):
        return [
            _violation(
                "SL_DEFERMENT_HAS_LATES",
                "Student loan in deferment/forbearance shows late history",
            )
        ]
    return []

RULES: Sequence[RuleFunc] = (
    r_cross_bureau_field_mismatch,
    r_missing_date_opened,
    r_cross_bureau_utilization_disparity,
    r_duplicate_account,
    r_current_but_pastdue,
    r_zero_balance_but_pastdue,
    r_late_status_no_pastdue,
    r_open_zero_balance,
    r_open_zero_cl_with_hc_comment,
    r_date_order_sanity,
    r_revolving_with_terms,
    r_revolving_missing_cl_hc,
    r_installment_with_cl,
    r_co_collection_pastdue,
    r_high_credit_gt_limit,
    r_au_comment_ecoa_conflict,
    r_derog_rating_but_current,
    r_dispute_comment_needs_xb,
    r_closed_but_monthly_payment,
    r_stale_active_reporting,
    r_dofd_obsolete_7y,
    r_3,
    r_8,
    r_9,
    r_10,
    r_sl_no_lates_during_deferment,
)


def detect_tradeline_violations(tradelines: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    for record in tradelines:
        record["violations"] = []
    groups = _group_tradelines(tradelines)
    for records in groups.values():
        for record in records:
            for rule in RULES:
                findings = rule(record, records, tradelines)
                if findings:
                    record.setdefault("violations", []).extend(findings)
    return tradelines


def detect_inquiry_no_match(inquiries: List[Dict[str, str]], tradelines: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    violations: List[Dict[str, Any]] = []
    tradeline_dates = set()
    for tl in tradelines:
        for field in ("date_opened", "date_last_payment"):
            d = parse_date(tl.get(field))
            if d:
                tradeline_dates.add(d)
    for iq in inquiries:
        iq_date = parse_date(iq.get("date_of_inquiry"))
        if not iq_date:
            continue
        if not any(abs((iq_date - d).days) <= 5 for d in tradeline_dates):
            violations.append(
                {
                    "id": "INQUIRY_NO_MATCH",
                    "title": f"Inquiry on {iq['date_of_inquiry']} not linked to any tradeline",
                    "creditor_name": iq.get("creditor_name"),
                    "bureau": iq.get("credit_bureau"),
                }
            )
    return violations


# ---------------------------------------------------------------------------
# Rendering helpers
# ---------------------------------------------------------------------------

class Color:
    GREEN = "\033[92m"
    RED = "\033[91m"
    YELLOW = "\033[93m"
    CYAN = "\033[96m"
    RESET = "\033[0m"
    BOLD = "\033[1m"


def print_audit_summary(personal_mismatches: Sequence[Dict[str, Any]], tradelines: Sequence[Dict[str, Any]], inquiry_violations: Sequence[Dict[str, Any]]) -> None:
    print(f"\n{Color.BOLD}{Color.CYAN}📋 METRO-2 COMPLIANCE AUDIT SUMMARY{Color.RESET}")
    print("-" * 60)
    if personal_mismatches:
        print(f"\n{Color.BOLD}{Color.YELLOW}🧍 PERSONAL INFORMATION MISMATCHES{Color.RESET}")
        for mismatch in personal_mismatches:
            print(f"  {Color.RED}❌ {mismatch['field']}: {mismatch['title']}{Color.RESET}")
            for bureau, value in mismatch["values"].items():
                print(f"     {bureau}: {value}")
    else:
        print(f"{Color.GREEN}✅ Personal information consistent across bureaus{Color.RESET}")
    for tl in tradelines:
        creditor = tl.get("creditor_name", "UNKNOWN")
        bureau = tl.get("bureau", "?")
        violations = tl.get("violations", [])
        print(f"\n{Color.BOLD}{Color.YELLOW}{creditor}{Color.RESET} [{bureau}]")
        print(f"  Balance: {tl.get('balance', '')} | Status: {tl.get('account_status', '')}")
        if not violations:
            print(f"  {Color.GREEN}✅ No tradeline violations{Color.RESET}")
        else:
            for violation in violations:
                print(f"  {Color.RED}❌ {violation['id']}: {violation['title']}{Color.RESET}")
    if inquiry_violations:
        print(f"\n{Color.BOLD}{Color.YELLOW}🔍 INQUIRY ISSUES{Color.RESET}")
        for violation in inquiry_violations:
            print(f"  {Color.RED}❌ {violation['creditor_name']} [{violation['bureau']}] - {violation['title']}{Color.RESET}")
    else:
        print(f"\n{Color.GREEN}✅ All inquiries correspond to valid tradeline dates{Color.RESET}")
    print("\n")


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def parse_credit_report_html(html_content: str) -> AuditPayload:
    soup = BeautifulSoup(html_content, "html.parser")
    personal = parse_personal_info(soup)
    tradelines = detect_tradeline_violations(parse_account_history(soup))
    inquiries = parse_inquiries(soup)
    personal_mismatches = detect_personal_info_mismatches(personal)
    inquiry_violations = detect_inquiry_no_match(inquiries, tradelines)
    return AuditPayload(
        personal_information=personal,
        personal_mismatches=personal_mismatches,
        account_history=tradelines,
        inquiries=inquiries,
        inquiry_violations=inquiry_violations,
    )


def parse_credit_report_file(path: str) -> AuditPayload:
    with open(path, "r", encoding="utf-8") as handle:
        return parse_credit_report_html(handle.read())


# ---------------------------------------------------------------------------
# CLI entrypoint
# ---------------------------------------------------------------------------

def main(argv: Optional[Sequence[str]] = None) -> int:
    parser = argparse.ArgumentParser(description="Parse and audit consumer credit report HTML files.")
    parser.add_argument("input", nargs="?", help="Path to the HTML report")
    parser.add_argument("-i", "--input", dest="input_cli", help="Path to the HTML report (legacy flag)")
    parser.add_argument("-o", "--output", dest="output", help="Optional path to write JSON results")
    parser.add_argument("--json-only", action="store_true", help="Suppress CLI summary and emit JSON only")
    args = parser.parse_args(argv)
    html_path = args.input_cli or args.input
    if not html_path:
        parser.error("Missing input HTML file")
    payload = parse_credit_report_file(html_path)
    data = {
        "personal_information": payload.personal_information,
        "personal_mismatches": payload.personal_mismatches,
        "account_history": payload.account_history,
        "inquiries": payload.inquiries,
        "inquiry_violations": payload.inquiry_violations,
    }
    json_blob = json.dumps(data, indent=2, ensure_ascii=False)
    if args.output:
        Path(args.output).write_text(json_blob, encoding="utf-8")
    if not args.json_only:
        print_audit_summary(payload.personal_mismatches, payload.account_history, payload.inquiry_violations)
        if not args.output:
            print(json_blob)
    elif not args.output:
        print(json_blob)
    return 0


if __name__ == "__main__":
    sys.exit(main())
