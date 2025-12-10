"""Flask blueprint exposing chat + tool endpoints for the AI agent."""

from __future__ import annotations

from flask import Blueprint, jsonify, request

from .agent import AIAgent
from .memory.vectorstore import KnowledgeMemory

ai_router = Blueprint("ai_router", __name__)
_agent = AIAgent(memory=KnowledgeMemory())


@ai_router.route("/chat", methods=["POST"])
def chat() -> "json response":
    payload = request.get_json(silent=True) or {}
    message = payload.get("message", "").strip()
    context = payload.get("context", {}) or {}

    if not message:
        return jsonify({"error": "Missing message"}), 400

    reply = _agent.handle_message(message, context)
    return jsonify(reply)


@ai_router.route("/memory", methods=["POST"])
def add_memory() -> "json response":
    payload = request.get_json(silent=True) or {}
    text = payload.get("text")
    metadata = payload.get("metadata", {}) or {}
    if not text:
        return jsonify({"error": "Missing text"}), 400
    _agent.remember(text, metadata=metadata)
    return jsonify({"status": "stored", "metadata": metadata})


@ai_router.route("/health", methods=["GET"])
def health() -> "json response":
    return jsonify({"status": "ok", "tools": [t.name for t in _agent.available_tools()]})
