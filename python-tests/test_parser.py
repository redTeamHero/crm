import sys
import unittest
from pathlib import Path

sys.path.append(str(Path(__file__).resolve().parents[1]))

from metro2.parser import (  # noqa: E402
    detect_tradeline_violations,
    parse_client_portal_data,
    parse_credit_report_html,
    parse_negative_item_cards,
)


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


SAMPLE_HTML = """
<html><body>
  <h2>Personal Information</h2>
  <table>
    <tr>
      <td>Full Name</td>
      <td>Jane Doe</td>
      <td>Jane Doe</td>
      <td>Jane Doe</td>
    </tr>
    <tr>
      <td>Current Address</td>
      <td>123 Apple St</td>
      <td>123 Apple St</td>
      <td>123 Apple St</td>
    </tr>
  </table>
  <h2>Account History</h2>
  <table>
    <tr>
      <td>ALPHA BANK</td>
      <td>TransUnion</td>
      <td>Experian</td>
      <td>Equifax</td>
    </tr>
    <tr>
      <td>Account Number</td>
      <td>1234</td>
      <td>1234</td>
      <td>1234</td>
    </tr>
    <tr>
      <td>Account Status</td>
      <td>Charge-Off</td>
      <td>Late 30</td>
      <td>Open</td>
    </tr>
  </table>
  <h2>Inquiries</h2>
  <table>
    <tr>
      <td>Creditor Name</td>
      <td>Type of Business</td>
      <td>Date of Inquiry</td>
      <td>Credit Bureau</td>
    </tr>
    <tr>
      <td>Capital One</td>
      <td>Credit Card</td>
      <td>01/01/2024</td>
      <td>TransUnion</td>
    </tr>
  </table>
</body></html>
"""


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


class SplitParserCoverageTest(unittest.TestCase):
    def test_negative_item_parser_scope(self):
        parsed = parse_negative_item_cards(SAMPLE_HTML)
        self.assertIn("accounts", parsed)
        self.assertIn("inquiries", parsed)
        self.assertNotIn("personal_information", parsed)
        self.assertEqual(len(parsed["accounts"]), 3)
        bureaus = {tl.get("bureau") for tl in parsed["accounts"]}
        self.assertSetEqual(bureaus, {"TransUnion", "Experian", "Equifax"})
        self.assertEqual(len(parsed["inquiries"]), 1)

    def test_portal_parser_extends_negative_payload(self):
        base = parse_negative_item_cards(SAMPLE_HTML)
        portal = parse_client_portal_data(SAMPLE_HTML)
        self.assertEqual(portal["accounts"], base["accounts"])
        self.assertEqual(portal["inquiries"], base["inquiries"])
        personal = portal.get("personal_information", {})
        self.assertIn("TransUnion", personal)
        self.assertEqual(personal["TransUnion"].get("name"), "Jane Doe")

    def test_credit_report_alias_preserved(self):
        portal = parse_client_portal_data(SAMPLE_HTML)
        legacy = parse_credit_report_html(SAMPLE_HTML)
        self.assertEqual(portal, legacy)


if __name__ == "__main__":
    unittest.main()
