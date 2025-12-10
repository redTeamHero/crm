# AI Agent Blueprint

A lightweight Metro-2 aware AI helper that ships with domain tools (audit, dispute drafting, NEPQ prompts, and knowledge lookups) and a Flask blueprint you can drop into any existing Flask app.

## Quick start

1. Install the Python dependencies for your API (Flask is the only requirement for the blueprint).
2. Register the blueprint in your Flask app:

```python
from ai_agent.router import ai_router

app.register_blueprint(ai_router, url_prefix="/ai")
```

3. Run your Flask server and exercise the endpoints below. Each route is stateless, so you can front it with any auth or rate-limit middleware you prefer.

## Endpoints

| Route | Method | Purpose | Example payload |
| --- | --- | --- | --- |
| `/ai/chat` | `POST` | Routes the incoming message to Metro-2 tools (audit, dispute drafting, NEPQ prompts, or education). | `{ "message": "run audit", "context": { "report": { ... } } }` |
| `/ai/memory` | `POST` | Stores facts in the in-memory vector store for later lookups. | `{ "text": "Metro-2 DOFD rule", "metadata": { "source": "policy" } }` |
| `/ai/health` | `GET` | Returns available tools for observability/health checks. | `n/a` |

### Chat routing behavior
- Messages containing **"audit"** use `context["report"]` and return an audit summary.
- Messages mentioning **"dispute"** use `context["violations"]` (+ optional `consumer` / `bureau`) to plan and draft a dispute letter.
- Messages with **"lesson"** or **"explain"** generate a short lesson using stored knowledge.
- All other inputs trigger NEPQ-style prequalification prompts; include `context` fields (e.g., lead details) to customize the prompts.
- If you pass `context["search"]`, the agent will query the lightweight knowledge base and include the results in the response.

## Memory

By default the agent uses the in-process vector store (`ai_agent/memory/vectorstore.py`) to stash text + metadata. Swap it with your own Pinecone/Supabase connector by passing a compatible `KnowledgeMemory` implementation into `AIAgent` before you register the blueprint in `router.py`.

## Extending tools

New tools can be registered without changing the Flask routes:

```python
from ai_agent.agent import AIAgent
from ai_agent.tools.metro2_tool import run_metro2_audit

agent = AIAgent()
agent.register_tool("metro2_audit", run_metro2_audit, "Run a Metro-2 audit")
```

Add your tool to the agent before handling requests to expose it via `/ai/health` and make it callable from `/ai/chat` intent routing.
