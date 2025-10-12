#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
metro2_audit_multi.py
---------------------
Parse consumer credit report HTML files, normalize personal info, tradelines,
and inquiries, then run a lightweight Metro-2 compliance audit.

This implementation is intentionally self-contained so that JavaScript tooling
can call it via CLI or import and reuse ``parse_credit_report_html``.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence, Tuple

from bs4 import BeautifulSoup

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

DATE_FORMATS: Sequence[str] = ("%m/%d/%Y", "%m/%d/%y", "%Y-%m-%d", "%b %d, %Y", "%B %d, %Y")

FIELD_ALIASES: Dict[str, str] = {
    "account #": "account_number",
    "acct #": "account_number",
    "account number": "account_number",
    "account number:": "account_number",
    "account status": "account_status",
    "account status:": "account_status",
    "account type": "account_type",
    "account type:": "account_type",
    "account type - detail": "account_type_detail",
    "bureau code": "bureau_code",
    "credit limit": "credit_limit",
    "credit limit:": "credit_limit",
    "creditor classification": "creditor_class",
    "date closed": "date_closed",
    "date closed:": "date_closed",
    "date first delinquency": "date_first_delinquency",
    "date of first delinquency": "date_first_delinquency",
    "date of first delinquency:": "date_first_delinquency",
    "dofd": "date_first_delinquency",
    "dofd:": "date_first_delinquency",
    "date last active": "date_last_active",
    "date last payment": "date_last_payment",
    "date of last payment": "date_last_payment",
    "date of last payment:": "date_last_payment",
    "date opened": "date_opened",
    "date opened:": "date_opened",
    "high credit": "high_credit",
    "high credit:": "high_credit",
    "original creditor": "original_creditor",
    "original creditor:": "original_creditor",
    "monthly payment": "monthly_payment",
    "monthly payment:": "monthly_payment",
    "past due": "past_due",
    "past due:": "past_due",
    "past due amount": "past_due",
    "payment history": "payment_history",
    "payment status": "payment_status",
    "payment status:": "payment_status",
    "comments": "comments",
    "comments:": "comments",
    "last reported": "last_reported",
    "last reported:": "last_reported",
    "balance": "balance",
    "balance:": "balance",
}

BUREAUS: Sequence[str] = ("TransUnion", "Experian", "Equifax")


def _strip_text(cell: Optional[Any]) -> str:
    if cell is None:
        return ""
    return cell.get_text(" ", strip=True)


def clean_amount(value: Optional[str]) -> float:
    if not value:
        return 0.0
    try:
        return float(re.sub(r"[^\d.-]", "", value))
    except Exception:
        return 0.0


def parse_date(value: Optional[str]) -> Optional[datetime.date]:
    if not value or not value.strip():
        return None
    for fmt in DATE_FORMATS:
        try:
            return datetime.strptime(value.strip(), fmt).date()
        except Exception:
            continue
    return None


@dataclass
class AuditPayload:
    personal_information: List[Dict[str, Dict[str, str]]]
    personal_mismatches: List[Dict[str, Any]]
    account_history: List[Dict[str, Any]]
    cross_bureau_violations: List[Dict[str, Any]]
    inquiries: List[Dict[str, str]]
    inquiry_violations: List[Dict[str, Any]]


# ---------------------------------------------------------------------------
# Personal information parsing
# ---------------------------------------------------------------------------

def parse_personal_info(soup: BeautifulSoup) -> List[Dict[str, Dict[str, str]]]:
    results: List[Dict[str, Dict[str, str]]] = []
    for table in soup.find_all("table"):
        header = table.find_previous(string=re.compile(r"personal information", re.I))
        if not header:
            continue
        field_map: Dict[str, Dict[str, str]] = {}
        for row in table.find_all("tr"):
            cells = row.find_all("td")
            if len(cells) < 4:
                continue
            label = _strip_text(cells[0])
            tu, exp, eqf = [_strip_text(c) for c in cells[1:4]]
            field_map[label] = {"TransUnion": tu, "Experian": exp, "Equifax": eqf}
        if field_map:
            results.append(field_map)
    return results


def detect_personal_info_mismatches(personal_info: List[Dict[str, Dict[str, str]]]) -> List[Dict[str, Any]]:
    mismatches: List[Dict[str, Any]] = []
    if not personal_info:
        return mismatches
    info = personal_info[0]
    for field, values in info.items():
        vals = {v.strip().lower() for v in values.values() if v and v.strip()}
        if len(vals) > 1:
            mismatches.append(
                {
                    "id": "PERSONAL_INFO_MISMATCH",
                    "field": field,
                    "title": f"{field} differs between bureaus",
                    "values": values,
                }
            )
    return mismatches


# ---------------------------------------------------------------------------
# Tradeline parsing
# ---------------------------------------------------------------------------

def _normalize_field(label: str) -> str:
    cleaned = re.sub(r"[:：]\s*$", "", label.strip()).strip().lower()
    if cleaned in FIELD_ALIASES:
        return FIELD_ALIASES[cleaned]
    cleaned = re.sub(r"[^a-z0-9]+", "_", cleaned)
    return cleaned.strip("_")


def extract_creditor_name(table: Any) -> Optional[str]:
    text_block = table.get_text(" ", strip=True)
    match = re.match(r"([A-Z0-9\s&.\-]+)\s+TransUnion", text_block)
    return match.group(1).strip() if match else None


def parse_account_history(soup: BeautifulSoup) -> List[Dict[str, Any]]:
    tradelines: List[Dict[str, Any]] = []
    for table in soup.find_all("table"):
        header = table.find_previous(string=re.compile(r"account history", re.I))
        if not header:
            continue
        rows = table.find_all("tr")
        if len(rows) < 2:
            continue
        creditor = extract_creditor_name(table) or "Unknown Creditor"
        field_map: Dict[str, Dict[str, str]] = {}
        for row in rows:
            cells = row.find_all("td")
            if len(cells) < 4:
                continue
            label = _strip_text(cells[0])
            tu, exp, eqf = [_strip_text(c) for c in cells[1:4]]
            field_map[label] = {"TransUnion": tu, "Experian": exp, "Equifax": eqf}
        for bureau in BUREAUS:
            tl: Dict[str, Any] = {"creditor_name": creditor, "bureau": bureau}
            for field, values in field_map.items():
                key = _normalize_field(field)
                tl[key] = values.get(bureau, "")
            tradelines.append(tl)
    return tradelines


# ---------------------------------------------------------------------------
# Inquiry parsing
# ---------------------------------------------------------------------------

def parse_inquiries(soup: BeautifulSoup) -> List[Dict[str, str]]:
    inquiries: List[Dict[str, str]] = []
    for table in soup.find_all("table"):
        header = table.find_previous(string=re.compile(r"inquiries", re.I))
        if not header:
            continue
        rows = table.find_all("tr")
        if len(rows) < 2:
            continue
        headers = [_strip_text(th) for th in rows[0].find_all(["th", "td"])]
        if not any("Creditor" in h for h in headers):
            continue
        for row in rows[1:]:
            cells = row.find_all("td")
            if len(cells) < 4:
                continue
            inquiries.append(
                {
                    "creditor_name": _strip_text(cells[0]),
                    "type_of_business": _strip_text(cells[1]),
                    "date_of_inquiry": _strip_text(cells[2]),
                    "credit_bureau": _strip_text(cells[3]),
                }
            )
    return inquiries


# ---------------------------------------------------------------------------
# Audit rules
# ---------------------------------------------------------------------------


def _load_violation_catalog() -> Dict[str, Any]:
    base_dir = Path(__file__).resolve().parent
    repo_root = base_dir.parents[1]
    candidates = [
        repo_root / "metro2" / "metro2Violations.json",
        base_dir / "metro2Violations.json",
        base_dir / "data" / "metro2Violations.json",
        base_dir / "public" / "metro2Violations.json",
    ]
    for path in candidates:
        if path.exists():
            with open(path, encoding="utf-8") as handle:
                return json.load(handle)
    return {}


_VIOLATION_CATALOG: Optional[Dict[str, Any]] = None


def violation_catalog() -> Dict[str, Any]:
    global _VIOLATION_CATALOG
    if _VIOLATION_CATALOG is None:
        _VIOLATION_CATALOG = _load_violation_catalog()
    return _VIOLATION_CATALOG


def _normalize_text(value: Optional[str]) -> str:
    return re.sub(r"\s+", " ", (value or "").strip()).lower()


def _field_exists(value: Optional[str]) -> bool:
    if value is None:
        return False
    if isinstance(value, str):
        normalized = value.strip().lower()
        if normalized in {"", "n/a", "na", "null", "none"}:
            return False
    return bool(value)


def _evaluate_condition(condition: Dict[str, Any], tradeline: Dict[str, Any]) -> bool:
    field = condition.get("field", "")
    value = tradeline.get(field)

    if "exists" in condition:
        exists = _field_exists(value)
        return exists if condition["exists"] else not exists

    if value is None:
        value = ""

    text_value = _normalize_text(str(value))

    if "contains_any" in condition:
        options = [str(opt).lower() for opt in condition["contains_any"]]
        return any(opt in text_value for opt in options)

    if "eq" in condition:
        target = _normalize_text(str(condition["eq"]))
        return text_value == target or target in text_value

    if "neq" in condition:
        target = _normalize_text(str(condition["neq"]))
        return text_value != target

    if "contains" in condition:
        target = _normalize_text(str(condition["contains"]))
        return target in text_value

    numeric_value = clean_amount(str(value))

    if "eq_numeric" in condition:
        return numeric_value == float(condition["eq_numeric"])

    if "gt" in condition:
        return numeric_value > float(condition["gt"])

    if "gte" in condition:
        return numeric_value >= float(condition["gte"])

    if "lt" in condition:
        return numeric_value < float(condition["lt"])

    if "lte" in condition:
        return numeric_value <= float(condition["lte"])

    if "gt_field" in condition:
        other_value = clean_amount(tradeline.get(condition["gt_field"]))
        return numeric_value > other_value

    return False


def _evaluate_rule(rule: Dict[str, Any], tradeline: Dict[str, Any]) -> bool:
    if "all" in rule:
        return all(_evaluate_rule(part, tradeline) for part in rule["all"])
    if "any" in rule:
        return any(_evaluate_rule(part, tradeline) for part in rule["any"])
    if "not" in rule:
        return not _evaluate_rule(rule["not"], tradeline)
    return _evaluate_condition(rule, tradeline)


def _build_violation(rule_id: str, detail: Optional[str] = None) -> Dict[str, Any]:
    catalog = violation_catalog()
    meta = catalog.get(rule_id, {})
    title = meta.get("violation") or rule_id.replace("_", " ").title()
    violation: Dict[str, Any] = {"id": rule_id, "title": title}
    if detail:
        violation["detail"] = detail
    if "severity" in meta:
        violation["severity"] = meta["severity"]
    if "fcraSection" in meta:
        violation["fcraSection"] = meta["fcraSection"]
    return violation


def _apply_catalog_rules(tradeline: Dict[str, Any]) -> List[Dict[str, Any]]:
    violations: List[Dict[str, Any]] = []
    for rule_id, meta in violation_catalog().items():
        scope = str(meta.get("scope") or "tradeline").lower()
        if scope != "tradeline":
            continue
        rule = meta.get("rule")
        if not rule:
            continue
        if _evaluate_rule(rule, tradeline):
            violations.append(_build_violation(rule_id))
    return violations


def _collect_group_field_values(
    group: Sequence[Dict[str, Any]], field: str
) -> Dict[str, Any]:
    values: Dict[str, Any] = {}
    for record in group:
        bureau = record.get("bureau", "?")
        value = record.get(field)
        if _field_exists(value):
            values[bureau] = value
    return values


def _evaluate_group_rule(
    rule: Dict[str, Any], group: Sequence[Dict[str, Any]]
) -> Optional[Dict[str, Any]]:
    field = rule.get("field")
    if not field:
        return None

    rule_type = str(rule.get("type") or "text_mismatch").lower()
    values = _collect_group_field_values(group, field)
    if len(values) <= 1:
        return None

    if rule_type == "numeric_mismatch":
        numeric_values = {
            bureau: clean_amount(str(value)) for bureau, value in values.items()
        }
        numbers = list(numeric_values.values())
        if not numbers:
            return None
        tolerance = float(rule.get("tolerance", 0))
        if max(numbers) - min(numbers) <= tolerance:
            return None
        detail = ", ".join(
            f"{bureau}: ${numeric_values[bureau]:,.2f}" for bureau in sorted(numeric_values)
        )
        return {
            "detail": detail,
            "breakdown": {
                "field": field,
                "values": {bureau: values[bureau] for bureau in sorted(values)},
                "numeric": numeric_values,
            },
        }

    normalized = {
        bureau: _normalize_text(str(value)) for bureau, value in values.items()
    }
    unique_values = {value for value in normalized.values() if value}
    if len(unique_values) <= 1:
        return None

    detail = ", ".join(
        f"{bureau}: {values[bureau]}" for bureau in sorted(values)
    )
    return {
        "detail": detail,
        "breakdown": {
            "field": field,
            "values": {bureau: values[bureau] for bureau in sorted(values)},
        },
    }


def _apply_group_rules(group: Sequence[Dict[str, Any]]) -> List[Dict[str, Any]]:
    violations: List[Dict[str, Any]] = []
    for rule_id, meta in violation_catalog().items():
        scope = str(meta.get("scope") or "tradeline").lower()
        if scope != "group":
            continue
        rule = meta.get("rule")
        if not rule:
            continue
        result = _evaluate_group_rule(rule, group)
        if not result:
            continue
        violation = _build_violation(rule_id, detail=result.get("detail"))
        if "breakdown" in result:
            violation["breakdown"] = result["breakdown"]
        violations.append(violation)
    return violations


def _group_key(tradeline: Dict[str, Any]) -> str:
    creditor = (tradeline.get("creditor_name") or "").strip().lower()
    account = (tradeline.get("account_number") or tradeline.get("accountnumber") or "").strip().lower()
    return "::".join(filter(None, [creditor, account])) or creditor


def run_metro2_audit(tradelines: List[Dict[str, Any]]) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    groups: Dict[str, List[Dict[str, Any]]] = {}
    for tradeline in tradelines:
        key = _group_key(tradeline)
        groups.setdefault(key, []).append(tradeline)

    audited: List[Dict[str, Any]] = []
    cross_bureau_entries: List[Dict[str, Any]] = []

    for group in groups.values():
        for tradeline in group:
            tradeline["violations"] = _apply_catalog_rules(tradeline)
            audited.append(tradeline)

        cross = _apply_group_rules(group)
        if cross:
            base = group[0]
            cross_entry = {
                "creditor_name": base.get("creditor_name"),
                "account_number": base.get("account_number") or base.get("accountnumber"),
                "bureau": "Cross-Bureau",
                "summary": True,
                "group_size": len(group),
                "violations": cross,
            }
            cross_bureau_entries.append(cross_entry)

    audited.extend(cross_bureau_entries)
    return audited, cross_bureau_entries


def detect_tradeline_violations(tradelines: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    audited, _ = run_metro2_audit(tradelines)
    return audited


def detect_inquiry_no_match(inquiries: List[Dict[str, str]], tradelines: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    violations: List[Dict[str, Any]] = []
    tradeline_dates = set()
    for tl in tradelines:
        for field in ("date_opened", "date_last_payment"):
            d = parse_date(tl.get(field))
            if d:
                tradeline_dates.add(d)
    for iq in inquiries:
        iq_date = parse_date(iq.get("date_of_inquiry"))
        if not iq_date:
            continue
        if not any(abs((iq_date - d).days) <= 5 for d in tradeline_dates):
            violations.append(
                {
                    "id": "INQUIRY_NO_MATCH",
                    "title": f"Inquiry on {iq['date_of_inquiry']} not linked to any tradeline",
                    "creditor_name": iq.get("creditor_name"),
                    "bureau": iq.get("credit_bureau"),
                }
            )
    return violations


# ---------------------------------------------------------------------------
# Rendering helpers
# ---------------------------------------------------------------------------

class Color:
    GREEN = "\033[92m"
    RED = "\033[91m"
    YELLOW = "\033[93m"
    CYAN = "\033[96m"
    RESET = "\033[0m"
    BOLD = "\033[1m"


def print_audit_summary(personal_mismatches: Sequence[Dict[str, Any]], tradelines: Sequence[Dict[str, Any]], inquiry_violations: Sequence[Dict[str, Any]]) -> None:
    print(f"\n{Color.BOLD}{Color.CYAN}📋 METRO-2 COMPLIANCE AUDIT SUMMARY{Color.RESET}")
    print("-" * 60)
    if personal_mismatches:
        print(f"\n{Color.BOLD}{Color.YELLOW}🧍 PERSONAL INFORMATION MISMATCHES{Color.RESET}")
        for mismatch in personal_mismatches:
            print(f"  {Color.RED}❌ {mismatch['field']}: {mismatch['title']}{Color.RESET}")
            for bureau, value in mismatch["values"].items():
                print(f"     {bureau}: {value}")
    else:
        print(f"{Color.GREEN}✅ Personal information consistent across bureaus{Color.RESET}")
    for tl in tradelines:
        creditor = tl.get("creditor_name", "UNKNOWN")
        bureau = tl.get("bureau", "?")
        violations = tl.get("violations", [])
        print(f"\n{Color.BOLD}{Color.YELLOW}{creditor}{Color.RESET} [{bureau}]")
        print(f"  Balance: {tl.get('balance', '')} | Status: {tl.get('account_status', '')}")
        if not violations:
            print(f"  {Color.GREEN}✅ No tradeline violations{Color.RESET}")
        else:
            for violation in violations:
                print(f"  {Color.RED}❌ {violation['id']}: {violation['title']}{Color.RESET}")
    if inquiry_violations:
        print(f"\n{Color.BOLD}{Color.YELLOW}🔍 INQUIRY ISSUES{Color.RESET}")
        for violation in inquiry_violations:
            print(f"  {Color.RED}❌ {violation['creditor_name']} [{violation['bureau']}] - {violation['title']}{Color.RESET}")
    else:
        print(f"\n{Color.GREEN}✅ All inquiries correspond to valid tradeline dates{Color.RESET}")
    print("\n")


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def parse_credit_report_html(html_content: str) -> AuditPayload:
    soup = BeautifulSoup(html_content, "html.parser")
    personal = parse_personal_info(soup)
    tradelines_raw = parse_account_history(soup)
    tradelines, cross_bureau = run_metro2_audit(tradelines_raw)
    inquiries = parse_inquiries(soup)
    personal_mismatches = detect_personal_info_mismatches(personal)
    inquiry_violations = detect_inquiry_no_match(inquiries, tradelines)
    return AuditPayload(
        personal_information=personal,
        personal_mismatches=personal_mismatches,
        account_history=tradelines,
        cross_bureau_violations=cross_bureau,
        inquiries=inquiries,
        inquiry_violations=inquiry_violations,
    )


def parse_credit_report_file(path: str) -> AuditPayload:
    with open(path, "r", encoding="utf-8") as handle:
        return parse_credit_report_html(handle.read())


# ---------------------------------------------------------------------------
# CLI entrypoint
# ---------------------------------------------------------------------------

def main(argv: Optional[Sequence[str]] = None) -> int:
    parser = argparse.ArgumentParser(description="Parse and audit consumer credit report HTML files.")
    parser.add_argument("input", nargs="?", help="Path to the HTML report")
    parser.add_argument("-i", "--input", dest="input_cli", help="Path to the HTML report (legacy flag)")
    parser.add_argument("-o", "--output", dest="output", help="Optional path to write JSON results")
    parser.add_argument("--json-only", action="store_true", help="Suppress CLI summary and emit JSON only")
    args = parser.parse_args(argv)
    html_path = args.input_cli or args.input
    if not html_path:
        parser.error("Missing input HTML file")
    payload = parse_credit_report_file(html_path)
    data = {
        "personal_information": payload.personal_information,
        "personal_mismatches": payload.personal_mismatches,
        "account_history": payload.account_history,
        "cross_bureau_violations": payload.cross_bureau_violations,
        "inquiries": payload.inquiries,
        "inquiry_violations": payload.inquiry_violations,
    }
    json_blob = json.dumps(data, indent=2, ensure_ascii=False)
    if args.output:
        Path(args.output).write_text(json_blob, encoding="utf-8")
    if not args.json_only:
        print_audit_summary(payload.personal_mismatches, payload.account_history, payload.inquiry_violations)
        if not args.output:
            print(json_blob)
    elif not args.output:
        print(json_blob)
    return 0


if __name__ == "__main__":
    sys.exit(main())
