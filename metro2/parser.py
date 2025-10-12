#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
parser_audit_v2.py
------------------
Parses consumer report HTML → Personal Info, Tradelines, Inquiries
+ runs Metro-2 audits and cross-section rule detection.
"""

from __future__ import annotations

import json
import re
import sys
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Sequence, Tuple, Union

from bs4 import BeautifulSoup, Tag


FIELD_KEY_ALIASES = {
    "date_of_last_payment": "date_last_payment",
    "date_last_payment": "date_last_payment",
    "date_of_first_delinquency": "date_first_delinquency",
    "date_first_delinquency": "date_first_delinquency",
    "dofd": "date_first_delinquency",
}


# ───────────── Helpers ─────────────
def text(cell: Optional[Any]) -> str:
    return cell.get_text(" ", strip=True) if cell is not None else ""


def clean_amount(value: Optional[str]) -> float:
    if not value:
        return 0.0
    try:
        return float(re.sub(r"[^\d.-]", "", value))
    except Exception:
        return 0.0


def parse_date(date_str: Optional[str]) -> Optional[datetime.date]:
    """Try to normalize multiple date formats"""
    if not date_str or not date_str.strip():
        return None
    for fmt in ("%m/%d/%Y", "%m/%d/%y", "%Y-%m-%d"):
        try:
            return datetime.strptime(date_str.strip(), fmt).date()
        except Exception:
            continue
    return None


# ───────────── Colors ─────────────
class Color:
    GREEN = "\033[92m"
    RED = "\033[91m"
    YELLOW = "\033[93m"
    CYAN = "\033[96m"
    RESET = "\033[0m"
    BOLD = "\033[1m"


# ───────────── Personal Info ─────────────
def parse_personal_info(soup: BeautifulSoup) -> List[Dict[str, Dict[str, str]]]:
    data: List[Dict[str, Dict[str, str]]] = []
    for table in soup.find_all("table"):
        header = table.find_previous(string=re.compile(r"Personal Information", re.I))
        if not header:
            continue
        field_map: Dict[str, Dict[str, str]] = {}
        for row in table.find_all("tr"):
            cells = row.find_all("td")
            if len(cells) < 4:
                continue
            label = text(cells[0])
            tu, exp, eqf = [text(c) for c in cells[1:4]]
            field_map[label] = {"TransUnion": tu, "Experian": exp, "Equifax": eqf}
        if field_map:
            data.append(field_map)
    return data


def detect_personal_info_mismatches(personal_info: List[Dict[str, Dict[str, str]]]) -> List[Dict[str, Any]]:
    mismatches: List[Dict[str, Any]] = []
    if not personal_info:
        return mismatches

    info = personal_info[0]
    for field, values in info.items():
        vals = {v.strip().lower() for v in values.values() if v.strip()}
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


# ───────────── Account History ─────────────
def normalize_field_key(label: str) -> str:
    normalized = re.sub(r"[^a-z0-9]+", "_", label.lower()).strip("_")
    if not normalized:
        return ""
    return FIELD_KEY_ALIASES.get(normalized, normalized)


def parse_account_history(soup: BeautifulSoup) -> List[Dict[str, Any]]:
    tradelines: List[Dict[str, Any]] = []
    for table in soup.find_all("table"):
        header = table.find_previous(string=re.compile(r"Account History", re.I))
        if not header:
            continue
        rows = table.find_all("tr")
        if len(rows) < 3:
            continue

        creditor = extract_creditor_name(table)
        field_map: Dict[str, Dict[str, str]] = {}
        for row in rows:
            cells = row.find_all("td")
            if len(cells) < 4:
                continue
            label = text(cells[0])
            tu, exp, eqf = [text(c) for c in cells[1:4]]
            field_map[label] = {"TransUnion": tu, "Experian": exp, "Equifax": eqf}

        for bureau in ["TransUnion", "Experian", "Equifax"]:
            tl: Dict[str, Any] = {"creditor_name": creditor, "bureau": bureau}
            for field, values in field_map.items():
                key = normalize_field_key(field)
                if not key:
                    continue
                tl[key] = values.get(bureau)
            tradelines.append(tl)
    return tradelines


def extract_creditor_name(table: Any) -> Optional[str]:
    text_block = table.get_text(" ", strip=True)
    match = re.match(r"([A-Z0-9\s&.\-]+)\s+TransUnion", text_block)
    return match.group(1).strip() if match else None


# ───────────── Inquiries ─────────────
def parse_inquiries(soup: BeautifulSoup) -> List[Dict[str, str]]:
    inquiries: List[Dict[str, str]] = []
    for table in soup.find_all("table"):
        header = table.find_previous(string=re.compile(r"Inquiries", re.I))
        if not header:
            continue
        rows = table.find_all("tr")
        if len(rows) < 2:
            continue

        headers = [text(th) for th in rows[0].find_all(["th", "td"])]
        if not any("Creditor Name" in h for h in headers):
            continue

        for row in rows[1:]:
            cells = row.find_all("td")
            if len(cells) < 4:
                continue
            inquiries.append(
                {
                    "creditor_name": text(cells[0]),
                    "type_of_business": text(cells[1]),
                    "date_of_inquiry": text(cells[2]),
                    "credit_bureau": text(cells[3]),
                }
            )
    return inquiries


def detect_inquiry_no_match(
    inquiries: Iterable[Dict[str, Any]], tradelines: Iterable[Dict[str, Any]]
) -> List[Dict[str, Any]]:
    """Check if inquiry date matches any tradeline open/payment date"""
    violations: List[Dict[str, Any]] = []
    tradeline_dates = set()
    for tl in tradelines:
        for field in ["date_opened", "date_last_payment"]:
            d = parse_date(tl.get(field))
            if d:
                tradeline_dates.add(d)

    for iq in inquiries:
        iq_date = parse_date(iq.get("date_of_inquiry"))
        if not iq_date:
            continue
        # allow +/- 5 days tolerance
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


def _load_violation_catalog() -> Dict[str, Any]:
    candidates = [
        Path(__file__).with_name("metro2Violations.json"),
        Path(__file__).parent.parent / "data" / "metro2Violations.json",
        Path(__file__).parent.parent / "public" / "metro2Violations.json",
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
    violation: Dict[str, Any] = {
        "id": rule_id,
        "title": title,
    }
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
        rule = meta.get("rule")
        if not rule:
            continue
        if _evaluate_rule(rule, tradeline):
            violations.append(_build_violation(rule_id))
    return violations


def _group_key(tradeline: Dict[str, Any]) -> str:
    creditor = (tradeline.get("creditor_name") or "").strip().lower()
    account = (tradeline.get("account_number") or tradeline.get("accountnumber") or "").strip().lower()
    return "::".join(filter(None, [creditor, account])) or creditor


def _summarize_cross_bureau(
    group: List[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    violations: List[Dict[str, Any]] = []

    status_map = {
        record.get("bureau", "?"): _normalize_text(record.get("account_status"))
        for record in group
        if _field_exists(record.get("account_status"))
    }
    unique_statuses = {value for value in status_map.values() if value}
    if len(unique_statuses) > 1:
        detail = ", ".join(f"{bureau}: {status_map[bureau]}" for bureau in sorted(status_map))
        violations.append(_build_violation("X_BUREAU_STATUS_MISMATCH", detail=detail))

    balance_map = {
        record.get("bureau", "?"): clean_amount(record.get("balance"))
        for record in group
        if _field_exists(record.get("balance"))
    }
    unique_balances = {value for value in balance_map.values()}
    if len(unique_balances) > 1:
        detail = ", ".join(
            f"{bureau}: ${balance_map[bureau]:,.2f}" for bureau in sorted(balance_map)
        )
        violations.append(_build_violation("X_BUREAU_BALANCE_MISMATCH", detail=detail))

    return violations


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

        cross = _summarize_cross_bureau(group)
        if cross:
            base = group[0]
            cross_entry = {
                "creditor_name": base.get("creditor_name"),
                "account_number": base.get("account_number") or base.get("accountnumber"),
                "bureau": "Cross-Bureau",
                "summary": True,
                "violations": cross,
            }
            cross_bureau_entries.append(cross_entry)

    audited.extend(cross_bureau_entries)
    return audited, cross_bureau_entries


# ───────────── CLI Printer ─────────────
def print_audit_summary(
    personal_mismatches: List[Dict[str, Any]],
    tradelines: List[Dict[str, Any]],
    inquiry_violations: List[Dict[str, Any]],
) -> None:
    print(f"\n{Color.BOLD}{Color.CYAN}📋 METRO-2 COMPLIANCE AUDIT SUMMARY{Color.RESET}")
    print("-" * 60)

    # Personal Info mismatches
    if personal_mismatches:
        print(f"\n{Color.BOLD}{Color.YELLOW}🧍 PERSONAL INFORMATION MISMATCHES{Color.RESET}")
        for mismatch in personal_mismatches:
            print(f"  {Color.RED}❌ {mismatch['field']}: {mismatch['title']}{Color.RESET}")
            for bureau, value in mismatch["values"].items():
                print(f"     {bureau}: {value}")
    else:
        print(f"{Color.GREEN}✅ Personal information consistent across bureaus{Color.RESET}")

    # Tradeline violations
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

    # Inquiry audit
    if inquiry_violations:
        print(f"\n{Color.BOLD}{Color.YELLOW}🔍 INQUIRY ISSUES{Color.RESET}")
        for violation in inquiry_violations:
            print(
                f"  {Color.RED}❌ {violation['creditor_name']} [{violation['bureau']}] - {violation['title']}{Color.RESET}"
            )
    else:
        print(f"\n{Color.GREEN}✅ All inquiries correspond to valid tradeline dates{Color.RESET}")

    print("\n")


def parse_credit_report_html(doc: Union[str, BeautifulSoup, Tag]) -> Dict[str, Any]:
    """Parse the provided HTML document and return structured audit data."""
    if isinstance(doc, BeautifulSoup):
        soup = doc
    elif isinstance(doc, Tag):
        soup = BeautifulSoup(str(doc), "html.parser")
    else:
        soup = BeautifulSoup(doc or "", "html.parser")

    personal = parse_personal_info(soup)
    tradelines_raw = parse_account_history(soup)
    tradelines, cross_bureau = run_metro2_audit(tradelines_raw)
    inquiries = parse_inquiries(soup)

    personal_mismatches = detect_personal_info_mismatches(personal)
    inquiry_violations = detect_inquiry_no_match(inquiries, tradelines)

    return {
        "personal_information": personal,
        "personal_mismatches": personal_mismatches,
        "account_history": tradelines,
        "cross_bureau_violations": cross_bureau,
        "inquiries": inquiries,
        "inquiry_violations": inquiry_violations,
    }


# ───────────── Main ─────────────
def main(argv: Optional[Sequence[str]] = None) -> int:
    if argv is None:
        argv = sys.argv[1:]

    if len(argv) < 1:
        print("Usage: python3 parser_audit_v2.py report.html")
        return 1

    html_path = argv[0]
    with open(html_path, encoding="utf-8") as handle:
        soup = BeautifulSoup(handle.read(), "html.parser")

    audit_data = parse_credit_report_html(soup)

    print_audit_summary(
        audit_data["personal_mismatches"],
        audit_data["account_history"],
        audit_data["inquiry_violations"],
    )

    print(json.dumps(audit_data, indent=2, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())


__all__ = ["parse_credit_report_html", "run_metro2_audit", "main"]
