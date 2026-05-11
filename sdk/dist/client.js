"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SawClient = void 0;
const anchor_1 = require("@coral-xyz/anchor");
const web3_js_1 = require("@solana/web3.js");
const program_ids_1 = require("./program-ids");
const pdas_1 = require("./pdas");
const wallet_handle_1 = require("./wallet-handle");
const agent_wallet_json_1 = __importDefault(require("./idl/agent_wallet.json"));
const approval_queue_json_1 = __importDefault(require("./idl/approval_queue.json"));
const policy_registry_json_1 = __importDefault(require("./idl/policy_registry.json"));
class SawClient {
    constructor(provider) {
        this.provider = provider;
        this.programs = {
            agentWallet: new anchor_1.Program(agent_wallet_json_1.default, provider),
            policyRegistry: new anchor_1.Program(policy_registry_json_1.default, provider),
            approvalQueue: new anchor_1.Program(approval_queue_json_1.default, provider),
        };
    }
    static fromConnection(connection, wallet) {
        const anchorWallet = {
            publicKey: wallet.publicKey,
            signTransaction: async (tx) => {
                tx.partialSign(wallet);
                return tx;
            },
            signAllTransactions: async (txs) => {
                txs.forEach((tx) => tx.partialSign(wallet));
                return txs;
            },
            payer: wallet,
        };
        const provider = new anchor_1.AnchorProvider(connection, anchorWallet, {
            commitment: "confirmed",
        });
        return new SawClient(provider);
    }
    async createWallet(params, ownerSigner) {
        const salt = params.salt ?? (0, pdas_1.randomSalt)();
        const [wallet] = (0, pdas_1.deriveWalletPda)(params.owner, salt);
        const [policy] = (0, pdas_1.derivePolicyPda)(wallet);
        const [queue] = (0, pdas_1.deriveQueuePda)(wallet);
        await this.programs.agentWallet.methods
            .initializeWallet(Array.from(salt), params.agent, params.policy)
            .accountsPartial({
            wallet,
            owner: params.owner,
            policy,
            queue,
            policyProgram: program_ids_1.POLICY_REGISTRY_PROGRAM_ID,
            queueProgram: program_ids_1.APPROVAL_QUEUE_PROGRAM_ID,
            systemProgram: web3_js_1.SystemProgram.programId,
        })
            .signers([ownerSigner])
            .rpc();
        const state = await this.programs.agentWallet.account.walletAccount.fetch(wallet);
        return new wallet_handle_1.WalletHandle(this, wallet, state);
    }
    async loadWallet(walletPda) {
        const state = await this.programs.agentWallet.account.walletAccount.fetch(walletPda);
        return new wallet_handle_1.WalletHandle(this, walletPda, state);
    }
    async loadWalletByOwnerSalt(owner, salt) {
        const [wallet] = (0, pdas_1.deriveWalletPda)(owner, salt);
        return this.loadWallet(wallet);
    }
}
exports.SawClient = SawClient;
