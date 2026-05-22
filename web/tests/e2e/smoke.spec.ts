import { test, expect } from "@playwright/test";

/**
 * Smoke tests — every public page renders without 500s and has the
 * expected anchor content. No auth, no wallet, no Privy mocking.
 *
 * Run locally:
 *   pnpm -F @asastuai/saw-web exec playwright test
 *
 * Run against production:
 *   PLAYWRIGHT_BASE_URL=https://saw-gilt.vercel.app pnpm -F @asastuai/saw-web exec playwright test
 */

test.describe("smoke", () => {
  test("landing renders + key nav links", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/SAW/);
    await expect(page.getByRole("heading", { name: /Be the handler/ })).toBeVisible();
    await expect(page.getByRole("link", { name: /Run the dossier/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /^Demo$/i })).toBeVisible();
  });

  test("demo loads sign-in gate (anonymous)", async ({ page }) => {
    await page.goto("/demo");
    await expect(page.getByText(/Step into the dossier|Sign in|Awaiting handler/i)).toBeVisible({
      timeout: 15_000,
    });
  });

  test("dashboard renders cards with live data", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.getByRole("heading", { name: /SAW in numbers/i })).toBeVisible();
    await expect(page.getByText(/Handlers/i).first()).toBeVisible();
    await expect(page.getByText(/Active agents/i).first()).toBeVisible();
  });

  test("treasury renders address + nav", async ({ page }) => {
    await page.goto("/treasury");
    await expect(page.getByRole("heading", { name: /The treasury/i })).toBeVisible();
    await expect(page.getByText(/Treasury address/i)).toBeVisible();
    await expect(page.getByRole("link", { name: /Open in Solana Explorer/i })).toBeVisible();
  });

  test("public dashboard endpoint returns json", async ({ request }) => {
    const res = await request.get("/api/dashboard");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("handlers");
    expect(body).toHaveProperty("activeAgents");
    expect(body).toHaveProperty("wakes7d");
  });

  test("cron endpoint rejects unauthenticated requests", async ({ request }) => {
    const res = await request.get("/api/cron/wake-due-agents");
    expect([401, 403]).toContain(res.status());
  });

  test("byok endpoint rejects unauthenticated POST", async ({ request }) => {
    const res = await request.post("/api/byok", {
      data: { provider: "groq", plaintext: "gsk_test" },
    });
    expect(res.status()).toBe(401);
  });
});
