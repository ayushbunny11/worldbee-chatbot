// Small helpers around localStorage.
// The API keys and the single chat live only in this browser. The backend
// never stores them; they are sent along with each chat request.

const CONFIG_KEY = "worldbee.config";
const CHAT_KEY = "worldbee.chat";

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

export const loadConfig = () => ({ ...DEFAULT_CONFIG, ...read(CONFIG_KEY, {}) });
export const saveConfig = (config) => write(CONFIG_KEY, config);

export const loadChat = () => read(CHAT_KEY, []);
export const saveChat = (messages) => write(CHAT_KEY, messages);

// True when every key needed for a chat request has been filled in.
export const isConfigured = (config) =>
  Boolean(config.model && config.apiKeys[config.provider] && config.tavilyApiKey);
