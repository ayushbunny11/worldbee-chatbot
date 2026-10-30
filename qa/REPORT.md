# WorldBee QA report, rounds 1-2

Date: 2026-10-22 · Commit tested: `49a0e5b` (main) · Branch: `qa/e2e-testing`
Environment: cloud sandbox, real FastAPI backend (uvicorn) + real Vite frontend + real Chromium (Playwright). No mocks or stubs.

**Round 1 limitation (now partly resolved by round 2 below):** OpenAI, Gemini and Tavily are unreachable from the sandbox and no keys were supplied, so any behaviour that needs a successful provider call was NOT tested (token streaming, tool_start/tool_end, sources, real auth-error text, key leakage in provider errors, recursion limit, abort mid-stream with tokens). 4 API tests are skipped for this reason, with an explicit skip reason. They run unchanged on a machine with provider access.

## Results
| Suite | Passed | Failed | Skipped |
|---|---|---|---|
| API (pytest + httpx) | 27 | 4 (one bug) | 4 (need providers) |
| UI (pytest + Playwright) | 22 | 8 (four bugs) | 0 |

## Findings
| # | Severity | Finding |
|---|---|---|
| 1 | Low | **422 responses echo API keys.** (downgraded from High: local open-source app, per owner) If any `config` field is missing (model, api_key, tavily_api_key, provider), FastAPI's validation error returns `input` = the whole config object, including both keys in plaintext. Repro: POST /api/chat with config missing `model`. Fix: custom `RequestValidationError` handler that drops `input`. |
| 2 | High | **App white-screens on bad localStorage chat.** `loadChat()` is unvalidated. `{}`, a string, `[null]`, or an assistant message from an older schema without `steps` crashes React (`messages.map is not a function`, `reading 'map'`, `reading 'id'`). Persists across reloads until storage is cleared manually. |
| 3 | Medium | **App white-screens on bad localStorage config.** `apiKeys: null` → `reading 'openai'`; unknown `provider` → `reading 'models'`. |
| 4 | Medium | **Refreshing during a request loses the user's message.** `saveChat` is skipped while streaming, so the in-flight turn is never persisted. |
| 5 | Low | **Stop before any token leaves an empty assistant bubble**, which is persisted and reappears after reload. |

## Observed OK
Health/providers/default-prompt contracts · 15 validation cases return 422 · 8000/2000 limits accepted at boundary · CORS allow/deny · large unicode history accepted · brace-heavy custom prompts don't crash · modal gating, trim, per-provider keys, masking, Escape discards draft · Enter/Shift+Enter · failed turns excluded from history · clear chat (also mid-request, no crash) · persistence across reload · markdown table/code/links (`target=_blank`, `noopener`) · raw HTML/script/`javascript:` not executed · emoji insertion at caret · no horizontal overflow at 375 and 768 px.

## Notes
- After a failed turn the next request sends two consecutive `user` messages (by design of the history filter). Providers usually accept this; worth a live check.
- Not yet tested: `tool_end` matching by order with parallel searches, SSE chunk-boundary splitting, proxy buffering, history growth.

## Run it
`backend`: `pip install -r backend/requirements.txt httpx pytest`, start uvicorn on :8000, `pytest qa/api`.
`ui`: start Vite on :5173, `pip install playwright pytest`, `pytest qa/ui` (set `CHROMIUM_PATH` if not at /opt/pw-browsers/chromium).
Set `GEMINI_API_KEY` / `OPENAI_API_KEY` / `TAVILY_API_KEY` for the live-provider round.

---

# Round 2: live Gemini + Tavily (OpenAI not tested: no key available)

Real calls to Gemini (`gemini-2.5-flash-lite`, then `gemini-2.5-flash`) and Tavily, through the real backend and a real browser.

| Suite | Result |
|---|---|
| API live (`qa/api/test_live_gemini.py`) | 17 tests: 16 passed first run; the 17th (sources) traced to a sandbox artifact, then passed |
| UI live (`qa/ui/test_ui_live.py`) | 2 / 2 passed |

## New finding
| # | Severity | Finding |
|---|---|---|
| 6 | Medium | **Tavily failures are invisible to the user.** Tavily's wrapper returns `{'error': ...}` as a *successful* tool result. `_sources_from_tool_output` parses it to `[]`, so the backend emits a normal `tool_end` with zero sources and no `error` event. With an invalid Tavily key the UI shows a completed "Searched the web for ..." step, no sources, then the model's apology. Nothing points to the real cause (bad key, quota, network). Fix: detect an `error` key / `status == "error"` in the tool output and emit an `error` event or a failed step. |

## Verified working with real providers
Plain chat streams many token events then exactly one `done`, with no search for a greeting · search flow order is `tool_start` → `tool_end` → `token…` → `done`, with up to 5 sources each with url and title · parallel searches get distinct, correctly paired source sets (Tokyo vs Paris) · multi-turn context · `personal_info` · custom system prompt replaces the default · `{today}` filled in, and date appended when the placeholder is absent · JSON braces in prompt and personal info · unicode/emoji round-trip · invalid Gemini key and nonexistent model produce an `error` event with no `done` · 3 concurrent requests stay isolated · client disconnect mid-stream leaves the server healthy · UI: search step, source chips, markdown, persistence across reload · Stop mid-stream keeps the partial answer, persists it, and includes it in the next request's history.

## Sandbox artifacts (not app bugs)
- Tavily's async path (`aiohttp`) ignores the sandbox proxy, giving DNS errors and empty sources. A test-only shim (outside the repo) fixed that. Not reproducible on a machine with direct internet.
- The first run consumed the Gemini free-tier daily quota for `gemini-2.5-flash-lite` (20 requests/day). Budget live tests accordingly.

## Still not covered
OpenAI path (no key) · recursion-limit behaviour (`test_recursion_limit_ends_cleanly` exists but was not run, to save quota) · SSE chunk-boundary splitting in the browser · proxy buffering · very long histories.

## Running the live tests
`export GEMINI_API_KEY=... TAVILY_API_KEY=...`, start uvicorn and Vite, then `pytest qa/api/test_live_gemini.py qa/ui/test_ui_live.py`. Set `QA_GEMINI_MODEL` to change the model. Tests skip when keys are absent.
