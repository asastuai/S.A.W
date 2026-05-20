import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Browser-side Supabase client.
 * Uses the anon key. Reads are protected by RLS based on the Privy JWT
 * we inject via supabase.auth.setSession on login.
 */
let _browser: SupabaseClient | null = null;

export function supabaseBrowser(): SupabaseClient {
  if (_browser) return _browser;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    throw new Error(
      "Supabase env vars missing: NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY"
    );
  }
  _browser = createClient(url, anon, {
    auth: { persistSession: true, autoRefreshToken: true },
  });
  return _browser;
}

/**
 * Server-only Supabase client using the service role key.
 * Bypasses RLS. Only call from API routes, server actions, or worker jobs.
 */
export function supabaseAdmin(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !service) {
    throw new Error(
      "Supabase admin env vars missing: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY"
    );
  }
  return createClient(url, service, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
