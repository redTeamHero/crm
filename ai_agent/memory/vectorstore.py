"""In-memory vectorstore placeholder.

This implementation deliberately stays dependency-light. It records passages
with metadata and performs a naive similarity search using token overlap. Swap
this with Supabase, Qdrant, Pinecone, or another provider when ready.
"""

from __future__ import annotations

from collections import Counter
from dataclasses import dataclass, field
from typing import Any, Dict, List, Sequence


@dataclass
class MemoryRecord:
    text: str
    metadata: Dict[str, Any] = field(default_factory=dict)


class KnowledgeMemory:
    def __init__(self) -> None:
        self.records: List[MemoryRecord] = []

    def add(self, text: str, metadata: Dict[str, Any]) -> None:
        self.records.append(MemoryRecord(text=text, metadata=metadata))

    def _score(self, query_tokens: Sequence[str], record: MemoryRecord) -> int:
        haystack = Counter(record.text.lower().split())
        return sum(haystack.get(token, 0) for token in query_tokens)

    def search(self, query: str, k: int = 5) -> List[Dict[str, Any]]:
        tokens = query.lower().split()
        ranked = sorted(
            (
                {
                    "text": record.text,
                    "metadata": record.metadata,
                    "score": self._score(tokens, record),
                }
                for record in self.records
            ),
            key=lambda entry: entry["score"],
            reverse=True,
        )
        return [entry for entry in ranked if entry["score"] > 0][:k]
