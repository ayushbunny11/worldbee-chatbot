import { useRef, useState } from "react";
import { ACCEPTED_TYPES, describeDocument, FILE_KINDS, hostOf, MAX_FILE_MB } from "../documents.js";
import { AlertIcon, CloseIcon, FileIcon, LinkIcon, PaperclipIcon, TrashIcon } from "./Icons.jsx";

const formatSize = (bytes) => (bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);

const detailOf = (doc) => [doc.source_url ? hostOf(doc.source_url) : formatSize(doc.size), ...describeDocument(doc)].join(" · ");

// Every file the backend has indexed. The switch decides if this chat can search it.
export default function LibraryModal({ library, enabled, uploads, ready, onToggle, onDelete, onUpload, onAddLink, onClose }) {
  const fileInputRef = useRef(null);
  // The file waiting for a second click on its delete button.
  const [confirming, setConfirming] = useState(null);

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="library-title">
        <div className="modal-head">
          <div>
            <h2 id="library-title">Your files</h2>
            <p>Switch a file on to let this chat search it. Deleting removes it from the library for good.</p>
          </div>
          <button className="icon-btn" onClick={onClose} title="Close">
            <CloseIcon />
          </button>
        </div>

        <div className="modal-body">
          {library.length === 0 && uploads.length === 0 ? (
            <p className="library-empty">No files yet. Add a {FILE_KINDS} file, or a web link, to chat with it.</p>
          ) : (
            <ul className="library-list">
              {library.map((doc) => {
                const on = enabled.includes(doc.id);
                return (
                  <li key={doc.id} className="library-item">
                    <span className="library-icon">
                      {doc.source_url ? <LinkIcon size={18} /> : <FileIcon size={18} />}
                    </span>
                    <span className="library-text">
                      <span className="library-name" title={doc.filename}>
                        {doc.filename}
                      </span>
                      <span className="library-detail">{detailOf(doc)}</span>
                    </span>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={on}
                      aria-label={`Use ${doc.filename} in this chat`}
                      className={`switch ${on ? "on" : ""}`}
                      onClick={() => onToggle(doc.id)}
                      title={on ? "On for this chat" : "Off for this chat"}
                    />
                    {confirming === doc.id ? (
                      <button
                        type="button"
                        className="library-delete confirm"
                        onClick={() => {
                          setConfirming(null);
                          onDelete(doc.id);
                        }}
                        onBlur={() => setConfirming(null)}
                        autoFocus
                      >
                        Delete?
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="library-delete"
                        onClick={() => setConfirming(doc.id)}
                        title="Delete from the library"
                        aria-label={`Delete ${doc.filename}`}
                      >
                        <TrashIcon size={16} />
                      </button>
                    )}
                  </li>
                );
              })}
              {uploads.map((u) => (
                <li key={u.key} className={`library-item ${u.status}`}>
                  <span className="library-icon">
                    {u.status === "error" ? <AlertIcon size={18} /> : <span className="spinner" />}
                  </span>
                  <span className="library-text">
                    <span className="library-name">{u.filename}</span>
                    <span className="library-detail">{u.status === "error" ? u.error : "Indexing…"}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}

          <div className="library-actions">
            <button type="button" className="btn btn-primary" onClick={() => fileInputRef.current?.click()} disabled={!ready}>
              <PaperclipIcon size={16} />
              Add files
            </button>
            <button type="button" className="btn btn-ghost" onClick={onAddLink} disabled={!ready}>
              <LinkIcon size={16} />
              Add link
            </button>
            <span className="library-hint">Up to {MAX_FILE_MB} MB each</span>
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
          </div>
        </div>
      </div>
    </div>
  );
}
