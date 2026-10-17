import { useEffect, useRef, useState } from "react";
import { EMOJI_CATEGORIES } from "../emojis.js";

// A small popover with emoji categories. Calls onPick(emoji) when one is chosen.
export default function EmojiPicker({ onPick, onClose }) {
  const [categoryId, setCategoryId] = useState(EMOJI_CATEGORIES[0].id);
  const ref = useRef(null);
  const category = EMOJI_CATEGORIES.find((c) => c.id === categoryId);

  // Close when clicking outside or pressing Escape.
  useEffect(() => {
    const onClick = (e) => !ref.current?.contains(e.target) && onClose();
    const onKey = (e) => e.key === "Escape" && onClose();
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  return (
    <div className="emoji-picker" ref={ref} role="dialog" aria-label="Emoji picker">
      <div className="emoji-tabs" role="tablist">
        {EMOJI_CATEGORIES.map((c) => (
          <button
            type="button"
            key={c.id}
            role="tab"
            aria-selected={c.id === categoryId}
            className={`emoji-tab ${c.id === categoryId ? "active" : ""}`}
            title={c.label}
            onClick={() => setCategoryId(c.id)}
          >
            {c.icon}
          </button>
        ))}
      </div>
      <p className="emoji-title">{category.label}</p>
      <div className="emoji-grid">
        {category.emojis.map((emoji, i) => (
          // onMouseDown + preventDefault keeps focus (and the caret) in the textarea.
          <button
            type="button"
            key={`${emoji}-${i}`}
            className="emoji-btn"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onPick(emoji)}
          >
            {emoji}
          </button>
        ))}
      </div>
    </div>
  );
}
