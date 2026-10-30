// Talks to the FastAPI backend.

export async function fetchProviders() {
  const res = await fetch("/api/providers");
  if (!res.ok) throw new Error("Could not load providers");
  return res.json();
}

export async function fetchDefaultPrompt() {
  const res = await fetch("/api/default-prompt");
  if (!res.ok) throw new Error("Could not load the default prompt");
  return (await res.json()).prompt;
}

// FastAPI puts the reason for a failed request in {"detail": "..."}.
async function errorMessage(res) {
  try {
    const { detail } = await res.json();
    if (typeof detail === "string") return detail;
  } catch {
    // Not JSON; fall through.
  }
  return `Request failed (${res.status})`;
}

export async function listDocuments() {
  const res = await fetch("/api/documents");
  if (!res.ok) throw new Error(await errorMessage(res));
  return res.json();
}

// Upload one file. The backend parses, chunks and indexes it before replying.
export async function uploadDocument(file) {
  const body = new FormData();
  body.append("file", file);
  const res = await fetch("/api/documents", { method: "POST", body });
  if (!res.ok) throw new Error(await errorMessage(res));
  return res.json();
}

// Add a web page (or a PDF, Word, text or image link). The backend fetches and indexes it.
export async function addDocumentFromUrl(url) {
  const res = await fetch("/api/documents/url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  });
  if (!res.ok) throw new Error(await errorMessage(res));
  return res.json();
}

export async function deleteDocument(id) {
  const res = await fetch(`/api/documents/${id}`, { method: "DELETE" });
  // 404 means it is already gone, which is what we wanted.
  if (!res.ok && res.status !== 404) throw new Error(await errorMessage(res));
}

/**
 * Send the conversation to the backend and read the streamed answer.
 *
 * The backend replies with Server-Sent Events: lines like
 *   data: {"type": "token", "content": "Hel"}
 * separated by a blank line. We read the body chunk by chunk, split it into
 * events and hand each parsed event to `onEvent`.
 */
export async function streamChat({ messages, config, documentIds, onEvent, signal }) {
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal,
    body: JSON.stringify({
      messages: messages.map(({ role, content }) => ({ role, content })),
      config: {
        provider: config.provider,
        model: config.model,
        api_key: config.apiKeys[config.provider],
        tavily_api_key: config.tavilyApiKey || null,
      },
      system_prompt: config.systemPrompt.trim() || null,
      personal_info: config.personalInfo.trim() || null,
      document_ids: documentIds,
    }),
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Request failed (${res.status}): ${detail}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    // Each complete event ends with a blank line; keep any partial tail.
    const parts = buffer.split("\n\n");
    buffer = parts.pop();
    for (const part of parts) {
      if (part.startsWith("data: ")) onEvent(JSON.parse(part.slice(6)));
    }
  }
}
