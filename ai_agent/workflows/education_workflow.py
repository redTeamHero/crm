"""Client education helpers (mini lessons)."""

from __future__ import annotations

from typing import Any

from ..memory.vectorstore import KnowledgeMemory
from ..tools.knowledge_tool import lookup_fact


def build_lesson(topic: str, memory: KnowledgeMemory | None = None) -> str:
    memory = memory or KnowledgeMemory()
    verified = lookup_fact(topic, memory=memory)
    if isinstance(verified, str):
        return f"Lesson: {topic}\n\n{verified}"

    bullets = []
    for item in verified:
        source = (item.get("metadata") or {}).get("source", "")
        bullets.append(f"- {item['text']} ({source})")
    bullet_text = "\n".join(bullets) or "No vetted sources yet."
    return f"Lesson: {topic}\n\n{bullet_text}"
