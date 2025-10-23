#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Metro-2 HTML parser that feeds the audit rule engine."""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path
from typing import Any, Dict, List, MutableMapping, Optional, Sequence, Union

from bs4 import BeautifulSoup, Tag

from .audit_rules import build_cli_report, run_all_audits


# ───────────── Helpers ─────────────
def text(cell: Optional[Any]) -> str:
    return cell.get_text(" ", strip=True) if cell is not None else ""


def _ensure_soup(doc: Union[str, BeautifulSoup, Tag]) -> BeautifulSoup:
    """Normalize inputs into a :class:`BeautifulSoup` document."""

    if isinstance(doc, BeautifulSoup):
        return doc
    if isinstance(doc, Tag):
        return BeautifulSoup(str(doc), "html.parser")
    return BeautifulSoup(doc or "", "html.parser")


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


def parse_negative_item_cards(doc: Union[str, BeautifulSoup, Tag]) -> Dict[str, Any]:
    """Return normalized tradelines + inquiries for negative item cards."""

    soup = _ensure_soup(doc)
    tradelines = parse_account_history(soup)
    inquiries = parse_inquiries(soup)

    return {
        "accounts": tradelines,
        "inquiries": inquiries,
    }


def parse_client_portal_data(doc: Union[str, BeautifulSoup, Tag]) -> Dict[str, Any]:
    """Return structured data tailored for the client portal experience."""

    soup = _ensure_soup(doc)
    payload = dict(parse_negative_item_cards(soup))
    payload["personal_information"] = parse_personal_info(soup)
    return payload


def parse_credit_report_html(doc: Union[str, BeautifulSoup, Tag]) -> Dict[str, Any]:
    """Backward-compatible wrapper that mirrors :func:`parse_client_portal_data`."""

    return parse_client_portal_data(doc)


def parse_html_report(source: Union[str, Path, BeautifulSoup, Tag]) -> Dict[str, Any]:
    """Load an HTML file (path or markup) and return structured data."""
    if isinstance(source, (BeautifulSoup, Tag)):
        return parse_client_portal_data(source)

    if isinstance(source, (str, Path)) and Path(source).exists():
        html = Path(source).read_text(encoding="utf-8")
        return parse_client_portal_data(html)

    # Treat fallback as raw HTML string
    return parse_client_portal_data(str(source) if source is not None else "")


def detect_tradeline_violations(
    tradelines: Sequence[MutableMapping[str, Any]]
) -> List[MutableMapping[str, Any]]:
    """Compatibility wrapper for legacy callers expecting tradeline-only audits."""

    payload: Dict[str, Any] = {
        "accounts": [dict(tl) for tl in tradelines],
        "inquiries": [],
        "personal_information": {},
    }
    audited = run_all_audits(payload)
    return list(audited.get("accounts", []))

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

    parsed = parse_client_portal_data(soup)
    audited = run_all_audits(parsed)

    print(build_cli_report(audited))
    print(json.dumps(audited, indent=2, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())


__all__ = [
    "parse_negative_item_cards",
    "parse_client_portal_data",
    "parse_html_report",
    "parse_credit_report_html",
    "detect_tradeline_violations",
    "main",
]
