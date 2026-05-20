import { NextRequest } from "next/server";

/**
 * Minimal Privy JWT extractor for v1.
 * Reads the Authorization header (`Bearer <token>`) and decodes the `sub` claim.
 *
 * NO signature verification yet — replace with privy-server-side SDK in P0.5
 * once we have PRIVY_VERIFICATION_KEY in env. Until then this endpoint is a
 * read-only convenience and any sensitive write should be guarded by service
 * role + explicit handler ID match.
 */

export interface PrivyClaims {
  sub: string;
  privy_user_id: string;
  wallet?: string;
  email?: string;
}

export function extractPrivyClaims(req: NextRequest): PrivyClaims | null {
  const header = req.headers.get("authorization");
  if (!header || !header.startsWith("Bearer ")) return null;
  const token = header.slice(7).trim();
  if (!token) return null;

  try {
    const [, payload] = token.split(".");
    if (!payload) return null;
    const decoded = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8")
    );
    const sub = decoded.sub as string | undefined;
    if (!sub) return null;
    return {
      sub,
      privy_user_id: sub,
      wallet: decoded.wallet ?? undefined,
      email: decoded.email ?? undefined,
    };
  } catch {
    return null;
  }
}

export function requireAuth(req: NextRequest): PrivyClaims {
  const claims = extractPrivyClaims(req);
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
