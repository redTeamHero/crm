"""NEPQ-style prequalification prompts."""

from __future__ import annotations

from typing import Any, Dict, List


def build_prequal_questions(context: Dict[str, Any]) -> List[str]:
    goals = context.get("goals") or []
    recent_actions = context.get("recent_actions") or []
    questions = [
        "What motivated you to look at your credit report today?",
        "Which outcomes matter most right now (home, auto, business credit, peace of mind)?",
    ]

    if goals:
        joined = ", ".join(goals)
        questions.append(f"You mentioned {joined}. What makes that urgent?")

    if recent_actions:
        questions.append(
            f"I see recent steps: {', '.join(recent_actions)}. What worked and what felt frustrating?"
        )

    questions.append("Have you disputed before? If yes, what was the result and timeline?")
    return questions
