# WorldBee 🐝

A simple, educational AI chatbot built with a **LangChain agent**. Ask any question.
When it needs fresh information, the agent searches the web with **Tavily** and
cites its sources. Attach your own files and it answers from them too (**RAG**).

- **Providers:** Google Gemini or OpenAI, which you choose in the UI
- **Tools:** Tavily web search (optional, needs a free key) and search over your uploaded files
- **Chat with your files and web pages:** PDF, Word, text, Markdown, images (scans too, read with OCR) and links, indexed locally with
  **FastEmbed** embeddings, a **Chroma** vector database and a SQLite keyword index
  (hybrid search). Free, no extra API key.
- **Backend:** Python, FastAPI, LangChain (`create_agent`), streaming over Server-Sent Events
- **Frontend:** React (JavaScript) + Vite, light theme, Markdown rendering
- **Emoji support:** an emoji picker in the message box, and the assistant uses emojis in moderation
- **One chat only:** the conversation is kept in your browser. "New chat" starts over.

## Project structure

```
backend/
  app/
    main.py       FastAPI app: /api/chat (streaming), /api/documents, /api/providers, /api/default-prompt, /api/health
    agent.py      Builds the model + tools (web search, document search) + agent and streams events
    documents.py  RAG pipeline: parse, chunk, embed (FastEmbed), store (Chroma + SQLite FTS5) and hybrid search
    prompts.py    The structured default prompt + build_system_prompt (tools, custom prompt, personal info)
    schemas.py    Request models (Pydantic)
  data/           Created on first upload (git-ignored): vector index, keyword index, document list, embedding model
  requirements.txt
frontend/
  src/
    App.jsx                 Chat state and the streaming event handler
    api.js                  fetch + Server-Sent Events parsing
    storage.js              localStorage helpers (config, the single chat, which files are on)
    documents.js            Accepted file types and size limit
    components/
      Header.jsx            Top bar: model status and the settings icon
      Sidebar.jsx           New chat, Chat / Personalisation links and the Files section; the panel icon minimises it to an icon strip that opens on hover (a drawer on phones)
      PersonalPage.jsx      Full-page Personalisation settings that replace the chat
      LinkModal.jsx         Pop-up to add a web page by its address
      LibraryModal.jsx      Your files pop-up: switch each on or off for this chat, delete, add
      ConfigModal.jsx       Provider, model and API key settings
      ChatMessage.jsx       User / assistant messages, search steps, sources
      Composer.jsx          Message box with attach / send / stop, and attached file chips
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

Click the **settings icon** in the top bar and enter:

| Key | Where to get it |
| --- | --- |
| Google Gemini **or** OpenAI | [Google AI Studio](https://aistudio.google.com/apikey) / [OpenAI Platform](https://platform.openai.com/api-keys) |
| Tavily (web search, optional) | [app.tavily.com](https://app.tavily.com) (has a free tier) |

Without a Tavily key the assistant still chats and reads your files; it just
can't search the web.

Keys are stored only in your browser's `localStorage` and sent to your local
backend with each message. The backend does not save them.

### 4. Personalise the assistant (optional)

Click **Personalisation** in the sidebar. It opens a full page in place of the chat, where you can set two optional things (they save as you type):

- **About you**: a short note (name, job, location, preferences) the assistant
  uses to tailor its answers.
- **System prompt**: replaces WorldBee's default prompt. Leave it blank to use
  the default, or click *Load the default prompt to edit it* to start from ours.
  The assistant keeps its web search tool either way, and `{today}` in your
  prompt is replaced with today's date.

Your "About you" text is added to the prompt as a separate section, whether you
use the default prompt or your own. Both settings are saved in your browser.

### 5. Chat with your files (optional)

Click the 📎 button in the message box, or drag files onto the page. Supported:
PDF, Word (`.docx`), text, Markdown and images (`.png`, `.jpg`, `.webp`, `.bmp`, `.tif`), up to 20 MB each. Each file shows as a
chip with its page and chunk count once it is indexed, then just ask about it.

- The **first upload downloads the embedding model** (about 100 MB, once) into
  `backend/data/models`, so it takes a bit longer.
- Files go into a **library** that stays indexed between chats. The
  **Files** section of the sidebar lists them with a switch for the current chat;
  **Manage** opens a pop-up to add more or delete one for good (two clicks). The agent only searches files that are on.
- The chip's X turns a file off for this chat but keeps it in the library.
  **New chat** starts over with every file off.
- Uploading the same file twice indexes it once.
- **Scans and images are read with OCR**, locally and for free
  ([RapidOCR](https://github.com/RapidAI/RapidOCR), small models that ship inside the
  package). A PDF page with no real text is rendered and read, so scanned and mixed
  PDFs both work. Pictures of text (screenshots, photos of a page) work too. The chip
  says how many pages were read with OCR. It takes a second or two per page, so at
  most 30 scanned pages per file are read and the rest are reported as skipped.
- **Add a web page:** click **Add link** in the sidebar (or in the Manage pop-up) and paste
  an address. WorldBee fetches the page, keeps only the readable text (no menus, ads or
  footers) and indexes it like a file. Links to PDF, Word, text and image files work
  too. The answer's source chip opens the original page. Pages that need a login or
  JavaScript to show their text can't be read, and the same page added twice is stored once.
- Links to private addresses (your own machine, your local network, cloud metadata
  services) are refused, so the backend can't be pointed at things inside your network.
  Set `WORLDBEE_ALLOW_PRIVATE_URLS=1` to allow them, for example to index a page on your
  own network.
- OCR reads text only. Charts, diagrams and photos inside a file are not described,
  and pictures embedded in a Word file are ignored. Handwriting and very small or
  blurry text can come out wrong, so check numbers it quotes.

## How it works

1. You send a message. The frontend posts the **whole conversation** plus your
   provider settings to `POST /api/chat`. The backend is stateless.
2. `agent.py` builds a chat model (`ChatGoogleGenerativeAI` or `ChatOpenAI`),
   the tools this chat can use (a `TavilySearch` tool if you gave a Tavily key,
   a `search_documents` tool if files are attached), and an agent with
   `langchain.agents.create_agent`.
3. The system prompt is built from your settings: our default (or your custom
   prompt), a Tools section for the enabled tools, and your "About you" text.
   The Tools section tells the agent when searching is worth it and how to cite
   sources, and the agent decides by itself whether to search.
4. `agent.astream(..., stream_mode=["messages", "updates"])` produces tokens
   and tool steps. The backend turns these into small JSON events:

   | Event | Meaning |
   | --- | --- |
   | `token` | A piece of the answer text |
   | `tool_start` | The agent started a search (with the tool name, call id and query) |
   | `tool_end` | Search finished (with the sources: links, or file and page) |
   | `done` | The answer is complete |
   | `error` | Something failed, such as an invalid API key |

5. The frontend reads the stream and updates the message live.

### Chat with your files (RAG)

RAG means *retrieval-augmented generation*: instead of sending a whole file to
the model, we find the few passages that matter and send only those.

1. **Upload:** `POST /api/documents` sends the file to `documents.py`.
2. **Parse:** `pypdf` (PDF, page by page) or `python-docx` (Word) extracts the text.
3. **Chunk:** LangChain's `RecursiveCharacterTextSplitter` cuts it into pieces of
   about 1,000 characters that overlap by 150, so a sentence on a boundary isn't lost.
   Each chunk remembers its file name and page.
4. **Embed:** [FastEmbed](https://github.com/qdrant/fastembed) turns each chunk
   into a vector (384 numbers) with the `BAAI/bge-small-en-v1.5` model. It runs on
   your CPU through ONNX Runtime, so there is no API key, no cost, and the file
   never leaves your machine.
5. **Store:** the chunks and vectors go into [Chroma](https://www.trychroma.com),
   a vector database kept in `backend/data/chroma`. The chunk text also goes into a
   SQLite [FTS5](https://www.sqlite.org/fts5.html) keyword index in
   `backend/data/keywords.sqlite3` (built into Python, nothing to install).
6. **Retrieve (hybrid search):** when the agent calls `search_documents`, two
   searches run over the files attached to this chat:
   - **Vector:** the query is embedded with the same model and Chroma returns the
     20 chunks closest in meaning.
   - **Keyword:** SQLite ranks chunks by the words they share with the query (BM25,
     with English stemming). This catches exact terms that vectors can miss, such as
     `beta2 = 0.98`, `41.8 BLEU`, a name or an error code.

   The two lists are merged with *reciprocal rank fusion* (a chunk scores
   `1 / (60 + rank)` in each list), and the top 6 go to the agent, which answers
   from them and cites file and page. Files added before hybrid search existed are
   added to the keyword index on their first search. If the keyword index fails,
   search falls back to vectors alone.

The search is a **tool**, so the agent decides when to use it, can search
several times with different words, and can combine your files with a web
search. This is often called *agentic RAG*.

Settings (environment variables for the backend):

| Variable | Default | Meaning |
| --- | --- | --- |
| `WORLDBEE_ALLOW_PRIVATE_URLS` | off | Set to `1` to let **Add link** fetch pages on your own machine or network. Off by default for safety. |
| `WORLDBEE_EMBEDDING_MODEL` | `BAAI/bge-small-en-v1.5` | Any [FastEmbed model](https://qdrant.github.io/fastembed/examples/Supported_Models/), e.g. `BAAI/bge-base-en-v1.5` (better, slower) or a multilingual one. Changing it means deleting `backend/data/chroma` and uploading again. |
| `WORLDBEE_DATA_DIR` | `backend/data` | Where the index, document list and model are stored |

Chunk size, overlap and the number of results are constants at the top of `documents.py`.

### Measuring retrieval

`evals/retrieval_eval.py` compares vector, keyword and hybrid search without calling
any chat model: for each question it checks whether a chunk from the right page is in
the top 6, and how high it ranks (MRR). On the Attention paper (42 answerable questions
plus 14 exact-term ones in `evals/attention_exact_terms.csv`):

| Search | Right page in top 6 | MRR |
| --- | --- | --- |
| Vector only | 55 / 56 | 0.815 |
| Keyword only | 54 / 56 | 0.850 |
| Hybrid | 56 / 56 | 0.912 |

Per-question results are in `evals/results/attention_retrieval.csv`.

## Ideas to extend it

- Add another tool (a calculator, Wikipedia, a weather API) in `build_agent`
- Improve retrieval further with a reranker
- Add a third provider (Anthropic, Ollama) in `build_model` and `PROVIDERS`
- Change the assistant's personality by editing `prompts.py`
