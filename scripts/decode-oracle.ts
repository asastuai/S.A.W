/**
 * Decode the Adrena Oracle PDA from localnet and show all price slots with feedIds.
 * Run: cd worker && pnpm exec tsx ../scripts/decode-oracle.ts
 */
import { createSolanaRpc, address } from "@solana/kit";

async function main() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rpc = createSolanaRpc("http://127.0.0.1:8899") as any;

  const { fetchOracle } = await import(
    "/home/asastu/vendor/adrena-sdk-ts/codama-generated/accounts/oracle.js"
  );
  const oraclePda = address("GEm9TZP7BL8rTz1JDy6X74PL595zr1putA9BXC8ehDmU");

  const oracle = await fetchOracle(rpc, oraclePda);
  console.log("registeredPricesCount:", oracle.data.registeredPricesCount);
  console.log("updatedAt:", new Date(Number(oracle.data.updatedAt) * 1000).toISOString());

  const prices = oracle.data.prices;
  for (let i = 0; i < prices.length; i++) {
    const p = prices[i];
    const nameBytes = Buffer.from(p.name.value as Uint8Array);
    const name = nameBytes.slice(0, p.name.length).toString("utf8");
    if (p.price > 0n || p.name.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const fid = (p as any).feedId as number;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const exp = (p as any).exponent as number;
      const priceUsd = Number(p.price) * Math.pow(10, exp);
      const tsStr = new Date(Number(p.timestamp) * 1000).toISOString();
      const line = "slot[" + i + "]: feedId=" + fid + " price=" + priceUsd.toFixed(4) + " USD ts=" + tsStr + " name=" + name;
      console.log(line);
    }
  }
}

main().catch(console.error);
