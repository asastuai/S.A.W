export type MarketSnapshot = {
  asset: string;
  priceUsd: number;
  high24hUsd: number;
  low24hUsd: number;
  change24hPct: number;
  fetchedAt: number;
};

let cache: Record<string, MarketSnapshot> = {};
const CACHE_MS = 30_000;

const COIN_IDS: Record<string, string> = {
  SOL: "solana",
  BTC: "bitcoin",
  ETH: "ethereum",
  USDC: "usd-coin",
  JUP: "jupiter-exchange-solana",
  BONK: "bonk",
};

export async function getSnapshot(asset: string): Promise<MarketSnapshot> {
  const upper = asset.toUpperCase();
  const id = COIN_IDS[upper];
  if (!id) throw new Error(`Unknown asset: ${asset}`);
  const cached = cache[upper];
  if (cached && Date.now() - cached.fetchedAt < CACHE_MS) return cached;

  const url = `https://api.coingecko.com/api/v3/coins/${id}?localization=false&tickers=false&community_data=false&developer_data=false&sparkline=false`;
  const res = await fetch(url, { next: { revalidate: 30 } });
  if (!res.ok) {
    if (cached) return cached;
    throw new Error(`CoinGecko ${res.status}`);
  }
  const json: any = await res.json();
  const snap: MarketSnapshot = {
    asset: upper,
    priceUsd: json.market_data?.current_price?.usd ?? 0,
    high24hUsd: json.market_data?.high_24h?.usd ?? 0,
    low24hUsd: json.market_data?.low_24h?.usd ?? 0,
    change24hPct: json.market_data?.price_change_percentage_24h ?? 0,
    fetchedAt: Date.now(),
  };
  cache[upper] = snap;
  return snap;
}

export function describeMarket(snap: MarketSnapshot): string {
  const pct = snap.change24hPct;
  const pos = snap.priceUsd - snap.low24hUsd;
  const range = snap.high24hUsd - snap.low24hUsd;
  const positionPct = range > 0 ? (pos / range) * 100 : 50;

  let momentum = "flat";
  if (pct > 2) momentum = "strongly bullish";
  else if (pct > 0.5) momentum = "mildly bullish";
  else if (pct < -2) momentum = "strongly bearish";
  else if (pct < -0.5) momentum = "mildly bearish";

  let zone = "mid-range";
  if (positionPct >= 80) zone = "near 24h high";
  else if (positionPct <= 20) zone = "near 24h low";

  return `${snap.asset} $${snap.priceUsd.toFixed(2)} | 24h ${pct >= 0 ? "+" : ""}${pct.toFixed(2)}% (${momentum}) | sitting ${zone} (low $${snap.low24hUsd.toFixed(2)}, high $${snap.high24hUsd.toFixed(2)})`;
}
