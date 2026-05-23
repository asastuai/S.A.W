import { NextRequest } from "next/server";
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";

/**
 * Privy JWT verification.
 *
 * Pre v1.3 this file did `JSON.parse(base64decode(token.split('.')[1]))`
 * with no signature check at all — a CRITICAL bug (any attacker could
 * forge a JWT with any privy_user_id and impersonate anyone). Now we
 * verify against Privy's public JWKS using the official issuer + audience.
 *
 * The JWKS is fetched once and cached by `jose`. We keep this module
 * dependency-light (no @privy-io/server-auth SDK) so the build stays
 * fast and we don't need to chase its peer deps.
 */

export interface PrivyClaims {
  sub: string;
  privy_user_id: string;
  wallet?: string;
  email?: string;
}

const PRIVY_APP_ID = (process.env.NEXT_PUBLIC_PRIVY_APP_ID ?? "").trim();
const PRIVY_ISSUER = "privy.io";

const _jwks = PRIVY_APP_ID
  ? createRemoteJWKSet(
      new URL(`https://auth.privy.io/api/v1/apps/${PRIVY_APP_ID}/jwks.json`)
    )
  : null;

export async function extractPrivyClaims(
  req: NextRequest
): Promise<PrivyClaims | null> {
  if (!_jwks || !PRIVY_APP_ID) {
    // Privy not configured (e.g. local dev without an APP_ID). Return
    // null so endpoints fall back to anonymous or internal-auth paths
    // — same effect as a missing token.
    return null;
  }
  const header = req.headers.get("authorization");
  if (!header || !header.startsWith("Bearer ")) return null;
  const token = header.slice(7).trim();
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, _jwks, {
      issuer: PRIVY_ISSUER,
      audience: PRIVY_APP_ID,
    });
    const claims = payload as JWTPayload & {
      wallet?: string;
      email?: string;
    };
    if (!claims.sub) return null;
    return {
      sub: claims.sub,
      privy_user_id: claims.sub,
      wallet: claims.wallet,
      email: claims.email,
    };
  } catch {
    // Any verification failure (bad signature, wrong issuer, expired,
    // missing claim, JWKS fetch error) → null. Endpoints handle the
    // null as "not authenticated".
    return null;
  }
}

export async function requireAuth(req: NextRequest): Promise<PrivyClaims> {
  const claims = await extractPrivyClaims(req);
  if (!claims) {
    throw new AuthError("Not authenticated");
  }
  return claims;
}

export class AuthError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = "AuthError";
  }
}
