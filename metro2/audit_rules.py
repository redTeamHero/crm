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


def _get_scheduled_payment_amount(record: Mapping[str, Any]) -> float:
    return clean_amount(_first_value(record, SCHEDULED_PAYMENT_FIELDS))


def _normalize_status(value: Any) -> str:
    return str(value or "").strip().lower()


def _boolish(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    text = str(value or "").strip().lower()
    return text in {"1", "true", "yes", "y", "open", "active", "dispute"}


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


def group_by_creditor(
    tradelines: Iterable[Mapping[str, Any]]
) -> Dict[tuple[str, str], List[Mapping[str, Any]]]:
    """Group tradelines by creditor and account number when available."""

    groups: Dict[tuple[str, str], List[Mapping[str, Any]]] = defaultdict(list)
    name_counters: Dict[str, int] = defaultdict(int)
    for tl in tradelines:
        name = (tl.get("creditor_name") or "UNKNOWN").strip().upper()
        account = _normalized_account_number(tl)
        if not account:
            suffix = name_counters[name]
            name_counters[name] += 1
            account = f"__NO_ACCOUNT__#{suffix}"
        key = (name, account)
        groups[key].append(tl)
    return groups


def _normalized_account_number(tradeline: Mapping[str, Any]) -> str:
    value = tradeline.get("account_number") or tradeline.get("account_#") or ""
    return "".join(ch for ch in str(value) if ch.isalnum()).upper()


FIELD_SYNONYMS: Dict[str, Sequence[str]] = {
    "account_number": ("account_#", "acct#", "acct_no", "account no", "account"),
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
        record["bureau"] = record["bureau"].strip().title()


# ---------------------------------------------------------------------------
# Rule metadata helpers
# ---------------------------------------------------------------------------


RULE_METADATA: Dict[str, Dict[str, str]] = {
    "MISSING_OPEN_DATE": {"severity": "moderate", "fcra_section": "FCRA §611(a)(1)"},
    "BALANCE_MISMATCH": {"severity": "major", "fcra_section": "FCRA §607(b)"},
    "STATUS_MISMATCH": {"severity": "major", "fcra_section": "FCRA §607(b)"},
    "OPEN_DATE_MISMATCH": {"severity": "major", "fcra_section": "FCRA §607(b)"},
    "PAYMENT_HISTORY_MISMATCH": {"severity": "major", "fcra_section": "FCRA §607(b)"},
    "OPEN_CLOSED_MISMATCH": {"severity": "major", "fcra_section": "FCRA §623(a)(1)"},
    "INCOMPLETE_BUREAU_REPORTING": {"severity": "moderate", "fcra_section": "FCRA §623(a)(1)"},
    "STALE_DATA": {"severity": "moderate", "fcra_section": "FCRA §623(a)(2)"},
    "DUPLICATE_ACCOUNT": {"severity": "major", "fcra_section": "FCRA §607(b)"},
    "ACCOUNT_TYPE_MISMATCH": {"severity": "moderate", "fcra_section": "FCRA §607(b)"},
    "HIGH_UTILIZATION": {"severity": "minor", "fcra_section": "FCRA §607(b)"},
    "DISPUTE_PENDING_TOO_LONG": {"severity": "major", "fcra_section": "FCRA §623(a)(3)"},
    "MISSING_LAST_PAYMENT_DATE": {"severity": "moderate", "fcra_section": "FCRA §623(a)(1)"},
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


def audit_balance_status_mismatch(tradelines: Iterable[MutableMapping[str, Any]]) -> None:
    grouped = group_by_creditor(tradelines)
    for records in grouped.values():
        if len(records) < 2:
            continue

        balances = {clean_amount(r.get("balance")) for r in records if r.get("balance")}
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

        if len(statuses) > 1:
            for r in records:
                _attach_violation(r, "STATUS_MISMATCH", "Status mismatch across bureaus")

        if len(open_dates) > 1:
            for r in records:
                _attach_violation(r, "OPEN_DATE_MISMATCH", "Date Opened differs across bureaus")

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

        if len(distinct_last_reported) > 1:
            pretty = ", ".join(sorted({r.get("last_reported") or r.get("date_last_reported") or "Missing" for r in records}))
            for r in records:
                _attach_violation(
                    r,
                    "LAST_REPORTED_MISMATCH",
                    f"Last Reported differs across bureaus ({pretty})",
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


def audit_missing_payment_date(tradelines: Iterable[MutableMapping[str, Any]]) -> None:
    for record in tradelines:
        payment_status = _normalize_status(record.get("payment_status"))
        status = _normalize_status(record.get("account_status"))

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
    audit_payment_history_mismatch,
    audit_open_closed_mismatch,
    audit_missing_bureau,
    audit_stale_data,
    audit_duplicate_accounts,
    audit_reaged_accounts,
    audit_account_type_mismatch,
    audit_high_utilization,
    audit_stale_disputes,
    audit_missing_payment_date,
    audit_closed_account_integrity,
    audit_dispute_compliance,
    audit_portfolio_alignment,
]


def run_all_audits(parsed_data: MutableMapping[str, Any]) -> MutableMapping[str, Any]:
    tradelines = parsed_data.get("accounts", [])
    inquiries = parsed_data.get("inquiries", [])
    personal_info = parsed_data.get("personal_information", {})

    for record in tradelines:
        normalize_tradeline(record)

    for fn in AUDIT_FUNCTIONS:
        fn(tradelines)

    parsed_data["inquiry_violations"] = audit_inquiries(inquiries, tradelines)
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

