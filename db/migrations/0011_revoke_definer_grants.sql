-- C-1 fix (v1.5 audit, CRITICAL): the SECURITY DEFINER functions add_credits,
-- spend_one_call (0009) and prune_processed_updates (0010) inherit Postgres'
-- default EXECUTE-to-PUBLIC grant. In a stock Supabase project PostgREST then
-- exposes them to the `anon` and `authenticated` roles at
-- /rest/v1/rpc/<fn>, and because they are SECURITY DEFINER they run as owner
-- and bypass RLS. A caller holding only the public NEXT_PUBLIC_SUPABASE_ANON_KEY
-- could call add_credits to mint unlimited LLM credits (bypassing the entire
-- /api/topup on-chain verification) or spend_one_call to drain a victim.
--
-- Lock them down so ONLY the service role (server-side supabaseAdmin) can call
-- them, and pin search_path to harden the SECURITY DEFINER bodies against
-- search-path hijacking.

revoke execute on function public.add_credits(uuid, int, bigint, text) from public, anon, authenticated;
revoke execute on function public.spend_one_call(uuid)                 from public, anon, authenticated;
revoke execute on function public.prune_processed_updates()            from public, anon, authenticated;

alter function public.add_credits(uuid, int, bigint, text) set search_path = public, pg_temp;
alter function public.spend_one_call(uuid)                 set search_path = public, pg_temp;
alter function public.prune_processed_updates()            set search_path = public, pg_temp;
