# Parser Debugging Test Guide

## Goal & Why (Business Impact)
- Keep Metro-2 parsing accurate so audits remain trustworthy, which protects upsell funnels for certified mail and advisory reviews.
- Faster debugging cycles mean less downtime on the client portal, boosting Lead→Consult% and Consult→Purchase%.

## Architecture (Debug Flow & Decisions)
```
Sample HTML fixture → metro2/parser.py (BeautifulSoup parser)
         ↓
  Normalized payload (accounts, inquiries, personal info)
         ↓
 metro2/audit_rules.py (violation engine) → CLI report
         ↓
 python-tests/test_parser.py (unittest suite)
```
- **Why BeautifulSoup:** lightweight, easy to introspect while stepping through failing tests.
- **Why unittest:** ships with Python, integrates with `python -m unittest` for selective runs and pdb debugging.

## Scaffold / Files to Know
```
python-tests/
├── run.sh                     # Wrapper to run the whole regression suite
├── test_parser.py             # Parser-focused regression tests
metro2/
├── parser.py                  # HTML → structured data parser
└── audit_rules.py             # Downstream rule engine invoked by tests
```

## Setup Checklist (once per machine)
- [ ] Install Python 3.11+ and `pip`.
- [ ] Create & activate a virtualenv:
  ```bash
  python3 -m venv .venv
  source .venv/bin/activate
  ```
- [ ] Install parser dependencies (currently just BeautifulSoup):
  ```bash
  pip install -r "metro2 (copy 1)/crm/requirements.txt"
  ```
- [ ] Export the repo root to `PYTHONPATH` so local changes resolve cleanly:
  ```bash
  export PYTHONPATH=$(pwd)
  ```

## How to Run the Full Parser Test Suite
- Fast path using the helper script (runs every Python regression including parser):
  ```bash
  ./python-tests/run.sh
  ```
- Direct unittest invocation (useful for CI logs or when `bash` wrappers are blocked):
  ```bash
  python -m unittest discover -s python-tests
  ```

## Focused Debugging Loops (copy-paste ready)
1. **Run only the parser tests:**
   ```bash
   python -m unittest python-tests.test_parser
   ```
2. **Target a single test case (e.g., grouping rules):**
   ```bash
   python -m unittest python-tests.test_parser.DetectTradelineViolationsGroupingTest
   ```
3. **Drop into pdb on failure:**
   ```bash
   python -m pdb -m unittest python-tests.test_parser.SplitParserCoverageTest
   ```
4. **Temporarily print the parsed payload for a quick HTML snippet:**
   ```bash
   python - <<'PY'
   from metro2.parser import parse_client_portal_data
   from pprint import pprint

   sample_html = """
   <html><body>
     <h2>Account History</h2>
     <table>
       <tr><td>ACME BANK</td><td>TransUnion</td><td>Experian</td><td>Equifax</td></tr>
       <tr><td>Account Number</td><td>1234</td><td>1234</td><td>1234</td></tr>
       <tr><td>Account Status</td><td>Open</td><td>Open</td><td>Open</td></tr>
     </table>
   </body></html>
   """

   payload = parse_client_portal_data(sample_html)
   pprint(payload)
   PY
   ```

## Suggested Debug Workflow
- Reproduce with step 1 or 2 above.
- Inspect the failing HTML snippet inside `SAMPLE_HTML` (or fixtures) and compare to `metro2/parser.py` selectors.
- Use pdb (`l`, `n`, `p variable`) around helper functions such as `parse_account_history`.
- Once green, rerun `./python-tests/run.sh` to ensure nothing else regressed.

## Smoke Test Before Committing
- Validate parser import path from the project root:
  ```bash
  python -c "from metro2 import parser; print(parser.__file__)"
  ```
- Confirm BeautifulSoup is available:
  ```bash
  python -c "import bs4; print(bs4.__version__)"
  ```

## Metrics / AB-Test Ideas
- Track `% parser_failures / uploads` in your analytics to catch regressions early.
- Run an A/B on the portal error state copy ("We couldn’t read that PDF" vs. "Need a different report format? Chat with us") and measure recovery to paid disputes.
- Instrument timing (`parse_duration_ms`) to correlate faster parsing with checkout conversion lifts.

## Next Revenue Wins
- Use parser stability as a marketing proof point: "Every audit runs through 40+ automated checks" (compliance-safe).
- Offer an upsell for manual review when parsing hits edge cases—surface it automatically after a failure flag.
- Feed parser coverage stats into sales decks to reinforce trust with trucking firms and attorneys.
