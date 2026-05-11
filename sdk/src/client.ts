import {
  AnchorProvider,
  BN,
  Program,
  Idl,
} from "@coral-xyz/anchor";
import {
  Connection,
  Keypair,
  PublicKey,
  Signer,
  SystemProgram,
} from "@solana/web3.js";

import {
  AGENT_WALLET_PROGRAM_ID,
  APPROVAL_QUEUE_PROGRAM_ID,
  POLICY_REGISTRY_PROGRAM_ID,
} from "./program-ids";
import {
  derivePolicyPda,
  deriveQueuePda,
  deriveWalletPda,
  randomSalt,
} from "./pdas";
import { WalletHandle } from "./wallet-handle";
import { CreateWalletParams, WalletState } from "./types";

import agentWalletIdl from "./idl/agent_wallet.json";
import approvalQueueIdl from "./idl/approval_queue.json";
import policyRegistryIdl from "./idl/policy_registry.json";

import type { AgentWallet } from "./idl/types/agent_wallet";
import type { ApprovalQueue } from "./idl/types/approval_queue";
import type { PolicyRegistry } from "./idl/types/policy_registry";

export type SawPrograms = {
  agentWallet: Program<AgentWallet>;
  policyRegistry: Program<PolicyRegistry>;
  approvalQueue: Program<ApprovalQueue>;
};

export class SawClient {
  readonly provider: AnchorProvider;
  readonly programs: SawPrograms;

  constructor(provider: AnchorProvider) {
    this.provider = provider;
    this.programs = {
      agentWallet: new Program<AgentWallet>(
        agentWalletIdl as unknown as AgentWallet,
        provider
      ),
      policyRegistry: new Program<PolicyRegistry>(
        policyRegistryIdl as unknown as PolicyRegistry,
        provider
      ),
      approvalQueue: new Program<ApprovalQueue>(
        approvalQueueIdl as unknown as ApprovalQueue,
        provider
      ),
    };
  }

  static fromConnection(connection: Connection, wallet: Keypair): SawClient {
    const anchorWallet = {
      publicKey: wallet.publicKey,
      signTransaction: async (tx: any) => {
        tx.partialSign(wallet);
        return tx;
      },
      signAllTransactions: async (txs: any[]) => {
        txs.forEach((tx) => tx.partialSign(wallet));
        return txs;
      },
      payer: wallet,
    } as any;
    const provider = new AnchorProvider(connection, anchorWallet, {
      commitment: "confirmed",
    });
    return new SawClient(provider);
  }

  async createWallet(
    params: CreateWalletParams,
    ownerSigner: Signer
  ): Promise<WalletHandle> {
    const salt = params.salt ?? randomSalt();
    const [wallet] = deriveWalletPda(params.owner, salt);
    const [policy] = derivePolicyPda(wallet);
    const [queue] = deriveQueuePda(wallet);

    await this.programs.agentWallet.methods
      .initializeWallet(
        Array.from(salt),
        params.agent,
        params.policy as any
      )
      .accountsPartial({
        wallet,
        owner: params.owner,
        policy,
        queue,
        policyProgram: POLICY_REGISTRY_PROGRAM_ID,
        queueProgram: APPROVAL_QUEUE_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([ownerSigner])
      .rpc();

    const state = await this.programs.agentWallet.account.walletAccount.fetch(
      wallet
    );

    return new WalletHandle(this, wallet, state as WalletState);
  }

  async loadWallet(walletPda: PublicKey): Promise<WalletHandle> {
    const state = await this.programs.agentWallet.account.walletAccount.fetch(
      walletPda
    );
    return new WalletHandle(this, walletPda, state as WalletState);
  }

  async loadWalletByOwnerSalt(
    owner: PublicKey,
    salt: Buffer
  ): Promise<WalletHandle> {
    const [wallet] = deriveWalletPda(owner, salt);
    return this.loadWallet(wallet);
  }
}
