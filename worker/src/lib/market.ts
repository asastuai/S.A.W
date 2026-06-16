/**
 * Server-side market snapshot fetcher.
 * Single source for all agent wakes. Caches per process for 60s so repeated
 * waves within the same minute share one CoinGecko call.
 */

type Snapshot = {
  asset: string;
  priceUsd: number;
  pct24h: number;
  high24h: number;
  low24h: number;
  fetchedAt: number;
};

const cache = new Map<string, Snapshot>();
const TTL_MS = 60_000;

const ASSET_IDS: Record<string, string> = {
  SOL: "solana",
  BTC: "bitcoin",
  ETH: "ethereum",
};

export async function getMarketSnapshot(asset: string): Promise<Snapshot> {
  const key = asset.toUpperCase();
  const cached = cache.get(key);
  if (cached && Date.now() - cached.fetchedAt < TTL_MS) return cached;

  const id = ASSET_IDS[key];
  if (!id) throw new Error(`Unknown asset: ${asset}`);

  const url = `https://api.coingecko.com/api/v3/coins/${id}?localization=false&tickers=false&community_data=false&developer_data=false&sparkline=false`;
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`CoinGecko ${res.status}`);
  const data = await res.json();
  const market = data.market_data;

  const snap: Snapshot = {
    asset: key,
    priceUsd: market.current_price.usd,
    pct24h: market.price_change_percentage_24h,
    high24h: market.high_24h.usd,
    low24h: market.low_24h.usd,
    fetchedAt: Date.now(),
  };
  cache.set(key, snap);
  return snap;
}

/**
 * Base asset symbol from a perp market symbol, e.g. "BTC-USD" -> "BTC".
 * Used to look up the reference price via getMarketSnapshot before pushing
 * SUR's operator-set mark price (SUR's oracle is operator-pushed, not Pyth).
 */
export function perpMarketToAsset(perpMarket: string): string {
  const base = perpMarket.split("-")[0] ?? perpMarket;
  return base.trim().toUpperCase();
}

export function describeMarket(s: Snapshot): string {
  const dir = s.pct24h >= 0 ? "+" : "";
  return `${s.asset} $${s.priceUsd.toFixed(2)} (${dir}${s.pct24h.toFixed(2)}% 24h, range $${s.low24h.toFixed(2)}–$${s.high24h.toFixed(2)})`;
}

export type { Snapshot };
