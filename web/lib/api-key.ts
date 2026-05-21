const KEY = "saw-demo-v1:llm-api-key";

export function loadApiKey(): string | null {
  if (typeof window === "undefined") return null;
  // back-compat: read legacy single-provider key
  return (
    window.localStorage.getItem(KEY) ??
    window.localStorage.getItem("saw-demo-v1:groq-api-key")
  );
}

export function saveApiKey(key: string) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, key.trim());
}

export function clearApiKey() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(KEY);
  window.localStorage.removeItem("saw-demo-v1:groq-api-key");
}

/**
 * Relaxed shape check that accepts any of the 4+ active providers.
 * Per-provider strict validation lives in the API key modal copy.
 */
export function isValidShape(key: string): boolean {
  const k = key.trim();
  if (k.length < 16) return false;
  if (/\s/.test(k)) return false;
  return (
    k.startsWith("gsk_") ||      // Groq
    k.startsWith("AIza") ||      // Google / Gemini
    k.startsWith("sk-") ||       // OpenAI / DeepSeek / Anthropic
    k.startsWith("xai-") ||      // Grok
    k.startsWith("Bearer ")      // generic
  );
}

/**
 * Best-effort provider detection from key prefix.
 * Used by API routes to dispatch the right adapter.
 */
export type DetectedProvider =
  | "groq"
  | "gemini"
  | "deepseek"
  | "grok"
  | "openai"
  | "anthropic"
  | "unknown";

export function detectProvider(key: string): DetectedProvider {
  const k = key.trim();
  if (k.startsWith("gsk_")) return "groq";
  if (k.startsWith("AIza")) return "gemini";
  if (k.startsWith("xai-")) return "grok";
  if (k.startsWith("sk-ant-")) return "anthropic";
  if (k.startsWith("sk-")) return "deepseek"; // could also be openai — DeepSeek wins by being more common in BYOK contexts
  return "unknown";
}
