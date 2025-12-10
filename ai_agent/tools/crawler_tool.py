"""Stub crawler hook; replace with real scraping pipeline when ready."""

from __future__ import annotations

from typing import Any, Dict, Mapping

from ..memory.vectorstore import KnowledgeMemory


def crawl_page(payload: Mapping[str, Any], memory: KnowledgeMemory | None = None) -> Dict[str, Any]:
    url = payload.get("url", "")
    text = payload.get("text", "")
    store = memory or KnowledgeMemory()
    if text:
        store.add(text, metadata={"source": url, "source_count": 1})
    return {"status": "queued", "url": url, "stored": bool(text)}
