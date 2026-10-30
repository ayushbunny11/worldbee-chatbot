import json
import os
import pytest
from playwright.sync_api import sync_playwright, expect

URL = os.environ.get("WORLDBEE_UI", "http://127.0.0.1:5173")
CHROMIUM = os.environ.get("CHROMIUM_PATH", "/opt/pw-browsers/chromium")
KEYS = {"gemini": "AIza-qa-invalid", "openai": "sk-qa-invalid", "tavily": "tvly-qa-invalid"}


@pytest.fixture(scope="session")
def browser():
    with sync_playwright() as p:
        kw = {"executable_path": CHROMIUM} if os.path.exists(CHROMIUM) else {}
        b = p.chromium.launch(**kw)
        yield b
        b.close()


@pytest.fixture
def page(browser):
    ctx = browser.new_context(viewport={"width": 1280, "height": 800})
    pg = ctx.new_page()
    pg.errors = []
    pg.on("pageerror", lambda e: pg.errors.append(str(e)))
    pg.requests = []
    pg.on("request", lambda r: pg.requests.append(r) if "/api/chat" in r.url else None)
    yield pg
    ctx.close()


def seed(page, config=None, chat=None):
    """Put real persisted state in localStorage before the app boots."""
    page.goto(URL)
    page.evaluate(
        """([c, ch]) => { if (c) localStorage.setItem('worldbee.config', JSON.stringify(c));
                           if (ch !== null) localStorage.setItem('worldbee.chat', typeof ch === 'string' ? ch : JSON.stringify(ch)); }""",
        [config, chat],
    )
    page.reload()


CONFIGURED = {"provider": "openai", "model": "gpt-4.1-mini",
              "apiKeys": {"gemini": "", "openai": KEYS["openai"]}, "tavilyApiKey": KEYS["tavily"],
              "systemPrompt": "", "personalInfo": ""}


# ---------------- first run / config modal ----------------
def test_first_run_opens_modal_and_blocks_chat(page):
    page.goto(URL)
    dlg = page.get_by_role("dialog", name="Configure API")
    expect(dlg).to_be_visible()
    expect(page.get_by_role("button", name="Save")).to_be_disabled()
    expect(page.locator("textarea").first).to_be_disabled() if page.locator("textarea").first.is_visible() else None


def test_save_enabled_only_when_all_required_fields_filled(page):
    page.goto(URL)
    save = page.locator("button[type=submit].btn-primary")
    expect(save).to_be_disabled()
    page.get_by_placeholder("AIza...").fill(KEYS["gemini"])
    expect(save).to_be_disabled()  # tavily still missing
    page.get_by_placeholder("tvly-...").fill(KEYS["tavily"])
    expect(save).to_be_enabled()
    page.locator("#model").fill("")
    expect(save).to_be_disabled()  # model emptied


def test_save_persists_config_and_unlocks_composer(page):
    page.goto(URL)
    page.get_by_placeholder("AIza...").fill("  " + KEYS["gemini"] + "  ")
    page.get_by_placeholder("tvly-...").fill(KEYS["tavily"])
    page.locator("button[type=submit].btn-primary").click()
    expect(page.get_by_role("dialog")).to_have_count(0)
    cfg = json.loads(page.evaluate("localStorage.getItem('worldbee.config')"))
    assert cfg["apiKeys"]["gemini"] == KEYS["gemini"], "api key should be trimmed"
    expect(page.get_by_placeholder("Ask me anything…")).to_be_enabled()


def test_escape_discards_draft(page):
    seed(page, CONFIGURED)
    page.get_by_role("button", name="Configure API").click() if page.get_by_role("button", name="Configure API").count() else page.locator("header .btn-primary").click()
    page.locator("#model").fill("something-else")
    page.keyboard.press("Escape")
    expect(page.get_by_role("dialog")).to_have_count(0)
    cfg = json.loads(page.evaluate("localStorage.getItem('worldbee.config')"))
    assert cfg["model"] == "gpt-4.1-mini"


def test_provider_switch_updates_models_and_key_field(page):
    page.goto(URL)
    page.get_by_text("OpenAI", exact=True).first.click()
    expect(page.get_by_placeholder("sk-...")).to_be_visible()
    expect(page.locator("#model")).to_have_value("gpt-4o-mini")
    page.get_by_text("Google Gemini", exact=True).first.click()
    expect(page.locator("#model")).to_have_value("gemini-2.5-flash")


def test_per_provider_keys_are_kept_separately(page):
    page.goto(URL)
    page.get_by_placeholder("AIza...").fill(KEYS["gemini"])
    page.get_by_text("OpenAI", exact=True).first.click()
    expect(page.get_by_placeholder("sk-...")).to_have_value("")
    page.get_by_text("Google Gemini", exact=True).first.click()
    expect(page.get_by_placeholder("AIza...")).to_have_value(KEYS["gemini"])


def test_secret_field_masked_and_toggle(page):
    page.goto(URL)
    f = page.get_by_placeholder("AIza...")
    assert f.get_attribute("type") == "password"
    f.locator("xpath=following-sibling::button").click()
    assert f.get_attribute("type") == "text"


# ---------------- chat flow (real backend, real network failure) ----------------
def send(page, text):
    page.get_by_placeholder("Ask me anything…").fill(text)
    page.keyboard.press("Enter")


def test_send_shows_user_bubble_then_error_box_and_request_shape(page):
    seed(page, CONFIGURED)
    send(page, "hello world")
    expect(page.locator(".msg-user .bubble")).to_have_text("hello world")
    expect(page.locator(".error")).to_be_visible(timeout=60000)
    expect(page.locator(".error strong")).to_have_text("Something went wrong.")
    body = json.loads(page.requests[0].post_data)
    assert body["messages"] == [{"role": "user", "content": "hello world"}]
    assert body["config"] == {"provider": "openai", "model": "gpt-4.1-mini",
                              "api_key": KEYS["openai"], "tavily_api_key": KEYS["tavily"]}
    assert body["system_prompt"] is None and body["personal_info"] is None


def test_shift_enter_adds_newline_and_does_not_send(page):
    seed(page, CONFIGURED)
    ta = page.get_by_placeholder("Ask me anything…")
    ta.fill("line1")
    page.keyboard.press("Shift+Enter")
    page.keyboard.type("line2")
    assert ta.input_value() == "line1\nline2"
    assert len(page.requests) == 0


def test_whitespace_only_message_not_sent(page):
    seed(page, CONFIGURED)
    page.get_by_placeholder("Ask me anything…").fill("   \n  ")
    page.keyboard.press("Enter")
    assert len(page.requests) == 0 and page.locator(".msg").count() == 0


def test_failed_turn_excluded_from_next_request_history(page):
    seed(page, CONFIGURED)
    send(page, "first")
    expect(page.locator(".error")).to_be_visible(timeout=60000)
    send(page, "second")
    expect(page.locator(".error")).to_have_count(2, timeout=60000)
    body = json.loads(page.requests[1].post_data)
    roles = [m["role"] for m in body["messages"]]
    assert [m["content"] for m in body["messages"]] == ["first", "second"]
    assert roles == ["user", "user"], "two consecutive user turns are sent after a failed reply"


def test_stop_during_inflight_request_leaves_no_blank_assistant_bubble(page):
    seed(page, CONFIGURED)
    send(page, "stop me")
    stop = page.locator(".send-btn.stop")
    expect(stop).to_be_visible()
    stop.click()
    expect(page.locator(".send-btn.stop")).to_have_count(0)
    page.wait_for_timeout(500)
    a = page.locator(".msg-assistant")
    # An aborted turn with no tokens: the assistant message should not remain as an empty shell.
    body_text = a.locator(".msg-body").inner_text().strip() if a.count() else ""
    assert a.count() == 0 or body_text != "", "empty assistant bubble left behind after Stop"


def test_clear_chat_wipes_ui_and_storage(page):
    seed(page, CONFIGURED)
    send(page, "to be cleared")
    expect(page.locator(".error")).to_be_visible(timeout=60000)
    page.get_by_role("button", name="Clear").click()
    expect(page.locator(".msg")).to_have_count(0)
    assert json.loads(page.evaluate("localStorage.getItem('worldbee.chat')")) == []


def test_clear_chat_while_streaming_does_not_crash(page):
    seed(page, CONFIGURED)
    send(page, "clear while streaming")
    expect(page.locator(".send-btn.stop")).to_be_visible()
    page.get_by_role("button", name="Clear").click()
    page.wait_for_timeout(1500)
    assert page.errors == [], page.errors
    expect(page.locator(".msg")).to_have_count(0)


def test_refresh_mid_request_keeps_the_user_message(page):
    seed(page, CONFIGURED)
    send(page, "do not lose me")
    expect(page.locator(".send-btn.stop")).to_be_visible()
    page.reload()
    page.wait_for_timeout(500)
    assert "do not lose me" in page.content(), "user's message lost when page is refreshed during a request"


def test_chat_persists_across_reload(page):
    seed(page, CONFIGURED)
    send(page, "persist me")
    expect(page.locator(".error")).to_be_visible(timeout=60000)
    page.reload()
    expect(page.locator(".msg-user .bubble")).to_have_text("persist me")
    expect(page.locator(".error")).to_be_visible()


# ---------------- rendering of assistant content (real component, persisted state) ----------------
def assistant(content, **kw):
    return {"id": "a1", "role": "assistant", "content": content, "steps": [], "error": None, **kw}


def test_markdown_table_code_and_links_render(page):
    md = "| a | b |\n|---|---|\n| 1 | 2 |\n\n```python\nprint('x')\n```\n\n[site](https://example.com)"
    seed(page, CONFIGURED, [{"id": "u1", "role": "user", "content": "q"}, assistant(md)])
    expect(page.locator(".markdown table")).to_be_visible()
    expect(page.locator(".markdown pre code")).to_contain_text("print('x')")
    a = page.locator(".markdown a")
    assert a.get_attribute("target") == "_blank" and "noopener" in a.get_attribute("rel")


def test_raw_html_and_script_in_model_output_is_not_executed(page):
    md = "<img src=x onerror=\"window.__pwned=1\"><script>window.__pwned=2</script>[x](javascript:window.__pwned=3)"
    seed(page, CONFIGURED, [{"id": "u1", "role": "user", "content": "q"}, assistant(md)])
    page.locator(".markdown a").first.click() if page.locator(".markdown a").count() else None
    page.wait_for_timeout(500)
    assert page.evaluate("window.__pwned") is None


def test_search_steps_and_sources_render(page):
    steps = [{"query": "weather in Pune", "done": True,
              "sources": [{"title": "IMD", "url": "https://mausam.imd.gov.in/x"}]},
             {"query": "still running", "done": False, "sources": []}]
    seed(page, CONFIGURED, [{"id": "u1", "role": "user", "content": "q"}, assistant("ok", steps=steps)])
    expect(page.locator(".step.done")).to_contain_text("weather in Pune")
    expect(page.locator(".step.running")).to_contain_text("still running")
    expect(page.locator(".source")).to_contain_text("mausam.imd.gov.in")


# ---------------- robustness of persisted state ----------------
@pytest.mark.parametrize("label,raw", [
    ("chat is an object, not a list", '{"a":1}'),
    ("chat is a string", '"hello"'),
    ("assistant message from an older schema (no steps)", '[{"id":"1","role":"assistant","content":"hi"}]'),
    ("chat contains null", "[null]"),
    ("invalid json", "{{{"),
])
def test_corrupt_chat_storage_does_not_white_screen(page, label, raw):
    seed(page, CONFIGURED, raw)
    page.wait_for_timeout(500)
    visible = page.locator(".app").count() > 0
    assert visible and not page.errors, f"{label}: app crashed -> {page.errors[:1]}"


@pytest.mark.parametrize("label,cfg", [
    ("apiKeys null", {"provider": "openai", "apiKeys": None}),
    ("unknown provider", {"provider": "anthropic"}),
    ("config is a list", []),
])
def test_corrupt_config_storage_does_not_white_screen(page, label, cfg):
    page.goto(URL)
    page.evaluate("c => localStorage.setItem('worldbee.config', JSON.stringify(c))", cfg)
    page.reload()
    page.wait_for_timeout(500)
    assert page.locator(".app").count() > 0 and not page.errors, f"{label}: {page.errors[:1]}"


# ---------------- emoji + layout ----------------
def test_emoji_inserted_at_caret_and_focus_kept(page):
    seed(page, CONFIGURED)
    ta = page.get_by_placeholder("Ask me anything…")
    ta.fill("ab")
    page.keyboard.press("ArrowLeft")
    page.get_by_label("Add emoji").click()
    page.get_by_role("dialog", name="Emoji picker").locator("button:not([role=tab])").first.click()
    val = ta.input_value()
    assert val.startswith("a") and val.endswith("b") and len(val) > 2
    assert page.evaluate("document.activeElement.tagName") == "TEXTAREA"


@pytest.mark.parametrize("w,h", [(375, 812), (768, 1024)])
def test_no_horizontal_overflow(page, w, h):
    seed(page, CONFIGURED, [{"id": "u1", "role": "user", "content": "x" * 300},
                            assistant("y" * 300 + "\n\n```\n" + "z" * 200 + "\n```")])
    page.set_viewport_size({"width": w, "height": h})
    page.wait_for_timeout(300)
    assert page.evaluate("document.documentElement.scrollWidth <= window.innerWidth + 1"), \
        "page scrolls horizontally on narrow viewport"
