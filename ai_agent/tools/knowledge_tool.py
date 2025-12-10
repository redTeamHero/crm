"""Knowledge lookup with 3-source confirmation guardrails."""

from __future__ import annotations

from typing import Any, Dict, List

from ..memory.vectorstore import KnowledgeMemory


def lookup_fact(query: str, memory: KnowledgeMemory | None = None) -> List[Dict[str, Any]] | str:
    store = memory or KnowledgeMemory()
    results = store.search(query)
    verified = [r for r in results if (r.get("metadata") or {}).get("source_count", 0) >= 3]
    return verified or "Not enough sources to confirm this as fact."
