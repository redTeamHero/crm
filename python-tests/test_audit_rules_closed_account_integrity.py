import sys
import unittest
from pathlib import Path

# Ensure the project root is importable
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from metro2 import audit_rules  # noqa: E402


def _get_violations(record, violation_id):
    return [v for v in record.get("violations", []) if v.get("id") == violation_id]


class TestClosedAccountIntegrity(unittest.TestCase):
    def setUp(self):
        self.payload = {
            "accounts": [
                {
                    "Account Status": "Closed",
                    "Payment Status": "Late 30 Days",
                    "Monthly Payment": "$35",
                    "Balance": "$56",
                    "Past Due": "$26",
                    "Credit Limit": "$425",
                    "High Credit": "$457",
                    "Last Reported": "07/11/2025",
                    "Account #": "CRD00000000009704****",
                    "bureau": "Experian",
                },
                {
                    "Account Status": "Closed",
                    "Payment Status": "Closed at consumer's request",
                    "Balance": "$0",
                    "Past Due": "$0",
                    "Credit Limit": "$425",
                    "High Credit": "$425",
                    "Last Reported": "07/01/2025",
                    "Account #": "CRD00000000009704****",
                    "bureau": "Equifax",
                },
            ]
        }

    def test_closed_account_reports_payment_obligation(self):
        audited = audit_rules.run_all_audits(self.payload)
        experian = next(record for record in audited["accounts"] if record.get("bureau") == "Experian")
        equifax = next(record for record in audited["accounts"] if record.get("bureau") == "Equifax")

        self.assertTrue(
            _get_violations(experian, "CLOSED_ACCOUNT_STILL_REPORTING_PAYMENT"),
            "Closed Experian tradeline should flag payment obligation",
        )
        self.assertTrue(
            _get_violations(experian, "HIGH_CREDIT_EXCEEDS_LIMIT"),
            "High credit above the limit should trigger a violation",
        )
        self.assertTrue(
            _get_violations(experian, "LAST_REPORTED_MISMATCH"),
            "Last Reported mismatch should be flagged on Experian",
        )
        self.assertTrue(
            _get_violations(equifax, "LAST_REPORTED_MISMATCH"),
            "Last Reported mismatch should be flagged on Equifax counterpart",
        )


if __name__ == "__main__":
    unittest.main()
