"""Placeholder dark web monitoring hook."""

from __future__ import annotations

from typing import Any, Dict, Mapping


def check_darkweb_exposure(payload: Mapping[str, Any]) -> Dict[str, Any]:
    query = payload.get("query") or payload.get("email")
    return {
        "query": query,
        "status": "not_implemented",
        "message": "Connect a breach monitoring provider to enable this tool.",
    }
