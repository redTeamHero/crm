import unittest

import metro2_audit_multi as m2


class TestMissingDOFD(unittest.TestCase):
    def test_empty_tradeline_skipped(self):
        violations = []
        m2.r_missing_dofd({}, "Experian", {}, violations.append)
        self.assertEqual(violations, [])


if __name__ == "__main__":
    unittest.main()
