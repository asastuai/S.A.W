"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import {
  AnchorProvider,
  BN,
  Wallet as AnchorWallet,
} from "@coral-xyz/anchor";
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  MINT_SIZE,
  createInitializeMint2Instruction,
  createAssociatedTokenAccountInstruction,
  createMintToInstruction,
  getAssociatedTokenAddressSync,
  getMinimumBalanceForRentExemptMint,
} from "@solana/spl-token";
import {
  buildPolicy,
  derivePolicyPda,
  deriveQueuePda,
  deriveWalletPda,
  RequestStatus,
  SawClient,
  WalletHandle,
} from "@asastuai/saw-sdk";

import {
  DEMO_DECIMALS,
  clearSetup,
  loadOrCreateAgent,
  loadOrCreateRecipient,
  loadSetup,
  saveSetup,
} from "@/lib/saw";

type LogEntry = {
  ts: number;
  tone: "info" | "success" | "warn" | "error";
  text: string;
  sig?: string;
};

export default function DemoPage() {
  const { connection } = useConnection();
  const wallet = useWallet();
  const [phase, setPhase] = useState<"idle" | "configuring" | "ready">("idle");
  const [busy, setBusy] = useState<string | null>(null);
  const [handle, setHandle] = useState<WalletHandle | null>(null);
  const [setup, setSetupState] = useState<{
    walletPda: PublicKey;
    walletAta: PublicKey;
    recipient: Keypair;
    recipientAta: PublicKey;
    mint: PublicKey;
    agent: Keypair;
  } | null>(null);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [policySnapshot, setPolicySnapshot] = useState<{
    dailyLimit: number;
    perTxLimit: number;
    approvalThreshold: number;
    dailySpent: number;
  } | null>(null);
  const [pending, setPending] = useState<
    { id: BN; amount: number; status: RequestStatus }[]
  >([]);
  const [walletBalance, setWalletBalance] = useState<number>(0);

  const sawClient = useMemo<SawClient | null>(() => {
    if (!wallet.publicKey || !wallet.signTransaction) return null;
    const anchorWallet: AnchorWallet = {
      publicKey: wallet.publicKey,
      signTransaction: wallet.signTransaction as any,
      signAllTransactions: wallet.signAllTransactions as any,
      payer: undefined as any,
    };
    const provider = new AnchorProvider(connection, anchorWallet, {
      commitment: "confirmed",
    });
    return new SawClient(provider);
  }, [connection, wallet.publicKey, wallet.signTransaction]);

  const handler = wallet.publicKey;

  function pushLog(entry: Omit<LogEntry, "ts">) {
    setLog((l) => [{ ...entry, ts: Date.now() }, ...l].slice(0, 30));
  }

  useEffect(() => {
    if (!handler || !sawClient) return;
    const stored = loadSetup(handler);
    if (!stored) return;

    (async () => {
      try {
        const walletPda = new PublicKey(stored.walletPda);
        const handle = await sawClient.loadWallet(walletPda);
        const agent = loadOrCreateAgent(handler);
        const recipient = loadOrCreateRecipient(handler);
        setHandle(handle);
        setSetupState({
          walletPda,
          walletAta: new PublicKey(stored.walletAta),
          recipient,
          recipientAta: new PublicKey(stored.recipientAta),
          mint: new PublicKey(stored.mint),
          agent,
        });
        setPhase("ready");
        await refreshState(handle, new PublicKey(stored.walletAta));
      } catch (e: any) {
        pushLog({ tone: "warn", text: `Could not restore previous mission: ${e.message}` });
        clearSetup(handler);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handler?.toBase58()]);

  async function refreshState(h: WalletHandle, walletAta: PublicKey) {
    try {
      const policy = await h.fetchPolicy();
      setPolicySnapshot({
        dailyLimit: policy.dailyLimit.toNumber(),
        perTxLimit: policy.perTxLimit.toNumber(),
        approvalThreshold: policy.approvalThreshold.toNumber(),
        dailySpent: policy.dailySpent.toNumber(),
      });
      const pendingReqs = await h.fetchPendingRequests();
      setPending(
        pendingReqs.map((r) => ({
          id: r.id,
          amount: r.amount.toNumber(),
          status: r.status,
        }))
      );
      const ata = await connection.getTokenAccountBalance(walletAta).catch(() => null);
      setWalletBalance(Number(ata?.value.amount ?? 0));
      await h.refresh();
    } catch (e: any) {
      pushLog({ tone: "error", text: `refresh failed: ${e.message}` });
    }
  }

  async function spawnAgent() {
    if (!sawClient || !handler || !wallet.signTransaction) return;
    setBusy("Initializing wallet, mint, and agent…");
    try {
      const agent = loadOrCreateAgent(handler);
      const recipient = loadOrCreateRecipient(handler);
      const salt = new Uint8Array(32);
      crypto.getRandomValues(salt);
      const saltBuf = Buffer.from(salt);

      const policy = buildPolicy({
        dailyLimit: 1_000_000_000, // 1000 TEST
        perTxLimit: 100_000_000, //   100 TEST
        approvalThreshold: 50_000_000, // 50 TEST
        cooldownSeconds: 0,
      });

      const [walletPda] = deriveWalletPda(handler, saltBuf);

      // ── Create test mint (handler is the mint authority) ──────────
      const mintKp = Keypair.generate();
      const mintRent = await getMinimumBalanceForRentExemptMint(connection);
      const walletAta = getAssociatedTokenAddressSync(
        mintKp.publicKey,
        walletPda,
        true
      );
      const recipientAta = getAssociatedTokenAddressSync(
        mintKp.publicKey,
        recipient.publicKey
      );

      const setupTx = new Transaction()
        .add(
          SystemProgram.createAccount({
            fromPubkey: handler,
            newAccountPubkey: mintKp.publicKey,
            lamports: mintRent,
            space: MINT_SIZE,
            programId: TOKEN_PROGRAM_ID,
          })
        )
        .add(
          createInitializeMint2Instruction(
            mintKp.publicKey,
            DEMO_DECIMALS,
            handler,
            null
          )
        );
      setupTx.feePayer = handler;
      setupTx.recentBlockhash = (
        await connection.getLatestBlockhash()
      ).blockhash;
      setupTx.partialSign(mintKp);
      const signedSetup = await wallet.signTransaction(setupTx);
      const setupSig = await connection.sendRawTransaction(
        signedSetup.serialize()
      );
      await connection.confirmTransaction(setupSig, "confirmed");
      pushLog({
        tone: "success",
        text: `Test mint deployed (${mintKp.publicKey.toBase58().slice(0, 8)}…)`,
        sig: setupSig,
      });

      // ── Initialize wallet via SDK (handler signs as owner) ────────
      // SDK expects an owner Signer. Phantom signs differently — we wrap
      // the Phantom flow into a programatic instruction below.
      const ix = await sawClient.programs.agentWallet.methods
        .initializeWallet(
          Array.from(saltBuf),
          agent.publicKey,
          policy as any
        )
        .accountsPartial({
          wallet: walletPda,
          owner: handler,
          policy: derivePolicyPda(walletPda)[0],
          queue: deriveQueuePda(walletPda)[0],
          policyProgram: sawClient.programs.policyRegistry.programId,
          queueProgram: sawClient.programs.approvalQueue.programId,
          systemProgram: SystemProgram.programId,
        })
        .instruction();

      const initTx = new Transaction().add(ix);
      initTx.feePayer = handler;
      initTx.recentBlockhash = (
        await connection.getLatestBlockhash()
      ).blockhash;
      const signedInit = await wallet.signTransaction(initTx);
      const initSig = await connection.sendRawTransaction(
        signedInit.serialize()
      );
      await connection.confirmTransaction(initSig, "confirmed");
      pushLog({
        tone: "success",
        text: "Wallet briefed. Policy and queue registered.",
        sig: initSig,
      });

      // ── Create ATAs + mint test funds + fund agent with SOL for fees ──
      const fundTx = new Transaction()
        .add(
          SystemProgram.transfer({
            fromPubkey: handler,
            toPubkey: agent.publicKey,
            lamports: 0.05 * LAMPORTS_PER_SOL,
          })
        )
        .add(
          createAssociatedTokenAccountInstruction(
            handler,
            walletAta,
            walletPda,
            mintKp.publicKey
          )
        )
        .add(
          createAssociatedTokenAccountInstruction(
            handler,
            recipientAta,
            recipient.publicKey,
            mintKp.publicKey
          )
        )
        .add(
          createMintToInstruction(
            mintKp.publicKey,
            walletAta,
            handler,
            BigInt(500_000_000) // 500 TEST
          )
        );
      fundTx.feePayer = handler;
      fundTx.recentBlockhash = (
        await connection.getLatestBlockhash()
      ).blockhash;
      const signedFund = await wallet.signTransaction(fundTx);
      const fundSig = await connection.sendRawTransaction(
        signedFund.serialize()
      );
      await connection.confirmTransaction(fundSig, "confirmed");
      pushLog({
        tone: "success",
        text: "Mission funded with 500 TEST.",
        sig: fundSig,
      });

      const handle = await sawClient.loadWallet(walletPda);
      const newSetup = {
        walletPda,
        walletAta,
        recipient,
        recipientAta,
        mint: mintKp.publicKey,
        agent,
      };
      setHandle(handle);
      setSetupState(newSetup);
      saveSetup(handler, newSetup, saltBuf);
      setPhase("ready");
      await refreshState(handle, walletAta);
    } catch (e: any) {
      pushLog({ tone: "error", text: e.message ?? String(e) });
    } finally {
      setBusy(null);
    }
  }

  async function executePay(amount: number) {
    if (!handle || !setup) return;
    setBusy(`Agent attempting to pay ${amount / 10 ** DEMO_DECIMALS} TEST…`);
    try {
      if (amount > (policySnapshot?.approvalThreshold ?? 0)) {
        const result = await handle.requestPayment(
          {
            to: setup.recipient.publicKey,
            mint: setup.mint,
            amount: new BN(amount),
          },
          setup.agent,
          // payer must sign — but Phantom wraps signing. For demo, agent pays rent.
          setup.agent
        );
        pushLog({
          tone: "warn",
          text: `Over threshold. Request #${result.requestId.toString()} queued for handler.`,
          sig: result.tx,
        });
      } else {
        const sig = await handle.pay(
          {
            to: setup.recipient.publicKey,
            mint: setup.mint,
            amount: new BN(amount),
          },
          setup.agent,
          setup.walletAta,
          setup.recipientAta
        );
        pushLog({
          tone: "success",
          text: `Agent paid ${amount / 10 ** DEMO_DECIMALS} TEST autonomously.`,
          sig,
        });
      }
      await refreshState(handle, setup.walletAta);
    } catch (e: any) {
      pushLog({ tone: "error", text: e.message ?? String(e) });
    } finally {
      setBusy(null);
    }
  }

  async function approveRequest(id: BN) {
    if (!handle || !setup || !wallet.publicKey || !wallet.signTransaction) return;
    setBusy(`Approving request #${id.toString()}…`);
    try {
      const ix = await sawClient!.programs.agentWallet.methods
        .approveAndExecute()
        .accountsPartial({
          wallet: setup.walletPda,
          owner: wallet.publicKey,
          policy: handle.policyPda(),
          queue: handle.queuePda(),
          request: handle.requestPda(id),
          mint: setup.mint,
          sourceTokenAccount: setup.walletAta,
          recipientTokenAccount: setup.recipientAta,
          policyProgram: sawClient!.programs.policyRegistry.programId,
          queueProgram: sawClient!.programs.approvalQueue.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .instruction();
      const tx = new Transaction().add(ix);
      tx.feePayer = wallet.publicKey;
      tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
      const signed = await wallet.signTransaction(tx);
      const sig = await connection.sendRawTransaction(signed.serialize());
      await connection.confirmTransaction(sig, "confirmed");
      pushLog({
        tone: "success",
        text: `Handler approved request #${id.toString()}.`,
        sig,
      });
      await refreshState(handle, setup.walletAta);
    } catch (e: any) {
      pushLog({ tone: "error", text: e.message ?? String(e) });
    } finally {
      setBusy(null);
    }
  }

  async function denyReq(id: BN) {
    if (!handle || !setup || !wallet.publicKey || !wallet.signTransaction) return;
    setBusy(`Denying request #${id.toString()}…`);
    try {
      const ix = await sawClient!.programs.agentWallet.methods
        .denyRequest()
        .accountsPartial({
          wallet: setup.walletPda,
          owner: wallet.publicKey,
          queue: handle.queuePda(),
          request: handle.requestPda(id),
          queueProgram: sawClient!.programs.approvalQueue.programId,
        })
        .instruction();
      const tx = new Transaction().add(ix);
      tx.feePayer = wallet.publicKey;
      tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
      const signed = await wallet.signTransaction(tx);
      const sig = await connection.sendRawTransaction(signed.serialize());
      await connection.confirmTransaction(sig, "confirmed");
      pushLog({
        tone: "warn",
        text: `Handler denied request #${id.toString()}.`,
        sig,
      });
      await refreshState(handle, setup.walletAta);
    } catch (e: any) {
      pushLog({ tone: "error", text: e.message ?? String(e) });
    } finally {
      setBusy(null);
    }
  }

  async function revokeAgent() {
    if (!handle || !setup || !wallet.publicKey || !wallet.signTransaction) return;
    setBusy("Revoking agent credentials…");
    try {
      const ix = await sawClient!.programs.agentWallet.methods
        .revokeAgent()
        .accountsPartial({
          wallet: setup.walletPda,
          owner: wallet.publicKey,
        })
        .instruction();
      const tx = new Transaction().add(ix);
      tx.feePayer = wallet.publicKey;
      tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
      const signed = await wallet.signTransaction(tx);
      const sig = await connection.sendRawTransaction(signed.serialize());
      await connection.confirmTransaction(sig, "confirmed");
      pushLog({ tone: "warn", text: "Agent revoked. Cannot transact.", sig });
      await refreshState(handle, setup.walletAta);
    } catch (e: any) {
      pushLog({ tone: "error", text: e.message ?? String(e) });
    } finally {
      setBusy(null);
    }
  }

  function reset() {
    if (!handler) return;
    clearSetup(handler);
    setHandle(null);
    setSetupState(null);
    setPolicySnapshot(null);
    setPending([]);
    setLog([]);
    setPhase("idle");
  }

  return (
    <main className="min-h-screen">
      <header className="border-b border-ash px-6 py-4 flex items-center justify-between">
        <Link href="/" className="font-display text-2xl tracking-widest">
          S A W
        </Link>
        <div className="flex items-center gap-4">
          {phase === "ready" && (
            <button
              onClick={reset}
              className="text-xs uppercase tracking-widest text-bone/40 hover:text-rust"
            >
              Burn the dossier
            </button>
          )}
          <WalletMultiButton />
        </div>
      </header>

      <section className="px-6 py-12 max-w-6xl mx-auto">
        {!wallet.connected ? (
          <Idle />
        ) : phase === "idle" ? (
          <ConfigureCta busy={busy} onSpawn={spawnAgent} />
        ) : (
          <Operate
            handle={handle!}
            setup={setup!}
            policy={policySnapshot}
            pending={pending}
            balance={walletBalance}
            log={log}
            busy={busy}
            onPay={executePay}
            onApprove={approveRequest}
            onDeny={denyReq}
            onRevoke={revokeAgent}
          />
        )}
      </section>
    </main>
  );
}

function Idle() {
  return (
    <div className="border border-ash p-12 text-center">
      <p className="stamp mb-6">Awaiting handler</p>
      <h2 className="font-display text-4xl mb-4">
        Connect your Phantom (devnet).
      </h2>
      <p className="text-bone/60 max-w-xl mx-auto">
        You are about to spawn an autonomous operative bound by an on-chain
        policy. Connect the wallet that will sign as handler.
      </p>
    </div>
  );
}

function ConfigureCta({
  busy,
  onSpawn,
}: {
  busy: string | null;
  onSpawn: () => void;
}) {
  return (
    <div className="grid md:grid-cols-2 gap-12">
      <div>
        <p className="stamp mb-6">Mission brief</p>
        <h2 className="font-display text-4xl mb-6">
          Default operating parameters.
        </h2>
        <ul className="space-y-3 text-bone/80">
          <li>
            <span className="text-gold mr-2">›</span> Daily limit:{" "}
            <span className="text-bone">1000 TEST</span>
          </li>
          <li>
            <span className="text-gold mr-2">›</span> Per-tx limit:{" "}
            <span className="text-bone">100 TEST</span>
          </li>
          <li>
            <span className="text-gold mr-2">›</span> Approval threshold:{" "}
            <span className="text-bone">50 TEST</span>
          </li>
          <li>
            <span className="text-gold mr-2">›</span> Initial fund:{" "}
            <span className="text-bone">500 TEST</span> (devnet test mint)
          </li>
        </ul>
      </div>
      <div className="border border-ash p-8 flex flex-col">
        <p className="text-sm text-bone/60 mb-6">
          We will deploy a fresh test mint, initialize the agent wallet PDA,
          register a policy and approval queue, and fund the wallet — all with
          your handler signature.
        </p>
        <button
          disabled={!!busy}
          onClick={onSpawn}
          className="bg-gold text-ink px-6 py-4 uppercase tracking-widest text-sm hover:bg-bone disabled:opacity-50 disabled:cursor-not-allowed transition"
        >
          {busy ?? "Spawn the agent →"}
        </button>
      </div>
    </div>
  );
}

function Operate({
  handle,
  setup,
  policy,
  pending,
  balance,
  log,
  busy,
  onPay,
  onApprove,
  onDeny,
  onRevoke,
}: any) {
  const fmt = (n: number) =>
    `${(n / 10 ** DEMO_DECIMALS).toLocaleString()} TEST`;
  return (
    <div className="space-y-8">
      <div className="grid md:grid-cols-3 gap-px bg-ash">
        <Stat
          label="Wallet balance"
          value={fmt(balance)}
          sub={short(setup.walletPda)}
        />
        <Stat
          label="Daily spent"
          value={policy ? fmt(policy.dailySpent) : "—"}
          sub={policy ? `of ${fmt(policy.dailyLimit)}` : ""}
        />
        <Stat
          label="Agent"
          value={handle.isAgentActive ? "ACTIVE" : "REVOKED"}
          sub={short(setup.agent.publicKey)}
          tone={handle.isAgentActive ? "ok" : "warn"}
        />
      </div>

      <div className="grid md:grid-cols-2 gap-8">
        <Panel title="Agent operations">
          <p className="text-sm text-bone/60 mb-4">
            The agent attempts a payment. The protocol decides:
          </p>
          <div className="space-y-3">
            <PayButton
              amount={10_000_000}
              label="Pay 10 TEST"
              note="autonomous (under threshold)"
              onClick={() => onPay(10_000_000)}
              disabled={!!busy || !handle.isAgentActive}
            />
            <PayButton
              amount={40_000_000}
              label="Pay 40 TEST"
              note="autonomous (under threshold)"
              onClick={() => onPay(40_000_000)}
              disabled={!!busy || !handle.isAgentActive}
            />
            <PayButton
              amount={80_000_000}
              label="Pay 80 TEST"
              note="queues for handler approval"
              onClick={() => onPay(80_000_000)}
              disabled={!!busy || !handle.isAgentActive}
              warn
            />
          </div>
        </Panel>

        <Panel title="Handler controls">
          <div className="space-y-4">
            <div>
              <p className="text-sm uppercase tracking-widest text-bone/60 mb-2">
                Pending requests
              </p>
              {pending.length === 0 ? (
                <p className="text-bone/40 text-sm italic">
                  No requests on the desk.
                </p>
              ) : (
                <div className="space-y-2">
                  {pending.map((r: { id: BN; amount: number; status: RequestStatus }) => (
                    <div
                      key={r.id.toString()}
                      className="border border-ash p-3 flex items-center justify-between"
                    >
                      <div>
                        <div className="text-bone">
                          #{r.id.toString()} · {fmt(r.amount)}
                        </div>
                        <div className="text-xs text-bone/50">
                          status: {r.status}
                        </div>
                      </div>
                      {r.status === RequestStatus.Pending && (
                        <div className="flex gap-2">
                          <button
                            onClick={() => onApprove(r.id)}
                            disabled={!!busy}
                            className="text-xs uppercase tracking-widest border border-gold text-gold px-2 py-1 hover:bg-gold hover:text-ink"
                          >
                            Approve
                          </button>
                          <button
                            onClick={() => onDeny(r.id)}
                            disabled={!!busy}
                            className="text-xs uppercase tracking-widest border border-rust text-rust px-2 py-1 hover:bg-rust hover:text-bone"
                          >
                            Deny
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="pt-4 border-t border-ash">
              <button
                onClick={onRevoke}
                disabled={!!busy || !handle.isAgentActive}
                className="text-sm uppercase tracking-widest border border-rust text-rust px-4 py-2 hover:bg-rust hover:text-bone disabled:opacity-30"
              >
                Revoke agent
              </button>
            </div>
          </div>
        </Panel>
      </div>

      <Panel title="Activity log">
        {log.length === 0 ? (
          <p className="text-bone/40 italic text-sm">Channel quiet.</p>
        ) : (
          <ul className="space-y-2 max-h-96 overflow-y-auto">
            {log.map((e: LogEntry, i: number) => (
              <li
                key={i}
                className={`text-sm border-l-2 pl-3 py-1 ${
                  e.tone === "success"
                    ? "border-gold text-bone"
                    : e.tone === "warn"
                    ? "border-rust text-bone/90"
                    : e.tone === "error"
                    ? "border-rust text-rust"
                    : "border-bone/30 text-bone/70"
                }`}
              >
                <span className="text-bone/40 mr-2">
                  {new Date(e.ts).toLocaleTimeString()}
                </span>
                {e.text}
                {e.sig && (
                  <a
                    href={`https://explorer.solana.com/tx/${e.sig}?cluster=devnet`}
                    target="_blank"
                    rel="noreferrer"
                    className="ml-2 text-gold/70 hover:text-gold underline-offset-2 hover:underline text-xs"
                  >
                    sig ↗
                  </a>
                )}
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}

function Panel({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border border-ash p-6">
      <h3 className="text-sm uppercase tracking-widest text-gold mb-4">
        {title}
      </h3>
      {children}
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "ok" | "warn";
}) {
  return (
    <div className="bg-ink p-6">
      <div className="text-xs uppercase tracking-widest text-bone/50 mb-2">
        {label}
      </div>
      <div
        className={`font-display text-3xl ${
          tone === "warn" ? "text-rust" : tone === "ok" ? "text-gold" : ""
        }`}
      >
        {value}
      </div>
      {sub && <div className="text-xs text-bone/40 mt-1">{sub}</div>}
    </div>
  );
}

function PayButton({
  label,
  note,
  onClick,
  disabled,
  warn,
}: {
  amount: number;
  label: string;
  note: string;
  onClick: () => void;
  disabled?: boolean;
  warn?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`w-full text-left p-3 border ${
        warn ? "border-rust/50" : "border-ash"
      } hover:border-gold disabled:opacity-30 disabled:cursor-not-allowed transition`}
    >
      <div className="flex justify-between items-center">
        <div>
          <div className="text-bone">{label}</div>
          <div className="text-xs text-bone/40">{note}</div>
        </div>
        <span className="text-gold text-sm">→</span>
      </div>
    </button>
  );
}

function short(p: PublicKey | undefined) {
  if (!p) return "";
  const s = p.toBase58();
  return `${s.slice(0, 4)}…${s.slice(-4)}`;
}
