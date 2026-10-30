// Small helpers around localStorage.
// The API keys and the single chat live only in this browser. The backend
// never stores them; they are sent along with each chat request.
// Uploaded files live in the backend's library. Here we only keep which of them
// are switched on for this chat.

const CONFIG_KEY = "worldbee.config";
const CHAT_KEY = "worldbee.chat";
const SIDEBAR_KEY = "worldbee.sidebarCollapsed";
const ENABLED_KEY = "worldbee.enabledDocs";

export const DEFAULT_CONFIG = {
  provider: "gemini",
  model: "gemini-2.5-flash",
  apiKeys: { gemini: "", openai: "" },
  tavilyApiKey: "",
  // Optional. A blank systemPrompt means "use the built-in default prompt".
  systemPrompt: "",
  personalInfo: "",
};

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage can be unavailable (private mode, quota). The app still works.
  }
}

const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const text = (v, fallback = "") => (typeof v === "string" ? v : fallback);

// Saved data can come from an older version or be edited by hand, so each
// loader keeps only values of the expected shape and falls back to defaults.

export function loadConfig() {
  const saved = read(CONFIG_KEY, {});
  const stored = isObject(saved) ? saved : {};
  const keys = isObject(stored.apiKeys) ? stored.apiKeys : {};
  const known = typeof stored.provider === "string" && Object.hasOwn(DEFAULT_CONFIG.apiKeys, stored.provider);
  return {
    provider: known ? stored.provider : DEFAULT_CONFIG.provider,
    model: known ? text(stored.model, DEFAULT_CONFIG.model) : DEFAULT_CONFIG.model,
    apiKeys: Object.fromEntries(Object.keys(DEFAULT_CONFIG.apiKeys).map((p) => [p, text(keys[p])])),
    tavilyApiKey: text(stored.tavilyApiKey),
    systemPrompt: text(stored.systemPrompt),
    personalInfo: text(stored.personalInfo),
  };
}
export const saveConfig = (config) => write(CONFIG_KEY, config);

function loadStep(step) {
  return {
    ...step,
    query: text(step.query),
    sources: Array.isArray(step.sources) ? step.sources.filter(isObject) : [],
    error: text(step.error, null),
    // Nothing is running right after a load.
    done: true,
  };
}

function loadMessage(message, i) {
  const loaded = { ...message, id: text(message.id) || `saved-${i}`, content: text(message.content) };
  if (message.role === "user") return loaded;
  return {
    ...loaded,
    steps: Array.isArray(message.steps) ? message.steps.filter(isObject).map(loadStep) : [],
    error: text(message.error, null),
  };
}

export function loadChat() {
  const saved = read(CHAT_KEY, []);
  if (!Array.isArray(saved)) return [];
  return saved.filter((m) => isObject(m) && (m.role === "user" || m.role === "assistant")).map(loadMessage);
}
export const saveChat = (messages) => write(CHAT_KEY, messages);

export const loadSidebarCollapsed = () => read(SIDEBAR_KEY, false);
export const saveSidebarCollapsed = (collapsed) => write(SIDEBAR_KEY, collapsed);

export function loadEnabled() {
  const saved = read(ENABLED_KEY, []);
  return Array.isArray(saved) ? saved.filter((id) => typeof id === "string") : [];
}
export const saveEnabled = (ids) => write(ENABLED_KEY, ids);

// True when the keys needed for a chat request are filled in. Tavily is
// optional: without it the agent just can't search the web.
export const isConfigured = (config) => Boolean(config.model && config.apiKeys[config.provider]);

// Used by the crash screen: drop the saved chat and file selection, keep the settings.
export function clearSavedChat() {
  try {
    localStorage.removeItem(CHAT_KEY);
    localStorage.removeItem(ENABLED_KEY);
  } catch {
    // Nothing to clear if storage is unavailable.
  }
}
