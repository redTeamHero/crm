"""Audit workflow helpers for the agent."""

from __future__ import annotations

from typing import Any, Mapping


def build_audit_summary(audit_payload: Mapping[str, Any]) -> str:
    cli_report = audit_payload.get("cli_report") or ""
    counts = [
        f"Tradelines: {len(audit_payload.get('accounts', []))}",
        f"Inquiry issues: {len(audit_payload.get('inquiry_violations', []))}",
        f"Personal info issues: {len(audit_payload.get('personal_info_violations', []))}",
    ]
    header = "🧾 Metro-2 audit complete." + " " + " | ".join(counts)
    return f"{header}\n\n{cli_report}" if cli_report else header
