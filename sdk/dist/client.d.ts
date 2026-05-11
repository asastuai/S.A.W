import { AnchorProvider, Program } from "@coral-xyz/anchor";
import { Connection, Keypair, PublicKey, Signer } from "@solana/web3.js";
import { WalletHandle } from "./wallet-handle";
import { CreateWalletParams } from "./types";
import type { AgentWallet } from "./idl/types/agent_wallet";
import type { ApprovalQueue } from "./idl/types/approval_queue";
import type { PolicyRegistry } from "./idl/types/policy_registry";
export type SawPrograms = {
    agentWallet: Program<AgentWallet>;
    policyRegistry: Program<PolicyRegistry>;
    approvalQueue: Program<ApprovalQueue>;
};
export declare class SawClient {
    readonly provider: AnchorProvider;
    readonly programs: SawPrograms;
    constructor(provider: AnchorProvider);
    static fromConnection(connection: Connection, wallet: Keypair): SawClient;
    createWallet(params: CreateWalletParams, ownerSigner: Signer): Promise<WalletHandle>;
    loadWallet(walletPda: PublicKey): Promise<WalletHandle>;
    loadWalletByOwnerSalt(owner: PublicKey, salt: Buffer): Promise<WalletHandle>;
}
