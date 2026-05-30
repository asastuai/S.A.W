/**
 * Solana implementation of IAgentWalletProvider.
 *
 * Thin adapter over the existing SawClient + WalletHandle. Translates
 * chain-neutral types (string addresses, bigint amounts, Uint8Array memos)
 * into the Solana-native types (PublicKey, BN, Buffer) the underlying
 * Anchor SDK expects.
 *
 * Production code can keep using SawClient directly — this adapter exists
 * so call sites that want chain neutrality can opt in.
 */
import { BN } from "@coral-xyz/anchor";
import { PublicKey, Signer } from "@solana/web3.js";

import { SawClient } from "../client";
import { WalletHandle } from "../wallet-handle";
import {
  ChainKind,
  IAgentWalletHandle,
  IAgentWalletProvider,
  ProviderAddress,
  ProviderAssetId,
  ProviderCreateWalletParams,
  ProviderPayParams,
  ProviderPolicyState,
  ProviderRequestId,
  ProviderRequestInfo,
  ProviderRequestStatus,
  ProviderTxId,
  ProviderWalletId,
} from "../provider";
import { PolicyParams } from "../types";

const toPk = (addr: ProviderAddress): PublicKey => new PublicKey(addr);
const toBn = (amount: bigint): BN => new BN(amount.toString());
const fromBn = (bn: BN): bigint => BigInt(bn.toString());
const toBuffer = (bytes?: Uint8Array): Buffer | undefined =>
  bytes ? Buffer.from(bytes) : undefined;
const toBnId = (id: ProviderRequestId): BN => new BN(id);

function adaptPolicyInput(
  policy: ProviderCreateWalletParams["policy"]
): PolicyParams {
  return {
    dailyLimit: toBn(policy.dailyLimit),
    perTxLimit: toBn(policy.perTxLimit),
    approvalThreshold: toBn(policy.approvalThreshold),
    cooldownSeconds: toBn(policy.cooldownSeconds ?? 0n),
    recipientAllowlist: (policy.recipientAllowlist ?? []).map(toPk),
    tokenAllowlist: (policy.tokenAllowlist ?? []).map(toPk),
    mint: toPk(policy.denominationAsset),
  };
}

export class SolanaProvider implements IAgentWalletProvider<Signer> {
  readonly chain: ChainKind = "solana";

  constructor(readonly client: SawClient) {}

  async createWallet(
    params: ProviderCreateWalletParams,
    ownerSigner: Signer
  ): Promise<IAgentWalletHandle<Signer>> {
    const handle = await this.client.createWallet(
      {
        owner: toPk(params.owner),
        agent: toPk(params.agent),
        salt: toBuffer(params.salt),
        policy: adaptPolicyInput(params.policy),
      },
      ownerSigner
    );
    return new SolanaWalletHandle(handle);
  }

  async loadWallet(
    walletId: ProviderWalletId
  ): Promise<IAgentWalletHandle<Signer>> {
    const handle = await this.client.loadWallet(toPk(walletId));
    return new SolanaWalletHandle(handle);
  }
}

export class SolanaWalletHandle implements IAgentWalletHandle<Signer> {
  constructor(readonly handle: WalletHandle) {}

  get walletId(): ProviderWalletId {
    return this.handle.walletPda.toBase58();
  }
  get owner(): ProviderAddress {
    return this.handle.owner.toBase58();
  }
  get agent(): ProviderAddress {
    return this.handle.agent.toBase58();
  }
  get isAgentActive(): boolean {
    return this.handle.isAgentActive;
  }

  async pay(
    params: ProviderPayParams,
    agentSigner: Signer,
    sourceAccount: ProviderAddress,
    recipientAccount: ProviderAddress
  ): Promise<ProviderTxId> {
    return this.handle.pay(
      {
        to: toPk(params.to),
        mint: toPk(params.asset),
        amount: toBn(params.amount),
        memo: toBuffer(params.memo),
      },
      agentSigner,
      toPk(sourceAccount),
      toPk(recipientAccount)
    );
  }

  async requestPayment(
    params: ProviderPayParams,
    agentSigner: Signer,
    payerSigner: Signer
  ): Promise<{ txId: ProviderTxId; requestId: ProviderRequestId }> {
    const res = await this.handle.requestPayment(
      {
        to: toPk(params.to),
        mint: toPk(params.asset),
        amount: toBn(params.amount),
        memo: toBuffer(params.memo),
      },
      agentSigner,
      payerSigner
    );
    return { txId: res.tx, requestId: res.requestId.toString() };
  }

  async approveAndExecute(
    requestId: ProviderRequestId,
    ownerSigner: Signer,
    sourceAccount: ProviderAddress,
    recipientAccount: ProviderAddress,
    asset: ProviderAssetId
  ): Promise<ProviderTxId> {
    return this.handle.approveAndExecute(
      toBnId(requestId),
      ownerSigner,
      toPk(sourceAccount),
      toPk(recipientAccount),
      toPk(asset)
    );
  }

  async denyRequest(
    requestId: ProviderRequestId,
    ownerSigner: Signer
  ): Promise<ProviderTxId> {
    return this.handle.denyRequest(toBnId(requestId), ownerSigner);
  }

  async rotateAgent(
    newAgent: ProviderAddress,
    ownerSigner: Signer
  ): Promise<ProviderTxId> {
    return this.handle.rotateAgent(toPk(newAgent), ownerSigner);
  }

  async revokeAgent(ownerSigner: Signer): Promise<ProviderTxId> {
    return this.handle.revokeAgent(ownerSigner);
  }

  async emergencyWithdraw(
    asset: ProviderAssetId,
    sourceAccount: ProviderAddress,
    ownerAccount: ProviderAddress,
    ownerSigner: Signer
  ): Promise<ProviderTxId> {
    return this.handle.emergencyWithdraw(
      toPk(asset),
      toPk(sourceAccount),
      toPk(ownerAccount),
      ownerSigner
    );
  }

  async fetchPolicy(): Promise<ProviderPolicyState> {
    const p = await this.handle.fetchPolicy();
    return {
      dailyLimit: fromBn(p.dailyLimit),
      perTxLimit: fromBn(p.perTxLimit),
      approvalThreshold: fromBn(p.approvalThreshold),
      cooldownSeconds: fromBn(p.cooldownSeconds),
      recipientAllowlist: p.recipientAllowlist.map((pk) => pk.toBase58()),
      tokenAllowlist: p.tokenAllowlist.map((pk) => pk.toBase58()),
      denominationAsset: p.mint.toBase58(),
      dailySpent: fromBn(p.dailySpent),
      lastTxTimestamp: fromBn(p.lastTxTimestamp),
      lastResetTimestamp: fromBn(p.lastResetTimestamp),
    };
  }

  async fetchPendingRequests(): Promise<ProviderRequestInfo[]> {
    const reqs = await this.handle.fetchPendingRequests();
    return reqs.map((r) => {
      const status: ProviderRequestStatus =
        r.status === "pending"
          ? "pending"
          : r.status === "approved"
          ? "approved"
          : "denied";
      return {
        walletId: r.wallet.toBase58(),
        requestId: r.id.toString(),
        to: r.to.toBase58(),
        asset: r.mint.toBase58(),
        amount: fromBn(r.amount),
        status,
        createdAt: fromBn(r.createdAt),
        expiresAt: fromBn(r.expiresAt),
      };
    });
  }

  async refresh(): Promise<void> {
    await this.handle.refresh();
  }
}
