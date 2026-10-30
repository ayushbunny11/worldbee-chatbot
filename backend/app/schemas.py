"""Request models for the API."""

from typing import Literal

from pydantic import BaseModel, Field


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class ProviderConfig(BaseModel):
    provider: Literal["gemini", "openai"]
    model: str = Field(min_length=1)
    api_key: str = Field(min_length=1)
    # Optional. Without it the agent has no web search tool.
    tavily_api_key: str | None = None


class ChatRequest(BaseModel):
    # The whole conversation so far, ending with the new user message.
    # The frontend owns the history, so the backend stays stateless.
    messages: list[ChatMessage] = Field(min_length=1)
    config: ProviderConfig
    # Both optional. A blank system_prompt means "use the default prompt".
    system_prompt: str | None = Field(default=None, max_length=8000)
    personal_info: str | None = Field(default=None, max_length=2000)
    # Uploaded documents attached to this chat. The agent can search them.
    document_ids: list[str] = Field(default_factory=list, max_length=20)


class UrlRequest(BaseModel):
    """A web address to fetch and add to the file library."""

    url: str = Field(min_length=1, max_length=2048)
