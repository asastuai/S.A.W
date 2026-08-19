/**
 * Clamp helpers for LLM prompt building. Free-tier providers cap request
 * tokens per call (Groq gpt-oss-20b returns 413 "Request too large" past
 * ~8k TPM), and the briefing conversation is persisted forever in the DB —
 * without a clamp every chat request grows until it can never succeed again.
 */

export type ClampableMessage = { role: string; content: string };

/**
 * Keep the most recent messages whose combined content fits `charBudget`
 * (~4 chars ≈ 1 token). The newest message is always kept, even if it alone
 * exceeds the budget — the model needs to see what the handler just said.
 */
export function clampConversation<T extends ClampableMessage>(
  conversation: T[],
  charBudget = 8_000
): T[] {
  const kept: T[] = [];
  let used = 0;
  for (let i = conversation.length - 1; i >= 0; i--) {
    const cost = conversation[i].content.length;
    if (kept.length > 0 && used + cost > charBudget) break;
    kept.unshift(conversation[i]);
    used += cost;
  }
  return kept;
}
