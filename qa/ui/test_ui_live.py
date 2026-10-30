"""Live UI tests: real browser -> real Vite -> real FastAPI -> real Gemini + Tavily. Skipped without keys."""
import json
import os

import pytest
from playwright.sync_api import expect, sync_playwright

URL = os.environ.get("WORLDBEE_UI", "http://127.0.0.1:5173")
CHROMIUM = os.environ.get("CHROMIUM_PATH", "/opt/pw-browsers/chromium")
GKEY, TKEY = os.environ.get("GEMINI_API_KEY"), os.environ.get("TAVILY_API_KEY")
MODEL = os.environ.get("QA_GEMINI_MODEL", "gemini-2.5-flash")
pytestmark = pytest.mark.skipif(not (GKEY and TKEY), reason="live keys not set")


@pytest.fixture(scope="module")
def browser():
    with sync_playwright() as p:
        kw = {"executable_path": CHROMIUM} if os.path.exists(CHROMIUM) else {}
        b = p.chromium.launch(**kw)
        yield b
        b.close()


@pytest.fixture
def page(browser):
    ctx = browser.new_context(viewport={"width": 1280, "height": 900})
    pg = ctx.new_page()
    pg.errors = []
    pg.on("pageerror", lambda e: pg.errors.append(str(e)))
    pg.bodies = []
    pg.on("request", lambda r: pg.bodies.append(json.loads(r.post_data)) if "/api/chat" in r.url and r.post_data else None)
    pg.goto(URL)
    pg.evaluate("c => localStorage.setItem('worldbee.config', JSON.stringify(c))", {
        "provider": "gemini", "model": MODEL, "apiKeys": {"gemini": GKEY, "openai": ""},
        "tavilyApiKey": TKEY, "systemPrompt": "", "personalInfo": ""})
    pg.evaluate("localStorage.setItem('worldbee.chat','[]')")
    pg.reload()
    yield pg
    ctx.close()


def send(page, text):
    page.get_by_placeholder("Ask me anything…").fill(text)
    page.keyboard.press("Enter")


def test_search_answer_renders_steps_sources_and_persists(page):
    send(page, "Use web search: what is the latest stable version of Python? Keep it to two sentences.")
    expect(page.locator(".step").first).to_be_visible(timeout=60000)
    expect(page.locator(".step.done").first).to_be_visible(timeout=90000)
    expect(page.locator(".send-btn.stop")).to_have_count(0, timeout=120000)
    assert page.locator(".error").count() == 0, page.locator(".error").inner_text()
    assert page.locator(".source").count() > 0, "no source chips rendered"
    assert page.locator(".markdown").inner_text().strip()
    assert page.errors == []
    stored = json.loads(page.evaluate("localStorage.getItem('worldbee.chat')"))
    a = stored[-1]
    assert a["role"] == "assistant" and a["content"] and a["steps"] and a["steps"][0]["done"] and a["steps"][0]["sources"]
    page.reload()
    expect(page.locator(".source").first).to_be_visible()


def test_stop_mid_stream_keeps_partial_answer_and_next_turn_works(page):
    send(page, "Write a detailed 500-word essay about the history of beekeeping. Do not use web search.")
    expect(page.locator(".markdown").first).to_be_visible(timeout=60000)
    expect(page.locator(".markdown.streaming")).to_be_visible()
    page.wait_for_timeout(700)
    page.locator(".send-btn.stop").click()
    expect(page.locator(".send-btn.stop")).to_have_count(0)
    partial = page.locator(".markdown").first.inner_text()
    assert len(partial) > 20 and page.locator(".error").count() == 0
    assert len(partial.split()) < 480, "stop did not cut the stream short"
    stored = json.loads(page.evaluate("localStorage.getItem('worldbee.chat')"))
    assert stored[-1]["content"], "partial answer not persisted after Stop"
    send(page, "Reply with only the word OK.")
    expect(page.locator(".send-btn.stop")).to_have_count(0, timeout=90000)
    body = page.bodies[-1]
    assert [m["role"] for m in body["messages"]] == ["user", "assistant", "user"], "partial assistant turn missing from history"
    assert page.locator(".error").count() == 0
