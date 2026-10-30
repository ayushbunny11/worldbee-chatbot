"""FastAPI entry point.

Run with:  uvicorn app.main:app --reload --port 8000
"""

from fastapi import FastAPI, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

from . import documents
from .agent import stream_chat
from .prompts import SYSTEM_PROMPT_TEMPLATE
from .schemas import ChatRequest, UrlRequest

app = FastAPI(title="WorldBee Chatbot API")

# Allow the Vite dev server to call the API.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Model suggestions shown in the UI dropdown. Users can also type any model name.
PROVIDERS = {
    "gemini": {
        "label": "Google Gemini",
        "models": ["gemini-2.5-flash", "gemini-2.5-pro", "gemini-2.5-flash-lite"],
        "key_url": "https://aistudio.google.com/apikey",
    },
    "openai": {
        "label": "OpenAI",
        "models": ["gpt-4o-mini", "gpt-4o", "gpt-4.1", "gpt-4.1-mini"],
        "key_url": "https://platform.openai.com/api-keys",
    },
}


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.get("/api/providers")
def providers():
    return PROVIDERS


@app.get("/api/default-prompt")
def default_prompt():
    """The built-in system prompt, so the UI can show it as a starting point.

    "{today}" is kept as a placeholder and filled in on every chat request.
    """
    return {"prompt": SYSTEM_PROMPT_TEMPLATE}


# Plain `def` (not `async def`): FastAPI runs these in a worker thread, so slow
# parsing and embedding don't block other requests.
@app.get("/api/documents")
def list_documents():
    return documents.list_documents()


@app.post("/api/documents")
def upload_document(file: UploadFile):
    """Index one file so the agent can search it. Returns the document record."""
    # Read one byte past the limit, so oversized files are caught without reading them whole.
    data = file.file.read(documents.MAX_FILE_BYTES + 1)
    try:
        return documents.add_document(file.filename or "file", data)
    except documents.DocumentError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/api/documents/url")
def add_document_from_url(request: UrlRequest):
    """Fetch a web address and add it to the library, like an uploaded file."""
    try:
        return documents.add_url(request.url)
    except documents.DocumentError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.delete("/api/documents/{doc_id}")
def delete_document(doc_id: str):
    if not documents.delete_document(doc_id):
        raise HTTPException(status_code=404, detail="Document not found")
    return {"deleted": doc_id}


@app.post("/api/chat")
async def chat(request: ChatRequest):
    """Stream the agent's answer back as Server-Sent Events."""
    return StreamingResponse(
        stream_chat(request),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
