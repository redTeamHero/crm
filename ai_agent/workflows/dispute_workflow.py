"""Dispute planning helper functions."""

from __future__ import annotations

from typing import Any, Iterable, Mapping


def plan_disputes(violations: Iterable[Mapping[str, Any]]) -> str:
    steps = [
        "Step 1: Validate Metro-2 fields (status, Date of Last Payment, payment dates).",
        "Step 2: Choose dispute basis per bureau with evidence.",
        "Step 3: Queue letters and reminders for follow-up (30–45 days).",
    ]
    tagged = [v.get("code") or v.get("name") for v in violations]
    if tagged:
        steps.insert(0, f"Targeting: {', '.join(filter(None, tagged))}")
    return "\n".join(steps)
