from __future__ import annotations
import logging
from logging.handlers import RotatingFileHandler

import argparse
import json
import os
import re
import sys
from collections import defaultdict
from dataclasses import dataclass
from datetime import date, datetime
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional, Sequence, Tuple

from bs4 import BeautifulSoup, Tag
from datetime import datetime, date






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

HEADER_CLASS_RE = re.compile(r"(sub[_-]?header|section[_-]?header(?:_title)?|section-title)", re.I)
NON_CREDITOR_HEADERS = {
    "account history",
    "personal information",
    "inquiries",
    "risk factors",
    "risk factor",
    "key factors",
    "score factors",
    "credit score",
}

BUREAUS: Sequence[str] = ("TransUnion", "Experian", "Equifax")

# ---------------------------------------------------------------------------
# Globals
# ---------------------------------------------------------------------------

SEEN_ACCOUNT_NUMBERS: defaultdict[str, set[str]] = defaultdict(set)
SEVERITY: Dict[str, int] = {"Dates": 5, "Account": 4, "General": 3}
MODERN_SEVERITY_TO_LEGACY: Dict[str, int] = {"minor": 3, "moderate": 4, "major": 5}
_CURRENT_RULE_ID: Optional[str] = None

# ---------------------------------------------------------------------------
# Rulebook loader
# ---------------------------------------------------------------------------

def _resolve_rulebook_path() -> Path:
    here = Path(__file__).resolve().parent
    env_path = os.getenv("METRO2_RULEBOOK_PATH")
    if env_path:
        candidate = Path(env_path).expanduser().resolve()
        if candidate.exists():
            return candidate
    for candidate in [
        here / "data" / "metro2Violations.json",
        here / "public" / "metro2Violations.json",
        here.parent / "metro2Violations.json",
        here.parent / "metro2" / "metro2Violations.json",
        here.parent.parent / "metro2" / "metro2Violations.json",
    ]:
        if candidate.exists():
            return candidate
    raise FileNotFoundError("metro2Violations.json not found")


# ---------------------------------------------------------------------------
# Logging Setup (Verbose + Rotating)
# ---------------------------------------------------------------------------
LOG_PATH = "/var/log/metro2_debug.log"

def setup_logger(debug_enabled: bool = False):
    """Configures rotating logs and optional console output."""
    logger = logging.getLogger("metro2")
    if logger.handlers:
        return logger  # already configured
    logger.setLevel(logging.DEBUG if debug_enabled else logging.INFO)
    os.makedirs(os.path.dirname(LOG_PATH), exist_ok=True)
    handler = RotatingFileHandler(LOG_PATH, maxBytes=2_000_000, backupCount=5)
    fmt = logging.Formatter("[%(asctime)s][%(levelname)s] %(message)s")
    handler.setFormatter(fmt)
    logger.addHandler(handler)
    if debug_enabled:
        console = logging.StreamHandler()
        console.setFormatter(fmt)
        logger.addHandler(console)
    return logger


def _load_rulebook() -> Dict[str, Dict[str, Any]]:
    path = _resolve_rulebook_path()
    try:
        text = path.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        text = path.read_text(encoding="latin-1")  # fallback for § or special chars
    data = json.loads(text)
    if not isinstance(data, dict):
        raise ValueError("metro2Violations.json must contain a JSON object")
    return data



RULEBOOK: Dict[str, Dict[str, Any]] = _load_rulebook()

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

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
    

def parse_date(value: Optional[Any]) -> Optional[datetime.date]:
    """Safely parse strings or reuse already parsed datetime.date objects."""
    if value is None:
        return None

    if isinstance(value, date):   # ✅ use date, not datetime.date
        return value

    value = str(value).strip()
    if not value:
        return None

    for fmt in DATE_FORMATS:
        try:
            return datetime.strptime(value, fmt).date()
        except Exception:
            continue
    return None


def _normalize_status(value: str) -> str:
    """Normalize account status text for reliable comparisons."""
    if not value:
        return ""
    clean = re.sub(r"[^A-Za-z ]", "", value).strip().lower()
    synonyms = {
        "pays as agreed": "current",
        "ok": "current",
        "paid": "closed",
        "charge off": "chargeoff",
        "collection": "collection",
    }
    for k, v in synonyms.items():
        if k in clean:
            return v
    return clean



def _safe_lower(value: Any) -> str:
    return str(value or "").strip().lower()


def _normalized_account_number(value: Any) -> str:
    raw = str(value or "")
    return "".join(ch for ch in raw if ch.isalnum()).upper()


def _account_number_for(tradeline: Dict[str, Any]) -> str:
    raw = str(
        tradeline.get("account_number")
        or tradeline.get("account_#")
        or tradeline.get("number")
        or tradeline.get("acct_number")
        or ""
    )
    return re.sub(r"[^A-Za-z0-9]", "", raw).upper()


def _is_revolving(tradeline: Dict[str, Any]) -> bool:
    t = _safe_lower(tradeline.get("account_type"))
    d = _safe_lower(tradeline.get("account_type_detail"))
    return any(k in t or k in d for k in ("revolv", "credit card", "line of credit"))


def _is_installment(tradeline: Dict[str, Any]) -> bool:
    t = _safe_lower(tradeline.get("account_type"))
    d = _safe_lower(tradeline.get("account_type_detail"))
    return any(k in t or k in d for k in ("install", "auto loan", "mortgage"))


def _calc_utilization(tradeline: Dict[str, Any]) -> Optional[float]:
    balance = clean_amount(tradeline.get("balance"))
    limit = clean_amount(tradeline.get("credit_limit"))
    high = clean_amount(tradeline.get("high_credit"))
    base = limit if limit > 0 else high if high > 0 else 0
    return None if base <= 0 else balance / base


def _get_comments(t: Dict[str, Any]) -> str:
    return t.get("comments") or t.get("remarks") or t.get("notes") or ""


def _get_ecoa(t: Dict[str, Any]) -> str:
    return _safe_lower(t.get("ecoa") or t.get("responsibility"))


def _get_compliance_code(t: Dict[str, Any]) -> str:
    return _safe_lower(t.get("compliance_condition_code") or t.get("ccc"))


def _has_keywords(text: str, keywords: Sequence[str]) -> bool:
    low = _safe_lower(text)
    return any(k in low for k in keywords)


# ---------------------------------------------------------------------------
# Personal info parsing
# ---------------------------------------------------------------------------

@dataclass
class AuditPayload:
    personal_information: List[Dict[str, Dict[str, str]]]
    personal_mismatches: List[Dict[str, Any]]
    account_history: List[Dict[str, Any]]
    inquiries: List[Dict[str, str]]
    inquiry_violations: List[Dict[str, Any]]


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

def detect_personal_violations(personal_info: Dict[str, Any]) -> List[Dict[str, Any]]:
    out = []
    for rule_name, rule_data in RULEBOOK.items():
        if rule_data.get("target") != "personal":
            continue
        if evaluate_rule(rule_data.get("rule", {}), personal_info):
            out.append({
                "id": rule_name,
                "title": rule_data["violation"],
                "severity": rule_data["severity"]
            })
    return out

def detect_personal_info_mismatches(pinfo: List[Dict[str, Dict[str, str]]]) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    if not pinfo:
        return out
    info = pinfo[0]
    for field, vals in info.items():
        clean = {v.strip().lower() for v in vals.values() if v.strip()}
        if len(clean) > 1:
            out.append({"id": "PERSONAL_INFO_MISMATCH", "field": field,
                        "title": f"{field} differs between bureaus", "values": vals})
    return out


# ---------------------------------------------------------------------------
# Tradeline parsing � fixed version
# ---------------------------------------------------------------------------

def _normalize_field(label: str) -> str:
    cleaned = re.sub(r"[:：]\s*$", "", label.strip()).strip().lower()
    if cleaned in FIELD_ALIASES:
        return FIELD_ALIASES[cleaned]
    return re.sub(r"[^a-z0-9]+", "_", cleaned).strip("_")


def _clean_creditor_name(v: str) -> str:
    if not v:
        return ""
    text = re.sub(r"\s+", " ", v).strip()
    text = re.sub(r"^(account\s+name|creditor|subscriber name)\s*[:\-]\s*", "", text, flags=re.I)
    for bureau in ("TransUnion", "Experian", "Equifax"):
        text = re.sub(rf"\b{bureau}\b.*", "", text, flags=re.I)
    return text.strip("-|:. ")




def _looks_like_creditor_header(tag: Tag) -> bool:
    if not isinstance(tag, Tag):
        return False
    if tag.name in {"h2", "h3", "h4"}:
        return True
    if HEADER_CLASS_RE.search(" ".join(tag.get("class", []))):
        return True
    if tag.name in {"table", "td", "tr"}:
        return False
    txt = tag.get_text(" ", strip=True)
    return bool(txt) and 2 < len(txt) <= 120


def _iter_header_candidates(table: Tag):
    seen = set()
    cur = table
    while isinstance(cur, Tag):
        for sib in list(cur.previous_siblings) + list(cur.next_siblings):
            if isinstance(sib, Tag) and id(sib) not in seen:
                seen.add(id(sib))
                if _looks_like_creditor_header(sib):
                    yield sib
        cur = cur.parent


NON_CREDITOR_KEYWORDS = {
    "two-year", "payment history", "legend", "back to top", "top",
    "summary", "risk factor", "key factor", "account history",
    "personal information", "inquiries", "score factors", "credit score","customer statement",
}


def extract_creditor_name(table: Any) -> Optional[str]:
    """Find correct creditor header; ignore junk and log detection process."""
    logger = logging.getLogger("metro2")

    if not isinstance(table, Tag):
        return None
    for cand in _iter_header_candidates(table):
        txt_raw = cand.get_text(" ", strip=True)
        txt = _clean_creditor_name(txt_raw)
        if not txt:
            continue
        if any(bad in txt.lower() for bad in NON_CREDITOR_KEYWORDS):
            logger.debug(f"Ignored non-creditor header candidate: {txt_raw}")
            continue
        if re.search(r"[A-Za-z]", txt):
            logger.debug(f"Detected creditor name: {txt}")
            return txt

    # Fallback pattern search
    block = table.get_text(" ", strip=True)
    m = re.match(r"([A-Za-z0-9/&\-\s]+)\s+(TransUnion|Experian|Equifax)", block)
    if m:
        poss = _clean_creditor_name(m.group(1))
        if not any(bad in poss.lower() for bad in NON_CREDITOR_KEYWORDS):
            logger.debug(f"Fallback creditor match: {poss}")
            return poss
    logger.debug("No creditor name found for current table.")
    return None

def _clean_currency(value):
    """Safely normalize $-style amounts → float."""
    if not value:
        return 0.0
    if isinstance(value, (int, float)):
        return float(value)
    try:
        text = str(value).replace("$", "").replace(",", "").strip()
        return float(text) if text.replace(".", "", 1).isdigit() else 0.0
    except Exception:
        return 0.0
def _clean_date(value):
    return value.strip() if "/" in value else None

def _clean_date(value):
    """Convert '09/11/2025' → datetime.date(2025, 9, 11)."""
    if not value:
        return None
    value = str(value).strip()
    if value in ("", "-", "N/A", "None"):
        return None
    for fmt in ("%m/%d/%Y", "%m-%d-%Y", "%m/%Y"):
        try:
            return datetime.strptime(value, fmt).date()
        except ValueError:
            continue
    return None  





def parse_account_history(soup: BeautifulSoup) -> List[Dict[str, Any]]:
    """Parse tradeline tables and attach correct creditor names only."""
    tradelines: List[Dict[str, Any]] = []

    for table in soup.find_all("table"):
        # quick text dump for filtering
        raw_text = table.get_text(" ", strip=True).lower()

        # skip obviously non-tradeline tables
        if any(bad in raw_text for bad in [
            "two-year payment history", "legend", "key factors",
            "risk factor", "back to top", "personal information", "inquiries" , "Customer Statement "
        ]):
            continue

        # verify the table contains account-like data
        if not any(keyword in raw_text for keyword in [
            "account", "balance", "date opened", "credit limit", "high credit"
        ]):
            continue

        creditor = extract_creditor_name(table)
        if not creditor:
            continue  # skip orphaned tables with no clear creditor name

        rows = table.find_all("tr")
        if len(rows) < 2:
            continue

        # map each field label to its values by bureau
        field_map: Dict[str, Dict[str, str]] = {}
        for row in rows:
            cells = row.find_all("td")
            if len(cells) < 4:
                continue
            label = _strip_text(cells[0])
            tu, exp, eqf = [_strip_text(c) for c in cells[1:4]]
            field_map[label] = {"TransUnion": tu, "Experian": exp, "Equifax": eqf}

        # build one tradeline record per bureau
        for bureau in BUREAUS:
            tl: Dict[str, Any] = {"creditor_name": creditor, "bureau": bureau}
            for field, values in field_map.items():
                key = _normalize_field(field)
                tl[key] = values.get(bureau, "")
            tradelines.append(tl)

    return tradelines



def _extract_creditor_name(table: Any) -> Optional[str]:
    """
    Enhanced creditor name extractor.
    - Looks at sibling tags and nearby text
    - Ignores non-creditor headers
    """
    logger = logging.getLogger("metro2")

    if not isinstance(table, Tag):
        return None

    for cand in _iter_header_candidates(table):
        txt_raw = cand.get_text(" ", strip=True)
        txt = _clean_creditor_name(txt_raw)
        if not txt:
            continue
        if any(bad in txt.lower() for bad in NON_CREDITOR_KEYWORDS):
            logger.debug(f"Ignored non-creditor header candidate: {txt_raw}")
            continue
        if re.search(r"[A-Za-z]", txt):
            logger.debug(f"Detected creditor name: {txt}")
            return txt

    # fallback: check previous sibling or text node
    prev_text = None
    prev_tag = table.find_previous(string=True)
    if prev_tag:
        prev_text = _clean_creditor_name(prev_tag)
    if prev_text and not any(k in prev_text.lower() for k in NON_CREDITOR_KEYWORDS):
        logger.debug(f"Sibling text creditor name: {prev_text}")
        return prev_text

    logger.debug("No creditor name found for current table.")
    return None


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
        for row in rows[1:]:
            cells = row.find_all("td")
            if len(cells) < 4:
                continue
            inquiries.append({
                "creditor_name": _strip_text(cells[0]),
                "type_of_business": _strip_text(cells[1]),
                "date_of_inquiry": _strip_text(cells[2]),
                "credit_bureau": _strip_text(cells[3]),
            })
    return inquiries

# ---------------------------------------------------------------------------
# (Audit rule section continues unchanged)
# ---------------------------------------------------------------------------
# ... all your rule definitions, detect_tradeline_violations, CLI, etc.
# ---------------------------------------------------------------------------



# ---------------------------------------------------------------------------
# Audit rules
# ---------------------------------------------------------------------------

RuleFunc = Callable[[Dict[str, Any], List[Dict[str, Any]], List[Dict[str, Any]]], List[Dict[str, Any]]]


def _violation(rule_id: str, title: str, **extra: Any) -> Dict[str, Any]:
    payload = {"id": rule_id, "title": title}
    if extra:
        payload.update(extra)
    return payload


def make_violation(section: str, title: str, description: str, meta: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """Legacy helper that enriches violations using the shared rulebook."""

    meta = dict(meta or {})
    rule_id = meta.pop("rule_id", None) or _CURRENT_RULE_ID
    violation: Dict[str, Any] = {
        "section": section,
        "title": title,
        "message": description,
        **meta,
    }

    if rule_id and rule_id in RULEBOOK:
        rule_data = RULEBOOK[rule_id]
        violation.setdefault("id", rule_data.get("id", rule_id))
        if isinstance(rule_data.get("severity"), int):
            violation.setdefault("severity", rule_data["severity"])
        if rule_data.get("fcraSection"):
            violation.setdefault("fcraSection", rule_data["fcraSection"])
    else:
        # Default identifier/severity fallbacks keep legacy consumers functional
        if rule_id and "id" not in violation:
            violation["id"] = rule_id
        if section in SEVERITY:
            violation.setdefault("severity", SEVERITY[section])

    if "id" not in violation:
        violation["id"] = re.sub(r"\s+", "_", title).upper()

    return violation


def r_cross_bureau_field_mismatch(
    tradeline: Dict[str, Any], group_records: List[Dict[str, Any]], all_tradelines: List[Dict[str, Any]]
) -> List[Dict[str, Any]]:
    del all_tradelines
    fields: Dict[str, Callable[[Any], Any]] = {
        "balance": clean_amount,
        "past_due": clean_amount,
        "account_status": _safe_lower,
        "account_type": _safe_lower,
        "payment_status": _safe_lower,
        "date_opened": lambda v: (_safe_lower(v) if v else ""),
        "account_number": _normalized_account_number,
    }
    violations: List[Dict[str, Any]] = []
    for field, normalizer in fields.items():
        values = {
            normalizer(record.get(field))
            for record in group_records
            if record.get(field)
        }
        values = {val for val in values if val not in ("", None)}
        if len(values) > 1 and tradeline.get(field):
            readable = field.replace("_", " ").title()
            violations.append(
                _violation(
                    "CROSS_BUREAU_FIELD_MISMATCH",
                    f"{readable} differs across bureaus",
                    field=field,
                )
            )
    return violations


def r_missing_date_opened(
    tradeline: Dict[str, Any], group_records: List[Dict[str, Any]], all_tradelines: List[Dict[str, Any]]
) -> List[Dict[str, Any]]:
    del group_records, all_tradelines
    if tradeline.get("date_opened"):
        return []
    return [_violation("MISSING_OPEN_DATE", "Missing Date Opened field")]


def r_cross_bureau_utilization_disparity(
    tradeline: Dict[str, Any], group_records: List[Dict[str, Any]], all_tradelines: List[Dict[str, Any]]
) -> List[Dict[str, Any]]:
    del all_tradelines
    utils = []
    for record in group_records:
        util = _calc_utilization(record)
        if util is not None:
            utils.append((record, util))
    if len(utils) < 2:
        return []
    util_values = [util for _, util in utils]
    spread = max(util_values) - min(util_values)
    if spread < 0.25:
        return []
    my_util = next((util for record, util in utils if record is tradeline), None)
    if my_util is None:
        return []
    return [
        _violation(
            "CROSS_BUREAU_UTILIZATION_GAP",
            "Utilization differs sharply between bureaus",
            utilization=round(my_util * 100, 1),
            utilization_spread=round(spread * 100, 1),
        )
    ]


def r_duplicate_account(
    tradeline: Dict[str, Any], group_records: List[Dict[str, Any]], all_tradelines: List[Dict[str, Any]]
) -> List[Dict[str, Any]]:
    del all_tradelines
    acct = _account_number_for(tradeline)
    bureau = tradeline.get("bureau")
    if not acct or not bureau:
        return []
    duplicates = [record for record in group_records if _account_number_for(record) == acct and record.get("bureau") == bureau]
    if len(duplicates) <= 1:
        return []
    return [
        _violation(
            "DUPLICATE_ACCOUNT_ENTRY",
            f"{bureau} lists account {acct} more than once",
            bureau=bureau,
            account_number=acct,
        )
    ]


def r_current_but_pastdue(
    tradeline: Dict[str, Any], group_records: List[Dict[str, Any]], all_tradelines: List[Dict[str, Any]]
) -> List[Dict[str, Any]]:
    del group_records, all_tradelines
    status = _normalize_status(tradeline.get("account_status"))
    past_due = clean_amount(tradeline.get("past_due"))
    if past_due <= 0:
        return []
    if any(keyword in status for keyword in ("current", "pays as agreed", "paid as agreed", "ok")):
        return [_violation("CURRENT_STATUS_WITH_PAST_DUE", "Account marked current while reporting past due balance")]
    return []


def r_zero_balance_but_pastdue(
    tradeline: Dict[str, Any], group_records: List[Dict[str, Any]], all_tradelines: List[Dict[str, Any]]
) -> List[Dict[str, Any]]:
    del group_records, all_tradelines
    balance = clean_amount(tradeline.get("balance"))
    past_due = clean_amount(tradeline.get("past_due"))
    if balance <= 1 and past_due > 0:
        return [_violation("ZERO_BALANCE_WITH_PAST_DUE", "Balance is zero but past due amount reported")]
    return []


def r_late_status_no_pastdue(
    tradeline: Dict[str, Any], group_records: List[Dict[str, Any]], all_tradelines: List[Dict[str, Any]]
) -> List[Dict[str, Any]]:
    del group_records, all_tradelines
    status = _normalize_status(tradeline.get("account_status"))
    past_due = clean_amount(tradeline.get("past_due"))
    if past_due > 0:
        return []
    late_keywords = ("late", "delinquent", "past due", "charge", "collection", "derog", "30", "60", "90")
    if _has_keywords(status, late_keywords):
        return [_violation("LATE_STATUS_NO_PAST_DUE", "Delinquent status without supporting past due amount")]
    return []


def r_open_zero_balance(
    tradeline: Dict[str, Any], group_records: List[Dict[str, Any]], all_tradelines: List[Dict[str, Any]]
) -> List[Dict[str, Any]]:
    del group_records, all_tradelines
    status = _normalize_status(tradeline.get("account_status"))
    balance = clean_amount(tradeline.get("balance"))
    if "open" in status and balance <= 0:
        return [_violation("OPEN_ZERO_BALANCE", "Open account reporting $0 balance")]
    return []


def r_open_zero_cl_with_hc_comment(
    tradeline: Dict[str, Any], group_records: List[Dict[str, Any]], all_tradelines: List[Dict[str, Any]]
) -> List[Dict[str, Any]]:
    del group_records, all_tradelines
    if not _is_revolving(tradeline):
        return []
    status = _normalize_status(tradeline.get("account_status"))
    if "closed" in status:
        return []
    limit = clean_amount(tradeline.get("credit_limit"))
    high_credit = clean_amount(tradeline.get("high_credit"))
    comments = _safe_lower(_get_comments(tradeline))
    if limit == 0 and high_credit > 0 and "high credit" in comments:
        return [
            _violation(
                "REVOLVING_ZERO_LIMIT_COMMENT",
                "Open revolving account has $0 limit while comments cite high credit as proxy",
            )
        ]
    return []


def r_date_order_sanity(
    tradeline: Dict[str, Any], group_records: List[Dict[str, Any]], all_tradelines: List[Dict[str, Any]]
) -> List[Dict[str, Any]]:
    del group_records, all_tradelines
    opened = parse_date(tradeline.get("date_opened"))
    if not opened:
        return []
    bad_fields: List[str] = []
    for field in ("date_last_payment", "last_reported", "date_last_active", "date_closed"):
        dt = parse_date(tradeline.get(field))
        if dt and dt < opened:
            bad_fields.append(field)
    if bad_fields:
        joined = ", ".join(sorted(bad_fields))
        return [
            _violation(
                "DATE_ORDER_SANITY",
                f"Dates {joined} occur before Date Opened",
                fields=bad_fields,
            )
        ]
    return []


def r_high_credit_gt_limit(
    tradeline: Dict[str, Any], group_records: List[Dict[str, Any]], all_tradelines: List[Dict[str, Any]]
) -> List[Dict[str, Any]]:
    del group_records, all_tradelines
    limit = clean_amount(tradeline.get("credit_limit"))
    high_credit = clean_amount(tradeline.get("high_credit"))
    if limit > 0 and high_credit > limit:
        return [_violation("HIGH_CREDIT_GT_LIMIT", "High Credit exceeds reported Credit Limit")]
    return []


def r_revolving_with_terms(
    tradeline: Dict[str, Any], group_records: List[Dict[str, Any]], all_tradelines: List[Dict[str, Any]]
) -> List[Dict[str, Any]]:
    del group_records, all_tradelines
    if not _is_revolving(tradeline):
        return []
    term_fields = ["terms", "term", "loan_term", "months_terms", "scheduled_payment_term"]
    for field in term_fields:
        value = tradeline.get(field)
        if value and re.search(r"\d", str(value)):
            return [
                _violation(
                    "REVOLVING_WITH_TERMS",
                    "Revolving account should not include installment-style term length",
                    field=field,
                )
            ]
    return []


def r_revolving_missing_cl_hc(
    tradeline: Dict[str, Any], group_records: List[Dict[str, Any]], all_tradelines: List[Dict[str, Any]]
) -> List[Dict[str, Any]]:
    del group_records, all_tradelines
    if not _is_revolving(tradeline):
        return []
    status = _normalize_status(tradeline.get("account_status"))
    if any(keyword in status for keyword in ("closed", "paid")):
        return []
    limit = clean_amount(tradeline.get("credit_limit"))
    high_credit = clean_amount(tradeline.get("high_credit"))
    if limit <= 0 and high_credit <= 0:
        return [
            _violation(
                "REVOLVING_MISSING_LIMIT",
                "Open revolving tradeline missing both Credit Limit and High Credit",
            )
        ]
    return []


def r_installment_with_cl(
    tradeline: Dict[str, Any], group_records: List[Dict[str, Any]], all_tradelines: List[Dict[str, Any]]
) -> List[Dict[str, Any]]:
    del group_records, all_tradelines
    if not _is_installment(tradeline):
        return []
    limit = clean_amount(tradeline.get("credit_limit"))
    if limit > 0:
        return [
            _violation(
                "INSTALLMENT_HAS_LIMIT",
                "Installment account should not report a revolving-style credit limit",
                credit_limit=limit,
            )
        ]
    return []


def r_co_collection_pastdue(
    tradeline: Dict[str, Any], group_records: List[Dict[str, Any]], all_tradelines: List[Dict[str, Any]]
) -> List[Dict[str, Any]]:
    del group_records, all_tradelines
    status = _normalize_status(tradeline.get("account_status"))
    past_due = clean_amount(tradeline.get("past_due"))
    if past_due <= 0:
        return []
    if any(keyword in status for keyword in ("charge", "collection", "chargeoff")):
        return [
            _violation(
                "CO_COLLECTION_PAST_DUE",
                "Charge-off/Collection should report $0 past due",
                past_due=past_due,
            )
        ]
    return []


def r_au_comment_ecoa_conflict(
    tradeline: Dict[str, Any], group_records: List[Dict[str, Any]], all_tradelines: List[Dict[str, Any]]
) -> List[Dict[str, Any]]:
    del group_records, all_tradelines
    comments = _safe_lower(_get_comments(tradeline))
    if not _has_keywords(comments, ("authorized user", "usuario autorizado")):
        return []
    ecoa = _get_ecoa(tradeline)
    valid_codes = {"a", "au", "authorized user", "u"}
    if ecoa and ecoa in valid_codes:
        return []
    return [
        _violation(
            "AU_COMMENT_ECOA_CONFLICT",
            "Authorized user comment present without matching ECOA designator",
        )
    ]


def r_derog_rating_but_current(
    tradeline: Dict[str, Any], group_records: List[Dict[str, Any]], all_tradelines: List[Dict[str, Any]]
) -> List[Dict[str, Any]]:
    del group_records, all_tradelines
    status = _normalize_status(tradeline.get("account_status"))
    past_due = clean_amount(tradeline.get("past_due"))
    if past_due > 0 or not any(keyword in status for keyword in ("current", "pays as agreed", "ok")):
        return []
    history = _safe_lower(tradeline.get("payment_history"))
    rating = _safe_lower(tradeline.get("payment_rating"))
    derog_tokens = ("30", "60", "90", "120", "derog", "charge", "collection")
    if any(token in history for token in derog_tokens) or any(token in rating for token in derog_tokens):
        return [
            _violation(
                "DEROG_RATING_BUT_CURRENT",
                "Derogatory history present while account marked current with $0 past due",
            )
        ]
    return []


def r_dispute_comment_needs_xb(
    tradeline: Dict[str, Any], group_records: List[Dict[str, Any]], all_tradelines: List[Dict[str, Any]]
) -> List[Dict[str, Any]]:
    del group_records, all_tradelines
    comments = _safe_lower(_get_comments(tradeline))
    if not _has_keywords(comments, ("dispute", "investigation", "en disputa")):
        return []
    code = _get_compliance_code(tradeline)
    if code == "xb":
        return []
    return [
        _violation(
            "DISPUTE_COMMENT_NEEDS_XB",
            "Dispute language requires XB compliance code",
            compliance_code=code or "",
        )
    ]


def r_closed_but_monthly_payment(
    tradeline: Dict[str, Any], group_records: List[Dict[str, Any]], all_tradelines: List[Dict[str, Any]]
) -> List[Dict[str, Any]]:
    del group_records, all_tradelines
    status = _normalize_status(tradeline.get("account_status"))
    if not _has_keywords(status, ("closed", "paid", "charge", "collection")):
        return []
    payment = clean_amount(tradeline.get("monthly_payment"))
    if payment > 0:
        return [
            _violation(
                "CLOSED_ACCOUNT_MONTHLY_PAYMENT",
                "Closed account still reporting a monthly payment",
                monthly_payment=payment,
            )
        ]
    return []


def r_stale_active_reporting(
    tradeline: Dict[str, Any], group_records: List[Dict[str, Any]], all_tradelines: List[Dict[str, Any]]
) -> List[Dict[str, Any]]:
    del group_records, all_tradelines
    status = _normalize_status(tradeline.get("account_status"))
    if not any(keyword in status for keyword in ("open", "current", "pays as agreed", "ok")):
        return []
    last_reported = parse_date(tradeline.get("last_reported") or tradeline.get("date_last_active"))
    if not last_reported:
        return []
    if (date.today() - last_reported).days > 180:
        return [
            _violation(
                "STALE_ACTIVE_REPORTING",
                "Open/current account has not been updated in over 6 months",
                last_reported=tradeline.get("last_reported"),
            )
        ]
    return []


def r_dofd_obsolete_7y(
    tradeline: Dict[str, Any], group_records: List[Dict[str, Any]], all_tradelines: List[Dict[str, Any]]
) -> List[Dict[str, Any]]:
    del group_records, all_tradelines
    dofd = parse_date(tradeline.get("date_of_first_delinquency"))
    if not dofd:
        return []
    status = _normalize_status(tradeline.get("account_status"))
    derogatory = _has_keywords(status, ("charge", "collection", "late", "delinquent", "derog"))
    if not derogatory:
        return []
    if (date.today() - dofd).days > 365 * 7:
        return [
            _violation(
                "DOFD_OBSOLETE_7Y",
                "Negative account older than 7 years from DOFD",
                date_of_first_delinquency=tradeline.get("date_of_first_delinquency"),
            )
        ]
    return []


def r_3(tradeline: Dict[str, Any], group_records: List[Dict[str, Any]], all_tradelines: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    del group_records, all_tradelines
    closed_date = parse_date(tradeline.get("date_closed"))
    status = _normalize_status(tradeline.get("account_status"))
    if closed_date and any(keyword in status for keyword in ("open", "current", "pays as agreed", "ok")):
        return [
            _violation(
                "METRO2_CODE_3_CONFLICT",
                "Tradeline shows Date Closed but status still reads open/current",
                date_closed=tradeline.get("date_closed"),
            )
        ]
    return []


def r_8(tradeline: Dict[str, Any], group_records: List[Dict[str, Any]], all_tradelines: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    del group_records, all_tradelines
    status = _normalize_status(tradeline.get("account_status"))
    if not _has_keywords(status, ("charge", "chargeoff", "collection")):
        return []
    if tradeline.get("date_of_first_delinquency"):
        return []
    return [
        _violation(
            "METRO2_CODE_8_MISSING_DOFD",
            "Charge-off or collection missing Date of First Delinquency",
        )
    ]


def r_9(tradeline: Dict[str, Any], group_records: List[Dict[str, Any]], all_tradelines: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    del group_records, all_tradelines
    status = _normalize_status(tradeline.get("account_status"))
    if not _has_keywords(status, ("collection",)):
        return []
    if tradeline.get("original_creditor"):
        return []
    return [_violation("METRO2_CODE_9_MISSING_OC", "Collection account missing Original Creditor")]


def r_10(
    tradeline: Dict[str, Any], group_records: List[Dict[str, Any]], all_tradelines: List[Dict[str, Any]]
) -> List[Dict[str, Any]]:
    acct = _account_number_for(tradeline)
    bureau = tradeline.get("bureau")
    if not acct or not bureau:
        return []
    duplicates = [record for record in all_tradelines if record.get("bureau") == bureau and _account_number_for(record) == acct]
    if len(duplicates) <= 1:
        return []
    return [
        _violation(
            "METRO2_CODE_10_DUPLICATE",
            "Duplicate account number detected within same bureau feed",
            bureau=bureau,
            account_number=acct,
        )
    ]


def r_sl_no_lates_during_deferment(
    tradeline: Dict[str, Any], group_records: List[Dict[str, Any]], all_tradelines: List[Dict[str, Any]]
) -> List[Dict[str, Any]]:
    del group_records, all_tradelines
    acct_type = _safe_lower(tradeline.get("account_type"))
    comments = _safe_lower(_get_comments(tradeline))
    keywords = ("student", "education")
    if not any(keyword in acct_type for keyword in keywords):
        return []
    if not _has_keywords(comments, ("defer", "forbear")):
        return []
    history = _safe_lower(tradeline.get("payment_history"))
    if any(token in history for token in ("30", "60", "90", "120", "late")):
        return [
            _violation(
                "SL_DEFERMENT_HAS_LATES",
                "Student loan in deferment/forbearance shows late history",
            )
        ]
    return []

RULES: Sequence[RuleFunc] = (
    r_cross_bureau_field_mismatch,
    r_missing_date_opened,
    r_cross_bureau_utilization_disparity,
    r_duplicate_account,
    r_current_but_pastdue,
    r_zero_balance_but_pastdue,
    r_late_status_no_pastdue,
    r_open_zero_balance,
    r_open_zero_cl_with_hc_comment,
    r_date_order_sanity,
    r_revolving_with_terms,
    r_revolving_missing_cl_hc,
    r_installment_with_cl,
    r_co_collection_pastdue,
    r_high_credit_gt_limit,
    r_au_comment_ecoa_conflict,
    r_derog_rating_but_current,
    r_dispute_comment_needs_xb,
    r_closed_but_monthly_payment,
    r_stale_active_reporting,
    r_dofd_obsolete_7y,
    r_3,
    r_8,
    r_9,
    r_10,
    r_sl_no_lates_during_deferment,
)


def r_missing_dofd(
    config: Optional[Dict[str, Any]],
    bureau: str,
    tradeline: Dict[str, Any],
    emit: Callable[[Dict[str, Any]], None],
) -> None:
    """Compatibility shim for legacy Metro-2 rule runners.

    Older flows executed rules with side-effect callbacks.  The modern rule
    engine is pure/functional, so we replicate the minimum behaviour expected
    by the tests: emit a violation when a tradeline lacking DOFD data looks
    substantive enough to audit.
    """

    del config  # Legacy signature included configuration we no longer need.

    if not tradeline or not emit:
        return

    dofd = tradeline.get("date_of_first_delinquency") or tradeline.get("date_first_delinquency")
    if dofd:
        return

    has_signal = any(tradeline.get(field) for field in ("account_number", "balance", "account_status"))
    if not has_signal:
        return

    violation = make_violation(
        "Dates",
        "Missing Date of First Delinquency",
        "Reported account is missing required Date of First Delinquency data",
        {
            "bureau": bureau,
            "account_number": tradeline.get("account_number"),
            "rule_id": "MISSING_DOFD",
        },
    )
    emit(violation)


def _section_from_rule(rule_id: str) -> str:
    """Best-effort mapping of rule identifiers to legacy UI sections."""

    upper = rule_id.upper()
    if any(keyword in upper for keyword in ("DATE", "DOFD", "REPORTED", "REPORT")):
        return "Dates"
    if any(keyword in upper for keyword in ("BALANCE", "PAYMENT", "LIMIT", "UTILIZATION", "STATUS", "PAST_DUE", "ACCOUNT")):
        return "Account"
    return "General"


def _translate_modern_violation(
    violation: Dict[str, Any], bureau: Optional[str], account_display: Optional[str]
) -> Dict[str, Any]:
    """Convert new-engine violations into the legacy make_violation payload."""

    rule_id = str(violation.get("id") or "").strip() or "METRO2"
    section = violation.get("section") or _section_from_rule(rule_id)
    title = violation.get("title") or re.sub(r"[_\s]+", " ", rule_id).title()
    detail = violation.get("detail") or violation.get("message") or title

    meta: Dict[str, Any] = {
        key: value
        for key, value in violation.items()
        if key
        not in {"id", "title", "severity", "fcra_section", "fcraSection", "message", "detail", "section"}
    }
    meta["rule_id"] = rule_id
    if bureau:
        meta["bureau"] = bureau
    if account_display and "account_number" not in meta:
        meta["account_number"] = account_display

    fcra_value = violation.get("fcra_section") or violation.get("fcraSection")
    if fcra_value:
        meta.setdefault("fcraSection", fcra_value)

    severity_label = violation.get("severity")
    if isinstance(severity_label, str):
        level = MODERN_SEVERITY_TO_LEGACY.get(severity_label.lower())
        if level is not None:
            meta.setdefault("severity", level)

    return make_violation(section, title, detail, meta)




# ---------------------------------------------------------------------------
# Grouping Helper
# ---------------------------------------------------------------------------

def _group_tradelines(tradelines: List[Dict[str, Any]]) -> Dict[str, List[Dict[str, Any]]]:
    """
    Groups tradelines by creditor + account number + bureau.
    Skips empty or duplicate creditors.
    """
    groups: Dict[str, List[Dict[str, Any]]] = {}
    for t in tradelines:
        creditor = re.sub(r"\s+", " ", str(t.get("creditor_name", ""))).strip().lower()
        if not creditor or creditor in ("unknown", "address", "type of business"):
            continue

        acct = _account_number_for(t)
        bureau = t.get("bureau", "Unknown")
        key = f"{creditor}|{acct}|{bureau}"

        # skip duplicates
        if key in groups:
            continue

        groups.setdefault(key, []).append(t)
    return groups


def evaluate_rule(rule_def: Dict[str, Any], record: Dict[str, Any]) -> bool:
    """Return True if record violates the rule definition (safe numeric checks)."""
    for cond in rule_def.get("all", []):
        field = cond.get("field")
        value = record.get(field)

        # Attempt numeric normalization for safe comparison
        try:
            if isinstance(value, str):
                value_clean = float(re.sub(r"[^\d.-]", "", value)) if re.search(r"\d", value) else value
            else:
                value_clean = value
        except Exception:
            value_clean = value

        # handle exists
        if "exists" in cond:
            exists = value not in (None, "", [])
            if exists != cond["exists"]:
                return False

        # handle equalities
        if "eq" in cond and value_clean != cond["eq"]:
            return False
        if "neq" in cond and value_clean == cond["neq"]:
            return False

        # safe numeric >, <, >=, <=
        def safe_cmp(a, b, op):
            try:
                return op(a, b)
            except Exception:
                return False

        import operator
        if "gt" in cond and not safe_cmp(value_clean, cond["gt"], operator.gt):
            return False
        if "lt" in cond and not safe_cmp(value_clean, cond["lt"], operator.lt):
            return False
        if "gte" in cond and not safe_cmp(value_clean, cond["gte"], operator.ge):
            return False
        if "lte" in cond and not safe_cmp(value_clean, cond["lte"], operator.le):
            return False

        if "in" in cond and value_clean not in cond["in"]:
            return False

        # field-to-field comparisons
        if "gt_field" in cond:
            other = record.get(cond["gt_field"])
            if not safe_cmp(clean_amount(value), clean_amount(other), operator.gt):
                return False
        if "lt_field" in cond:
            other = record.get(cond["lt_field"])
            if not safe_cmp(clean_amount(value), clean_amount(other), operator.lt):
                return False
        if "neq_field" in cond:
            other = record.get(cond["neq_field"])
            if value_clean == other:
                return False

    return True


def detect_tradeline_violations(tradelines: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    logger = logging.getLogger("metro2")
    for record in tradelines:
        record["violations"] = []
        for rule_name, rule_data in RULEBOOK.items():
            # Skip personal/inquiry rules on tradelines
            if rule_data.get("target") and rule_data["target"].lower() != "tradeline":
                continue

            if evaluate_rule(rule_data.get("rule", {}), record):
                record["violations"].append({
                    "id": rule_name,
                    "title": rule_data["violation"],
                    "category": rule_data.get("category", rule_data.get("target")),
                    "fcraSection": rule_data["fcraSection"],
                    "severity": rule_data["severity"],
                    "fieldsImpacted": rule_data["fieldsImpacted"]
                })
                logger.debug(f"✔ {rule_name} fired → {rule_data['violation']}")
    return tradelines



    groups = _group_tradelines(tradelines)
    for creditor_name, records in groups.items():
        logger.debug(f"Auditing {creditor_name} ({len(records)} tradelines)")
        for record in records:
            bureau = record.get("bureau", "?")
            logger.debug(f"→ Bureau: {bureau} | Account: {record.get('account_number','?')}")
            for rule in RULES:
                try:
                    findings = rule(record, records, tradelines)
                    if findings:
                        record.setdefault("violations", []).extend(findings)
                        logger.debug(f"   Rule {rule.__name__} fired → {len(findings)} finding(s)")
                    else:
                        logger.debug(f"   Rule {rule.__name__} passed clean")
                except Exception as e:
                    logger.exception(f"Error in rule {rule.__name__}: {e}")
    return tradelines


def detect_inquiry_no_match(inquiries: List[Dict[str, str]], tradelines: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Smarter cross-check:
      - Links inquiries to tradelines by creditor name similarity + date proximity (±45 days).
      - Includes creditor name and bureau in output for human readability.
    """
    violations: List[Dict[str, Any]] = []

    def _short(x):
        return re.sub(r'[^a-z0-9]', '', (x or '').lower())[:6]

    # Build index: creditor → important dates
    tradeline_index: List[Dict[str, Any]] = []
    for tl in tradelines:
        creditor = tl.get("creditor_name", "").strip()
        bureau = tl.get("bureau", "Unknown")
        dates = []
        for field in ("date_opened", "date_last_payment", "last_reported", "date_last_active"):
            d = parse_date(tl.get(field))
            if d:
                dates.append((field, d))
        tradeline_index.append({"creditor": creditor, "bureau": bureau, "dates": dates})

    # Check each inquiry
    for iq in inquiries:
        iq_date = parse_date(iq.get("date_of_inquiry"))
        iq_name = iq.get("creditor_name", "").strip()
        iq_bureau = iq.get("credit_bureau", "Unknown")

        if not iq_date:
            continue

        matched = False
        for tl in tradeline_index:
            cred_name = tl["creditor"]
            # Fuzzy creditor match (first 5 letters)
            if _short(iq_name) and _short(iq_name) in _short(cred_name):
                for fld, d in tl["dates"]:
                    if abs((iq_date - d).days) <= 45:
                        matched = True
                        break
            if matched:
                break

        if not matched:
            # no match found → show both inquiry + tradeline context
            for tl in tradeline_index:
                for fld, d in tl["dates"]:
                    violations.append({
                        "id": "INQUIRY_NO_MATCH",
                        "creditor_name": tl["creditor"],
                        "bureau": tl["bureau"],
                        "title": f"{tl['creditor']} [{tl['bureau']}] - Inquiry on {iq.get('date_of_inquiry')} not linked to any tradeline (closest {fld}: {d.strftime('%m/%d/%Y')})"
                    })

    return violations


def _extract_numeric_code(rule_id: str) -> Optional[str]:
    """Return the Metro-2 numeric code when the identifier uses the standard prefix."""

    if not rule_id.startswith("METRO2_CODE_"):
        return None

    match = re.search(r"METRO2_CODE_(\d+)", rule_id)
    if match:
        return match.group(1)
    return None


def run_rules_for_tradeline(
    creditor_name: str,
    per_bureau: Dict[str, Dict[str, Any]],
    config: Optional[Dict[str, Any]] = None,
) -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
    """Legacy rule-runner facade that feeds the modern audit engine."""

    config = config or {}
    disabled = {str(item) for item in config.get("global", {}).get("disabled", [])}

    results: List[Dict[str, Any]] = []
    meta = {"account_numbers": {}}
    tradelines: List[Dict[str, Any]] = []

    for bureau in BUREAUS:
        record = dict(per_bureau.get(bureau, {}))
        record["creditor_name"] = creditor_name
        record["bureau"] = bureau
        tradelines.append(record)

        raw_account = record.get("account_number") or record.get("account #") or record.get("number")
        if raw_account is not None:
            meta["account_numbers"][bureau] = raw_account
            normalized = _account_number_for(record)
            if normalized:
                seen = SEEN_ACCOUNT_NUMBERS[bureau]
                if normalized in seen and "DUPLICATE_ACCOUNT" not in disabled:
                    results.append(
                        make_violation(
                            "Account",
                            "Duplicate account number reported",
                            f"{bureau} already reported account {raw_account}",
                            {
                                "id": "DUPLICATE_ACCOUNT",
                                "bureau": bureau,
                                "account_number": raw_account,
                                "rule_id": "DUPLICATE_ACCOUNT",
                            },
                        )
                    )
                else:
                    seen.add(normalized)

    audited = detect_tradeline_violations(tradelines)
    for record in audited:
        bureau = record.get("bureau")
        account_display = record.get("account_number") or meta["account_numbers"].get(bureau)
        for violation in record.get("violations", []):
            rule_id = str(violation.get("id") or "METRO2")

            # Honour legacy disable switches by either rule name or Metro2 code.
            if rule_id in disabled:
                continue
            code_hint = violation.get("code")
            if code_hint and str(code_hint) in disabled:
                continue
            numeric = _extract_numeric_code(rule_id)
            if numeric and numeric in disabled:
                continue

            if rule_id == "METRO2_CODE_10_DUPLICATE":
                if "10" in disabled or rule_id in disabled:
                    continue
                results.append(
                    make_violation(
                        "Metro2 Codes",
                        "Duplicate account number detected",
                        violation.get("title", ""),
                        {
                            "id": "10",
                            "rule_id": rule_id,
                            "bureau": bureau,
                            "account_number": violation.get("account_number") or account_display,
                        },
                    )
                )
                continue

            results.append(_translate_modern_violation(violation, bureau, account_display))

    return results, meta


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
    parser.add_argument("--debug", action="store_true", help="Enable verbose debug logging")
    args = parser.parse_args(argv)
    logger = setup_logger(args.debug)
    logger.info("Starting Metro2 audit for %s", args.input_cli or args.input)

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
    json_blob = json.dumps(data, indent=2, ensure_ascii=False, default=str)
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