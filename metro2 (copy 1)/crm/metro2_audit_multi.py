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
from typing import Any, Dict, List, Optional, Sequence

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
    "date first delinquency": "date_of_first_delinquency",
    "date of first delinquency": "date_of_first_delinquency",
    "date of first delinquency:": "date_of_first_delinquency",
    "dofd": "date_of_first_delinquency",
    "dofd:": "date_of_first_delinquency",
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

def detect_tradeline_violations(tradelines: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    grouped: Dict[str, List[Dict[str, Any]]] = {}
    for tl in tradelines:
        key = (tl.get("creditor_name") or "").strip().lower()
        grouped.setdefault(key, []).append(tl)
    for creditor, records in grouped.items():
        balances = {clean_amount(r.get("balance")) for r in records if r.get("balance")}
        statuses = {(r.get("account_status") or "").lower() for r in records if r.get("account_status")}
        for tl in records:
            violations: List[Dict[str, Any]] = []
            status = (tl.get("account_status") or "").lower()
            balance = clean_amount(tl.get("balance"))
            past_due = clean_amount(tl.get("past_due"))
            high_credit = clean_amount(tl.get("high_credit"))
            limit = clean_amount(tl.get("credit_limit"))
            if re.search(r"charge|collection", status) and not tl.get("date_of_first_delinquency"):
                violations.append({"id": "MISSING_DOFD", "title": "Charge-off/Collection missing DOFD"})
            if "current" in status and past_due > 0:
                violations.append({"id": "PAST_DUE_CURRENT", "title": "Current account shows past due > 0"})
            if not tl.get("date_opened"):
                violations.append({"id": "MISSING_OPEN_DATE", "title": "Missing Date Opened"})
            if len(balances) > 1:
                violations.append({"id": "BALANCE_MISMATCH", "title": "Balance mismatch across bureaus"})
            if len(statuses) > 1:
                violations.append({"id": "STATUS_MISMATCH", "title": "Status mismatch across bureaus"})
            if "open" in status and balance == 0:
                violations.append({"id": "ZERO_BALANCE_OPEN", "title": "Open account shows $0 balance"})
            if limit and high_credit and high_credit > limit:
                violations.append({"id": "HIGH_BALANCE_GT_LIMIT", "title": "High Credit exceeds Credit Limit"})
            tl["violations"] = violations
    return tradelines


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
    tradelines = detect_tradeline_violations(parse_account_history(soup))
    inquiries = parse_inquiries(soup)
    personal_mismatches = detect_personal_info_mismatches(personal)
    inquiry_violations = detect_inquiry_no_match(inquiries, tradelines)
    return AuditPayload(
        personal_information=personal,
        personal_mismatches=personal_mismatches,
        account_history=tradelines,
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
