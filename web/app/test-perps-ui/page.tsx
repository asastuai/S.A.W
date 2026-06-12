"use client";

/**
 * TEST FIXTURE PAGE — perps UI e2e harness.
 *
 * This page exists ONLY for Playwright tests. It mounts PositionsPanel and
 * VenueCard with a fixed agentId so tests can exercise the components without
 * a real Supabase agent record. All API calls are intercepted by page.route().
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
      <div className="font-mono text-xs text-gold/40 uppercase tracking-widest">
        test fixture · perps ui · e2e only
      </div>
      <VenueCard agentId={PERPS_TEST_AGENT_ID} />
      <PositionsPanel agentId={PERPS_TEST_AGENT_ID} />
    </main>
  );
}
