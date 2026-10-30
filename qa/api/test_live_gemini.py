"""Live tests against the real Gemini and Tavily APIs. Skipped when keys are absent."""
import concurrent.futures as cf
import json
import os

import httpx
import pytest

BASE = os.environ.get("WORLDBEE_API", "http://localhost:8000")
GKEY = os.environ.get("GEMINI_API_KEY")
TKEY = os.environ.get("TAVILY_API_KEY")
MODEL = os.environ.get("QA_GEMINI_MODEL", "gemini-2.5-flash-lite")

pytestmark = pytest.mark.skipif(not (GKEY and TKEY), reason="GEMINI_API_KEY / TAVILY_API_KEY not set")


def body(msgs, **over):
    b = {"messages": msgs if isinstance(msgs, list) else [{"role": "user", "content": msgs}],
         "config": {"provider": "gemini", "model": MODEL, "api_key": GKEY, "tavily_api_key": TKEY}}
    b.update(over)
    return b


def chat(payload, timeout=120):
    """Stream /api/chat like the browser does and return (raw_text, events, chunk_sizes)."""
    raw, sizes = "", []
    with httpx.stream("POST", f"{BASE}/api/chat", json=payload, timeout=timeout) as r:
        assert r.status_code == 200, r.read()
        assert r.headers["content-type"].startswith("text/event-stream")
        for chunk in r.iter_text():
            raw += chunk
            sizes.append(len(chunk))
    events = []
    for part in raw.split("\n\n"):
        if part.strip():
            assert part.startswith("data: "), f"bad SSE framing: {part[:80]!r}"
            events.append(json.loads(part[6:]))
    return raw, events, sizes


def types(ev):
    return [e["type"] for e in ev]


def text(ev):
    return "".join(e["content"] for e in ev if e["type"] == "token")


def test_plain_chat_streams_tokens_then_done_without_search():
    _, ev, _ = chat(body("Say hello in exactly three words."))
    assert types(ev)[-1] == "done" and "error" not in types(ev), ev
    assert "token" in types(ev) and text(ev).strip()
    assert "tool_start" not in types(ev), "greeting should not trigger a web search"
    assert types(ev).count("done") == 1


def test_tokens_arrive_incrementally_not_in_one_blob():
    _, ev, sizes = chat(body("Write a 120-word paragraph about honey bees."))
    assert types(ev).count("token") > 3, "answer was not streamed token by token"


def test_search_flow_event_order_and_sources():
    _, ev, _ = chat(body("Use web search: what is the latest stable version of Python released? Cite sources."))
    t = types(ev)
    assert t[-1] == "done", ev[-1]
    assert "tool_start" in t and "tool_end" in t
    assert t.index("tool_start") < t.index("tool_end") < t.index("token")
    start = next(e for e in ev if e["type"] == "tool_start")
    assert start["query"].strip()
    end = next(e for e in ev if e["type"] == "tool_end")
    assert end["sources"], "tool_end carried no sources"
    for s in end["sources"]:
        assert s["url"].startswith("http") and s["title"]
    assert len(end["sources"]) <= 5


def test_multi_turn_context_is_used():
    msgs = [{"role": "user", "content": "My favourite colour is vermilion. Remember it."},
            {"role": "assistant", "content": "Noted: vermilion."},
            {"role": "user", "content": "What is my favourite colour? One word."}]
    _, ev, _ = chat(body(msgs))
    assert "vermilion" in text(ev).lower()


def test_personal_info_reaches_the_model():
    _, ev, _ = chat(body("What is my name? Answer with the name only.", personal_info="My name is Quillon Marsh."))
    assert "quillon" in text(ev).lower()


def test_custom_system_prompt_replaces_default():
    _, ev, _ = chat(body("Hi there", system_prompt="You must reply with exactly one word: PINEAPPLE."))
    assert "pineapple" in text(ev).lower() and len(text(ev).split()) <= 3


def test_today_placeholder_is_filled_in_custom_prompt():
    from datetime import date
    _, ev, _ = chat(body("What is today's year? Digits only.", system_prompt="Today's date is {today}. Answer from this date only; never search."))
    assert str(date.today().year) in text(ev)


def test_custom_prompt_without_placeholder_still_gets_date():
    from datetime import date
    _, ev, _ = chat(body("What is today's year? Digits only.", system_prompt="You answer briefly. Never use search."))
    assert str(date.today().year) in text(ev)


def test_json_braces_in_prompt_and_personal_info_work_end_to_end():
    _, ev, _ = chat(body("Reply with the single word OK.", system_prompt='Format: {"a": {"b": 1}} {0} {x}. Today {today}.',
                        personal_info="I like {curly} and {} braces"))
    assert types(ev)[-1] == "done", ev


def test_unicode_roundtrip():
    _, ev, _ = chat(body("Repeat exactly this and nothing else: नमस्ते 🐝 héllo"))
    out = text(ev)
    assert "नमस्ते" in out and "🐝" in out and "héllo" in out


def test_invalid_gemini_key_gives_error_event_and_no_done():
    p = body("hi")
    p["config"]["api_key"] = "AIzaINVALIDKEYFORQA0000000000000000000"
    _, ev, _ = chat(p)
    assert types(ev)[-1] == "error" and "done" not in types(ev)
    assert ev[-1]["message"].strip()


def test_nonexistent_model_gives_error_event():
    p = body("hi")
    p["config"]["model"] = "gemini-does-not-exist-9"
    _, ev, _ = chat(p)
    assert types(ev)[-1] == "error", ev


def test_invalid_tavily_key_when_search_needed_is_handled_gracefully():
    p = body("Use web search to find today's top technology headline.")
    p["config"]["tavily_api_key"] = "tvly-INVALID-QA-KEY"
    _, ev, _ = chat(p)
    # Either a clean error event, or the model recovers and answers; it must not hang or end without done/error.
    assert types(ev)[-1] in ("done", "error"), ev[-3:]


def test_parallel_searches_pair_start_and_end_correctly():
    _, ev, _ = chat(body("Use web search, doing two separate searches: one for 'Tokyo population' and one for 'Paris population'. Then compare them."))
    starts = [e for e in ev if e["type"] == "tool_start"]
    ends = [e for e in ev if e["type"] == "tool_end"]
    assert starts, "no search happened"
    assert len(starts) == len(ends), f"{len(starts)} tool_start vs {len(ends)} tool_end"
    print("QUERIES:", [s["query"] for s in starts])
    print("SOURCE HOSTS:", [[x["url"].split('/')[2] for x in e["sources"]] for e in ends])


def test_recursion_limit_ends_cleanly():
    sp = "You must run a NEW web search for each of these 15 countries one at a time, never in parallel, and never answer until all 15 are done."
    _, ev, _ = chat(body("Capitals of: France, Spain, Italy, Peru, Chile, Kenya, Ghana, Egypt, Iran, Iraq, Cuba, Fiji, Laos, Mali, Togo.", system_prompt=sp), timeout=180)
    last = ev[-1]
    assert last["type"] in ("done", "error")
    if last["type"] == "error":
        print("RECURSION ERROR MESSAGE:", last["message"][:300])
        assert "Traceback" not in last["message"]


def test_three_concurrent_requests_are_isolated():
    prompts = [f"Reply with only the word TOKEN{i}." for i in range(3)]
    with cf.ThreadPoolExecutor(3) as ex:
        res = list(ex.map(lambda q: chat(body(q)), prompts))
    for i, (_, ev, _) in enumerate(res):
        assert f"token{i}" in text(ev).lower() and types(ev)[-1] == "done", (i, text(ev))


def test_client_disconnect_mid_stream_does_not_break_server():
    with httpx.stream("POST", f"{BASE}/api/chat", json=body("Write 400 words about the ocean."), timeout=60) as r:
        for _ in r.iter_text():
            break
    # server must still serve requests normally afterwards
    assert httpx.get(f"{BASE}/api/health", timeout=10).json() == {"status": "ok"}
    _, ev, _ = chat(body("Reply with OK."))
    assert types(ev)[-1] == "done"
