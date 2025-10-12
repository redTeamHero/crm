#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Metro-2 HTML parser that feeds the audit rule engine."""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence, Union

from bs4 import BeautifulSoup, Tag

from audit_rules import build_cli_report, run_all_audits


# ───────────── Helpers ─────────────
def text(cell: Optional[Any]) -> str:
    return cell.get_text(" ", strip=True) if cell is not None else ""


# ───────────── Personal Info ─────────────
def parse_personal_info(soup: BeautifulSoup) -> Dict[str, Dict[str, str]]:
    bureaus = ["TransUnion", "Experian", "Equifax"]
    info: Dict[str, Dict[str, str]] = {bureau: {} for bureau in bureaus}

    for table in soup.find_all("table"):
        header = table.find_previous(string=re.compile(r"Personal Information", re.I))
        if not header:
            continue
        for row in table.find_all("tr"):
            cells = row.find_all("td")
            if len(cells) < 4:
                continue
            label = text(cells[0])
            normalized = re.sub(r"[^a-z0-9]+", "_", label.strip().lower()).strip("_")
            for bureau, cell in zip(bureaus, cells[1:4]):
                value = text(cell)
                if not value:
                    continue
                info[bureau][normalized] = value
                # Add friendly aliases for common fields
                lowered = normalized.lower()
                if "name" in lowered:
                    info[bureau].setdefault("name", value)
                if "address" in lowered:
                    info[bureau].setdefault("address", value)
    return info


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
            if "account_number" in tl:
                tl.setdefault("account_#", tl.get("account_number"))
            if "date_last_payment" in tl and "date_of_last_payment" not in tl:
                tl["date_of_last_payment"] = tl["date_last_payment"]
            if "date_of_first_delinquency" not in tl and "date_first_delinquency" in tl:
                tl["date_of_first_delinquency"] = tl["date_first_delinquency"]
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


def parse_credit_report_html(doc: Union[str, BeautifulSoup, Tag]) -> Dict[str, Any]:
    """Parse the provided HTML document into the schema expected by the audits."""
    if isinstance(doc, BeautifulSoup):
        soup = doc
    elif isinstance(doc, Tag):
        soup = BeautifulSoup(str(doc), "html.parser")
    else:
        soup = BeautifulSoup(doc or "", "html.parser")

    personal = parse_personal_info(soup)
    tradelines = parse_account_history(soup)
    inquiries = parse_inquiries(soup)

    return {
        "personal_information": personal,
        "accounts": tradelines,
        "inquiries": inquiries,
    }


def parse_html_report(source: Union[str, Path, BeautifulSoup, Tag]) -> Dict[str, Any]:
    """Load an HTML file (path or markup) and return structured data."""
    if isinstance(source, (BeautifulSoup, Tag)):
        return parse_credit_report_html(source)

    if isinstance(source, (str, Path)) and Path(source).exists():
        html = Path(source).read_text(encoding="utf-8")
        return parse_credit_report_html(html)

    # Treat fallback as raw HTML string
    return parse_credit_report_html(str(source) if source is not None else "")

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

    parsed = parse_credit_report_html(soup)
    audited = run_all_audits(parsed)

    print(build_cli_report(audited))
    print(json.dumps(audited, indent=2, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())


__all__ = ["parse_html_report", "parse_credit_report_html", "main"]
