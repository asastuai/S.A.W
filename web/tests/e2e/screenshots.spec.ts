import { test, expect } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";

/**
 * Visual smoke pass against production. Captures key public screens
 * + collects console errors. Run with:
 *   PLAYWRIGHT_BASE_URL=https://saw-gilt.vercel.app npx playwright test screenshots.spec --project=chromium
 */

const OUT_DIR = "./test-results/screens";
fs.mkdirSync(OUT_DIR, { recursive: true });

const VIEWPORTS = [
  { name: "mobile", width: 375, height: 812 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "desktop", width: 1440, height: 900 },
];

const PUBLIC_PATHS = [
  { path: "/", label: "landing" },
  { path: "/demo", label: "demo-idle" },
  { path: "/dashboard", label: "dashboard" },
  { path: "/treasury", label: "treasury" },
];

for (const vp of VIEWPORTS) {
  test.describe(`viewport: ${vp.name}`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } });

    for (const route of PUBLIC_PATHS) {
      test(`${route.label} ${vp.name}`, async ({ page }) => {
        const errors: string[] = [];
        page.on("console", (msg) => {
          if (msg.type() === "error") {
            const text = msg.text();
            // Suppress noisy injected-wallet / posthog / pwa errors that
            // are 3rd-party + harmless for visual review.
            if (
              text.includes("ethereum") ||
              text.includes("posthog") ||
              text.includes("ERR_BLOCKED_BY_CLIENT") ||
              text.includes("lockdown") ||
              text.includes("SES") ||
              text.includes("MetaMask")
            )
              return;
            errors.push(text);
          }
        });
        page.on("pageerror", (err) => {
          errors.push(`pageerror: ${err.message}`);
        });

        await page.goto(route.path, { waitUntil: "domcontentloaded" });
        // Wait for hydration / first interactive paint
        await page.waitForTimeout(2500);

        const file = path.join(OUT_DIR, `${vp.name}-${route.label}.png`);
        await page.screenshot({ path: file, fullPage: true });

        // Write a side log of console errors for this screen
        if (errors.length > 0) {
          fs.writeFileSync(
            path.join(OUT_DIR, `${vp.name}-${route.label}.errors.txt`),
            errors.join("\n---\n")
          );
        }
      });
    }
  });
}
