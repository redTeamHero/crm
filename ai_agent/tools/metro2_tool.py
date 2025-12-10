"""Metro-2 audit wrapper so the agent can call the Python rule engine."""

from __future__ import annotations

from typing import Any, Dict, Mapping

from metro2.audit_rules import build_cli_report, run_all_audits


def run_metro2_audit(report_json: Mapping[str, Any]) -> Dict[str, Any]:
    """Run the built-in Metro-2 audits and attach a CLI-friendly summary."""
    payload = run_all_audits(dict(report_json))
    payload["cli_report"] = build_cli_report(payload)
    return payload
