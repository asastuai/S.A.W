# SAW Notifications — Plan

## What ships in v1.2 (now)

- PWA service worker registered (`public/sw.js`, `web/components/pwa-register.tsx`)
- PWA install metadata (`public/manifest.webmanifest` already there)
- Browser users can install SAW as an app on mobile + desktop
- Service worker has stubs for `push` + `notificationclick` handlers, ready for v1.3

## What lands in v1.3 (next)

End-to-end web push notifications for approval requests + opportunity proposals.

### Pieces needed

1. **VAPID keys** (Voluntary Application Server Identification)
   - Generate once: `npx web-push generate-vapid-keys`
   - Public key → `NEXT_PUBLIC_VAPID_PUBLIC_KEY` (browser)
   - Private key → `VAPID_PRIVATE_KEY` (server only)
   - Add to `web/.env.local` + Vercel

2. **Subscriptions table in Supabase**
   ```sql
   create table push_subscriptions (
     id uuid primary key default gen_random_uuid(),
     handler_id uuid not null references handlers(id) on delete cascade,
     endpoint text not null unique,
     p256dh text not null,
     auth text not null,
     created_at timestamptz not null default now(),
     last_seen_at timestamptz not null default now()
   );
   ```

3. **Permission + subscribe UI**
   - Component `<EnablePushButton />` that requests permission, subscribes via `pushManager.subscribe()`, POSTs to `/api/push/subscribe`
   - Shown in settings modal when handler is signed in

4. **API endpoint `/api/push/subscribe`**
   - Accepts subscription object, stores in DB tied to handler_id

5. **Server-side sender** using `web-push` library
   - Helper `sendNotification(handlerId, { title, body, url })`
   - Loads subscriptions for the handler, sends each
   - Cleans up subscriptions that return 410 Gone

6. **Wire from agent_wakes when:**
   - An item moves to `awaiting-approval` status → "Approval requested for X"
   - A new high-confidence opportunity is created → "Greedie spotted: ..."

### Why NOT Knock or Novu

Both are good products but add a paid third-party for what is a 100-line
implementation with native browser APIs. The VAPID + web-push path:
- Zero per-message cost
- No vendor lock-in
- No extra account to manage
- Same UX from the user's perspective

We can swap to Knock if we later need: SMS, in-app feed, multi-channel
orchestration. Not justified for the SAW use case in v1.

### Time estimate

~4 hours focused work for the full v1.3 implementation, including:
- DB migration
- Backend helpers + endpoint
- Frontend permission + subscribe UI
- Wire 2-3 trigger points (approval, opportunity, execution result)
- Smoke test on real devices
