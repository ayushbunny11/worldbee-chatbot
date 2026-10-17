// Talks to the FastAPI backend.

export async function fetchProviders() {
  const res = await fetch("/api/providers");
  if (!res.ok) throw new Error("Could not load providers");
  return res.json();
}

/**
 * Send the conversation to the backend and read the streamed answer.
 *
 * The backend replies with Server-Sent Events: lines like
 *   data: {"type": "token", "content": "Hel"}
 * separated by a blank line. We read the body chunk by chunk, split it into
 * events and hand each parsed event to `onEvent`.
 */
export async function fetchDefaultPrompt() {
  const res = await fetch("/api/default-prompt");
  if (!res.ok) throw new Error("Could not load the default prompt");
  return (await res.json()).prompt;
}

export async function streamChat({ messages, config, onEvent, signal }) {
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
        tavily_api_key: config.tavilyApiKey,
      },
      system_prompt: config.systemPrompt.trim() || null,
      personal_info: config.personalInfo.trim() || null,
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
