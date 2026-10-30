import { useEffect, useRef, useState } from "react";
import { ACCEPTED_TYPES, describeDocument, FILE_KINDS } from "../documents.js";
import EmojiPicker from "./EmojiPicker.jsx";
import { AlertIcon, CloseIcon, FileIcon, LinkIcon, PaperclipIcon, SendIcon, SmileIcon, StopIcon } from "./Icons.jsx";

// One attached file: indexing spinner, ready, or the reason it failed.
function AttachmentChip({ attachment, onRemove }) {
  const { filename, status, error } = attachment;
  const detail =
    status === "uploading"
      ? "Indexing…"
      : status === "error"
        ? error
        : describeDocument(attachment).join(" · ");
  return (
    <div className={`attachment ${status}`} title={status === "error" ? error : filename}>
      <span className="attachment-icon">
        {status === "uploading" ? <span className="spinner" /> : status === "error" ? <AlertIcon size={16} /> : attachment.source_url ? <LinkIcon size={16} /> : <FileIcon size={16} />}
      </span>
      <span className="attachment-text">
        <span className="attachment-name">{filename}</span>
        <span className="attachment-detail">{detail}</span>
      </span>
      <button type="button" className="attachment-remove" onClick={() => onRemove(attachment)} title={status === "ready" ? "Turn off for this chat" : "Remove"} aria-label={`${status === "ready" ? "Turn off" : "Remove"} ${filename}`}>
        <CloseIcon size={14} />
      </button>
    </div>
  );
}

export default function Composer({
  disabled,
  isStreaming,
  uploading,
  attachments,
  onAttach,
  onRemoveAttachment,
  onSend,
  onStop,
  onConfigure,
}) {
  const [text, setText] = useState("");
  const [showEmoji, setShowEmoji] = useState(false);
  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);

  // Grow the textarea with its content, up to a max height.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [text]);

  // Insert an emoji at the caret (replacing any selection) and keep typing.
  function insertEmoji(emoji) {
    const el = textareaRef.current;
    const start = el?.selectionStart ?? text.length;
    const end = el?.selectionEnd ?? text.length;
    setText(text.slice(0, start) + emoji + text.slice(end));
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start + emoji.length, start + emoji.length);
    });
  }

  function submit() {
    const value = text.trim();
    // Wait for uploads, so the agent can search every attached file.
    if (!value || disabled || isStreaming || uploading) return;
    onSend(value);
    setText("");
  }

  function handleKeyDown(e) {
    // Enter sends, Shift+Enter adds a new line.
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    }
  }

  return (
    <div className="composer-wrap">
      {attachments.length > 0 && (
        <div className="attachments">
          {attachments.map((a) => (
            <AttachmentChip key={a.key} attachment={a} onRemove={onRemoveAttachment} />
          ))}
        </div>
      )}
      <form
        className={`composer ${disabled ? "is-disabled" : ""}`}
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <button
          type="button"
          className="attach-btn"
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled}
          title={`Attach files (${FILE_KINDS})`}
          aria-label="Attach files"
        >
          <PaperclipIcon size={19} />
        </button>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={ACCEPTED_TYPES.join(",")}
          hidden
          onChange={(e) => {
            onAttach(e.target.files);
            // Reset, so picking the same file again still triggers onChange.
            e.target.value = "";
          }}
        />
        <textarea
          ref={textareaRef}
          rows={1}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={
            disabled
              ? "Configure your API keys to start chatting…"
              : attachments.length
                ? "Ask about your files…"
                : "Ask me anything…"
          }
          disabled={disabled}
          autoFocus
        />
        <div className="emoji-anchor">
          <button
            type="button"
            className={`emoji-toggle ${showEmoji ? "active" : ""}`}
            onClick={() => setShowEmoji((v) => !v)}
            disabled={disabled}
            title="Add emoji"
            aria-label="Add emoji"
            aria-expanded={showEmoji}
          >
            <SmileIcon size={20} />
          </button>
          {showEmoji && <EmojiPicker onPick={insertEmoji} onClose={() => setShowEmoji(false)} />}
        </div>
        {isStreaming ? (
          <button type="button" className="send-btn stop" onClick={onStop} title="Stop generating">
            <StopIcon size={16} />
          </button>
        ) : (
          <button
            type="submit"
            className="send-btn"
            disabled={disabled || uploading || !text.trim()}
            title={uploading ? "Wait for your files to finish indexing" : "Send"}
          >
            <SendIcon size={18} />
          </button>
        )}
      </form>
      <p className="hint">
        {disabled ? (
          <button className="link-btn" onClick={onConfigure}>
            Open Configure API
          </button>
        ) : uploading ? (
          "Indexing your files. You can send once they're ready."
        ) : (
          <>
            <span className="hint-keys">
              <kbd>Enter</kbd> to send · <kbd>Shift</kbd>+<kbd>Enter</kbd> for a new line.{" "}
            </span>
            AI can make mistakes.
          </>
        )}
      </p>
    </div>
  );
}
