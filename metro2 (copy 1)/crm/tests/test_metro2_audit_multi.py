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


class TestRule3(unittest.TestCase):
    def test_open_after_closure(self):
        violations = []
        m2._CURRENT_RULE_ID = "3"
        m2.r_3({}, "Experian", {"account_status": "Open", "date_closed": "2020-01-01"}, violations.append)
        m2._CURRENT_RULE_ID = None
        self.assertEqual(len(violations), 1)


class TestRule8(unittest.TestCase):
    def test_chargeoff_without_dofd(self):
        violations = []
        m2._CURRENT_RULE_ID = "8"
        m2.r_8({}, "Experian", {"account_status": "Charge-Off"}, violations.append)
        m2._CURRENT_RULE_ID = None
        self.assertEqual(len(violations), 1)


class TestRule9(unittest.TestCase):
    def test_collection_missing_original_creditor(self):
        violations = []
        m2._CURRENT_RULE_ID = "9"
        m2.r_9({}, "Experian", {"account_status": "Collection"}, violations.append)
        m2._CURRENT_RULE_ID = None
        self.assertEqual(len(violations), 1)


class TestRule10(unittest.TestCase):
    def test_duplicate_account(self):
        ctx = {}
        violations = []
        m2._CURRENT_RULE_ID = "10"
        m2.r_10(ctx, "Experian", {"account_number": "123"}, violations.append)
        m2.r_10(ctx, "Experian", {"account_number": "123"}, violations.append)
        m2._CURRENT_RULE_ID = None
        self.assertEqual(len(violations), 1)


if __name__ == "__main__":
    unittest.main()
