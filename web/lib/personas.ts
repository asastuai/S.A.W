import { DEMO_DECIMALS } from "./saw";

export type Persona = {
  id: "greedie" | "conservador" | "estable";
  name: string;
  role: string;
  glyph: string;
  mission: string;
  tagline: string;
  policy: {
    dailyLimit: number;
    perTxLimit: number;
    approvalThreshold: number;
    cooldownSeconds: number;
  };
  initialFund: number;
  greeting: string;
  comingSoon?: boolean;
  comingSoonPreview?: string;
};

const T = (n: number) => n * 10 ** DEMO_DECIMALS;

export const PERSONAS: Persona[] = [
  {
    id: "greedie",
    name: "Greedie",
    role: "Degen Operative",
    glyph: "◆",
    mission:
      "Reads the tape, picks moments, executes. Looks for dips, spreads, momentum.",
    tagline: "Patience is just timing in disguise.",
    policy: {
      dailyLimit: T(500),
      perTxLimit: T(120),
      approvalThreshold: T(80),
      cooldownSeconds: 0,
    },
    initialFund: T(1000),
    greeting:
      "Greedie. Tell me what you want to buy or sell, how much, and how aggressive you want me. I'll watch the tape and pick the moment.",
  },
  {
    id: "conservador",
    name: "Conservador",
    role: "Yield Researcher",
    glyph: "▣",
    mission:
      "Scans Solana DeFi for safe yield. Vaults, restaking, stable LPs. Ranks by APR, TVL, audits, activity. Presents — never executes alone.",
    tagline: "Boring is the alpha.",
    policy: {
      dailyLimit: T(300),
      perTxLimit: T(100),
      approvalThreshold: T(50),
      cooldownSeconds: 0,
    },
    initialFund: T(500),
    greeting: "",
    comingSoon: true,
    comingSoonPreview:
      "Will scan Solana yield protocols in real time, rank by safety + APR, surface 5-10 curated picks. Triggers handler approval before any move.",
  },
  {
    id: "estable",
    name: "Estable",
    role: "Personal Wealth Coach",
    glyph: "○",
    mission:
      "Watches your everyday flows. Reminds you to set aside, suggests rebalances, flags overconcentration. Less executor, more counsel.",
    tagline: "Your money has a memory. I keep it honest.",
    policy: {
      dailyLimit: T(200),
      perTxLimit: T(50),
      approvalThreshold: T(30),
      cooldownSeconds: 0,
    },
    initialFund: T(500),
    greeting: "",
    comingSoon: true,
    comingSoonPreview:
      "Will watch your wallet activity over time, recommend allocations, flag drifts, draft monthly retainers. Conversational guru, not a button-pusher.",
  },
];

export function getPersona(id: string | null): Persona | null {
  if (!id) return null;
  return PERSONAS.find((p) => p.id === id) ?? null;
}
