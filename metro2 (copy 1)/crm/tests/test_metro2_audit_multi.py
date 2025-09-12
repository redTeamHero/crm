import unittest

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
        v1, _ = m2.run_rules_for_tradeline("CredA", per_bureau1, None)
        self.assertEqual(len(v1), 0)

        per_bureau2 = {b: {} for b in m2.BUREAUS}
        per_bureau2["TransUnion"].update({"account_number": "123", "date_first_delinquency": "2020-01-01"})
        v2, _ = m2.run_rules_for_tradeline("CredB", per_bureau2, None)
        self.assertTrue(any(v["id"] == "DUPLICATE_ACCOUNT" for v in v2))



if __name__ == "__main__":
    unittest.main()
