import { test, expect } from "@playwright/test";

/**
 * Perps UI — e2e tests for VenueCard + PositionsPanel.
 *
 * All network calls are mocked via page.route so no real backend is required.
 * Uses /test-perps-ui — a dedicated fixture page that mounts both components
 * with a fixed agentId without any Supabase server-side fetching.
 *
 * Scenarios:
 *   (a) VenueCard "enable" flow — POST returns pubkey → pubkey visible
 *   (b) PositionsPanel with 1 long position — row, uPnL value, liq shown
 *   (c) Pending awaiting-approval item — Approve button visible → click →
 *       PATCH called with approve:true
 */

const AGENT_ID = "test-agent-perps-ui";
const FIXTURE_URL = "/test-perps-ui";

// ── Mock data ─────────────────────────────────────────────────────────────────

const VENUE_DISABLED = { enabled: false, pubkey: null, floatBalanceUsdc: null };
const VENUE_ENABLED_PUBKEY = "Hx9mK3pQrWz8nLvTdCfBsYeJuAoIiXgNkMwQpRtVcZb";

const ONE_LONG_POSITION = {
  positions: [
    {
      market: "SOL-PERP",
      side: "long",
      baseSize: 0.5,
      entryPrice: 155.4,
      markPrice: 162.8,
      unrealizedPnlUsdc: 3.7,
      liqPrice: 120.0,
      stopLoss: 140.0,
      takeProfit: 200.0,
    },
  ],
  pending: [],
};

const PENDING_AWAITING = {
  positions: [],
  pending: [
    {
      id: "item-abc-123",
      perp_market: "BTC-PERP",
      perp_side: "long",
      perp_leverage: 5,
      perp_margin_usdc: 100,
      status: "awaiting-approval",
      // Real API field names (positions/route.ts): asset is derived from
      // perp_market, the threshold is trigger_target_price.
      trigger_kind: "below",
      trigger_target_price: 62000,
    },
  ],
};

// ── (a) VenueCard enable flow ─────────────────────────────────────────────────

test.describe("VenueCard", () => {
  test("(a) enable flow — POST called, pubkey shown", async ({ page }) => {
    let venueEnabled = false;

    // Venue: disabled until POST, then enabled
    await page.route(`**/api/agents/${AGENT_ID}/venue`, async (route) => {
      const method = route.request().method();
      if (method === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(venueEnabled
            ? { enabled: true, pubkey: VENUE_ENABLED_PUBKEY, floatBalanceUsdc: null }
            : VENUE_DISABLED),
        });
      } else if (method === "POST") {
        venueEnabled = true;
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ pubkey: VENUE_ENABLED_PUBKEY }),
        });
      } else {
        await route.continue();
      }
    });

    // Positions (empty — just needs to not hang)
    await page.route(`**/api/agents/${AGENT_ID}/positions`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ positions: [], pending: [] }),
      });
    });

    await page.goto(FIXTURE_URL);

    // "Enable perps venue" button must be visible
    const enableBtn = page.getByTestId("enable-venue-button");
    await expect(enableBtn).toBeVisible({ timeout: 10_000 });

    // Click it
    await enableBtn.click();

    // Pubkey must appear after the POST resolves
    const pubkeyEl = page.getByTestId("venue-pubkey");
    await expect(pubkeyEl).toBeVisible({ timeout: 8_000 });
    await expect(pubkeyEl).toContainText(VENUE_ENABLED_PUBKEY.slice(0, 6));

    // Enable button must be gone
    await expect(enableBtn).not.toBeVisible();
  });
});

// ── (b) PositionsPanel — 1 long position ─────────────────────────────────────

test.describe("PositionsPanel", () => {
  test("(b) 1 long position — row visible, uPnL shown, liq shown", async ({ page }) => {
    await page.route(`**/api/agents/${AGENT_ID}/venue`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ enabled: true, pubkey: VENUE_ENABLED_PUBKEY, floatBalanceUsdc: 250 }),
      });
    });

    await page.route(`**/api/agents/${AGENT_ID}/positions`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(ONE_LONG_POSITION),
      });
    });

    await page.goto(FIXTURE_URL);

    // Position row visible
    const posRow = page.getByTestId("position-row").first();
    await expect(posRow).toBeVisible({ timeout: 10_000 });

    // Side + market text in the row
    await expect(posRow).toContainText("long");
    await expect(posRow).toContainText("SOL-PERP");

    // uPnL value — positive
    const upnlEl = page.getByTestId("upnl-value").first();
    await expect(upnlEl).toBeVisible();
    await expect(upnlEl).toContainText("+$3.70");

    // Liq price shown (not "—")
    await expect(posRow).toContainText("$120.00");
  });

  // ── (c) Pending awaiting-approval item + Approve button ───────────────────

  test("(c) awaiting-approval item — Approve button visible, PATCH sent with approve:true", async ({ page }) => {
    const patchRequests: Array<{ url: string; body: string }> = [];

    await page.route(`**/api/agents/${AGENT_ID}/venue`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(VENUE_DISABLED),
      });
    });

    await page.route(`**/api/agents/${AGENT_ID}/positions`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(PENDING_AWAITING),
      });
    });

    // Capture PATCH to schedule endpoint
    await page.route(
      `**/api/agents/${AGENT_ID}/schedule**`,
      async (route) => {
        if (route.request().method() === "PATCH") {
          patchRequests.push({
            url: route.request().url(),
            body: route.request().postData() ?? "",
          });
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ ok: true }),
          });
        } else {
          await route.continue();
        }
      }
    );

    await page.goto(FIXTURE_URL);

    // Pending row with awaiting badge
    const pendingRow = page.getByTestId("pending-row").first();
    await expect(pendingRow).toBeVisible({ timeout: 10_000 });

    const awaitingBadge = page.getByTestId("awaiting-badge").first();
    await expect(awaitingBadge).toBeVisible();
    await expect(awaitingBadge).toContainText("awaiting-approval");

    // Trigger label renders from real API fields (perp_market → asset,
    // trigger_target_price → threshold). Guards against the field-name
    // regression where the panel read non-existent trigger_asset/trigger_price.
    await expect(pendingRow).toContainText("BTC ≤ $62000.00");

    // Approve button visible
    const approveBtn = page.getByTestId("approve-button").first();
    await expect(approveBtn).toBeVisible();

    // Click approve
    await approveBtn.click();

    // Wait for the PATCH to be captured
    await expect
      .poll(() => patchRequests.length, { timeout: 5_000 })
      .toBeGreaterThan(0);

    // URL must carry itemId query param
    expect(patchRequests[0]?.url).toContain("itemId=item-abc-123");

    // Body must include approve:true and status:"queued"
    const body = JSON.parse(patchRequests[0]?.body ?? "{}") as {
      approve?: boolean;
      status?: string;
    };
    expect(body.approve).toBe(true);
    expect(body.status).toBe("queued");
  });
});
