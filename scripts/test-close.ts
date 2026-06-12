/**
 * Quick standalone close test — runs after probe opens a position.
 * Run: cd worker && pnpm exec tsx ../scripts/test-close.ts
 */
import * as fs from "fs";
import * as path from "path";
import {
  createSolanaRpc,
  createKeyPairSignerFromBytes,
  address,
  pipe,
  createTransactionMessage,
  setTransactionMessageFeePayer,
  setTransactionMessageLifetimeUsingBlockhash,
  appendTransactionMessageInstructions,
  signTransactionMessageWithSigners,
  getBase64EncodedWireTransaction,
  getSignatureFromTransaction,
  type IInstruction,
} from "@solana/kit";
import { getClosePositionLongIxs } from "adrena-sdk/instructions";

const LOCAL_RPC = "http://127.0.0.1:8899";

async function main() {
  const configPath = path.join(__dirname, "localnet-adrena/.localnet-config.json");
  const cfg = JSON.parse(fs.readFileSync(configPath, "utf-8")) as Record<string, string>;
  const bytes = JSON.parse(fs.readFileSync(cfg.localWallet, "utf-8")) as number[];
  const wallet = await createKeyPairSignerFromBytes(new Uint8Array(bytes));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rpc = createSolanaRpc(LOCAL_RPC) as any;

  console.log("Wallet:", wallet.address);

  // Build close ixs
  const closeResult = await getClosePositionLongIxs({
    wallet: wallet as any,
    rpc: rpc as any,
    principalToken: "JITOSOL",
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const closeIxs = (closeResult as any).ixs ?? closeResult as unknown as IInstruction[];
  console.log("Close ixs built:", closeIxs.length, "instructions");

  // Send
  const { value: blockhash } = await rpc.getLatestBlockhash().send();
  const txMsg = pipe(
    createTransactionMessage({ version: 0 }),
    (tx: any) => setTransactionMessageFeePayer(wallet.address, tx),
    (tx: any) => setTransactionMessageLifetimeUsingBlockhash(blockhash, tx),
    (tx: any) => appendTransactionMessageInstructions(closeIxs, tx),
  );
  const signed = await signTransactionMessageWithSigners(txMsg);
  const sig = getSignatureFromTransaction(signed);
  const wire = getBase64EncodedWireTransaction(signed);

  console.log("Sending close tx:", sig.slice(0, 20) + "...");
  try {
    await rpc.sendTransaction(wire, { encoding: "base64", preflightCommitment: "processed", skipPreflight: false }).send();
    console.log("Submitted! Sig:", sig);
  } catch (e: any) {
    console.error("FAIL:", JSON.stringify(e, (_k, v) => typeof v === "bigint" ? v.toString() : v, 2).slice(0, 3000));
  }
}

main().catch(console.error);
