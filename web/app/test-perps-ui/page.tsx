"use client";

/**
 * TEST FIXTURE PAGE — perps UI e2e harness.
 *
 * This page exists ONLY for Playwright tests. It mounts PositionsPanel and
 * VenueCard with a fixed agentId so tests can exercise the components without
 * a real Supabase agent record. All API calls are intercepted by page.route().
 *
 * It stays reachable in production (pnpm test:e2e:prod targets the live URL) but
 * is noindex/nofollow via ./layout.tsx. A real visitor with no session will see
 * the panels render their `401` (unauthenticated) state — that is EXPECTED here,
 * not a bug. The notice below makes that explicit so the route doesn't read as
 * broken (QA finding L2).
 *
 * Route: /test-perps-ui
 */

import { PositionsPanel } from "@/components/positions-panel";
import { VenueCard } from "@/components/venue-card";

// Fixed agent id for the e2e harness. NOT exported — Next.js page files may only
// export reserved names (default, metadata, etc.); a named export here breaks the
// typed-routes build (TS2344). The Playwright spec defines its own matching
// constant (web/tests/e2e/perps-ui.spec.ts: AGENT_ID).
const PERPS_TEST_AGENT_ID = "test-agent-perps-ui";

export default function TestPerpsUiPage() {
  return (
    <main className="min-h-screen bg-obsidian p-8 max-w-3xl mx-auto space-y-8">
      <div className="space-y-2 border border-gold/15 bg-ink/40 px-4 py-3">
        <div className="font-mono text-xs text-gold/40 uppercase tracking-widest">
          test fixture · perps ui · e2e only
        </div>
        <p className="font-mono text-[11px] leading-relaxed text-bone/40">
          Internal Playwright harness. With no signed-in session the panels below
          render their unauthenticated <span className="text-rust/80">401</span>{" "}
          state on purpose — this route exists only to exercise the VenueCard and
          PositionsPanel components against mocked API responses. Nothing here is
          broken.
        </p>
      </div>
      <VenueCard agentId={PERPS_TEST_AGENT_ID} />
      <PositionsPanel agentId={PERPS_TEST_AGENT_ID} />
    </main>
  );
}
