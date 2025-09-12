#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import argparse
import json
import os
import re
from bs4 import BeautifulSoup
from datetime import datetime, date
from collections import defaultdict
from urllib.request import urlopen, Request
from urllib.parse import quote_plus

# -----------------------------
# Parsing helpers / constants
# -----------------------------

# Fixed money regex ([0,9] -> \d) and made more tolerant
MONEY_RE = re.compile(
    r"[-+]?\$?\s*((?:\d{1,3}(?:,\d{3})*(?:\.\d{2})?)|\d+(?:\.\d{2})?)"
)

# Expanded set of common date formats seen on consumer files
DATE_FORMATS = [
    "%m/%d/%Y", "%m/%d/%y", "%Y-%m-%d",
    "%b %d, %Y", "%b %Y", "%B %d, %Y", "%B %Y"
]

BUREAUS = ["TransUnion", "Experian", "Equifax"]

FIELD_ALIASES = {
    "Account #:": "account_number",
    "Account Type:": "account_type",
    "Account Type - Detail:": "account_type_detail",
    "Bureau Code:": "bureau_code",
    "Account Status:": "account_status",
    "Monthly Payment:": "monthly_payment",
    "Date Opened:": "date_opened",
    "Balance:": "balance",
    "No. of Months (terms):": "months_terms",
    "High Credit:": "high_credit",
    "Credit Limit:": "credit_limit",
    "Past Due:": "past_due",
    "Payment Status:": "payment_status",
    "Last Reported:": "last_reported",
    "Comments:": "comments",
    "Date Last Active:": "date_last_active",
    "Date of Last Payment:": "date_last_payment",
    "Date of First Delinquency:": "date_first_delinquency",
    "DOFD:": "date_first_delinquency",

    # New fields
    "Compliance Condition Code:": "ccc",             # e.g., 'XB' when disputed
    "ECOA Code:": "ecoa",                            # ownership/responsibility
    "Account Designator:": "account_designator",     # Revolving/Installment/Collection...
    "Date Closed:": "date_closed",
    "Original Creditor:": "original_creditor",
    "Creditor Classification:": "creditor_class",    # e.g., Debt Buyer/Bank
    "Account Status Date:": "date_status",
    "Current Rating:": "current_rating",
}

# Late-payment CSS classes used in payment history
HSTRY_LATE_CLASSES = {
    "hstry-30", "hstry-60", "hstry-90", "hstry-120", "hstry-150", "hstry-180"
}

SEVERITY = {
    "Obsolescence": 5,
    "Duplicate Collections": 5,
    "Dispute Coding": 4,
    "Dates": 3,
    "Balances & Amounts": 3,
    "Ownership & Responsibility": 3,
    "Payment History": 2,
    "Data Definitions": 2,
    "Duplicate/Conflicting Reporting": 3
}

TODAY = date.today().isoformat()

# Load violation metadata for enrichment
_VIOLATION_DATA_PATH = os.path.join(
    os.path.dirname(__file__), "data", "metro2Violations.json"
)
try:
    with open(_VIOLATION_DATA_PATH, "r", encoding="utf-8") as f:
        _raw = json.load(f)
        VIOLATION_META = _raw if isinstance(_raw, dict) else {}
except Exception:
    VIOLATION_META = {}

_CURRENT_RULE_ID = None

# -----------------------------
# Utility functions
# -----------------------------

def parse_money(val):
    if val is None: return None
    s = val.replace(",", "")
    m = MONEY_RE.search(s)
    if not m: return None
    try:
        return float(m.group(1))
    except ValueError:
        return None

def parse_int(val):
    if val is None: return None
    s = val.strip()
    if s.isdigit():
        return int(s)
    try:
        return int(float(s))
    except Exception:
        return None

def parse_date(val):
    if not val: return None
    s = val.strip()
    for fmt in DATE_FORMATS:
        try:
            return datetime.strptime(s, fmt).date().isoformat()
        except Exception:
            pass
    return None

def clean_text(el):
    if el is None: return ""
    return " ".join(el.get_text(separator=" ", strip=True).split())

def is_tradeline_table(tbl):
    return (
        tbl.select_one("th.headerTUC") and
        tbl.select_one("th.headerEXP") and
        tbl.select_one("th.headerEQF")
    )

def nearest_creditor_header(tbl):
    node = tbl
    while node and node.previous_sibling is not None:
        node = node.previous_sibling
        if getattr(node, "select_one", None):
            hdr = node.select_one("div.sub_header")
            if hdr:
                return clean_text(hdr)
    parent = tbl.parent
    while parent:
        sib = parent.previous_sibling
        while sib:
            if getattr(sib, "select_one", None):
                hdr = sib.select_one("div.sub_header")
                if hdr:
                    return clean_text(hdr)
            sib = sib.previous_sibling
        parent = parent.parent
    return "Unknown Creditor"

def extract_rows(table):
    rows = []
    header = table.find("tr")
    if not header:
        return rows

    col_map = {}
    for idx, th in enumerate(header.find_all("th", recursive=False)):

        classes = th.get("class", [])
        if "headerTUC" in classes:
            col_map[idx] = "TransUnion"
        elif "headerEXP" in classes:
            col_map[idx] = "Experian"
        elif "headerEQF" in classes:
            col_map[idx] = "Equifax"
    for tr in table.find_all("tr", recursive=False)[1:]:

        label_td = tr.find("td", class_="label")
        if not label_td:
            continue
        label = clean_text(label_td)
        if label not in FIELD_ALIASES:
            continue

        by_bureau = {}
        tds = tr.find_all("td", recursive=False)

        for idx, td in enumerate(tds):
            if idx == 0 or "info" not in td.get("class", []):
                continue
            bureau = col_map.get(idx)
            if not bureau:
                continue
            val = clean_text(td)
            by_bureau[bureau] = "" if val == "-" else val

        rows.append((FIELD_ALIASES[label], by_bureau))
    return rows

def normalize_record(rows):
    per_bureau = {b:{} for b in BUREAUS}
    for field_key, by_bureau in rows:
        for b in BUREAUS:
            raw = by_bureau.get(b, "")
            if field_key in ("monthly_payment", "balance", "high_credit", "credit_limit", "past_due"):
                per_bureau[b][field_key] = parse_money(raw)
                per_bureau[b][field_key + "_raw"] = raw
            elif field_key in ("months_terms",):
                per_bureau[b][field_key] = parse_int(raw)
                per_bureau[b][field_key + "_raw"] = raw
            elif field_key in ("date_opened", "last_reported", "date_last_active", "date_last_payment",
                               "date_first_delinquency", "date_closed", "date_status"):
                per_bureau[b][field_key] = parse_date(raw)
                per_bureau[b][field_key + "_raw"] = raw
            else:
                per_bureau[b][field_key] = raw
    return per_bureau

def extract_payment_history(tbl):
    history = {b: [] for b in BUREAUS}
    bureau_map = {"tu": "TransUnion", "exp": "Experian", "eqf": "Equifax"}
    for abbr, bureau in bureau_map.items():
        selector = f'td[ng-class*="history.{abbr}.css"]'
        for td in tbl.select(selector):
            classes = td.get("class", [])
            code = next((c for c in classes if c.startswith("hstry-")), None)
            if code:
                history[bureau].append(code)
    return history

def months_between(a_iso, b_iso):
    if not a_iso or not b_iso: return None
    y1, m1 = map(int, a_iso.split("-")[:2])
    y2, m2 = map(int, b_iso.split("-")[:2])
    return (y2 - y1) * 12 + (m2 - m1)

def years_between(a_iso, b_iso):
    m = months_between(a_iso, b_iso)
    return (m / 12.0) if m is not None else None

def utilization(balance, credit_limit):
    if credit_limit and credit_limit > 0:
        return round((balance or 0) / credit_limit * 100.0, 2)
    return None

# -----------------------------
# Rule engine
# -----------------------------

class RuleContext:
    """
    Per-tradeline context passed into each rule.
    """
    def __init__(self, creditor, per_bureau, furnisher_type, rule_profile):
        self.creditor = creditor
        self.per_bureau = per_bureau
        self.furnisher_type = furnisher_type  # e.g., 'student_loan', 'collection', 'revolving', etc.
        self.rule_profile = rule_profile      # dict controlling which rules are enabled

def make_violation(category, title, detail, evidence):
    """Construct a violation record and enrich with metadata."""
    v = {
        "category": category,
        "title": title,
        "detail": detail,
        "evidence": evidence,
    }

    rule_id = _CURRENT_RULE_ID
    meta = {}
    if rule_id:
        meta = VIOLATION_META.get(rule_id) or VIOLATION_META.get(title, {})
        v["id"] = rule_id
    if meta:
        if "fieldsImpacted" in meta:
            v["fieldsImpacted"] = meta.get("fieldsImpacted")
        if "fcraSection" in meta:
            v["fcraSection"] = meta.get("fcraSection")
        v["severity"] = meta.get("severity", SEVERITY.get(category, 1))
    else:
        v["severity"] = SEVERITY.get(category, 1)

    return v

# Registry: name -> rule metadata & function
RULES = {}
SEEN_ACCOUNT_NUMBERS = defaultdict(dict)

def rule(name, category, furnisher_types=None, default_enabled=True):
    """
    Decorator to register a rule function.
    - name: stable ID string
    - category: violation category
    - furnisher_types: list[str] or None (None = applies to all)
    - default_enabled: whether enabled unless profile disables
    The rule fn signature: fn(ctx, bureau_name, data, add)
    or cross-bureau rule: fn(ctx, add) (set attr is_cross_bureau=True)
    """
    def decorator(fn):
        RULES[name] = {
            "name": name,
            "category": category,
            "furnisher_types": set(furnisher_types) if furnisher_types else None,
            "default_enabled": default_enabled,
            "fn": fn,
            "is_cross_bureau": getattr(fn, "_is_cross_bureau", False)
        }
        return fn
    return decorator

def cross_bureau(fn):
    fn._is_cross_bureau = True
    return fn

def is_rule_enabled(rule_name, furnisher_type, profile):
    """
    Profile format:
    {
      "global": {"enabled": ["*"], "disabled": []},
      "by_furnisher_type": {
         "student_loan": {"enabled": ["SL_NO_LATES_DURING_DEFERMENT"], "disabled": ["SOME_RULE"]}
      }
    }
    """
    meta = RULES[rule_name]
    default = meta["default_enabled"]

    # If rule restricts to certain furnisher types, and current type not in it => disabled
    if meta["furnisher_types"] and furnisher_type not in meta["furnisher_types"]:
        return False

    g = (profile or {}).get("global", {})
    enable_all = "*" in g.get("enabled", [])
    if enable_all and rule_name not in g.get("disabled", []):
        # still allow furnisher-specific overrides below
        enabled = True
    else:
        enabled = (rule_name in g.get("enabled", [])) or (default and rule_name not in g.get("disabled", []))

    by_type = (profile or {}).get("by_furnisher_type", {})
    tcfg = by_type.get(furnisher_type, {})
    if rule_name in tcfg.get("disabled", []):
        return False
    if rule_name in tcfg.get("enabled", []):
        return True

    return enabled

def detect_furnisher_type(per_bureau):
    """
    Heuristic classifier to drive rule toggles.
    """
    candidates = []
    for b in BUREAUS:
        d = per_bureau.get(b, {})
        at = f"{d.get('account_type', '')} {d.get('account_designator', '')}".strip().lower()
        cls = (d.get("creditor_class") or "").lower()
        oc  = (d.get("original_creditor") or "").lower()
        if "student" in at or "education" in at or "student" in oc:
            candidates.append("student_loan")
        elif "collection" in at or "debt buyer" in cls or "collection" in cls:
            candidates.append("collection")
        elif "mortgage" in at:
            candidates.append("mortgage")
        elif "auto" in at or "vehicle" in at:
            candidates.append("auto")
        elif "revolving" in at or "credit card" in at:
            candidates.append("revolving")
        # else leave open
    if candidates:
        # choose the most frequent
        from collections import Counter
        return Counter(candidates).most_common(1)[0][0]
    return "generic"

# -----------------------------
# Rules (add as many as you want)
# -----------------------------

@rule("X_BUREAU_FIELD_MISMATCH", "Duplicate/Conflicting Reporting")
@cross_bureau
def r_cross_bureau_field_mismatch(ctx, add):
    fields = [
        ("balance", "Balances differ across bureaus"),
        ("past_due", "Past-due amounts differ across bureaus"),
        ("credit_limit", "Credit limits differ across bureaus"),
        ("high_credit", "High credit differs across bureaus"),
        ("monthly_payment", "Monthly payment differs across bureaus"),
        ("payment_status", "Payment status differs across bureaus"),
        ("account_status", "Account status differs across bureaus"),
        ("date_opened", "Date Opened differs across bureaus"),
        ("last_reported", "Last Reported differs across bureaus"),
        ("date_last_payment", "Date of Last Payment differs across bureaus"),
        ("date_first_delinquency", "Date of First Delinquency differs across bureaus"),
        ("account_number", "Account numbers differ across bureaus"),
        ("ecoa", "ECOA/ownership differs across bureaus"),
        ("account_type", "Account type differs across bureaus"),
        ("account_designator", "Account designator differs across bureaus"),
        ("ccc", "Compliance Condition Code differs across bureaus"),
    ]
    for field, title in fields:
        vals = {}
        for b in BUREAUS:
            val = ctx.per_bureau[b].get(field)
            if val not in (None, ""):
                vals[b] = val
        if len(vals) >= 2 and len(set(vals.values())) > 1:
            add(make_violation("Duplicate/Conflicting Reporting", title,
                               f"Inconsistent {field.replace('_',' ')} across bureaus.",
                               {f"{field}_by_bureau": vals}))

@rule("X_BUREAU_UTIL_DISPARITY", "Balances & Amounts")
@cross_bureau
def r_cross_bureau_utilization_disparity(ctx, add):
    utils = {}
    for b in BUREAUS:
        d = ctx.per_bureau[b]
        u = utilization(d.get("balance"), d.get("credit_limit"))
        if u is not None:
            utils[b] = u
    if len(utils) >= 2 and (max(utils.values()) - min(utils.values())) >= 30:
        add(make_violation("Balances & Amounts",
                           "Material utilization disparity across bureaus",
                           "Large differences in revolving utilization can be misleading.",
                           {"utilization_by_bureau": utils}))

@rule("DUPLICATE_ACCOUNT", "Duplicate/Conflicting Reporting")
def r_duplicate_account(ctx, bureau, data, add):
    acct = data.get("account_number")
    if not acct:
        return
    prev = SEEN_ACCOUNT_NUMBERS[bureau].get(acct)
    if prev:
        add(make_violation("Duplicate/Conflicting Reporting",
                           f"Duplicate account number reported ({bureau})",
                           "Same account number appears on multiple tradelines.",
                           {"bureau": bureau, "account_number": acct, "creditors": [prev, ctx.creditor]}))
    else:
        SEEN_ACCOUNT_NUMBERS[bureau][acct] = ctx.creditor

@rule("MISSING_DOFD", "Dates")
def r_missing_dofd(ctx, bureau, data, add):
    if not (data.get("account_number") or data.get("balance")):
        return
    if not data.get("date_first_delinquency"):
        add(make_violation("Dates",
                           f"Missing Date of First Delinquency ({bureau})",
                           "Date of First Delinquency not reported.",
                           {"bureau": bureau}))

@rule("CURRENT_BUT_PASTDUE", "Balances & Amounts")
def r_current_but_pastdue(ctx, bureau, data, add):
    past_due = data.get("past_due")
    pstat = (data.get("payment_status") or "").strip().lower()
    if past_due and past_due > 0 and pstat.startswith("current"):
        add(make_violation("Balances & Amounts",
                           f"Past-due reported with 'Current' status ({bureau})",
                           "Past-due > 0 conflicts with 'Current' status.",
                           {"bureau": bureau, "past_due": past_due, "payment_status": data.get("payment_status")}))

@rule("ZERO_BALANCE_BUT_PASTDUE", "Balances & Amounts")
def r_zero_balance_but_pastdue(ctx, bureau, data, add):
    bal = data.get("balance")
    past_due = data.get("past_due")
    if (bal is not None and bal == 0) and (past_due and past_due > 0):
        add(make_violation("Balances & Amounts",
                           f"Past-due on a $0 balance account ({bureau})",
                           "Past-due should be $0 if the balance is $0.",
                           {"bureau": bureau, "balance": bal, "past_due": past_due}))

@rule("LATE_STATUS_NO_PASTDUE", "Balances & Amounts")
def r_late_status_no_pastdue(ctx, bureau, data, add):
    pstat = (data.get("payment_status") or "").strip().lower()
    past_due = data.get("past_due")
    if (("late" in pstat) or ("delinquent" in pstat)) and (not past_due or past_due == 0):
        add(make_violation("Balances & Amounts",
                           f"Late status but no past-due amount ({bureau})",
                           "Late/Delinquent status typically coincides with a past-due amount.",
                           {"bureau": bureau, "payment_status": data.get("payment_status"), "past_due": past_due}))

@rule("OPEN_ZERO_CL_WITH_HC_COMMENT", "Account Status & Codes")
def r_open_zero_cl_with_hc_comment(ctx, bureau, data, add):
    status = (data.get("account_status") or "").strip().lower()
    cl = data.get("credit_limit")
    hc = data.get("high_credit")
    comments = (data.get("comments") or "")
    if status == "open" and cl == 0 and hc and hc > 0 and "credit limit" in comments.lower():
        add(make_violation("Account Status & Codes",
                           f"Open account with zero credit limit though comments say H/C is limit ({bureau})",
                           "If H/C serves as credit limit, reported limit shouldn't be $0.",
                           {"bureau": bureau, "high_credit": hc, "credit_limit": cl, "comments": comments}))

@rule("DATE_ORDER_SANITY", "Dates")
def r_date_order_sanity(ctx, bureau, data, add):
    date_opened = data.get("date_opened")
    last_reported = data.get("last_reported")
    date_last_payment = data.get("date_last_payment")
    if date_opened and last_reported and last_reported < date_opened:
        add(make_violation("Dates",
                           f"Last Reported precedes Date Opened ({bureau})",
                           "Reporting date cannot be earlier than when account was opened.",
                           {"bureau": bureau, "date_opened": date_opened, "last_reported": last_reported}))
    if date_opened and date_last_payment and date_last_payment < date_opened:
        add(make_violation("Dates",
                           f"Date of Last Payment precedes Date Opened ({bureau})",
                           "Last payment date earlier than open date is suspicious.",
                           {"bureau": bureau, "date_opened": date_opened, "date_last_payment": date_last_payment}))

@rule("REVOLVING_WITH_TERMS", "Data Definitions", furnisher_types=["revolving","generic"])
def r_revolving_with_terms(ctx, bureau, data, add):
    acct_type = (data.get("account_type") or "").strip().lower()
    months_terms = data.get("months_terms")
    if "revolving" in acct_type and months_terms and months_terms > 0:
        add(make_violation("Data Definitions",
                           f"Revolving account with non-zero 'No. of Months (terms)' ({bureau})",
                           "Revolving accounts usually don't have installment terms.",
                           {"bureau": bureau, "account_type": data.get("account_type"), "months_terms": months_terms}))

@rule("REVOLVING_NO_CL_OR_HC", "Balances & Amounts", furnisher_types=["revolving","generic"])
def r_revolving_missing_cl_hc(ctx, bureau, data, add):
    status = (data.get("account_status") or "").strip().lower()
    cl = data.get("credit_limit")
    hc = data.get("high_credit")
    comments = (data.get("comments") or "")
    acct_type = (data.get("account_type") or "").lower()
    if "revolving" in acct_type and status == "open" and (cl in (None, 0)) and (not hc or hc == 0) and "credit limit" not in comments.lower():
        add(make_violation("Balances & Amounts",
                           f"Open revolving with high credit/limit missing ({bureau})",
                           "Open revolving accounts typically report a CL or, if unavailable, a clear HC surrogate.",
                           {"bureau": bureau, "high_credit": hc, "credit_limit": cl, "comments": comments}))

@rule("INSTALLMENT_WITH_CL", "Data Definitions")
def r_installment_with_cl(ctx, bureau, data, add):
    acct_type = (data.get("account_type") or "").strip().lower()
    cl = data.get("credit_limit")
    if "installment" in acct_type and cl and cl > 0:
        add(make_violation("Data Definitions",
                           f"Installment account reports a credit limit ({bureau})",
                           "Installments typically report original/high credit, not a revolving limit.",
                           {"bureau": bureau, "credit_limit": cl, "account_type": data.get("account_type")}))

@rule("CO_OR_COLLECTION_PASTDUE", "Balances & Amounts", furnisher_types=["collection","generic"])
def r_co_collection_pastdue(ctx, bureau, data, add):
    pstat = (data.get("payment_status") or "").lower()
    status = (data.get("account_status") or "").lower()
    acct_type = (data.get("account_type") or "").lower()
    past_due = data.get("past_due")
    is_collection = "collection" in acct_type or "debt buyer" in (data.get("creditor_class") or "").lower() or "collection" in status
    is_chargeoff = "charge" in pstat or "charge" in status
    if (is_collection or is_chargeoff) and past_due and past_due > 0:
        add(make_violation("Balances & Amounts",
                           f"{'Collection' if is_collection else 'Charge-off'} reporting past-due ({bureau})",
                           "Collections/charge-offs generally should not report a past-due amount.",
                           {"bureau": bureau, "past_due": past_due}))

@rule("AU_COMMENT_ECOA_CONFLICT", "Ownership & Responsibility")
def r_au_comment_ecoa_conflict(ctx, bureau, data, add):
    ecoa = (data.get("ecoa") or "").strip().upper()
    comments = (data.get("comments") or "")
    if "authorized user" in comments.lower() and ecoa not in {"3","A","AU","T"}:
        add(make_violation("Ownership & Responsibility",
                           f"AU described in comments but ECOA not AU ({bureau})",
                           "Ownership coding conflicts with narrative.",
                           {"bureau": bureau, "ecoa": ecoa, "comments": comments}))

@rule("DEROG_RATING_BUT_CURRENT", "Payment History")
def r_derog_rating_but_current(ctx, bureau, data, add):
    rating = (data.get("current_rating") or "").strip()
    pstat = (data.get("payment_status") or "").strip().lower()
    past_due = data.get("past_due")
    if rating in {"2","3","4","5","6","7","8","9"} and (not past_due or past_due == 0) and "current" in pstat:
        add(make_violation("Payment History",
                           f"Derogatory rating with 'Current' status and no past-due ({bureau})",
                           "Numeric rating denotes delinquency but status/amount do not align.",
                           {"bureau": bureau, "current_rating": rating, "payment_status": data.get("payment_status"), "past_due": past_due}))

@rule("DISPUTE_COMMENT_NEEDS_XB", "Dispute Coding")
def r_dispute_comment_needs_xb(ctx, bureau, data, add):
    comments = (data.get("comments") or "")
    ccc = (data.get("ccc") or "").strip().upper()
    if "disput" in comments.lower() and ccc != "XB":
        add(make_violation("Dispute Coding",
                           f"Comments indicate a dispute but CCC not 'XB' ({bureau})",
                           "Metro 2 requires compliant dispute coding when a consumer disputes.",
                           {"bureau": bureau, "ccc": ccc, "comments": comments}))

@rule("CLOSED_BUT_MONTHLY_PAYMENT", "Balances & Amounts")
def r_closed_but_monthly_payment(ctx, bureau, data, add):
    status = (data.get("account_status") or "").strip().lower()
    mp = data.get("monthly_payment") or 0
    if status.startswith("closed") and mp > 0:
        add(make_violation("Balances & Amounts",
                           f"Closed account with non-zero monthly payment ({bureau})",
                           "Closed accounts should not report ongoing scheduled payments.",
                           {"bureau": bureau, "monthly_payment": mp}))

@rule("STALE_ACTIVE_REPORTING", "Dates")
def r_stale_active_reporting(ctx, bureau, data, add):
    status = (data.get("account_status") or "").strip().lower()
    last_reported = data.get("last_reported")
    if status in {"open", "current", "paid as agreed"} and last_reported:
        yrs = years_between(last_reported, TODAY)
        if yrs and yrs > 0.5:
            add(make_violation("Dates",
                               f"Stale reporting on active account ({bureau})",
                               "Active accounts should be reasonably current.",
                               {"bureau": bureau, "last_reported": last_reported, "age_years": round(yrs,2)}))

@rule("DOFD_OBSOLETE_7Y", "Obsolescence")
def r_dofd_obsolete_7y(ctx, bureau, data, add):
    dofd = data.get("date_first_delinquency")
    if dofd:
        yrs = years_between(dofd, TODAY)
        if yrs and yrs >= 7.0:
            add(make_violation("Obsolescence",
                               f"Negative item older than 7 years from DOFD ({bureau})",
                               "Aged beyond standard obsolescence period; investigate for deletion.",
                               {"bureau": bureau, "dofd": dofd, "age_years": round(yrs,2)}))

# --- Newly added numeric-code rules ---

@rule("3", "Account Status & Codes")
def r_3(ctx, bureau, data, add):
    status = (data.get("account_status") or "").strip().lower()
    closed = data.get("date_closed")
    if closed and status in {"open", "current"}:
        add(make_violation(
            "Account Status & Codes",
            f"Account reported open after closure ({bureau})",
            "Date Closed present but status indicates account open.",
            {"bureau": bureau, "account_status": data.get("account_status"), "date_closed": closed}))

@rule("8", "Dates")
def r_8(ctx, bureau, data, add):
    status = (data.get("account_status") or "").lower()
    if "charge" in status and not data.get("date_first_delinquency"):
        add(make_violation(
            "Dates",
            f"Charge-off without DOFD ({bureau})",
            "Charge-off accounts must report a Date of First Delinquency.",
            {"bureau": bureau}))

@rule("9", "Data Definitions")
def r_9(ctx, bureau, data, add):
    status = (data.get("account_status") or "").lower()
    if "collection" in status and not data.get("original_creditor"):
        add(make_violation(
            "Data Definitions",
            f"Collection missing original creditor ({bureau})",
            "Collection accounts should list the original creditor.",
            {"bureau": bureau}))

@rule("10", "Duplicate/Conflicting Reporting")
def r_10(ctx, bureau, data, add):
    acct = data.get("account_number")
    if not acct:
        return
    seen = ctx.setdefault("_seen_accounts", set())
    key = (bureau, acct)
    if key in seen:
        add(make_violation(
            "Duplicate/Conflicting Reporting",
            f"Duplicate account number {acct} ({bureau})",
            "Account number appears multiple times for the same bureau.",
            {"bureau": bureau, "account_number": acct}))
    else:
        seen.add(key)

# --- Student-loan-specific example rules ---

@rule("SL_NO_LATES_DURING_DEFERMENT", "Payment History", furnisher_types=["student_loan"])
def r_sl_no_lates_during_deferment(ctx, bureau, data, add):
    """
    If comments indicate deferment/forbearance, flag late codes in history.
    """
    comments = (data.get("comments") or "").lower()
    in_relief = ("defer" in comments) or ("forbear" in comments)
    history_seq = data.get("payment_history") or []
    if in_relief and any(c in HSTRY_LATE_CLASSES for c in history_seq):
        add(make_violation("Payment History",
                           f"Lates reported during deferment/forbearance ({bureau})",
                           "Payments shouldn’t be marked late during approved deferment/forbearance periods.",
                           {"bureau": bureau, "comments": comments, "history": history_seq}))

# -----------------------------
# Engine runner for a tradeline
# -----------------------------

def run_rules_for_tradeline(creditor, per_bureau, rule_profile):
    global _CURRENT_RULE_ID
    violations = []
    furnisher_type = detect_furnisher_type(per_bureau)
    ctx = RuleContext(creditor, per_bureau, furnisher_type, rule_profile)

    def add(v):
        violations.append(v)

    # Cross-bureau rules
    for name, meta in RULES.items():
        if not meta["is_cross_bureau"]:
            continue
        if not is_rule_enabled(name, furnisher_type, rule_profile):
            continue
        _CURRENT_RULE_ID = name
        meta["fn"](ctx, add)
        _CURRENT_RULE_ID = None

    # Per-bureau rules
    for b in BUREAUS:
        data = per_bureau[b]
        for name, meta in RULES.items():
            if meta["is_cross_bureau"]:
                continue
            if not is_rule_enabled(name, furnisher_type, rule_profile):
                continue
            _CURRENT_RULE_ID = name
            meta["fn"](ctx, b, data, add)
            _CURRENT_RULE_ID = None

    return violations, furnisher_type

# -----------------------------
# Personal information parsing
# -----------------------------

def parse_personal_info(soup):
    """Extract per-bureau name, DOB and addresses from the personal-information table."""
    results = {b: {"name": None, "dob": None, "addresses": []} for b in BUREAUS}
    for tbl in soup.select("table.re-even-odd.rpt_content_table.rpt_content_header.rpt_table4column"):
        header = clean_text(tbl.find_previous("div", class_="sub_header"))
        if "personal" not in header.lower():
            continue
        rows = tbl.select("tr")
        if not rows:
            continue
        for tr in rows[1:]:
            tds = tr.find_all("td")
            if len(tds) < 4:
                continue
            label = clean_text(tds[0]).lower()
            for idx, bureau in enumerate(BUREAUS, start=1):
                val = clean_text(tds[idx]) if idx < len(tds) else ""
                if not val:
                    continue
                if "name" in label:
                    results[bureau]["name"] = val
                elif "birth" in label or "dob" in label:
                    results[bureau]["dob"] = parse_date(val) or val
                elif "address" in label:
                    results[bureau]["addresses"].append(val)
        break
    # Drop bureaus with no info
    return {b: info for b, info in results.items() if any([info["name"], info["dob"], info["addresses"]])}

# -----------------------------
# Inquiry parsing & hygiene
# -----------------------------

def parse_inquiries(soup):
    inquiries = []
    for tbl in soup.select("table.re-even-odd.rpt_content_table.rpt_content_header.rpt_table4column"):
        header = clean_text(tbl.find_previous("div", class_="sub_header"))
        if "inquiries" not in header.lower():
            continue
        rows = tbl.select("tr")
        if not rows:
            continue
        cols = [clean_text(th).lower() for th in rows[0].find_all("th")]
        for tr in rows[1:]:
            tds = tr.find_all("td")
            if len(tds) < len(cols):
                continue
            data = {cols[i]: clean_text(tds[i]) for i in range(len(cols))}
            creditor = data.get("creditor") or data.get("company") or ""
            # columns names vary wildly; attempt multiple:
            dt_raw = data.get("date") or data.get("inquiry date") or data.get("inquiry_date")
            date_iso = parse_date(dt_raw)
            bureau = data.get("bureau") or data.get("credit bureau") or data.get("credit_bureau")
            inquiries.append({"creditor": creditor, "date": date_iso, "bureau": bureau})
    return inquiries

def mark_inquiry_disputes(inquiries, tradelines):
    # link inquiry to a trade opened same month by same creditor (loose match)
    for inq in inquiries:
        inq_month = (inq.get("date") or "")[:7]
        keep = False
        for tl in tradelines:
            name = (tl.get("meta", {}).get("creditor") or "").lower()
            if inq.get("creditor", "").lower() in name or name in (inq.get("creditor", "").lower()):
                for pb in tl.get("per_bureau", {}).values():
                    opened = (pb.get("date_opened") or "")[:7]
                    if opened and opened == inq_month:
                        keep = True
                        break
            if keep:
                break
        inq["dispute"] = not keep

    # Obsolete > 24 months
    for inq in inquiries:
        dt = inq.get("date")
        if dt:
            yrs = years_between(dt, TODAY)
            if yrs and yrs > 2.0:
                inq["obsolete"] = True
                inq["dispute"] = True

    # Same-day same-creditor duplicate
    seen = set()
    for inq in inquiries:
        key = (inq.get("creditor","").lower().strip(), inq.get("date"))
        if key in seen:
            inq["duplicate"] = True
            inq["dispute"] = True
        else:
            seen.add(key)

# -----------------------------
# Tradeline extraction
# -----------------------------

def extract_all_tradelines(soup):
    results = []
    for tbl in soup.select("table.rpt_content_table.rpt_table4column"):
        if not is_tradeline_table(tbl):
            continue
        creditor = nearest_creditor_header(tbl)
        rows = extract_rows(tbl)
        per_bureau = normalize_record(rows)
        histories = extract_payment_history(tbl)
        for b in BUREAUS:
            if histories.get(b):
                per_bureau[b]["payment_history"] = histories[b]
        meta = {
            "creditor": creditor,
            "account_numbers": {b: per_bureau[b].get("account_number") for b in BUREAUS if per_bureau[b].get("account_number")}
        }
        results.append({"meta": meta, "per_bureau": per_bureau})
    return results

# -----------------------------
# Duplicate OC/CA (same debt) heuristic
# -----------------------------

def possible_same_debt(tl_a, tl_b):
    a, b = tl_a["per_bureau"], tl_b["per_bureau"]
    for bu in BUREAUS:
        A, B = a.get(bu, {}), b.get(bu, {})
        if not A or not B:
            continue
        balA, balB = A.get("balance"), B.get("balance")
        dofdA, dofdB = (A.get("date_first_delinquency") or "")[:7], (B.get("date_first_delinquency") or "")[:7]
        atA = (A.get("account_type") or "") + " " + (A.get("account_status") or "")
        atB = (B.get("account_type") or "") + " " + (B.get("account_status") or "")
        looks_pair = (("charge" in atA.lower() and "collect" in atB.lower()) or
                      ("collect" in atA.lower() and "charge" in atB.lower()))
        if balA and balB and dofdA and dofdB and looks_pair:
            ratio = min(balA, balB) / max(balA, balB)
            if ratio >= 0.95 and dofdA == dofdB:
                return True
    return False

def tag_duplicate_debts(tradelines, violations_map):
    for i in range(len(tradelines)):
        for j in range(i+1, len(tradelines)):
            if possible_same_debt(tradelines[i], tradelines[j]):
                cred_i = tradelines[i]["meta"]["creditor"]
                cred_j = tradelines[j]["meta"]["creditor"]
                violations_map[i].append(make_violation(
                    "Duplicate Collections",
                    "Potential duplicate reporting for the same debt",
                    "Original charge-off and a collection appear to represent the same obligation.",
                    {"paired_with": cred_j}
                ))
                violations_map[j].append(make_violation(
                    "Duplicate Collections",
                    "Potential duplicate reporting for the same debt",
                    "Original charge-off and a collection appear to represent the same obligation.",
                    {"paired_with": cred_i}
                ))

# -----------------------------
# Metrics enrichment (utilization average)
# -----------------------------

def enrich_trade_metrics(tl):
    pb = tl["per_bureau"]
    utils = []
    for b in BUREAUS:
        bal = pb[b].get("balance")
        cl  = pb[b].get("credit_limit")
        u = utilization(bal, cl)
        if u is not None:
            utils.append(u)
    if utils:
        tl.setdefault("metrics", {})["avg_utilization"] = round(sum(utils)/len(utils), 2)

# -----------------------------
# CLI / Main
# -----------------------------

def main():
    ap = argparse.ArgumentParser(description="Audit tradelines in an HTML report for Metro 2-style violations (rule engine).")
    ap.add_argument("-i", "--input", required=True, help="Path to input HTML file (can contain multiple tradelines)")
    ap.add_argument("-o", "--output", default="report.json", help="Path to output JSON file")
    ap.add_argument("--rule_profile", help="Optional path to JSON configuring rule enable/disable (global/per furnisher type)")
    args = ap.parse_args()

    rule_profile = None
    if args.rule_profile and os.path.exists(args.rule_profile):
        with open(args.rule_profile, "r", encoding="utf-8") as f:
            rule_profile = json.load(f)

    with open(args.input, "r", encoding="utf-8", errors="ignore") as f:
        html = f.read()

    soup = BeautifulSoup(html, "html.parser")
    personal_info = parse_personal_info(soup)
    tradelines = extract_all_tradelines(soup)
    inquiries = parse_inquiries(soup)

    if not tradelines:
        print("✖ No tradeline 4-column tables were found. Check that the HTML layout matches the expected structure.")
        return

    # Run rule engine on each tradeline
    SEEN_ACCOUNT_NUMBERS.clear()
    all_results = []
    violations_map = defaultdict(list)
    furnisher_types = []
    for idx, tl in enumerate(tradelines):
        creditor = tl["meta"]["creditor"]
        per_bureau = tl["per_bureau"]
        vios, furnisher_type = run_rules_for_tradeline(creditor, per_bureau, rule_profile)
        furnisher_types.append(furnisher_type)
        # store
        enrich_trade_metrics(tl)
        violations_map[idx].extend(vios)

    # Heuristic duplicate OC/CA pass
    tag_duplicate_debts(tradelines, violations_map)

    # Inquiry hygiene (after we know tradelines)
    mark_inquiry_disputes(inquiries, tradelines)

    # Print human-readable summary
    print(f"\nFound {len(tradelines)} tradeline(s).")
    for idx, tl in enumerate(tradelines, 1):
        cred = tl["meta"]["creditor"]
        acct = tl["meta"].get("account_numbers") or {}
        ft = furnisher_types[idx-1]
        print(f"\n=== Tradeline {idx}: {cred} [{ft}] ===")
        if acct:
            print(f"Account #s: {acct}")
        vlist = violations_map[idx-1]
        if not vlist:
            print("No obvious violations detected by these rules.")
        else:
            # sort by severity desc, then category
            vlist_sorted = sorted(vlist, key=lambda v: (-v.get("severity",1), v["category"], v["title"]))
            for v in vlist_sorted:
                print(f"- ({v.get('severity',1)}) [{v['category']}] {v['title']}")
                ev = v.get("evidence", {})
                if ev:
                    print(f"  Evidence: {json.dumps(ev, ensure_ascii=False)}")

    # Save JSON (grouped)
    normalized = []
    for idx, tl in enumerate(tradelines):
        grouped = defaultdict(list)
        for itm in violations_map[idx]:
            grouped[itm["category"]].append(itm)
        normalized.append({
            "meta": tl["meta"],
            "per_bureau": tl["per_bureau"],
            "metrics": tl.get("metrics", {}),
            "violations": violations_map[idx],
            "violations_grouped": grouped
        })

    out = {
        "personal_info": personal_info,
        "tradelines": normalized,
        "inquiries": inquiries,
    }
    with open(args.output, "w", encoding="utf-8") as f:
        json.dump(out, f, indent=2, ensure_ascii=False)

    print(f"\n✓ JSON report saved to: {args.output}")

if __name__ == "__main__":
    main()

