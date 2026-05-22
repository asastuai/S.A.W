import { describe, it, expect } from "vitest";
import { detectProvider, isValidShape } from "./api-key";

describe("detectProvider", () => {
  it("Groq prefix", () => {
    expect(detectProvider("gsk_abc1234567890abcdef")).toBe("groq");
  });
  it("Gemini prefix", () => {
    expect(detectProvider("AIzaSyAbcDef1234567890abc")).toBe("gemini");
  });
  it("Grok / xAI prefix", () => {
    expect(detectProvider("xai-1234567890abcdef")).toBe("grok");
  });
  it("Cerebras prefix", () => {
    expect(detectProvider("csk-1234567890abcdef")).toBe("cerebras");
  });
  it("Anthropic prefix", () => {
    expect(detectProvider("sk-ant-api03-XYZ-abc")).toBe("anthropic");
  });
  it("OpenAI project key prefix", () => {
    expect(detectProvider("sk-proj-XYZ-abc")).toBe("openai");
  });
  it("OpenAI service account prefix", () => {
    expect(detectProvider("sk-svcacct-XYZ-abc")).toBe("openai");
  });
  it("Bare sk- → DeepSeek default", () => {
    expect(detectProvider("sk-1234567890abcdef")).toBe("deepseek");
  });
  it("Unknown → unknown", () => {
    expect(detectProvider("nope-1234")).toBe("unknown");
    expect(detectProvider("")).toBe("unknown");
  });
  it("Trims whitespace", () => {
    expect(detectProvider("  gsk_xyz123456789012  ")).toBe("groq");
  });
});

describe("isValidShape", () => {
  it("accepts gsk_, AIza, sk-, xai-, csk-", () => {
    expect(isValidShape("gsk_a1b2c3d4e5f6g7h8")).toBe(true);
    expect(isValidShape("AIzaSyAbcDef1234567890")).toBe(true);
    expect(isValidShape("sk-abc1234567890123")).toBe(true);
    expect(isValidShape("xai-1234567890abcdef")).toBe(true);
    expect(isValidShape("csk-1234567890abcdef")).toBe(true);
  });
  it("rejects empty + short + whitespace-bearing", () => {
    expect(isValidShape("")).toBe(false);
    expect(isValidShape("gsk_x")).toBe(false); // too short
    expect(isValidShape("gsk_with spaces")).toBe(false);
  });
  it("rejects unknown prefix", () => {
    expect(isValidShape("nope-a1234567890")).toBe(false);
  });
});
