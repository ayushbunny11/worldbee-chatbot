# WorldBee 🐝

A simple, educational AI chatbot built with a **LangChain agent**. Ask any question.
When it needs fresh information, the agent searches the web with **Tavily** and
cites its sources.

- **Providers:** Google Gemini or OpenAI, which you choose in the UI
- **Tool:** Tavily web search, attached to the agent by default
- **Backend:** Python, FastAPI, LangChain (`create_agent`), streaming over Server-Sent Events
- **Frontend:** React (JavaScript) + Vite, light theme, Markdown rendering
- **Emoji support:** an emoji picker in the message box, and the assistant uses emojis in moderation
- **One chat only:** the conversation is kept in your browser. "Clear chat" starts over.

## Project structure

```
backend/
  app/
    main.py      FastAPI app: /api/chat (streaming), /api/providers, /api/default-prompt, /api/health
    agent.py     Builds the model + Tavily tool + agent and streams events
    prompts.py   The structured default prompt + build_system_prompt (custom prompt, personal info)
    schemas.py   Request models (Pydantic)
  requirements.txt
frontend/
  src/
    App.jsx                 Chat state and the streaming event handler
    api.js                  fetch + Server-Sent Events parsing
    storage.js              localStorage helpers (config + the single chat)
    components/
      Header.jsx            Logo, status, Clear chat, Configure API
      ConfigModal.jsx       Provider, model and API key settings
      ChatMessage.jsx       User / assistant messages, search steps, sources
      Composer.jsx          Message box with send / stop
      EmojiPicker.jsx       Emoji popover used by the message box (data in src/emojis.js)
      EmptyState.jsx        Welcome screen with example questions
```

## Getting started

You need **Python 3.10+** and **Node.js 20+**.

### 1. Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

### 2. Frontend (in a second terminal)

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:5173. The Vite dev server forwards `/api` requests to the backend.

### 3. Add your API keys

Click **Configure API** and enter:

| Key | Where to get it |
| --- | --- |
| Google Gemini **or** OpenAI | [Google AI Studio](https://aistudio.google.com/apikey) / [OpenAI Platform](https://platform.openai.com/api-keys) |
| Tavily (web search) | [app.tavily.com](https://app.tavily.com) (has a free tier) |

Keys are stored only in your browser's `localStorage` and sent to your local
backend with each message. The backend does not save them.

### 4. Personalise the assistant (optional)

Under **Configure API → Personalisation** you can set two optional things:

- **About you**: a short note (name, job, location, preferences) the assistant
  uses to tailor its answers.
- **System prompt**: replaces WorldBee's default prompt. Leave it blank to use
  the default, or click *Load the default prompt to edit it* to start from ours.
  The assistant keeps its web search tool either way, and `{today}` in your
  prompt is replaced with today's date.

Your "About you" text is added to the prompt as a separate section, whether you
use the default prompt or your own. Both settings are saved in your browser.

## How it works

1. You send a message. The frontend posts the **whole conversation** plus your
   provider settings to `POST /api/chat`. The backend is stateless.
2. `agent.py` builds a chat model (`ChatGoogleGenerativeAI` or `ChatOpenAI`),
   a `TavilySearch` tool, and an agent with `langchain.agents.create_agent`.
3. The system prompt is built from your settings: our default (or your custom
   prompt) plus your "About you" text. The default prompt in `prompts.py` tells
   the agent when searching is worth it and how to cite sources, and the agent
   decides by itself whether to search.
4. `agent.astream(..., stream_mode=["messages", "updates"])` produces tokens
   and tool steps. The backend turns these into small JSON events:

   | Event | Meaning |
   | --- | --- |
   | `token` | A piece of the answer text |
   | `tool_start` | The agent started a web search (with the query) |
   | `tool_end` | Search finished (with the source links) |
   | `done` | The answer is complete |
   | `error` | Something failed, such as an invalid API key |

5. The frontend reads the stream and updates the message live.

## Ideas to extend it

- Add another tool (a calculator, Wikipedia, a weather API) in `build_agent`
- Add a third provider (Anthropic, Ollama) in `build_model` and `PROVIDERS`
- Change the assistant's personality by editing `prompts.py`

## License

MIT. See [LICENSE](LICENSE).
