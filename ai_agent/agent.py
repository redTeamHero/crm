"""Minimal AI agent that routes messages to Metro-2 aware tools.

This scaffold avoids heavy LLM dependencies while still modeling the key flows
(NEPQ-driven prequalification, Metro-2 audits, dispute drafting, and knowledge
lookups). It can later be swapped with LangChain, ReAct, or OpenAI Assistants
without changing the Flask blueprint contract.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Callable, Dict, List, Optional

from .memory.vectorstore import KnowledgeMemory
from .tools.client_profile_tool import summarize_client_profile
from .tools.dispute_tool import generate_dispute_letter
from .tools.knowledge_tool import lookup_fact
from .tools.metro2_tool import run_metro2_audit
from .workflows.audit_workflow import build_audit_summary
from .workflows.dispute_workflow import plan_disputes
from .workflows.education_workflow import build_lesson
from .workflows.prequal_workflow import build_prequal_questions
from .workflows.sales_workflow import nepq_prompt
from .workflows.retention_workflow import retention_next_steps


@dataclass
class ToolSpec:
    name: str
    description: str
    func: Callable[..., Any]


class AIAgent:
    """Simple router that maps intents to domain tools."""

    def __init__(self, memory: Optional[KnowledgeMemory] = None):
        self.memory = memory or KnowledgeMemory()
        self.tools: Dict[str, ToolSpec] = {}
        self._register_default_tools()

    def _register_default_tools(self) -> None:
        self.register_tool(
            "metro2_audit",
            run_metro2_audit,
            "Run a Metro-2 audit on a normalized credit report payload.",
        )
        self.register_tool(
            "dispute_generator",
            generate_dispute_letter,
            "Draft a Metro-2 dispute letter using identified violations.",
        )
        self.register_tool(
            "knowledge_lookup",
            lookup_fact,
            "Search the knowledge base with 3-source verification.",
        )
        self.register_tool(
            "client_profile",
            summarize_client_profile,
            "Summarize the client profile (goals, bureaus, disputes).",
        )

    def register_tool(self, name: str, func: Callable[..., Any], description: str) -> None:
        self.tools[name] = ToolSpec(name=name, func=func, description=description)

    def available_tools(self) -> List[ToolSpec]:
        return list(self.tools.values())

    def handle_message(self, message: str, context: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        context = context or {}
        lower_message = message.lower()
        transcript: List[str] = []

        if "audit" in lower_message and context.get("report"):
            audit_payload = self.tools["metro2_audit"].func(context["report"])
            summary = build_audit_summary(audit_payload)
            transcript.append(summary)
        elif "dispute" in lower_message and context.get("violations"):
            letter = self.tools["dispute_generator"].func(
                violations=context["violations"],
                consumer=context.get("consumer", {}),
                bureau=context.get("bureau", ""),
            )
            plan = plan_disputes(context.get("violations", []))
            transcript.extend([plan, letter])
        elif "lesson" in lower_message or "explain" in lower_message:
            topic = context.get("topic") or message
            transcript.append(build_lesson(topic, memory=self.memory))
        else:
            questions = build_prequal_questions(context)
            transcript.append(nepq_prompt(message, context))
            transcript.extend(questions)

        retention_hint = retention_next_steps(context)
        if retention_hint:
            transcript.append(retention_hint)

        knowledge_hits = None
        if context.get("search"):
            knowledge_hits = self.tools["knowledge_lookup"].func(context["search"])

        return {
            "message": message,
            "response": "\n\n".join(transcript),
            "tools": [tool.description for tool in self.available_tools()],
            "knowledge_results": knowledge_hits,
        }

    def remember(self, text: str, metadata: Optional[Dict[str, Any]] = None) -> None:
        self.memory.add(text, metadata=metadata or {})
