import { useRef, useState } from "react";
import { ACCEPTED_TYPES, FILE_KINDS } from "../documents.js";
import { AlertIcon, ChatIcon, ChevronIcon, FileIcon, LinkIcon, LogoMark, PanelIcon, PaperclipIcon, PlusIcon, UserIcon } from "./Icons.jsx";

// How many files the sidebar lists before pointing to the full library.
const VISIBLE_FILES = 5;

// One titled group in the sidebar. New features get their own section.
function SidebarSection({ title, meta, open, onToggle, children }) {
  return (
    <section className="side-section">
      <button type="button" className="side-title" onClick={onToggle} aria-expanded={open}>
        <ChevronIcon size={14} className={open ? "" : "closed"} />
        <span>{title}</span>
        {meta && <span className="side-meta">{meta}</span>}
      </button>
      {open && <div className="side-body">{children}</div>}
    </section>
  );
}

// Left column: New chat, pages and one section per feature.
// - Open: the full sidebar. The panel icon minimises it.
// - Minimised (`rail`): a narrow strip of icons. Hovering it opens the full sidebar over
//   the chat for as long as the pointer stays; clicking the logo keeps it open.
// Both layouts stay in the DOM and cross-fade, so the width change can animate.
// On phones it slides in over the chat as a drawer.
export default function Sidebar({
  rail,
  ready,
  canClear,
  library,
  enabled,
  uploads,
  view,
  customised,
  onNavigate,
  onToggleSidebar,
  onNewChat,
  onToggleDoc,
  onUpload,
  onAddLink,
  onManageFiles,
}) {
  const fileInputRef = useRef(null);
  const [filesOpen, setFilesOpen] = useState(true);
  // Right after minimising, the pointer is still over the sidebar. Don't pop it open
  // again until the pointer has left once.
  const [noPeek, setNoPeek] = useState(false);
  const minimise = () => {
    setNoPeek(true);
    onToggleSidebar();
  };
  // The Files icon on the rail opens the Files section and brings the full sidebar back.
  const expandFiles = () => {
    setFilesOpen(true);
    onToggleSidebar();
  };

  const shown = library.slice(0, VISIBLE_FILES);
  const hidden = library.length - shown.length;

  return (
    <div className={`sidebar-slot ${rail ? "rail" : ""}`}>
      <aside className={`sidebar ${rail ? "rail" : ""} ${noPeek ? "no-peek" : ""}`} aria-label="Sidebar" onMouseLeave={() => setNoPeek(false)}>
        <div className="side-rail">
          {/* The logo opens the sidebar and keeps it open. */}
          <button className="rail-btn logo" onClick={onToggleSidebar} aria-label="Open sidebar">
            <LogoMark size={30} />
          </button>
          {/* Same order and spacing as the open sidebar, so every icon sits where its row is. */}
          <button className="rail-btn primary" onClick={onNewChat} disabled={!canClear} title="New chat" aria-label="New chat">
            <PlusIcon size={20} />
          </button>
          <div className="rail-nav">
            <button className={`rail-btn ${view === "chat" ? "active" : ""}`} onClick={() => onNavigate("chat")} title="Chat" aria-label="Chat">
              <ChatIcon size={20} />
            </button>
            <button
              className={`rail-btn ${view === "personal" ? "active" : ""}`}
              onClick={() => onNavigate("personal")}
              title="Personalisation"
              aria-label="Personalisation"
            >
              <UserIcon size={20} />
              {customised && <span className="rail-dot" />}
            </button>
            <button className="rail-btn" onClick={expandFiles} title="Files" aria-label="Files">
              <FileIcon size={20} />
              {enabled.length > 0 && <span className="rail-badge">{enabled.length}</span>}
            </button>
          </div>
        </div>

        <div className="side-full">
          <div className="sidebar-head">
            <div className="brand">
              <LogoMark size={30} />
              <h1>WorldBee</h1>
            </div>
            <button className="icon-btn" onClick={minimise} title={rail ? "Keep sidebar open" : "Minimise sidebar"} aria-label={rail ? "Keep sidebar open" : "Minimise sidebar"}>
              <PanelIcon size={19} />
            </button>
          </div>

          <button className="btn btn-primary new-chat" onClick={onNewChat} disabled={!canClear}>
            <PlusIcon size={16} />
            New chat
          </button>

          <div className="side-group">
            <nav className="side-nav" aria-label="Pages">
              <button className={`side-nav-item ${view === "chat" ? "active" : ""}`} onClick={() => onNavigate("chat")}>
                <ChatIcon size={17} />
                Chat
              </button>
              <button className={`side-nav-item ${view === "personal" ? "active" : ""}`} onClick={() => onNavigate("personal")}>
                <UserIcon size={17} />
                Personalisation
                  </button>
            </nav>

            <SidebarSection title="Files" meta={library.length > 0 ? `${enabled.length} on` : null} open={filesOpen} onToggle={() => setFilesOpen((o) => !o)}>
              {library.length === 0 && uploads.length === 0 ? (
                <p className="side-empty">Add a {FILE_KINDS} file, or a web link, to chat with it.</p>
              ) : (
                <ul className="side-files">
                  {shown.map((doc) => {
                    const on = enabled.includes(doc.id);
                    return (
                      <li key={doc.id} className="side-file">
                        {doc.source_url ? <LinkIcon size={15} /> : <FileIcon size={15} />}
                        <span className="side-file-name" title={doc.filename}>
                          {doc.filename}
                        </span>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={on}
                          aria-label={`Use ${doc.filename} in this chat`}
                          className={`switch ${on ? "on" : ""}`}
                          onClick={() => onToggleDoc(doc.id)}
                          title={on ? "On for this chat" : "Off for this chat"}
                        />
                      </li>
                    );
                  })}
                  {uploads.map((u) => (
                    <li key={u.key} className={`side-file ${u.status}`} title={u.status === "error" ? u.error : "Indexing…"}>
                      {u.status === "error" ? <AlertIcon size={15} /> : <span className="spinner" />}
                      <span className="side-file-name">{u.filename}</span>
                    </li>
                  ))}
                </ul>
              )}

              <div className="side-actions">
                <button type="button" className="side-link" onClick={() => fileInputRef.current?.click()} disabled={!ready}>
                  <PaperclipIcon size={14} />
                  Add files
                </button>
                <button type="button" className="side-link" onClick={onAddLink} disabled={!ready}>
                  <LinkIcon size={14} />
                  Add link
                </button>
                {library.length > 0 && (
                  <button type="button" className="side-link manage" onClick={onManageFiles}>
                    {hidden > 0 ? `Manage all (${library.length})` : "Manage"}
                  </button>
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept={ACCEPTED_TYPES.join(",")}
                hidden
                onChange={(e) => {
                  onUpload(e.target.files);
                  e.target.value = "";
                }}
              />
            </SidebarSection>
          </div>
        </div>
      </aside>
    </div>
  );
}
