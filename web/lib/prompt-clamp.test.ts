import { describe, expect, it } from "vitest";
import { clampConversation } from "./prompt-clamp";

const msg = (content: string) => ({ role: "user", content });

describe("clampConversation", () => {
  it("keeps a short conversation untouched", () => {
    const conv = [msg("hola"), msg("che"), msg("dale")];
    expect(clampConversation(conv, 100)).toEqual(conv);
  });

  it("drops oldest messages past the budget, keeps newest", () => {
    const conv = [msg("a".repeat(60)), msg("b".repeat(60)), msg("c".repeat(60))];
    const out = clampConversation(conv, 130);
    expect(out.map((m) => m.content[0])).toEqual(["b", "c"]);
  });

  it("always keeps the newest message even if it alone exceeds budget", () => {
    const conv = [msg("old"), msg("x".repeat(500))];
    const out = clampConversation(conv, 100);
    expect(out).toHaveLength(1);
    expect(out[0].content[0]).toBe("x");
  });

  it("handles empty conversation", () => {
    expect(clampConversation([], 100)).toEqual([]);
  });
});
