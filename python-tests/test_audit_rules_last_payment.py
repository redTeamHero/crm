import sys
import unittest
from datetime import date, timedelta
from pathlib import Path

# Ensure the project root is importable
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from metro2 import audit_rules  # noqa: E402


def _find_violation(record, violation_id):
    return any(v.get("id") == violation_id for v in record.get("violations", []))


class TestLastPaymentAuditSuite(unittest.TestCase):
    def _run(self, record):
        # Each invocation should operate on a fresh record instance.
        audit_rules.audit_missing_payment_date([record])
        return record.get("violations", [])

    def test_last_payment_before_date_opened(self):
        record = {
            "date_opened": "01/15/2020",
            "date_of_last_payment": "01/01/2020",
        }
        self._run(record)
        self.assertTrue(
            _find_violation(record, "ACCOUNT_OPENED_AFTER_LAST_PAYMENT_DATE"),
            "Expected mismatch when last payment predates Date Opened",
        )

    def test_future_last_payment_flagged(self):
        record = {
            "date_of_last_payment": (date.today() + timedelta(days=3)).strftime("%m/%d/%Y"),
        }
        self._run(record)
        self.assertTrue(
            _find_violation(record, "INACCURATE_LAST_PAYMENT_DATE"),
            "Future payment dates should be flagged",
        )

    def test_current_status_requires_last_payment_date(self):
        record = {
            "account_status": "Current",
            "balance": "0",
        }
        self._run(record)
        self.assertTrue(
            _find_violation(record, "CURRENT_NO_LAST_PAYMENT_DATE"),
            "Current accounts must carry Date of Last Payment",
        )

    def test_past_due_requires_last_payment(self):
        record = {
            "past_due": "150",
        }
        self._run(record)
        self.assertTrue(
            _find_violation(record, "PASTDUE_NO_LAST_PAYMENT_DATE"),
            "Past-due accounts without payment date should be flagged",
        )

    def test_active_balance_with_stale_payment(self):
        record = {
            "balance": "500",
            "date_of_last_payment": (date.today() - timedelta(days=4 * 365)).strftime("%m/%d/%Y"),
        }
        self._run(record)
        self.assertTrue(
            _find_violation(record, "STALE_ACTIVE_REPORTING"),
            "Active balances with stale payments should trigger a violation",
        )

    def test_chargeoff_payment_after_dofd(self):
        record = {
            "account_status": "Charge-Off",
            "date_of_last_payment": "02/01/2022",
            "date_first_delinquency": "01/01/2022",
        }
        self._run(record)
        self.assertTrue(
            _find_violation(record, "LAST_PAYMENT_AFTER_DOFD"),
            "Payment after DOFD should be flagged for charge-offs",
        )

    def test_iso_timestamp_payment_after_closure(self):
        record = {
            "date_of_last_payment": "2023-05-15T00:00:00Z",
            "date_closed": "2023-05-01",
        }
        self._run(record)
        self.assertTrue(
            _find_violation(record, "PAYMENT_REPORTED_AFTER_CLOSURE"),
            "ISO timestamp should parse so closure timing rule fires",
        )

    def test_offset_timestamp_payment_after_payoff(self):
        record = {
            "date_last_payment": "2023-06-10T00:00:00-0400",
            "payoff_date": "2023-06-01",
            "balance": "0",
        }
        self._run(record)
        self.assertTrue(
            _find_violation(record, "PAYMENT_AFTER_PAYOFF_DATE"),
            "Timezone offset format should still trigger payoff rule",
        )

    def test_current_status_with_stale_payment(self):
        record = {
            "account_status": "Current",
            "balance": "400",
            "date_of_last_payment": (date.today() - timedelta(days=140)).strftime("%m/%d/%Y"),
        }
        self._run(record)
        self.assertTrue(
            _find_violation(record, "PAYMENT_STALENESS_INCONSISTENT_WITH_STATUS"),
            "Current accounts older than 120 days without payment should flag",
        )

    def test_closed_account_missing_payment_date(self):
        record = {
            "account_status": "Paid",
        }
        self._run(record)
        self.assertFalse(
            _find_violation(record, "MISSING_LAST_PAYMENT_DATE"),
            "Generic missing last payment should not trigger for paid accounts",
        )
        self.assertTrue(
            _find_violation(record, "MISSING_LAST_PAYMENT_DATE_FOR_PAID"),
            "Paid account missing payment date should trigger the specialized rule",
        )


if __name__ == "__main__":
    unittest.main()
