#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Central audit registry for Metro-2 / FCRA checks.

This module defines a plug-and-play rule engine that can be imported by the
HTML parser.  It attaches violations to tradelines, inquiries, and personal
information blocks, and also knows how to render a color-coded CLI summary.
"""

from __future__ import annotations

from collections import defaultdict
from datetime import datetime
from typing import Any, Dict, Iterable, List, Mapping, MutableMapping


# ---------------------------------------------------------------------------
# Helper utilities
# ---------------------------------------------------------------------------


def clean_amount(value: Any) -> float:
    """Convert balances/limits to floats, tolerant of formatting noise."""

    try:
        return float(str(value).replace("$", "").replace(",", "").strip() or 0.0)
    except Exception:
        return 0.0


def group_by_creditor(
    tradelines: Iterable[Mapping[str, Any]]
) -> Dict[tuple[str, str], List[Mapping[str, Any]]]:
    """Group tradelines by creditor and account identifier when available."""

    groups: Dict[tuple[str, str], List[Mapping[str, Any]]] = defaultdict(list)
    for tl in tradelines:
        name = (tl.get("creditor_name") or "UNKNOWN").strip().upper()
        account = _normalized_account_number(tl)
        if not account:
            # Fall back to a shared bucket so bureaus without account numbers
            # still compare against each other rather than being treated as
            # distinct accounts for the same creditor.
            account = "__NO_ACCOUNT_NUMBER__"
        key = (name, account)
        groups[key].append(tl)
    return groups


def _normalized_account_number(tradeline: Mapping[str, Any]) -> str:
    value = tradeline.get("account_number") or tradeline.get("account_#") or ""
    return "".join(ch for ch in str(value) if ch.isalnum()).upper()


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
    "REAGING_SUSPECTED": {"severity": "major", "fcra_section": "FCRA §623(a)(5)"},
    "ACCOUNT_TYPE_MISMATCH": {"severity": "moderate", "fcra_section": "FCRA §607(b)"},
    "HIGH_UTILIZATION": {"severity": "minor", "fcra_section": "FCRA §607(b)"},
    "DISPUTE_PENDING_TOO_LONG": {"severity": "major", "fcra_section": "FCRA §623(a)(3)"},
    "MISSING_LAST_PAYMENT_DATE": {"severity": "moderate", "fcra_section": "FCRA §623(a)(1)"},
    "INQUIRY_NO_MATCH": {"severity": "moderate", "fcra_section": "FCRA §604(a)(3)(F)"},
    "NAME_MISMATCH": {"severity": "moderate", "fcra_section": "FCRA §607(b)"},
    "ADDRESS_MISMATCH": {"severity": "moderate", "fcra_section": "FCRA §607(b)"},
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

        if len(balances) > 1:
            for r in records:
                _attach_violation(r, "BALANCE_MISMATCH", "Balance mismatch across bureaus")

        if len(statuses) > 1:
            for r in records:
                _attach_violation(r, "STATUS_MISMATCH", "Status mismatch across bureaus")

        if len(open_dates) > 1:
            for r in records:
                _attach_violation(r, "OPEN_DATE_MISMATCH", "Date Opened differs across bureaus")


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
                "REAGING_SUSPECTED",
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
        payment_status = str(record.get("payment_status") or "").lower()
        last_payment = record.get("date_of_last_payment") or record.get("date_last_payment")
        if "charge" in payment_status and not last_payment:
            _attach_violation(
                record,
                "MISSING_LAST_PAYMENT_DATE",
                "Charged-off account missing last payment date",
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
]


def run_all_audits(parsed_data: MutableMapping[str, Any]) -> MutableMapping[str, Any]:
    tradelines = parsed_data.get("accounts", [])
    inquiries = parsed_data.get("inquiries", [])
    personal_info = parsed_data.get("personal_information", {})

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

