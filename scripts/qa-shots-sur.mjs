/**
 * QA Screenshot capture for SUR Protocol live site
 * Run from: ~/projects/saw/web (so playwright resolves)
 * Output: ~/projects/saw/qa-screenshots-sur/
 */

import { chromium } from '@playwright/test';
import { existsSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const BASE_URL = 'https://web-sigma-gules-63.vercel.app';
const OUT_DIR = resolve(__dirname, '../qa-screenshots-sur');
const ROUTES = ['/', '/trade', '/portfolio', '/agents', '/darkpool', '/dashboard', '/markets', '/vaults', '/docs', '/support', '/privacy', '/terms'];

const DESKTOP = { width: 1440, height: 900 };
const MOBILE  = { width: 390,  height: 844 };

if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });

function routeToFilename(route) {
  return route === '/' ? 'home' : route.replace(/^\//, '').replace(/\//g, '-');
}

async function capture(page, url, filename, viewportLabel) {
  console.log(`  [${viewportLabel}] Navigating to ${url}`);
  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
  } catch (e) {
    // If networkidle times out, just wait a bit and continue
    console.log(`  [${viewportLabel}] networkidle timeout (continuing): ${e.message.split('\n')[0]}`);
  }
  // Extra wait for charts/animations
  await page.waitForTimeout(1500);
  await page.screenshot({ path: filename, fullPage: true });
  console.log(`  [${viewportLabel}] Saved: ${filename}`);
}

async function main() {
  const browser = await chromium.launch({ headless: true });

  for (const route of ROUTES) {
    const slug = routeToFilename(route);
    const url = BASE_URL + route;
    console.log(`\n=== Route: ${route} ===`);

    // Desktop
    const desktopCtx = await browser.newContext({ viewport: DESKTOP, userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36' });
    const desktopPage = await desktopCtx.newPage();
    await capture(desktopPage, url, `${OUT_DIR}/${slug}-desktop-full.png`, 'desktop 1440x900');
    await desktopCtx.close();

    // Mobile
    const mobileCtx = await browser.newContext({
      viewport: MOBILE,
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
      isMobile: true,
      hasTouch: true,
    });
    const mobilePage = await mobileCtx.newPage();
    await capture(mobilePage, url, `${OUT_DIR}/${slug}-mobile-full.png`, 'mobile 390x844');
    await mobileCtx.close();
  }

  await browser.close();
  console.log('\nAll screenshots done.');
}

main().catch(err => { console.error(err); process.exit(1); });
