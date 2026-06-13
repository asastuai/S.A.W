# QA Findings — SUR Protocol Live Site
**URL:** https://web-sigma-gules-63.vercel.app  
**Date:** 2026-06-13  
**Method:** Playwright full-page screenshots — desktop 1440x900, mobile 390x844  
**Screenshots dir:** `~/projects/saw/qa-screenshots-sur/` (24 total)

---

## Summary

| Category | Count |
|---|---|
| Routes captured | 12 |
| Routes returning 404 | 2 (`/markets`, `/vaults`) |
| Routes wallet-gated (pre-connect wall) | 1 (`/portfolio`) |
| Routes partially wallet-gated (account panel empty, main content visible) | 2 (`/dashboard`, `/darkpool`) |
| Routes publicly inspectable | 7 (`/`, `/trade`, `/agents`, `/docs`, `/support`, `/privacy`, `/terms`) |
| BLOCKER findings | 2 |
| MAJOR findings | 5 |
| MINOR findings | 6 |

### Wallet-Gated vs Publicly Inspectable

| Route | Status | Notes |
|---|---|---|
| `/` | Public | Full landing page renders |
| `/trade` | Public (partially wallet-gated) | Chart renders; open positions panel shows "connect wallet to see positions" — expected |
| `/portfolio` | Wallet-gated | Full connect-wall, nothing else visible |
| `/agents` | Public | Full API reference page renders |
| `/darkpool` | Partially wallet-gated | POST INTENT form visible (but says "Connect a wallet to post intents"); order book shows "EMPTY DESK" state — expected on devnet Phase 9 pending |
| `/dashboard` | Partially wallet-gated | Markets ledger visible; MY ACCOUNT panel says "Connect wallet to see your account" — expected |
| `/markets` | 404 | Route not implemented |
| `/vaults` | 404 | Route not implemented |
| `/docs` | Public | Full documentation renders |
| `/support` | Public | FAQ accordion renders |
| `/privacy` | Public | Full privacy policy renders |
| `/terms` | Public | Full ToS renders |

---

## Findings

### BLOCKER

| # | Page | Viewport | Element | Issue | Wallet-Gated? |
|---|---|---|---|---|---|
| B1 | `/markets` | Both | Entire page | **404 — route does not exist.** Nav has no "Markets" entry but the route was listed as a target. No custom 404 page — Next.js default white 404 is jarring against the dark UI theme. | No |
| B2 | `/vaults` | Both | Entire page | **404 — route does not exist.** Same as above. Default white 404 with dark nav header creates a theme flash — black navbar on white body. | No |

---

### MAJOR

| # | Page | Viewport | Element | Issue | Wallet-Gated? |
|---|---|---|---|---|---|
| M1 | All pages | Both | Persistent toast notification | **Toast blocks content throughout the session.** The purple "SUR Protocol Solana port is live on devnet. Read paths wired; write paths pending Phase 9 init." toast appears on every page and in mobile view it frequently overlaps interactive content (trade panel buttons, darkpool form fields, docs bullet points, eligibility list on /terms). The toast has a close button (X) but since screenshots are fresh sessions it reappears constantly. This is a significant readability/usability issue on mobile specifically. | No |
| M2 | `/dashboard` | Desktop | Markets Ledger table | **Prices look hardcoded/placeholder.** BTC-USD=$65000.00, SOL-USD=$150.00, ETH-USD=$3500.00 — all round numbers, no decimals. These are the same fixed oracle prices visible in the /trade header as well (ORACLE $65000.00). Since Phase 9 init is pending, these may be test oracle values not live prices. Flag: **verify against live oracle feed before public launch.** OI LONG and OI SHORT are all 0.0000 — expected given no positions exist on devnet. | No (read-path data, no wallet needed) |
| M3 | `/docs` | Mobile | Toast overlap | **Toast overlaps and obscures the bullet-point list** in the "Status" section (specifically the "Write paths wired" and "Init (Phase 9) pending" bullets are fully hidden behind the toast). Content is unreadable without dismissing it. | No |
| M4 | `/` | Desktop | Hero section | **Top announcement banner + nav + hero heading stacking looks fine BUT** the devnet status box at bottom right corner ("Devnet status — 11/11 deployed, wired, wired, Phase 9") shows Phase 9 = "Phase 9" in a yellow/warning color — visually this reads as a pending warning. The label "Phase 9" with no further context (vs "Write: Phase 9") is ambiguous. Minor content issue but worth noting for public-facing clarity. | No |
| M5 | `/trade` | Desktop | Order panel right side | **Right-side order book / positions area partially cut off at 1440px.** The right column (order book entries) appears to extend slightly beyond the visible area. Individual price rows in the order book appear as very small text against a dark background, potentially unreadable at normal zoom. | No |

---

### MINOR

| # | Page | Viewport | Element | Issue | Wallet-Gated? |
|---|---|---|---|---|---|
| m1 | `/markets`, `/vaults` | Both | 404 page styling | **Theme mismatch on 404.** The Next.js default 404 page is white with black text, but the app's nav header remains dark. Results in a jarring white flash and broken visual continuity. A custom 404 page matching the dark theme would fix this. | No |
| m2 | `/darkpool` | Mobile | Toast overlap on form | **Toast overlaps the MARKET dropdown and SIDE (LONG/SHORT) buttons** when it appears, temporarily obscuring form controls. | Partially (form visible, wallet needed to submit) |
| m3 | `/portfolio` | Desktop | Large empty area | **Excessive whitespace above connect-wall box.** The connect-wallet modal box appears vertically centered in a large empty black space with ~200px of dead space above and below. The page has no loading indicator or skeleton — just goes black then shows the box. Could look broken to a first-time visitor. | Yes (wallet-gated) |
| m4 | `/agents` | Mobile | Code blocks | **Code blocks inside tool documentation are very small** on mobile (390px). The monospace JSON parameter blocks render at what appears to be ~10-11px, which is below comfortable readability threshold on a real phone. No horizontal scroll is triggered (text wraps), but the font is borderline unreadable at small sizes. | No |
| m5 | `/docs` | Desktop | Toast position | **Toast (bottom-right) partially overlaps the "Getting Started > 3. Acquire Devnet USDC" section text**, specifically the USDC mint address string. The address `(4zMMC9srt5Ri5X14GAqXhaHii3GnPAEERYPJqZJDncDU)` is obscured. This is the one piece of actionable data users need to fund their wallet. | No |
| m6 | `/support` | Desktop | Toast clipping footer | **Toast overlaps the footer** — the footer icon row (GitHub, Docs, Discord, Twitter) is partially cut off by the toast bottom-right positioning. Minor but the footer links are hidden without scrolling. | No |

---

## Hardcoded / Placeholder Data Observations

| Page | Data | Observation |
|---|---|---|
| `/dashboard` | BTC=$65000, SOL=$150, ETH=$3500 | Round numbers suggest static oracle seed values, not live feed. **Verify against oracle before mainnet.** |
| `/trade` | ORACLE $65000.00 | Same as above — oracle price in header is a fixed round number |
| `/darkpool` | Order book: "EMPTY DESK — 0 OPEN" | Expected on devnet with no active agents — not a bug |
| `/portfolio` | All data hidden behind wallet gate | Cannot assess for placeholder data |
| `/` | Devnet status widget shows "11/11 deployed, wired, wired, Phase 9" | Consistent with documented state — not hardcoded |

---

## Cross-Site Observations

1. **Global banner is correct and intentional:** The top yellow banner "Devnet · Phase 9 init pending — write operations will fail until programs are initialized" appears on all pages and accurately reflects protocol state. Not a bug.

2. **Mobile nav is a hamburger menu.** The `SUR://` wordmark + hamburger icon pattern is consistent and clean. No nav overflow or horizontal scroll observed on mobile.

3. **Dark theme is consistent** across all implemented pages. No light-mode bleeding, no unintended white backgrounds except the 404 pages.

4. **Footer links (GitHub, Docs, Discord, Twitter)** render correctly on desktop. On mobile the footer is a single row that wraps well.

5. **"DEVNET // 2026" badge** appears consistently on trade, darkpool, and dashboard — clear devnet indicator, no production risk.

6. **The Agents page** renders a full MCP/tool API reference with JSON parameter schemas and TypeScript examples. It's very long (scrolls far) — on mobile this is functional but the code blocks could use horizontal scroll containers rather than wrapping.

---

## Screenshots

All 24 screenshots are at: `/home/asastu/projects/saw/qa-screenshots-sur/`

Format: `<route>-<desktop|mobile>-full.png`

Routes: home, trade, portfolio, agents, darkpool, dashboard, markets, vaults, docs, support, privacy, terms
