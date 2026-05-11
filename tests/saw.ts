import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import {
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  createMint,
  createAssociatedTokenAccount,
  getAssociatedTokenAddress,
  mintTo,
} from "@solana/spl-token";
import { assert, expect } from "chai";

import { AgentWallet } from "../target/types/agent_wallet";
import { PolicyRegistry } from "../target/types/policy_registry";
import { ApprovalQueue } from "../target/types/approval_queue";

const SECONDS_PER_DAY = 86_400;

describe("SAW (Secret Agent Wallet)", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const agentWalletProgram = anchor.workspace
    .AgentWallet as Program<AgentWallet>;
  const policyRegistryProgram = anchor.workspace
    .PolicyRegistry as Program<PolicyRegistry>;
  const approvalQueueProgram = anchor.workspace
    .ApprovalQueue as Program<ApprovalQueue>;

  const payer = (provider.wallet as anchor.Wallet).payer;

  let mint: PublicKey;
  let recipientOwner: Keypair;
  let recipientAta: PublicKey;

  before(async () => {
    mint = await createMint(
      provider.connection,
      payer,
      payer.publicKey,
      null,
      6
    );

    recipientOwner = Keypair.generate();
    await provider.connection.requestAirdrop(
      recipientOwner.publicKey,
      LAMPORTS_PER_SOL
    );
    await sleep(500);

    recipientAta = await createAssociatedTokenAccount(
      provider.connection,
      payer,
      mint,
      recipientOwner.publicKey
    );
  });

  // ────────────────────────────────────────────────────────────────────
  //   Helpers
  // ────────────────────────────────────────────────────────────────────

  async function fundAccount(target: PublicKey, sol: number) {
    const sig = await provider.connection.requestAirdrop(
      target,
      sol * LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(sig, "confirmed");
  }

  function deriveWallet(owner: PublicKey, _agent: PublicKey, salt: Buffer) {
    return PublicKey.findProgramAddressSync(
      [Buffer.from("wallet"), owner.toBuffer(), salt],
      agentWalletProgram.programId
    );
  }

  function derivePolicy(wallet: PublicKey) {
    return PublicKey.findProgramAddressSync(
      [Buffer.from("policy"), wallet.toBuffer()],
      policyRegistryProgram.programId
    );
  }

  function deriveQueue(wallet: PublicKey) {
    return PublicKey.findProgramAddressSync(
      [Buffer.from("queue"), wallet.toBuffer()],
      approvalQueueProgram.programId
    );
  }

  function deriveRequest(wallet: PublicKey, id: BN) {
    return PublicKey.findProgramAddressSync(
      [
        Buffer.from("request"),
        wallet.toBuffer(),
        id.toArrayLike(Buffer, "le", 8),
      ],
      approvalQueueProgram.programId
    );
  }

  function defaultPolicyParams(overrides: Partial<PolicyParams> = {}): PolicyParams {
    return {
      dailyLimit: new BN(1_000_000_000),
      perTxLimit: new BN(100_000_000),
      approvalThreshold: new BN(50_000_000),
      cooldownSeconds: new BN(0),
      recipientAllowlist: [],
      tokenAllowlist: [],
      ...overrides,
    };
  }

  type PolicyParams = {
    dailyLimit: BN;
    perTxLimit: BN;
    approvalThreshold: BN;
    cooldownSeconds: BN;
    recipientAllowlist: PublicKey[];
    tokenAllowlist: PublicKey[];
  };

  type WalletCtx = {
    owner: Keypair;
    agent: Keypair;
    salt: Buffer;
    wallet: PublicKey;
    walletBump: number;
    policy: PublicKey;
    queue: PublicKey;
    walletAta: PublicKey;
  };

  async function setupWallet(
    overrides: Partial<PolicyParams> = {},
    initialBalance: bigint = BigInt(500_000_000)
  ): Promise<WalletCtx> {
    const owner = Keypair.generate();
    const agent = Keypair.generate();
    const salt = Buffer.alloc(32);
    salt.writeUInt32LE(Math.floor(Math.random() * 0xffffffff), 0);

    await fundAccount(owner.publicKey, 2);
    await fundAccount(agent.publicKey, 1);

    const [wallet, walletBump] = deriveWallet(owner.publicKey, agent.publicKey, salt);
    const [policy] = derivePolicy(wallet);
    const [queue] = deriveQueue(wallet);

    await agentWalletProgram.methods
      .initializeWallet(
        Array.from(salt),
        agent.publicKey,
        defaultPolicyParams(overrides) as any
      )
      .accountsPartial({
        wallet,
        owner: owner.publicKey,
        policy,
        queue,
        policyProgram: policyRegistryProgram.programId,
        queueProgram: approvalQueueProgram.programId,
        systemProgram: SystemProgram.programId,
      })
      .signers([owner])
      .rpc();

    const walletAta = await createAssociatedTokenAccount(
      provider.connection,
      payer,
      mint,
      wallet,
      undefined,
      undefined,
      undefined,
      true
    );

    if (initialBalance > 0n) {
      await mintTo(
        provider.connection,
        payer,
        mint,
        walletAta,
        payer.publicKey,
        initialBalance
      );
    }

    return { owner, agent, salt, wallet, walletBump, policy, queue, walletAta };
  }

  function payDirect(ctx: WalletCtx, amount: BN, to: PublicKey, recipientAta: PublicKey, memo?: number[]) {
    const memoBytes = memo ?? Array(32).fill(0);
    return agentWalletProgram.methods
      .payDirect(to, amount, memoBytes as any)
      .accountsPartial({
        wallet: ctx.wallet,
        agent: ctx.agent.publicKey,
        policy: ctx.policy,
        mint,
        sourceTokenAccount: ctx.walletAta,
        recipientTokenAccount: recipientAta,
        policyProgram: policyRegistryProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([ctx.agent])
      .rpc();
  }

  async function nextRequestPda(ctx: WalletCtx) {
    const queueAccount = await approvalQueueProgram.account.queueState.fetch(
      ctx.queue
    );
    const [request] = deriveRequest(ctx.wallet, queueAccount.nextRequestId);
    return { request, id: queueAccount.nextRequestId };
  }

  // ────────────────────────────────────────────────────────────────────
  //   Tests
  // ────────────────────────────────────────────────────────────────────

  describe("initialize_wallet", () => {
    it("creates wallet, policy, and queue PDAs", async () => {
      const ctx = await setupWallet({}, 0n);

      const walletAccount = await agentWalletProgram.account.walletAccount.fetch(
        ctx.wallet
      );
      expect(walletAccount.owner.toBase58()).to.equal(
        ctx.owner.publicKey.toBase58()
      );
      expect(walletAccount.agent.toBase58()).to.equal(
        ctx.agent.publicKey.toBase58()
      );
      expect(walletAccount.agentActive).to.equal(true);

      const policyAccount = await policyRegistryProgram.account.policyAccount.fetch(
        ctx.policy
      );
      expect(policyAccount.wallet.toBase58()).to.equal(ctx.wallet.toBase58());
      expect(policyAccount.owner.toBase58()).to.equal(
        ctx.owner.publicKey.toBase58()
      );

      const queueAccount = await approvalQueueProgram.account.queueState.fetch(
        ctx.queue
      );
      expect(queueAccount.wallet.toBase58()).to.equal(ctx.wallet.toBase58());
      expect(queueAccount.nextRequestId.toNumber()).to.equal(1);
      expect(queueAccount.pendingCount).to.equal(0);
    });

    it("rejects re-initialization with same salt", async () => {
      const ctx = await setupWallet({}, 0n);
      try {
        await agentWalletProgram.methods
          .initializeWallet(
            Array.from(ctx.salt),
            ctx.agent.publicKey,
            defaultPolicyParams() as any
          )
          .accountsPartial({
            wallet: ctx.wallet,
            owner: ctx.owner.publicKey,
            policy: ctx.policy,
            queue: ctx.queue,
            policyProgram: policyRegistryProgram.programId,
            queueProgram: approvalQueueProgram.programId,
            systemProgram: SystemProgram.programId,
          })
          .signers([ctx.owner])
          .rpc();
        assert.fail("expected init to fail");
      } catch (err: any) {
        expect(err.toString()).to.match(/already in use|already initialized|0x0/i);
      }
    });
  });

  describe("pay_direct", () => {
    it("agent pays within per-tx and daily limit", async () => {
      const ctx = await setupWallet();
      const amount = new BN(20_000_000);

      await payDirect(ctx, amount, recipientOwner.publicKey, recipientAta);

      const policyAccount = await policyRegistryProgram.account.policyAccount.fetch(
        ctx.policy
      );
      expect(policyAccount.dailySpent.toNumber()).to.equal(amount.toNumber());
    });

    it("rejects payment over per-tx limit", async () => {
      const ctx = await setupWallet({ perTxLimit: new BN(10_000_000) });
      try {
        await payDirect(ctx, new BN(20_000_000), recipientOwner.publicKey, recipientAta);
        assert.fail("expected ExceedsPerTxLimit");
      } catch (err: any) {
        expect(err.toString()).to.match(/ExceedsPerTxLimit/);
      }
    });

    it("rejects payment over approval_threshold (must use request_payment)", async () => {
      const ctx = await setupWallet({
        approvalThreshold: new BN(10_000_000),
        perTxLimit: new BN(100_000_000),
      });
      try {
        await payDirect(ctx, new BN(50_000_000), recipientOwner.publicKey, recipientAta);
        assert.fail("expected requires-approval rejection");
      } catch (err: any) {
        expect(err.toString()).to.match(/ExceedsPerTxLimit|RequiresApproval/);
      }
    });

    it("rejects payment to non-allowlisted recipient", async () => {
      const ctx = await setupWallet({
        recipientAllowlist: [Keypair.generate().publicKey],
      });
      try {
        await payDirect(ctx, new BN(20_000_000), recipientOwner.publicKey, recipientAta);
        assert.fail("expected RecipientNotAllowed");
      } catch (err: any) {
        expect(err.toString()).to.match(/RecipientNotAllowed/);
      }
    });

    it("rejects payment when daily total would exceed daily limit", async () => {
      const ctx = await setupWallet({
        dailyLimit: new BN(30_000_000),
        perTxLimit: new BN(20_000_000),
      });
      await payDirect(ctx, new BN(20_000_000), recipientOwner.publicKey, recipientAta);
      try {
        await payDirect(ctx, new BN(15_000_000), recipientOwner.publicKey, recipientAta);
        assert.fail("expected ExceedsDailyLimit");
      } catch (err: any) {
        expect(err.toString()).to.match(/ExceedsDailyLimit/);
      }
    });

    it("rejects payment from non-agent signer", async () => {
      const ctx = await setupWallet();
      const intruder = Keypair.generate();
      await fundAccount(intruder.publicKey, 1);
      try {
        await agentWalletProgram.methods
          .payDirect(recipientOwner.publicKey, new BN(20_000_000), Array(32).fill(0) as any)
          .accountsPartial({
            wallet: ctx.wallet,
            agent: intruder.publicKey,
            policy: ctx.policy,
            mint,
            sourceTokenAccount: ctx.walletAta,
            recipientTokenAccount: recipientAta,
            policyProgram: policyRegistryProgram.programId,
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .signers([intruder])
          .rpc();
        assert.fail("expected NotActiveAgent");
      } catch (err: any) {
        expect(err.toString()).to.match(/NotActiveAgent/);
      }
    });

    it("rejects payment after agent revocation", async () => {
      const ctx = await setupWallet();
      await agentWalletProgram.methods
        .revokeAgent()
        .accountsPartial({ wallet: ctx.wallet, owner: ctx.owner.publicKey })
        .signers([ctx.owner])
        .rpc();
      try {
        await payDirect(ctx, new BN(20_000_000), recipientOwner.publicKey, recipientAta);
        assert.fail("expected AgentRevoked");
      } catch (err: any) {
        expect(err.toString()).to.match(/AgentRevoked/);
      }
    });
  });

  describe("request_payment + approve_and_execute", () => {
    it("agent requests, owner approves, transfer executes", async () => {
      const ctx = await setupWallet({
        approvalThreshold: new BN(10_000_000),
        perTxLimit: new BN(100_000_000),
      });
      const amount = new BN(50_000_000);
      const memo = Array(32).fill(0);

      const { request, id } = await nextRequestPda(ctx);

      await agentWalletProgram.methods
        .requestPayment(recipientOwner.publicKey, mint, amount, memo as any)
        .accountsPartial({
          wallet: ctx.wallet,
          agent: ctx.agent.publicKey,
          policy: ctx.policy,
          queue: ctx.queue,
          request,
          payer: ctx.owner.publicKey,
          queueProgram: approvalQueueProgram.programId,
          systemProgram: SystemProgram.programId,
        })
        .signers([ctx.agent, ctx.owner])
        .rpc();

      const reqBefore = await approvalQueueProgram.account.requestAccount.fetch(
        request
      );
      expect(reqBefore.amount.toNumber()).to.equal(amount.toNumber());

      await agentWalletProgram.methods
        .approveAndExecute()
        .accountsPartial({
          wallet: ctx.wallet,
          owner: ctx.owner.publicKey,
          policy: ctx.policy,
          queue: ctx.queue,
          request,
          mint,
          sourceTokenAccount: ctx.walletAta,
          recipientTokenAccount: recipientAta,
          policyProgram: policyRegistryProgram.programId,
          queueProgram: approvalQueueProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([ctx.owner])
        .rpc();

      const reqAfter = await approvalQueueProgram.account.requestAccount.fetch(
        request
      );
      expect(reqAfter.status).to.deep.equal({ approved: {} });

      const policyAccount = await policyRegistryProgram.account.policyAccount.fetch(
        ctx.policy
      );
      expect(policyAccount.dailySpent.toNumber()).to.equal(amount.toNumber());
    });

    it("owner can deny a pending request", async () => {
      const ctx = await setupWallet({
        approvalThreshold: new BN(10_000_000),
        perTxLimit: new BN(100_000_000),
      });
      const memo = Array(32).fill(0);

      const { request } = await nextRequestPda(ctx);

      await agentWalletProgram.methods
        .requestPayment(
          recipientOwner.publicKey,
          mint,
          new BN(50_000_000),
          memo as any
        )
        .accountsPartial({
          wallet: ctx.wallet,
          agent: ctx.agent.publicKey,
          policy: ctx.policy,
          queue: ctx.queue,
          request,
          payer: ctx.owner.publicKey,
          queueProgram: approvalQueueProgram.programId,
          systemProgram: SystemProgram.programId,
        })
        .signers([ctx.agent, ctx.owner])
        .rpc();

      await agentWalletProgram.methods
        .denyRequest()
        .accountsPartial({
          wallet: ctx.wallet,
          owner: ctx.owner.publicKey,
          queue: ctx.queue,
          request,
          queueProgram: approvalQueueProgram.programId,
        })
        .signers([ctx.owner])
        .rpc();

      const reqAfter = await approvalQueueProgram.account.requestAccount.fetch(
        request
      );
      expect(reqAfter.status).to.deep.equal({ denied: {} });
    });
  });

  describe("agent management", () => {
    it("owner can rotate agent", async () => {
      const ctx = await setupWallet();
      const newAgent = Keypair.generate();

      await agentWalletProgram.methods
        .setAgent(newAgent.publicKey)
        .accountsPartial({ wallet: ctx.wallet, owner: ctx.owner.publicKey })
        .signers([ctx.owner])
        .rpc();

      const walletAccount = await agentWalletProgram.account.walletAccount.fetch(
        ctx.wallet
      );
      expect(walletAccount.agent.toBase58()).to.equal(
        newAgent.publicKey.toBase58()
      );
      expect(walletAccount.agentActive).to.equal(true);
    });
  });

  describe("emergency_withdraw", () => {
    it("owner withdraws full balance to their ATA", async () => {
      const ctx = await setupWallet({}, BigInt(200_000_000));
      const ownerAta = await createAssociatedTokenAccount(
        provider.connection,
        payer,
        mint,
        ctx.owner.publicKey
      );

      await agentWalletProgram.methods
        .emergencyWithdraw()
        .accountsPartial({
          wallet: ctx.wallet,
          owner: ctx.owner.publicKey,
          mint,
          sourceTokenAccount: ctx.walletAta,
          ownerTokenAccount: ownerAta,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([ctx.owner])
        .rpc();

      const ownerBalance = await provider.connection.getTokenAccountBalance(
        ownerAta
      );
      expect(Number(ownerBalance.value.amount)).to.equal(200_000_000);
    });
  });
});

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
