"""NEPQ-inspired framing helpers."""

from __future__ import annotations

from typing import Any, Dict


def nepq_prompt(user_message: str, context: Dict[str, Any]) -> str:
    context_hint = []
    if context.get("goals"):
        context_hint.append(f"Goals: {', '.join(context['goals'])}")
    if context.get("bureaus"):
        context_hint.append(f"Bureaus: {', '.join(context['bureaus'])}")
    if context.get("pain_points"):
        context_hint.append(f"Pain: {', '.join(context['pain_points'])}")

    hint_text = " | ".join(context_hint)
    return (
        "You are an NEPQ-trained credit consultant. Ask one question at a time,"
        " explore motivations and constraints, and guide the prospect to the next"
        " best step. "
        f"Context: {hint_text}. "
        f"User said: {user_message}"
    )
