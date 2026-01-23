#!/usr/bin/env python3
"""
IdentityIQ (3-bureau) PDF parser -> canonical JSON.

Usage:
  python backend/parsers/identityiq_pdf_parser.py /path/to/report.pdf > report.json

Requires:
  pip install pdfplumber
"""

from __future__ import annotations

import json
import os
import re
import sys
from typing import Any, Dict, List, Optional, Tuple

import pdfplumber


BUREAUS = ("TUC", "EXP", "EQF")
HEADER_WORDS = {"TUC": "TransUnion", "EXP": "Experian", "EQF": "Equifax"}

TRADE_SECTION_TRIGGER = "Information on accounts you have opened in the past is displayed below."
STOP_SECTION_HINTS = ("Creditor Contacts",)


LABEL_MAP = {
    "account #": "accountNumberMasked",
    "account status": "accountStatus",
    "payment status": "paymentStatus",
    "balance": "balance",
    "past due": "pastDue",
    "credit limit": "creditLimit",
    "high credit": "highCredit",
    "date opened": "dateOpened",
    "date closed": "dateClosed",
    "last reported": "lastReported",
    "date last payment": "dateLastPayment",
    "date of last payment": "dateLastPayment",
    "date last active": "dateLastActive",
    "monthly payment": "monthlyPayment",
    "account type": "accountType",
    "account type - detail": "accountTypeDetail",
    "bureau code": "bureauCode",
    "no. of months (terms)": "termMonths",
    "comments": "comments",
}


# ----------------------------
# Low-level layout helpers
# ----------------------------

def group_lines(words: List[dict], y_tol: float = 2.0) -> List[List[dict]]:
    """Group extracted words into lines by y-position."""
    words_sorted = sorted(words, key=lambda w: (w["top"], w["x0"]))
    lines: List[List[dict]] = []
    cur: List[dict] = []
    cur_y: Optional[float] = None

    for w in words_sorted:
        y = w["top"]
        if cur_y is None or abs(y - cur_y) <= y_tol:
            cur.append(w)
            cur_y = y if cur_y is None else (cur_y * 0.7 + y * 0.3)
        else:
            lines.append(cur)
            cur = [w]
            cur_y = y
    if cur:
        lines.append(cur)
    return lines


def find_page_boundaries(words: List[dict]) -> Optional[Tuple[float, float]]:
    """
    Detect column cut points using the top-most TransUnion/Experian/Equifax header positions on a page.
    Returns (cut1, cut2) where:
      - TU column x < cut1
      - EXP column cut1 <= x < cut2
      - EQF column x >= cut2
    """
    hits: Dict[str, dict] = {}
    for bureau, header in HEADER_WORDS.items():
        ws = [w for w in words if w["text"] == header]
        if not ws:
            return None
        hits[bureau] = min(ws, key=lambda x: x["top"])  # top-most instance
    tu, ex, eq = hits["TUC"], hits["EXP"], hits["EQF"]
    cut1 = (tu["x0"] + ex["x0"]) / 2
    cut2 = (ex["x0"] + eq["x0"]) / 2
    return cut1, cut2


def normalize_label(label: str) -> str:
    label = re.sub(r"\s+", " ", label.strip())
    return label.rstrip(":").strip()


def is_creditor_header(line_text: str) -> bool:
    """
    Detect creditor/furnisher block headers like "KIKOFF", "ONE FINANCE", etc.
    Must be uppercase-ish, no colon, not the bureau header line, and not too long.
    """
    t = line_text.strip()
    if not t or ":" in t:
        return False
    if t == "TransUnion Experian Equifax":
        return False
    if len(t) > 60:
        return False

    allowed = sum(1 for ch in t if ch.isupper() or ch.isdigit() or ch in " /&-.'")
    return (allowed / max(1, len(t))) > 0.8 and any(ch.isalpha() for ch in t)


def parse_line_kv(
    ln_words: List[dict],
    cut1: float,
    cut2: float,
) -> Optional[Tuple[str, Dict[str, Optional[str]]]]:
    """
    Parse a line like "Balance: $0.00 $0.00 $0.00" into:
      ("Balance", {"TUC":"$0.00", "EXP":"$0.00", "EQF":"$0.00"})
    Uses x-position to assign tokens to bureau columns.
    """
    # label is tokens up to and including the first token that ends with ':'
    label_tokens: List[dict] = []
    label_end_x: Optional[float] = None
    for w in sorted(ln_words, key=lambda x: x["x0"]):
        label_tokens.append(w)
        if w["text"].endswith(":"):
            label_end_x = w["x1"]
            break
    if label_end_x is None:
        return None

    label = normalize_label(" ".join(w["text"] for w in label_tokens))

    vals = {"TUC": [], "EXP": [], "EQF": []}
    for w in ln_words:
        # skip label area
        if w["x0"] <= label_end_x + 1:
            continue

        x = w["x0"]
        if x < cut1:
            vals["TUC"].append(w["text"])
        elif x < cut2:
            vals["EXP"].append(w["text"])
        else:
            vals["EQF"].append(w["text"])

    return label, {k: (" ".join(v).strip() or None) for k, v in vals.items()}


def parse_continuation(ln_words: List[dict], cut1: float, cut2: float) -> Dict[str, str]:
    """
    Parse a line without ':' that is aligned to one bureau column, e.g.:
      EQF-only continuation: "Amount in H/C column is credit limit"
    """
    vals = {"TUC": [], "EXP": [], "EQF": []}
    for w in ln_words:
        x = w["x0"]
        if x < cut1:
            vals["TUC"].append(w["text"])
        elif x < cut2:
            vals["EXP"].append(w["text"])
        else:
            vals["EQF"].append(w["text"])
    return {b: " ".join(vals[b]).strip() for b in BUREAUS if " ".join(vals[b]).strip()}


# ----------------------------
# Main parser
# ----------------------------

def parse_identity_basic(pdf: pdfplumber.PDF) -> Dict[str, Dict[str, Any]]:
    """
    Minimal identity extraction (name, dob, creditReportDate).
    Extend this for addresses/employers if needed.
    """
    page0 = pdf.pages[0]
    words = page0.extract_words()
    bounds = find_page_boundaries(words)
    if not bounds:
        return {b: {} for b in BUREAUS}
    cut1, cut2 = bounds

    identity = {b: {} for b in BUREAUS}
    for ln in group_lines(words):
        if not any(w["text"].endswith(":") for w in ln):
            continue
        kv = parse_line_kv(ln, cut1, cut2)
        if not kv:
            continue
        label, vals = kv
        if label in ("Name", "Date of Birth", "Credit Report Date"):
            key = {
                "Name": "name",
                "Date of Birth": "dob",
                "Credit Report Date": "creditReportDate",
            }[label]
            for b in BUREAUS:
                if vals[b]:
                    identity[b][key] = vals[b]
    return identity


def parse_tradelines(pdf: pdfplumber.PDF) -> List[Dict[str, Any]]:
    tradelines: List[Dict[str, Any]] = []

    trade_mode = False
    stop_mode = False

    current: Optional[Dict[str, Any]] = None
    last_field_key: Optional[str] = None  # canonical key, e.g. "comments"

    for page in pdf.pages:
        if stop_mode:
            break
        page_text = page.extract_text() or ""
        if TRADE_SECTION_TRIGGER in page_text:
            trade_mode = True

        if not trade_mode:
            continue

        words = page.extract_words()
        bounds = find_page_boundaries(words)
        if not bounds:
            continue
        cut1, cut2 = bounds

        for ln in group_lines(words):
            line_text = " ".join(w["text"] for w in sorted(ln, key=lambda x: x["x0"])).strip()
            if not line_text:
                continue

            if any(hint in line_text for hint in STOP_SECTION_HINTS):
                stop_mode = True
                break

            # Start of a new furnisher block
            if is_creditor_header(line_text):
                if current:
                    tradelines.append(current)
                current = {
                    "furnisherName": line_text,
                    "byBureau": {
                        "TUC": {"present": False},
                        "EXP": {"present": False},
                        "EQF": {"present": False},
                    },
                }
                last_field_key = None
                continue

            if line_text == "TransUnion Experian Equifax":
                continue

            if current is None:
                continue

            if "Two-Year payment history" in line_text:
                last_field_key = None
                continue

            # Key/value row
            if any(w["text"].endswith(":") for w in ln):
                kv = parse_line_kv(ln, cut1, cut2)
                if not kv:
                    continue
                label, vals = kv
                canon_key = LABEL_MAP.get(label.lower())

                last_field_key = canon_key if canon_key else None

                for b in BUREAUS:
                    if vals[b] is None:
                        continue
                    current["byBureau"][b]["present"] = True
                    if canon_key:
                        current["byBureau"][b][canon_key] = vals[b]
                    else:
                        current["byBureau"][b].setdefault("unmapped", {})[label] = vals[b]

            # Continuation row (typically comments/notes aligned to a bureau column)
            else:
                if current is None or not last_field_key:
                    continue
                cont = parse_continuation(ln, cut1, cut2)
                for b, txt in cont.items():
                    current["byBureau"][b]["present"] = True
                    prior = current["byBureau"][b].get(last_field_key)
                    current["byBureau"][b][last_field_key] = (
                        f"{prior} {txt}".strip() if prior else txt
                    )

    if current:
        tradelines.append(current)

    return tradelines


def parse_report_meta(pdf: pdfplumber.PDF) -> Dict[str, Any]:
    meta: Dict[str, Any] = {"provider": "IdentityIQ"}
    text0 = pdf.pages[0].extract_text() or ""

    m = re.search(r"Reference #:\s*([A-Z0-9]+)", text0)
    if m:
        meta["reference"] = m.group(1)

    m = re.search(r"Report Date:\s*([0-9]{2}/[0-9]{2}/[0-9]{4})", text0)
    if m:
        meta["reportDate"] = m.group(1)

    return meta


def parse_identityiq_pdf(pdf_path: str) -> Dict[str, Any]:
    if not os.path.exists(pdf_path):
        raise FileNotFoundError(pdf_path)

    with pdfplumber.open(pdf_path) as pdf:
        report = {
            "reportMeta": parse_report_meta(pdf),
            "identity": parse_identity_basic(pdf),
            "tradelines": parse_tradelines(pdf),
        }
    return report


def main() -> int:
    if len(sys.argv) != 2:
        print("Usage: identityiq_pdf_parser.py /path/to/report.pdf", file=sys.stderr)
        return 2

    pdf_path = sys.argv[1]
    try:
        report = parse_identityiq_pdf(pdf_path)
        print(json.dumps(report, indent=2))
        return 0
    except Exception as e:
        print(f"ERROR: {e}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
