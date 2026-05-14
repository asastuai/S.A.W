const KEY = "saw-demo-v1:groq-api-key";

export function loadApiKey(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(KEY);
}

export function saveApiKey(key: string) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, key.trim());
}

export function clearApiKey() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(KEY);
}

export function isValidShape(key: string): boolean {
  const k = key.trim();
  return k.length > 20 && k.startsWith("gsk_");
}
