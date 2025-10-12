#!/usr/bin/env python3
"""Generate a categorized report of potentially unused code.

The script wraps the ``vulture`` static analysis tool, ignoring vendor
and generated directories, and post-processes the findings to separate
items that are safe to ignore (for example dynamically registered rule
functions) from candidates that likely need cleanup.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Iterable, List, Optional

VULTURE_BIN = os.environ.get("VULTURE_BIN", "vulture")
DEFAULT_EXCLUDES = [
    "node_modules",
    "metro2 (copy 1)/crm/node_modules",
    "__pycache__",
    ".pytest_cache",
    ".mypy_cache",
]
DYNAMIC_RULE_FILE = Path("metro2 (copy 1)/crm/metro2_audit_multi.py")
RULE_FN_PATTERN = re.compile(r"^r_[A-Za-z0-9_]+$")
REPORT_HEADER = "# Unused Code Audit\n"

# Curated intent notes so product/ops leaders understand why seemingly unused
# helpers exist.  Keys are ``(path, symbol_name)`` tuples.
EXPLANATIONS: dict[tuple[str, str], str] = {
    ("metro2 (copy 1)/crm/metro2_audit_multi.py", "Request"): (
        "Kept from the earlier HTML-downloader flow; allows authenticated"
        " pulls of credit reports directly from a bureau URL."
    ),
    ("metro2 (copy 1)/crm/metro2_audit_multi.py", "urlopen"): (
        "Works with Request to stream remote HTML reports when the CLI fetches"
        " them instead of reading local files."
    ),
    ("metro2 (copy 1)/crm/metro2_audit_multi.py", "quote_plus"): (
        "Used when we generate dispute links with query-string parameters;"
        " retained for the web automation variant of the audit."
    ),
    ("metro2 (copy 1)/crm/metro2_audit_multi.py", "r_cross_bureau_field_mismatch"): (
        "Cross-compares balances, statuses, and identifiers across bureaus"
        " so ops can surface conflicting Metro-2 fields to clients."
    ),
    ("metro2 (copy 1)/crm/metro2_audit_multi.py", "r_cross_bureau_utilization_disparity"): (
        "Highlights large swings in revolving utilization from bureau to"
        " bureau that hurt scores and may signal data sync issues."
    ),
    ("metro2 (copy 1)/crm/metro2_audit_multi.py", "r_duplicate_account"): (
        "Flags when the same bureau reports an account number twice so we"
        " can dispute the duplicate tradeline."
    ),
    ("metro2 (copy 1)/crm/metro2_audit_multi.py", "r_current_but_pastdue"): (
        "Checks for tradelines coded 'current' while still showing a past-due"
        " balance—classic Metro-2 inconsistency."
    ),
    ("metro2 (copy 1)/crm/metro2_audit_multi.py", "r_zero_balance_but_pastdue"): (
        "Ensures $0 balance accounts are not still reporting a past-due"
        " amount, which should be impossible."
    ),
    ("metro2 (copy 1)/crm/metro2_audit_multi.py", "r_late_status_no_pastdue"): (
        "Catches 'late/delinquent' payment statuses that fail to carry a"
        " supporting past-due amount."
    ),
    ("metro2 (copy 1)/crm/metro2_audit_multi.py", "r_open_zero_cl_with_hc_comment"): (
        "Looks for open revolving accounts with a $0 limit even though the"
        " comments admit the high credit is acting as the limit."
    ),
    ("metro2 (copy 1)/crm/metro2_audit_multi.py", "r_date_order_sanity"): (
        "Validates that Last Reported or Last Payment dates do not precede"
        " the Date Opened."
    ),
    ("metro2 (copy 1)/crm/metro2_audit_multi.py", "r_revolving_with_terms"): (
        "Prevents revolving accounts from carrying installment-style term"
        " lengths, which violates Metro-2 definitions."
    ),
    ("metro2 (copy 1)/crm/metro2_audit_multi.py", "r_revolving_missing_cl_hc"): (
        "Asserts that open revolving tradelines list either a credit limit or"
        " a usable high credit proxy."
    ),
    ("metro2 (copy 1)/crm/metro2_audit_multi.py", "r_installment_with_cl"): (
        "Catches installment loans that erroneously publish a revolving"
        " credit limit."
    ),
    ("metro2 (copy 1)/crm/metro2_audit_multi.py", "r_co_collection_pastdue"): (
        "Calls out collections or charge-offs that still show a past-due"
        " balance, which Metro-2 forbids."
    ),
    ("metro2 (copy 1)/crm/metro2_audit_multi.py", "r_au_comment_ecoa_conflict"): (
        "Aligns ECOA codes with 'authorized user' comments to avoid"
        " responsibility mislabeling."
    ),
    ("metro2 (copy 1)/crm/metro2_audit_multi.py", "r_derog_rating_but_current"): (
        "Spots derogatory numeric ratings that conflict with 'current'"
        " payment status and zero past-due."
    ),
    ("metro2 (copy 1)/crm/metro2_audit_multi.py", "r_dispute_comment_needs_xb"): (
        "Requires accounts with dispute language to carry the XB dispute"
        " compliance code."
    ),
    ("metro2 (copy 1)/crm/metro2_audit_multi.py", "r_closed_but_monthly_payment"): (
        "Checks that closed accounts are not still reporting a monthly"
        " payment obligation."
    ),
    ("metro2 (copy 1)/crm/metro2_audit_multi.py", "r_stale_active_reporting"): (
        "Flags open/current tradelines whose last update is older than six"
        " months."
    ),
    ("metro2 (copy 1)/crm/metro2_audit_multi.py", "r_dofd_obsolete_7y"): (
        "Surfaces negative items older than seven years from DOFD for"
        " obsolescence disputes."
    ),
    ("metro2 (copy 1)/crm/metro2_audit_multi.py", "r_3"): (
        "Metro-2 code 3 guardrail: prevents accounts with a Date Closed from"
        " still reporting as open/current."
    ),
    ("metro2 (copy 1)/crm/metro2_audit_multi.py", "r_8"): (
        "Metro-2 code 8 guardrail: charge-offs must provide a Date of First"
        " Delinquency."
    ),
    ("metro2 (copy 1)/crm/metro2_audit_multi.py", "r_9"): (
        "Metro-2 code 9 guardrail: collections must list the original"
        " creditor."
    ),
    ("metro2 (copy 1)/crm/metro2_audit_multi.py", "r_10"): (
        "Metro-2 code 10 guardrail: blocks duplicate account numbers within"
        " the same bureau feed."
    ),
    ("metro2 (copy 1)/crm/metro2_audit_multi.py", "r_sl_no_lates_during_deferment"): (
        "Student-loan sanity check ensuring deferment/forbearance accounts"
        " do not show late history."
    ),
}


@dataclass
class Finding:
    path: str
    line: int
    message: str
    name: str
    kind: str
    confidence: int
    category: str


def run_vulture(root: Path, targets: Iterable[str], excludes: Iterable[str]) -> str:
    cmd = [VULTURE_BIN, *targets, "--exclude", ",".join(sorted(set(excludes)))]
    try:
        result = subprocess.run(
            cmd,
            cwd=root,
            check=False,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )
    except FileNotFoundError as exc:  # pragma: no cover - surfaced to user
        raise SystemExit(f"Could not find vulture executable: {exc}") from exc

    if result.stderr:
        print(result.stderr, file=sys.stderr)
    return result.stdout


def parse_vulture_output(output: str) -> List[Finding]:
    findings: List[Finding] = []
    pattern = re.compile(
        r"^(?P<path>.+?):(?P<line>\d+):\s+(?P<message>.+?)\s+'(?P<name>.+?)'\s+\((?P<conf>\d+)% confidence\)"
    )
    for raw in output.splitlines():
        raw = raw.strip()
        if not raw:
            continue
        match = pattern.match(raw)
        if not match:
            continue
        path = match.group("path")
        line = int(match.group("line"))
        message = match.group("message")
        name = match.group("name")
        conf = int(match.group("conf"))
        kind = message.replace("unused ", "")
        findings.append(
            Finding(
                path=path,
                line=line,
                message=message,
                name=name,
                kind=kind,
                confidence=conf,
                category="uncategorized",
            )
        )
    return findings


def categorize(findings: List[Finding]) -> None:
    for f in findings:
        path_obj = Path(f.path)
        path_lower = f.path.lower()
        if "node_modules" in path_lower:
            f.category = "third_party"
            continue
        if path_obj == DYNAMIC_RULE_FILE and f.kind == "function" and RULE_FN_PATTERN.match(f.name):
            f.category = "dynamic_rule"
            continue
        if f.kind == "import" and path_obj == DYNAMIC_RULE_FILE:
            f.category = "dynamic_rule"
            continue
        f.category = "candidate"


def format_report(findings: List[Finding], *, as_json: bool = False) -> str:
    if as_json:
        return json.dumps([asdict(f) for f in findings], indent=2)

    by_category: dict[str, List[Finding]] = {}
    for f in findings:
        by_category.setdefault(f.category, []).append(f)

    lines = [REPORT_HEADER]
    summary = {
        "candidate": len(by_category.get("candidate", [])),
        "dynamic_rule": len(by_category.get("dynamic_rule", [])),
        "third_party": len(by_category.get("third_party", [])),
    }
    lines.append("## Summary\n")
    for key, count in summary.items():
        lines.append(f"- {key.replace('_', ' ').title()}: {count}")
    lines.append("")

    for category in ("candidate", "dynamic_rule", "third_party"):
        entries = by_category.get(category, [])
        if not entries:
            continue
        title = {
            "candidate": "Potentially unused (needs review)",
            "dynamic_rule": "Registered dynamically (usually safe to keep)",
            "third_party": "Third-party / vendor code",
        }[category]
        lines.append(f"## {title}\n")
        for f in sorted(entries, key=lambda x: (x.path, x.line, x.name)):
            explanation = EXPLANATIONS.get((f.path, f.name))
            detail = f"- `{f.path}:{f.line}` – {f.message} '{f.name}' (confidence {f.confidence}%)"
            if explanation:
                detail += f" — {explanation}"
            lines.append(detail)
        lines.append("")
    return "\n".join(lines).rstrip() + "\n"


def main(argv: Optional[List[str]] = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "targets",
        nargs="*",
        default=["."],
        help="Paths to scan (default: repo root).",
    )
    parser.add_argument(
        "--root",
        default=Path.cwd(),
        type=Path,
        help="Working directory for running vulture (defaults to current directory)",
    )
    parser.add_argument(
        "--exclude",
        action="append",
        default=[],
        help="Additional directories to exclude (can be used multiple times).",
    )
    parser.add_argument(
        "--json",
        action="store_true",
        help="Emit JSON instead of Markdown.",
    )
    parser.add_argument(
        "--output",
        type=Path,
        help="Optional file path to write the report to.",
    )

    args = parser.parse_args(argv)
    excludes = list(DEFAULT_EXCLUDES)
    excludes.extend(args.exclude)

    output = run_vulture(args.root, args.targets, excludes)
    findings = parse_vulture_output(output)
    categorize(findings)
    report = format_report(findings, as_json=args.json)

    if args.output:
        args.output.write_text(report, encoding="utf-8")
    else:
        print(report)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
