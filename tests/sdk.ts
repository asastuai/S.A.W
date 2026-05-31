import * as anchor from "@coral-xyz/anchor";
import { BN } from "@coral-xyz/anchor";
import {
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
} from "@solana/web3.js";
import {
  createMint,
  createAssociatedTokenAccount,
  mintTo,
} from "@solana/spl-token";
import { expect } from "chai";

import {
  SawClient,
  buildPolicy,
  evaluatePolicyOffChain,
  randomSalt,
} from "../sdk/src";

describe("SAW SDK", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const payer = (provider.wallet as anchor.Wallet).payer;
  const client = new SawClient(provider);

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
    const sig = await provider.connection.requestAirdrop(
      recipientOwner.publicKey,
      LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(sig, "confirmed");

    recipientAta = await createAssociatedTokenAccount(
      provider.connection,
      payer,
      mint,
      recipientOwner.publicKey
    );
  });

  async function setupHandle() {
    const owner = Keypair.generate();
    const agent = Keypair.generate();

    for (const kp of [owner, agent]) {
      const sig = await provider.connection.requestAirdrop(
        kp.publicKey,
        2 * LAMPORTS_PER_SOL
      );
      await provider.connection.confirmTransaction(sig, "confirmed");
    }

    const handle = await client.createWallet(
      {
        owner: owner.publicKey,
        agent: agent.publicKey,
        salt: randomSalt(),
        policy: buildPolicy({
          dailyLimit: 1_000_000_000,
          perTxLimit: 100_000_000,
          approvalThreshold: 50_000_000,
          mint,
          // v1.5 #1: pre-authorize the recipient so within-cap pays auto-spend
          // (unlisted recipients now escalate to owner approval).
          recipientAllowlist: [recipientOwner.publicKey],
        }),
      },
      owner
    );

    const walletAta = await createAssociatedTokenAccount(
      provider.connection,
      payer,
      mint,
      handle.walletPda,
      undefined,
      undefined,
      undefined,
      true
    );

    await mintTo(
      provider.connection,
      payer,
      mint,
      walletAta,
      payer.publicKey,
      BigInt(500_000_000)
    );

    return { handle, owner, agent, walletAta };
  }

  it("creates a wallet, exposes state, and lets the agent pay within limits", async () => {
    const { handle, agent, walletAta } = await setupHandle();

    expect(handle.isAgentActive).to.equal(true);
    expect(handle.agent.toBase58()).to.equal(agent.publicKey.toBase58());

    const policy = await handle.fetchPolicy();
    expect(policy.dailyLimit.toNumber()).to.equal(1_000_000_000);

    await handle.pay(
      {
        to: recipientOwner.publicKey,
        mint,
        amount: new BN(20_000_000),
      },
      agent,
      walletAta,
      recipientAta
    );

    const refreshedPolicy = await handle.fetchPolicy();
    expect(refreshedPolicy.dailySpent.toNumber()).to.equal(20_000_000);
  });

  it("agent requests, owner approves and executes", async () => {
    const { handle, owner, agent, walletAta } = await setupHandle();

    const { requestId } = await handle.requestPayment(
      {
        to: recipientOwner.publicKey,
        mint,
        amount: new BN(75_000_000),
      },
      agent,
      owner
    );

    const pending = await handle.fetchPendingRequests();
    expect(pending.length).to.equal(1);
    expect(pending[0].id.toString()).to.equal(requestId.toString());

    await handle.approveAndExecute(
      requestId,
      owner,
      walletAta,
      recipientAta,
      mint
    );

    const queue = await handle.fetchQueue();
    expect(queue.pendingCount).to.equal(0);
  });

  it("owner can rotate and revoke agent", async () => {
    const { handle, owner } = await setupHandle();
    const newAgent = Keypair.generate();

    await handle.rotateAgent(newAgent.publicKey, owner);
    expect(handle.agent.toBase58()).to.equal(newAgent.publicKey.toBase58());

    await handle.revokeAgent(owner);
    expect(handle.isAgentActive).to.equal(false);
  });

  it("evaluates policy off-chain consistently with on-chain", async () => {
    const { handle } = await setupHandle();
    const policy = await handle.fetchPolicy();

    const allowed = evaluatePolicyOffChain(
      policy,
      recipientOwner.publicKey,
      mint,
      new BN(20_000_000),
      Math.floor(Date.now() / 1000)
    );
    expect(allowed.kind).to.equal("allowed");

    const requiresApproval = evaluatePolicyOffChain(
      policy,
      recipientOwner.publicKey,
      mint,
      new BN(75_000_000),
      Math.floor(Date.now() / 1000)
    );
    expect(requiresApproval.kind).to.equal("requires_approval");

    const denied = evaluatePolicyOffChain(
      policy,
      recipientOwner.publicKey,
      mint,
      new BN(150_000_000),
      Math.floor(Date.now() / 1000)
    );
    expect(denied.kind).to.equal("denied");
    if (denied.kind === "denied") {
      expect(denied.reason).to.equal("ExceedsPerTxLimit");
    }
  });
});
