import { useEffect, useRef, useState } from "react";
import { fetchProviders, streamChat } from "./api.js";
import { isConfigured, loadChat, loadConfig, saveChat, saveConfig } from "./storage.js";
import Header from "./components/Header.jsx";
import EmptyState from "./components/EmptyState.jsx";
import ChatMessage from "./components/ChatMessage.jsx";
import Composer from "./components/Composer.jsx";
import ConfigModal from "./components/ConfigModal.jsx";

let nextId = Date.now();
const newId = () => String(nextId++);

export default function App() {
  const [config, setConfig] = useState(loadConfig);
  const [messages, setMessages] = useState(loadChat);
  const [providers, setProviders] = useState(null);
  const [showConfig, setShowConfig] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const abortRef = useRef(null);
  const bottomRef = useRef(null);

  const ready = isConfigured(config);

  useEffect(() => {
    fetchProviders().then(setProviders).catch(() => setProviders(null));
    // First visit: open the settings so the user can add their keys.
    if (!isConfigured(loadConfig())) setShowConfig(true);
  }, []);

  // Keep the single chat in localStorage so a page refresh doesn't lose it.
  useEffect(() => {
    if (!isStreaming) saveChat(messages);
  }, [messages, isStreaming]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  // Apply a change to the assistant message that is currently streaming.
  const updateLast = (change) =>
    setMessages((prev) => {
      const last = prev[prev.length - 1];
      return [...prev.slice(0, -1), { ...last, ...change(last) }];
    });

  function handleEvent(event) {
    switch (event.type) {
      case "token":
        updateLast((m) => ({ content: m.content + event.content }));
        break;
      case "tool_start":
        updateLast((m) => ({ steps: [...m.steps, { query: event.query, sources: [], done: false }] }));
        break;
      case "tool_end":
        updateLast((m) => {
          // Mark the oldest unfinished search as done.
          const i = m.steps.findIndex((s) => !s.done);
          if (i === -1) return {};
          const steps = [...m.steps];
          steps[i] = { ...steps[i], sources: event.sources, done: true };
          return { steps };
        });
        break;
      case "error":
        updateLast(() => ({ error: event.message }));
        break;
    }
  }

  async function sendMessage(text) {
    const userMessage = { id: newId(), role: "user", content: text };
    // Only send turns that completed cleanly as history for the agent.
    const history = [...messages.filter((m) => m.content && !m.error), userMessage];

    setMessages((prev) => [
      ...prev,
      userMessage,
      { id: newId(), role: "assistant", content: "", steps: [], error: null },
    ]);
    setIsStreaming(true);
    abortRef.current = new AbortController();

    try {
      await streamChat({ messages: history, config, onEvent: handleEvent, signal: abortRef.current.signal });
    } catch (err) {
      if (err.name !== "AbortError") updateLast(() => ({ error: err.message }));
    } finally {
      setIsStreaming(false);
      abortRef.current = null;
    }
  }

  const stop = () => abortRef.current?.abort();

  function clearChat() {
    stop();
    setMessages([]);
  }

  function handleSaveConfig(newConfig) {
    setConfig(newConfig);
    saveConfig(newConfig);
    setShowConfig(false);
  }

  return (
    <div className="app">
      <Header
        config={config}
        providers={providers}
        ready={ready}
        canClear={messages.length > 0}
        onConfigure={() => setShowConfig(true)}
        onClear={clearChat}
      />

      <main className="chat">
        <div className="chat-inner">
          {messages.length === 0 ? (
            <EmptyState ready={ready} onPick={sendMessage} onConfigure={() => setShowConfig(true)} />
          ) : (
            messages.map((m, i) => (
              <ChatMessage
                key={m.id}
                message={m}
                streaming={isStreaming && i === messages.length - 1}
              />
            ))
          )}
          <div ref={bottomRef} />
        </div>
      </main>

      <Composer
        disabled={!ready}
        isStreaming={isStreaming}
        onSend={sendMessage}
        onStop={stop}
        onConfigure={() => setShowConfig(true)}
      />

      {showConfig && (
        <ConfigModal
          config={config}
          providers={providers}
          onSave={handleSaveConfig}
          onClose={() => setShowConfig(false)}
        />
      )}
    </div>
  );
}
