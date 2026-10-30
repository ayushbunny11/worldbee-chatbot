import { useEffect, useState } from "react";
import { fetchDefaultPrompt } from "../api.js";

// Full-page settings that replace the chat. Changes save as you type.
export default function PersonalPage({ config, onChange, onBack }) {
  const [defaultPrompt, setDefaultPrompt] = useState(null);
  const [promptError, setPromptError] = useState(false);
  const usingDefault = !config.systemPrompt.trim();

  // Load the built-in prompt once, so it can be shown as a starting point.
  useEffect(() => {
    fetchDefaultPrompt().then(setDefaultPrompt).catch(() => setPromptError(true));
  }, []);

  return (
    <main className="chat page">
      <div className="page-inner">
        <h2>Personalisation</h2>
        <p className="page-sub">Tune how the assistant talks to you. Everything here is optional and saves as you type.</p>

        <div className="field">
          <label htmlFor="personal-info">About you</label>
          <textarea
            id="personal-info"
            rows={4}
            maxLength={2000}
            value={config.personalInfo}
            onChange={(e) => onChange({ personalInfo: e.target.value })}
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
            rows={12}
            maxLength={8000}
            value={config.systemPrompt}
            onChange={(e) => onChange({ systemPrompt: e.target.value })}
            placeholder="Blank = use WorldBee's default prompt. Write your own to replace it."
          />
          <div className="prompt-actions">
            <button type="button" className="link-btn" disabled={!defaultPrompt} onClick={() => onChange({ systemPrompt: defaultPrompt })}>
              Load the default prompt to edit it
            </button>
            {!usingDefault && (
              <button type="button" className="link-btn" onClick={() => onChange({ systemPrompt: "" })}>
                Reset to default
              </button>
            )}
          </div>
          <p className="field-hint">
            {promptError && "Couldn't load the default prompt from the backend. "}
            Your prompt replaces the default. The assistant keeps its tools (web search and your files). Use{" "}
            <code>{"{today}"}</code> to insert today's date.
          </p>
        </div>

        <button type="button" className="btn btn-ghost" onClick={onBack}>
          Back to chat
        </button>
      </div>
    </main>
  );
}
