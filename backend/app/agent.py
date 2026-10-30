"""Builds the LangChain agent and streams its output as simple events.

Flow for one chat request:
    1. Pick the chat model for the chosen provider (Gemini or OpenAI).
    2. Attach the tools this chat can use: Tavily web search (if there is a
       Tavily key) and document search (if files are attached).
    3. Create the agent with `create_agent` and our structured system prompt.
    4. Stream the agent's work, turning it into small JSON events the
       frontend understands: "token", "tool_start", "tool_end", "done", "error".
"""

import json
from collections.abc import AsyncIterator

from langchain.agents import create_agent
from langchain_core.language_models import BaseChatModel
from langchain_core.messages import AIMessage, AIMessageChunk, ToolMessage
from langchain_core.tools import BaseTool, tool
from langchain_tavily import TavilySearch
from langchain_tavily._utilities import TavilySearchAPIWrapper

from . import documents
from .prompts import build_system_prompt
from .schemas import ChatRequest, ProviderConfig

# Safety net so a confused agent can't loop forever (each model/tool step counts).
RECURSION_LIMIT = 16
# How many times one answer may search the attached files. Past this the tool
# stops searching and tells the model to answer, so it can't loop until
# RECURSION_LIMIT with nothing to show.
MAX_DOCUMENT_SEARCHES = 4


def build_model(config: ProviderConfig) -> BaseChatModel:
    """Create the chat model for the selected provider."""
    if config.provider == "gemini":
        from langchain_google_genai import ChatGoogleGenerativeAI

        return ChatGoogleGenerativeAI(model=config.model, google_api_key=config.api_key, temperature=0.3)

    from langchain_openai import ChatOpenAI

    return ChatOpenAI(model=config.model, api_key=config.api_key, temperature=0.3)


def _clean_search_results(output):
    """Keep only what the model needs from a Tavily response: title, url and content.

    The raw response also carries an `id` for every result (like "ef9e93-02"), and
    models sometimes cite those ids instead of linking the page.
    """
    if isinstance(output, dict) and "error" in output:
        # A failed search (bad key, no credits, network) comes back as {"error": exception}.
        return {"error": str(output["error"]) or "Web search failed"}
    if not isinstance(output, dict) or "results" not in output:
        return output  # An error message, passed through as is.
    results = [
        {"title": r.get("title"), "url": r.get("url"), "content": r.get("content")}
        for r in output["results"]
    ]
    return {"query": output.get("query"), "results": results}


class CleanTavilySearch(TavilySearch):
    """Tavily search that hands the model clean results (see `_clean_search_results`)."""

    def _run(self, *args, **kwargs):
        return _clean_search_results(super()._run(*args, **kwargs))

    async def _arun(self, *args, **kwargs):
        return _clean_search_results(await super()._arun(*args, **kwargs))


def build_search_tool(tavily_api_key: str) -> TavilySearch:
    """Web search tool the agent can call. Returns the top 5 results."""
    return CleanTavilySearch(
        max_results=5,
        topic="general",
        api_wrapper=TavilySearchAPIWrapper(tavily_api_key=tavily_api_key),
    )


def build_document_tool(doc_ids: list[str]) -> BaseTool:
    """Search tool over the files attached to this chat (the "R" in RAG).

    `content_and_artifact` lets the tool return two things: the passages as text
    for the model, and a list of sources (file and page) for the UI.
    """

    searches = 0  # This tool is built per request, so the count is per answer.

    @tool(response_format="content_and_artifact")
    def search_documents(query: str) -> tuple[str, list[dict]]:
        """Search the files the user uploaded to this chat. Returns the most relevant passages.

        Args:
            query: What to look for, in a few specific words.
        """
        nonlocal searches
        searches += 1
        if searches > MAX_DOCUMENT_SEARCHES:
            return (
                "Search limit reached. Do not search again. Answer now using the passages "
                "you already have, and say what you could not find.",
                [],
            )
        hits = documents.search(query, doc_ids)
        if not hits:
            return "No matching passages found in the uploaded files.", []

        passages, sources = [], []
        for i, hit in enumerate(hits, start=1):
            where = hit["filename"] + (f", p. {hit['page']}" if hit["page"] else "")
            passages.append(f"[{i}] ({where})\n{hit['text']}")
            source = {"title": where, "filename": hit["filename"], "page": hit["page"], "url": hit["url"]}
            if source not in sources:
                sources.append(source)
        return "\n\n".join(passages), sources

    return search_documents


def build_agent(request: ChatRequest):
    tools = []
    if request.config.tavily_api_key:
        tools.append(build_search_tool(request.config.tavily_api_key))
    # Only files the backend still knows about. Deleted ones are skipped.
    attached = documents.get_documents(request.document_ids)
    if attached:
        tools.append(build_document_tool([d["id"] for d in attached]))

    return create_agent(
        model=build_model(request.config),
        tools=tools,
        system_prompt=build_system_prompt(
            request.system_prompt,
            request.personal_info,
            web_search=bool(request.config.tavily_api_key),
            filenames=[d["filename"] for d in attached],
        ),
    )


def _sources_from_tool_output(message: ToolMessage) -> list[dict]:
    """Sources for the UI: file/page pairs from document search, title/url pairs from Tavily."""
    if message.artifact is not None:
        return message.artifact
    content = message.content
    try:
        data = json.loads(content) if isinstance(content, str) else content
        return [{"title": r.get("title") or r["url"], "url": r["url"]} for r in data.get("results", [])]
    except (ValueError, TypeError, KeyError, AttributeError):
        return []


def _tool_error(message: ToolMessage) -> str | None:
    """Why a tool call failed, if the tool reported an error (like a bad Tavily key)."""
    content = message.content
    try:
        data = json.loads(content) if isinstance(content, str) else content
    except ValueError:
        return None
    return str(data["error"]) if isinstance(data, dict) and data.get("error") else None


def _event(type_: str, **payload) -> str:
    """Format one Server-Sent Event line."""
    return f"data: {json.dumps({'type': type_, **payload})}\n\n"


async def stream_chat(request: ChatRequest) -> AsyncIterator[str]:
    """Run the agent and yield SSE events as it thinks, searches and answers."""
    try:
        agent = build_agent(request)
        inputs = {"messages": [m.model_dump() for m in request.messages]}

        # "messages" mode gives us tokens as they are generated.
        # "updates" mode gives us complete steps (tool calls and tool results).
        async for mode, data in agent.astream(
            inputs,
            stream_mode=["messages", "updates"],
            config={"recursion_limit": RECURSION_LIMIT},
        ):
            if mode == "messages":
                chunk, _metadata = data
                if isinstance(chunk, AIMessageChunk) and chunk.text:
                    yield _event("token", content=chunk.text)

            elif mode == "updates":
                for step in data.values():
                    for message in (step or {}).get("messages", []):
                        if isinstance(message, AIMessage):
                            for call in message.tool_calls:
                                yield _event(
                                    "tool_start",
                                    id=call["id"],
                                    tool=call["name"],
                                    query=call["args"].get("query", ""),
                                )
                        elif isinstance(message, ToolMessage):
                            yield _event(
                                "tool_end",
                                id=message.tool_call_id,
                                tool=message.name,
                                sources=_sources_from_tool_output(message),
                                error=_tool_error(message),
                            )

        yield _event("done")
    except Exception as exc:  # Surface any provider/key error to the user.
        yield _event("error", message=str(exc) or exc.__class__.__name__)
