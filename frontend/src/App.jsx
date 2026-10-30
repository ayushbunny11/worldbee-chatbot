import { useEffect, useRef, useState } from "react";
import { addDocumentFromUrl, deleteDocument, fetchProviders, listDocuments, streamChat, uploadDocument } from "./api.js";
import {
  isConfigured,
  loadEnabled,
  loadSidebarCollapsed,
  loadChat,
  loadConfig,
  saveEnabled,
  saveSidebarCollapsed,
  saveChat,
  saveConfig,
} from "./storage.js";
import Header from "./components/Header.jsx";
import EmptyState from "./components/EmptyState.jsx";
import ChatMessage from "./components/ChatMessage.jsx";
import Composer from "./components/Composer.jsx";
import ConfigModal from "./components/ConfigModal.jsx";
import PersonalPage from "./components/PersonalPage.jsx";
import LibraryModal from "./components/LibraryModal.jsx";
import LinkModal from "./components/LinkModal.jsx";
import Sidebar from "./components/Sidebar.jsx";
import { FileIcon } from "./components/Icons.jsx";
import { checkFile, FILE_KINDS, hostOf, MAX_FILE_MB } from "./documents.js";

const MOBILE_QUERY = "(max-width: 820px)";

let nextId = Date.now();
const newId = () => String(nextId++);

export default function App() {
  const [config, setConfig] = useState(loadConfig);
  const [messages, setMessages] = useState(loadChat);
  // Every indexed file in the backend's library, and which of them are on for this chat.
  const [library, setLibrary] = useState([]);
  const [enabled, setEnabled] = useState(loadEnabled);
  // Uploads in progress or failed: { key, filename, status: "uploading" | "error", error }.
  const [uploads, setUploads] = useState([]);
  // Sidebar: hidden on desktop when collapsed, a slide-in drawer on small screens.
  const [collapsed, setCollapsed] = useState(loadSidebarCollapsed);
  const [drawer, setDrawer] = useState(false);
  const [showLibrary, setShowLibrary] = useState(false);
  const [showLink, setShowLink] = useState(false);
  // What the main area shows: the chat, or the full-page personalisation settings.
  const [view, setView] = useState("chat");
  // On phones the sidebar is always a full drawer. It only minimises to icons on larger screens.
  const [mobile, setMobile] = useState(() => window.matchMedia(MOBILE_QUERY).matches);
  const [dragging, setDragging] = useState(false);
  const [providers, setProviders] = useState(null);
  const [showConfig, setShowConfig] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const abortRef = useRef(null);
  // Uploads cancelled while indexing: the file still reaches the library, but isn't switched on.
  const cancelledRef = useRef(new Set());
  const bottomRef = useRef(null);

  const ready = isConfigured(config);
  const uploading = uploads.some((u) => u.status === "uploading");
  // Chips above the message box: files switched on for this chat, then uploads in progress.
  const attachments = [
    ...enabled.map((id) => library.find((d) => d.id === id)).filter(Boolean).map((d) => ({ ...d, key: d.id, status: "ready" })),
    ...uploads,
  ];

  useEffect(() => {
    fetchProviders().then(setProviders).catch(() => setProviders(null));
    // First visit: open the settings so the user can add their keys.
    if (!isConfigured(loadConfig())) setShowConfig(true);
    // Load the library, and drop switched-on files the backend no longer has.
    listDocuments()
      .then((docs) => {
        setLibrary(docs);
        const known = new Set(docs.map((d) => d.id));
        setEnabled((prev) => prev.filter((id) => known.has(id)));
      })
      .catch(() => {});
  }, []);

  useEffect(() => saveEnabled(enabled), [enabled]);
  useEffect(() => saveSidebarCollapsed(collapsed), [collapsed]);

  useEffect(() => {
    const query = window.matchMedia(MOBILE_QUERY);
    const onChange = (e) => setMobile(e.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  // Escape closes the drawer.
  useEffect(() => {
    if (!drawer) return;
    const onKey = (e) => e.key === "Escape" && setDrawer(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawer]);

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
        updateLast((m) => ({
          steps: [...m.steps, { id: event.id, tool: event.tool, query: event.query, sources: [], done: false }],
        }));
        break;
      case "tool_end":
        updateLast((m) => {
          // Find the search this result belongs to, or else the oldest unfinished one.
          let i = m.steps.findIndex((s) => s.id === event.id && !s.done);
          if (i === -1) i = m.steps.findIndex((s) => !s.done);
          if (i === -1) return {};
          const steps = [...m.steps];
          steps[i] = { ...steps[i], sources: event.sources, done: true, error: event.error || null };
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
    // The chat is saved again when the answer ends; this keeps the question if the page reloads first.
    saveChat([...messages, userMessage]);

    setMessages((prev) => [
      ...prev,
      userMessage,
      { id: newId(), role: "assistant", content: "", steps: [], error: null },
    ]);
    setIsStreaming(true);
    abortRef.current = new AbortController();

    try {
      await streamChat({
        messages: history,
        config,
        documentIds: attachments.filter((a) => a.status === "ready").map((a) => a.id),
        onEvent: handleEvent,
        signal: abortRef.current.signal,
      });
    } catch (err) {
      if (err.name !== "AbortError") updateLast(() => ({ error: err.message }));
    } finally {
      setIsStreaming(false);
      abortRef.current = null;
    }
  }

  const stop = () => abortRef.current?.abort();

  const updateUpload = (key, change) =>
    setUploads((prev) => prev.map((u) => (u.key === key ? { ...u, ...change } : u)));

  const switchOn = (id) => setEnabled((prev) => (prev.includes(id) ? prev : [...prev, id]));
  const switchOff = (id) => setEnabled((prev) => prev.filter((x) => x !== id));
  const toggleDocument = (id) => (enabled.includes(id) ? switchOff(id) : switchOn(id));

  // Upload and index each file into the library, then switch it on for this chat.
  function attachFiles(files) {
    for (const file of files) {
      const key = newId();
      const error = checkFile(file);
      setUploads((prev) => [...prev, { key, filename: file.name, status: error ? "error" : "uploading", error }]);
      if (error) continue;
      uploadDocument(file)
        .then((doc) => {
          // Uploading a file the library already has returns the existing record.
          setLibrary((prev) => (prev.some((d) => d.id === doc.id) ? prev : [...prev, doc]));
          setUploads((prev) => prev.filter((u) => u.key !== key));
          if (cancelledRef.current.has(key)) cancelledRef.current.delete(key);
          else switchOn(doc.id);
        })
        .catch((err) => updateUpload(key, { status: "error", error: err.message }));
    }
  }

  // Fetch a web address into the library and switch it on. Rejects with the reason if it fails,
  // so the pop-up can show it.
  async function addLink(url) {
    const key = newId();
    setUploads((prev) => [...prev, { key, filename: hostOf(url.includes("://") ? url : `https://${url}`), status: "uploading" }]);
    try {
      const doc = await addDocumentFromUrl(url);
      setLibrary((prev) => (prev.some((d) => d.id === doc.id) ? prev : [...prev, doc]));
      switchOn(doc.id);
    } finally {
      setUploads((prev) => prev.filter((u) => u.key !== key));
    }
  }

  // The chip's X turns a file off for this chat. It stays in the library.
  function removeAttachment(attachment) {
    if (attachment.status === "ready") return switchOff(attachment.id);
    cancelledRef.current.add(attachment.key);
    setUploads((prev) => prev.filter((u) => u.key !== attachment.key));
  }

  // Deleting from the library removes the file and its index for good.
  function deleteFromLibrary(id) {
    setLibrary((prev) => prev.filter((d) => d.id !== id));
    switchOff(id);
    deleteDocument(id).catch(() => {});
  }

  // A new chat starts with no files switched on. The library keeps them all.
  const toggleSidebar = () => (mobile ? setDrawer((d) => !d) : setCollapsed((c) => !c));

  function clearChat() {
    stop();
    setMessages([]);
    setEnabled([]);
    // Files still indexing finish into the library, but stay off in the new chat.
    for (const u of uploads) if (u.status === "uploading") cancelledRef.current.add(u.key);
    setUploads([]);
    setView("chat");
    setDrawer(false);
  }

  // Show the drop zone only when files (not text or links) are dragged in.
  function handleDragOver(e) {
    if (!e.dataTransfer.types.includes("Files")) return;
    e.preventDefault();
    setDragging(true);
  }

  function handleDrop(e) {
    e.preventDefault();
    setDragging(false);
    if (ready) attachFiles(e.dataTransfer.files);
  }

  const navigate = (next) => {
    setView(next);
    setDrawer(false);
  };

  // Personalisation saves as you type.
  function updateConfig(change) {
    const next = { ...config, ...change };
    setConfig(next);
    saveConfig(next);
  }

  function handleSaveConfig(newConfig) {
    setConfig(newConfig);
    saveConfig(newConfig);
    setShowConfig(false);
  }

  return (
    <div className={`app ${collapsed ? "collapsed" : ""} ${drawer ? "drawer-open" : ""}`} onDragOver={handleDragOver}>
      <Sidebar
        rail={collapsed && !mobile}
        ready={ready}
        canClear={messages.length > 0 || attachments.length > 0}
        library={library}
        enabled={enabled}
        uploads={uploads}
        view={view}
        customised={Boolean(config.personalInfo.trim() || config.systemPrompt.trim())}
        onNavigate={navigate}
        onToggleSidebar={toggleSidebar}
        onNewChat={clearChat}
        onToggleDoc={toggleDocument}
        onUpload={attachFiles}
        onAddLink={() => {
          setDrawer(false);
          setShowLink(true);
        }}
        onManageFiles={() => {
          setDrawer(false);
          setShowLibrary(true);
        }}
      />
      <div className="scrim" onClick={() => setDrawer(false)} />

      <div className="main">
        <Header
          config={config}
          providers={providers}
          ready={ready}
          canClear={messages.length > 0 || attachments.length > 0}
          onMenu={toggleSidebar}
          onNewChat={clearChat}
          onSettings={() => setShowConfig(true)}
        />

        {view === "personal" ? (
          <PersonalPage config={config} onChange={updateConfig} onBack={() => setView("chat")} />
        ) : (
          <>
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
            uploading={uploading}
            attachments={attachments}
            onAttach={attachFiles}
            onRemoveAttachment={removeAttachment}
            onSend={sendMessage}
            onStop={stop}
            onConfigure={() => setShowConfig(true)}
          />
          </>
        )}
      </div>

      {dragging && (
        // Covers the page while dragging, so leaving it means leaving the window.
        <div
          className="drop-zone"
          onDragOver={(e) => e.preventDefault()}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
        >
          <div className="drop-zone-card">
            <FileIcon size={28} />
            <strong>{ready ? "Drop files to chat with them" : "Configure your API keys first"}</strong>
            <span>{FILE_KINDS} · up to {MAX_FILE_MB} MB each</span>
          </div>
        </div>
      )}

      {showLibrary && (
        <LibraryModal
          library={library}
          enabled={enabled}
          uploads={uploads}
          ready={ready}
          onToggle={toggleDocument}
          onDelete={deleteFromLibrary}
          onUpload={attachFiles}
          onAddLink={() => setShowLink(true)}
          onClose={() => setShowLibrary(false)}
        />
      )}

      {showLink && <LinkModal onAdd={addLink} onClose={() => setShowLink(false)} />}

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
