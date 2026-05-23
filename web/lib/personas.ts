import { DEMO_DECIMALS } from "./saw";

export type Persona = {
  id: "operative" | "greedie" | "conservador" | "estable";
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

// v1.3: collapsed 3 personas into a single Operative that handles
// trading, yield research, and savings habits in one conversation.
// The user can rename their codename in settings — Operative is the
// default. The 3 old personas are kept for back-compat (legacy DB
// rows) but new setups only create the operative.
export const PERSONAS: Persona[] = [
  {
    id: "operative",
    name: "Operative",
    role: "Personal Operative",
    glyph: "◉",
    mission:
      "Your full-spectrum agent: reads the tape, finds yield, builds saving habits. One conversation, all the skills.",
    tagline: "One handler, one operative, every move.",
    policy: {
      dailyLimit: T(500),
      perTxLimit: T(120),
      approvalThreshold: T(80),
      cooldownSeconds: 0,
    },
    initialFund: T(2000),
    greeting:
      "Operative reporting. I trade, I research yield, I help you build habits. What's the mission?",
  },
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
      approvalThreshold: T(20), // low threshold = everything goes through handler approval
      cooldownSeconds: 0,
    },
    initialFund: T(500),
    greeting:
      "Conservador. I scan yield, rank by safety, and surface picks. I never move without your sign. Tell me how much to evaluate and your risk floor (APR / max-protocol-age / no-restaking, etc.).",
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
      approvalThreshold: T(10), // very low — almost everything queues for handler approval
      cooldownSeconds: 0,
    },
    initialFund: T(500),
    greeting:
      "Estable. I'm not a trader — I'm a coach. Tell me what you're trying to do (save, balance, set aside, build a habit), how much you can spare, and how often. I'll draft a plan and check with you before each step.",
  },
];

export function getPersona(id: string | null): Persona | null {
  if (!id) return null;
  return PERSONAS.find((p) => p.id === id) ?? null;
}
