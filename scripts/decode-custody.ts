/**
 * Helper: decode JITOSOL custody to find oracleFeedId and tradeOracleFeedId.
 * Run: NODE_PATH=./worker/node_modules worker/node_modules/.bin/tsx scripts/decode-custody.ts
 */
import { createSolanaRpc, address } from "@solana/kit";
// fetchCustody lives in codama-generated, not default export
import { fetchCustody } from "adrena-sdk/codama-generated";

async function main() {
  // @ts-ignore
  const rpc = createSolanaRpc("http://127.0.0.1:8899");

  // @ts-ignore
  const jitosolCustody = await fetchCustody(rpc, address("GZ9XfWwgTRhkma2Y91Q9r1XKotNXYjBnKKabj19rhT71"));
  // @ts-ignore
  const usdcCustody = await fetchCustody(rpc, address("Dk523LZeDQbZtUwPEBjFXCd2Au1tD7mWZBJJmcgHktNk"));

  const f = (c: any, name: string) => {
    console.log(`\n${name}:`);
    console.log(`  oracleFeedId:      ${c.data.oracleFeedId}`);
    console.log(`  tradeOracleFeedId: ${c.data.tradeOracleFeedId}`);
    const oName = Buffer.from(c.data.oracle.value).slice(0, c.data.oracle.length).toString("utf8");
    const tName = Buffer.from(c.data.tradeOracle.value).slice(0, c.data.tradeOracle.length).toString("utf8");
    console.log(`  oracle name:       ${oName}`);
    console.log(`  tradeOracle name:  ${tName}`);
  };

  f(jitosolCustody, "JITOSOL Custody");
  f(usdcCustody, "USDC Custody");
}

main().catch(e => { console.error(e); process.exit(1); });
