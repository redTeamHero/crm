"""Lightweight AI agent scaffold for Metro-2 workflows.

This package keeps the agent logic decoupled from the rest of the CRM so it can
be registered as a Flask blueprint (``ai_agent.router.ai_router``) without
changing existing routes. Tooling is intentionally simple to avoid heavy
dependencies while still giving a clear integration path for LangChain or other
LLM frameworks later.
"""

from .agent import AIAgent
from .router import ai_router

__all__ = ["AIAgent", "ai_router"]
