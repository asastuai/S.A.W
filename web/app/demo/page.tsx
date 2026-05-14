"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { WalletButton } from "@/components/wallet-button";
import {
  AnchorProvider,
  BN,
  Wallet as AnchorWallet,
} from "@coral-xyz/anchor";
import {
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
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
import { PERSONAS, Persona, getPersona } from "@/lib/personas";
import {
  Briefing,
  Opportunity,
  ScheduleItem,
  clearBriefing,
  describeTrigger,
  loadBriefing,
  newItem,
  newMessage,
  nextDueItem,
  nextUpcoming,
  pendingOpportunities,
  saveBriefing,
} from "@/lib/schedule";
import type { MarketSnapshot } from "@/lib/market";
import { OpportunityReel } from "@/components/opportunity-reel";
import { Mascot, MascotPose } from "@/components/mascot";
import { Chat } from "@/components/chat";
import { ScheduleView } from "@/components/schedule-view";
import { ApiKeyModal } from "@/components/api-key-modal";
import { clearApiKey, loadApiKey, saveApiKey } from "@/lib/api-key";

type Phase = "pick" | "setup" | "briefing" | "live";

type Setup = {
  walletPda: PublicKey;
  walletAta: PublicKey;
  recipient: Keypair;
  recipientAta: PublicKey;
  mint: PublicKey;
  agent: Keypair;
};

const fmt = (n: number) =>
  `${(n / 10 ** DEMO_DECIMALS).toLocaleString(undefined, {
    maximumFractionDigits: 2,
  })} TEST`;

export default function DemoPage() {
  const { connection } = useConnection();
  const wallet = useWallet();
  const [persona, setPersona] = useState<Persona | null>(null);
  const [phase, setPhase] = useState<Phase>("pick");
  const [setupStep, setSetupStep] = useState<string>("");
  const [setup, setSetup] = useState<Setup | null>(null);
  const [handle, setHandle] = useState<WalletHandle | null>(null);
  const [briefing, setBriefing] = useState<Briefing | null>(null);
  const [walletBalance, setWalletBalance] = useState<number>(0);
  const [dailySpent, setDailySpent] = useState<number>(0);
  const [chatBusy, setChatBusy] = useState<boolean>(false);
  const [pendingApproval, setPendingApproval] = useState<{
    requestId: BN;
    itemId: string;
    amount: number;
    vendor: string;
    reason: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState<number>(Date.now());
  const [mascotPose, setMascotPose] = useState<MascotPose>("idle");
  const [marketSnap, setMarketSnap] = useState<MarketSnapshot | null>(null);
  const [scanning, setScanning] = useState<boolean>(false);
  const [apiKey, setApiKeyState] = useState<string | null>(null);
  const [showApiKeyModal, setShowApiKeyModal] = useState<boolean>(false);
  const executingRef = useRef<boolean>(false);
  const briefingRef = useRef<Briefing | null>(null);

  // Load saved API key on mount
  useEffect(() => {
    setApiKeyState(loadApiKey());
  }, []);


  function handleSaveKey(key: string) {
    saveApiKey(key);
    setApiKeyState(key);
  }
  function handleClearKey() {
    clearApiKey();
    setApiKeyState(null);
  }
  useEffect(() => {
    briefingRef.current = briefing;
  }, [briefing]);
  const mascotIdleTimerRef = useRef<NodeJS.Timeout | null>(null);

  const prices: Record<string, number> = useMemo(() => {
    if (!marketSnap) return {};
    return { [marketSnap.asset]: marketSnap.priceUsd };
  }, [marketSnap]);

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

  // Tick clock for countdowns
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // Sweep expired items + opportunities every 5s
  useEffect(() => {
    if (!handler) return;
    const id = setInterval(() => {
      const current = briefingRef.current;
      if (!current) return;
      const ts = Date.now();
      let changed = false;
      const nextSchedule = current.schedule.map((i) => {
        if (i.status !== "queued") return i;
        const t = i.trigger;
        if (t && t.kind !== "time" && t.deadline && ts > t.deadline) {
          changed = true;
          return {
            ...i,
            status: "skipped" as const,
            errorMsg: "Trigger never matched — deadline passed",
          };
        }
        return i;
      });
      const nextOpps = current.opportunities.map((o) => {
        if (o.status !== "pending") return o;
        if (o.expiresAt < ts) {
          changed = true;
          return { ...o, status: "expired" as const };
        }
        return o;
      });
      if (changed) {
        const next = { ...current, schedule: nextSchedule, opportunities: nextOpps };
        setBriefing(next);
        saveBriefing(handler, next);
      }
    }, 5000);
    return () => clearInterval(id);
  }, [handler]);

  // Opportunity scanner (Greedie only — requires API key)
  useEffect(() => {
    if (persona?.id !== "greedie" || !handler) return;
    if (phase !== "briefing" && phase !== "live") return;
    if (!apiKey) return;

    let cancelled = false;

    async function scan() {
      if (cancelled) return;
      const current = briefingRef.current;
      if (!current) return;
      setScanning(true);
      try {
        const pending = pendingOpportunities(current.opportunities, Date.now());
        const dismissed = current.opportunities
          .filter((o) => o.status === "skipped" || o.status === "expired")
          .slice(-8)
          .map((o) => o.title);
        const scheduleSummary = current.schedule
          .slice(0, 6)
          .map(
            (i) =>
              `${i.vendor} · ${(i.amount / 10 ** DEMO_DECIMALS).toFixed(0)} TEST · ${i.status}`
          )
          .join("; ");

        const res = await fetch("/api/agent/scan", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(apiKey ? { "x-user-api-key": apiKey } : {}),
          },
          body: JSON.stringify({
            persona: { ...persona!, walletBalance },
            scheduleSummary,
            dismissedTitles: dismissed,
            pendingTitles: pending.map((o) => o.title),
          }),
        });
        const data = await res.json();
        if (cancelled) return;

        if (data.error) {
          setBriefing((prev) => {
            if (!prev) return prev;
            const last = prev.conversation[prev.conversation.length - 1];
            const errLine = `Scan failed: ${data.error}`;
            if (last && last.role === "system" && last.content === errLine) return prev;
            const next = {
              ...prev,
              conversation: [...prev.conversation, newMessage("system", errLine)],
            };
            if (handler) saveBriefing(handler, next);
            return next;
          });
          return;
        }

        if (!data.opportunities?.length) return;

        setBriefing((prev) => {
          if (!prev) return prev;
          const newOpps: Opportunity[] = data.opportunities.map((o: any) => ({
            id: crypto.randomUUID(),
            ts: Date.now(),
            title: o.title,
            message: o.message,
            suggested: o.suggested,
            confidence: o.confidence,
            expiresAt: o.expiresAt,
            status: "pending" as const,
          }));
          const next = { ...prev, opportunities: [...prev.opportunities, ...newOpps] };
          if (handler) saveBriefing(handler, next);
          return next;
        });
      } catch (e: any) {
        console.error("[scan] failed", e);
      } finally {
        if (!cancelled) setScanning(false);
      }
    }

    const initialDelay = setTimeout(scan, 4000);
    const timer = setInterval(scan, 60_000);

    return () => {
      cancelled = true;
      clearTimeout(initialDelay);
      clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [persona?.id, phase, !!handler, apiKey]);

  function acceptOpportunity(opp: Opportunity) {
    if (!briefing || !handler || !persona) return;
    const maxAmount = Math.min(persona.policy.perTxLimit, walletBalance);
    if (opp.suggested.amount <= 0 || opp.suggested.amount > maxAmount) {
      const updated = {
        ...briefing,
        opportunities: briefing.opportunities.map((o) =>
          o.id === opp.id ? { ...o, status: "skipped" as const } : o
        ),
        conversation: [
          ...briefing.conversation,
          newMessage(
            "system",
            `Couldn't accept "${opp.title}" — amount over policy/balance`
          ),
        ],
      };
      setBriefing(updated);
      saveBriefing(handler, updated);
      return;
    }
    const item = newItem({
      vendor: opp.suggested.vendor,
      amount: opp.suggested.amount,
      reason: opp.suggested.reason,
      scheduledFor: opp.suggested.scheduledFor ?? Date.now(),
      trigger: opp.suggested.trigger,
    });
    const updated = {
      ...briefing,
      schedule: [...briefing.schedule, item],
      opportunities: briefing.opportunities.map((o) =>
        o.id === opp.id ? { ...o, status: "accepted" as const } : o
      ),
    };
    setBriefing(updated);
    saveBriefing(handler, updated);
  }

  function skipOpportunity(opp: Opportunity) {
    if (!briefing || !handler) return;
    const updated = {
      ...briefing,
      opportunities: briefing.opportunities.map((o) =>
        o.id === opp.id ? { ...o, status: "skipped" as const } : o
      ),
    };
    setBriefing(updated);
    saveBriefing(handler, updated);
  }

  // Market price poller (Greedie only)
  useEffect(() => {
    if (persona?.id !== "greedie") return;
    if (phase !== "briefing" && phase !== "live") return;

    let cancelled = false;
    async function poll() {
      try {
        const res = await fetch("/api/market/snapshot?asset=SOL");
        if (!res.ok) return;
        const snap = (await res.json()) as MarketSnapshot;
        if (!cancelled) setMarketSnap(snap);
      } catch (_) {}
    }
    poll();
    const id = setInterval(poll, 30_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [persona?.id, phase]);

  // Restore session
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
        const restored = getPersona(stored.personaId);
        if (!restored) {
          clearSetup(handler);
          return;
        }
        setPersona(restored);
        setHandle(handle);
        setSetup({
          walletPda,
          walletAta: new PublicKey(stored.walletAta),
          recipient,
          recipientAta: new PublicKey(stored.recipientAta),
          mint: new PublicKey(stored.mint),
          agent,
        });
        const savedBriefing = loadBriefing(handler);
        if (savedBriefing) {
          // backward compat: ensure opportunities array exists
          const normalized: Briefing = {
            ...savedBriefing,
            opportunities: savedBriefing.opportunities ?? [],
          };
          setBriefing(normalized);
          setPhase(normalized.ready ? "live" : "briefing");
        } else {
          const fresh = freshBriefing(restored);
          setBriefing(fresh);
          saveBriefing(handler, fresh);
          setPhase("briefing");
        }
        await refreshState(handle, new PublicKey(stored.walletAta));
      } catch (e: any) {
        clearSetup(handler);
        clearBriefing(handler);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handler?.toBase58()]);

  function freshBriefing(p: Persona): Briefing {
    return {
      personaId: p.id,
      schedule: [],
      conversation: [newMessage("agent", p.greeting)],
      opportunities: [],
      ready: false,
    };
  }

  async function refreshState(h: WalletHandle, walletAta: PublicKey) {
    try {
      const policy = await h.fetchPolicy();
      setDailySpent(policy.dailySpent.toNumber());
      const ata = await connection
        .getTokenAccountBalance(walletAta)
        .catch(() => null);
      setWalletBalance(Number(ata?.value.amount ?? 0));
      await h.refresh();
    } catch (_) {}
  }

  async function bootstrap(p: Persona) {
    if (!sawClient || !handler || !wallet.signTransaction) return;
    setPersona(p);
    setPhase("setup");
    setError(null);
    try {
      const agent = loadOrCreateAgent(handler);
      const recipient = loadOrCreateRecipient(handler);
      const salt = new Uint8Array(32);
      crypto.getRandomValues(salt);
      const saltBuf = Buffer.from(salt);

      const policy = buildPolicy(p.policy);
      const [walletPda] = deriveWalletPda(handler, saltBuf);

      setSetupStep("Minting test currency for the dossier…");
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
      setupTx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
      setupTx.partialSign(mintKp);
      const signedSetup = await wallet.signTransaction(setupTx);
      const setupSig = await connection.sendRawTransaction(signedSetup.serialize());
      await connection.confirmTransaction(setupSig, "confirmed");

      setSetupStep(`Briefing ${p.name} with policy parameters…`);
      const ix = await sawClient.programs.agentWallet.methods
        .initializeWallet(Array.from(saltBuf), agent.publicKey, policy as any)
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
      initTx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
      const signedInit = await wallet.signTransaction(initTx);
      const initSig = await connection.sendRawTransaction(signedInit.serialize());
      await connection.confirmTransaction(initSig, "confirmed");

      setSetupStep(`Wiring fuel and ${fmt(p.initialFund)} into the wallet…`);
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
            BigInt(p.initialFund)
          )
        );
      fundTx.feePayer = handler;
      fundTx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
      const signedFund = await wallet.signTransaction(fundTx);
      const fundSig = await connection.sendRawTransaction(signedFund.serialize());
      await connection.confirmTransaction(fundSig, "confirmed");

      const handle = await sawClient.loadWallet(walletPda);
      const newSetup: Setup = {
        walletPda,
        walletAta,
        recipient,
        recipientAta,
        mint: mintKp.publicKey,
        agent,
      };
      setHandle(handle);
      setSetup(newSetup);
      saveSetup(handler, newSetup, saltBuf, p.id);
      const fresh = freshBriefing(p);
      setBriefing(fresh);
      saveBriefing(handler, fresh);
      setSetupStep("");
      setPhase("briefing");
      await refreshState(handle, walletAta);
    } catch (e: any) {
      setError(e.message ?? String(e));
      setPhase("pick");
      setSetupStep("");
    }
  }

  // ── Chat handler ──
  async function sendChat(text: string) {
    if (!persona || !briefing || !handler) return;
    if (!apiKey) {
      setShowApiKeyModal(true);
      return;
    }
    if (mascotIdleTimerRef.current) clearTimeout(mascotIdleTimerRef.current);
    setChatBusy(true);
    setMascotPose("listening");

    const userMsg = newMessage("user", text);
    const optimistic: Briefing = {
      ...briefing,
      conversation: [...briefing.conversation, userMsg],
    };
    setBriefing(optimistic);
    saveBriefing(handler, optimistic);

    try {
      setMascotPose("thinking");
      const res = await fetch("/api/agent/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(apiKey ? { "x-user-api-key": apiKey } : {}),
        },
        body: JSON.stringify({
          persona: { ...persona, walletBalance },
          schedule: optimistic.schedule,
          conversation: optimistic.conversation,
          newMessage: text,
        }),
      });
      const data = (await res.json()) as {
        reply: string;
        actions: Array<
          | { type: "add"; item: { vendor: string; amount: number; scheduledFor: number; reason: string } }
          | { type: "remove"; id: string }
          | { type: "modify"; id: string; changes: any }
          | { type: "ready" }
        >;
      };

      let updated: Briefing = { ...optimistic };
      let ready = updated.ready;
      const skippedReasons: string[] = [];
      const maxAmount = Math.min(persona.policy.perTxLimit, walletBalance);

      for (const action of data.actions ?? []) {
        if (action.type === "add") {
          if (action.item.amount <= 0 || action.item.amount > maxAmount) {
            skippedReasons.push(
              `${(action.item.amount / 10 ** DEMO_DECIMALS).toFixed(2)} TEST exceeds limits`
            );
            continue;
          }
          updated = {
            ...updated,
            schedule: [...updated.schedule, newItem(action.item)],
          };
        } else if (action.type === "remove") {
          updated = {
            ...updated,
            schedule: updated.schedule.filter((i) => i.id !== action.id),
          };
        } else if (action.type === "modify") {
          updated = {
            ...updated,
            schedule: updated.schedule.map((i) =>
              i.id === action.id ? { ...i, ...action.changes } : i
            ),
          };
        } else if (action.type === "ready") {
          ready = updated.schedule.length > 0;
        }
      }

      setMascotPose("writing");
      const convoAdds = [newMessage("agent", data.reply)];
      if (skippedReasons.length > 0) {
        convoAdds.push(
          newMessage(
            "system",
            `Skipped ${skippedReasons.length} item${skippedReasons.length === 1 ? "" : "s"} over policy: ${skippedReasons.join(", ")}`
          )
        );
      }
      updated = {
        ...updated,
        conversation: [...updated.conversation, ...convoAdds],
        ready,
      };

      setBriefing(updated);
      saveBriefing(handler, updated);

      if (ready) {
        setPhase("live");
      }
    } catch (e: any) {
      const errMsg: Briefing = {
        ...optimistic,
        conversation: [
          ...optimistic.conversation,
          newMessage("agent", `Couldn't reach my brain: ${e.message ?? String(e)}`),
        ],
      };
      setBriefing(errMsg);
      saveBriefing(handler, errMsg);
    } finally {
      setChatBusy(false);
      if (mascotIdleTimerRef.current) clearTimeout(mascotIdleTimerRef.current);
      mascotIdleTimerRef.current = setTimeout(() => setMascotPose("idle"), 600);
    }
  }

  function removeItem(id: string) {
    if (!handler || !briefing) return;
    const updated = {
      ...briefing,
      schedule: briefing.schedule.filter((i) => i.id !== id),
    };
    setBriefing(updated);
    saveBriefing(handler, updated);
  }

  function startExecution() {
    if (!handler || !briefing) return;
    if (briefing.schedule.length === 0) return;
    const updated = { ...briefing, ready: true };
    setBriefing(updated);
    saveBriefing(handler, updated);
    setPhase("live");
  }

  function backToBriefing() {
    setPhase("briefing");
    if (handler && briefing) {
      const updated = { ...briefing, ready: false };
      setBriefing(updated);
      saveBriefing(handler, updated);
    }
  }

  // ── Simulator: poll for due items ──
  useEffect(() => {
    if (phase !== "live" || !briefing || !handle || !setup || !persona || !sawClient) return;
    if (pendingApproval) return;

    const interval = setInterval(async () => {
      if (executingRef.current) return;
      const due = nextDueItem(briefing.schedule, Date.now(), prices);
      if (!due) return;
      executingRef.current = true;
      setMascotPose("executing");
      try {
        await dispatchItem(due);
      } finally {
        executingRef.current = false;
      }
    }, 700);

    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, briefing, handle, setup, persona, pendingApproval, prices]);

  function patchItem(id: string, patch: Partial<ScheduleItem>) {
    setBriefing((prev) => {
      if (!prev) return prev;
      const next = {
        ...prev,
        schedule: prev.schedule.map((i) => (i.id === id ? { ...i, ...patch } : i)),
      };
      if (handler) saveBriefing(handler, next);
      return next;
    });
  }

  async function dispatchItem(item: ScheduleItem) {
    if (!handle || !setup || !persona || !sawClient) return;

    patchItem(item.id, { status: "executing" });

    const overThreshold = item.amount > persona.policy.approvalThreshold;
    const remaining = persona.policy.dailyLimit - dailySpent;

    if (item.amount > remaining) {
      patchItem(item.id, {
        status: "failed",
        errorMsg: "Daily cap exceeded — wait for tomorrow's reset",
      });
      return;
    }

    if (overThreshold) {
      try {
        const queue = await handle.fetchQueue();
        const requestId = queue.nextRequestId;
        const requestPda = handle.requestPda(requestId);

        const ix = await sawClient.programs.agentWallet.methods
          .requestPayment(
            setup.recipient.publicKey,
            setup.mint,
            new BN(item.amount),
            Array(32).fill(0) as any
          )
          .accountsPartial({
            wallet: setup.walletPda,
            agent: setup.agent.publicKey,
            policy: handle.policyPda(),
            queue: handle.queuePda(),
            request: requestPda,
            payer: setup.agent.publicKey,
            queueProgram: sawClient.programs.approvalQueue.programId,
            systemProgram: SystemProgram.programId,
          })
          .instruction();
        const sig = await sendAsAgent([ix]);
        patchItem(item.id, {
          status: "awaiting-approval",
          sig,
          requestId: requestId.toString(),
        });
        setPendingApproval({
          requestId,
          itemId: item.id,
          amount: item.amount,
          vendor: item.vendor,
          reason: item.reason,
        });
      } catch (e: any) {
        patchItem(item.id, { status: "failed", errorMsg: e.message ?? String(e) });
      }
      setMascotPose("idle");
      return;
    }

    try {
      const tokenProgram = await handle.detectTokenProgram(setup.mint);
      const ix = await sawClient.programs.agentWallet.methods
        .payDirect(
          setup.recipient.publicKey,
          new BN(item.amount),
          Array(32).fill(0) as any
        )
        .accountsPartial({
          wallet: setup.walletPda,
          agent: setup.agent.publicKey,
          policy: handle.policyPda(),
          mint: setup.mint,
          sourceTokenAccount: setup.walletAta,
          recipientTokenAccount: setup.recipientAta,
          policyProgram: sawClient.programs.policyRegistry.programId,
          tokenProgram,
        })
        .instruction();

      const sig = await sendAsAgent([ix]);
      patchItem(item.id, { status: "done", sig });
      await refreshState(handle, setup.walletAta);
    } catch (e: any) {
      patchItem(item.id, { status: "failed", errorMsg: e.message ?? String(e) });
    }
    setMascotPose("idle");
  }

  async function sendAsAgent(ixs: TransactionInstruction[]): Promise<string> {
    if (!setup) throw new Error("no setup");
    const tx = new Transaction();
    ixs.forEach((ix) => tx.add(ix));
    tx.feePayer = setup.agent.publicKey;
    tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
    tx.sign(setup.agent);
    const sig = await connection.sendRawTransaction(tx.serialize());
    await connection.confirmTransaction(sig, "confirmed");
    return sig;
  }

  async function approvePending() {
    if (!pendingApproval || !handle || !setup || !sawClient || !wallet.publicKey || !wallet.signTransaction)
      return;
    try {
      const ix = await sawClient.programs.agentWallet.methods
        .approveAndExecute()
        .accountsPartial({
          wallet: setup.walletPda,
          owner: wallet.publicKey,
          policy: handle.policyPda(),
          queue: handle.queuePda(),
          request: handle.requestPda(pendingApproval.requestId),
          mint: setup.mint,
          sourceTokenAccount: setup.walletAta,
          recipientTokenAccount: setup.recipientAta,
          policyProgram: sawClient.programs.policyRegistry.programId,
          queueProgram: sawClient.programs.approvalQueue.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .instruction();
      const tx = new Transaction().add(ix);
      tx.feePayer = wallet.publicKey;
      tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
      const signed = await wallet.signTransaction(tx);
      const sig = await connection.sendRawTransaction(signed.serialize());
      await connection.confirmTransaction(sig, "confirmed");
      patchItem(pendingApproval.itemId, { status: "done", sig });
      await refreshState(handle, setup.walletAta);
    } catch (e: any) {
      patchItem(pendingApproval.itemId, {
        status: "failed",
        errorMsg: `Approval failed: ${e.message ?? String(e)}`,
      });
    } finally {
      setPendingApproval(null);
    }
  }

  async function denyPending() {
    if (!pendingApproval || !handle || !setup || !sawClient || !wallet.publicKey || !wallet.signTransaction)
      return;
    try {
      const ix = await sawClient.programs.agentWallet.methods
        .denyRequest()
        .accountsPartial({
          wallet: setup.walletPda,
          owner: wallet.publicKey,
          queue: handle.queuePda(),
          request: handle.requestPda(pendingApproval.requestId),
          queueProgram: sawClient.programs.approvalQueue.programId,
        })
        .instruction();
      const tx = new Transaction().add(ix);
      tx.feePayer = wallet.publicKey;
      tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
      const signed = await wallet.signTransaction(tx);
      const sig = await connection.sendRawTransaction(signed.serialize());
      await connection.confirmTransaction(sig, "confirmed");
      patchItem(pendingApproval.itemId, { status: "denied", sig });
      await refreshState(handle, setup.walletAta);
    } catch (e: any) {
      patchItem(pendingApproval.itemId, {
        status: "failed",
        errorMsg: `Denial failed: ${e.message ?? String(e)}`,
      });
    } finally {
      setPendingApproval(null);
    }
  }

  function reset() {
    if (!handler) return;
    clearSetup(handler);
    clearBriefing(handler);
    setHandle(null);
    setSetup(null);
    setPersona(null);
    setBriefing(null);
    setPendingApproval(null);
    setDailySpent(0);
    setWalletBalance(0);
    setPhase("pick");
    setError(null);
    setMascotPose("idle");
    setMarketSnap(null);
    setScanning(false);
  }

  const upcoming = briefing ? nextUpcoming(briefing.schedule) : null;

  return (
    <main className="min-h-screen">
      <header className="border-b border-ash px-4 sm:px-6 py-4 flex items-center justify-between gap-3 flex-wrap">
        <Link href="/" className="font-display text-2xl tracking-widest">
          S A W
        </Link>
        <div className="flex items-center gap-2 sm:gap-4 flex-wrap justify-end">
          <button
            onClick={() => setShowApiKeyModal(true)}
            className={`text-xs uppercase tracking-widest border px-3 py-1.5 transition ${
              apiKey
                ? "border-gold/40 text-gold hover:bg-gold hover:text-ink"
                : "border-rust text-rust hover:bg-rust hover:text-bone animate-pulse"
            }`}
            title={apiKey ? "Agent connected" : "No agent connected"}
          >
            ⚙ {apiKey ? "Agent" : "Connect agent"}
          </button>
          {phase === "live" && (
            <button
              onClick={backToBriefing}
              className="text-xs uppercase tracking-widest text-bone/60 hover:text-gold border border-ash px-3 py-1.5"
            >
              ⌘ Brief again
            </button>
          )}
          {(phase === "briefing" || phase === "live") && (
            <button
              onClick={reset}
              className="text-xs uppercase tracking-widest text-bone/40 hover:text-rust"
            >
              Burn the dossier
            </button>
          )}
          <WalletButton />
        </div>
      </header>

      <section className="px-4 sm:px-6 py-8 max-w-7xl mx-auto">
        {!wallet.connected ? (
          <Idle />
        ) : !apiKey ? (
          <AgentGate onOpen={() => setShowApiKeyModal(true)} />
        ) : phase === "pick" ? (
          <PersonaPicker onPick={bootstrap} error={error} />
        ) : phase === "setup" ? (
          <SetupOverlay step={setupStep} persona={persona!} />
        ) : phase === "briefing" && persona && briefing ? (
          <BriefingRoom
            persona={persona}
            briefing={briefing}
            chatBusy={chatBusy}
            mascotPose={mascotPose}
            walletBalance={walletBalance}
            now={now}
            marketSnap={marketSnap}
            scanning={scanning}
            onSend={sendChat}
            onRemove={removeItem}
            onStart={startExecution}
            onAcceptOpp={acceptOpportunity}
            onSkipOpp={skipOpportunity}
          />
        ) : phase === "live" && persona && briefing && setup ? (
          <LiveRoom
            persona={persona}
            briefing={briefing}
            setup={setup}
            walletBalance={walletBalance}
            dailySpent={dailySpent}
            mascotPose={mascotPose}
            upcoming={upcoming}
            now={now}
            marketSnap={marketSnap}
            scanning={scanning}
            onAcceptOpp={acceptOpportunity}
            onSkipOpp={skipOpportunity}
          />
        ) : null}
      </section>

      {pendingApproval && persona && (
        <ApprovalSheet
          persona={persona}
          amount={pendingApproval.amount}
          vendor={pendingApproval.vendor}
          reason={pendingApproval.reason}
          onApprove={approvePending}
          onDeny={denyPending}
        />
      )}

      {showApiKeyModal && (
        <ApiKeyModal
          initialKey={apiKey}
          onSave={handleSaveKey}
          onClear={handleClearKey}
          onClose={() => setShowApiKeyModal(false)}
        />
      )}
    </main>
  );
}

function Idle() {
  return (
    <div className="border border-ash p-12 text-center">
      <p className="stamp mb-6">Awaiting handler</p>
      <h2 className="font-display text-4xl mb-4">
        Connect your Phantom.
      </h2>
      <p className="text-bone/60 max-w-xl mx-auto mb-6">
        Pick an agent, brief them by chat, then watch them execute the schedule
        on Solana devnet. You sign only what crosses the threshold.
      </p>
      <div className="border border-gold/40 bg-gold/5 p-4 max-w-md mx-auto text-sm text-bone/80 leading-relaxed">
        <span className="text-gold uppercase tracking-widest text-xs block mb-2">
          One-time setup
        </span>
        Open Phantom → settings → developer settings → switch network to{" "}
        <span className="text-gold">Devnet</span>. Then click Select Wallet
        above.
      </div>
    </div>
  );
}

function AgentGate({ onOpen }: { onOpen: () => void }) {
  const providers = [
    { id: "groq", name: "Groq", note: "Free tier, instant", active: true },
    { id: "openai", name: "OpenAI", note: "GPT-4 / GPT-5", active: false },
    { id: "anthropic", name: "Anthropic", note: "Claude Sonnet / Opus", active: false },
    { id: "gemini", name: "Gemini", note: "Google AI Studio", active: false },
    { id: "grok", name: "Grok", note: "xAI", active: false },
  ];

  return (
    <div className="border border-gold p-8 sm:p-12 text-center max-w-3xl mx-auto">
      <p className="stamp mb-6">Step 2 of 2</p>
      <h2 className="font-display text-3xl sm:text-4xl mb-4">
        Pick a brain for your agent.
      </h2>
      <p className="text-bone/70 max-w-xl mx-auto mb-8 leading-relaxed text-sm sm:text-base">
        Your agent uses an LLM to read intent, scan the market, and propose moves.
        Bring your own key from any provider. It stays in your browser, never on our
        servers.
      </p>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-8">
        {providers.map((p) => (
          <button
            key={p.id}
            onClick={p.active ? onOpen : undefined}
            disabled={!p.active}
            className={`relative border p-4 text-left transition ${
              p.active
                ? "border-gold text-bone hover:bg-gold/10 cursor-pointer"
                : "border-ash/40 text-bone/30 cursor-not-allowed"
            }`}
          >
            <div className="font-display text-base sm:text-lg mb-1">{p.name}</div>
            <div className="text-[10px] uppercase tracking-widest opacity-70">
              {p.note}
            </div>
            {!p.active && (
              <span className="absolute top-1 right-1 text-[9px] uppercase tracking-widest text-bone/40">
                Soon
              </span>
            )}
            {p.active && (
              <span className="absolute top-1 right-1 text-[9px] uppercase tracking-widest text-gold">
                ●
              </span>
            )}
          </button>
        ))}
      </div>

      <p className="text-xs text-bone/50 max-w-md mx-auto leading-relaxed">
        Click <span className="text-gold">Groq</span> to start. Get a free key at{" "}
        <a
          href="https://console.groq.com/keys"
          target="_blank"
          rel="noreferrer"
          className="text-gold hover:underline"
        >
          console.groq.com/keys
        </a>{" "}
        — 1 minute, no card required. Other providers coming soon.
      </p>
    </div>
  );
}

function PersonaPicker({
  onPick,
  error,
}: {
  onPick: (p: Persona) => void;
  error: string | null;
}) {
  return (
    <div>
      <p className="stamp mb-6">Choose your operative</p>
      <h2 className="font-display text-5xl mb-4 tracking-tight">
        Pick the agent.<br />Brief them.
      </h2>
      <p className="text-bone/60 max-w-2xl mb-12 leading-relaxed">
        Each operative comes with a mission and an on-chain policy. You'll talk
        to them in plain English to build today's plan.
      </p>
      {error && (
        <div className="mb-8 border border-rust text-rust p-4 text-sm">
          Setup failed: {error}
        </div>
      )}
      <div className="grid md:grid-cols-3 gap-6">
        {PERSONAS.map((p) => {
          const locked = !!p.comingSoon;
          return (
            <button
              key={p.id}
              onClick={() => !locked && onPick(p)}
              disabled={locked}
              className={`text-left border p-6 transition group relative ${
                locked
                  ? "border-ash/60 cursor-not-allowed"
                  : "border-ash hover:border-gold"
              }`}
            >
              {locked && (
                <div className="absolute top-3 right-3 text-[10px] uppercase tracking-widest border border-bone/30 text-bone/50 px-2 py-0.5">
                  Coming soon
                </div>
              )}
              <div className={`flex justify-center mb-3 ${locked ? "opacity-40" : ""}`}>
                <Mascot pose="idle" size={120} glyph={p.glyph} />
              </div>
              <div className="stamp mb-3">{p.role}</div>
              <h3 className="font-display text-3xl mb-3">{p.name}</h3>
              <p className="text-bone/70 text-sm mb-4 leading-relaxed">
                {p.mission}
              </p>
              {locked && p.comingSoonPreview && (
                <p className="text-bone/50 text-xs italic mb-4 leading-relaxed border-l-2 border-bone/20 pl-3">
                  {p.comingSoonPreview}
                </p>
              )}
              <div className="space-y-1.5 text-xs text-bone/50 mb-6">
                <div className="flex justify-between">
                  <span>Daily cap</span>
                  <span className="text-bone/80">{fmt(p.policy.dailyLimit)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Per-tx cap</span>
                  <span className="text-bone/80">{fmt(p.policy.perTxLimit)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Threshold</span>
                  <span className="text-gold">{fmt(p.policy.approvalThreshold)}</span>
                </div>
              </div>
              <div
                className={`text-xs uppercase tracking-widest ${
                  locked
                    ? "text-bone/30"
                    : "text-gold group-hover:translate-x-1 transition"
                }`}
              >
                {locked ? "Locked · waitlist" : `Brief ${p.name} →`}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function MarketTicker({ snap }: { snap: MarketSnapshot | null }) {
  if (!snap) {
    return (
      <div className="border border-ash p-3 text-xs text-bone/40 italic">
        Reading the tape…
      </div>
    );
  }
  const positive = snap.change24hPct >= 0;
  return (
    <div className="border border-ash p-3 space-y-1">
      <div className="text-[10px] uppercase tracking-widest text-bone/40">
        Live tape · {snap.asset}
      </div>
      <div className="flex items-baseline gap-3">
        <span className="font-display text-2xl text-bone">
          ${snap.priceUsd.toFixed(2)}
        </span>
        <span
          className={`text-xs ${positive ? "text-gold" : "text-rust"}`}
        >
          {positive ? "+" : ""}
          {snap.change24hPct.toFixed(2)}%
        </span>
      </div>
      <div className="text-xs text-bone/50">
        24h ${snap.low24hUsd.toFixed(2)} → ${snap.high24hUsd.toFixed(2)}
      </div>
    </div>
  );
}

function SetupOverlay({ step, persona }: { step: string; persona: Persona }) {
  return (
    <div className="border border-ash p-12 text-center min-h-[400px] flex flex-col items-center justify-center">
      <Mascot pose="thinking" size={140} glyph={persona.glyph} />
      <p className="stamp mt-4 mb-2">Briefing {persona.name}</p>
      <h2 className="font-display text-3xl mb-3">{persona.tagline}</h2>
      <p className="text-bone/60 text-sm mb-8">
        Three signatures. Phantom will prompt you for each.
      </p>
      <div className="text-bone/80 text-sm">{step || "Working…"}</div>
    </div>
  );
}

function BriefingRoom({
  persona,
  briefing,
  chatBusy,
  mascotPose,
  walletBalance,
  now,
  marketSnap,
  scanning,
  onSend,
  onRemove,
  onStart,
  onAcceptOpp,
  onSkipOpp,
}: {
  persona: Persona;
  briefing: Briefing;
  chatBusy: boolean;
  mascotPose: MascotPose;
  walletBalance: number;
  now: number;
  marketSnap: MarketSnapshot | null;
  scanning: boolean;
  onSend: (text: string) => void;
  onRemove: (id: string) => void;
  onStart: () => void;
  onAcceptOpp: (opp: Opportunity) => void;
  onSkipOpp: (opp: Opportunity) => void;
}) {
  const showMarket = persona.id === "greedie";
  return (
    <div>
      {showMarket && (
        <OpportunityReel
          opportunities={briefing.opportunities}
          now={now}
          scanning={scanning}
          glyph={persona.glyph}
          personaName={persona.name}
          onAccept={onAcceptOpp}
          onSkip={onSkipOpp}
        />
      )}
    <div className="grid lg:grid-cols-[3fr_4fr_3fr] gap-6">
      {/* LEFT: mascot + identity */}
      <div className="space-y-4">
        <div className="border border-ash p-5 flex flex-col items-center">
          <Mascot pose={mascotPose} size={180} glyph={persona.glyph} />
          <div className="stamp mt-4">{persona.role}</div>
          <h2 className="font-display text-2xl mt-1">{persona.name}</h2>
          <p className="text-bone/60 text-xs italic text-center mt-2">
            {persona.tagline}
          </p>
        </div>
        {showMarket && <MarketTicker snap={marketSnap} />}
        <div className="border border-ash p-4 space-y-2 text-xs">
          <div className="text-bone/40 uppercase tracking-widest mb-2">
            Policy ceilings
          </div>
          <Row label="Daily" value={fmt(persona.policy.dailyLimit)} />
          <Row label="Per-tx" value={fmt(persona.policy.perTxLimit)} />
          <Row label="Threshold" value={fmt(persona.policy.approvalThreshold)} accent />
          <Row label="Balance" value={fmt(walletBalance)} />
        </div>
      </div>

      {/* MIDDLE: chat */}
      <div>
        <Chat messages={briefing.conversation} onSend={onSend} busy={chatBusy} />
      </div>

      {/* RIGHT: schedule preview + start */}
      <div className="space-y-4">
        <ScheduleView
          items={briefing.schedule}
          now={now}
          onRemove={onRemove}
          approvalThreshold={persona.policy.approvalThreshold}
        />
        <button
          onClick={onStart}
          disabled={briefing.schedule.length === 0}
          className="w-full bg-gold text-ink py-4 uppercase tracking-widest text-sm hover:bg-bone disabled:opacity-30 disabled:cursor-not-allowed transition"
        >
          {briefing.schedule.length === 0
            ? "Build the schedule via chat"
            : `Run ${briefing.schedule.length} ${
                briefing.schedule.length === 1 ? "action" : "actions"
              } →`}
        </button>
      </div>
    </div>
    </div>
  );
}

function LiveRoom({
  persona,
  briefing,
  setup,
  walletBalance,
  dailySpent,
  mascotPose,
  upcoming,
  now,
  marketSnap,
  scanning,
  onAcceptOpp,
  onSkipOpp,
}: {
  persona: Persona;
  briefing: Briefing;
  setup: Setup;
  walletBalance: number;
  dailySpent: number;
  mascotPose: MascotPose;
  upcoming: ScheduleItem | null;
  now: number;
  marketSnap: MarketSnapshot | null;
  scanning: boolean;
  onAcceptOpp: (opp: Opportunity) => void;
  onSkipOpp: (opp: Opportunity) => void;
}) {
  const showMarket = persona.id === "greedie";
  const dailyPct = Math.min(
    100,
    (dailySpent / persona.policy.dailyLimit) * 100
  );
  const thresholdPct =
    (persona.policy.approvalThreshold / persona.policy.dailyLimit) * 100;
  const secsToNext = upcoming
    ? Math.max(0, Math.round((upcoming.scheduledFor - now) / 1000))
    : null;

  return (
    <div>
      {showMarket && (
        <OpportunityReel
          opportunities={briefing.opportunities}
          now={now}
          scanning={scanning}
          glyph={persona.glyph}
          personaName={persona.name}
          onAccept={onAcceptOpp}
          onSkip={onSkipOpp}
        />
      )}
    <div className="grid lg:grid-cols-[2fr_3fr] gap-6">
      <div className="space-y-4">
        <div className="border border-ash p-5">
          <div className="flex items-start gap-4 mb-4">
            <Mascot pose={mascotPose} size={110} glyph={persona.glyph} />
            <div className="flex-1">
              <div className="stamp mb-2">{persona.role}</div>
              <h2 className="font-display text-2xl">{persona.name}</h2>
              <span className="inline-block mt-2 text-xs uppercase tracking-widest border border-gold text-gold px-2 py-0.5 animate-pulse">
                In mission
              </span>
            </div>
          </div>
          <div className="text-xs uppercase tracking-widest text-bone/50 mb-2">
            Daily budget
          </div>
          <div className="relative h-3 bg-ash overflow-hidden mb-2">
            <div
              className="absolute inset-y-0 left-0 bg-gold transition-all duration-500"
              style={{ width: `${dailyPct}%` }}
            />
            <div
              className="absolute inset-y-0 w-px bg-bone/60"
              style={{ left: `${thresholdPct}%` }}
              title="Approval threshold"
            />
          </div>
          <div className="flex justify-between text-xs text-bone/60">
            <span>{fmt(dailySpent)} spent</span>
            <span>of {fmt(persona.policy.dailyLimit)}</span>
          </div>
        </div>

        {showMarket && <MarketTicker snap={marketSnap} />}

        {upcoming && (
          <div className="border border-gold/40 bg-gold/5 p-5">
            <div className="text-xs uppercase tracking-widest text-gold mb-2">
              Next up
              {upcoming.trigger && upcoming.trigger.kind !== "time"
                ? " · waiting for trigger"
                : secsToNext !== null && secsToNext > 0
                ? ` · in ${secsToNext}s`
                : ""}
            </div>
            <div className="font-display text-2xl text-bone mb-1">
              {fmt(upcoming.amount)}
            </div>
            <div className="text-bone/70 text-sm">→ {upcoming.vendor}</div>
            <div className="text-bone/50 text-xs italic mt-1">
              "{upcoming.reason}"
            </div>
            {upcoming.trigger && upcoming.trigger.kind !== "time" && (
              <div className="mt-3 pt-3 border-t border-gold/20 text-xs text-gold/80">
                ▸ {describeTrigger(upcoming)}
                {marketSnap && (
                  <span className="text-bone/50 ml-2">
                    (now ${marketSnap.priceUsd.toFixed(2)})
                  </span>
                )}
              </div>
            )}
          </div>
        )}

        <div className="grid grid-cols-2 gap-px bg-ash">
          <div className="bg-ink p-4">
            <div className="text-xs uppercase tracking-widest text-bone/50 mb-1">
              Wallet balance
            </div>
            <div className="font-display text-2xl">{fmt(walletBalance)}</div>
          </div>
          <div className="bg-ink p-4">
            <div className="text-xs uppercase tracking-widest text-bone/50 mb-1">
              Threshold
            </div>
            <div className="font-display text-2xl text-gold">
              {fmt(persona.policy.approvalThreshold)}
            </div>
          </div>
        </div>

        <div className="border border-ash p-4">
          <div className="text-xs uppercase tracking-widest text-bone/50 mb-3">
            On-chain identities
          </div>
          <div className="space-y-2 text-xs">
            <Identity label="Wallet" value={setup.walletPda} />
            <Identity label="Agent" value={setup.agent.publicKey} />
            <Identity label="Mint" value={setup.mint} />
          </div>
        </div>
      </div>

      <ScheduleView
        items={briefing.schedule}
        now={now}
        approvalThreshold={persona.policy.approvalThreshold}
        readOnly
      />
    </div>
    </div>
  );
}

function Row({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-bone/40 uppercase tracking-widest">{label}</span>
      <span className={accent ? "text-gold font-medium" : "text-bone/80"}>
        {value}
      </span>
    </div>
  );
}

function Identity({ label, value }: { label: string; value: PublicKey }) {
  const s = value.toBase58();
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-bone/40 uppercase tracking-widest">{label}</span>
      <a
        href={`https://explorer.solana.com/address/${s}?cluster=devnet`}
        target="_blank"
        rel="noreferrer"
        className="text-bone/70 hover:text-gold font-mono"
      >
        {s.slice(0, 4)}…{s.slice(-4)}
      </a>
    </div>
  );
}

function ApprovalSheet({
  persona,
  amount,
  vendor,
  reason,
  onApprove,
  onDeny,
}: {
  persona: Persona;
  amount: number;
  vendor: string;
  reason: string;
  onApprove: () => void;
  onDeny: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/80 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-2xl bg-ink border border-gold m-4 mb-8 p-8 animate-slide-up">
        <div className="flex items-center gap-4 mb-6">
          <Mascot pose="thinking" size={80} glyph={persona.glyph} />
          <div>
            <div className="stamp">Approval requested</div>
            <div className="text-bone font-display text-xl">{persona.name}</div>
          </div>
        </div>
        <div className="mb-6">
          <div className="text-bone/50 text-xs uppercase tracking-widest mb-2">
            Wants to send
          </div>
          <div className="font-display text-5xl text-gold mb-1">
            {fmt(amount)}
          </div>
          <div className="text-bone/70">to {vendor}</div>
        </div>
        <div className="border-l-2 border-bone/30 pl-4 mb-8">
          <div className="text-bone/40 text-xs uppercase tracking-widest mb-1">
            {persona.name}'s reasoning
          </div>
          <div className="text-bone/80 italic">"{reason}"</div>
        </div>
        <div className="text-xs text-bone/50 mb-6 leading-relaxed">
          This payment exceeds the approval threshold you set on-chain. Without
          your signature it sits in the queue and never executes. The agent
          cannot bypass you.
        </div>
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={onDeny}
            className="border border-rust text-rust py-4 uppercase tracking-widest text-sm hover:bg-rust hover:text-bone transition"
          >
            Deny
          </button>
          <button
            onClick={onApprove}
            className="bg-gold text-ink py-4 uppercase tracking-widest text-sm hover:bg-bone transition"
          >
            Approve & sign
          </button>
        </div>
      </div>
    </div>
  );
}
