"use client";

import { detectProvider } from "@/lib/api-key";

const LABEL: Record<string, string> = {
  groq: "Groq · gpt-oss",
  gemini: "Gemini Flash-Lite",
  deepseek: "DeepSeek V3",
  grok: "Grok 3 mini",
  openai: "OpenAI · gpt-4o-mini",
  anthropic: "Claude Haiku 4.5",
  cerebras: "Cerebras · Llama 3.3",
  kimi: "Kimi · Moonshot",
  unknown: "—",
};

export function ProviderBadge({ apiKey }: { apiKey: string | null }) {
  if (!apiKey) return null;
  const provider = detectProvider(apiKey);
  const label = LABEL[provider] ?? "Unknown brain";
  return (
    <div className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-ash text-xs uppercase tracking-widest text-bone/60">
      <span className="text-gold">●</span>
      <span>brain · {label}</span>
    </div>
  );
}
