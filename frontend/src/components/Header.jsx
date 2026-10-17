import { KeyIcon, LogoMark, TrashIcon } from "./Icons.jsx";

export default function Header({ config, providers, ready, canClear, onConfigure, onClear }) {
  const providerLabel = providers?.[config.provider]?.label ?? config.provider;

  return (
    <header className="header">
      <div className="brand">
        <LogoMark />
        <div>
          <h1>WorldBee</h1>
          <p>AI assistant with web search</p>
        </div>
      </div>

      <div className="header-actions">
        <span className={`status-pill ${ready ? "ok" : "warn"}`} title={ready ? "Ready" : "API keys missing"}>
          <span className="dot" />
          {ready ? (
            <>
              <span className="hide-sm">{providerLabel} · </span>
              {config.model}
            </>
          ) : (
            "Not configured"
          )}
        </span>
        <button className="btn btn-ghost" onClick={onClear} disabled={!canClear} title="Clear the conversation">
          <TrashIcon size={16} />
          <span className="hide-sm">Clear chat</span>
        </button>
        <button className="btn btn-primary" onClick={onConfigure}>
          <KeyIcon size={16} />
          <span className="hide-sm">Configure API</span>
        </button>
      </div>
    </header>
  );
}
