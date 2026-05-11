import { BN } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";

import {
  AGENT_WALLET_PROGRAM_ID,
  APPROVAL_QUEUE_PROGRAM_ID,
  POLICY_REGISTRY_PROGRAM_ID,
} from "./program-ids";

export function deriveWalletPda(
  owner: PublicKey,
  salt: Buffer
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("wallet"), owner.toBuffer(), salt],
    AGENT_WALLET_PROGRAM_ID
  );
}

export function derivePolicyPda(wallet: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("policy"), wallet.toBuffer()],
    POLICY_REGISTRY_PROGRAM_ID
  );
}

export function deriveQueuePda(wallet: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("queue"), wallet.toBuffer()],
    APPROVAL_QUEUE_PROGRAM_ID
  );
}

export function deriveRequestPda(
  wallet: PublicKey,
  id: BN
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("request"), wallet.toBuffer(), id.toArrayLike(Buffer, "le", 8)],
    APPROVAL_QUEUE_PROGRAM_ID
  );
}

export function randomSalt(): Buffer {
  const salt = Buffer.alloc(32);
  for (let i = 0; i < 32; i++) {
    salt[i] = Math.floor(Math.random() * 256);
  }
  return salt;
}
