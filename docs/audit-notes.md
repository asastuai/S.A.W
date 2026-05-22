# SAW — Audit notes (sleep-mode bug hunt)

Read-only audit performed while Juan slept. No code changes.
Focus: useEffect cleanup discipline in `web/app/demo/page.tsx`.

## TL;DR

11 useEffects total. 10 are clean. **1 missing cleanup guard** (session
restore at line 578) — low severity, fix at leisure.

## Per-effect verdict

| # | Line | Purpose | Cleanup | Verdict |
|---|------|---------|---------|---------|
| 1 | 149  | Load saved API key (one-shot) | none needed | ✅ |
| 2 | 236  | Backfill `dbAgentId` after restore | `cancelled` flag + return | ✅ |
| 3 | 273  | Hydrate briefing from DB | `cancelled` flag + return | ✅ |
| 4 | 334  | Sync `briefing` → ref | none needed (assignment) | ✅ |
| 5 | 361  | Clock tick (1s) | `clearInterval` | ✅ |
| 6 | 367  | Sweep expired items (5s) | `clearInterval` | ✅ |
| 7 | 405  | Opportunity scanner (5min) | cancelled + clearTimeout + clearInterval | ✅ |
| 8 | 556  | Market price poller (30s) | cancelled + clearInterval | ✅ |
| 9 | 578  | Restore session from localStorage | **missing** | ⚠️ WARNING |
| 10 | 1017 | Simulator: poll due items (700ms) | `clearInterval` | ✅ |
| 11 | 1585 | Idle component UA check | none needed | ✅ |

## Findings

### WARNING — `web/app/demo/page.tsx:578` — session restore lacks cancellation

The async IIFE calls multiple `setX` (setPersona, setHandle, setSetup,
setBriefing, setPhase, setDbAgentId) without a `cancelled` guard or
cleanup return. If the user disconnects mid-restore — or if
`handler?.toBase58()` changes before the `await sawClient.loadWallet`
resolves — React will warn about state updates on an unmounted/stale
component, and a stale persona could overwrite a fresher one.

**Risk in practice:** Low. The demo page rarely unmounts; the most
likely race is rapid wallet switching, which is uncommon.

**Suggested fix:**
```ts
useEffect(() => {
  if (!handler || !sawClient) return;
  const stored = loadSetup(handler);
  if (!stored) return;
  let cancelled = false;
  (async () => {
    try {
      const walletPda = new PublicKey(stored.walletPda);
      const handle = await sawClient.loadWallet(walletPda);
      if (cancelled) return;
      // ... wrap each subsequent setX in `if (cancelled) return;`
      // before it, after each `await`.
    } catch (e: any) {
      if (!cancelled) {
        clearSetup(handler);
        clearBriefing(handler);
      }
    }
  })();
  return () => { cancelled = true; };
}, [handler?.toBase58()]);
```

### SUGGESTION — `web/app/demo/page.tsx:1596` — `setTimeout` in `copyUrl`

`Idle.copyUrl` schedules `setCopied(false)` 2s after a click. If the
user clicks Copy and Privy connects within 2s, `Idle` unmounts and
React warns. Either:

- track the timer ID in a ref and clear on unmount, or
- ignore — the warning is benign and the component is short-lived.

Not worth fixing alone; bundle with any future Idle changes.

## Non-effect observations

- `executingRef.current = true` at line 1025 inside the simulator
  callback has a `try/finally` that resets it. Good.
- `briefingRef.current = briefing` (line 334) is the right pattern for
  reading "latest" briefing from inside intervals without re-creating
  the interval. The dependency arrays of effects 6/7 deliberately
  exclude `briefing` for this reason.
- Dispatcher `dispatchItem` is not shown here but is called from the
  simulator (1017) and `executeOne` (manual button). The
  `executingRef` guard prevents double-fire across both paths.

## Untouched

- No mutations made to any source file.
- No tests added — all 44 Vitest cases still passing as of
  pre-audit run.

## Next-session quick wins

1. Wrap session restore (578) in cancelled guard — 5-min change.
2. Consider extracting the three sync effects (236/273/578) into a
   single `useAgentSync(handler, persona)` hook to centralize the
   cancelled-flag pattern. Defer until refactor budget exists; the
   current code is readable.
