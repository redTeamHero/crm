#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Central audit registry for Metro-2 / FCRA checks.

This module defines a plug-and-play rule engine that can be imported by the
HTML parser.  It attaches violations to tradelines, inquiries, and personal
information blocks, and also knows how to render a color-coded CLI summary.
"""

from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime
import re
from typing import Any, Dict, Iterable, List, Mapping, MutableMapping, Sequence


# ---------------------------------------------------------------------------
# Helper utilities
# ---------------------------------------------------------------------------


def clean_amount(value: Any) -> float:
    """Convert balances/limits to floats, tolerant of formatting noise."""

    try:
        return float(str(value).replace("$", "").replace(",", "").strip() or 0.0)
    except Exception:
        return 0.0


SANITIZE_KEY_RE = re.compile(r"[^a-z0-9]+")


def _normalize_key_name(name: str) -> str:
    normalized = SANITIZE_KEY_RE.sub("_", name.strip().lower())
    normalized = re.sub(r"_+", "_", normalized).strip("_")
    return normalized


DATE_FORMATS = (
    "%m/%d/%Y",
    "%Y-%m-%d",
    "%m-%d-%Y",
    "%Y%m%d",
    "%Y-%m-%dT%H:%M:%S",
    "%Y-%m-%dT%H:%M:%S.%f",
    "%Y-%m-%d %H:%M:%S",
    "%Y-%m-%d %H:%M:%S.%f",
)


def parse_date(value: Any) -> date | None:
    """Parse common Metro-2 date formats into :class:`datetime.date`."""

    if not value:
        return None
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value

    text = str(value).strip()
    if not text:
        return None
    if text.lower() in {"-", "--", "—", "n/a", "na", "not reported"}:
        return None

    # Normalize ISO8601 timezone shorthand (trailing Z or offsets without colon).
    normalized = text.replace("Z", "+00:00")
    if len(normalized) > 5 and normalized[-5] in {"+", "-"} and normalized[-3] != ":":
        normalized = f"{normalized[:-2]}:{normalized[-2:]}"

    try:
        return datetime.fromisoformat(normalized).date()
    except ValueError:
        pass

    # Attempt to parse datetime strings that include time portions using strptime fallbacks.
    for fmt in DATE_FORMATS:
        try:
            return datetime.strptime(normalized, fmt).date()
        except Exception:
            continue

    # As a last resort, strip time information and retry on the date component only.
    if "T" in normalized:
        date_part = normalized.split("T", 1)[0]
    elif " " in normalized:
        date_part = normalized.split(" ", 1)[0]
    else:
        date_part = normalized

    for fmt in ("%Y-%m-%d", "%m/%d/%Y", "%m-%d-%Y", "%Y%m%d"):
        try:
            return datetime.strptime(date_part, fmt).date()
        except Exception:
            continue
    return None


def today() -> date:
    return datetime.now().date()


def days_since(dt: date) -> int:
    return (today() - dt).days


def is_stale(dt: date, years: int = 2) -> bool:
    return days_since(dt) > years * 365


LAST_PAYMENT_FIELDS: Sequence[str] = (
    "date_of_last_payment",
    "date_last_payment",
    "last_payment_date",
    "last_payment",
)

CHARGEOFF_FIELDS: Sequence[str] = (
    "charge_off_date",
    "chargeoff_date",
    "date_of_chargeoff",
)

PAYOFF_FIELDS: Sequence[str] = (
    "payoff_date",
    "date_paid",
    "date_balance_zero",
)

DOFD_FIELDS: Sequence[str] = (
    "date_first_delinquency",
    "date_of_first_delinquency",
    "dofd",
)

PAST_DUE_DATE_FIELDS: Sequence[str] = (
    "past_due_date",
    "date_past_due",
)

DISPUTE_DATE_FIELDS: Sequence[str] = (
    "dispute_date",
    "date_of_dispute",
    "date_disputed",
    "dispute_filed_date",
)

SCHEDULED_PAYMENT_FIELDS: Sequence[str] = (
    "scheduled_payment_amount",
    "scheduled_monthly_payment",
    "monthly_payment",
    "scheduled_payment",
    "scheduled_payments",
    "payment_amount",
    "regular_payment_amount",
)

COMPLIANCE_CODES = {"XB", "XC", "XD", "XH", "XR", "XS"}


def _first_value(record: Mapping[str, Any], keys: Sequence[str]) -> Any:
    for key in keys:
        value = record.get(key)
        if value not in (None, ""):
            return value
    return None


def _get_last_payment_date(record: Mapping[str, Any]) -> date | None:
    return parse_date(_first_value(record, LAST_PAYMENT_FIELDS))


def _get_chargeoff_date(record: Mapping[str, Any]) -> date | None:
    return parse_date(_first_value(record, CHARGEOFF_FIELDS))


def _get_payoff_date(record: Mapping[str, Any]) -> date | None:
    return parse_date(_first_value(record, PAYOFF_FIELDS))


def _get_dofd(record: Mapping[str, Any]) -> date | None:
    return parse_date(_first_value(record, DOFD_FIELDS))


def _get_past_due_date(record: Mapping[str, Any]) -> date | None:
    return parse_date(_first_value(record, PAST_DUE_DATE_FIELDS))


def _get_dispute_date(record: Mapping[str, Any]) -> date | None:
    return parse_date(_first_value(record, DISPUTE_DATE_FIELDS))


def _get_scheduled_payment_amount(record: Mapping[str, Any]) -> float:
    return clean_amount(_first_value(record, SCHEDULED_PAYMENT_FIELDS))


def _normalize_status(value: Any) -> str:
    return str(value or "").strip().lower()


def _boolish(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    text = str(value or "").strip().lower()
    return text in {"1", "true", "yes", "y", "open", "active", "dispute"}


def _falseyish(value: Any) -> bool:
    if value is False:
        return True
    if value is None:
        return False
    text = str(value).strip().lower()
    return text in {"0", "false", "no", "n"}


def _payment_history_entries(record: Mapping[str, Any]) -> List[Mapping[str, Any]]:
    history = record.get("payment_history")
    if not history:
        return []
    if isinstance(history, Mapping):
        return [
            {"date": key, "status": value}
            for key, value in history.items()
            if value not in (None, "")
        ]
    if isinstance(history, Sequence) and not isinstance(history, (str, bytes)):
        entries: List[Mapping[str, Any]] = []
        for item in history:
            if isinstance(item, Mapping):
                entries.append(item)
        return entries
    return []


MATCH_SCORE_THRESHOLD = 80


LATE_PAYMENT_MARKERS = (
    "late",
    "delin",
    "collection",
    "charge",
    "past due",
    "repos",
    "derog",
    "30",
    "60",
    "90",
    "120",
    "150",
    "180",
)


def _payment_history_has_late(record: Mapping[str, Any]) -> bool:
    for entry in _payment_history_entries(record):
        status = _normalize_status(entry.get("status") or entry.get("payment_status"))
        if not status:
            continue
        if any(marker in status for marker in LATE_PAYMENT_MARKERS):
            return True
    return False


def _has_prior_dispute(record: Mapping[str, Any]) -> bool:
    dispute_fields = (
        "prior_dispute",
        "prior_dispute_flag",
        "previous_dispute",
        "prior_dispute_date",
        "prior_dispute_status",
        "dispute_flag",
        "dispute_status",
        "account_in_dispute",
        "remark_dispute",
    )
    for key in dispute_fields:
        if _boolish(record.get(key)):
            return True
    return False


def group_by_creditor(
    tradelines: Iterable[Mapping[str, Any]]
) -> Dict[tuple[str, str], List[Mapping[str, Any]]]:
    """Group tradelines by creditor using a cross-bureau matching score."""

    grouped: Dict[tuple[str, str], List[Mapping[str, Any]]] = {}
    by_creditor: Dict[str, List[Mapping[str, Any]]] = defaultdict(list)

    for tl in tradelines:
        name = (tl.get("creditor_name") or "UNKNOWN").strip().upper()
        by_creditor[name].append(tl)

    for name, records in by_creditor.items():
        partitions: List[List[Mapping[str, Any]]] = []
        for record in records:
            best_index = None
            best_score = float("-inf")
            for idx, partition in enumerate(partitions):
                score = _match_score(record, partition)
                if score > best_score:
                    best_score = score
                    best_index = idx
            if best_index is not None and best_score >= MATCH_SCORE_THRESHOLD:
                partitions[best_index].append(record)
            else:
                partitions.append([record])

        for idx, partition in enumerate(partitions):
            account = _normalized_account_number(partition[0])
            if not account:
                account = f"__NO_ACCOUNT__#{idx}"
            grouped[(name, account)] = partition

    return grouped


def _match_score(record: Mapping[str, Any], partition: Sequence[Mapping[str, Any]]) -> float:
    score = float("-inf")
    for candidate in partition:
        score = max(score, _match_score_pair(record, candidate))
    return score


def _match_score_pair(a: Mapping[str, Any], b: Mapping[str, Any]) -> float:
    score = 0.0

    account_a = _normalized_account_number(a)
    account_b = _normalized_account_number(b)
    if account_a and account_b:
        if account_a == account_b:
            score += 80
        else:
            score -= 100

    open_a = parse_date(a.get("date_opened"))
    open_b = parse_date(b.get("date_opened"))
    if open_a and open_b and abs((open_a - open_b).days) <= 30:
        score += 30

    last_reported_a = parse_date(a.get("last_reported") or a.get("date_last_reported"))
    last_reported_b = parse_date(b.get("last_reported") or b.get("date_last_reported"))
    if last_reported_a and last_reported_b and abs((last_reported_a - last_reported_b).days) <= 60:
        score += 20

    type_a = _account_type_bucket(a)
    type_b = _account_type_bucket(b)
    if type_a and type_b and type_a == type_b:
        score += 15

    return score


def _account_type_bucket(record: Mapping[str, Any]) -> str | None:
    values = [
        record.get("account_type"),
        record.get("account_type_detail"),
        record.get("payment_status"),
        record.get("account_status"),
        record.get("comments"),
    ]
    text = " ".join(str(val or "") for val in values).lower()
    if not text.strip():
        return None

    if "student" in text:
        return "student_loan"
    if "collection" in text or "charge-off" in text or "chargeoff" in text:
        return "collection"
    if "auto" in text or "vehicle" in text:
        return "auto"
    if "mortgage" in text or "home equity" in text or "heloc" in text:
        return "mortgage"
    if "installment" in text:
        return "installment"
    if "revolving" in text or "credit card" in text:
        return "revolving"
    if "open account" in text:
        return "open"
    return None


ACCOUNT_NUMBER_KEYS: Sequence[str] = (
    "account_number",
    "account_#",
    "number",
    "acct_number",
    "accountnumber",
    "account_num",
    "accountnum",
    "acctnumber",
    "acct_num",
    "acctnum",
)


def _normalized_account_number(tradeline: Mapping[str, Any]) -> str:
    for key in ACCOUNT_NUMBER_KEYS:
        value = tradeline.get(key)
        if value not in (None, ""):
            return "".join(ch for ch in str(value) if ch.isalnum()).upper()
    return ""


FIELD_SYNONYMS: Dict[str, Sequence[str]] = {
    "account_number": (
        "account_#",
        "acct#",
        "acct_no",
        "account no",
        "account",
        "accountnumber",
        "account_num",
        "accountnum",
        "acctnumber",
        "acct_num",
        "acctnum",
    ),
    "account_status": ("status", "acct_status"),
    "payment_status": ("pay_status", "payment history status"),
    "balance": ("balance_amount", "current_balance", "current balance"),
    "past_due": ("past_due_amount", "amount_past_due", "past due amount"),
    "credit_limit": ("limit", "credit_limit_amount", "credit limit"),
    "high_credit": ("high_balance", "highest_balance", "high credit"),
    "last_reported": ("date_last_reported", "last reported", "last update"),
    "date_opened": ("opened_date", "open_date", "date opened"),
    "date_closed": ("closed_date", "closure_date", "date of closing"),
    "date_of_last_payment": ("date_last_payment", "last_payment_date", "last payment"),
    "date_of_first_delinquency": ("date_first_delinquency", "dofd"),
    "scheduled_payment_amount": (
        "scheduled_payment",
        "scheduled_monthly_payment",
        "monthly_payment",
        "payment_amount",
        "regular_payment_amount",
    ),
    "bureau": ("credit_bureau",),
}

KNOWN_BUREAUS = {
    "transunion": "TransUnion",
    "experian": "Experian",
    "equifax": "Equifax",
}


def normalize_tradeline(record: MutableMapping[str, Any]) -> None:
    """Normalize keys and whitespace so audit rules see consistent fields."""

    if not isinstance(record, MutableMapping):
        return

    staged_updates: Dict[str, Any] = {}
    for key, value in list(record.items()):
        # Clean stray whitespace / non-breaking spaces on string values.
        if isinstance(value, str):
            cleaned = value.replace("\xa0", " ").replace("\u200b", "").strip()
            if cleaned != value:
                record[key] = cleaned
                value = cleaned

        if isinstance(key, str):
            normalized_key = _normalize_key_name(key)
            if normalized_key and normalized_key != key and normalized_key not in record:
                staged_updates[normalized_key] = value

    if staged_updates:
        record.update(staged_updates)

    for canonical, aliases in FIELD_SYNONYMS.items():
        canonical_value = record.get(canonical)
        if canonical_value not in (None, ""):
            continue
        for alias in aliases:
            candidate_keys = []
            if isinstance(alias, str):
                candidate_keys.append(alias)
                normalized = _normalize_key_name(alias)
                if normalized and normalized != alias:
                    candidate_keys.append(normalized)
            else:
                candidate_keys.append(alias)

            for candidate_key in candidate_keys:
                if candidate_key in record and record[candidate_key] not in (None, ""):
                    record[canonical] = record[candidate_key]
                    canonical_value = record[canonical]
                    break
            if canonical_value not in (None, ""):
                break

    if "bureau" in record and isinstance(record["bureau"], str):
        bureau_value = record["bureau"].strip()
        record["bureau"] = KNOWN_BUREAUS.get(bureau_value.lower(), bureau_value.title())


# ---------------------------------------------------------------------------
# Rule metadata helpers
# ---------------------------------------------------------------------------


RULE_METADATA: Dict[str, Dict[str, Any]] = {
    "MISSING_OPEN_DATE": {
        "severity": "moderate",
        "fcra_section": "FCRA §611(a)(1)",
        "category": "required_field_validation",
    },
    "BALANCE_MISMATCH": {"severity": "major", "fcra_section": "FCRA §607(b)"},
    "STATUS_MISMATCH": {"severity": "major", "fcra_section": "FCRA §607(b)"},
    "OPEN_DATE_MISMATCH": {"severity": "major", "fcra_section": "FCRA §607(b)"},
    "PAYMENT_HISTORY_MISMATCH": {"severity": "major", "fcra_section": "FCRA §607(b)"},
    "POSSIBLE_MISMATCHED_ACCOUNTS_ACROSS_BUREAUS": {
        "severity": "moderate",
        "fcra_section": "FCRA §607(b)",
    },
    "OPEN_CLOSED_MISMATCH": {"severity": "major", "fcra_section": "FCRA §623(a)(1)"},
    "INCOMPLETE_BUREAU_REPORTING": {"severity": "moderate", "fcra_section": "FCRA §623(a)(1)"},
    "STALE_DATA": {"severity": "moderate", "fcra_section": "FCRA §623(a)(2)"},
    "DUPLICATE_ACCOUNT": {"severity": "major", "fcra_section": "FCRA §607(b)"},
    "ACCOUNT_TYPE_MISMATCH": {"severity": "moderate", "fcra_section": "FCRA §607(b)"},
    "HIGH_UTILIZATION": {"severity": "minor", "fcra_section": "FCRA §607(b)"},
    "DISPUTE_PENDING_TOO_LONG": {"severity": "major", "fcra_section": "FCRA §623(a)(3)"},
    "MISSING_LAST_PAYMENT_DATE": {
        "severity": "moderate",
        "fcra_section": "FCRA §623(a)(1)",
        "category": "required_field_validation",
    },
    "ACCOUNT_OPENED_AFTER_LAST_PAYMENT_DATE": {"severity": "major", "fcra_section": "FCRA §607(b)"},
    "DATE_CLOSED_INCONSISTENT_WITH_STATUS": {"severity": "major", "fcra_section": "FCRA §623(a)(1)"},
    "INACCURATE_LAST_PAYMENT_DATE": {"severity": "major", "fcra_section": "FCRA §607(b)"},
    "POST_CHARGEOFF_PAYMENT_REPORTED": {"severity": "major", "fcra_section": "FCRA §607(b)"},
    "CURRENT_NO_LAST_PAYMENT_DATE": {"severity": "moderate", "fcra_section": "FCRA §623(a)(1)"},
    "STALE_ACTIVE_REPORTING": {"severity": "moderate", "fcra_section": "FCRA §623(a)(2)"},
    "PASTDUE_NO_LAST_PAYMENT_DATE": {"severity": "moderate", "fcra_section": "FCRA §623(a)(1)"},
    "PAYMENT_AFTER_PAYOFF": {"severity": "moderate", "fcra_section": "FCRA §607(b)"},
    "LAST_PAYMENT_AFTER_DOFD": {"severity": "major", "fcra_section": "FCRA §623(a)(5)"},
    "LAST_PAYMENT_AFTER_LAST_REPORTED": {"severity": "moderate", "fcra_section": "FCRA §607(b)"},
    "PAYMENT_BEFORE_DELINQUENCY_IMPLIES_CURE": {"severity": "moderate", "fcra_section": "FCRA §607(b)"},
    "STAGNANT_ACCOUNT_NOT_UPDATED": {"severity": "moderate", "fcra_section": "FCRA §623(a)(2)"},
    "PAYMENT_STALENESS_INCONSISTENT_WITH_STATUS": {"severity": "moderate", "fcra_section": "FCRA §607(b)"},
    "INQUIRY_NO_MATCH": {"severity": "moderate", "fcra_section": "FCRA §604(a)(3)(F)"},
    "NAME_MISMATCH": {"severity": "moderate", "fcra_section": "FCRA §607(b)"},
    "ADDRESS_MISMATCH": {"severity": "moderate", "fcra_section": "FCRA §607(b)"},
    "PAYMENT_REPORTED_AFTER_CLOSURE": {"severity": "major", "fcra_section": "FCRA §623(a)(2) / §607(b)"},
    "CLOSED_ACCOUNT_STILL_REPORTING_PAYMENT": {"severity": "major", "fcra_section": "FCRA §607(b)"},
    "LAST_PAYMENT_MISMATCH_BETWEEN_BU": {"severity": "major", "fcra_section": "FCRA §623(a)(5)"},
    "LAST_PAYMENT_AFTER_CHARGEOFF_DATE": {"severity": "major", "fcra_section": "FCRA §623(a)(5) / §607(b)"},
    "MISSING_LAST_PAYMENT_DATE_FOR_PAID": {"severity": "moderate", "fcra_section": "FCRA §623(a)(2)"},
    "INCONSISTENT_PAYMENT_RATING_ON_CLOSE": {"severity": "major", "fcra_section": "FCRA §623(a)(2) / §607(b)"},
    "NO_ACTIVITY_TOO_LONG_ACTIVE": {"severity": "moderate", "fcra_section": "FCRA §623(a)(2)"},
    "PAYMENT_AFTER_PAYOFF_DATE": {"severity": "moderate", "fcra_section": "FCRA §607(b)"},
    "MISMATCH_BALANCE_ON_CLOSED": {"severity": "major", "fcra_section": "FCRA §623(a)(1) / §607(b)"},
    "INCONSISTENT_ACCOUNT_STATUS_ON_CLOSED": {"severity": "major", "fcra_section": "FCRA §623(a)(1)"},
    "DISPUTE_FLAG_NOT_CLEARED_AFTER_RESOLUTION": {"severity": "major", "fcra_section": "FCRA §623(a)(3)"},
    "COMPLIANCE_CONDITION_CODE_MISSING_ON_DISPUTE": {"severity": "major", "fcra_section": "FCRA §623(a)(3)"},
    "INCONSISTENT_SPECIAL_COMMENT_ON_SETTLEMENT": {"severity": "moderate", "fcra_section": "FCRA §623(a)(2)"},
    "INCORRECT_ECOA_CODE_FOR_AUTHORIZED_USER": {"severity": "major", "fcra_section": "FCRA §623(a)(1)"},
    "MISMATCH_LAST_REPORTED_BEFORE_ACTIVITY": {"severity": "moderate", "fcra_section": "FCRA §623(a)(2)"},
    "INCORRECT_PAYMENT_HISTORY_AFTER_CLOSURE": {"severity": "major", "fcra_section": "FCRA §607(b) / §623(a)(1)"},
    "REAGING_WITHOUT_PROOF": {"severity": "major", "fcra_section": "FCRA §623(a)(5)"},
    "EXTENDED_DELINQUENCY_BEYOND_MAX": {"severity": "major", "fcra_section": "FCRA §623(a)(1)"},
    "MISMATCH_PORTFOLIO_TYPE_VS_ACCOUNT_TYPE": {"severity": "moderate", "fcra_section": "FCRA §623(a)(1)"},
    "MISMATCH_COLLATERAL_INDICATOR": {"severity": "moderate", "fcra_section": "FCRA §607(b) / §623(a)(1)"},
    "LATE_DATE_BUT_STATUS_CURRENT": {"severity": "major", "fcra_section": "FCRA §623(a)(1)"},
    "FIRST_DELINQUENCY_DATE_NOT_FROZEN": {"severity": "major", "fcra_section": "FCRA §623(a)(5)"},
    "NON_ZERO_BALANCE_WITH_ZERO_HI_CREDIT": {"severity": "moderate", "fcra_section": "FCRA §623(a)(1)"},
    "REPORT_DATE_MISSING_OR_INVALID": {"severity": "moderate", "fcra_section": "FCRA §623(a)(2)"},
    "DATE_OPENED_AFTER_CHARGEOFF": {"severity": "major", "fcra_section": "FCRA §607(b)"},
    "CLOSURE_DATE_EQUALS_DOFD": {"severity": "moderate", "fcra_section": "FCRA §607(b)"},
    "REOPENED_ACCOUNT_NO_NEW_OPEN_DATE": {"severity": "moderate", "fcra_section": "FCRA §623(a)(1)"},
    "PAST_DUE_AFTER_CLOSURE_DATE": {"severity": "major", "fcra_section": "FCRA §607(b)"},
    "DOFD_AFTER_LAST_PAYMENT": {"severity": "major", "fcra_section": "FCRA §623(a)(5)"},
    "LAST_REPORTED_MISMATCH": {"severity": "major", "fcra_section": "FCRA §607(b)"},
    "HIGH_CREDIT_EXCEEDS_LIMIT": {"severity": "major", "fcra_section": "FCRA §607(b)"},
    "fcra_dofd_invalid": {"severity": "major", "fcra_section": "FCRA §623(a)(5) / §605(a)(4)"},
    "collection_status_inconsistent": {"severity": "major", "fcra_section": "FCRA §607(b)"},
    "missing_last_payment_date": {
        "severity": "major",
        "fcra_section": "FCRA §607(b) / §611(a)(1)(A)",
        "category": "required_field_validation",
    },
    "balance_status_conflict": {"severity": "major", "fcra_section": "FCRA §607(b)"},
    "chargeoff_continues_reporting": {"severity": "moderate", "fcra_section": "FCRA §607(b)"},
    "high_credit_equals_balance": {"severity": "moderate", "fcra_section": "FCRA §607(b)"},
    "open_date_mismatch": {"severity": "major", "fcra_section": "FCRA §607(b)"},
    "comment_field_conflict": {"severity": "moderate", "fcra_section": "FCRA §607(b)"},
    "duplicate_collection_account": {"severity": "major", "fcra_section": "FCRA §607(b)"},
    "furnisher_identity_unclear": {"severity": "major", "fcra_section": "FCRA §611(a)(1)(A)"},
    "failure_to_correct_after_dispute": {"severity": "major", "fcra_section": "FCRA §611(a)(5) / §623(b)"},
    "missing_account_number": {
        "severity": "major",
        "fcra_section": "FCRA §607(b)",
        "category": "required_field_validation",
    },
    "missing_date_opened": {
        "severity": "moderate",
        "fcra_section": "FCRA §607(b)",
        "category": "required_field_validation",
    },
    "missing_dofd": {
        "severity": "major",
        "fcra_section": "FCRA §623(a)(5) / §605(a)(4)",
        "category": "required_field_validation",
    },
    "balance_reporting_without_post_chargeoff_activity": {
        "severity": "major",
        "fcra_section": "FCRA §1681e(b) / §1681s-2(a)(1)(A)",
        "category": "factual_dispute",
        "requires": ["comparison", "timeline"],
    },
    "open_account_reported_in_collection": {
        "severity": "major",
        "fcra_section": "FCRA §1681e(b)",
        "category": "factual_dispute",
        "requires": ["comparison"],
    },
    "cross_bureau_balance_conflict": {
        "severity": "major",
        "fcra_section": "FCRA §1681e(b) / §1681i(a)(1)(A)",
        "category": "factual_dispute",
        "requires": ["comparison"],
    },
    "dofd_precedes_date_opened": {
        "severity": "major",
        "fcra_section": "FCRA §1681c(a)(4) / §1681e(b)",
        "category": "factual_dispute",
        "requires": ["comparison", "timeline"],
    },
    "payment_history_status_conflict": {
        "severity": "moderate",
        "fcra_section": "FCRA §1681e(b)",
        "category": "factual_dispute",
        "requires": ["comparison"],
    },
    "post_dispute_update_no_correction": {
        "severity": "major",
        "fcra_section": "FCRA §1681i(a)(5)(A)",
        "category": "factual_dispute",
        "requires": ["comparison", "timeline"],
    },
    "collection_reaging_detected": {
        "severity": "major",
        "fcra_section": "FCRA §1681c(a)(4) / §1681s-2(a)(5)",
        "category": "factual_dispute",
        "requires": ["comparison", "timeline"],
    },
    "consumer_denies_account_ownership": {
        "severity": "major",
        "fcra_section": "FCRA §1681i(a)(1)(A)",
        "category": "factual_dispute",
        "requires": ["consumer_assertion"],
    },
}


def _attach_violation(
    record: MutableMapping[str, Any], rule_id: str, title: str, extra: Dict[str, Any] | None = None
) -> None:
    meta = RULE_METADATA.get(rule_id, {"severity": "minor", "fcra_section": "FCRA §607(b)"})
    violation = {
        "id": rule_id,
        "title": title,
        "severity": meta["severity"],
        "fcra_section": meta["fcra_section"],
    }
    if "category" in meta:
        violation["category"] = meta["category"]
    if "requires" in meta:
        violation["requires"] = meta["requires"]
    if extra:
        violation.update(extra)
    record.setdefault("violations", []).append(violation)


def _has_violation(record: Mapping[str, Any], rule_id: str) -> bool:
    return any(v.get("id") == rule_id for v in record.get("violations", []) or [])


# ---------------------------------------------------------------------------
# Tradeline audits
# ---------------------------------------------------------------------------


def audit_missing_open_date(tradelines: Iterable[MutableMapping[str, Any]]) -> None:
    for record in tradelines:
        if not record.get("date_opened"):
            _attach_violation(record, "MISSING_OPEN_DATE", "Missing Date Opened")
            _attach_violation(record, "missing_date_opened", "Missing Date Opened")
        if not _normalized_account_number(record):
            last_reported = record.get("last_reported") or record.get("date_last_reported")
            if last_reported:
                _attach_violation(
                    record,
                    "missing_account_number",
                    "Active tradeline missing account number",
                )


def audit_balance_status_mismatch(tradelines: Iterable[MutableMapping[str, Any]]) -> None:
    grouped = group_by_creditor(tradelines)
    for records in grouped.values():
        if len(records) < 2:
            continue

        balances = {clean_amount(r.get("balance")) for r in records if r.get("balance")}
        bureaus = {r.get("bureau") for r in records if r.get("bureau")}
        statuses = {str(r.get("account_status") or "").strip().lower() for r in records if r.get("account_status")}
        open_dates = {str(r.get("date_opened") or "").strip() for r in records if r.get("date_opened")}
        last_payments = {dt for r in records if (dt := _get_last_payment_date(r))}
        dofds = {dt for r in records if (dt := _get_dofd(r))}
        last_reported_values = []
        for r in records:
            raw_value = str(r.get("last_reported") or r.get("date_last_reported") or "").strip()
            if not raw_value:
                last_reported_values.append("__missing__")
                continue
            parsed = parse_date(raw_value)
            if parsed:
                last_reported_values.append(parsed.isoformat())
            else:
                last_reported_values.append(raw_value.lower())
        distinct_last_reported = {value for value in last_reported_values if value}

        if len(balances) > 1:
            for r in records:
                _attach_violation(r, "BALANCE_MISMATCH", "Balance mismatch across bureaus")
                if len(bureaus) > 1:
                    _attach_violation(
                        r,
                        "cross_bureau_balance_conflict",
                        "Balance differs across consumer reporting agencies",
                    )

        if len(statuses) > 1:
            for r in records:
                _attach_violation(r, "STATUS_MISMATCH", "Status mismatch across bureaus")

        if len(open_dates) > 1:
            for r in records:
                _attach_violation(r, "OPEN_DATE_MISMATCH", "Date Opened differs across bureaus")
                _attach_violation(r, "open_date_mismatch", "Date Opened differs across bureaus")

        if len(last_payments) > 1:
            for r in records:
                _attach_violation(
                    r,
                    "LAST_PAYMENT_MISMATCH_BETWEEN_BU",
                    "Last payment date differs across bureaus",
                )

        if len(dofds) > 1:
            for r in records:
                _attach_violation(
                    r,
                    "FIRST_DELINQUENCY_DATE_NOT_FROZEN",
                    "Date of First Delinquency inconsistent across bureaus",
                )
                _attach_violation(
                    r,
                    "fcra_dofd_invalid",
                    "Date of First Delinquency is inconsistent across bureaus",
                )

        if len(distinct_last_reported) > 1:
            pretty = ", ".join(sorted({r.get("last_reported") or r.get("date_last_reported") or "Missing" for r in records}))
            for r in records:
                _attach_violation(
                    r,
                    "LAST_REPORTED_MISMATCH",
                    f"Last Reported differs across bureaus ({pretty})",
                )


def audit_possible_mismatched_accounts(tradelines: Iterable[MutableMapping[str, Any]]) -> None:
    by_creditor: Dict[str, List[MutableMapping[str, Any]]] = defaultdict(list)
    for record in tradelines:
        name = (record.get("creditor_name") or "UNKNOWN").strip().upper()
        by_creditor[name].append(record)

    for name, records in by_creditor.items():
        account_numbers = {_normalized_account_number(r) for r in records if _normalized_account_number(r)}
        bureaus = {r.get("bureau") for r in records if r.get("bureau")}
        if len(account_numbers) < 2 or len(bureaus) < 2:
            continue

        detail = f"Multiple account numbers reported under {name} across bureaus."
        for record in records:
            _attach_violation(
                record,
                "POSSIBLE_MISMATCHED_ACCOUNTS_ACROSS_BUREAUS",
                detail,
            )


def audit_payment_history_mismatch(tradelines: Iterable[MutableMapping[str, Any]]) -> None:
    grouped = group_by_creditor(tradelines)
    for records in grouped.values():
        histories = {str(r.get("payment_status") or "").strip().lower() for r in records if r.get("payment_status")}
        if {"late", "ok"}.issubset({word for hist in histories for word in hist.split()}):
            for r in records:
                _attach_violation(
                    r,
                    "PAYMENT_HISTORY_MISMATCH",
                    "One bureau reports late while others show OK",
                )


def audit_open_closed_mismatch(tradelines: Iterable[MutableMapping[str, Any]]) -> None:
    grouped = group_by_creditor(tradelines)
    for records in grouped.values():
        statuses = [str(r.get("account_status") or "").lower() for r in records if r.get("account_status")]
        if statuses and any("closed" in status for status in statuses) and any("open" in status for status in statuses):
            for r in records:
                _attach_violation(
                    r,
                    "OPEN_CLOSED_MISMATCH",
                    "Account marked closed on one bureau but open on another",
                )


def audit_missing_bureau(tradelines: Iterable[MutableMapping[str, Any]]) -> None:
    grouped = group_by_creditor(tradelines)
    for records in grouped.values():
        bureaus = sorted({r.get("bureau") for r in records if r.get("bureau")})
        if len(bureaus) and len(bureaus) < 3:
            joined = ", ".join(bureaus) or "Unknown"
            for r in records:
                _attach_violation(
                    r,
                    "INCOMPLETE_BUREAU_REPORTING",
                    f"Reported to {joined} only",
                )


def audit_stale_data(tradelines: Iterable[MutableMapping[str, Any]]) -> None:
    for record in tradelines:
        dt_str = record.get("last_reported") or record.get("date_last_reported")
        if not dt_str:
            continue
        try:
            dt = datetime.strptime(dt_str.strip(), "%m/%d/%Y")
        except Exception:
            continue
        if (datetime.now() - dt).days > 365:
            _attach_violation(record, "STALE_DATA", "Account not updated in over 12 months")


def audit_duplicate_accounts(tradelines: Iterable[MutableMapping[str, Any]]) -> None:
    seen: Dict[tuple, Mapping[str, Any]] = {}
    for record in tradelines:
        key = (record.get("bureau"), _normalized_account_number(record))
        if key in seen and key[1]:
            _attach_violation(
                record,
                "DUPLICATE_ACCOUNT",
                f"Duplicate account entry for {key[1]}",
            )
        else:
            seen[key] = record


def audit_reaged_accounts(tradelines: Iterable[MutableMapping[str, Any]]) -> None:
    for record in tradelines:
        dofd = record.get("date_first_delinquency") or record.get("date_of_first_delinquency")
        if not dofd:
            continue
        try:
            dt = datetime.strptime(dofd.strip(), "%m/%d/%Y")
        except Exception:
            continue
        if (datetime.now() - dt).days < 180:
            _attach_violation(
                record,
                "REAGING_WITHOUT_PROOF",
                "DOFD is less than 6 months ago — possible re-aging",
            )


def audit_account_type_mismatch(tradelines: Iterable[MutableMapping[str, Any]]) -> None:
    grouped = group_by_creditor(tradelines)
    for records in grouped.values():
        types = {str(r.get("account_type") or "").strip().lower() for r in records if r.get("account_type")}
        if len(types) > 1:
            for r in records:
                _attach_violation(
                    r,
                    "ACCOUNT_TYPE_MISMATCH",
                    "Different account type reported across bureaus",
                )


def audit_high_utilization(tradelines: Iterable[MutableMapping[str, Any]]) -> None:
    for record in tradelines:
        balance = clean_amount(record.get("balance"))
        limit = clean_amount(record.get("credit_limit"))
        if limit > 0 and (balance / limit) > 0.9:
            _attach_violation(
                record,
                "HIGH_UTILIZATION",
                "Account balance exceeds 90% of limit",
            )


def audit_stale_disputes(tradelines: Iterable[MutableMapping[str, Any]]) -> None:
    for record in tradelines:
        comment = str(record.get("comments") or "").lower()
        if "dispute" in comment and "resolved" not in comment:
            _attach_violation(
                record,
                "DISPUTE_PENDING_TOO_LONG",
                "Dispute notation present without resolution",
            )


def audit_dofd_integrity(tradelines: Iterable[MutableMapping[str, Any]]) -> None:
    delinquency_keywords = ("late", "collection", "charge", "derog")
    for record in tradelines:
        status = _normalize_status(record.get("account_status"))
        payment_status = _normalize_status(record.get("payment_status"))
        dofd = _get_dofd(record)
        past_due_date = _get_past_due_date(record)

        bucket = _account_type_bucket(record) or ""
        is_delinquent = (
            any(keyword in status for keyword in delinquency_keywords)
            or any(keyword in payment_status for keyword in delinquency_keywords)
            or bucket == "collection"
        )

        if is_delinquent and not dofd:
            _attach_violation(
                record,
                "missing_dofd",
                "Missing Date of First Delinquency on derogatory account",
            )
            _attach_violation(
                record,
                "fcra_dofd_invalid",
                "Missing Date of First Delinquency on derogatory account",
            )
            continue

        if dofd and past_due_date and dofd > past_due_date:
            _attach_violation(
                record,
                "fcra_dofd_invalid",
                "DOFD occurs after the first reported delinquency date",
            )
            continue

        if dofd:
            delinquency_dates = []
            for entry in _payment_history_entries(record):
                hist_status = _normalize_status(entry.get("status"))
                if any(keyword in hist_status for keyword in delinquency_keywords):
                    hist_date = parse_date(entry.get("date"))
                    if hist_date:
                        delinquency_dates.append(hist_date)
            if delinquency_dates and dofd > min(delinquency_dates):
                _attach_violation(
                    record,
                    "fcra_dofd_invalid",
                    "DOFD post-dates the first delinquency in payment history",
                )


def audit_collection_status_inconsistent(tradelines: Iterable[MutableMapping[str, Any]]) -> None:
    for record in tradelines:
        status = _normalize_status(record.get("account_status"))
        bucket = _account_type_bucket(record)
        balance = clean_amount(record.get("balance"))

        if bucket == "collection" and "open" in status and balance > 0:
            _attach_violation(
                record,
                "collection_status_inconsistent",
                "Collection account reported as open with an active balance",
            )


def audit_balance_status_conflict(tradelines: Iterable[MutableMapping[str, Any]]) -> None:
    for record in tradelines:
        status = _normalize_status(record.get("account_status"))
        payment_status = _normalize_status(record.get("payment_status"))
        balance = clean_amount(record.get("balance"))

        derogatory = any(keyword in status for keyword in ("late", "collection", "charge", "delin"))
        derogatory = derogatory or any(keyword in payment_status for keyword in ("late", "collection", "charge", "delin"))

        paid_or_closed = any(keyword in status for keyword in ("paid", "closed", "settled", "paid in full"))
        paid_or_closed = paid_or_closed or any(keyword in payment_status for keyword in ("paid", "closed", "settled"))

        if balance == 0 and derogatory:
            _attach_violation(
                record,
                "balance_status_conflict",
                "Zero balance conflicts with delinquent status",
            )

        if balance > 0 and paid_or_closed:
            _attach_violation(
                record,
                "balance_status_conflict",
                "Positive balance reported alongside a paid/closed status",
            )


def audit_factual_disputes(tradelines: Iterable[MutableMapping[str, Any]]) -> None:
    for record in tradelines:
        status = _normalize_status(record.get("account_status"))
        payment_status = _normalize_status(record.get("payment_status"))
        balance = clean_amount(record.get("balance"))
        chargeoff_date = _get_chargeoff_date(record)
        last_payment = _get_last_payment_date(record)
        dofd = _get_dofd(record)
        date_opened = parse_date(record.get("date_opened"))
        last_reported = parse_date(record.get("last_reported") or record.get("date_last_reported"))
        dispute_date = _get_dispute_date(record)

        if chargeoff_date and balance > 0 and ("charge" in status or "charge" in payment_status):
            post_chargeoff_activity = []
            for entry in _payment_history_entries(record):
                hist_date = parse_date(entry.get("date"))
                if hist_date and hist_date > chargeoff_date:
                    post_chargeoff_activity.append(hist_date)
            has_post_chargeoff_payment = last_payment and last_payment > chargeoff_date
            if not post_chargeoff_activity and not has_post_chargeoff_payment:
                _attach_violation(
                    record,
                    "balance_reporting_without_post_chargeoff_activity",
                    "Balance reported after charge-off without post-charge-off activity",
                )

        if "open" in status and (
            any(keyword in payment_status for keyword in ("collection", "charge"))
            or "collection" in status
            or _account_type_bucket(record) == "collection"
        ):
            _attach_violation(
                record,
                "open_account_reported_in_collection",
                "Account reported as open while also marked for collection/charge-off",
            )

        if dofd and date_opened and dofd < date_opened:
            _attach_violation(
                record,
                "dofd_precedes_date_opened",
                "Date of First Delinquency precedes Date Opened",
            )

        if _payment_history_has_late(record) and (
            "current" in status or "current" in payment_status
        ):
            _attach_violation(
                record,
                "payment_history_status_conflict",
                "Payment history shows late activity while account is reported current",
            )

        if _has_prior_dispute(record) and dispute_date and last_reported and last_reported > dispute_date:
            material_fields_changed = record.get("material_fields_changed")
            if material_fields_changed is None:
                material_fields_changed = record.get("material_fields_change") or record.get("material_fields_updated")
            if _falseyish(material_fields_changed):
                _attach_violation(
                    record,
                    "post_dispute_update_no_correction",
                    "Account updated after dispute with no material corrections noted",
                )

        reaging_flag = None
        for key in (
            "date_of_first_delinquency_changed",
            "date_first_delinquency_changed",
            "dofd_changed",
            "changed_after_collection",
        ):
            if key in record:
                reaging_flag = record.get(key)
                break
        if reaging_flag is not None and _boolish(reaging_flag):
            bucket = _account_type_bucket(record)
            if (
                bucket == "collection"
                or "collection" in status
                or any(keyword in payment_status for keyword in ("collection", "charge"))
            ):
                _attach_violation(
                    record,
                    "collection_reaging_detected",
                    "Collection account indicates a changed DOFD after entering collection",
                )

        consumer_assertion = _normalize_status(record.get("consumer_assertion") or record.get("consumer_assertions"))
        if consumer_assertion in {"not_mine", "not my account", "not my", "notmine"}:
            ownership_proof = (
                record.get("ownership_proof")
                or record.get("ownership_verification")
                or record.get("ownership_documents")
            )
            if not ownership_proof:
                _attach_violation(
                    record,
                    "consumer_denies_account_ownership",
                    "Consumer disputes ownership without supporting verification",
                )


def audit_comment_field_conflict(tradelines: Iterable[MutableMapping[str, Any]]) -> None:
    for record in tradelines:
        comment = _normalize_status(record.get("comments") or record.get("special_comment"))
        if not comment:
            continue

        bucket = _account_type_bucket(record)
        balance = clean_amount(record.get("balance"))

        if "collection" in comment and bucket != "collection":
            _attach_violation(
                record,
                "comment_field_conflict",
                "Comments indicate collection activity but account type is not collection",
            )

        if any(keyword in comment for keyword in ("paid", "paid in full", "settled")) and balance > 0:
            _attach_violation(
                record,
                "comment_field_conflict",
                "Comments indicate paid status while balance remains outstanding",
            )


def audit_collection_high_credit(tradelines: Iterable[MutableMapping[str, Any]]) -> None:
    for record in tradelines:
        bucket = _account_type_bucket(record)
        if bucket != "collection":
            continue
        balance = clean_amount(record.get("balance"))
        high_credit = clean_amount(record.get("high_credit"))
        if balance > 0 and high_credit > 0 and abs(high_credit - balance) < 0.01:
            _attach_violation(
                record,
                "high_credit_equals_balance",
                "Collection account reports High Credit equal to current balance",
            )


def audit_chargeoff_continues_reporting(tradelines: Iterable[MutableMapping[str, Any]]) -> None:
    for record in tradelines:
        status = _normalize_status(record.get("account_status"))
        payment_status = _normalize_status(record.get("payment_status"))
        if "charge" not in status and "charge" not in payment_status:
            continue

        chargeoff_date = _get_chargeoff_date(record)
        if not chargeoff_date:
            continue

        post_charge_history = []
        for entry in _payment_history_entries(record):
            hist_date = parse_date(entry.get("date"))
            if hist_date and hist_date > chargeoff_date:
                post_charge_history.append(hist_date)

        if len(post_charge_history) >= 2:
            _attach_violation(
                record,
                "chargeoff_continues_reporting",
                "Charge-off continues to update after charge-off date",
            )


def audit_duplicate_collection_accounts(tradelines: Iterable[MutableMapping[str, Any]]) -> None:
    grouped: Dict[tuple, List[MutableMapping[str, Any]]] = defaultdict(list)
    for record in tradelines:
        if _account_type_bucket(record) != "collection":
            continue

        original_creditor = (
            record.get("original_creditor")
            or record.get("original_creditor_name")
            or record.get("original_creditor_name_raw")
        )
        original_creditor = str(original_creditor or "").strip().upper()
        if not original_creditor:
            continue

        balance = clean_amount(record.get("balance"))
        if balance <= 0:
            continue

        grouped[(original_creditor, balance)].append(record)

    for (original_creditor, balance), records in grouped.items():
        agencies = {
            str(r.get("creditor_name") or "").strip().upper()
            for r in records
            if r.get("creditor_name")
        }
        if len(agencies) > 1:
            pretty_balance = f"${balance:,.2f}"
            for record in records:
                _attach_violation(
                    record,
                    "duplicate_collection_account",
                    f"Multiple collection agencies reporting {pretty_balance} for {original_creditor.title()}",
                )


def audit_furnisher_identity_unclear(tradelines: Iterable[MutableMapping[str, Any]]) -> None:
    grouped: Dict[str, List[MutableMapping[str, Any]]] = defaultdict(list)
    for record in tradelines:
        account_number = _normalized_account_number(record)
        if not account_number:
            continue
        grouped[account_number].append(record)

    for account_number, records in grouped.items():
        creditors = {
            str(r.get("creditor_name") or "").strip().upper()
            for r in records
            if r.get("creditor_name")
        }
        if len(creditors) > 1:
            for record in records:
                _attach_violation(
                    record,
                    "furnisher_identity_unclear",
                    f"Furnisher name varies across bureaus for account {account_number}",
                )


def audit_missing_payment_date(tradelines: Iterable[MutableMapping[str, Any]]) -> None:
    for record in tradelines:
        payment_status = _normalize_status(record.get("payment_status"))
        status = _normalize_status(record.get("account_status"))
        comments = _normalize_status(record.get("comments"))

        last_payment = _get_last_payment_date(record)

        date_opened = parse_date(record.get("date_opened"))
        date_closed = parse_date(record.get("date_closed") or record.get("date_of_closing"))
        chargeoff_date = _get_chargeoff_date(record)
        dofd = _get_dofd(record)
        payoff_date = _get_payoff_date(record)
        last_reported = parse_date(record.get("last_reported") or record.get("date_last_reported"))
        past_due_date = _get_past_due_date(record)

        balance = clean_amount(record.get("balance"))
        past_due = clean_amount(record.get("past_due") or record.get("amount_past_due"))

        delinquency_markers = ("late", "collection", "charge", "delin", "repos", "derog")
        is_delinquent = any(marker in status for marker in delinquency_markers) or any(
            marker in payment_status for marker in delinquency_markers
        )
        is_delinquent = is_delinquent or any(marker in comments for marker in delinquency_markers)
        if is_delinquent and not last_payment:
            _attach_violation(
                record,
                "missing_last_payment_date",
                "Delinquent account missing a Date of Last Payment",
            )

        # Existing guard: Charged-off accounts should carry a payment date to validate charge-off timing.
        if "charge" in payment_status and not last_payment:
            _attach_violation(
                record,
                "MISSING_LAST_PAYMENT_DATE",
                "Charged-off account missing last payment date",
            )

        # Baseline reporting integrity for Last Reported date.
        last_reported_raw = record.get("last_reported") or record.get("date_last_reported")
        if not last_reported_raw:
            _attach_violation(
                record,
                "REPORT_DATE_MISSING_OR_INVALID",
                "Missing Last Reported date",
            )
        elif last_reported and last_reported > today():
            _attach_violation(
                record,
                "REPORT_DATE_MISSING_OR_INVALID",
                "Last Reported date cannot be in the future",
            )
        elif last_reported_raw and not last_reported:
            _attach_violation(
                record,
                "REPORT_DATE_MISSING_OR_INVALID",
                "Last Reported date is invalid",
            )

        # A. Payment cannot precede the account being opened.
        if last_payment and date_opened and last_payment < date_opened:
            _attach_violation(
                record,
                "ACCOUNT_OPENED_AFTER_LAST_PAYMENT_DATE",
                "Last payment predates Date Opened",
            )

        # B. Payment cannot occur after closure (unless supported by re-open data).
        if last_payment and date_closed and last_payment > date_closed:
            _attach_violation(
                record,
                "PAYMENT_REPORTED_AFTER_CLOSURE",
                "Payment reported after the account was closed",
            )

        # C. Payment date cannot be in the future.
        if last_payment and last_payment > today():
            _attach_violation(
                record,
                "INACCURATE_LAST_PAYMENT_DATE",
                "Last payment date is in the future",
            )

        # D. Charged-off or collection accounts should not have new payments after charge-off.
        if last_payment and chargeoff_date and ("charge" in status or "collection" in status):
            if last_payment > chargeoff_date:
                _attach_violation(
                    record,
                    "LAST_PAYMENT_AFTER_CHARGEOFF_DATE",
                    "Payment activity reported after charge-off date",
                )

        # E. Accounts reported as "Current" but have no last payment date at all.
        if "current" in status and not last_payment:
            _attach_violation(
                record,
                "CURRENT_NO_LAST_PAYMENT_DATE",
                "Current status lacks a Date of Last Payment",
            )

        # F. Accounts marked "Paid/Closed/Settled" should include a final payment date.
        if not last_payment and any(keyword in status for keyword in ("paid", "closed", "settled")):
            if not _has_violation(record, "MISSING_LAST_PAYMENT_DATE"):
                _attach_violation(
                    record,
                    "MISSING_LAST_PAYMENT_DATE_FOR_PAID",
                    "Closed/paid account missing last payment date",
                )

        # G. Non-zero balance but ancient or missing last payment.
        if balance > 0 and (not last_payment or (last_payment and is_stale(last_payment, years=3))):
            _attach_violation(
                record,
                "STALE_ACTIVE_REPORTING",
                "Active balance without recent payment activity",
            )

        # H. Past-due amount exists but last payment date missing.
        if past_due > 0 and not last_payment:
            _attach_violation(
                record,
                "PASTDUE_NO_LAST_PAYMENT_DATE",
                "Past-due balance reported without a last payment date",
            )

        # I. Payment after balance already zeroed (requires payoff date signal).
        if balance == 0 and payoff_date and last_payment and last_payment > payoff_date:
            _attach_violation(
                record,
                "PAYMENT_AFTER_PAYOFF_DATE",
                "Payment reported after payoff date",
            )

        # J. Last payment cannot be after DOFD on charge-offs.
        if last_payment and dofd and ("charge" in status or "collection" in status):
            if last_payment > dofd:
                _attach_violation(
                    record,
                    "LAST_PAYMENT_AFTER_DOFD",
                    "Last payment date conflicts with DOFD",
                )

        # K. Last payment should not post after the Last Reported date.
        if last_payment and last_reported and last_payment > last_reported and not _has_violation(
            record, "MISMATCH_LAST_REPORTED_BEFORE_ACTIVITY"
        ):
            _attach_violation(
                record,
                "MISMATCH_LAST_REPORTED_BEFORE_ACTIVITY",
                "Payment reported after Last Reported date",
            )

        if date_closed and last_reported and date_closed > last_reported and not _has_violation(
            record, "MISMATCH_LAST_REPORTED_BEFORE_ACTIVITY"
        ):
            _attach_violation(
                record,
                "MISMATCH_LAST_REPORTED_BEFORE_ACTIVITY",
                "Closure date reported after last update",
            )

        if chargeoff_date and last_reported and chargeoff_date > last_reported and not _has_violation(
            record, "MISMATCH_LAST_REPORTED_BEFORE_ACTIVITY"
        ):
            _attach_violation(
                record,
                "MISMATCH_LAST_REPORTED_BEFORE_ACTIVITY",
                "Charge-off date occurs after last reported timestamp",
            )

        # L. If payment posts after DOFD, the account should have cured the delinquency.
        if (
            last_payment
            and dofd
            and last_payment > dofd
            and not _has_violation(record, "LAST_PAYMENT_AFTER_DOFD")
        ):
            _attach_violation(
                record,
                "PAYMENT_BEFORE_DELINQUENCY_IMPLIES_CURE",
                "Last payment posted after DOFD but delinquency persists",
            )

        # M. No payment activity for 5+ years but status still active.
        if last_payment and any(keyword in status for keyword in ("current", "late")):
            if is_stale(last_payment, years=5):
                _attach_violation(
                    record,
                    "STAGNANT_ACCOUNT_NOT_UPDATED",
                    "Account active with no payment for 5+ years",
                )

        # N. Current status but last payment older than 120 days.
        if last_payment and "current" in status and days_since(last_payment) > 120:
            _attach_violation(
                record,
                "PAYMENT_STALENESS_INCONSISTENT_WITH_STATUS",
                "Current account with stale last payment date",
            )

        if last_payment and any(keyword in status for keyword in ("open", "current", "active")):
            if is_stale(last_payment, years=3):
                _attach_violation(
                    record,
                    "NO_ACTIVITY_TOO_LONG_ACTIVE",
                    "Active account shows no payment activity for 36+ months",
                )

        if past_due_date and date_closed and past_due_date > date_closed:
            _attach_violation(
                record,
                "PAST_DUE_AFTER_CLOSURE_DATE",
                "Past-due timestamp extends beyond closure",
            )

        if chargeoff_date and date_opened and date_opened > chargeoff_date:
            _attach_violation(
                record,
                "DATE_OPENED_AFTER_CHARGEOFF",
                "Date Opened occurs after charge-off date",
            )

        if date_closed and dofd and date_closed == dofd:
            _attach_violation(
                record,
                "CLOSURE_DATE_EQUALS_DOFD",
                "Closure date matches DOFD, which is illogical",
            )

        if dofd and last_payment and dofd > last_payment and not _has_violation(record, "DOFD_AFTER_LAST_PAYMENT"):
            _attach_violation(
                record,
                "DOFD_AFTER_LAST_PAYMENT",
                "DOFD occurs after the last payment date",
            )

        if payoff_date and last_payment and last_payment > payoff_date and not _has_violation(
            record, "PAYMENT_AFTER_PAYOFF_DATE"
        ):
            _attach_violation(
                record,
                "PAYMENT_AFTER_PAYOFF_DATE",
                "Payment reported after payoff milestone",
            )

        if past_due > 0 and "current" in status:
            _attach_violation(
                record,
                "LATE_DATE_BUT_STATUS_CURRENT",
                "Past-due balance conflicts with Current status",
            )


# ---------------------------------------------------------------------------
# Closed account integrity & metadata alignment
# ---------------------------------------------------------------------------


def audit_closed_account_integrity(tradelines: Iterable[MutableMapping[str, Any]]) -> None:
    for record in tradelines:
        status = _normalize_status(record.get("account_status"))
        balance = clean_amount(record.get("balance"))
        past_due = clean_amount(record.get("past_due") or record.get("amount_past_due"))
        date_closed = parse_date(record.get("date_closed") or record.get("date_of_closing"))
        payment_rating_raw = record.get("payment_rating") or record.get("worst_payment_status") or record.get("worst_payment_rating")
        payment_rating_text = _normalize_status(payment_rating_raw)
        comment = _normalize_status(record.get("special_comment") or record.get("comments"))
        payment_status_text = _normalize_status(record.get("payment_status"))
        scheduled_payment = _get_scheduled_payment_amount(record)

        closed_keywords = {"closed", "paid", "settled", "paid in full", "charge-off", "collection"}
        is_closed = any(keyword in status for keyword in closed_keywords)

        if "reopen" in status and not (
            record.get("new_open_date")
            or record.get("date_reopened")
            or record.get("reopen_date")
        ):
            _attach_violation(
                record,
                "REOPENED_ACCOUNT_NO_NEW_OPEN_DATE",
                "Reopened account missing refreshed open date",
            )

        if date_closed and any(keyword in status for keyword in ("open", "current", "active")):
            _attach_violation(
                record,
                "INCONSISTENT_ACCOUNT_STATUS_ON_CLOSED",
                "Account lists a closure date but status still shows open/current",
            )

        if is_closed or (date_closed and balance == 0):
            if balance > 0 or past_due > 0:
                _attach_violation(
                    record,
                    "MISMATCH_BALANCE_ON_CLOSED",
                    "Closed or paid account should report zero balance and past due",
                )

            payment_markers = {"late", "delin", "past due", "charge", "repos", "30", "60", "90", "120"}
            payment_flag = False
            if payment_status_text and any(marker in payment_status_text for marker in payment_markers):
                payment_flag = True
            if scheduled_payment > 0:
                payment_flag = True

            if payment_flag:
                extra: Dict[str, Any] | None = None
                extra_payload: Dict[str, Any] = {}
                if scheduled_payment > 0:
                    extra_payload["scheduled_payment_amount"] = scheduled_payment
                if record.get("payment_status"):
                    extra_payload["reported_payment_status"] = record.get("payment_status")
                if extra_payload:
                    extra = extra_payload
                _attach_violation(
                    record,
                    "CLOSED_ACCOUNT_STILL_REPORTING_PAYMENT",
                    "Closed account continues to report payment obligation or delinquency",
                    extra,
                )

            rating_value = None
            if payment_rating_raw is not None:
                try:
                    rating_value = int(str(payment_rating_raw).strip())
                except Exception:
                    rating_value = None

            if (rating_value is not None and rating_value > 0) or any(
                keyword in payment_rating_text for keyword in ("late", "delin", "charge", "repos")
            ):
                _attach_violation(
                    record,
                    "INCONSISTENT_PAYMENT_RATING_ON_CLOSE",
                    "Closed account still shows delinquent payment rating",
                )

            if "settled" in status and not any(
                keyword in comment for keyword in ("settled", "partial", "less than full", "acuerdo")
            ):
                _attach_violation(
                    record,
                    "INCONSISTENT_SPECIAL_COMMENT_ON_SETTLEMENT",
                    "Settled account missing settlement-specific comment",
                )

            for entry in _payment_history_entries(record):
                hist_date = parse_date(entry.get("date"))
                if date_closed and hist_date and hist_date > date_closed:
                    _attach_violation(
                        record,
                        "INCORRECT_PAYMENT_HISTORY_AFTER_CLOSURE",
                        "Payment history shows activity after closure",
                    )
                    break

        delinquency_days_raw = record.get("days_past_due") or record.get("max_delinquency_days")
        try:
            delinquency_days = int(float(str(delinquency_days_raw))) if delinquency_days_raw not in (None, "") else 0
        except Exception:
            delinquency_days = 0
        if delinquency_days > 180:
            _attach_violation(
                record,
                "EXTENDED_DELINQUENCY_BEYOND_MAX",
                "Delinquency exceeds 180 days but still reported as incremental late codes",
            )


# ---------------------------------------------------------------------------
# Dispute flag hygiene
# ---------------------------------------------------------------------------


def audit_dispute_compliance(tradelines: Iterable[MutableMapping[str, Any]]) -> None:
    for record in tradelines:
        dispute_flag = record.get("dispute_flag") or record.get("dispute_status") or record.get("account_in_dispute")
        compliance_code = str(record.get("compliance_condition_code") or record.get("compliance_code") or "").strip().upper()
        status = _normalize_status(record.get("account_status"))
        comment = _normalize_status(record.get("comments") or record.get("special_comment"))

        if not _boolish(dispute_flag):
            continue

        if compliance_code not in COMPLIANCE_CODES:
            _attach_violation(
                record,
                "COMPLIANCE_CONDITION_CODE_MISSING_ON_DISPUTE",
                "Dispute flagged without Metro-2 compliance condition code",
            )

        last_reported = parse_date(record.get("last_reported") or record.get("date_last_reported"))
        if last_reported and days_since(last_reported) > 30:
            _attach_violation(
                record,
                "failure_to_correct_after_dispute",
                "Dispute notation present without updates after 30+ days",
            )

        if any(keyword in status for keyword in ("paid", "resolved", "closed", "settled")) or "resolved" in comment:
            _attach_violation(
                record,
                "DISPUTE_FLAG_NOT_CLEARED_AFTER_RESOLUTION",
                "Dispute flag remains even though the account reflects a resolution",
            )


# ---------------------------------------------------------------------------
# Portfolio, ownership & collateral checks
# ---------------------------------------------------------------------------


def audit_portfolio_alignment(tradelines: Iterable[MutableMapping[str, Any]]) -> None:
    for record in tradelines:
        portfolio = _normalize_status(record.get("portfolio_type"))
        account_type = _normalize_status(record.get("account_type"))
        ownership = _normalize_status(
            record.get("ownership_code") or record.get("ecoa_code") or record.get("ecoa_designator")
        )
        relationship = _normalize_status(
            record.get("account_designator") or record.get("responsibility") or record.get("relationship")
        )
        secured_indicator = _normalize_status(record.get("secured_indicator") or record.get("collateral_indicator"))
        collateral = _normalize_status(record.get("collateral") or record.get("collateral_description"))
        balance = clean_amount(record.get("balance"))
        high_credit = clean_amount(record.get("high_credit"))
        credit_limit = clean_amount(record.get("credit_limit"))

        if ("authorized" in relationship or "authorized" in ownership) and any(
            keyword in ownership for keyword in ("individual", "primary", "joint")
        ):
            _attach_violation(
                record,
                "INCORRECT_ECOA_CODE_FOR_AUTHORIZED_USER",
                "Authorized user account coded as primary/individual",
            )

        portfolio_key = None
        if "revol" in portfolio:
            portfolio_key = "revolving"
        elif "install" in portfolio:
            portfolio_key = "installment"
        elif "open" in portfolio:
            portfolio_key = "open"

        account_key = None
        if "revol" in account_type:
            account_key = "revolving"
        elif "install" in account_type:
            account_key = "installment"
        elif "open" in account_type:
            account_key = "open"

        if portfolio_key and account_key and portfolio_key != account_key:
            _attach_violation(
                record,
                "MISMATCH_PORTFOLIO_TYPE_VS_ACCOUNT_TYPE",
                "Portfolio type conflicts with account type coding",
            )

        if secured_indicator in {"y", "yes", "secured", "true"} and not collateral:
            _attach_violation(
                record,
                "MISMATCH_COLLATERAL_INDICATOR",
                "Secured flag present without collateral details",
            )
        if collateral and secured_indicator in {"n", "no", "unsecured", "false"}:
            _attach_violation(
                record,
                "MISMATCH_COLLATERAL_INDICATOR",
                "Collateral listed but account flagged unsecured",
            )

        if credit_limit > 0 and high_credit > credit_limit + 0.01:
            _attach_violation(
                record,
                "HIGH_CREDIT_EXCEEDS_LIMIT",
                "High Credit exceeds the reported Credit Limit",
            )

        revolving_like = {"revolving", "open"}
        high_credit_value = max(high_credit, credit_limit)
        if balance > 0 and high_credit_value == 0 and (portfolio_key in revolving_like or account_key in revolving_like):
            _attach_violation(
                record,
                "NON_ZERO_BALANCE_WITH_ZERO_HI_CREDIT",
                "Revolving/open account shows balance but zero limit/high credit",
            )
# ---------------------------------------------------------------------------
# Inquiry & personal info rules
# ---------------------------------------------------------------------------


def audit_inquiries(
    inquiries: Iterable[Mapping[str, Any]], tradelines: Iterable[Mapping[str, Any]]
) -> List[Dict[str, Any]]:
    results: List[Dict[str, Any]] = []
    creditors = {
        str(t.get("creditor_name") or "").strip().lower(): t for t in tradelines if t.get("creditor_name")
    }
    for inquiry in inquiries:
        creditor_name = str(inquiry.get("creditor_name") or "").strip().lower()
        if not creditor_name:
            continue
        match = any(creditor_name.startswith(name) for name in creditors)
        if not match:
            violation = {
                "id": "INQUIRY_NO_MATCH",
                "title": f"Inquiry on {inquiry.get('date_of_inquiry', 'Unknown date')} not linked to any tradeline",
                "creditor_name": inquiry.get("creditor_name"),
                "bureau": inquiry.get("credit_bureau"),
            }
            meta = RULE_METADATA["INQUIRY_NO_MATCH"]
            violation.update({"severity": meta["severity"], "fcra_section": meta["fcra_section"]})
            results.append(violation)
    return results


def audit_personal_info(info: Mapping[str, Mapping[str, Any]]) -> List[Dict[str, Any]]:
    results: List[Dict[str, Any]] = []

    def _collect(values: Mapping[str, Any], keyword: str) -> str | None:
        for key, value in values.items():
            if keyword in key.lower():
                if value and str(value).strip():
                    return str(value)
        return None

    names = [val for bureau, values in info.items() if (val := _collect(values, "name"))]
    if len(set(name.lower() for name in names if name)) > 1:
        meta = RULE_METADATA["NAME_MISMATCH"]
        results.append(
            {
                "id": "NAME_MISMATCH",
                "title": "Name reported differently across bureaus",
                "severity": meta["severity"],
                "fcra_section": meta["fcra_section"],
            }
        )

    addresses = [val for bureau, values in info.items() if (val := _collect(values, "address"))]
    if len(set(addr.lower() for addr in addresses if addr)) > 1:
        meta = RULE_METADATA["ADDRESS_MISMATCH"]
        results.append(
            {
                "id": "ADDRESS_MISMATCH",
                "title": "Address reported differently across bureaus",
                "severity": meta["severity"],
                "fcra_section": meta["fcra_section"],
            }
        )

    return results


# ---------------------------------------------------------------------------
# Registry & entry point
# ---------------------------------------------------------------------------


AUDIT_FUNCTIONS = [
    audit_missing_open_date,
    audit_balance_status_mismatch,
    audit_possible_mismatched_accounts,
    audit_payment_history_mismatch,
    audit_open_closed_mismatch,
    audit_missing_bureau,
    audit_stale_data,
    audit_duplicate_accounts,
    audit_reaged_accounts,
    audit_account_type_mismatch,
    audit_high_utilization,
    audit_stale_disputes,
    audit_dofd_integrity,
    audit_collection_status_inconsistent,
    audit_balance_status_conflict,
    audit_factual_disputes,
    audit_comment_field_conflict,
    audit_collection_high_credit,
    audit_chargeoff_continues_reporting,
    audit_duplicate_collection_accounts,
    audit_furnisher_identity_unclear,
    audit_missing_payment_date,
    audit_closed_account_integrity,
    audit_dispute_compliance,
    audit_portfolio_alignment,
]


def run_all_audits(parsed_data: MutableMapping[str, Any]) -> MutableMapping[str, Any]:
    tradelines = parsed_data.get("accounts", [])
    inquiries = parsed_data.get("inquiries", [])
    personal_info = parsed_data.get("personal_information", {})

    active_tradelines = [record for record in tradelines if record.get("present", True) is not False]

    for record in active_tradelines:
        normalize_tradeline(record)

    for fn in AUDIT_FUNCTIONS:
        fn(active_tradelines)

    parsed_data["inquiry_violations"] = audit_inquiries(inquiries, active_tradelines)
    parsed_data["personal_info_violations"] = audit_personal_info(personal_info)

    return parsed_data


# ---------------------------------------------------------------------------
# CLI rendering helpers
# ---------------------------------------------------------------------------


class CLIColor:
    GREEN = "\033[92m"
    YELLOW = "\033[93m"
    RED = "\033[91m"
    CYAN = "\033[96m"
    BOLD = "\033[1m"
    RESET = "\033[0m"


SEVERITY_STYLES = {
    "minor": ("✅", CLIColor.GREEN, "Minor"),
    "moderate": ("⚠️", CLIColor.YELLOW, "Moderate"),
    "major": ("❌", CLIColor.RED, "Major"),
}


def build_cli_report(audit_payload: Mapping[str, Any]) -> str:
    """Return a formatted CLI report with severity-aware colors."""

    lines: List[str] = []
    header = f"{CLIColor.BOLD}{CLIColor.CYAN}📋 METRO-2 / FCRA AUDIT SUMMARY{CLIColor.RESET}"
    lines.append(header)
    lines.append("-" * 70)

    personal_violations = audit_payload.get("personal_info_violations", [])
    if personal_violations:
        lines.append(f"{CLIColor.BOLD}{CLIColor.YELLOW}🧍 Personal Information Issues{CLIColor.RESET}")
        for violation in personal_violations:
            lines.append(_format_violation_line(violation, prefix="  "))
    else:
        lines.append(f"{CLIColor.GREEN}✅ Personal information consistent across bureaus{CLIColor.RESET}")

    for tradeline in audit_payload.get("accounts", []):
        creditor = tradeline.get("creditor_name", "UNKNOWN")
        bureau = tradeline.get("bureau", "?")
        balance = tradeline.get("balance", "")
        status = tradeline.get("account_status", "")
        lines.append("")
        lines.append(f"{CLIColor.BOLD}{CLIColor.CYAN}{creditor}{CLIColor.RESET} [{bureau}]")
        lines.append(f"  Balance: {balance} | Status: {status}")
        violations = tradeline.get("violations", [])
        if not violations:
            lines.append(f"  {CLIColor.GREEN}✅ Clean tradeline{CLIColor.RESET}")
        else:
            for violation in violations:
                lines.append(_format_violation_line(violation, prefix="  "))

    inquiry_violations = audit_payload.get("inquiry_violations", [])
    lines.append("")
    if inquiry_violations:
        lines.append(f"{CLIColor.BOLD}{CLIColor.YELLOW}🔍 Inquiry Exceptions{CLIColor.RESET}")
        for violation in inquiry_violations:
            lines.append(_format_violation_line(violation, prefix="  "))
    else:
        lines.append(f"{CLIColor.GREEN}✅ All inquiries link to active tradelines{CLIColor.RESET}")

    return "\n".join(lines) + "\n"


def _format_violation_line(violation: Mapping[str, Any], prefix: str = "") -> str:
    severity = violation.get("severity", "minor")
    symbol, color, label = SEVERITY_STYLES.get(severity, SEVERITY_STYLES["minor"])
    fcra = violation.get("fcra_section")
    details = f"{violation['id']}: {violation['title']}"
    if fcra:
        details += f" ({fcra})"
    return f"{prefix}{color}{symbol} {label}: {details}{CLIColor.RESET}"


__all__ = ["run_all_audits", "build_cli_report"]
