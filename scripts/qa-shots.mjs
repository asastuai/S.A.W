/**
 * qa-shots.mjs — SAW Visual QA screenshot capture
 * Run from ~/projects/saw/web (so playwright resolves from node_modules there)
 * Usage: cd ~/projects/saw/web && node ../scripts/qa-shots.mjs
 */

import pkg from "/home/asastu/projects/saw/web/node_modules/@playwright/test/index.js";
const { chromium } = pkg;
import { existsSync, mkdirSync } from "fs";
import { join, resolve } from "path";

const BASE_URL = "http://localhost:3100";
const SHOTS_DIR = resolve(process.cwd(), "../qa-screenshots");

const ROUTES = [
  { path: "/",                          slug: "home" },
  { path: "/demo",                      slug: "demo" },
  { path: "/dashboard",                 slug: "dashboard" },
  { path: "/treasury",                  slug: "treasury" },
  { path: "/press",                     slug: "press" },
  { path: "/connect/telegram",          slug: "connect-telegram" },
  { path: "/test-perps-ui",             slug: "test-perps-ui" },
  { path: "/agent/test-agent-perps-ui", slug: "agent-test-agent-perps-ui" },
];

const VIEWPORTS = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "mobile",  width: 390,  height: 844 },
];

mkdirSync(SHOTS_DIR, { recursive: true });

async function run() {
  const browser = await chromium.launch({ headless: true });
  const results = [];

  for (const vp of VIEWPORTS) {
    const ctx = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: 1,
    });
    const page = await ctx.newPage();

    for (const route of ROUTES) {
      const url = BASE_URL + route.path;
      let status = "ok";
      let note = "";

      try {
        const response = await page.goto(url, {
          waitUntil: "networkidle",
          timeout: 25000,
        });
        const httpStatus = response?.status() ?? 0;
        if (httpStatus >= 400) {
          status = `http-${httpStatus}`;
          note = `HTTP ${httpStatus}`;
        }
      } catch (e) {
        status = "nav-error";
        note = String(e).slice(0, 120);
      }

      // Extra wait for animations/3D (Three.js + reveal animations)
      await page.waitForTimeout(1500);

      const filename = `${route.slug}-${vp.name}-full.png`;
      const filepath = join(SHOTS_DIR, filename);

      try {
        await page.screenshot({ path: filepath, fullPage: true });
      } catch (e) {
        status = "screenshot-error";
        note = String(e).slice(0, 120);
      }

      // Detect auth/login walls
      const bodyText = await page.evaluate(() => document.body?.innerText ?? "").catch(() => "");
      const isAuthGated =
        bodyText.includes("Sign in") ||
        bodyText.includes("Connect Wallet") ||
        bodyText.includes("Log in") ||
        bodyText.toLowerCase().includes("privy") ||
        (bodyText.trim().length < 150 && status === "ok");

      results.push({
        route: route.path,
        viewport: `${vp.name} (${vp.width}x${vp.height})`,
        file: filename,
        status,
        authGated: isAuthGated,
        note,
      });

      console.log(
        `[${vp.name}] ${route.path} → ${status}${isAuthGated ? " [AUTH-GATED?]" : ""}${note ? " | " + note : ""}`
      );
    }

    await ctx.close();
  }

  await browser.close();

  console.log("\n=== CAPTURE SUMMARY ===");
  for (const r of results) {
    console.log(
      `${r.file.padEnd(48)} | ${r.status.padEnd(12)} | authGated=${r.authGated} ${r.note ? "| " + r.note : ""}`
    );
  }
  console.log(`\nScreenshots saved to: ${SHOTS_DIR}`);
}

run().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
