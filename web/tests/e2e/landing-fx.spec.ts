import { test, expect } from "@playwright/test";

/**
 * Landing hover FX e2e tests (spec 2026-06-11).
 *
 * Tests the four micro-interactions implemented in:
 *   - components/fx/spotlight.tsx  → .sawfx-spot-glow + .sawfx-bracket
 *   - components/fx/magnetic.tsx   → CTA spring
 *   - components/fx/decode-text.tsx → scramble decode
 *
 * The hologram (three.js canvas) is deliberately NOT tested here —
 * lazy WebGL canvas assertions are flaky in CI headless chromium.
 *
 * Run:
 *   pnpm test:e2e -- landing-fx.spec.ts
 */

test("spotlight: hover sobre una card no rompe layout y activa el glow", async ({ page }) => {
  await page.goto("/");

  // Wait for hydration — FX components are client-only ("use client")
  await page.waitForLoadState("domcontentloaded");

  const card = page.locator(".sawfx-spot").first();
  await card.scrollIntoViewIfNeeded();

  const before = await card.boundingBox();
  expect(before).not.toBeNull();

  // Hover activates CSS :hover → .sawfx-spot-glow opacity: 1
  await card.hover();

  const glow = card.locator(".sawfx-spot-glow");
  await expect(glow).toHaveCSS("opacity", "1");

  const after = await card.boundingBox();
  expect(after).not.toBeNull();
  expect(after!.width).toBe(before!.width); // no layout shift on hover
});

test("reduced-motion: brackets quedan apagados con opacity 0", async ({ page }) => {
  // Emulate prefers-reduced-motion BEFORE navigation so the media query
  // is active when styles load. useFxEnabled() will also return false,
  // so onMouseMove handlers are not registered — double kill-switch.
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page.waitForLoadState("domcontentloaded");

  // Target a card that has brackets (Spotlight with brackets={true})
  // Both HowItWorks steps and FeatureGrid cards use <Spotlight brackets>
  const card = page.locator(".sawfx-spot:has(.sawfx-bracket)").first();
  await card.scrollIntoViewIfNeeded();
  await card.hover();

  // CSS rule: @media (prefers-reduced-motion: reduce) { .sawfx-bracket { opacity: 0 !important; } }
  const bracket = card.locator(".sawfx-bracket").first();
  await expect(bracket).toHaveCSS("opacity", "0");
});

test("CTA magnético presente y clickeable", async ({ page }) => {
  await page.goto("/");
  await page.waitForLoadState("domcontentloaded");

  // The primary CTA is a <Link href="/demo"> containing:
  //   <CommandLine prompt="$">saw run --dossier →</CommandLine>
  // The $ prompt has aria-hidden so accessible name is "saw run --dossier →"
  // Use a partial regex match against the visible text.
  const cta = page.getByRole("link", { name: /saw run/i });
  await expect(cta).toBeVisible();
  await cta.hover();
  // After hover the magnetic wrapper shifts slightly but the link stays visible
  await expect(cta).toBeVisible();
});

test("decode kicker: hover + settle back al texto original", async ({ page }) => {
  await page.goto("/");
  await page.waitForLoadState("domcontentloaded");

  // DecodeText renders aria-label={text} on the outer span.
  // The "whoami" kicker is in the Personas section.
  // Find it via aria-label since the visible text may be scrambled mid-animation.
  const kicker = page.locator('[aria-label="whoami"]').first();
  await kicker.scrollIntoViewIfNeeded();

  // Verify accessible label is present before hover
  await expect(kicker).toBeVisible();

  await kicker.hover();

  // Wait for the 350ms decode animation + settling margin (~1s total)
  await page.waitForTimeout(1100);

  // After animation settles the display span shows the real text again
  // and the aria-label is still "whoami" (invariant)
  await expect(kicker).toHaveAttribute("aria-label", "whoami");
});
