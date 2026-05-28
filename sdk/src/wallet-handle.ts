import { BN } from "@coral-xyz/anchor";
import {
  PublicKey,
  Signer,
  SystemProgram,
  TransactionSignature,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  getAccount,
  getMint,
} from "@solana/spl-token";

import { SawClient } from "./client";
import {
  APPROVAL_QUEUE_PROGRAM_ID,
  POLICY_REGISTRY_PROGRAM_ID,
} from "./program-ids";
import {
  derivePolicyPda,
  deriveQueuePda,
  deriveRequestPda,
} from "./pdas";
import {
  PayParams,
  PolicyState,
  QueueStateInfo,
  RequestInfo,
  RequestStatus,
  WalletState,
} from "./types";

const ZERO_MEMO: number[] = Array(32).fill(0);

function memoToArray(memo?: Buffer): number[] {
  if (!memo) return ZERO_MEMO;
  if (memo.length === 32) return Array.from(memo);
  const padded = Buffer.alloc(32);
  memo.copy(padded, 0, 0, Math.min(memo.length, 32));
  return Array.from(padded);
}

export class WalletHandle {
  constructor(
    readonly client: SawClient,
    readonly walletPda: PublicKey,
    public state: WalletState
  ) {}

  get owner(): PublicKey {
    return this.state.owner;
  }

  get agent(): PublicKey {
    return this.state.agent;
  }

  get isAgentActive(): boolean {
    return this.state.agentActive;
  }

  policyPda(): PublicKey {
    return derivePolicyPda(this.walletPda)[0];
  }

  queuePda(): PublicKey {
    return deriveQueuePda(this.walletPda)[0];
  }

  requestPda(id: BN): PublicKey {
    return deriveRequestPda(this.walletPda, id)[0];
  }

  // ── Reads ─────────────────────────────────────────────────────────

  async refresh(): Promise<this> {
    this.state = (await this.client.programs.agentWallet.account.walletAccount.fetch(
      this.walletPda
    )) as WalletState;
    return this;
  }

  async fetchPolicy(): Promise<PolicyState> {
    return (await this.client.programs.policyRegistry.account.policyAccount.fetch(
      this.policyPda()
    )) as PolicyState;
  }

  async fetchQueue(): Promise<QueueStateInfo> {
    return (await this.client.programs.approvalQueue.account.queueState.fetch(
      this.queuePda()
    )) as QueueStateInfo;
  }

  async fetchPendingRequests(): Promise<RequestInfo[]> {
    const all = await this.client.programs.approvalQueue.account.requestAccount.all([
      {
        memcmp: {
          offset: 8,
          bytes: this.walletPda.toBase58(),
        },
      },
    ]);
    const nowSecs = Math.floor(Date.now() / 1000);
    return all
      .map((entry) => {
        const acc: any = entry.account;
        const status = acc.status?.pending
          ? RequestStatus.Pending
          : acc.status?.approved
          ? RequestStatus.Approved
          : RequestStatus.Denied;
        return { ...acc, status } as RequestInfo;
      })
      // Honor the method name: only return truly-pending, non-expired requests.
      // The memcmp above filters by wallet only, so the raw set also contains
      // approved/denied/expired rows. On-chain approve_and_execute requires
      // status==Pending && now<=expires_at (approval_queue::mark_approved), so
      // anything else is not actionable and would give the UI a false queue.
      .filter(
        (r) => r.status === RequestStatus.Pending && nowSecs <= r.expiresAt.toNumber()
      );
  }

  // ── Token program detection ───────────────────────────────────────

  async detectTokenProgram(mint: PublicKey): Promise<PublicKey> {
    const info = await this.client.provider.connection.getAccountInfo(mint);
    if (!info) throw new Error(`Mint ${mint.toBase58()} not found`);
    if (info.owner.equals(TOKEN_2022_PROGRAM_ID)) return TOKEN_2022_PROGRAM_ID;
    return TOKEN_PROGRAM_ID;
  }

  // ── Agent ops ─────────────────────────────────────────────────────

  async pay(
    params: PayParams,
    agentSigner: Signer,
    sourceAta: PublicKey,
    recipientAta: PublicKey
  ): Promise<TransactionSignature> {
    const tokenProgram = await this.detectTokenProgram(params.mint);
    return this.client.programs.agentWallet.methods
      .payDirect(params.to, params.amount, memoToArray(params.memo) as any)
      .accountsPartial({
        wallet: this.walletPda,
        agent: this.state.agent,
        policy: this.policyPda(),
        mint: params.mint,
        sourceTokenAccount: sourceAta,
        recipientTokenAccount: recipientAta,
        policyProgram: POLICY_REGISTRY_PROGRAM_ID,
        tokenProgram,
      })
      .signers([agentSigner])
      .rpc();
  }

  async requestPayment(
    params: PayParams,
    agentSigner: Signer,
    payerSigner: Signer
  ): Promise<{ tx: TransactionSignature; requestId: BN }> {
    const queue = await this.fetchQueue();
    const requestId = queue.nextRequestId;
    const requestPda = this.requestPda(requestId);

    const tx = await this.client.programs.agentWallet.methods
      .requestPayment(
        params.to,
        params.mint,
        params.amount,
        memoToArray(params.memo) as any
      )
      .accountsPartial({
        wallet: this.walletPda,
        agent: this.state.agent,
        policy: this.policyPda(),
        queue: this.queuePda(),
        request: requestPda,
        payer: payerSigner.publicKey,
        queueProgram: APPROVAL_QUEUE_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([agentSigner, payerSigner])
      .rpc();

    return { tx, requestId };
  }

  // ── Owner ops ─────────────────────────────────────────────────────

  async approveAndExecute(
    requestId: BN,
    ownerSigner: Signer,
    sourceAta: PublicKey,
    recipientAta: PublicKey,
    mint: PublicKey
  ): Promise<TransactionSignature> {
    const tokenProgram = await this.detectTokenProgram(mint);
    return this.client.programs.agentWallet.methods
      .approveAndExecute()
      .accountsPartial({
        wallet: this.walletPda,
        owner: ownerSigner.publicKey,
        policy: this.policyPda(),
        queue: this.queuePda(),
        request: this.requestPda(requestId),
        mint,
        sourceTokenAccount: sourceAta,
        recipientTokenAccount: recipientAta,
        policyProgram: POLICY_REGISTRY_PROGRAM_ID,
        queueProgram: APPROVAL_QUEUE_PROGRAM_ID,
        tokenProgram,
      })
      .signers([ownerSigner])
      .rpc();
  }

  async denyRequest(
    requestId: BN,
    ownerSigner: Signer
  ): Promise<TransactionSignature> {
    return this.client.programs.agentWallet.methods
      .denyRequest()
      .accountsPartial({
        wallet: this.walletPda,
        owner: ownerSigner.publicKey,
        queue: this.queuePda(),
        request: this.requestPda(requestId),
        queueProgram: APPROVAL_QUEUE_PROGRAM_ID,
      })
      .signers([ownerSigner])
      .rpc();
  }

  async rotateAgent(
    newAgent: PublicKey,
    ownerSigner: Signer
  ): Promise<TransactionSignature> {
    const tx = await this.client.programs.agentWallet.methods
      .setAgent(newAgent)
      .accountsPartial({
        wallet: this.walletPda,
        owner: ownerSigner.publicKey,
      })
      .signers([ownerSigner])
      .rpc();
    await this.refresh();
    return tx;
  }

  async revokeAgent(ownerSigner: Signer): Promise<TransactionSignature> {
    const tx = await this.client.programs.agentWallet.methods
      .revokeAgent()
      .accountsPartial({
        wallet: this.walletPda,
        owner: ownerSigner.publicKey,
      })
      .signers([ownerSigner])
      .rpc();
    await this.refresh();
    return tx;
  }

  async emergencyWithdraw(
    mint: PublicKey,
    sourceAta: PublicKey,
    ownerAta: PublicKey,
    ownerSigner: Signer
  ): Promise<TransactionSignature> {
    const tokenProgram = await this.detectTokenProgram(mint);
    return this.client.programs.agentWallet.methods
      .emergencyWithdraw()
      .accountsPartial({
        wallet: this.walletPda,
        owner: ownerSigner.publicKey,
        mint,
        sourceTokenAccount: sourceAta,
        ownerTokenAccount: ownerAta,
        tokenProgram,
      })
      .signers([ownerSigner])
      .rpc();
  }
}
