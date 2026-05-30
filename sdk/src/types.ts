import { BN } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";

export type PolicyParams = {
  dailyLimit: BN;
  perTxLimit: BN;
  approvalThreshold: BN;
  cooldownSeconds: BN;
  recipientAllowlist: PublicKey[];
  tokenAllowlist: PublicKey[];
  // M-1: the SPL mint this policy's spend limits are denominated in.
  mint: PublicKey;
};

export type PolicyState = PolicyParams & {
  wallet: PublicKey;
  owner: PublicKey;
  dailySpent: BN;
  lastTxTimestamp: BN;
  lastResetTimestamp: BN;
  bump: number;
};

export type WalletState = {
  owner: PublicKey;
  agent: PublicKey;
  agentActive: boolean;
  salt: number[];
  bump: number;
};

export type QueueStateInfo = {
  wallet: PublicKey;
  owner: PublicKey;
  nextRequestId: BN;
  pendingCount: number;
  bump: number;
};

export enum RequestStatus {
  Pending = "pending",
  Approved = "approved",
  Denied = "denied",
}

export type RequestInfo = {
  wallet: PublicKey;
  id: BN;
  to: PublicKey;
  mint: PublicKey;
  amount: BN;
  memo: number[];
  createdAt: BN;
  expiresAt: BN;
  status: RequestStatus;
  bump: number;
};

export type CreateWalletParams = {
  owner: PublicKey;
  agent: PublicKey;
  salt?: Buffer;
  policy: PolicyParams;
};

export type PayParams = {
  to: PublicKey;
  mint: PublicKey;
  amount: BN;
  memo?: Buffer;
};
