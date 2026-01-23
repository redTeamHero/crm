"""IdentityIQ PDF parser that normalizes text-based reports."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
import re
from typing import Any, Dict, Iterable, List, Mapping, MutableMapping, Optional, Sequence, Tuple

from .audit_rules import run_all_audits


@dataclass(frozen=True)
class Word:
    text: str
    x0: float
    x1: float
    top: float


@dataclass(frozen=True)
class Line:
    text: str
    words: Tuple[Word, ...]
    top: float
    page_width: float


SECTION_HEADINGS = {
    "personal information": "personal_information",
    "account history": "account_history",
    "inquiries": "inquiries",
    "creditor contacts": "creditor_contacts",
    "summary": "summary",
}

ACCOUNT_FIELD_MAP = {
    "account #": "account_number",
    "account number": "account_number",
    "account type": "account_type",
    "account status": "account_status",
    "date opened": "date_opened",
    "balance": "balance",
    "credit limit": "credit_limit",
    "high credit": "high_credit",
    "monthly payment": "monthly_payment",
    "last payment date": "date_of_last_payment",
    "date of last payment": "date_of_last_payment",
    "last reported": "last_reported",
    "date reported": "last_reported",
    "date closed": "date_closed",
    "date of first delinquency": "date_of_first_delinquency",
    "comments": "comments",
    "payment status": "payment_status",
    "past due": "past_due",
}

PERSONAL_FIELD_KEYS = {
    "name": "name",
    "dob": "date_of_birth",
    "date of birth": "date_of_birth",
    "current address": "current_address",
    "previous address": "previous_address",
    "employer": "employer",
}

BUREAU_LABELS = ("transunion", "experian", "equifax")


def parse_credit_report_pdf(path: Path) -> Dict[str, Any]:
    lines = list(_iter_lines(path))
    if not lines:
        raise ValueError("No extractable text found in PDF report.")

    sections = _section_lines(lines)
    personal_info = _parse_personal_information(sections.get("personal_information", []))
    accounts = _parse_account_history(sections.get("account_history", []))
    payload: Dict[str, Any] = {
        "accounts": accounts,
        "inquiries": [],
        "personal_information": personal_info,
    }
    return run_all_audits(payload)


def _iter_lines(path: Path) -> Iterable[Line]:
    import pdfplumber

    with pdfplumber.open(path) as pdf:
        for page in pdf.pages:
            words = [
                Word(
                    text=word.get("text", ""),
                    x0=float(word.get("x0", 0)),
                    x1=float(word.get("x1", 0)),
                    top=float(word.get("top", 0)),
                )
                for word in page.extract_words()
                if word.get("text")
            ]
            for line_words in _group_words_by_line(words):
                text = " ".join(word.text for word in line_words).strip()
                if not text:
                    continue
                yield Line(
                    text=text,
                    words=tuple(line_words),
                    top=_line_top(line_words),
                    page_width=float(page.width),
                )


def _group_words_by_line(words: Sequence[Word], tolerance: float = 2.5) -> List[List[Word]]:
    if not words:
        return []
    sorted_words = sorted(words, key=lambda w: (w.top, w.x0))
    lines: List[List[Word]] = []
    current: List[Word] = [sorted_words[0]]
    current_top = sorted_words[0].top
    for word in sorted_words[1:]:
        if abs(word.top - current_top) <= tolerance:
            current.append(word)
        else:
            lines.append(sorted(current, key=lambda w: w.x0))
            current = [word]
            current_top = word.top
    lines.append(sorted(current, key=lambda w: w.x0))
    return lines


def _line_top(words: Sequence[Word]) -> float:
    return float(sum(word.top for word in words) / max(len(words), 1))


def _section_lines(lines: Sequence[Line]) -> Dict[str, List[Line]]:
    section_map: Dict[str, List[Line]] = {}
    current_section: Optional[str] = None
    for line in lines:
        heading = _normalize_heading(line.text)
        if heading in SECTION_HEADINGS:
            current_section = SECTION_HEADINGS[heading]
            section_map.setdefault(current_section, [])
            continue
        if current_section:
            section_map[current_section].append(line)
    return section_map


def _normalize_heading(text: str) -> str:
    return re.sub(r"\\s+", " ", text.strip().lower())


def _parse_personal_information(lines: Sequence[Line]) -> Dict[str, Dict[str, str]]:
    info: Dict[str, Dict[str, str]] = {bureau: {} for bureau in ("TransUnion", "Experian", "Equifax")}
    columns: Optional[List[Tuple[str, float, float]]] = None
    for line in lines:
        if _is_bureau_header(line):
            columns = _bureau_columns(line)
            continue
        if not columns:
            continue
        label = _match_label(line.text, PERSONAL_FIELD_KEYS)
        if not label:
            continue
        values = _extract_bureau_values(line, columns)
        for bureau, value in values.items():
            if not value:
                continue
            key = PERSONAL_FIELD_KEYS.get(label, label)
            info[bureau][key] = value
            if "name" in key and "name" not in info[bureau]:
                info[bureau]["name"] = value
            if "address" in key and "address" not in info[bureau]:
                info[bureau]["address"] = value
    return info


def _parse_account_history(lines: Sequence[Line]) -> List[MutableMapping[str, Any]]:
    accounts: List[MutableMapping[str, Any]] = []
    current_creditor: Optional[str] = None
    current_columns: Optional[List[Tuple[str, float, float]]] = None
    current_fields: Dict[str, Dict[str, str]] = {}

    def flush() -> None:
        nonlocal current_fields, current_creditor
        if not current_creditor or not current_fields:
            current_fields = {}
            return
        for bureau, fields in current_fields.items():
            present = any(value for value in fields.values())
            record: MutableMapping[str, Any] = {
                "creditor_name": current_creditor,
                "bureau": bureau,
                "present": present,
            }
            record.update(fields)
            accounts.append(record)
        current_fields = {}

    for line in lines:
        text = line.text.strip()
        if _is_creditor_header(text):
            flush()
            current_creditor = text
            current_columns = None
            continue
        if _is_bureau_header(line):
            current_columns = _bureau_columns(line)
            continue
        if not current_columns or not current_creditor:
            continue
        label = _match_label(text, ACCOUNT_FIELD_MAP)
        if not label:
            if _is_tradeline_end_marker(text):
                flush()
                current_creditor = None
                current_columns = None
            continue
        values = _extract_bureau_values(line, current_columns)
        for bureau, value in values.items():
            current_fields.setdefault(bureau, {})[ACCOUNT_FIELD_MAP[label]] = value

    flush()
    return accounts


def _is_creditor_header(text: str) -> bool:
    if not text:
        return False
    normalized = _normalize_heading(text)
    if normalized in SECTION_HEADINGS:
        return False
    if _match_label(text, ACCOUNT_FIELD_MAP):
        return False
    if _is_tradeline_end_marker(text):
        return False
    if text.isupper() and any(char.isalpha() for char in text):
        return True
    return bool(re.match(r"^[A-Z0-9][A-Z0-9 .,&\\-]{2,}$", text))


def _is_tradeline_end_marker(text: str) -> bool:
    return "two-year payment history" in text.lower()


def _is_bureau_header(line: Line) -> bool:
    lowered = line.text.lower()
    return all(label in lowered for label in BUREAU_LABELS)


def _bureau_columns(line: Line) -> List[Tuple[str, float, float]]:
    positions: Dict[str, float] = {}
    for word in line.words:
        lowered = word.text.strip().lower()
        if lowered in BUREAU_LABELS:
            positions[lowered] = word.x0
    if len(positions) < 3:
        raise ValueError("Unable to detect bureau column positions.")
    tu = positions["transunion"]
    exp = positions["experian"]
    eqf = positions["equifax"]
    midpoint_tu_exp = (tu + exp) / 2.0
    midpoint_exp_eqf = (exp + eqf) / 2.0
    width = line.page_width
    return [
        ("TransUnion", tu - 5, midpoint_tu_exp),
        ("Experian", exp - 5, midpoint_exp_eqf),
        ("Equifax", eqf - 5, width),
    ]


def _match_label(text: str, mapping: Mapping[str, str]) -> Optional[str]:
    lowered = text.strip().lower().rstrip(":")
    for label in sorted(mapping.keys(), key=len, reverse=True):
        if lowered.startswith(label):
            return label
    return None


def _extract_bureau_values(line: Line, columns: Sequence[Tuple[str, float, float]]) -> Dict[str, str]:
    results = {name: "" for name, _, _ in columns}
    for word in line.words:
        for name, start, end in columns:
            if start <= word.x0 <= end:
                results[name] = _append_token(results[name], word.text)
                break
    return {bureau: value.strip() for bureau, value in results.items()}


def _append_token(existing: str, token: str) -> str:
    if not existing:
        return token
    return f"{existing} {token}"
