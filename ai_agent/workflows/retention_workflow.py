"""Retention nudges after each agent response."""

from __future__ import annotations

from typing import Any, Dict


def retention_next_steps(context: Dict[str, Any]) -> str:
    next_milestone = context.get("next_milestone")
    if next_milestone:
        return f"Next step: {next_milestone}. I'll remind you if this stalls."
    if context.get("pending_documents"):
        docs = ", ".join(context["pending_documents"])
        return f"Pending docs: {docs}. Uploading them keeps timelines tight."
    return ""
