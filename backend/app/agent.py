"""Builds the LangChain agent and streams its output as simple events.

Flow for one chat request:
    1. Pick the chat model for the chosen provider (Gemini or OpenAI).
    2. Attach the Tavily web search tool.
    3. Create the agent with `create_agent` and our structured system prompt.
    4. Stream the agent's work, turning it into small JSON events the
       frontend understands: "token", "tool_start", "tool_end", "done", "error".
"""

import json
from collections.abc import AsyncIterator

from langchain.agents import create_agent
from langchain_core.language_models import BaseChatModel
from langchain_core.messages import AIMessage, AIMessageChunk, ToolMessage
from langchain_tavily import TavilySearch
from langchain_tavily._utilities import TavilySearchAPIWrapper

from .prompts import build_system_prompt
from .schemas import ChatRequest, ProviderConfig

# Safety net so a confused agent can't loop forever (each model/tool step counts).
RECURSION_LIMIT = 12


def build_model(config: ProviderConfig) -> BaseChatModel:
    """Create the chat model for the selected provider."""
    if config.provider == "gemini":
        from langchain_google_genai import ChatGoogleGenerativeAI

        return ChatGoogleGenerativeAI(model=config.model, google_api_key=config.api_key, temperature=0.3)

    from langchain_openai import ChatOpenAI

    return ChatOpenAI(model=config.model, api_key=config.api_key, temperature=0.3)


def build_search_tool(tavily_api_key: str) -> TavilySearch:
    """Web search tool the agent can call. Returns the top 5 results."""
    return TavilySearch(
        max_results=5,
        topic="general",
        api_wrapper=TavilySearchAPIWrapper(tavily_api_key=tavily_api_key),
    )


def build_agent(request: ChatRequest):
    return create_agent(
        model=build_model(request.config),
        tools=[build_search_tool(request.config.tavily_api_key)],
        system_prompt=build_system_prompt(request.system_prompt, request.personal_info),
    )


def _sources_from_tool_output(content) -> list[dict]:
    """Pull title/url pairs out of Tavily's JSON result for the UI."""
    try:
        data = json.loads(content) if isinstance(content, str) else content
        return [{"title": r.get("title") or r["url"], "url": r["url"]} for r in data.get("results", [])]
    except (ValueError, TypeError, KeyError, AttributeError):
        return []


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
                                yield _event("tool_start", query=call["args"].get("query", ""))
                        elif isinstance(message, ToolMessage):
                            yield _event("tool_end", sources=_sources_from_tool_output(message.content))

        yield _event("done")
    except Exception as exc:  # Surface any provider/key error to the user.
        yield _event("error", message=str(exc) or exc.__class__.__name__)
