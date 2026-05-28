/**
 * Chain-neutral provider interface for SAW agent wallets.
 *
 * The default Solana implementation (`SolanaProvider`) wraps the existing
 * `SawClient` + `WalletHandle`. Future EVM/other-chain implementations
 * must satisfy this same interface so the web app and worker can swap
 * providers without touching call sites.
 *
 * All addresses and asset identifiers are strings (base58 on Solana,
 * 0x-hex on EVM). Amounts are `bigint` (no chain-specific BN).
 * Signers are opaque to the interface — each provider declares its own
 * concrete signer shape via the generic parameter.
 */
export type ChainKind = "solana" | "evm";

export type ProviderAddress = string;
export type ProviderAssetId = string;
export type ProviderTxId = string;
export type ProviderRequestId = string;
export type ProviderWalletId = string;

export type ProviderPolicyInput = {
  dailyLimit: bigint;
  perTxLimit: bigint;
  approvalThreshold: bigint;
  cooldownSeconds?: bigint;
  recipientAllowlist?: ProviderAddress[];
  tokenAllowlist?: ProviderAssetId[];
};

export type ProviderPolicyState = ProviderPolicyInput & {
  cooldownSeconds: bigint;
  recipientAllowlist: ProviderAddress[];
  tokenAllowlist: ProviderAssetId[];
  dailySpent: bigint;
  lastTxTimestamp: bigint;
  lastResetTimestamp: bigint;
};

export type ProviderRequestStatus = "pending" | "approved" | "denied";

export type ProviderRequestInfo = {
  walletId: ProviderWalletId;
  requestId: ProviderRequestId;
  to: ProviderAddress;
  asset: ProviderAssetId;
  amount: bigint;
  status: ProviderRequestStatus;
  createdAt: bigint;
  expiresAt: bigint;
};

export type ProviderPayParams = {
  to: ProviderAddress;
  asset: ProviderAssetId;
  amount: bigint;
  memo?: Uint8Array;
};

export type ProviderCreateWalletParams = {
  owner: ProviderAddress;
  agent: ProviderAddress;
  salt?: Uint8Array;
  policy: ProviderPolicyInput;
};

export interface IAgentWalletProvider<TSigner = unknown> {
  readonly chain: ChainKind;

  createWallet(
    params: ProviderCreateWalletParams,
    ownerSigner: TSigner
  ): Promise<IAgentWalletHandle<TSigner>>;

  loadWallet(walletId: ProviderWalletId): Promise<IAgentWalletHandle<TSigner>>;
}

export interface IAgentWalletHandle<TSigner = unknown> {
  readonly walletId: ProviderWalletId;
  readonly owner: ProviderAddress;
  readonly agent: ProviderAddress;
  readonly isAgentActive: boolean;

  pay(
    params: ProviderPayParams,
    agentSigner: TSigner,
    sourceAccount: ProviderAddress,
    recipientAccount: ProviderAddress
  ): Promise<ProviderTxId>;

  requestPayment(
    params: ProviderPayParams,
    agentSigner: TSigner,
    payerSigner: TSigner
  ): Promise<{ txId: ProviderTxId; requestId: ProviderRequestId }>;

  approveAndExecute(
    requestId: ProviderRequestId,
    ownerSigner: TSigner,
    sourceAccount: ProviderAddress,
    recipientAccount: ProviderAddress,
    asset: ProviderAssetId
  ): Promise<ProviderTxId>;

  denyRequest(
    requestId: ProviderRequestId,
    ownerSigner: TSigner
  ): Promise<ProviderTxId>;

  rotateAgent(
    newAgent: ProviderAddress,
    ownerSigner: TSigner
  ): Promise<ProviderTxId>;

  revokeAgent(ownerSigner: TSigner): Promise<ProviderTxId>;

  emergencyWithdraw(
    asset: ProviderAssetId,
    sourceAccount: ProviderAddress,
    ownerAccount: ProviderAddress,
    ownerSigner: TSigner
  ): Promise<ProviderTxId>;

  fetchPolicy(): Promise<ProviderPolicyState>;
  fetchPendingRequests(): Promise<ProviderRequestInfo[]>;
  refresh(): Promise<void>;
}
