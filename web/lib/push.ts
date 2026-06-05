import webpush from "web-push";

import { supabaseAdmin } from "@/lib/supabase";

// Configure web-push lazily from env. Deploy-safe: if the VAPID keys aren't
// set yet, every send is a silent no-op (the feature is simply off until the
// keys land in env), so deploying this code before generating keys breaks
// nothing.
let configured: boolean | null = null;

function ensureConfigured(): boolean {
  if (configured !== null) return configured;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) {
    configured = false;
    return false;
  }
  const subject = process.env.VAPID_SUBJECT || "mailto:juancmaisu@outlook.com";
  webpush.setVapidDetails(subject, publicKey, privateKey);
  configured = true;
  return true;
}

export type PushPayload = { title: string; body?: string; url?: string };

/**
 * Send a web push to every subscription a handler owns. Best-effort: returns
 * the number delivered, never throws. No-op until VAPID keys are configured.
 * Prunes dead subscriptions (404/410 Gone) so the table stays clean.
 */
export async function sendPushToHandler(
  handlerId: string,
  payload: PushPayload
): Promise<number> {
  if (!handlerId || !ensureConfigured()) return 0;

  const db = supabaseAdmin();
  const { data: subs } = await db
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("handler_id", handlerId);

  if (!subs?.length) return 0;

  const body = JSON.stringify(payload);
  const dead: string[] = [];
  let sent = 0;

  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          body
        );
        sent++;
      } catch (e: any) {
        const code = e?.statusCode;
        if (code === 404 || code === 410) dead.push(s.id);
        // other errors (timeouts, 5xx) are transient — leave the sub in place
      }
    })
  );

  if (dead.length) {
    await db.from("push_subscriptions").delete().in("id", dead);
  }
  return sent;
}
