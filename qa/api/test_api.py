import copy
import socket
import pytest


def _providers_reachable():
    try:
        for h in ("api.openai.com", "generativelanguage.googleapis.com", "api.tavily.com"):
            socket.create_connection((h, 443), timeout=5).close()
        return True
    except OSError:
        return False


needs_providers = pytest.mark.skipif(
    not _providers_reachable(),
    reason="OpenAI/Gemini/Tavily unreachable from this machine: provider error semantics cannot be tested here",
)
from conftest import valid_body, parse_sse


# ---------- read-only endpoints ----------
def test_health(client):
    r = client.get("/api/health")
    assert r.status_code == 200 and r.json() == {"status": "ok"}


def test_providers_shape(client):
    r = client.get("/api/providers")
    assert r.status_code == 200
    d = r.json()
    assert set(d) == {"gemini", "openai"}
    for p in d.values():
        assert p["label"] and p["models"] and p["key_url"].startswith("https://")


def test_default_prompt_keeps_placeholder(client):
    p = client.get("/api/default-prompt").json()["prompt"]
    assert "{today}" in p and "tavily_search" in p


def test_unknown_route_404(client):
    assert client.get("/api/nope").status_code == 404


def test_wrong_method_405(client):
    assert client.get("/api/chat").status_code == 405
    assert client.post("/api/health").status_code == 405


# ---------- /api/chat request validation (must be 422, no stream) ----------
def bad(client, mutate):
    b = copy.deepcopy(valid_body())
    mutate(b)
    return client.post("/api/chat", json=b)


@pytest.mark.parametrize("name,mutate", [
    ("empty messages", lambda b: b.update(messages=[])),
    ("missing messages", lambda b: b.pop("messages")),
    ("system role", lambda b: b["messages"].__setitem__(0, {"role": "system", "content": "x"})),
    ("tool role", lambda b: b["messages"].__setitem__(0, {"role": "tool", "content": "x"})),
    ("missing content", lambda b: b["messages"].__setitem__(0, {"role": "user"})),
    ("null content", lambda b: b["messages"].__setitem__(0, {"role": "user", "content": None})),
    ("missing config", lambda b: b.pop("config")),
    ("bad provider", lambda b: b["config"].update(provider="anthropic")),
    ("empty model", lambda b: b["config"].update(model="")),
    ("empty api_key", lambda b: b["config"].update(api_key="")),
    ("empty tavily key", lambda b: b["config"].update(tavily_api_key="")),
    ("missing tavily key", lambda b: b["config"].pop("tavily_api_key")),
    ("system_prompt > 8000", lambda b: b.update(system_prompt="a" * 8001)),
    ("personal_info > 2000", lambda b: b.update(personal_info="a" * 2001)),
    ("messages not a list", lambda b: b.update(messages="hi")),
])
def test_validation_422(client, name, mutate):
    r = bad(client, mutate)
    assert r.status_code == 422, f"{name}: got {r.status_code}"


def test_invalid_json_body_422(client):
    r = client.post("/api/chat", content="{not json", headers={"content-type": "application/json"})
    assert r.status_code == 422


@pytest.mark.parametrize("drop", ["model", "tavily_api_key", "api_key", "provider"])
def test_422_does_not_echo_secrets_when_a_config_field_is_missing(client, drop):
    b = valid_body()
    b["config"]["api_key"] = "sk-SECRET-VALUE-123"
    b["config"]["tavily_api_key"] = "tvly-SECRET-VALUE-456"
    del b["config"][drop]
    r = client.post("/api/chat", json=b)
    assert r.status_code == 422
    assert "SECRET-VALUE" not in r.text, "422 body echoes submitted API keys (pydantic 'input' = whole config dict)"


@pytest.mark.parametrize("n", [8000, 2000])
def test_limits_accepted_at_boundary(client, n):
    key = "system_prompt" if n == 8000 else "personal_info"
    r = client.post("/api/chat", json=valid_body(**{key: "a" * n}))
    assert r.status_code == 200  # stream opens; failure comes later as an SSE error event


# ---------- stream contract on the error path (real provider call, bad key) ----------
@needs_providers
def test_bad_key_returns_200_stream_with_error_event(client):
    r = client.post("/api/chat", json=valid_body())
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("text/event-stream")
    assert r.headers.get("cache-control") == "no-cache"
    assert r.headers.get("x-accel-buffering") == "no"
    ev = parse_sse(r.text)
    assert ev, "stream was empty"
    assert ev[-1]["type"] == "error" and ev[-1]["message"]
    assert all(e["type"] != "done" for e in ev), "error stream must not also send done"


@needs_providers
@pytest.mark.parametrize("provider,model", [("gemini", "gemini-2.5-flash"), ("openai", "gpt-4.1-mini")])
def test_each_provider_path_emits_error_event(client, provider, model):
    b = valid_body()
    b["config"].update(provider=provider, model=model)
    ev = parse_sse(client.post("/api/chat", json=b).text)
    assert ev[-1]["type"] == "error"


@needs_providers
def test_error_message_does_not_leak_api_key(client):
    b = valid_body()
    b["config"]["api_key"] = "sk-LEAKCHECK-987654321"
    b["config"]["tavily_api_key"] = "tvly-LEAKCHECK-987654321"
    text = client.post("/api/chat", json=b).text
    assert "LEAKCHECK-987654321" not in text, "provider error text leaks a user-supplied key"


def test_custom_prompt_with_json_braces_does_not_crash_before_stream(client):
    sp = 'Reply as JSON like {"a": {"b": 1}} and {0} {x}. Today is {today}.'
    r = client.post("/api/chat", json=valid_body(system_prompt=sp, personal_info="I like {curly} braces {}"))
    ev = parse_sse(r.text)
    # Must fail for the provider reason (bad key / network), not a prompt-formatting KeyError/IndexError.
    msg = ev[-1].get("message", "")
    assert ev[-1]["type"] == "error"
    assert "KeyError" not in msg and "IndexError" not in msg and "'x'" not in msg, msg


def test_unicode_and_large_history_accepted(client):
    msgs = [{"role": "user" if i % 2 == 0 else "assistant", "content": "नमस्ते 🐝 " * 50} for i in range(199)]
    msgs.append({"role": "user", "content": "end"})
    r = client.post("/api/chat", json=valid_body(messages=msgs))
    assert r.status_code == 200


# ---------- CORS ----------
def test_cors_allowed_origin(client):
    r = client.options("/api/chat", headers={"Origin": "http://localhost:5173",
                                             "Access-Control-Request-Method": "POST",
                                             "Access-Control-Request-Headers": "content-type"})
    assert r.status_code == 200
    assert r.headers["access-control-allow-origin"] == "http://localhost:5173"


def test_cors_disallowed_origin(client):
    r = client.options("/api/chat", headers={"Origin": "https://evil.example",
                                             "Access-Control-Request-Method": "POST"})
    assert "access-control-allow-origin" not in r.headers
