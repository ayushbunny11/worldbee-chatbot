import os
import httpx
import pytest

BASE = os.environ.get("WORLDBEE_API", "http://localhost:8000")


@pytest.fixture(scope="session")
def client():
    with httpx.Client(base_url=BASE, timeout=60) as c:
        yield c


def valid_body(**over):
    body = {
        "messages": [{"role": "user", "content": "hi"}],
        "config": {"provider": "openai", "model": "gpt-4.1-mini",
                   "api_key": "sk-invalid-qa", "tavily_api_key": "tvly-invalid-qa"},
    }
    body.update(over)
    return body


def parse_sse(text):
    import json
    return [json.loads(l[6:]) for l in text.split("\n\n") if l.startswith("data: ")]
