import { AnchorProvider, BN, Wallet } from "@coral-xyz/anchor";
import {
  buildPolicy,
  randomSalt,
  SawClient,
  WalletHandle,
} from "@asastuai/saw-sdk";
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  Signer,
  Transaction,
  VersionedTransaction,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  createMint,
  getOrCreateAssociatedTokenAccount,
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  mintTo,
} from "@solana/spl-token";

export const DEMO_DECIMALS = 6;

const STORAGE_PREFIX = "saw-demo-v1";

type StoredAgent = {
  secretKey: number[];
  pubkey: string;
};

export function loadOrCreateAgent(handler: PublicKey): Keypair {
  const key = `${STORAGE_PREFIX}:agent:${handler.toBase58()}`;
  if (typeof window === "undefined") {
    return Keypair.generate();
  }
  try {
    const raw = window.localStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw) as StoredAgent;
      return Keypair.fromSecretKey(Uint8Array.from(parsed.secretKey));
    }
  } catch (_) {}
  const fresh = Keypair.generate();
  window.localStorage.setItem(
    key,
    JSON.stringify({
      secretKey: Array.from(fresh.secretKey),
      pubkey: fresh.publicKey.toBase58(),
    })
  );
  return fresh;
}

export function loadOrCreateRecipient(handler: PublicKey): Keypair {
  const key = `${STORAGE_PREFIX}:recipient:${handler.toBase58()}`;
  if (typeof window === "undefined") return Keypair.generate();
  try {
    const raw = window.localStorage.getItem(key);
    if (raw) {
      return Keypair.fromSecretKey(
        Uint8Array.from(JSON.parse(raw).secretKey)
      );
    }
  } catch (_) {}
  const fresh = Keypair.generate();
  window.localStorage.setItem(
    key,
    JSON.stringify({
      secretKey: Array.from(fresh.secretKey),
      pubkey: fresh.publicKey.toBase58(),
    })
  );
  return fresh;
}

export type DemoSetup = {
  walletPda: PublicKey;
  walletAta: PublicKey;
  recipient: Keypair;
  recipientAta: PublicKey;
  mint: PublicKey;
  agent: Keypair;
};

export type StoredSetup = {
  walletPda: string;
  walletAta: string;
  recipientAta: string;
  mint: string;
  salt: number[];
};

const setupKey = (handler: PublicKey) => `${STORAGE_PREFIX}:setup:${handler.toBase58()}`;

export function saveSetup(handler: PublicKey, setup: DemoSetup, salt: Buffer) {
  if (typeof window === "undefined") return;
  const stored: StoredSetup = {
    walletPda: setup.walletPda.toBase58(),
    walletAta: setup.walletAta.toBase58(),
    recipientAta: setup.recipientAta.toBase58(),
    mint: setup.mint.toBase58(),
    salt: Array.from(salt),
  };
  window.localStorage.setItem(setupKey(handler), JSON.stringify(stored));
}

export function loadSetup(handler: PublicKey): StoredSetup | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(setupKey(handler));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StoredSetup;
  } catch (_) {
    return null;
  }
}

export function clearSetup(handler: PublicKey) {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(setupKey(handler));
}

export function makeClient(connection: Connection, wallet: Wallet): SawClient {
  const provider = new AnchorProvider(connection, wallet, {
    commitment: "confirmed",
  });
  return new SawClient(provider);
}
