import { useEffect, useState } from "react";
import { fetchDefaultPrompt } from "../api.js";
import { CloseIcon, ExternalIcon, EyeIcon, EyeOffIcon } from "./Icons.jsx";

// Used only if the backend's /api/providers can't be reached.
const FALLBACK_PROVIDERS = {
  gemini: { label: "Google Gemini", models: ["gemini-2.5-flash"], key_url: "https://aistudio.google.com/apikey" },
  openai: { label: "OpenAI", models: ["gpt-4o-mini"], key_url: "https://platform.openai.com/api-keys" },
};

function SecretInput({ id, value, onChange, placeholder }) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="secret">
      <input
        id={id}
        type={visible ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete="off"
        spellCheck={false}
      />
      <button type="button" className="icon-btn" onClick={() => setVisible((v) => !v)} title={visible ? "Hide" : "Show"}>
        {visible ? <EyeOffIcon size={16} /> : <EyeIcon size={16} />}
      </button>
    </div>
  );
}

export default function ConfigModal({ config, providers, onSave, onClose }) {
  const options = providers ?? FALLBACK_PROVIDERS;
  // Edit a draft copy; nothing changes until the user clicks Save.
  const [draft, setDraft] = useState(config);
  const current = options[draft.provider];
  const [defaultPrompt, setDefaultPrompt] = useState(null);
  const [promptError, setPromptError] = useState(false);
  // Open the optional section right away if the user already customised something.
  const [showAdvanced, setShowAdvanced] = useState(Boolean(config.systemPrompt || config.personalInfo));

  // Load the built-in prompt once, so it can be shown as a starting point.
  useEffect(() => {
    fetchDefaultPrompt().then(setDefaultPrompt).catch(() => setPromptError(true));
  }, []);

  const usingDefault = !draft.systemPrompt.trim();

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function pickProvider(provider) {
    const models = options[provider].models;
    setDraft((d) => ({
      ...d,
      provider,
      model: models.includes(d.model) ? d.model : models[0],
    }));
  }

  const setApiKey = (value) =>
    setDraft((d) => ({ ...d, apiKeys: { ...d.apiKeys, [d.provider]: value.trim() } }));

  const canSave = draft.model.trim() && draft.apiKeys[draft.provider] && draft.tavilyApiKey;

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="config-title">
        <div className="modal-head">
          <div>
            <h2 id="config-title">Configure API</h2>
            <p>Keys are saved only in this browser and sent to your local backend with each message.</p>
          </div>
          <button className="icon-btn" onClick={onClose} title="Close">
            <CloseIcon />
          </button>
        </div>

        <form
          className="modal-body"
          onSubmit={(e) => {
            e.preventDefault();
            if (canSave) onSave({ ...draft, model: draft.model.trim() });
          }}
        >
          <div className="field">
            <label>Provider</label>
            <div className="provider-grid">
              {Object.entries(options).map(([id, p]) => (
                <button
                  type="button"
                  key={id}
                  className={`provider-card ${draft.provider === id ? "selected" : ""}`}
                  onClick={() => pickProvider(id)}
                >
                  <span className={`provider-logo ${id}`}>{id === "gemini" ? "G" : "AI"}</span>
                  <span className="provider-name">{p.label}</span>
                  <span className="provider-check" />
                </button>
              ))}
            </div>
          </div>

          <div className="field">
            <label htmlFor="model">Model</label>
            <input
              id="model"
              list="model-options"
              value={draft.model}
              onChange={(e) => setDraft((d) => ({ ...d, model: e.target.value }))}
              placeholder="Pick or type a model name"
            />
            <datalist id="model-options">
              {current.models.map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>
            <div className="chips">
              {current.models.map((m) => (
                <button
                  type="button"
                  key={m}
                  className={`chip ${draft.model === m ? "active" : ""}`}
                  onClick={() => setDraft((d) => ({ ...d, model: m }))}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>

          <div className="field">
            <div className="label-row">
              <label htmlFor="api-key">{current.label} API key</label>
              <a href={current.key_url} target="_blank" rel="noopener noreferrer">
                Get a key <ExternalIcon size={12} />
              </a>
            </div>
            <SecretInput
              id="api-key"
              value={draft.apiKeys[draft.provider] ?? ""}
              onChange={setApiKey}
              placeholder={draft.provider === "openai" ? "sk-..." : "AIza..."}
            />
          </div>

          <div className="field">
            <div className="label-row">
              <label htmlFor="tavily-key">Tavily API key (web search)</label>
              <a href="https://app.tavily.com" target="_blank" rel="noopener noreferrer">
                Get a key <ExternalIcon size={12} />
              </a>
            </div>
            <SecretInput
              id="tavily-key"
              value={draft.tavilyApiKey}
              onChange={(v) => setDraft((d) => ({ ...d, tavilyApiKey: v.trim() }))}
              placeholder="tvly-..."
            />
          </div>

          <div className="advanced">
            <button type="button" className="advanced-toggle" onClick={() => setShowAdvanced((v) => !v)} aria-expanded={showAdvanced}>
              <span className={`caret ${showAdvanced ? "open" : ""}`} />
              Personalisation <em>(optional)</em>
              {(draft.systemPrompt.trim() || draft.personalInfo.trim()) && <span className="badge">customised</span>}
            </button>

            {showAdvanced && (
              <div className="advanced-body">
                <div className="field">
                  <label htmlFor="personal-info">About you</label>
                  <textarea
                    id="personal-info"
                    rows={3}
                    maxLength={2000}
                    value={draft.personalInfo}
                    onChange={(e) => setDraft((d) => ({ ...d, personalInfo: e.target.value }))}
                    placeholder="e.g. I'm Sam, a nurse in Leeds. I like short answers with examples."
                  />
                  <p className="field-hint">The assistant uses this to personalise its answers. Leave blank to skip.</p>
                </div>

                <div className="field">
                  <div className="label-row">
                    <label htmlFor="system-prompt">System prompt</label>
                    <span className={`prompt-state ${usingDefault ? "" : "custom"}`}>
                      {usingDefault ? "Using default prompt" : "Custom prompt"}
                    </span>
                  </div>
                  <textarea
                    id="system-prompt"
                    className="mono"
                    rows={8}
                    maxLength={8000}
                    value={draft.systemPrompt}
                    onChange={(e) => setDraft((d) => ({ ...d, systemPrompt: e.target.value }))}
                    placeholder="Blank = use WorldBee's default prompt. Write your own to replace it."
                  />
                  <div className="prompt-actions">
                    <button
                      type="button"
                      className="link-btn"
                      disabled={!defaultPrompt}
                      onClick={() => setDraft((d) => ({ ...d, systemPrompt: defaultPrompt }))}
                    >
                      Load the default prompt to edit it
                    </button>
                    {!usingDefault && (
                      <button type="button" className="link-btn" onClick={() => setDraft((d) => ({ ...d, systemPrompt: "" }))}>
                        Reset to default
                      </button>
                    )}
                  </div>
                  <p className="field-hint">
                    {promptError && "Couldn't load the default prompt from the backend. "}
                    Your prompt replaces the default. The assistant keeps its web search tool. Use{" "}
                    <code>{"{today}"}</code> to insert today's date.
                  </p>
                </div>
              </div>
            )}
          </div>

          <div className="modal-foot">
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={!canSave}>
              Save settings
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
