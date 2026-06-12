/**
 * web/app/api/agents/[id]/venue/route.ts
 *
 * POST /api/agents/:id/venue  — Enable venue: generate a trading keypair
 *                               server-side, encrypt at rest, return pubkey only.
 * GET  /api/agents/:id/venue  — Status: { enabled, pubkey, floatBalanceUsdc }.
 *
 * Security rules (spec §Task 8, audit C-1):
 *   - Trading key secret is NEVER returned in any HTTP response.
 *   - agent_trading_keys is only touched via supabaseAdmin (service-role).
 *   - Ownership enforced on every method via getOwnedAgentOr404.
 *   - 409 if a key already exists for this agent (idempotency guard).
 *
 * NOTE: migration 0014_perps.sql is PENDING manual application to live
 * Supabase. Code is correct; DB calls will fail until the migration is applied.
 */

import { NextRequest, NextResponse } from "next/server";
import { Keypair, Connection, PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddress } from "@solana/spl-token";
import bs58 from "bs58";

import { AuthError, requireAuth } from "@/lib/auth";
import { getHandlerByPrivy } from "@/lib/db/handlers";
import { listAgentsForHandler } from "@/lib/db/agents";
import { encryptApiKey } from "@/lib/byok-crypto";
import { getTradingKey, createTradingKey } from "@/lib/db/trading-keys";
import type { Agent } from "@/lib/db/types";

export const runtime = "nodejs";

// USDC mint on mainnet/devnet (used for ATA balance read).
// Works against VENUE_RPC_URL regardless of localnet/mainnet because
// the localnet genesis includes USDC via the adrena fixtures.
const USDC_MINT = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");

// ── Shared helpers ────────────────────────────────────────────────────────────

class HttpError extends Error {
  constructor(public status: number, msg: string) {
    super(msg);
  }
}

async function getOwnedAgentOr404(req: NextRequest, agentId: string): Promise<Agent> {
  const claims = await requireAuth(req);
  const handler = await getHandlerByPrivy(claims.privy_user_id);
  if (!handler) throw new HttpError(404, "handler not found");
  const owned = await listAgentsForHandler(handler.id);
  const agent = owned.find((a) => a.id === agentId);
  if (!agent) throw new HttpError(404, "agent not found");
  return agent;
}

function errorResponse(e: unknown) {
  if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: 401 });
  if (e instanceof HttpError) return NextResponse.json({ error: e.message }, { status: e.status });
  const msg = (e as Error)?.message ?? String(e);
  return NextResponse.json({ error: msg }, { status: 500 });
}

// ── POST — enable venue ───────────────────────────────────────────────────────

/**
 * Generates a Solana keypair server-side, encrypts the secret key with
 * SAW_BYOK_ENC_KEY (AES-GCM, same pattern as byok-crypto.ts), and stores
 * { pubkey, ciphertext, iv } in agent_trading_keys.
 *
 * Returns { pubkey } ONLY. The secret NEVER leaves the server.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await getOwnedAgentOr404(req, params.id);

    // Check for existing key — 409 if already enabled.
    const existing = await getTradingKey(params.id);
    if (existing) {
      return NextResponse.json(
        { error: "venue already enabled for this agent", pubkey: existing.pubkey },
        { status: 409 }
      );
    }

    // Generate keypair server-side (secretKey never leaves this function).
    const keypair = Keypair.generate();
    const pubkey = keypair.publicKey.toBase58();

    // Encrypt secretKey as bs58 plaintext (consistent with worker pattern:
    // worker will Keypair.fromSecretKey(bs58.decode(plaintext)) on decrypt).
    const plaintext = bs58.encode(keypair.secretKey);
    const { ciphertext, iv } = await encryptApiKey(plaintext);

    // Persist — only pubkey returned; ciphertext/iv stay in DB.
    await createTradingKey({ agentId: params.id, pubkey, ciphertext, iv });

    // Return pubkey ONLY. Never echo ciphertext, iv, or any key material.
    return NextResponse.json({ pubkey });
  } catch (e) {
    return errorResponse(e);
  }
}

// ── GET — status ──────────────────────────────────────────────────────────────

/**
 * Returns:
 *   { enabled: false, pubkey: null, floatBalanceUsdc: null }   — no key yet
 *   { enabled: true,  pubkey: string, floatBalanceUsdc: number|null }
 *
 * floatBalanceUsdc: USDC ATA balance of the trading pubkey, read directly
 * via @solana/web3.js + @solana/spl-token against VENUE_RPC_URL.
 * Returns null if VENUE_RPC_URL is not set or the RPC call fails.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await getOwnedAgentOr404(req, params.id);

    const row = await getTradingKey(params.id);
    if (!row) {
      return NextResponse.json({ enabled: false, pubkey: null, floatBalanceUsdc: null });
    }

    // Read USDC ATA balance if VENUE_RPC_URL is configured.
    let floatBalanceUsdc: number | null = null;
    const rpcUrl = process.env.VENUE_RPC_URL;
    if (rpcUrl) {
      try {
        const connection = new Connection(rpcUrl, "confirmed");
        const tradingPubkey = new PublicKey(row.pubkey);
        const ata = await getAssociatedTokenAddress(USDC_MINT, tradingPubkey);
        const balance = await connection.getTokenAccountBalance(ata);
        floatBalanceUsdc = Number(balance.value.uiAmount ?? 0);
      } catch {
        // RPC unavailable or ATA not yet created — return null, not an error.
        floatBalanceUsdc = null;
      }
    }
    // If VENUE_RPC_URL is not set, floatBalanceUsdc stays null.
    // TODO: Task 9 UI should show "–" when floatBalanceUsdc is null.

    return NextResponse.json({
      enabled: true,
      pubkey: row.pubkey,
      floatBalanceUsdc,
    });
  } catch (e) {
    return errorResponse(e);
  }
}
