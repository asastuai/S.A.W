/**
 * Decode USDC and JITOSOL custodies to find oracle and tradeOracle feedIds.
 * Run: cd worker && pnpm exec tsx ../scripts/decode-custody2.ts
 */
import { createSolanaRpc, address } from "@solana/kit";

async function main() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rpc = createSolanaRpc("http://127.0.0.1:8899") as any;

  const { fetchAllOracle } = await import(
    "/home/asastu/vendor/adrena-sdk-ts/codama-generated/accounts/oracle.js"
  );

  // Decode using raw account data via fetchEncodedAccount
  const { fetchEncodedAccount } = await import("@solana/kit");
  const { getOracleDecoder } = await import(
    "/home/asastu/vendor/adrena-sdk-ts/codama-generated/accounts/oracle.js"
  );

  // Use raw bytes to decode custody - we need custody decoder
  const { decodeAccount } = await import("@solana/kit");

  const custodies: Array<{ name: string; addr: string }> = [
    { name: "JITOSOL", addr: "GZ9XfWwgTRhkma2Y91Q9r1XKotNXYjBnKKabj19rhT71" },
    { name: "USDC",    addr: "Dk523LZeDQbZtUwPEBjFXCd2Au1tD7mWZBJJmcgHktNk" },
  ];

  for (const { name, addr } of custodies) {
    const enc = await fetchEncodedAccount(rpc, address(addr));
    if (!enc.exists) { console.log(name + ": NOT FOUND"); continue; }
    const data = Buffer.from(enc.data as Uint8Array);
    console.log("\n" + name + " Custody (size=" + data.length + "):");

    // Custody layout (see codama-generated/accounts/custody.ts):
    // discriminator(8), bump(1), tokenAccountBump(1), allowTrade(1), allowSwap(1),
    // decimals(1), isStable(1), padding(2) = 16 bytes header
    // pool(32), mint(32), tokenAccount(32) = 96 bytes
    // oracle: LimitedString = value(31)+length(1) = 32
    // tradeOracle: LimitedString = 32
    // offset 144: tradeOracle ends at 176
    // then pricing, fees, borrowRate, collectedFees, volumeStats, tradeStats, assets,
    //   longPositions, shortPositions, borrowRateState, optimalUtilizationBps,
    //   virtualFunding, virtualFundingState
    // then: isSynthetic(1), version(1), oracleFeedId(1), tradeOracleFeedId(1)

    const oracleNameOff = 16 + 96; // 112
    const tradeOracleNameOff = oracleNameOff + 32; // 144

    const oracleName = data.slice(oracleNameOff, oracleNameOff + 31).slice(0, data[oracleNameOff + 31]).toString("utf8");
    const tradeOracleName = data.slice(tradeOracleNameOff, tradeOracleNameOff + 31).slice(0, data[tradeOracleNameOff + 31]).toString("utf8");
    console.log("  oracle name: " + oracleName);
    console.log("  tradeOracle name: " + tradeOracleName);

    // oracleFeedId and tradeOracleFeedId are u8 fields near end of struct
    // Search backwards from end for the pattern:
    // isSynthetic(0 or 1), version(u8), oracleFeedId(u8), tradeOracleFeedId(u8)
    // These should match the feedIds we see in the oracle PDA
    // Known feedIds: SOLUSD=0, JITOSOLUSD=1, BTCUSD=2, WBTCUSD=3, BONKUSD=4, USDCUSD=5
    // + trade oracle variants: 30=SOLUSD, 31=JITOSOLUSD, 35=USDCUSD, etc.

    // For JITOSOL: oracle="JITOSOLUSD" (feedId=1), tradeOracle="SOLUSD" (feedId=0 or 30)
    // For USDC: oracle="USDCUSD" (feedId=5), tradeOracle="USDCUSD" (feedId=5 or 35)

    // Search for the feedIds in the last 300 bytes
    const tail = data.slice(-300);
    console.log("  Last 20 bytes (hex):", data.slice(-20).toString("hex"));

    // Scan for byte patterns that match expected feedIds
    // For JITOSOL: looking for bytes [1, 0] or [1, 30] or [1, 31]
    // For USDC: looking for bytes [5, 5] or [5, 35] or [5, 147]
    for (let i = data.length - 50; i < data.length - 2; i++) {
      const v1 = data[i];
      const v2 = data[i+1];
      if (name === "JITOSOL" && (v1 === 1 && (v2 === 0 || v2 === 30 || v2 === 31 || v2 === 143))) {
        console.log("  Possible [oracleFeedId, tradeOracleFeedId] at offset " + i + ": [" + v1 + ", " + v2 + "]");
      }
      if (name === "USDC" && (v1 === 5 && (v2 === 5 || v2 === 35 || v2 === 147))) {
        console.log("  Possible [oracleFeedId, tradeOracleFeedId] at offset " + i + ": [" + v1 + ", " + v2 + "]");
      }
    }
  }
}

main().catch(console.error);
