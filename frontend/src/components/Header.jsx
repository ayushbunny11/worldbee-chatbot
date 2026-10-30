import { LogoMark, MenuIcon, PlusIcon, SettingsIcon } from "./Icons.jsx";

// Top bar above the chat: model status and settings. On phones it also holds
// the menu button, the brand and New chat, because the sidebar is a drawer.
export default function Header({ config, providers, ready, canClear, onMenu, onNewChat, onSettings }) {
  const providerLabel = providers?.[config.provider]?.label ?? config.provider;

  return (
    <header className="topbar">
      <div className="topbar-left">
        <button className="icon-btn topbar-menu" onClick={onMenu} title="Open menu" aria-label="Open menu">
          <MenuIcon size={20} />
        </button>
        <div className="brand topbar-brand">
          <LogoMark size={26} />
          <h1>WorldBee</h1>
        </div>
        <span className={`status-pill ${ready ? "ok" : "warn"}`} title={ready ? "Ready" : "API keys missing"}>
          <span className="dot" />
          <span className="status-text">{ready ? `${providerLabel} · ${config.model}` : "Not configured"}</span>
        </span>
      </div>

      <div className="topbar-right">
        <button className="icon-btn topbar-new" onClick={onNewChat} disabled={!canClear} title="New chat" aria-label="New chat">
          <PlusIcon size={20} />
        </button>
        <button className="icon-btn" onClick={onSettings} title="Settings" aria-label="Settings">
          <SettingsIcon size={19} />
        </button>
      </div>
    </header>
  );
}
