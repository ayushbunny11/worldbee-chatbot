import { useEffect, useState } from "react";
import { AlertIcon, CloseIcon } from "./Icons.jsx";

// Ask for a web address and add it to the library. Stays open, with the reason, if it fails.
export default function LinkModal({ onAdd, onClose }) {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && !busy && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, busy]);

  async function submit(e) {
    e.preventDefault();
    if (!url.trim() || busy) return;
    setBusy(true);
    setError("");
    try {
      await onAdd(url.trim());
      onClose();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="link-title">
        <div className="modal-head">
          <div>
            <h2 id="link-title">Add a link</h2>
            <p>Paste the address of a web page, PDF, Word, text or image file. It is indexed like an uploaded file.</p>
          </div>
          <button className="icon-btn" onClick={onClose} disabled={busy} title="Close">
            <CloseIcon />
          </button>
        </div>

        <form className="modal-body" onSubmit={submit}>
          <div className="field">
            <label htmlFor="link-url">Web address</label>
            <input
              id="link-url"
              type="text"
              inputMode="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com/article"
              autoComplete="off"
              spellCheck={false}
              disabled={busy}
              autoFocus
            />
            {error && (
              <p className="link-error" role="alert">
                <AlertIcon size={15} />
                {error}
              </p>
            )}
            <p className="field-hint">The page is read once and saved in your library. Pages that need a login or JavaScript to show their text can't be read.</p>
          </div>

          <div className="modal-foot">
            <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={!url.trim() || busy}>
              {busy ? (
                <>
                  <span className="spinner" /> Fetching…
                </>
              ) : (
                "Add page"
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
