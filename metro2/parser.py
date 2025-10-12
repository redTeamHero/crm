#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
parser_audit_v2.py
------------------
Parses consumer report HTML → Personal Info, Tradelines, Inquiries
+ runs Metro-2 audits and cross-section rule detection.
"""

from __future__ import annotations

import re
import sys
import json
from datetime import datetime
from typing import Any, Dict, Iterable, List, Optional, Sequence, Tuple, Union

from bs4 import BeautifulSoup, Tag


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
                key = field.lower().replace(" ", "_").replace(":", "")
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


# ───────────── Metro-2 Audit ─────────────
def detect_tradeline_violations(tradelines: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    groups: Dict[str, List[Dict[str, Any]]] = {}
    for tl in tradelines:
        key = (tl.get("creditor_name") or "").strip().lower()
        groups.setdefault(key, []).append(tl)

    for creditor, records in groups.items():
        balances = {clean_amount(r.get("balance")) for r in records if r.get("balance")}
        statuses = {
            (r.get("account_status") or "").lower()
            for r in records
            if r.get("account_status")
        }

        for tl in records:
            violations: List[Dict[str, str]] = []
            status = (tl.get("account_status") or "").lower()
            balance = clean_amount(tl.get("balance"))
            past_due = clean_amount(tl.get("past_due"))
            high_credit = clean_amount(tl.get("high_credit"))
            limit = clean_amount(tl.get("credit_limit"))

            if re.search(r"charge|collection", status) and not tl.get("date_of_first_delinquency"):
                violations.append(
                    {"id": "MISSING_DOFD", "title": "Charge-off/Collection missing DOFD"}
                )

            if "current" in status and past_due > 0:
                violations.append(
                    {"id": "PAST_DUE_CURRENT", "title": "Current account shows past due > 0"}
                )

            if not tl.get("date_opened"):
                violations.append({"id": "MISSING_OPEN_DATE", "title": "Missing Date Opened"})

            if len(balances) > 1:
                violations.append(
                    {"id": "BALANCE_MISMATCH", "title": "Balance mismatch across bureaus"}
                )

            if len(statuses) > 1:
                violations.append(
                    {"id": "STATUS_MISMATCH", "title": "Status mismatch across bureaus"}
                )

            if "open" in status and balance == 0:
                violations.append(
                    {"id": "ZERO_BALANCE_OPEN", "title": "Open account shows $0 balance"}
                )

            if limit and high_credit and high_credit > limit:
                violations.append(
                    {
                        "id": "HIGH_BALANCE_GT_LIMIT",
                        "title": "High Credit exceeds Credit Limit",
                    }
                )

            tl["violations"] = violations
    return tradelines


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
    tradelines = detect_tradeline_violations(parse_account_history(soup))
    inquiries = parse_inquiries(soup)

    personal_mismatches = detect_personal_info_mismatches(personal)
    inquiry_violations = detect_inquiry_no_match(inquiries, tradelines)

    return {
        "personal_information": personal,
        "personal_mismatches": personal_mismatches,
        "account_history": tradelines,
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


__all__ = ["parse_credit_report_html", "main"]
