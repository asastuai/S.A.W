"use client";

import { useState } from "react";

const CADENCE_PRESETS = [
  { mins: 15, label: "15 min" },
  { mins: 30, label: "30 min" },
  { mins: 60, label: "1 hour" },
  { mins: 120, label: "2 hours" },
  { mins: 240, label: "4 hours" },
  { mins: 720, label: "12 hours" },
  { mins: 1440, label: "24 hours" },
];

const PROFILE_PRESETS = [
  {
    id: "aggressive" as const,
    label: "Aggressive",
    description: "15-min cadence · 24/7 · catches every move",
    cadenceMinutes: 15,
    hours: null as { start: number; end: number } | null,
  },
  {
    id: "balanced" as const,
    label: "Balanced",
    description: "1-hour cadence · 24/7 · default",
    cadenceMinutes: 60,
    hours: null,
  },
  {
    id: "chill" as const,
    label: "Chill",
    description: "4-hour cadence · 9-18 UTC · sleeps overnight",
    cadenceMinutes: 240,
    hours: { start: 9, end: 18 },
  },
];

const RANDOM_CODENAMES = [
  "Operative",
  "Cipher",
  "Halcón",
  "Sasha",
  "Ace",
  "Vega",
  "Lobo",
  "Argo",
  "Onyx",
  "Sol",
  "Echo",
  "Agent 7",
  "Agent 47",
  "Phantom-X",
  "Specter",
];

function randomCodename(): string {
  return RANDOM_CODENAMES[Math.floor(Math.random() * RANDOM_CODENAMES.length)];
}

export function AgentSettingsModal({
  initialActive,
  initialCadenceMinutes,
  initialActiveHoursStart,
  initialActiveHoursEnd,
  initialAgentName,
  onSave,
  onClose,
  saving,
}: {
  initialActive: boolean;
  initialCadenceMinutes: number;
  initialActiveHoursStart: number | null;
  initialActiveHoursEnd: number | null;
  initialAgentName?: string;
  onSave: (input: {
    active: boolean;
    cronCadenceMinutes: number;
    activeHoursStart: number | null;
    activeHoursEnd: number | null;
    agentName?: string;
  }) => Promise<void>;
  onClose: () => void;
  saving: boolean;
}) {
  const [active, setActive] = useState(initialActive);
  const [cadence, setCadence] = useState(initialCadenceMinutes);
  const [hoursMode, setHoursMode] = useState<"24-7" | "custom">(
    initialActiveHoursStart !== null && initialActiveHoursEnd !== null
      ? "custom"
      : "24-7"
  );
  const [start, setStart] = useState(initialActiveHoursStart ?? 9);
  const [end, setEnd] = useState(initialActiveHoursEnd ?? 18);
  const [agentName, setAgentName] = useState(initialAgentName ?? "Operative");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/80 backdrop-blur-sm animate-fade-in p-4">
      <div className="w-full max-w-md bg-ink border border-gold p-6 sm:p-8 animate-slide-up max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between mb-6">
          <div>
            <p className="stamp mb-2">Agent settings</p>
            <h2 className="font-display text-2xl">Codename, cron, hours</h2>
          </div>
          <button
            onClick={onClose}
            disabled={saving}
            className="text-bone/40 hover:text-bone text-xl leading-none"
          >
            ×
          </button>
        </div>

        <section className="mb-6 p-4 border border-gold/30 bg-gold/5">
          <label className="text-xs uppercase tracking-widest text-gold mb-2 block">
            Codename
          </label>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={agentName}
              onChange={(e) => setAgentName(e.target.value.slice(0, 24))}
              disabled={saving}
              maxLength={24}
              className="flex-1 bg-ink border border-ash px-3 py-2 text-bone font-display text-lg focus:border-gold outline-none"
              placeholder="Operative"
            />
            <button
              onClick={() => setAgentName(randomCodename())}
              disabled={saving}
              className="text-xs uppercase tracking-widest border border-ash text-bone/60 hover:text-gold hover:border-gold px-3 py-2 whitespace-nowrap"
              title="Pick a random codename"
              type="button"
            >
              🎲 random
            </button>
          </div>
          <div className="text-[10px] text-bone/40 mt-2 leading-tight">
            What your agent calls itself in chat. You're the handler; pick any name.
          </div>
        </section>

        <section className="mb-6 p-4 border border-bone/20">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs uppercase tracking-widest text-bone/50 mb-1">
                Auto-wake
              </div>
              <div className="text-sm text-bone/80">
                {active ? "On — agent wakes on cron + chats" : "Silent — agent only acts when you chat"}
              </div>
              <div className="text-[10px] text-bone/40 mt-1">
                {active
                  ? "Uses your LLM tokens on each wake."
                  : "Zero API calls until you message the agent. Default for free-tier users."}
              </div>
            </div>
            <button
              onClick={() => setActive((a) => !a)}
              disabled={saving}
              className={`relative w-14 h-7 rounded-full border transition ${
                active ? "border-gold bg-gold/20" : "border-bone/30 bg-smoke"
              }`}
              aria-label="Toggle auto-wake"
            >
              <span
                className={`absolute top-0.5 w-5 h-5 rounded-full transition-all ${
                  active ? "left-8 bg-gold" : "left-0.5 bg-bone/60"
                }`}
              />
            </button>
          </div>
        </section>

        <section className={`mb-6 ${!active ? "opacity-40 pointer-events-none" : ""}`}>
          <label className="text-xs uppercase tracking-widest text-bone/50 mb-3 block">
            Quick profile
          </label>
          <div className="grid grid-cols-3 gap-2 mb-4">
            {PROFILE_PRESETS.map((p) => (
              <button
                key={p.id}
                onClick={() => {
                  setCadence(p.cadenceMinutes);
                  if (p.hours) {
                    setHoursMode("custom");
                    setStart(p.hours.start);
                    setEnd(p.hours.end);
                  } else {
                    setHoursMode("24-7");
                  }
                }}
                disabled={saving}
                className="border border-ash hover:border-gold p-3 text-left transition group"
              >
                <div className="text-xs uppercase tracking-widest text-bone group-hover:text-gold transition">
                  {p.label}
                </div>
                <div className="text-[10px] text-bone/40 mt-1 leading-tight">
                  {p.description}
                </div>
              </button>
            ))}
          </div>
        </section>

        <section className="mb-6">
          <label className="text-xs uppercase tracking-widest text-bone/50 mb-3 block">
            Wake cadence
          </label>
          <div className="grid grid-cols-4 gap-2">
            {CADENCE_PRESETS.map((p) => (
              <button
                key={p.mins}
                onClick={() => setCadence(p.mins)}
                disabled={saving}
                className={`text-xs uppercase tracking-widest py-2 border transition ${
                  cadence === p.mins
                    ? "border-gold text-gold bg-gold/10"
                    : "border-ash text-bone/60 hover:border-bone/40"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
          <p className="text-bone/40 text-xs mt-2 leading-relaxed">
            How often the agent wakes to scan the market and check triggers.
            Shorter = more responsive, more API calls.
          </p>
        </section>

        <section className="mb-8">
          <label className="text-xs uppercase tracking-widest text-bone/50 mb-3 block">
            Active hours (UTC)
          </label>
          <div className="grid grid-cols-2 gap-2 mb-3">
            <button
              onClick={() => setHoursMode("24-7")}
              disabled={saving}
              className={`text-xs uppercase tracking-widest py-2 border transition ${
                hoursMode === "24-7"
                  ? "border-gold text-gold bg-gold/10"
                  : "border-ash text-bone/60 hover:border-bone/40"
              }`}
            >
              24/7
            </button>
            <button
              onClick={() => setHoursMode("custom")}
              disabled={saving}
              className={`text-xs uppercase tracking-widest py-2 border transition ${
                hoursMode === "custom"
                  ? "border-gold text-gold bg-gold/10"
                  : "border-ash text-bone/60 hover:border-bone/40"
              }`}
            >
              Custom
            </button>
          </div>

          {hoursMode === "custom" && (
            <div className="flex items-center gap-2 text-sm text-bone/70">
              <span>From</span>
              <select
                value={start}
                onChange={(e) => setStart(Number(e.target.value))}
                disabled={saving}
                className="bg-smoke border border-ash text-bone px-2 py-1 text-sm"
              >
                {Array.from({ length: 24 }, (_, i) => i).map((h) => (
                  <option key={h} value={h}>
                    {h.toString().padStart(2, "0")}:00
                  </option>
                ))}
              </select>
              <span>to</span>
              <select
                value={end}
                onChange={(e) => setEnd(Number(e.target.value))}
                disabled={saving}
                className="bg-smoke border border-ash text-bone px-2 py-1 text-sm"
              >
                {Array.from({ length: 24 }, (_, i) => i).map((h) => (
                  <option key={h} value={h}>
                    {h.toString().padStart(2, "0")}:00
                  </option>
                ))}
              </select>
              <span className="text-bone/40 text-xs">UTC</span>
            </div>
          )}
          <p className="text-bone/40 text-xs mt-2 leading-relaxed">
            {hoursMode === "24-7"
              ? "Agent wakes around the clock. Market never sleeps."
              : "Agent skips wakes outside this window. Good if you don't want overnight surprises."}
          </p>
        </section>

        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={onClose}
            disabled={saving}
            className="border border-bone/30 text-bone/60 py-3 uppercase tracking-widest text-xs hover:border-bone hover:text-bone disabled:opacity-30"
          >
            Cancel
          </button>
          <button
            onClick={() =>
              onSave({
                active,
                cronCadenceMinutes: cadence,
                activeHoursStart: hoursMode === "custom" ? start : null,
                activeHoursEnd: hoursMode === "custom" ? end : null,
                agentName: agentName.trim() || "Operative",
              })
            }
            disabled={saving}
            className="bg-gold text-ink py-3 uppercase tracking-widest text-xs hover:bg-bone disabled:opacity-30"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
