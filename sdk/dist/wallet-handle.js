"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WalletHandle = void 0;
const web3_js_1 = require("@solana/web3.js");
const spl_token_1 = require("@solana/spl-token");
const program_ids_1 = require("./program-ids");
const pdas_1 = require("./pdas");
const types_1 = require("./types");
const ZERO_MEMO = Array(32).fill(0);
function memoToArray(memo) {
    if (!memo)
        return ZERO_MEMO;
    if (memo.length === 32)
        return Array.from(memo);
    const padded = Buffer.alloc(32);
    memo.copy(padded, 0, 0, Math.min(memo.length, 32));
    return Array.from(padded);
}
class WalletHandle {
    constructor(client, walletPda, state) {
        this.client = client;
        this.walletPda = walletPda;
        this.state = state;
    }
    get owner() {
        return this.state.owner;
    }
    get agent() {
        return this.state.agent;
    }
    get isAgentActive() {
        return this.state.agentActive;
    }
    policyPda() {
        return (0, pdas_1.derivePolicyPda)(this.walletPda)[0];
    }
    queuePda() {
        return (0, pdas_1.deriveQueuePda)(this.walletPda)[0];
    }
    requestPda(id) {
        return (0, pdas_1.deriveRequestPda)(this.walletPda, id)[0];
    }
    // ── Reads ─────────────────────────────────────────────────────────
    async refresh() {
        this.state = (await this.client.programs.agentWallet.account.walletAccount.fetch(this.walletPda));
        return this;
    }
    async fetchPolicy() {
        return (await this.client.programs.policyRegistry.account.policyAccount.fetch(this.policyPda()));
    }
    async fetchQueue() {
        return (await this.client.programs.approvalQueue.account.queueState.fetch(this.queuePda()));
    }
    async fetchPendingRequests() {
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
            const acc = entry.account;
            const status = acc.status?.pending
                ? types_1.RequestStatus.Pending
                : acc.status?.approved
                    ? types_1.RequestStatus.Approved
                    : types_1.RequestStatus.Denied;
            return { ...acc, status };
        })
            // Honor the method name: only return truly-pending, non-expired requests.
            // The memcmp above filters by wallet only, so the raw set also contains
            // approved/denied/expired rows. On-chain approve_and_execute requires
            // status==Pending && now<=expires_at (approval_queue::mark_approved), so
            // anything else is not actionable and would give the UI a false queue.
            .filter((r) => r.status === types_1.RequestStatus.Pending && nowSecs <= r.expiresAt.toNumber());
    }
    // ── Token program detection ───────────────────────────────────────
    async detectTokenProgram(mint) {
        const info = await this.client.provider.connection.getAccountInfo(mint);
        if (!info)
            throw new Error(`Mint ${mint.toBase58()} not found`);
        if (info.owner.equals(spl_token_1.TOKEN_2022_PROGRAM_ID))
            return spl_token_1.TOKEN_2022_PROGRAM_ID;
        return spl_token_1.TOKEN_PROGRAM_ID;
    }
    /**
     * The decimals of an SPL mint (handles Token-2022). Pair with toBaseUnits()
     * to build policy caps in the pinned mint's real base-units instead of
     * assuming a fixed decimal count (v1.5 critique #2). See sdk/src/policy.ts.
     */
    async fetchMintDecimals(mint) {
        const tokenProgram = await this.detectTokenProgram(mint);
        const info = await (0, spl_token_1.getMint)(this.client.provider.connection, mint, undefined, tokenProgram);
        return info.decimals;
    }
    // ── Agent ops ─────────────────────────────────────────────────────
    async pay(params, agentSigner, sourceAta, recipientAta) {
        const tokenProgram = await this.detectTokenProgram(params.mint);
        return this.client.programs.agentWallet.methods
            .payDirect(params.to, params.amount, memoToArray(params.memo))
            .accountsPartial({
            wallet: this.walletPda,
            agent: this.state.agent,
            policy: this.policyPda(),
            mint: params.mint,
            sourceTokenAccount: sourceAta,
            recipientTokenAccount: recipientAta,
            policyProgram: program_ids_1.POLICY_REGISTRY_PROGRAM_ID,
            tokenProgram,
        })
            .signers([agentSigner])
            .rpc();
    }
    async requestPayment(params, agentSigner, payerSigner) {
        const queue = await this.fetchQueue();
        const requestId = queue.nextRequestId;
        const requestPda = this.requestPda(requestId);
        const tx = await this.client.programs.agentWallet.methods
            .requestPayment(params.to, params.mint, params.amount, memoToArray(params.memo))
            .accountsPartial({
            wallet: this.walletPda,
            agent: this.state.agent,
            policy: this.policyPda(),
            queue: this.queuePda(),
            request: requestPda,
            payer: payerSigner.publicKey,
            queueProgram: program_ids_1.APPROVAL_QUEUE_PROGRAM_ID,
            systemProgram: web3_js_1.SystemProgram.programId,
        })
            .signers([agentSigner, payerSigner])
            .rpc();
        return { tx, requestId };
    }
    // ── Owner ops ─────────────────────────────────────────────────────
    async approveAndExecute(requestId, ownerSigner, sourceAta, recipientAta, mint) {
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
            policyProgram: program_ids_1.POLICY_REGISTRY_PROGRAM_ID,
            queueProgram: program_ids_1.APPROVAL_QUEUE_PROGRAM_ID,
            tokenProgram,
        })
            .signers([ownerSigner])
            .rpc();
    }
    async denyRequest(requestId, ownerSigner) {
        return this.client.programs.agentWallet.methods
            .denyRequest()
            .accountsPartial({
            wallet: this.walletPda,
            owner: ownerSigner.publicKey,
            queue: this.queuePda(),
            request: this.requestPda(requestId),
            queueProgram: program_ids_1.APPROVAL_QUEUE_PROGRAM_ID,
        })
            .signers([ownerSigner])
            .rpc();
    }
    async rotateAgent(newAgent, ownerSigner) {
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
    async revokeAgent(ownerSigner) {
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
    async emergencyWithdraw(mint, sourceAta, ownerAta, ownerSigner) {
        const tokenProgram = await this.detectTokenProgram(mint);
        return this.client.programs.agentWallet.methods
            .emergencyWithdraw()
            .accountsPartial({
            wallet: this.walletPda,
            owner: ownerSigner.publicKey,
            policy: this.policyPda(),
            policyProgram: program_ids_1.POLICY_REGISTRY_PROGRAM_ID,
            mint,
            sourceTokenAccount: sourceAta,
            ownerTokenAccount: ownerAta,
            tokenProgram,
        })
            .signers([ownerSigner])
            .rpc();
    }
}
exports.WalletHandle = WalletHandle;
