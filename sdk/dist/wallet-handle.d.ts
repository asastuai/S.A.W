import { BN } from "@coral-xyz/anchor";
import { PublicKey, Signer, TransactionSignature } from "@solana/web3.js";
import { SawClient } from "./client";
import { PayParams, PolicyState, QueueStateInfo, RequestInfo, WalletState } from "./types";
export declare class WalletHandle {
    readonly client: SawClient;
    readonly walletPda: PublicKey;
    state: WalletState;
    constructor(client: SawClient, walletPda: PublicKey, state: WalletState);
    get owner(): PublicKey;
    get agent(): PublicKey;
    get isAgentActive(): boolean;
    policyPda(): PublicKey;
    queuePda(): PublicKey;
    requestPda(id: BN): PublicKey;
    refresh(): Promise<this>;
    fetchPolicy(): Promise<PolicyState>;
    fetchQueue(): Promise<QueueStateInfo>;
    fetchPendingRequests(): Promise<RequestInfo[]>;
    detectTokenProgram(mint: PublicKey): Promise<PublicKey>;
    pay(params: PayParams, agentSigner: Signer, sourceAta: PublicKey, recipientAta: PublicKey): Promise<TransactionSignature>;
    requestPayment(params: PayParams, agentSigner: Signer, payerSigner: Signer): Promise<{
        tx: TransactionSignature;
        requestId: BN;
    }>;
    approveAndExecute(requestId: BN, ownerSigner: Signer, sourceAta: PublicKey, recipientAta: PublicKey, mint: PublicKey): Promise<TransactionSignature>;
    denyRequest(requestId: BN, ownerSigner: Signer): Promise<TransactionSignature>;
    rotateAgent(newAgent: PublicKey, ownerSigner: Signer): Promise<TransactionSignature>;
    revokeAgent(ownerSigner: Signer): Promise<TransactionSignature>;
    emergencyWithdraw(mint: PublicKey, sourceAta: PublicKey, ownerAta: PublicKey, ownerSigner: Signer): Promise<TransactionSignature>;
}
