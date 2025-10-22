import unittest
import sys
from pathlib import Path

from bs4 import BeautifulSoup

# Allow importing metro2_audit_multi from the project directory
sys.path.append(str(Path(__file__).resolve().parents[1] / "metro2 (copy 1)" / "crm"))
import metro2_audit_multi as m2


class TestMissingDOFD(unittest.TestCase):
    def test_empty_tradeline_skipped(self):
        violations = []
        m2.r_missing_dofd({}, "Experian", {}, violations.append)
        self.assertEqual(violations, [])

    def test_enriched_violation_has_severity_and_fcra(self):
        violations = []
        # Simulate rule execution context
        m2._CURRENT_RULE_ID = "MISSING_DOFD"
        m2.r_missing_dofd({}, "Experian", {"account_number": "1", "balance": 50}, violations.append)
        m2._CURRENT_RULE_ID = None
        self.assertEqual(len(violations), 1)
        v = violations[0]
        self.assertEqual(v["severity"], 5)
        self.assertEqual(v["fcraSection"], "§ 623(a)(5)")

    def test_unknown_rule_falls_back(self):
        # Directly create violation with unknown code
        m2._CURRENT_RULE_ID = "UNKNOWN_RULE"
        v = m2.make_violation("Dates", "Unknown", "", {})
        m2._CURRENT_RULE_ID = None
        self.assertNotIn("fcraSection", v)
        self.assertEqual(v["severity"], m2.SEVERITY["Dates"])


class TestDuplicateAccount(unittest.TestCase):
    def test_detects_duplicate_account_numbers(self):
        m2.SEEN_ACCOUNT_NUMBERS.clear()
        per_bureau1 = {b: {} for b in m2.BUREAUS}
        per_bureau1["TransUnion"].update({"account_number": "123", "date_first_delinquency": "2020-01-01"})
        v1, _ = m2.run_rules_for_tradeline("CredA", per_bureau1, {"global": {"disabled": ["10"]}})
        v1_ids = {v.get("id") for v in v1}
        self.assertNotIn("10", v1_ids)
        self.assertNotIn("METRO2_CODE_10_DUPLICATE", v1_ids)

        per_bureau2 = {b: {} for b in m2.BUREAUS}
        per_bureau2["TransUnion"].update({"account_number": "123", "date_first_delinquency": "2020-01-01"})
        v2, _ = m2.run_rules_for_tradeline("CredB", per_bureau2, {"global": {"disabled": ["10"]}})
        self.assertTrue(any(v["id"] == "DUPLICATE_ACCOUNT" for v in v2))

    def test_rule_10_emits_duplicate_violation_without_exception(self):
        original_bureaus = list(m2.BUREAUS)
        try:
            m2.BUREAUS = original_bureaus + ["TransUnion"]
            per_bureau = {b: {} for b in original_bureaus}
            per_bureau["TransUnion"]["account_number"] = "DUP-123"
            per_bureau["Experian"]["account_number"] = "EXP-999"
            per_bureau["Equifax"]["account_number"] = "EQF-888"

            m2.SEEN_ACCOUNT_NUMBERS.clear()
            violations, _ = m2.run_rules_for_tradeline("CredDup", per_bureau, None)
        finally:
            m2.BUREAUS = original_bureaus

        self.assertTrue(any(v.get("id") == "10" for v in violations))


class TestModernAuditBridge(unittest.TestCase):
    def test_non_duplicate_findings_forwarded(self):
        m2.SEEN_ACCOUNT_NUMBERS.clear()
        per_bureau = {
            bureau: {"account_number": "ACC-100", "last_reported": "01/01/2024"}
            for bureau in m2.BUREAUS
        }

        violations, meta = m2.run_rules_for_tradeline("CredModern", per_bureau, None)

        self.assertTrue(meta["account_numbers"])
        rule_ids = [v.get("id") for v in violations]
        self.assertIn("MISSING_OPEN_DATE", rule_ids)

        forwarded = [v for v in violations if v.get("id") == "MISSING_OPEN_DATE"]
        self.assertTrue(forwarded)
        for violation in forwarded:
            self.assertIsInstance(violation.get("severity"), int)
            self.assertEqual(violation.get("message"), "Missing Date Opened field")


class TestDisableConfig(unittest.TestCase):
    def _chargeoff_tradeline(self):
        per_bureau = {b: {} for b in m2.BUREAUS}
        for bureau in m2.BUREAUS:
            per_bureau[bureau].update(
                {
                    "account_status": "Charge-off",
                    "balance": "2500",
                }
            )
        return per_bureau

    def test_bridge_returns_metro2_code_findings(self):
        m2.SEEN_ACCOUNT_NUMBERS.clear()
        per_bureau = self._chargeoff_tradeline()
        violations, _ = m2.run_rules_for_tradeline("CredMetro", per_bureau, None)

        ids = [v.get("id") for v in violations]
        self.assertIn("METRO2_CODE_8_MISSING_DOFD", ids)

    def test_numeric_disable_targets_leading_code_digits(self):
        m2.SEEN_ACCOUNT_NUMBERS.clear()
        per_bureau = self._chargeoff_tradeline()
        config = {"global": {"disabled": ["8"]}}

        violations, _ = m2.run_rules_for_tradeline("CredDisabled", per_bureau, config)

        ids = {v.get("id") for v in violations}
        self.assertNotIn("METRO2_CODE_8_MISSING_DOFD", ids)
        self.assertIn("MISSING_OPEN_DATE", ids)


class TestAccountNumberParsing(unittest.TestCase):
    def test_account_number_without_colon_included_in_output(self):
        html = """
        <html><body>
            <td class="ng-binding">
                <div class="sub_header">Colonless Creditor</div>
                <table class="rpt_content_table rpt_content_header rpt_table4column">
                    <tr>
                        <th></th>
                        <th class="headerTUC">TransUnion</th>
                        <th class="headerEXP">Experian</th>
                        <th class="headerEQF">Equifax</th>
                    </tr>
                    <tr>
                        <td class="label">Account #</td>
                        <td class="info">ACCT-111</td>
                        <td class="info">ACCT-111</td>
                        <td class="info">ACCT-111</td>
                    </tr>
                </table>
            </td>
        </body></html>
        """
        soup = BeautifulSoup(html, "html.parser")
        tradelines = m2.extract_all_tradelines(soup)
        self.assertEqual(len(tradelines), 1)

        tl = tradelines[0]
        per_bureau = tl["per_bureau"]
        self.assertEqual(per_bureau["TransUnion"].get("account_number"), "ACCT-111")
        self.assertEqual(per_bureau["Experian"].get("account_number"), "ACCT-111")
        self.assertEqual(per_bureau["Equifax"].get("account_number"), "ACCT-111")
        self.assertEqual(tl["meta"]["account_numbers"], {
            "TransUnion": "ACCT-111",
            "Experian": "ACCT-111",
            "Equifax": "ACCT-111",
        })

    def test_account_number_with_colon_rendered_in_sibling_span(self):
        html = """
        <html><body>
            <td class="ng-binding">
                <div class="sub_header">Split Colon Creditor</div>
                <table class="rpt_content_table rpt_content_header rpt_table4column">
                    <tr>
                        <th></th>
                        <th class="headerTUC">TransUnion</th>
                        <th class="headerEXP">Experian</th>
                        <th class="headerEQF">Equifax</th>
                    </tr>
                    <tr>
                        <td class="label"><span>Account #</span><span>:</span></td>
                        <td class="info">SPLIT-222</td>
                        <td class="info">SPLIT-222</td>
                        <td class="info">SPLIT-222</td>
                    </tr>
                </table>
            </td>
        </body></html>
        """

        soup = BeautifulSoup(html, "html.parser")
        tradelines = m2.extract_all_tradelines(soup)
        self.assertEqual(len(tradelines), 1)

        tl = tradelines[0]
        per_bureau = tl["per_bureau"]
        self.assertEqual(per_bureau["TransUnion"].get("account_number"), "SPLIT-222")
        self.assertEqual(per_bureau["Experian"].get("account_number"), "SPLIT-222")
        self.assertEqual(per_bureau["Equifax"].get("account_number"), "SPLIT-222")
        self.assertEqual(tl["meta"]["account_numbers"], {
            "TransUnion": "SPLIT-222",
            "Experian": "SPLIT-222",
            "Equifax": "SPLIT-222",
        })

    def test_account_number_nested_info_element(self):
        html = """
        <html><body>
            <td class="ng-binding">
                <div class="sub_header">Nested Info Creditor</div>
                <table class="rpt_content_table rpt_content_header rpt_table4column">
                    <tr>
                        <th></th>
                        <th class="headerTUC">TransUnion</th>
                        <th class="headerEXP">Experian</th>
                        <th class="headerEQF">Equifax</th>
                    </tr>
                    <tr>
                        <td class="label">Account #</td>
                        <td><span class="info"><span>NESTED-333</span></span></td>
                        <td class="info">NESTED-333</td>
                        <td><div class="info">NESTED-333</div></td>
                    </tr>
                </table>
            </td>
        </body></html>
        """

        soup = BeautifulSoup(html, "html.parser")
        tradelines = m2.extract_all_tradelines(soup)
        self.assertEqual(len(tradelines), 1)

        tl = tradelines[0]
        per_bureau = tl["per_bureau"]
        self.assertEqual(per_bureau["TransUnion"].get("account_number"), "NESTED-333")
        self.assertEqual(per_bureau["Experian"].get("account_number"), "NESTED-333")
        self.assertEqual(per_bureau["Equifax"].get("account_number"), "NESTED-333")
        self.assertEqual(tl["meta"]["account_numbers"], {
            "TransUnion": "NESTED-333",
            "Experian": "NESTED-333",
            "Equifax": "NESTED-333",
        })


if __name__ == "__main__":
    unittest.main()
