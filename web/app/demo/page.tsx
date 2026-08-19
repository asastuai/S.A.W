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
  toBaseUnits,
  SawClient,
  WalletHandle,
} from "@asastuai/saw-sdk";

import {
  DEMO_DECIMALS,
  clearSetup,
  loadOrCreateAgent,
  loadOrCreateRecipient,
  loadSetup,
  persistAgent,
  saveSetup,
} from "@/lib/saw";
import { PERSONAS, Persona, getPersona } from "@/lib/personas";
import { GuidedTour, hasSeenTour, type TourStep } from "@/components/guided-tour";
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
import {
  HandlerControlsModal,
  PolicyEditorModal,
} from "@/components/handler-controls";
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
import { TerminalPanel } from "@/components/terminal/terminal-panel";
import { CommandLine } from "@/components/terminal/command-line";
import { Caret } from "@/components/terminal/caret";
import { Readout } from "@/components/terminal/readout";

type Phase = "pick" | "setup" | "briefing" | "live";

type Setup = {
  walletPda: PublicKey;
  walletAta: PublicKey;
  recipient: Keypair;
  recipientAta: PublicKey;
  mint: PublicKey;
  agent: Keypair;
};

// Synthetic handler key for guest (no-wallet) demo sessions. Only used as
// a localStorage namespace + non-null placeholder; never signs anything.
const GUEST_HANDLER = PublicKey.default;

// First-visit guided tour. Steps whose anchor isn't mounted are skipped
// automatically, so the same list serves guest and full sessions.
const TOUR_STEPS: TourStep[] = [
  {
    target: "operative",
    title: "your operative",
    body: "One agent, full spectrum. It reads your intent and picks the right tool — trading, yield, transfers, savings. It reacts while it thinks, executes, and sleeps between wakes.",
  },
  {
    target: "chat",
    title: "briefing chat",
    body: 'Chat here directly. Your agent can help with any crypto task you can imagine — ask for APRs, send money, stake, trade. Try: "best safe USDC yield right now".',
  },
  {
    target: "schedule",
    title: "the schedule",
    body: "Every move the agent proposes lands here as a scheduled order. Nothing executes outside your on-chain policy — daily cap, per-tx cap, and the threshold above which YOU sign.",
  },
  {
    target: "brain",
    title: "connect a brain",
    body: "Paste your own LLM key (free at console.groq.com) — or load fuel with SOL and SAW runs the LLM for you. Keys are encrypted server-side and never touch the chain.",
  },
  {
    target: "fuel",
    title: "load fuel",
    body: "0.01 SOL = 500 calls. Fuel is what your agent breathes — when it runs out, it sleeps until you top up. No subscriptions, no card. SOL in, SOL out.",
  },
];

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
  // Handler override controls (owner-signed on-chain powers).
  const [showControls, setShowControls] = useState(false);
  const [showPolicyEditor, setShowPolicyEditor] = useState(false);
  const [ctlBusy, setCtlBusy] = useState(false);
  const [ctlMsg, setCtlMsg] = useState<string | null>(null);
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
  const [guestMode, setGuestMode] = useState<boolean>(false);
  const [showTour, setShowTour] = useState<boolean>(false);
  const executingRef = useRef<boolean>(false);
  const briefingRef = useRef<Briefing | null>(null);

  // Load saved API key on mount
  useEffect(() => {
    setApiKeyState(loadApiKey());
  }, []);

  // ── Guest (no-wallet) demo mode ──────────────────────────────────────
  // Anyone can step in without a wallet, paste an LLM key, and chat with
  // the operative. On-chain execution stays gated behind a real wallet;
  // the chat API already supports anonymous BYOK callers.
  function enterGuestMode() {
    const op = PERSONAS.find((p) => p.id === "operative") ?? PERSONAS[0];
    const saved = loadBriefing(GUEST_HANDLER, op.id);
    const initial: Briefing = saved ?? {
      personaId: op.id,
      conversation: [newMessage("agent", op.greeting)],
      schedule: [],
      opportunities: [],
      ready: false,
    };
    setActivePersonaIdState(op.id);
    setBriefings((prev) => ({ ...prev, [op.id]: initial }));
    setPhase("briefing");
    setGuestMode(true);
    try {
      localStorage.setItem("saw_guest", "1");
    } catch {}
  }
  function exitGuestMode() {
    try {
      localStorage.removeItem("saw_guest");
    } catch {}
    location.reload();
  }
  useEffect(() => {
    try {
      if (localStorage.getItem("saw_guest") === "1") enterGuestMode();
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-show the guided tour the first time the console is usable.
  useEffect(() => {
    if ((phase === "briefing" || phase === "live") && !hasSeenTour()) {
      const t = setTimeout(() => setShowTour(true), 900);
      return () => clearTimeout(t);
    }
  }, [phase]);

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
      // trigger.price is what the /schedule POST reads for below/above; the
      // local Trigger union already names it `price`, so a plain spread is
      // contract-correct (server does trigger.price ?? trigger.targetPrice).
      const triggerBody: any = item.trigger ? { ...item.trigger } : { kind: "time" };

      // ── perp branch ──────────────────────────────────────────────────
      // A perp ScheduleItem carries perpOrder (mirrors the jupiterSwap
      // marker). Persist it as perp-open / perp-close with the perp
      // descriptor + trigger so the row round-trips and the server runs the
      // perp policy. NOTE: do NOT send userOrderId — it is derived
      // server-side from the item id.
      if (item.perpOrder) {
        // perp-close proposals omit side (reduce-only); presence of a side
        // distinguishes open from close.
        const isOpen = item.perpOrder.side === "long" || item.perpOrder.side === "short";
        const body: any = {
          id: item.id,
          actionType: isOpen ? "perp-open" : "perp-close",
          reason: item.reason,
          scheduledFor: item.scheduledFor,
          trigger: triggerBody,
          perp: isOpen
            ? {
                market: item.perpOrder.market,
                side: item.perpOrder.side,
                leverage: item.perpOrder.leverage,
                marginUsdc: item.perpOrder.marginUsdc,
                stopLoss: item.perpOrder.stopLoss,
                takeProfit: item.perpOrder.takeProfit,
              }
            : { market: item.perpOrder.market },
        };
        const res = await fetch(`/api/agents/${dbAgentId}/schedule`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        });
        // Surface the server's authoritative verdict + resulting status.
        // 422 = policy denied (no row created) → mark the local item denied.
        if (res.status === 422) {
          const data = await res.json().catch(() => ({}));
          patchItem(item.id, {
            status: "denied",
            policyVerdict: "denied",
            errorMsg: data?.reason ?? "policy denied",
          });
          return;
        }
        if (res.ok) {
          const data = await res.json().catch(() => ({}));
          const verdict = data?.policyVerdict as
            | ScheduleItem["policyVerdict"]
            | undefined;
          const serverStatus = data?.item?.status as ScheduleItem["status"] | undefined;
          patchItem(item.id, {
            ...(verdict ? { policyVerdict: verdict } : {}),
            ...(serverStatus === "awaiting-approval"
              ? { status: "awaiting-approval" as const }
              : {}),
          });
        }
        return;
      }

      // ── pay / swap branch (unchanged behavior) ──────────────────────
      await fetch(`/api/agents/${dbAgentId}/schedule`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: item.id,
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

  async function syncScheduleRemoveFromDb(itemId: string) {
    if (!dbAgentId || !privyAuthed) return;
    try {
      const token = await getAccessToken();
      if (!token) return;
      await fetch(
        `/api/agents/${dbAgentId}/schedule?itemId=${encodeURIComponent(itemId)}`,
        {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
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

  const handler = wallet.publicKey ?? (guestMode ? GUEST_HANDLER : null);

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

  // Opportunity scanner (operative — requires API key). The unified
  // operative "reads the tape", so the market scanner + opportunity reel
  // (and its alert chime/notification) run for it. Pre-v1.3 this was gated
  // to the now-retired "greedie" persona id, which stranded the whole
  // feature behind dead code.
  useEffect(() => {
    if (persona?.id !== "operative" || !handler) return;
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

  // Market price poller (operative)
  useEffect(() => {
    if (persona?.id !== "operative") return;
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
                perpOrder?: ScheduleItem["perpOrder"];
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
          // Perp items are margin (collateral) denominated, not USDC-dev
          // spend; their ceilings are enforced by the perp policy server-side
          // (evaluatePerpPolicy on the /schedule POST), so skip the USDC-dev
          // gate the same way Jupiter swaps are exempted.
          const isPerpItem = Boolean(action.item.perpOrder);
          if (
            !isJupiterItem &&
            !isPerpItem &&
            (action.item.amount <= 0 || action.item.amount > maxAmount)
          ) {
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
          syncScheduleRemoveFromDb(action.id);
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
    // Propagate the delete to the DB — otherwise the row survives and the
    // next session's hydration (DB is source of truth) brings the item back.
    syncScheduleRemoveFromDb(id);
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

    // Perp execution is the worker's job (SUR/Drift devnet — see
    // worker/src/lib/dispatch-perp.ts). The demo ends at "scheduled /
    // approved": it persists + gates the perp and surfaces its policy
    // verdict, but must NEVER fire an on-chain tx for it. A perp item
    // carries `perpOrder` but no `jupiterSwap`/`toAddress` and its vendor
    // does not start with "SWAP", so without this guard it would fall
    // through to the generic payDirect/requestPayment path below and
    // wrongly move its margin as USDC-dev to the SAW treasury. Leave it
    // at its current status (queued / awaiting-approval).
    if (item.perpOrder) return;

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
    // arbitrary address. NOTE: the ON-CHAIN policy is now the primary consent
    // boundary — an unlisted recipient escalates to owner approval in
    // policy_registry::evaluate_policy. This client gate is redundant
    // defense-in-depth; do NOT remove the on-chain gate assuming it's the only one.
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

  // ── Perp approval (DB-only) ─────────────────────────────────────────
  // Unlike pay/swap approval (which signs an on-chain approveAndExecute ix),
  // a perp item awaiting approval is gated purely at the DB layer: the
  // /schedule PATCH requires the handler's Privy JWT, so this click IS the
  // human approval. We PATCH { status:"queued", approve:true } — the only
  // way the server lets awaiting-approval → queued through (403 otherwise).
  // Actual on-chain execution is the worker's job (SUR devnet), NOT the demo.
  async function approvePerpItem(itemId: string) {
    if (!handler || !briefing || !dbAgentId || !privyAuthed) return;
    const item = briefing.schedule.find((i) => i.id === itemId);
    if (!item || item.status !== "awaiting-approval") return;
    try {
      const token = await getAccessToken();
      if (!token) return;
      const res = await fetch(
        `/api/agents/${dbAgentId}/schedule?itemId=${encodeURIComponent(itemId)}`,
        {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ status: "queued", approve: true }),
        }
      );
      if (!res.ok) return;
      // Update local state directly — going through patchItem would re-PATCH
      // status without the approve flag (and the gated transition is already
      // committed server-side here).
      setBriefing((prev) => {
        if (!prev) return prev;
        const next = {
          ...prev,
          schedule: prev.schedule.map((i) =>
            i.id === itemId ? { ...i, status: "queued" as const } : i
          ),
        };
        if (handler) saveBriefing(handler, next);
        return next;
      });
    } catch (_) {
      /* non-fatal */
    }
  }

  // Deny a perp item awaiting approval: remove it (DB is source of truth, so
  // we DELETE the row). Mirrors the "kill"/rm persistence in removeItem.
  async function denyPerpItem(itemId: string) {
    if (!handler || !briefing) return;
    const item = briefing.schedule.find((i) => i.id === itemId);
    if (!item || item.status !== "awaiting-approval") return;
    const updated = {
      ...briefing,
      schedule: briefing.schedule.filter((i) => i.id !== itemId),
    };
    setBriefing(updated);
    saveBriefing(handler, updated);
    syncScheduleRemoveFromDb(itemId);
  }

  // ── Handler override controls ───────────────────────────────────────
  // Owner-signed on-chain powers. Each builds the instruction with
  // owner = the Phantom wallet, then signs + sends it the same way
  // approvePending does. The agent key is never involved.
  async function ownerSignSend(
    ixs: TransactionInstruction[]
  ): Promise<string> {
    if (!wallet.publicKey || !wallet.signTransaction)
      throw new Error("connect your wallet");
    const tx = new Transaction();
    ixs.forEach((ix) => tx.add(ix));
    tx.feePayer = wallet.publicKey;
    tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
    const signed = await wallet.signTransaction(tx);
    const sig = await connection.sendRawTransaction(signed.serialize());
    await connection.confirmTransaction(sig, "confirmed");
    return sig;
  }

  async function handleEmergencyWithdraw() {
    if (!sawClient || !setup || !handle || !wallet.publicKey) return;
    setCtlBusy(true);
    setCtlMsg(null);
    try {
      const ownerAta = getAssociatedTokenAddressSync(
        setup.mint,
        wallet.publicKey
      );
      const ixs: TransactionInstruction[] = [];
      // emergency_withdraw transfers into the owner's ATA — create it first
      // if the handler has never held this mint.
      if (!(await connection.getAccountInfo(ownerAta))) {
        ixs.push(
          createAssociatedTokenAccountInstruction(
            wallet.publicKey,
            ownerAta,
            wallet.publicKey,
            setup.mint
          )
        );
      }
      const ix = await sawClient.programs.agentWallet.methods
        .emergencyWithdraw()
        .accountsPartial({
          wallet: setup.walletPda,
          owner: wallet.publicKey,
          policy: handle.policyPda(),
          policyProgram: sawClient.programs.policyRegistry.programId,
          mint: setup.mint,
          sourceTokenAccount: setup.walletAta,
          ownerTokenAccount: ownerAta,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .instruction();
      ixs.push(ix);
      const sig = await ownerSignSend(ixs);
      setCtlMsg(`Funds pulled back to your wallet. tx ${sig.slice(0, 8)}…`);
      await refreshState(handle, setup.walletAta);
    } catch (e: any) {
      setCtlMsg(`Withdraw failed: ${e.message ?? String(e)}`);
    } finally {
      setCtlBusy(false);
    }
  }

  async function handleRevokeAgent() {
    if (!sawClient || !setup || !wallet.publicKey) return;
    setCtlBusy(true);
    setCtlMsg(null);
    try {
      const ix = await sawClient.programs.agentWallet.methods
        .revokeAgent()
        .accountsPartial({ wallet: setup.walletPda, owner: wallet.publicKey })
        .instruction();
      const sig = await ownerSignSend([ix]);
      setCtlMsg(`Agent frozen. It can't spend until you rotate in a new key. tx ${sig.slice(0, 8)}…`);
    } catch (e: any) {
      setCtlMsg(`Revoke failed: ${e.message ?? String(e)}`);
    } finally {
      setCtlBusy(false);
    }
  }

  async function handleRotateAgent() {
    if (!sawClient || !setup || !wallet.publicKey || !handler) return;
    setCtlBusy(true);
    setCtlMsg(null);
    try {
      const fresh = Keypair.generate();
      const setIx = await sawClient.programs.agentWallet.methods
        .setAgent(fresh.publicKey)
        .accountsPartial({ wallet: setup.walletPda, owner: wallet.publicKey })
        .instruction();
      // Fund the new agent so the browser dispatcher can pay tx fees as it.
      const fundIx = SystemProgram.transfer({
        fromPubkey: wallet.publicKey,
        toPubkey: fresh.publicKey,
        lamports: 0.02 * LAMPORTS_PER_SOL,
      });
      const sig = await ownerSignSend([setIx, fundIx]);
      persistAgent(handler, fresh);
      setSetup({ ...setup, agent: fresh });
      setCtlMsg(`Agent rotated to a fresh key. tx ${sig.slice(0, 8)}…`);
    } catch (e: any) {
      setCtlMsg(`Rotate failed: ${e.message ?? String(e)}`);
    } finally {
      setCtlBusy(false);
    }
  }

  async function handleSavePolicy(input: {
    dailyLimit: number;
    perTxLimit: number;
    approvalThreshold: number;
    extraRecipients: string[];
  }) {
    if (!sawClient || !setup || !handle || !wallet.publicKey) return;
    setCtlBusy(true);
    setCtlMsg(null);
    try {
      // Always keep the demo's built-in recipient so the sample pay flow
      // keeps working; append any extra addresses the handler entered.
      const recipientAllowlist = [
        setup.recipient.publicKey,
        ...input.extraRecipients.map((a) => new PublicKey(a)),
      ];
      const params = buildPolicy({
        mint: setup.mint,
        dailyLimit: toBaseUnits(input.dailyLimit, DEMO_DECIMALS),
        perTxLimit: toBaseUnits(input.perTxLimit, DEMO_DECIMALS),
        approvalThreshold: toBaseUnits(input.approvalThreshold, DEMO_DECIMALS),
        recipientAllowlist,
      });
      const ix = await sawClient.programs.policyRegistry.methods
        .setPolicy(params as any)
        .accountsPartial({ policy: handle.policyPda(), owner: wallet.publicKey })
        .instruction();
      const sig = await ownerSignSend([ix]);
      setCtlMsg(`Policy updated on-chain. tx ${sig.slice(0, 8)}…`);
      setShowPolicyEditor(false);
    } catch (e: any) {
      setCtlMsg(`Policy update failed: ${e.message ?? String(e)}`);
    } finally {
      setCtlBusy(false);
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
      <header className="border-b border-ash bg-obsidian/60 px-4 sm:px-6 py-4 flex items-center justify-between gap-3 flex-wrap">
        <Link
          href="/"
          className="group inline-flex items-baseline gap-2 font-mono text-sm tracking-widest"
          title="saw://handler_console"
        >
          <span aria-hidden="true" className="select-none font-semibold text-gold">
            $
          </span>
          <span className="font-display text-xl tracking-[0.35em] text-cream group-hover:text-gold transition">
            SAW
          </span>
          <span className="hidden sm:inline text-bone/40 normal-case tracking-normal">
            ://handler_console
          </span>
          <Caret className="hidden sm:inline-block" />
        </Link>
        <div className="flex items-center gap-2 sm:gap-3 flex-wrap justify-end">
          <button
            data-tour="brain"
            onClick={() => setShowApiKeyModal(true)}
            className={`font-mono text-[11px] uppercase tracking-widest border px-3 py-1.5 transition ${
              apiKey
                ? "border-phosphor/50 text-phosphor hover:bg-phosphor hover:text-obsidian"
                : "border-rust text-rust hover:bg-rust hover:text-obsidian animate-pulse"
            }`}
            title={apiKey ? "Agent connected" : "No agent connected"}
          >
            {apiKey ? "● brain --linked" : "○ brain --connect"}
          </button>
          {(phase === "briefing" || phase === "live") && (
            <button
              onClick={() => setShowTour(true)}
              className="font-mono text-[11px] uppercase tracking-widest text-bone/60 hover:text-gold border border-ash hover:border-gold/50 px-3 py-1.5 transition"
              title="Replay the guided tour"
            >
              man --tour
            </button>
          )}
          {phase === "live" && (
            <button
              onClick={backToBriefing}
              className="font-mono text-[11px] uppercase tracking-widest text-bone/60 hover:text-gold border border-ash hover:border-gold/50 px-3 py-1.5 transition"
            >
              cd ../brief
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
              className="font-mono text-[11px] uppercase tracking-widest text-bone/40 hover:text-rust transition"
              title="Clear all 3 conversations + local setup (on-chain wallet stays)"
            >
              rm -rf --dossier
            </button>
          )}
          <WalletButton />
        </div>
      </header>

      <div className="border-b border-gold/30 bg-gold/5 px-4 sm:px-6 py-2 text-center">
        <p className="font-mono text-xs text-bone/70 inline-flex items-center gap-2 flex-wrap justify-center">
          <span aria-hidden="true" className="text-gold/40 select-none">#</span>
          <span className="text-gold animate-pulse">✱</span>
          <span>
            Gold asterisks across the console are{" "}
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
        <div className="px-4 sm:px-6 py-2 max-w-7xl mx-auto w-full space-y-2" data-tour="fuel">
          {/* "Connect a brain" CTA — only when the user has neither
              their own BYOK key nor SAW credits. Disappears the moment
              one of those is in place. */}
          {!apiKey && sawCredits === 0 && (
            <TerminalPanel
              label="brain · unlinked"
              className="px-4 py-3 text-sm flex flex-col sm:flex-row sm:items-center gap-3 justify-between"
            >
              <div className="flex items-start gap-3">
                <span aria-hidden="true" className="text-gold text-lg leading-none">🧠</span>
                <div>
                  <div className="text-bone/90 font-medium font-mono">
                    <CommandLine prompt="$">saw link --brain</CommandLine>
                  </div>
                  <div className="text-[11px] text-bone/50 mt-1 leading-tight font-mono">
                    Use your own LLM key — free at <span className="text-gold">console.groq.com</span> — or pay <span className="text-gold">0.01 SOL</span> and let SAW handle the LLM for 500 calls. Either way, the operative is ready to brief.
                  </div>
                </div>
              </div>
              <button
                onClick={() => setShowApiKeyModal(true)}
                className="font-mono text-[11px] uppercase tracking-widest border border-gold text-gold hover:bg-gold hover:text-obsidian transition px-3 py-2 whitespace-nowrap"
              >
                link --key →
              </button>
            </TerminalPanel>
          )}
          <TopupCard hasApiKey={!!apiKey} onCreditAdded={setSawCredits} />
        </div>
      )}

      {dbAgent && (phase === "briefing" || phase === "live") && (
        <div className="border-b border-ash bg-ink/40 px-4 sm:px-6 py-2 flex items-center justify-center gap-2 flex-wrap">
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
            className="font-mono text-[11px] uppercase tracking-widest border border-ash px-3 py-1.5 text-bone/60 hover:text-gold hover:border-gold transition"
          >
            saw config
          </button>
          {setup && (
            <button
              onClick={() => {
                setCtlMsg(null);
                setShowControls(true);
              }}
              className="font-mono text-[11px] uppercase tracking-widest border border-gold/50 px-3 py-1.5 text-gold/80 hover:text-obsidian hover:bg-gold transition"
            >
              sudo --override
            </button>
          )}
        </div>
      )}

      {showTour && (
        <GuidedTour steps={TOUR_STEPS} onClose={() => setShowTour(false)} />
      )}

      <section className="px-4 sm:px-6 py-8 max-w-7xl mx-auto">
        {/* Privy is configured: outer gate is sign-in, not wallet-connect.
            If Privy is not configured (no APP_ID), authenticated is always
            false but we still want the legacy demo to work — fall back to
            wallet.connected check by treating that as the gate. */}
        {guestMode && persona && briefing ? (
          <div>
            <div className="mb-4 border border-gold/40 bg-gold/5 px-4 py-2 flex items-center justify-between gap-3 flex-wrap">
              <p className="font-mono text-xs text-bone/70">
                <span className="text-gold uppercase tracking-widest">demo mode</span>
                {" "}— no wallet, chat-only. On-chain execution unlocks when you
                connect Phantom.
              </p>
              <button
                onClick={exitGuestMode}
                className="font-mono text-[11px] uppercase tracking-widest text-bone/50 hover:text-gold transition"
              >
                exit --demo
              </button>
            </div>
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
              onApprove={approvePerpItem}
              onDeny={denyPerpItem}
              onStart={startExecution}
              onAcceptOpp={acceptOpportunity}
              onSkipOpp={skipOpportunity}
            />
          </div>
        ) : process.env.NEXT_PUBLIC_PRIVY_APP_ID && !privyReady ? (
          <LoadingHandler />
        ) : process.env.NEXT_PUBLIC_PRIVY_APP_ID && !privyAuthed ? (
          <SignInGate onGuest={enterGuestMode} />
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
            onApprove={approvePerpItem}
            onDeny={denyPerpItem}
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
            onApprove={approvePerpItem}
            onDeny={denyPerpItem}
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

      {showControls && setup && persona && (
        <HandlerControlsModal
          agentKey={setup.agent.publicKey.toBase58()}
          busy={ctlBusy}
          message={ctlMsg}
          onEditPolicy={() => {
            setCtlMsg(null);
            setShowPolicyEditor(true);
          }}
          onRotate={handleRotateAgent}
          onRevoke={handleRevokeAgent}
          onWithdraw={handleEmergencyWithdraw}
          onClose={() => setShowControls(false)}
        />
      )}

      {showPolicyEditor && setup && persona && (
        <PolicyEditorModal
          initialDaily={persona.policy.dailyLimit / 10 ** DEMO_DECIMALS}
          initialPerTx={persona.policy.perTxLimit / 10 ** DEMO_DECIMALS}
          initialThreshold={persona.policy.approvalThreshold / 10 ** DEMO_DECIMALS}
          lockedRecipient={setup.recipient.publicKey.toBase58()}
          busy={ctlBusy}
          message={ctlMsg}
          onSave={handleSavePolicy}
          onClose={() => setShowPolicyEditor(false)}
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
              className={`flex items-center gap-2 px-4 sm:px-5 py-3 font-mono text-sm uppercase tracking-widest transition border-b-2 -mb-px whitespace-nowrap ${
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
    <TerminalPanel label="auth · awaiting handler" className="p-8 sm:p-12 text-center">
      <p className="font-mono text-[11px] uppercase tracking-widest text-phosphor/80 mb-6">
        <CommandLine prompt="$">saw login --wallet phantom</CommandLine>
      </p>
      <h2 className="font-display text-3xl sm:text-4xl mb-4">
        Connect your Phantom.<Caret className="ml-2 align-middle" />
      </h2>
      <p className="font-mono text-bone/60 max-w-xl mx-auto mb-6 text-sm sm:text-base">
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
    </TerminalPanel>
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
          text="Pick any of these 8 brains for your operative — swap it whenever you want. The wallet doesn't care which model thinks: the policy is enforced on-chain, so a smarter (or dumber) LLM never widens what the agent is allowed to do."
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
            onClick={onOpen}
            className="relative border border-gold text-bone hover:bg-gold/10 cursor-pointer p-4 text-left transition"
          >
            <div className="font-display text-base sm:text-lg mb-1">{p.name}</div>
            <div className="text-[10px] uppercase tracking-widest opacity-70">
              {p.note}
            </div>
            <span className="absolute top-1 right-1 text-[9px] uppercase tracking-widest text-gold">
              ●
            </span>
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
        — 1 minute, no card required. All 8 providers are live; pick any.
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
        {PERSONAS.filter((p) => p.id === "operative").map((p) => (
          <button
            key={p.id}
            onClick={() => onPick(p)}
            className="text-left border border-ash hover:border-gold p-6 transition group relative"
          >
            <div className="flex justify-center mb-3">
              <Mascot pose="idle" size={120} glyph={p.glyph} />
            </div>
            <div className="stamp mb-3">{p.role}</div>
            <h3 className="font-display text-3xl mb-3">{p.name}</h3>
            <p className="text-bone/70 text-sm mb-4 leading-relaxed">
              {p.mission}
            </p>
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
            <div className="text-xs uppercase tracking-widest text-gold group-hover:translate-x-1 transition">
              Brief {p.name} →
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

function MarketTicker({ snap }: { snap: MarketSnapshot | null }) {
  if (!snap) {
    return (
      <TerminalPanel label="tail -f tape" className="p-3 font-mono text-xs text-bone/40 italic">
        Reading the tape…<Caret className="ml-1" />
      </TerminalPanel>
    );
  }
  const positive = snap.change24hPct >= 0;
  return (
    <TerminalPanel label={`tail -f tape · ${snap.asset}`} className="p-3 space-y-1">
      <div className="flex items-baseline gap-3">
        <span className="font-display text-2xl text-bone">
          ${snap.priceUsd.toFixed(2)}
        </span>
        <span
          className={`font-mono text-xs ${positive ? "text-phosphor" : "text-rust"}`}
        >
          {positive ? "+" : ""}
          {snap.change24hPct.toFixed(2)}%
        </span>
      </div>
      <div className="font-mono text-xs text-bone/50">
        24h ${snap.low24hUsd.toFixed(2)} → ${snap.high24hUsd.toFixed(2)}
      </div>
    </TerminalPanel>
  );
}

function SetupOverlay({ step, persona }: { step: string; persona: Persona }) {
  return (
    <TerminalPanel
      label="provisioning · on-chain"
      className="p-12 text-center min-h-[400px] flex flex-col items-center justify-center"
    >
      <Mascot pose="thinking" size={140} glyph={persona.glyph} />
      <p className="stamp mt-4 mb-2 flex items-center gap-2">
        Briefing {persona.name}
        <CreatorNote
          text="v1.2 collapses what used to be 3 Phantom signatures into 1 atomic on-chain transaction. v1.3 will pre-mint setup gas so even that signature can be optional — gasless onboarding via session signers."
          position="bottom-right"
        />
      </p>
      <h2 className="font-display text-3xl mb-3">{persona.tagline}</h2>
      <p className="font-mono text-bone/60 text-sm mb-8">
        One signature. Phantom prompts you once — wallet, policy, mint, and
        funding settle in a single atomic transaction.
      </p>
      <div className="font-mono text-bone/80 text-sm inline-flex items-center justify-center gap-2">
        <span aria-hidden="true" className="text-phosphor select-none">&gt;</span>
        {step || "Working…"}
        <Caret />
      </div>
    </TerminalPanel>
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
  onApprove,
  onDeny,
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
  onApprove: (id: string) => void;
  onDeny: (id: string) => void;
  onStart: () => void;
  onAcceptOpp: (opp: Opportunity) => void;
  onSkipOpp: (opp: Opportunity) => void;
}) {
  const showMarket = persona.id === "operative";
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
      <div className="space-y-4" data-tour="operative">
        <TerminalPanel label="operative" className="p-5 flex flex-col items-center">
          <span className="absolute top-2 right-2 z-10">
            <CreatorNote
              text="Imagine the operative as an interactive 3D render — or a polished 2D animation that reacts to what it's doing: leaning in when it spots a move, nodding when it executes, still when it sleeps. Today it's a clean glyph; the personality layer is a later pass."
              position="bottom-left"
              label="vision note · mascot"
            />
          </span>
          <Mascot pose={mascotPose} size={180} glyph={persona.glyph} />
          <div className="stamp mt-4">{persona.role}</div>
          <h2 className="font-display text-2xl mt-1">{persona.name}</h2>
          <p className="font-mono text-bone/60 text-xs italic text-center mt-2">
            {persona.tagline}
          </p>
        </TerminalPanel>
        {showMarket && <MarketTicker snap={marketSnap} />}
        <TerminalPanel label="policy --ceilings" className="p-4 space-y-2 text-xs">
          <Row label="Daily" value={fmt(persona.policy.dailyLimit)} />
          <Row label="Per-tx" value={fmt(persona.policy.perTxLimit)} />
          <Row label="Threshold" value={fmt(persona.policy.approvalThreshold)} accent />
          <Row label="Balance" value={fmt(walletBalance)} />
        </TerminalPanel>
      </div>

      {/* MIDDLE: chat */}
      <div data-tour="chat">
        <Chat messages={briefing.conversation} onSend={onSend} busy={chatBusy} />
      </div>

      {/* RIGHT: schedule preview + start */}
      <div className="space-y-4" data-tour="schedule">
        <ScheduleView
          items={briefing.schedule}
          now={now}
          onRemove={onRemove}
          onExecute={onExecute}
          onApprove={onApprove}
          onDeny={onDeny}
          approvalThreshold={persona.policy.approvalThreshold}
        />
        <button
          onClick={onStart}
          disabled={briefing.schedule.length === 0}
          className="w-full bg-gold text-obsidian font-mono py-4 uppercase tracking-widest text-sm hover:bg-goldlit disabled:opacity-30 disabled:cursor-not-allowed transition"
        >
          {briefing.schedule.length === 0
            ? "// build the schedule via chat"
            : `saw run --queue ${briefing.schedule.length} →`}
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
  onApprove,
  onDeny,
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
  onApprove: (id: string) => void;
  onDeny: (id: string) => void;
}) {
  const showMarket = persona.id === "operative";
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
        <TerminalPanel label="status · live" className="p-5">
          <div className="flex items-start gap-4 mb-4">
            <Mascot pose={mascotPose} size={110} glyph={persona.glyph} />
            <div className="flex-1">
              <div className="stamp mb-2">{persona.role}</div>
              <h2 className="font-display text-2xl">{persona.name}</h2>
              <span className="inline-flex items-center gap-1.5 mt-2 font-mono text-[11px] uppercase tracking-widest border border-phosphor/50 text-phosphor px-2 py-0.5">
                <span aria-hidden="true" className="animate-pulse">●</span> on mission
              </span>
            </div>
          </div>
          <div className="font-mono text-[11px] uppercase tracking-widest text-bone/50 mb-2">
            Daily budget
          </div>
          <div className="relative h-3 bg-smoke overflow-hidden mb-2">
            <div
              className="absolute inset-y-0 left-0 bg-gold transition-all duration-500"
              style={{ width: `${dailyPct}%` }}
            />
            <div
              className="absolute inset-y-0 w-px bg-phosphor/80"
              style={{ left: `${thresholdPct}%` }}
              title="Approval threshold"
            />
          </div>
          <div className="flex justify-between font-mono text-xs text-bone/60">
            <span>{fmt(dailySpent)} spent</span>
            <span>of {fmt(persona.policy.dailyLimit)}</span>
          </div>
        </TerminalPanel>

        {showMarket && <MarketTicker snap={marketSnap} />}

        {upcoming && (
          <TerminalPanel label="next --up" className="bg-gold/5 p-5">
            <div className="font-mono text-[11px] uppercase tracking-widest text-gold mb-2">
              Queued
              {upcoming.trigger && upcoming.trigger.kind !== "time"
                ? " · waiting for trigger"
                : secsToNext !== null && secsToNext > 0
                ? ` · in ${secsToNext}s`
                : ""}
            </div>
            <div className="font-display text-2xl text-bone mb-1">
              {fmt(upcoming.amount)}
            </div>
            <div className="font-mono text-bone/70 text-sm">→ {upcoming.vendor}</div>
            <div className="font-mono text-bone/50 text-xs italic mt-1">
              "{upcoming.reason}"
            </div>
            {upcoming.trigger && upcoming.trigger.kind !== "time" && (
              <div className="mt-3 pt-3 border-t border-gold/20 font-mono text-xs text-gold/80">
                ▸ {describeTrigger(upcoming)}
                {marketSnap && (
                  <span className="text-bone/50 ml-2">
                    (now ${marketSnap.priceUsd.toFixed(2)})
                  </span>
                )}
              </div>
            )}
          </TerminalPanel>
        )}

        <div className="grid grid-cols-2 gap-px bg-ash">
          <div className="bg-ink p-4">
            <div className="font-mono text-[11px] uppercase tracking-widest text-bone/50 mb-1">
              Wallet balance
            </div>
            <div className="font-display text-2xl">{fmt(walletBalance)}</div>
          </div>
          <div className="bg-ink p-4">
            <div className="font-mono text-[11px] uppercase tracking-widest text-bone/50 mb-1">
              Threshold
            </div>
            <div className="font-display text-2xl text-gold">
              {fmt(persona.policy.approvalThreshold)}
            </div>
          </div>
        </div>

        <TerminalPanel label="on-chain --identities" className="p-4">
          <div className="space-y-2 text-xs">
            <Identity label="Wallet" value={setup.walletPda} />
            <Identity label="Agent" value={setup.agent.publicKey} />
            <Identity label="Mint" value={setup.mint} />
          </div>
        </TerminalPanel>
      </div>

      <ScheduleView
        items={briefing.schedule}
        now={now}
        onExecute={onExecute}
        onApprove={onApprove}
        onDeny={onDeny}
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
    <div className="flex items-center justify-between gap-3 font-mono">
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
    <div className="flex items-center justify-between gap-3 font-mono">
      <span className="text-bone/40 uppercase tracking-widest">{label}</span>
      <a
        href={`https://explorer.solana.com/address/${s}?cluster=devnet`}
        target="_blank"
        rel="noreferrer"
        className="text-bone/70 hover:text-gold"
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
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-obsidian/80 backdrop-blur-sm animate-fade-in">
      <TerminalPanel
        label="override · signature required"
        className="w-full max-w-2xl m-4 mb-8 p-8 animate-slide-up shadow-glow-lg"
      >
        <div className="flex items-center gap-4 mb-6">
          <Mascot pose="thinking" size={80} glyph={persona.glyph} />
          <div>
            <div className="stamp flex items-center gap-2">
              Approval requested
              <CreatorNote
                text="Closed-tab alerts are real now: install the PWA, turn on the bell, and a web push reaches you when a trigger goes ready. Biometric one-tap approval via passkeys is the next layer; this browser modal is today's approval surface."
                position="bottom-right"
              />
            </div>
            <div className="text-bone font-display text-xl">{persona.name}</div>
          </div>
        </div>
        <div className="mb-6">
          <div className="font-mono text-bone/50 text-[11px] uppercase tracking-widest mb-2">
            <CommandLine prompt="$">saw pay --to {vendor}</CommandLine>
          </div>
          <div className="font-display text-5xl text-gold mb-1">
            {fmt(amount)}
          </div>
          <div className="font-mono text-bone/70">→ {vendor}</div>
        </div>
        <div className="border-l-2 border-gold/40 pl-4 mb-8">
          <div className="font-mono text-bone/40 text-[11px] uppercase tracking-widest mb-1">
            {persona.name}'s reasoning
          </div>
          <div className="font-mono text-bone/80 italic">"{reason}"</div>
        </div>
        <div className="font-mono text-xs text-bone/50 mb-6 leading-relaxed">
          This payment exceeds the approval threshold you set on-chain. Without
          your signature it sits in the queue and never executes. The agent
          cannot bypass you.
        </div>
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={onDeny}
            className="border border-rust text-rust font-mono py-4 uppercase tracking-widest text-sm hover:bg-rust hover:text-obsidian transition"
          >
            deny
          </button>
          <button
            onClick={onApprove}
            className="bg-gold text-obsidian font-mono py-4 uppercase tracking-widest text-sm hover:bg-goldlit transition"
          >
            approve --sign
          </button>
        </div>
      </TerminalPanel>
    </div>
  );
}
