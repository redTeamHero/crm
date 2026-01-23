#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Metro-2 HTML parser that feeds the audit rule engine."""

from __future__ import annotations

import json
import re
import subprocess
import sys
from pathlib import Path
from typing import Any, Callable, Dict, List, MutableMapping, Optional, Sequence, Tuple, Union

from bs4 import BeautifulSoup, Tag

from .audit_rules import build_cli_report, run_all_audits
from .pdf_parser import parse_credit_report_pdf
from .report_adapters import ReportAdapterFactory

ALL_BUREAUS: Tuple[str, ...] = ("TransUnion", "Experian", "Equifax")
NODE_BRIDGE = Path(__file__).with_name("node_parser_bridge.mjs")


# ───────────── Shared helper utilities ─────────────
def text(cell: Optional[Any]) -> str:
    return cell.get_text(" ", strip=True) if cell is not None else ""


def _coerce_html_inputs(
    doc: Union[str, Path, BeautifulSoup, Tag, None]
) -> Tuple[str, Callable[[], BeautifulSoup]]:
    if isinstance(doc, BeautifulSoup):
        html = str(doc)
        return html, lambda: doc
    if isinstance(doc, Tag):
        markup = str(doc)
        return markup, lambda: BeautifulSoup(markup, "html.parser")
    if isinstance(doc, Path):
        html = doc.read_text(encoding="utf-8")
        return html, lambda: BeautifulSoup(html, "html.parser")
    if isinstance(doc, str):
        stripped = doc.strip()
        if "<" in stripped and ">" in stripped:
            return doc, lambda: BeautifulSoup(doc, "html.parser")
        candidate = Path(doc)
        if candidate.exists():
            html = candidate.read_text(encoding="utf-8")
            return html, lambda: BeautifulSoup(html, "html.parser")
        return doc, lambda: BeautifulSoup(doc, "html.parser")
    html = "" if doc is None else str(doc)
    return html, lambda: BeautifulSoup(html, "html.parser")


def _call_js_parser(html: str) -> Dict[str, Any]:
    if not html or not NODE_BRIDGE.exists():
        return {}

    try:
        completed = subprocess.run(
            ["node", str(NODE_BRIDGE)],
            input=html.encode("utf-8"),
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            check=True,
        )
    except (OSError, subprocess.CalledProcessError):
        return {}

    try:
        payload = json.loads(completed.stdout.decode("utf-8") or "{}")
        return payload if isinstance(payload, dict) else {}
    except json.JSONDecodeError:
        return {}


def _payload_has_data(payload: Dict[str, Any]) -> bool:
    if not isinstance(payload, dict):
        return False
    return any(
        payload.get(key)
        for key in (
            "tradelines",
            "account_history",
            "inquiries",
            "inquiry_details",
            "personal_information",
            "personalInfo",
        )
    )


def _flatten_tradelines(tradelines: Optional[List[Dict[str, Any]]]) -> List[Dict[str, Any]]:
    flattened: List[Dict[str, Any]] = []
    for entry in tradelines or []:
        if not isinstance(entry, dict):
            continue
        per_bureau = entry.get("per_bureau") or {}
        meta = entry.get("meta") or {}
        for bureau, data in per_bureau.items():
            if not isinstance(data, dict):
                continue
            record = {k: v for k, v in data.items()}
            record["bureau"] = bureau
            creditor = (
                record.get("creditor_name")
                or record.get("creditor")
                or meta.get("creditor")
            )
            if creditor:
                record["creditor_name"] = creditor
            account_number = record.get("account_number") or record.get("accountNumber")
            if account_number:
                record["account_number"] = account_number
                record.setdefault("account_#", account_number)
            if "date_last_payment" in record and "date_of_last_payment" not in record:
                record["date_of_last_payment"] = record["date_last_payment"]
            if (
                "date_first_delinquency" in record
                and "date_of_first_delinquency" not in record
            ):
                record["date_of_first_delinquency"] = record["date_first_delinquency"]
            violations = [
                dict(v)
                for v in entry.get("violations", [])
                if isinstance(v, dict) and v.get("bureau") == bureau
            ]
            if violations:
                record["violations"] = violations
            flattened.append(record)
    return flattened


def _normalize_inquiries(payload: Dict[str, Any]) -> List[Dict[str, str]]:
    details = payload.get("inquiry_details")
    normalized: List[Dict[str, str]] = []
    if isinstance(details, list) and details:
        for entry in details:
            if not isinstance(entry, dict):
                continue
            normalized.append(
                {
                    "creditor_name": str(entry.get("creditor_name") or entry.get("creditor") or ""),
                    "type_of_business": str(entry.get("type_of_business") or entry.get("industry") or ""),
                    "date_of_inquiry": str(entry.get("date_of_inquiry") or entry.get("date") or ""),
                    "credit_bureau": str(entry.get("credit_bureau") or entry.get("bureau") or ""),
                }
            )
        return normalized

    for entry in payload.get("inquiries", []) or []:
        if not isinstance(entry, dict):
            continue
        normalized.append(
            {
                "creditor_name": str(entry.get("creditor") or ""),
                "type_of_business": str(entry.get("industry") or ""),
                "date_of_inquiry": str(entry.get("date") or ""),
                "credit_bureau": str(entry.get("bureau") or ""),
            }
        )
    return normalized


def _normalize_personal_info(payload: Dict[str, Any]) -> Dict[str, Dict[str, Any]]:
    personal = payload.get("personalInfo")
    if isinstance(personal, dict) and personal:
        return {
            bureau: dict(values) if isinstance(values, dict) else {"raw": values}
            for bureau, values in personal.items()
        }
    raw = payload.get("personal_information")
    if isinstance(raw, dict) and raw:
        return {
            bureau: dict(values) if isinstance(values, dict) else {"raw": values}
            for bureau, values in raw.items()
        }
    return {}


def _parse_with_bridge(
    doc: Union[str, Path, BeautifulSoup, Tag, None],
    include_personal: bool = False,
) -> Dict[str, Any]:
    html, soup_factory = _coerce_html_inputs(doc)
    payload = _call_js_parser(html)
    soup: Optional[BeautifulSoup] = None

    if _payload_has_data(payload):
        accounts = _flatten_tradelines(payload.get("tradelines"))
        if not accounts:
            soup = soup_factory()
            accounts = _fallback_parse_account_history(soup)

        inquiries = _normalize_inquiries(payload)
        if not inquiries:
            soup = soup or soup_factory()
            inquiries = _fallback_parse_inquiries(soup)

        result: Dict[str, Any] = {
            "accounts": accounts,
            "inquiries": inquiries,
        }
        if include_personal:
            personal = _normalize_personal_info(payload)
            if not personal:
                soup = soup or soup_factory()
                personal = _fallback_parse_personal_info(soup)
            if personal:
                result["personal_information"] = personal
            personal_cards = payload.get("personalInfo")
            if isinstance(personal_cards, dict) and personal_cards:
                result["personalInfo"] = personal_cards
        return run_all_audits(result)

    soup = soup_factory()
    result = {
        "accounts": _fallback_parse_account_history(soup),
        "inquiries": _fallback_parse_inquiries(soup),
    }
    if include_personal:
        result["personal_information"] = _fallback_parse_personal_info(soup)
    return run_all_audits(result)


# ───────────── Fallback BeautifulSoup parsers ─────────────
def _fallback_parse_personal_info(soup: BeautifulSoup) -> Dict[str, Dict[str, str]]:
    info: Dict[str, Dict[str, str]] = {bureau: {} for bureau in ALL_BUREAUS}

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
            for bureau, cell in zip(ALL_BUREAUS, cells[1:4]):
                value = text(cell)
                if not value:
                    continue
                info[bureau][normalized] = value
                lowered = normalized.lower()
                if "name" in lowered:
                    info[bureau].setdefault("name", value)
                if "address" in lowered:
                    info[bureau].setdefault("address", value)
    return info


def _fallback_parse_account_history(soup: BeautifulSoup) -> List[Dict[str, Any]]:
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
            field_map[label] = {
                "TransUnion": tu,
                "Experian": exp,
                "Equifax": eqf,
            }

        for bureau in ALL_BUREAUS:
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


def _fallback_parse_inquiries(soup: BeautifulSoup) -> List[Dict[str, str]]:
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


# ───────────── Public API ─────────────
def _parse_report(
    doc: Union[str, Path, BeautifulSoup, Tag, None],
    include_personal: bool,
) -> Dict[str, Any]:
    factory = ReportAdapterFactory(
        html_parser=lambda source: _parse_with_bridge(source, include_personal=include_personal),
        pdf_parser=parse_credit_report_pdf,
    )
    adapter = factory.adapter_for(doc)
    return adapter.parse(doc)


def parse_negative_item_cards(doc: Union[str, Path, BeautifulSoup, Tag, None]) -> Dict[str, Any]:
    """Return normalized tradelines + inquiries for negative item cards."""

    parsed = _parse_report(doc, include_personal=False)
    return {
        "accounts": parsed.get("accounts", []),
        "inquiries": parsed.get("inquiries", []),
    }


def parse_client_portal_data(doc: Union[str, Path, BeautifulSoup, Tag, None]) -> Dict[str, Any]:
    """Return structured data tailored for the client portal experience."""

    return _parse_report(doc, include_personal=True)


def parse_credit_report_html(doc: Union[str, Path, BeautifulSoup, Tag, None]) -> Dict[str, Any]:
    """Backward-compatible wrapper that mirrors :func:`parse_client_portal_data`."""

    return parse_client_portal_data(doc)


def parse_html_report(source: Union[str, Path, BeautifulSoup, Tag]) -> Dict[str, Any]:
    """Load an HTML file (path or markup) and return structured data."""

    if isinstance(source, (BeautifulSoup, Tag)):
        return parse_client_portal_data(source)

    if isinstance(source, (str, Path)):
        candidate = Path(source)
        if candidate.exists():
            html = candidate.read_text(encoding="utf-8")
            return parse_client_portal_data(html)

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


# ───────────── CLI entrypoint ─────────────
def main(argv: Optional[Sequence[str]] = None) -> int:
    if argv is None:
        argv = sys.argv[1:]

    if len(argv) < 1:
        print("Usage: python3 parser.py report.html|report.pdf")
        return 1

    html_path = Path(argv[0])
    if not html_path.exists():
        print(f"File not found: {html_path}")
        return 1

    if html_path.suffix.lower() == ".pdf":
        parsed = parse_client_portal_data(html_path)
    else:
        html = html_path.read_text(encoding="utf-8")
        parsed = parse_client_portal_data(html)
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
