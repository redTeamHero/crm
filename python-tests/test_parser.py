import sys
import unittest
from pathlib import Path

sys.path.append(str(Path(__file__).resolve().parents[1]))

from metro2.parser import detect_tradeline_violations  # noqa: E402


def build_tradeline(
    creditor: str,
    account_number: str,
    status: str,
    balance: str,
    bureau: str,
    past_due: str = "$0",
    high_credit: str = "$0",
    credit_limit: str = "$0",
) -> dict:
    return {
        "creditor_name": creditor,
        "account_number": account_number,
        "account_status": status,
        "balance": balance,
        "past_due": past_due,
        "high_credit": high_credit,
        "credit_limit": credit_limit,
        "bureau": bureau,
    }


class DetectTradelineViolationsGroupingTest(unittest.TestCase):
    def test_different_accounts_same_creditor_not_grouped(self):
        tradelines = [
            build_tradeline(
                "Premier Bank",
                "1111",
                "Open",
                "$150",
                "TransUnion",
                past_due="$0",
                high_credit="$500",
                credit_limit="$500",
            ),
            build_tradeline(
                "Premier Bank",
                "2222",
                "Closed",
                "$0",
                "Experian",
                past_due="$0",
                high_credit="",
                credit_limit="",
            ),
        ]

        audited = detect_tradeline_violations(tradelines)
        for tl in audited:
            violation_ids = {v["id"] for v in tl.get("violations", [])}
            self.assertNotIn("STATUS_MISMATCH", violation_ids)
            self.assertNotIn("BALANCE_MISMATCH", violation_ids)

    def test_same_account_mismatch_still_detected(self):
        tradelines = [
            build_tradeline(
                "Summit Credit",
                "3333-0000",
                "Open",
                "$125",
                "TransUnion",
                past_due="$0",
                high_credit="$500",
                credit_limit="$500",
            ),
            build_tradeline(
                "Summit Credit",
                "33330000 ",
                "Closed",
                "$0",
                "Experian",
                past_due="$0",
                high_credit="$500",
                credit_limit="$500",
            ),
        ]

        audited = detect_tradeline_violations(tradelines)
        for tl in audited:
            violation_ids = {v["id"] for v in tl.get("violations", [])}
            self.assertIn("STATUS_MISMATCH", violation_ids)
            self.assertIn("BALANCE_MISMATCH", violation_ids)

    def test_account_number_aliases_are_grouped(self):
        tradelines = [
            {
                "creditor_name": "Alias Bank",
                "AccountNumber": "5555-9999",
                "account_status": "Open",
                "balance": "$200",
                "bureau": "TransUnion",
            },
            {
                "creditor_name": "Alias Bank",
                "AccountNumber": "5555-9999",
                "account_status": "Closed",
                "balance": "$0",
                "bureau": "Experian",
            },
        ]

        audited = detect_tradeline_violations(tradelines)
        violation_ids = {v["id"] for tl in audited for v in tl.get("violations", [])}
        self.assertIn("STATUS_MISMATCH", violation_ids)
        self.assertIn("BALANCE_MISMATCH", violation_ids)


if __name__ == "__main__":
    unittest.main()
