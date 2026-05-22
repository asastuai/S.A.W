import { describe, it, expect } from "vitest";
import { getProviderAdapter, isProviderImplemented } from "./index";

describe("provider registry", () => {
  const implemented = [
    "groq",
    "gemini",
    "deepseek",
    "grok",
    "openai",
    "anthropic",
    "cerebras",
    "kimi",
  ] as const;

  it.each(implemented)("has %s implemented", (p) => {
    expect(isProviderImplemented(p as any)).toBe(true);
  });

  it.each(implemented)("returns adapter for %s with id + defaultModel", (p) => {
    const a = getProviderAdapter(p as any);
    expect(a.id).toBe(p);
    expect(typeof a.defaultModel).toBe("string");
    expect(a.defaultModel.length).toBeGreaterThan(0);
    expect(typeof a.complete).toBe("function");
  });

  it("throws for unimplemented provider", () => {
    // future provider not yet in registry
    expect(() => getProviderAdapter("ollama" as any)).toThrow();
  });
});
