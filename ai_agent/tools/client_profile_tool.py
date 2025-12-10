"""Client profile summarization to give the agent context."""

from __future__ import annotations

from typing import Any, Mapping


def summarize_client_profile(profile: Mapping[str, Any]) -> str:
    name = profile.get("name", "Client")
    goals = ", ".join(profile.get("goals", [])) or "Not captured yet"
    bureaus = ", ".join(profile.get("bureaus", [])) or "Unknown"
    disputes = profile.get("disputes", [])
    dispute_summary = f"{len(disputes)} active disputes" if disputes else "No disputes filed"
    return f"Profile: {name}\nGoals: {goals}\nBureaus: {bureaus}\nStatus: {dispute_summary}"
