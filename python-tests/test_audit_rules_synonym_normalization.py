import sys
import unittest
from pathlib import Path

# Ensure project root is available for imports
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from metro2 import audit_rules  # noqa: E402


class TestSynonymNormalization(unittest.TestCase):
    def test_alias_overrides_blank_canonical_value(self):
        record = {"account_number": "", "Account #": "12345"}

        audit_rules.normalize_tradeline(record)

        self.assertEqual(record["account_number"], "12345")

    def test_alias_does_not_override_populated_canonical(self):
        record = {"account_number": "ABC123", "Account #": "XYZ789"}

        audit_rules.normalize_tradeline(record)

        self.assertEqual(record["account_number"], "ABC123")


if __name__ == "__main__":
    unittest.main()
