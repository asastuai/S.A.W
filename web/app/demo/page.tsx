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
  VersionedTransaction,
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
  ScheduleStatus,
  clearAllBriefings,
  describeTrigger,
  loadActivePersonaId,
  loadBriefing,
  newItem,
  newMessage,
  nextDueItem,
  nextUpcoming,
  pendingOpportunities,
  saveActivePersonaId,
  saveBriefing,
} from "@/lib/schedule";
import type { MarketSnapshot } from "@/lib/market";
import { OpportunityReel } from "@/components/opportunity-reel";
import { Mascot, MascotPose } from "@/components/mascot";
import { CreatorNote } from "@/components/creator-note";
import { usePrivy } from "@privy-io/react-auth";
import { useHandler } from "@/lib/use-handler";
import {
  SignInGate,
  LoadingHandler,
  HandlerError,
} from "@/components/sign-in-gate";
import {
  hydrateChat,
  hydrateOpportunities,
  hydrateSchedule,
} from "@/lib/hydrate";
import { SleepingBadge } from "@/components/sleeping-badge";
import { AgentSettingsModal } from "@/components/agent-settings-modal";
import { WakesFeed } from "@/components/wakes-feed";
import { FeeSummary } from "@/components/fee-summary";
import { ProviderBadge } from "@/components/provider-badge";
import { ConnectTelegramButton } from "@/components/connect-telegram-button";
import { OnboardingTour } from "@/components/onboarding-tour";
import { TopupCard } from "@/components/topup-card";
import { getTreasuryAddress } from "@/lib/treasury";
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
  const { authenticated: privyAuthed, ready: privyReady, logout: privyLogout, getAccessToken } = usePrivy();
  const handlerState = useHandler();

  type DbAgentMeta = {
    active: boolean;
    cron_cadence_minutes: number;
    next_wake_at: string | null;
    last_wake_at: string | null;
    active_hours_start: number | null;
    active_hours_end: number | null;
    agent_name?: string | null;
  };

  // Active persona is the one whose conversation/schedule is visible.
  // The other 2 slots stay alive in localStorage + DB; tab switch swaps
  // the active state in.
  const [activePersonaId, setActivePersonaIdState] = useState<string | null>(
    null
  );
  const basePersona = getPersona(activePersonaId);

  // Per-persona DB metadata. Single state is for the active slot; the
  // map persists the other slots across switches.
  const [dbAgentIds, setDbAgentIds] = useState<Record<string, string>>({});
  const [dbAgentsMap, setDbAgentsMap] = useState<
    Record<string, DbAgentMeta>
  >({});
  const dbAgentId = activePersonaId ? dbAgentIds[activePersonaId] ?? null : null;
  const dbAgent = activePersonaId
    ? dbAgentsMap[activePersonaId] ?? null
    : null;

  // Effective persona: base preset + user-chosen codename from DB.
  // If user hasn't customized, falls back to the preset's default name
  // ("Operative"). This is what gets passed to the LLM and rendered.
  const persona = basePersona
    ? { ...basePersona, name: dbAgent?.agent_name?.trim() || basePersona.name }
    : null;

  function setDbAgentId(id: string | null) {
    if (!activePersonaId) return;
    setDbAgentIds((prev) => {
      const next = { ...prev };
      if (id) next[activePersonaId] = id;
      else delete next[activePersonaId];
      return next;
    });
  }

  function setDbAgent(meta: DbAgentMeta | null) {
    if (!activePersonaId) return;
    setDbAgentsMap((prev) => {
      const next = { ...prev };
      if (meta) next[activePersonaId] = meta;
      else delete next[activePersonaId];
      return next;
    });
  }
  const [showSettings, setShowSettings] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [phase, setPhase] = useState<Phase>("pick");
  const [setupStep, setSetupStep] = useState<string>("");
  const [setup, setSetup] = useState<Setup | null>(null);
  const [handle, setHandle] = useState<WalletHandle | null>(null);
  // Per-persona briefings. `briefing` (derived) is the active slot;
  // setBriefing writes into the map. Tab switch just changes
  // activePersonaId — no data movement needed.
  const [briefings, setBriefings] = useState<Record<string, Briefing>>({});
  const briefing = activePersonaId ? briefings[activePersonaId] ?? null : null;
  function setBriefing(
    nextOrUpdater: Briefing | null | ((prev: Briefing | null) => Briefing | null)
  ) {
    if (!activePersonaId) return;
    setBriefings((prev) => {
      const current = prev[activePersonaId] ?? null;
      const value =
        typeof nextOrUpdater === "function"
          ? (nextOrUpdater as (p: Briefing | null) => Briefing | null)(current)
          : nextOrUpdater;
      const next = { ...prev };
      if (value) next[activePersonaId] = value;
      else delete next[activePersonaId];
      return next;
    });
  }

  // Tab switch helper. Persists the new active persona to localStorage
  // so the next visit lands on the same tab. Does not touch briefings —
  // each persona's slot persists independently.
  function switchPersona(id: string) {
    if (id === activePersonaId) return;
    setActivePersonaIdState(id);
    if (handler) saveActivePersonaId(handler, id);
  }
  const [walletBalance, setWalletBalance] = useState<number>(0);
  const [dailySpent, setDailySpent] = useState<number>(0);
  const [chatBusy, setChatBusy] = useState<boolean>(false);
  const [pendingApproval, setPendingApproval] = useState<{
    requestId: BN;
    itemId: string;
    amount: number;
    vendor: string;
    reason: string;
    // When the original schedule item carried an arbitrary recipient
    // (propose_transfer flow), we route the approveAndExecute to that
    // destination ATA instead of the demo's built-in recipient.
    destAddr?: PublicKey;
    destAta?: PublicKey;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState<number>(Date.now());
  const [mascotPose, setMascotPose] = useState<MascotPose>("idle");
  const [marketSnap, setMarketSnap] = useState<MarketSnapshot | null>(null);
  const [scanning, setScanning] = useState<boolean>(false);
  const [apiKey, setApiKeyState] = useState<string | null>(null);
  const [showApiKeyModal, setShowApiKeyModal] = useState<boolean>(false);
  const [sawCredits, setSawCredits] = useState<number>(0);
  const executingRef = useRef<boolean>(false);
  const briefingRef = useRef<Briefing | null>(null);

  // Load saved API key on mount
  useEffect(() => {
    setApiKeyState(loadApiKey());
  }, []);

  // Fetch SAW credit balance once Privy is ready. Used to bypass the
  // AgentGate when the handler has paid credits but no BYOK key.
  useEffect(() => {
    if (!privyAuthed) return;
    let cancelled = false;
    (async () => {
      try {
        const token = await getAccessToken();
        if (!token) return;
        const res = await fetch("/api/topup", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setSawCredits(data.balance_calls ?? 0);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [privyAuthed, getAccessToken]);

  // 2.3: Fire-and-forget DB sync helper.
  // Local state is the working copy; DB is the authoritative store synced
  // in the background. If sync fails (offline, network) the demo keeps
  // working from local state; the next successful sync or hydrate
  // reconciles.
  async function syncChatToDb(role: "user" | "agent" | "system", content: string) {
    if (!dbAgentId || !privyAuthed) return;
    try {
      const token = await getAccessToken();
      if (!token) return;
      await fetch(`/api/agents/${dbAgentId}/chat`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ role, content }),
      });
    } catch (_) {
      /* non-fatal */
    }
  }

  async function syncScheduleAddToDb(item: ScheduleItem) {
    if (!dbAgentId || !privyAuthed) return;
    try {
      const token = await getAccessToken();
      if (!token) return;
      const triggerBody: any = item.trigger ? { ...item.trigger } : { kind: "time" };
      if (triggerBody.deadline) triggerBody.deadline = triggerBody.deadline;
      await fetch(`/api/agents/${dbAgentId}/schedule`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          actionType: "pay",
          vendor: item.vendor,
          amount: item.amount,
          asset: "USDC-dev",
          reason: item.reason,
          scheduledFor: item.scheduledFor,
          trigger: triggerBody,
        }),
      });
    } catch (_) {
      /* non-fatal */
    }
  }

  async function syncScheduleStatusToDb(
    itemId: string,
    status: ScheduleStatus,
    extras?: { txSignature?: string; errorMessage?: string }
  ) {
    if (!dbAgentId || !privyAuthed) return;
    try {
      const token = await getAccessToken();
      if (!token) return;
      await fetch(
        `/api/agents/${dbAgentId}/schedule?itemId=${encodeURIComponent(itemId)}`,
        {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            status,
            txSignature: extras?.txSignature,
            errorMessage: extras?.errorMessage,
          }),
        }
      );
    } catch (_) {
      /* non-fatal */
    }
  }

  // Backfill dbAgentId when handler becomes ready after a session restore.
  // Without this, syncs silently no-op if the demo entered briefing before
  // Privy auth finished.
  useEffect(() => {
    if (dbAgentId) return;
    if (!privyAuthed || handlerState.status !== "ready" || !persona) return;
    let cancelled = false;
    (async () => {
      try {
        const token = await getAccessToken();
        if (!token) return;
        const res = await fetch("/api/agents", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const { agents } = await res.json();
        const mine = (agents ?? []).find((a: any) => a.persona === persona.id);
        if (mine && !cancelled) {
          setDbAgentId(mine.id);
          setDbAgent({
            active: mine.active,
            cron_cadence_minutes: mine.cron_cadence_minutes,
            next_wake_at: mine.next_wake_at,
            last_wake_at: mine.last_wake_at,
            active_hours_start: mine.active_hours_start,
            active_hours_end: mine.active_hours_end,
          });
          console.log("[saw] dbAgentId backfilled", mine.id);
        }
      } catch (_) {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [dbAgentId, privyAuthed, handlerState.status, persona?.id, getAccessToken]);

  // 2.2: Hydrate briefing from DB when dbAgentId is set.
  // DB is the source of truth; localStorage is a fallback only.
  useEffect(() => {
    if (!dbAgentId || !privyAuthed) return;
    let cancelled = false;
    (async () => {
      try {
        const token = await getAccessToken();
        if (!token) return;
        const res = await fetch(`/api/agents/${dbAgentId}/state`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          console.warn("[saw] state hydrate failed", res.status);
          return;
        }
        const { agent, chat, schedule, opportunities } = await res.json();
        if (cancelled) return;
        if (agent) {
          setDbAgent({
            active: agent.active,
            cron_cadence_minutes: agent.cron_cadence_minutes,
            next_wake_at: agent.next_wake_at,
            last_wake_at: agent.last_wake_at,
            active_hours_start: agent.active_hours_start,
            active_hours_end: agent.active_hours_end,
            agent_name: agent.agent_name,
          });
        }

        setBriefing((prev) => {
          if (!prev) return prev;
          const merged = {
            ...prev,
            conversation: chat.length ? hydrateChat(chat) : prev.conversation,
            schedule: schedule.length ? hydrateSchedule(schedule) : prev.schedule,
            opportunities: opportunities.length
              ? hydrateOpportunities(opportunities)
              : prev.opportunities,
          };
          console.log("[saw] briefing hydrated from DB", {
            chat: chat.length,
            schedule: schedule.length,
            opportunities: opportunities.length,
          });
          return merged;
        });
      } catch (e) {
        console.warn("[saw] state hydrate error", e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [dbAgentId, privyAuthed, getAccessToken]);

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
    // v1.2: only run the client-side scanner when the agent is opted in
    // to auto-wake. Default is silent — no API calls until handler chats.
    if (!dbAgent?.active) return;

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
              `${i.vendor} · ${(i.amount / 10 ** DEMO_DECIMALS).toFixed(0)} USDC-dev · ${i.status}`
          )
          .join("; ");

        const privyToken = privyAuthed ? await getAccessToken() : null;
        const res = await fetch("/api/agent/scan", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(apiKey ? { "x-user-api-key": apiKey } : {}),
            ...(privyToken ? { Authorization: `Bearer ${privyToken}` } : {}),
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
          // Silent log — scanner errors (rate limit, 503, etc.) used to
          // pollute the chat with repeated system messages. They are
          // transient and recoverable; keep them out of the conversation.
          console.warn("[saw] scan error", data.error);
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
          // Fire-and-forget: persist each new opportunity in DB
          for (const o of newOpps) syncOpportunityCreateToDb(o);
          return next;
        });
      } catch (e: any) {
        console.error("[scan] failed", e);
      } finally {
        if (!cancelled) setScanning(false);
      }
    }

    const initialDelay = setTimeout(scan, 4000);
    // 5 min cadence — stays within Gemini Flash-Lite 10-RPM free tier
    // while leaving room for handler chats. Server-side cron handles
    // the real wake cycle on its own schedule.
    const timer = setInterval(scan, 5 * 60_000);

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
    syncOpportunityStatusToDb(opp.id, "accepted");
    syncScheduleAddToDb(item);
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
    syncOpportunityStatusToDb(opp.id, "skipped");
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

  // Restore session — loads the shared setup + all persona slots that
  // have a saved briefing. activePersonaId comes from localStorage
  // (last-used tab), with legacy `stored.personaId` and "greedie" as
  // fallbacks.
  useEffect(() => {
    if (!handler || !sawClient) return;
    const stored = loadSetup(handler);
    if (!stored) return;

    let cancelled = false;
    (async () => {
      try {
        const walletPda = new PublicKey(stored.walletPda);
        const handle = await sawClient.loadWallet(walletPda);
        const agent = loadOrCreateAgent(handler);
        const recipient = loadOrCreateRecipient(handler);
        if (cancelled) return;

        setHandle(handle);
        setSetup({
          walletPda,
          walletAta: new PublicKey(stored.walletAta),
          recipient,
          recipientAta: new PublicKey(stored.recipientAta),
          mint: new PublicKey(stored.mint),
          agent,
        });

        // v1.3 unified-agent model: restore only the operative briefing.
        // Legacy sessions with greedie/conservador/estable briefings get
        // wiped here so the tabs UI doesn't appear and the user lands
        // straight into the Operative conversation.
        const legacyIds = ["greedie", "conservador", "estable"];
        const hasLegacyOnly = legacyIds.some((id) =>
          loadBriefing(handler, id)
        ) && !loadBriefing(handler, "operative");
        if (hasLegacyOnly) {
          console.log("[saw] wiping legacy briefings (greedie/conservador/estable)");
          for (const id of legacyIds) {
            try {
              // Direct removal of just the legacy keys (keeps operative
              // briefing if it happens to coexist).
              window.localStorage.removeItem(
                `saw-demo-v1:briefing:${handler.toBase58()}:${id}`
              );
            } catch {
              /* ignore */
            }
          }
        }

        const restoredBriefings: Record<string, Briefing> = {};
        const operativePersona =
          PERSONAS.find((p) => p.id === "operative") ?? PERSONAS[0];
        const savedOp = loadBriefing(handler, operativePersona.id);
        restoredBriefings[operativePersona.id] = savedOp
          ? { ...savedOp, opportunities: savedOp.opportunities ?? [] }
          : freshBriefing(operativePersona);

        if (cancelled) return;
        setBriefings(restoredBriefings);

        const initialActive = operativePersona.id;
        setActivePersonaIdState(initialActive);
        saveActivePersonaId(handler, initialActive);

        const activeBriefing = restoredBriefings[initialActive];
        setPhase(activeBriefing?.ready ? "live" : "briefing");
        await refreshState(handle, new PublicKey(stored.walletAta));

        // Hydrate the operative dbAgent row. If a legacy session has
        // greedie/conservador/estable rows but no operative one, mint
        // the operative row on the fly with the existing setup pubkeys
        // so the chat sync works from message #1.
        if (handlerState.status === "ready" && privyAuthed) {
          try {
            const token = await getAccessToken();
            if (token) {
              const res = await fetch("/api/agents", {
                headers: { Authorization: `Bearer ${token}` },
              });
              if (res.ok && !cancelled) {
                const { agents } = await res.json();
                let opRow = (agents ?? []).find(
                  (a: any) => a?.persona === "operative"
                );
                if (!opRow) {
                  // Legacy: no operative row yet. Create one with the
                  // current setup's pubkeys.
                  const wp = new PublicKey(stored.walletPda);
                  const policyPdaStr = derivePolicyPda(wp)[0].toBase58();
                  const queuePdaStr = deriveQueuePda(wp)[0].toBase58();
                  const createRes = await fetch("/api/agents", {
                    method: "POST",
                    headers: {
                      Authorization: `Bearer ${token}`,
                      "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                      persona: "operative",
                      agentPubkey: agent.publicKey.toBase58(),
                      walletPda: stored.walletPda,
                      policyPda: policyPdaStr,
                      queuePda: queuePdaStr,
                      cronCadenceMinutes: 60,
                    }),
                  });
                  if (createRes.ok) {
                    opRow = (await createRes.json()).agent;
                    console.log("[saw] legacy session: minted operative", opRow?.id);
                  }
                }
                if (opRow && !cancelled) {
                  setDbAgentIds({ operative: opRow.id });
                  setDbAgentsMap({
                    operative: {
                      active: opRow.active,
                      cron_cadence_minutes: opRow.cron_cadence_minutes,
                      next_wake_at: opRow.next_wake_at,
                      last_wake_at: opRow.last_wake_at,
                      active_hours_start: opRow.active_hours_start,
                      active_hours_end: opRow.active_hours_end,
                      agent_name: opRow.agent_name,
                    },
                  });
                }
              }
            }
          } catch (_) {
            /* non-fatal */
          }
        }
      } catch (e: any) {
        if (cancelled) return;
        clearSetup(handler);
        clearAllBriefings(
          handler,
          PERSONAS.map((p) => p.id)
        );
      }
    })();
    return () => {
      cancelled = true;
    };
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

  // v1.3 auto-bootstrap: as soon as the wallet connects, dispatch the
  // setup atomic tx for the Operative. No persona picker, no API-key
  // gate — those choices move into the briefing room once the agent
  // exists. The session-restore effect runs first; this only fires when
  // there's no setup yet AND we're still in the "pick" phase.
  const bootstrapTriggeredRef = useRef<boolean>(false);
  useEffect(() => {
    if (bootstrapTriggeredRef.current) return;
    if (!wallet.connected || !sawClient || !handler) return;
    if (phase !== "pick") return;
    if (setup) return;
    // If localStorage has a saved setup, the session-restore effect
    // will hydrate it. Don't double-bootstrap.
    if (loadSetup(handler)) return;
    const op = PERSONAS.find((p) => p.id === "operative");
    if (!op) return;
    bootstrapTriggeredRef.current = true;
    bootstrap(op);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wallet.connected, sawClient, handler?.toBase58(), phase, setup]);

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
    // Activate the persona the user picked. The other 2 slots get
    // initialized below and become available via the tabs.
    setActivePersonaIdState(p.id);
    if (handler) saveActivePersonaId(handler, p.id);
    setPhase("setup");
    setError(null);
    try {
      const agent = loadOrCreateAgent(handler);
      const recipient = loadOrCreateRecipient(handler);
      const salt = new Uint8Array(32);
      crypto.getRandomValues(salt);
      const saltBuf = Buffer.from(salt);

      // v1.3 unified-agent model: 1 operative, the policy comes
      // straight from its definition (the old "max of 3" was a workaround
      // for the multi-persona phase). User can edit the codename later.
      const operative = PERSONAS.find((x) => x.id === "operative") ?? PERSONAS[0];
      const sharedPolicy = operative.policy;
      const sharedInitialFund = operative.initialFund;
      // M-1: the policy is now denominated in a specific mint. Generate the
      // demo's USDC-dev mint first so it can be pinned into the policy.
      const mintKp = Keypair.generate();
      const policy = buildPolicy({
        ...sharedPolicy,
        mint: mintKp.publicKey,
        // #1 fix (v1.5 critique): pre-authorize the demo's fixed recipient so
        // normal buys auto-spend on the fast path. Any LLM-injected toAddress
        // stays unlisted → forced through on-chain owner approval. The
        // client-side gate stays as defense-in-depth.
        recipientAllowlist: [recipient.publicKey],
      });
      const [walletPda] = deriveWalletPda(handler, saltBuf);

      setSetupStep(
        `Preparing your shared wallet, policy, mint, and funding in one signature…`
      );
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

      const initWalletIx = await sawClient.programs.agentWallet.methods
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

      // v1.2: collapse the 3 setup signatures into 1 atomic transaction.
      // Solana processes instructions in order, so dependencies resolve:
      //   1. create + init mint account
      //   2. initialize SAW wallet PDA + policy + queue
      //   3. fund agent keypair with SOL for gas
      //   4. create handler-funded ATAs for walletPda + recipient
      //   5. mint initial USDC-dev into walletAta
      // Fits within the 1232-byte legacy tx limit since most accounts
      // are referenced once.
      const oneShotTx = new Transaction()
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
        )
        .add(initWalletIx)
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
            BigInt(sharedInitialFund)
          )
        );
      oneShotTx.feePayer = handler;
      oneShotTx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
      oneShotTx.partialSign(mintKp);
      const signedOne = await wallet.signTransaction(oneShotTx);
      const oneSig = await connection.sendRawTransaction(signedOne.serialize());
      await connection.confirmTransaction(oneSig, "confirmed");
      console.log("[saw] setup atomic tx confirmed", oneSig);

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
      saveSetup(handler, newSetup, saltBuf);

      // 2.1: Register all 3 agent personas in Supabase so the worker +
      // dashboard know each one and the user can tab between them.
      // Best-effort — if it fails (Privy not ready, network), demo
      // keeps working from localStorage; we just lose multi-device.
      if (handlerState.status === "ready") {
        try {
          const token = await getAccessToken();
          if (token) {
            const policyPdaStr = derivePolicyPda(walletPda)[0].toBase58();
            const queuePdaStr = deriveQueuePda(walletPda)[0].toBase58();
            // v1.3: register only the operative. Old multi-persona setups
            // stay in DB unchanged but new ones get a single row.
            const res = await fetch("/api/agents", {
              method: "POST",
              headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                persona: "operative",
                agentPubkey: agent.publicKey.toBase58(),
                walletPda: walletPda.toBase58(),
                policyPda: policyPdaStr,
                queuePda: queuePdaStr,
                cronCadenceMinutes: 60,
              }),
            });
            if (res.ok) {
              const { agent: ag } = await res.json();
              setDbAgentIds({ operative: ag.id });
              setDbAgentsMap({
                operative: {
                  active: ag.active,
                  cron_cadence_minutes: ag.cron_cadence_minutes,
                  next_wake_at: ag.next_wake_at,
                  last_wake_at: ag.last_wake_at,
                  active_hours_start: ag.active_hours_start,
                  active_hours_end: ag.active_hours_end,
                  agent_name: ag.agent_name,
                },
              });
              console.log("[saw] operative registered", ag.id);
            }
          }
        } catch (e) {
          console.warn("[saw] agent DB registration error", e);
        }
      }

      // Seed a single fresh briefing for the operative slot.
      const op = PERSONAS.find((x) => x.id === "operative") ?? PERSONAS[0];
      const seedBriefing = freshBriefing(op);
      saveBriefing(handler, seedBriefing);
      setBriefings({ operative: seedBriefing });

      setSetupStep("");
      setPhase("briefing");
      await refreshState(handle, walletAta);
    } catch (e: any) {
      setError(e.message ?? String(e));
      setPhase("pick");
      setSetupStep("");
      // Clear the auto-trigger guard so the user can retry by reloading
      // or reconnecting their wallet. Without this they'd be stuck if
      // they rejected the Phantom signature.
      bootstrapTriggeredRef.current = false;
    }
  }

  // ── Chat handler ──
  async function sendChat(text: string) {
    if (!persona || !briefing || !handler) return;
    if (!apiKey && sawCredits <= 0) {
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
    syncChatToDb("user", text);

    try {
      setMascotPose("thinking");
      const privyToken = privyAuthed ? await getAccessToken() : null;
      const res = await fetch("/api/agent/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(apiKey ? { "x-user-api-key": apiKey } : {}),
          ...(privyToken ? { Authorization: `Bearer ${privyToken}` } : {}),
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
        usingSawKey?: boolean;
        actions: Array<
          | {
              type: "add";
              item: {
                vendor: string;
                amount: number;
                scheduledFor: number;
                reason: string;
                trigger?: ScheduleItem["trigger"];
                toAddress?: string;
                jupiterSwap?: ScheduleItem["jupiterSwap"];
              };
            }
          | { type: "remove"; id: string }
          | { type: "modify"; id: string; changes: any }
          | { type: "ready" }
        >;
      };

      // Optimistic credit decrement so the badge updates immediately.
      // The endpoint decrements server-side; this just mirrors it
      // locally without an extra round-trip.
      if (data.usingSawKey) setSawCredits((c) => Math.max(0, c - 1));

      let updated: Briefing = { ...optimistic };
      let ready = updated.ready;
      const skippedReasons: string[] = [];
      const maxAmount = Math.min(persona.policy.perTxLimit, walletBalance);

      for (const action of data.actions ?? []) {
        if (action.type === "add") {
          // Jupiter swaps are NOT denominated in USDC-dev — they move
          // SOL / USDC / other mints directly via the handler's wallet.
          // Skip the USDC-dev limit check for those; their cap is
          // enforced by Jupiter slippage + the handler's signature.
          const isJupiterItem = Boolean(action.item.jupiterSwap);
          if (!isJupiterItem && (action.item.amount <= 0 || action.item.amount > maxAmount)) {
            skippedReasons.push(
              `${(action.item.amount / 10 ** DEMO_DECIMALS).toFixed(2)} USDC-dev exceeds limits`
            );
            continue;
          }
          {
            const added = newItem(action.item);
            updated = {
              ...updated,
              schedule: [...updated.schedule, added],
            };
            syncScheduleAddToDb(added);
          }
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
      syncChatToDb("agent", data.reply);
      if (skippedReasons.length > 0) {
        const skipMsg = `Skipped ${skippedReasons.length} item${skippedReasons.length === 1 ? "" : "s"} over policy: ${skippedReasons.join(", ")}`;
        convoAdds.push(newMessage("system", skipMsg));
        syncChatToDb("system", skipMsg);
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

  // Manual execute on a single item — bypasses the "Lock in & Start"
  // flow so handlers can tap "Execute now" on individual items
  // (e.g. Conservador's yield picks).
  async function executeOne(itemId: string) {
    if (!briefing || !handler) return;
    const item = briefing.schedule.find((i) => i.id === itemId);
    if (!item || item.status !== "queued") return;
    // Ensure ready + live phase so the watcher and approval flow work
    if (!briefing.ready || phase !== "live") {
      const updated = { ...briefing, ready: true };
      setBriefing(updated);
      saveBriefing(handler, updated);
      setPhase("live");
    }
    await dispatchItem(item);
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
    let itemAfter: ScheduleItem | undefined;
    setBriefing((prev) => {
      if (!prev) return prev;
      const next = {
        ...prev,
        schedule: prev.schedule.map((i) => {
          if (i.id === id) {
            const merged = { ...i, ...patch };
            itemAfter = merged;
            return merged;
          }
          return i;
        }),
      };
      if (handler) saveBriefing(handler, next);
      return next;
    });
    if (patch.status) {
      syncScheduleStatusToDb(id, patch.status, {
        txSignature: patch.sig,
        errorMessage: patch.errorMsg,
      });
    }
    // Swap fee on successful execution of a SWAP item
    if (
      patch.status === "done" &&
      itemAfter &&
      itemAfter.vendor?.toUpperCase().startsWith("SWAP")
    ) {
      recordSwapFee(itemAfter);
    }
  }

  async function syncOpportunityCreateToDb(opp: Opportunity): Promise<string | null> {
    if (!dbAgentId || !privyAuthed) return null;
    try {
      const token = await getAccessToken();
      if (!token) return null;
      const res = await fetch(`/api/agents/${dbAgentId}/opportunities`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: opp.title,
          message: opp.message,
          suggested: {
            vendor: opp.suggested.vendor,
            amount: opp.suggested.amount,
            asset: "SOL",
            reason: opp.suggested.reason,
          },
          trigger: opp.suggested.trigger
            ? {
                kind: (opp.suggested.trigger as any).kind,
                basisPrice: (opp.suggested.trigger as any).basisPrice,
                dropPct: (opp.suggested.trigger as any).dropPct,
                targetPrice: (opp.suggested.trigger as any).price,
              }
            : undefined,
          confidence: opp.confidence,
          expiresAt: new Date(opp.expiresAt).toISOString(),
        }),
      });
      if (!res.ok) return null;
      const { opportunity } = await res.json();
      return opportunity?.id ?? null;
    } catch {
      return null;
    }
  }

  async function syncOpportunityStatusToDb(
    oppId: string,
    status: "accepted" | "skipped" | "expired"
  ) {
    if (!dbAgentId || !privyAuthed) return;
    try {
      const token = await getAccessToken();
      if (!token) return;
      await fetch(
        `/api/agents/${dbAgentId}/opportunities?oppId=${encodeURIComponent(oppId)}`,
        {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ status }),
        }
      );
    } catch {
      /* non-fatal */
    }
  }

  async function recordSwapFee(item: ScheduleItem) {
    if (!dbAgentId || !privyAuthed) return;
    try {
      const token = await getAccessToken();
      if (!token) return;
      await fetch(`/api/agents/${dbAgentId}/fees`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          kind: "swap",
          swapInputLamports: item.amount, // base units; 55bps applied server-side
          asset: "SOL",
          relatedTx: item.sig ?? null,
        }),
      });
    } catch (_) {
      /* non-fatal */
    }
  }

  async function dispatchItem(item: ScheduleItem) {
    if (!handle || !setup || !persona || !sawClient) return;

    patchItem(item.id, { status: "executing" });

    // Jupiter swap branch. The item carries the mint pair + amount; we
    // ask the server to build the swap tx (Jupiter quote + serialize),
    // then sign with Phantom directly. Devnet returns a clear 501 so the
    // failure is visible instead of cryptic.
    if (item.jupiterSwap) {
      if (!wallet.publicKey || !wallet.signTransaction) {
        patchItem(item.id, {
          status: "failed",
          errorMsg: "Phantom wallet required to sign Jupiter swaps",
        });
        setMascotPose("idle");
        return;
      }
      try {
        const res = await fetch("/api/agent/build-swap-tx", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            inputMint: item.jupiterSwap.inputMint,
            outputMint: item.jupiterSwap.outputMint,
            amountLamports: item.jupiterSwap.amountLamports,
            slippageBps: item.jupiterSwap.slippageBps,
            userPublicKey: wallet.publicKey.toBase58(),
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          patchItem(item.id, {
            status: "failed",
            errorMsg: data.error ?? `Build failed (${res.status})`,
          });
          setMascotPose("idle");
          return;
        }
        const txBuf = Buffer.from(data.swapTransaction, "base64");
        const vtx = VersionedTransaction.deserialize(txBuf);
        const signed = await wallet.signTransaction(vtx);
        const sig = await connection.sendRawTransaction(signed.serialize(), {
          skipPreflight: false,
        });
        await connection.confirmTransaction(sig, "confirmed");
        patchItem(item.id, { status: "done", sig });
      } catch (e: any) {
        patchItem(item.id, {
          status: "failed",
          errorMsg: e.message ?? String(e),
        });
      }
      setMascotPose("idle");
      return;
    }

    // Destination resolution. By default the demo routes to the built-in
    // recipient keypair, but when the schedule item carries an explicit
    // `toAddress` (from propose_transfer) we transfer to the ATA derived
    // from that pubkey. If the ATA doesn't exist yet, we prepend a
    // create-ATA instruction (agent pays the rent from its gas SOL).
    let destAddr: PublicKey = setup.recipient.publicKey;
    let destAta: PublicKey = setup.recipientAta;
    let createAtaIxs: TransactionInstruction[] = [];
    if (item.toAddress) {
      try {
        destAddr = new PublicKey(item.toAddress);
      } catch {
        patchItem(item.id, {
          status: "failed",
          errorMsg: `Invalid destination address: ${item.toAddress}`,
        });
        setMascotPose("idle");
        return;
      }
      const tokenProgram = await handle.detectTokenProgram(setup.mint);
      destAta = getAssociatedTokenAddressSync(
        setup.mint,
        destAddr,
        true, // allow off-curve PDAs as recipients
        tokenProgram
      );
      const ataInfo = await connection.getAccountInfo(destAta);
      if (!ataInfo) {
        createAtaIxs.push(
          createAssociatedTokenAccountInstruction(
            setup.agent.publicKey,
            destAta,
            destAddr,
            setup.mint,
            tokenProgram
          )
        );
      }
    }

    // SWAP items execute as a real SOL transfer (devnet) from the agent
    // keypair to the SAW treasury. The "receive" leg (USDC) is mocked in
    // DB because Jupiter has no real devnet liquidity. The signature is
    // real and visible on explorer.solana.com/?cluster=devnet.
    // Skip the swap shortcut when toAddress is set — those are real
    // transfers, not mocked swaps.
    if (!item.toAddress && item.vendor?.toUpperCase().startsWith("SWAP")) {
      try {
        const SWAP_LEG_LAMPORTS = 1_000_000; // 0.001 SOL — symbolic, real
        const treasury = getTreasuryAddress();
        const ix = SystemProgram.transfer({
          fromPubkey: setup.agent.publicKey,
          toPubkey: treasury,
          lamports: SWAP_LEG_LAMPORTS,
        });
        const sig = await sendAsAgent([ix]);
        patchItem(item.id, { status: "done", sig });
      } catch (e: any) {
        patchItem(item.id, {
          status: "failed",
          errorMsg: e.message ?? String(e),
        });
      }
      setMascotPose("idle");
      return;
    }

    const overThreshold = item.amount > persona.policy.approvalThreshold;
    // H-2 fix (v1.5 audit): an LLM-proposed destination (item.toAddress) is
    // never a pre-approved recurring recipient. Route it through the approval
    // queue so the OWNER explicitly signs off on the destination, regardless
    // of amount — the schedule-wide "Lock in & Start" is not consent for an
    // arbitrary address. (On-chain recipient_allowlist defaults to allow-all,
    // so this client gate is the consent boundary for arbitrary destinations.)
    const requiresApproval = overThreshold || !!item.toAddress;
    const remaining = persona.policy.dailyLimit - dailySpent;

    if (item.amount > remaining) {
      patchItem(item.id, {
        status: "failed",
        errorMsg: "Daily cap exceeded — wait for tomorrow's reset",
      });
      return;
    }

    if (requiresApproval) {
      try {
        const queue = await handle.fetchQueue();
        const requestId = queue.nextRequestId;
        const requestPda = handle.requestPda(requestId);

        const ix = await sawClient.programs.agentWallet.methods
          .requestPayment(
            destAddr,
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
        const sig = await sendAsAgent([...createAtaIxs, ix]);
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
          destAddr: item.toAddress ? destAddr : undefined,
          destAta: item.toAddress ? destAta : undefined,
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
          destAddr,
          new BN(item.amount),
          Array(32).fill(0) as any
        )
        .accountsPartial({
          wallet: setup.walletPda,
          agent: setup.agent.publicKey,
          policy: handle.policyPda(),
          mint: setup.mint,
          sourceTokenAccount: setup.walletAta,
          recipientTokenAccount: destAta,
          policyProgram: sawClient.programs.policyRegistry.programId,
          tokenProgram,
        })
        .instruction();

      const sig = await sendAsAgent([...createAtaIxs, ix]);
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
          // Route to the propose_transfer destination if the original
          // item carried a custom toAddress; otherwise fall back to the
          // demo's built-in recipient ATA.
          recipientTokenAccount: pendingApproval.destAta ?? setup.recipientAta,
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
    clearAllBriefings(
      handler,
      PERSONAS.map((p) => p.id)
    );
    setHandle(null);
    setSetup(null);
    setActivePersonaIdState(null);
    setBriefings({});
    setDbAgentIds({});
    setDbAgentsMap({});
    setPendingApproval(null);
    setDailySpent(0);
    setWalletBalance(0);
    setPhase("pick");
    setError(null);
    setMascotPose("idle");
    setMarketSnap(null);
    setScanning(false);
    // Allow the auto-bootstrap to re-trigger after a manual reset.
    bootstrapTriggeredRef.current = false;
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
              onClick={() => {
                if (
                  confirm(
                    "Reset everything? This clears all 3 agent conversations and the local setup."
                  )
                )
                  reset();
              }}
              className="text-xs uppercase tracking-widest text-bone/40 hover:text-rust"
              title="Clear all 3 conversations + local setup (on-chain wallet stays)"
            >
              Burn the dossier
            </button>
          )}
          <WalletButton />
        </div>
      </header>

      <div className="border-b border-gold/30 bg-gold/5 px-4 sm:px-6 py-2 text-center">
        <p className="text-xs text-bone/70 inline-flex items-center gap-2 flex-wrap justify-center">
          <span className="text-gold animate-pulse">✱</span>
          <span>
            Gold asterisks across the demo are{" "}
            <span className="text-gold uppercase tracking-widest">vision notes</span>
            {" "}— click any of them to read where I want this feature to go next.
          </span>
        </p>
      </div>

      {/* Persona tabs were the v1.2 multi-agent switcher. v1.3 collapses
          to a single operative so the bar is hidden when there's only one
          briefing slot. The component stays in the tree for the rare
          legacy session that still has 3 slots in localStorage. */}
      {(phase === "briefing" || phase === "live") &&
        activePersonaId &&
        Object.keys(briefings).length > 1 && (
          <PersonaTabs
            activeId={activePersonaId}
            briefings={briefings}
            onSwitch={switchPersona}
          />
        )}

      {(phase === "briefing" || phase === "live") && (
        <div className="px-4 sm:px-6 py-2 max-w-7xl mx-auto w-full space-y-2">
          {/* "Connect a brain" CTA — only when the user has neither
              their own BYOK key nor SAW credits. Disappears the moment
              one of those is in place. */}
          {!apiKey && sawCredits === 0 && (
            <div className="border border-gold/60 bg-gold/5 px-4 py-3 text-sm flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
              <div className="flex items-start gap-3">
                <span className="text-gold text-lg leading-none">🧠</span>
                <div>
                  <div className="text-bone/90 font-medium">
                    Wire up the operative's brain
                  </div>
                  <div className="text-[11px] text-bone/50 mt-1 leading-tight">
                    Use your own LLM key — free at <span className="text-gold">console.groq.com</span> — or pay <span className="text-gold">0.01 SOL</span> and let SAW handle the LLM for 500 calls. Either way, the operative is ready to brief.
                  </div>
                </div>
              </div>
              <button
                onClick={() => setShowApiKeyModal(true)}
                className="text-xs uppercase tracking-widest border border-gold text-gold hover:bg-gold hover:text-ink transition px-3 py-2 whitespace-nowrap"
              >
                Connect API key →
              </button>
            </div>
          )}
          <TopupCard hasApiKey={!!apiKey} onCreditAdded={setSawCredits} />
        </div>
      )}

      {dbAgent && (phase === "briefing" || phase === "live") && (
        <div className="border-b border-ash px-4 sm:px-6 py-2 flex items-center justify-center gap-2 flex-wrap">
          <SleepingBadge
            active={dbAgent.active}
            nextWakeAt={dbAgent.next_wake_at}
            cronCadenceMinutes={dbAgent.cron_cadence_minutes}
            now={now}
          />
          <ProviderBadge apiKey={apiKey} />
          {dbAgentId && (
            <FeeSummary
              agentId={dbAgentId}
              getAccessToken={getAccessToken}
              refreshKey={briefing?.schedule.filter((i) => i.status === "done").length ?? 0}
            />
          )}
          <ConnectTelegramButton />
          <button
            onClick={() => setShowSettings(true)}
            className="text-xs uppercase tracking-widest border border-ash px-3 py-1.5 text-bone/60 hover:text-gold hover:border-gold transition"
          >
            ⚙ settings
          </button>
        </div>
      )}

      <section className="px-4 sm:px-6 py-8 max-w-7xl mx-auto">
        {/* Privy is configured: outer gate is sign-in, not wallet-connect.
            If Privy is not configured (no APP_ID), authenticated is always
            false but we still want the legacy demo to work — fall back to
            wallet.connected check by treating that as the gate. */}
        {process.env.NEXT_PUBLIC_PRIVY_APP_ID && !privyReady ? (
          <LoadingHandler />
        ) : process.env.NEXT_PUBLIC_PRIVY_APP_ID && !privyAuthed ? (
          <SignInGate />
        ) : process.env.NEXT_PUBLIC_PRIVY_APP_ID && handlerState.status === "loading" ? (
          <LoadingHandler />
        ) : process.env.NEXT_PUBLIC_PRIVY_APP_ID && handlerState.status === "error" ? (
          <HandlerError message={handlerState.error} />
        ) : !wallet.connected ? (
          <Idle />
        ) : phase === "pick" ? (
          // Auto-bootstrap fires on wallet.connected; this is the
          // ~1s flash before the setup tx is offered.
          <LoadingHandler />
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
            onExecute={executeOne}
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
            onExecute={executeOne}
          />
        ) : null}

        {dbAgentId && (phase === "briefing" || phase === "live") && (
          <div className="mt-6 max-w-7xl mx-auto">
            <WakesFeed
              agentId={dbAgentId}
              getAccessToken={getAccessToken}
              refreshKey={dbAgent?.last_wake_at ?? undefined as any}
            />
          </div>
        )}
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

      {showSettings && dbAgent && dbAgentId && (
        <AgentSettingsModal
          initialActive={dbAgent.active}
          initialCadenceMinutes={dbAgent.cron_cadence_minutes}
          initialActiveHoursStart={dbAgent.active_hours_start}
          initialActiveHoursEnd={dbAgent.active_hours_end}
          initialAgentName={dbAgent.agent_name ?? basePersona?.name ?? "Operative"}
          saving={savingSettings}
          onClose={() => setShowSettings(false)}
          onSave={async (input) => {
            setSavingSettings(true);
            try {
              const token = await getAccessToken();
              if (!token) throw new Error("not authenticated");
              const res = await fetch(`/api/agents/${dbAgentId}`, {
                method: "PATCH",
                headers: {
                  Authorization: `Bearer ${token}`,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify(input),
              });
              if (!res.ok) throw new Error(`update failed: ${res.status}`);
              const { agent } = await res.json();
              setDbAgent({
                active: agent.active,
                cron_cadence_minutes: agent.cron_cadence_minutes,
                next_wake_at: agent.next_wake_at,
                last_wake_at: agent.last_wake_at,
                active_hours_start: agent.active_hours_start,
                active_hours_end: agent.active_hours_end,
                agent_name: agent.agent_name,
              });
              setShowSettings(false);
            } catch (e: any) {
              alert(`Couldn't save: ${e.message ?? String(e)}`);
            } finally {
              setSavingSettings(false);
            }
          }}
        />
      )}

      <OnboardingTour enabled={phase === "briefing" || phase === "live"} />
    </main>
  );
}

function PersonaTabs({
  activeId,
  briefings,
  onSwitch,
}: {
  activeId: string;
  briefings: Record<string, Briefing>;
  onSwitch: (id: string) => void;
}) {
  const accent: Record<string, string> = {
    greedie: "text-rust border-rust",
    conservador: "text-gold border-gold",
    estable: "text-bone border-bone",
  };
  return (
    <div className="border-b border-ash bg-ink/40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 flex items-stretch overflow-x-auto">
        {PERSONAS.map((p) => {
          const b = briefings[p.id];
          const queued = b?.schedule.filter((i) => i.status === "queued").length ?? 0;
          const pendingOpps =
            b?.opportunities.filter((o) => o.status === "pending").length ?? 0;
          const active = p.id === activeId;
          const accentCls = accent[p.id] ?? "text-bone border-bone";
          return (
            <button
              key={p.id}
              onClick={() => onSwitch(p.id)}
              className={`flex items-center gap-2 px-4 sm:px-5 py-3 text-sm uppercase tracking-widest transition border-b-2 -mb-px whitespace-nowrap ${
                active
                  ? `${accentCls} bg-ink`
                  : "border-transparent text-bone/40 hover:text-bone hover:bg-ink/60"
              }`}
              title={p.tagline}
            >
              <span className={`text-lg ${active ? "" : "opacity-60"}`}>
                {p.glyph}
              </span>
              <span>{p.name}</span>
              {(queued > 0 || pendingOpps > 0) && (
                <span
                  className={`text-[10px] px-1.5 py-0.5 border ${
                    active
                      ? accentCls
                      : "border-ash text-bone/50"
                  }`}
                >
                  {queued + pendingOpps}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Idle() {
  const [showMobileHint, setShowMobileHint] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const ua = navigator.userAgent || "";
    const isMobile = /iPhone|iPad|iPod|Android/i.test(ua);
    const hasPhantom = !!(window as any).phantom?.solana?.isPhantom;
    if (isMobile && !hasPhantom) setShowMobileHint(true);
  }, []);

  function copyUrl() {
    try {
      navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  }

  return (
    <div className="border border-ash p-8 sm:p-12 text-center">
      <p className="stamp mb-6">Awaiting handler</p>
      <h2 className="font-display text-3xl sm:text-4xl mb-4">
        Connect your Phantom.
      </h2>
      <p className="text-bone/60 max-w-xl mx-auto mb-6 text-sm sm:text-base">
        Pick an agent, brief them by chat, then watch them execute the schedule
        on Solana devnet. You sign only what crosses the threshold.
      </p>

      {showMobileHint ? (
        <div className="border border-gold bg-gold/10 p-5 max-w-md mx-auto text-sm text-bone/90 leading-relaxed text-left">
          <span className="text-gold uppercase tracking-widest text-xs block mb-3 text-center">
            📱 Open this in Phantom mobile
          </span>
          <p className="mb-4 text-center text-bone/80">
            The Phantom extension only exists on desktop. On phone you have to load
            the demo from inside the Phantom app's browser.
          </p>
          <ol className="space-y-2 mb-5 text-bone/80">
            <li>
              <span className="text-gold mr-2">1.</span>Open the Phantom mobile app
            </li>
            <li>
              <span className="text-gold mr-2">2.</span>Tap the{" "}
              <span className="text-gold">Browser</span> tab at the bottom
            </li>
            <li>
              <span className="text-gold mr-2">3.</span>Paste this URL and load it
            </li>
            <li>
              <span className="text-gold mr-2">4.</span>Inside Phantom → Settings →
              Developer → switch to <span className="text-gold">Devnet</span>
            </li>
          </ol>
          <button
            onClick={copyUrl}
            className="w-full border border-gold text-gold py-2 text-xs uppercase tracking-widest hover:bg-gold hover:text-ink transition"
          >
            {copied ? "✓ URL copied" : "Copy URL"}
          </button>
        </div>
      ) : (
        <div className="border border-gold/40 bg-gold/5 p-4 max-w-md mx-auto text-sm text-bone/80 leading-relaxed">
          <span className="text-gold uppercase tracking-widest text-xs block mb-2">
            One-time setup
          </span>
          Open Phantom → settings → developer settings → switch network to{" "}
          <span className="text-gold">Devnet</span>. Then click Select Wallet
          above.
        </div>
      )}
    </div>
  );
}

function AgentGate({
  onOpen,
  onCreditAdded,
}: {
  onOpen: () => void;
  onCreditAdded?: (n: number) => void;
}) {
  const providers = [
    { id: "groq", name: "Groq", note: "Free · fast", active: true },
    { id: "gemini", name: "Gemini", note: "Flash-Lite · cheap", active: true },
    { id: "deepseek", name: "DeepSeek", note: "V3 · cheapest", active: true },
    { id: "grok", name: "Grok", note: "xAI · 3 mini", active: true },
    { id: "anthropic", name: "Anthropic", note: "Claude Haiku 4.5", active: true },
    { id: "openai", name: "OpenAI", note: "GPT-4o mini", active: true },
    { id: "cerebras", name: "Cerebras", note: "Llama · fastest", active: true },
    { id: "kimi", name: "Kimi", note: "Moonshot AI", active: true },
  ];

  return (
    <div className="border border-gold p-8 sm:p-12 text-center max-w-3xl mx-auto">
      <p className="stamp mb-6 flex items-center justify-center gap-2">
        Step 2 of 2
        <CreatorNote
          text="Imagine picking a provider per persona — Greedie uses Groq for speed, Conservador uses Claude for reasoning. The wallet doesn't care which model thinks; the policy is enforced on-chain."
          position="center"
        />
      </p>
      <h2 className="font-display text-3xl sm:text-4xl mb-4">
        Pick a brain for your agent.
      </h2>
      <p className="text-bone/70 max-w-xl mx-auto mb-8 leading-relaxed text-sm sm:text-base">
        Your agent uses an LLM to read intent, scan the market, and propose moves.
        Bring your own key from any provider. It stays in your browser, never on our
        servers.
      </p>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
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

      <p className="text-xs text-bone/50 max-w-md mx-auto leading-relaxed mb-8">
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

      <div className="border-t border-ash pt-6 mt-2">
        <p className="text-[10px] uppercase tracking-widest text-bone/40 mb-3">
          Or skip the API key
        </p>
        <p className="text-xs text-bone/60 mb-4 max-w-md mx-auto leading-relaxed">
          Don't want to mess with API keys? Pay <strong className="text-gold">0.01 SOL</strong> and
          SAW puts an LLM behind your agent for the next <strong className="text-gold">500 calls</strong>.
          One signature, no setup.
        </p>
        <TopupCard hasApiKey={false} onCreditAdded={onCreditAdded} />
      </div>
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
      <p className="stamp mb-6 flex items-center gap-2">
        Meet your operative
        <CreatorNote
          text="v1.3 collapses the 3 personas into 1 operative that handles trade, yield, and savings in one conversation. You can rename it from settings — Lobo, Sasha, Cipher, whatever."
          position="bottom-right"
        />
      </p>
      <h2 className="font-display text-5xl mb-4 tracking-tight">
        Brief the operative.
      </h2>
      <p className="text-bone/60 max-w-2xl mb-12 leading-relaxed">
        One agent, full spectrum: trades, finds yield, helps you save. Same
        on-chain wallet, same policy, all the skills in one place. Rename it
        whenever you want.
      </p>
      {error && (
        <div className="mb-8 border border-rust text-rust p-4 text-sm">
          Setup failed: {error}
        </div>
      )}
      <div className="grid md:grid-cols-1 gap-6 max-w-md mx-auto">
        {PERSONAS.filter((p) => p.id === "operative").map((p) => {
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
      <p className="stamp mt-4 mb-2 flex items-center gap-2">
        Briefing {persona.name}
        <CreatorNote
          text="v1.2 collapses what used to be 3 Phantom signatures into 1 atomic on-chain transaction. v1.3 will pre-mint setup gas so even that signature can be optional — gasless onboarding via session signers."
          position="bottom-right"
        />
      </p>
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
  onExecute,
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
  onExecute: (id: string) => void;
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
    <div className="grid grid-cols-1 lg:grid-cols-[3fr_4fr_3fr] gap-4 lg:gap-6">
      {/* LEFT: mascot + identity */}
      <div className="space-y-4">
        <div className="border border-ash p-5 flex flex-col items-center relative">
          <span className="absolute top-2 right-2">
            <CreatorNote
              text="Imagine this as an interactive 3D render — or polished 2D animation with persona-specific gestures (Greedie smirks, Conservador adjusts glasses, Estable nods slowly)."
              position="bottom-left"
              label="vision note · mascot"
            />
          </span>
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
          onExecute={onExecute}
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
  onExecute,
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
  onExecute: (id: string) => void;
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
    <div className="grid grid-cols-1 lg:grid-cols-[2fr_3fr] gap-4 lg:gap-6">
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
        onExecute={onExecute}
        approvalThreshold={persona.policy.approvalThreshold}
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
            <div className="stamp flex items-center gap-2">
              Approval requested
              <CreatorNote
                text="Imagine this as a native Phantom mobile push — vibration, biometric, gone in 2 seconds. The browser modal is just the desktop fallback."
                position="bottom-right"
              />
            </div>
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
