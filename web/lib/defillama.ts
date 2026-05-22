/**
 * DefiLlama yield API integration.
 * Free, public, no key required. Updated every ~15 min by DefiLlama.
 *
 * Endpoint: https://yields.llama.fi/pools
 * Returns ~all DeFi pools across all chains with apy, tvlUsd, project, symbol.
 *
 * We cache the full Solana subset for 5 min server-side to avoid hammering
 * their endpoint and to keep responses fast for the LLM tool call.
 */

export type YieldPool = {
  pool: string;            // unique id
  project: string;         // e.g. "kamino-lend"
  symbol: string;          // e.g. "USDC" or "USDT" or "SOL-USDC"
  apy: number;             // total APR/APY %
  apyBase: number | null;  // base APY %
  apyReward: number | null; // reward APY %
  tvlUsd: number;
  chain: string;           // "Solana"
  stablecoin: boolean;
  ilRisk: "no" | "yes";    // impermanent loss risk
  exposure: "single" | "multi";
  url?: string;
};

let cache: { fetchedAt: number; pools: YieldPool[] } | null = null;
const TTL_MS = 5 * 60 * 1000;

export async function fetchSolanaPools(): Promise<YieldPool[]> {
  if (cache && Date.now() - cache.fetchedAt < TTL_MS) return cache.pools;
  try {
    const res = await fetch("https://yields.llama.fi/pools", {
      next: { revalidate: 300 },
    });
    if (!res.ok) throw new Error(`DefiLlama ${res.status}`);
    const data = await res.json();
    const all: any[] = data?.data ?? [];
    const solana = all
      .filter((p) => p.chain === "Solana")
      .map(
        (p): YieldPool => ({
          pool: p.pool,
          project: p.project,
          symbol: p.symbol,
          apy: Number(p.apy ?? 0),
          apyBase: p.apyBase != null ? Number(p.apyBase) : null,
          apyReward: p.apyReward != null ? Number(p.apyReward) : null,
          tvlUsd: Number(p.tvlUsd ?? 0),
          chain: p.chain,
          stablecoin: Boolean(p.stablecoin),
          ilRisk: p.ilRisk ?? "no",
          exposure: p.exposure ?? "single",
          url: p.url,
        })
      );
    cache = { fetchedAt: Date.now(), pools: solana };
    return solana;
  } catch (e) {
    if (cache) return cache.pools; // serve stale on error
    throw e;
  }
}

/**
 * Top N pools matching a query, sorted by APR.
 * - assetFilter: case-insensitive substring on symbol (e.g. "USDC" matches USDC, USDC-USDT, etc.)
 * - safeOnly: filter to single-exposure, low-IL pools with TVL > 5M
 * - limit: max returns
 */
export async function topYieldPools(opts: {
  assetFilter?: string;
  safeOnly?: boolean;
  limit?: number;
  minTvlUsd?: number;
}): Promise<YieldPool[]> {
  const { assetFilter, safeOnly = false, limit = 5, minTvlUsd = 0 } = opts;
  const all = await fetchSolanaPools();

  let filtered = all;
  if (assetFilter) {
    const q = assetFilter.toUpperCase();
    filtered = filtered.filter((p) => p.symbol.toUpperCase().includes(q));
  }
  if (safeOnly) {
    filtered = filtered.filter(
      (p) =>
        p.exposure === "single" &&
        p.ilRisk === "no" &&
        p.tvlUsd >= Math.max(minTvlUsd, 5_000_000)
    );
  } else if (minTvlUsd > 0) {
    filtered = filtered.filter((p) => p.tvlUsd >= minTvlUsd);
  }

  filtered.sort((a, b) => b.apy - a.apy);
  return filtered.slice(0, limit);
}

export function describeYieldPools(pools: YieldPool[]): string {
  if (pools.length === 0) return "No matching yield pools found.";
  return pools
    .map(
      (p, i) =>
        `${i + 1}. ${p.project} · ${p.symbol} — ${p.apy.toFixed(2)}% APY · TVL $${shortNum(
          p.tvlUsd
        )}${p.stablecoin ? " · stable" : ""}${p.ilRisk === "yes" ? " · IL risk" : ""}`
    )
    .join("\n");
}

function shortNum(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return n.toFixed(0);
}
