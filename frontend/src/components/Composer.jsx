import { useEffect, useRef, useState } from "react";
import EmojiPicker from "./EmojiPicker.jsx";
import { SendIcon, SmileIcon, StopIcon } from "./Icons.jsx";

export default function Composer({ disabled, isStreaming, onSend, onStop, onConfigure }) {
  const [text, setText] = useState("");
  const [showEmoji, setShowEmoji] = useState(false);
  const textareaRef = useRef(null);

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
    if (!value || disabled || isStreaming) return;
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
      <form
        className={`composer ${disabled ? "is-disabled" : ""}`}
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <textarea
          ref={textareaRef}
          rows={1}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={disabled ? "Configure your API keys to start chatting…" : "Ask me anything…"}
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
          <button type="submit" className="send-btn" disabled={disabled || !text.trim()} title="Send">
            <SendIcon size={18} />
          </button>
        )}
      </form>
      <p className="hint">
        {disabled ? (
          <button className="link-btn" onClick={onConfigure}>
            Open Configure API
          </button>
        ) : (
          <>
            <kbd>Enter</kbd> to send · <kbd>Shift</kbd>+<kbd>Enter</kbd> for a new line. AI can make mistakes.
          </>
        )}
      </p>
    </div>
  );
}
