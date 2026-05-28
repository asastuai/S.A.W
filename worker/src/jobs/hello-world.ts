/**
 * hello-world — smoke test that Trigger.dev is wired correctly.
 *
 * Triggered manually from the Trigger.dev dashboard or via the SDK with
 * `tasks.trigger("hello-world", { name: "Juan" })`.
 *
 * Purpose: confirm the project ref + secret key + deploy pipeline all
 * work before plugging in the real agent-wake / fee jobs.
 */

import { logger, task } from "@trigger.dev/sdk/v3";

export const helloWorldJob = task({
  id: "hello-world",
  maxDuration: 30,
  run: async (payload: { name?: string }, { ctx }) => {
    const name = payload?.name ?? "world";
    logger.log("hello-world fired", { name, runId: ctx.run.id });
    return {
      greeting: `hello, ${name}`,
      ranAt: new Date().toISOString(),
      runId: ctx.run.id,
    };
  },
});
