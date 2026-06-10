"use client";

import { useState } from "react";
import { Caret } from "@/components/terminal/caret";
import { Readout } from "@/components/terminal/readout";

/**
 * The handler's override surface. These are the owner-only powers the
 * landing page promises ("Rotate the operative. Revoke at will. Pull funds
 * out at any moment.") — each one an owner-signed on-chain instruction the
 * agent key can never reach. Until now they lived only in the SDK/program;
 * this modal makes them reachable in the product.
 */
export function HandlerControlsModal({
  agentKey,
  busy,
  message,
  onEditPolicy,
  onRotate,
  onRevoke,
  onWithdraw,
  onClose,
}: {
  agentKey: string;
  busy: boolean;
  message: string | null;
  onEditPolicy: () => void;
  onRotate: () => void;
  onRevoke: () => void;
  onWithdraw: () => void;
  onClose: () => void;
}) {
  const [confirm, setConfirm] = useState<null | "revoke" | "withdraw">(null);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-obsidian/85 backdrop-blur-sm animate-fade-in p-4">
      <div className="relative w-full max-w-md bg-ink border border-rust/70 shadow-[0_0_56px_-8px_rgba(212,81,46,0.4)] p-6 sm:p-8 animate-slide-up max-h-[90vh] overflow-y-auto">
        {/* Corner bracket marks — danger frame for the override surface. */}
        <span aria-hidden="true" className="pointer-events-none absolute -left-px -top-px font-mono text-[10px] leading-none text-rust/60">┌</span>
        <span aria-hidden="true" className="pointer-events-none absolute -right-px -top-px font-mono text-[10px] leading-none text-rust/60">┐</span>
        <span aria-hidden="true" className="pointer-events-none absolute -bottom-px -left-px font-mono text-[10px] leading-none text-rust/60">└</span>
        <span aria-hidden="true" className="pointer-events-none absolute -bottom-px -right-px font-mono text-[10px] leading-none text-rust/60">┘</span>
        {/* Inlaid danger label riding the top border. */}
        <span className="pointer-events-none absolute -top-[7px] left-5 bg-ink px-1 font-mono text-[10px] uppercase tracking-widest text-rust">
          <span aria-hidden="true" className="text-rust/50">┤</span> override panel <span aria-hidden="true" className="text-rust/50">├</span>
        </span>

        <div className="flex items-start justify-between mb-5">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-rust mb-2">⚠ owner authority · root</p>
            <h2 className="font-display text-2xl uppercase tracking-tight">
              Hold the override<Caret className="ml-1" />
            </h2>
          </div>
          <button
            onClick={onClose}
            disabled={busy}
            aria-label="close override panel"
            className="font-mono text-bone/40 hover:text-rust text-base leading-none border border-ash hover:border-rust/60 px-2 py-1 transition disabled:opacity-40"
          >
            esc ×
          </button>
        </div>

        <div className="border border-ash bg-smoke/40 px-3 py-2 mb-5">
          <p className="text-bone/55 text-[11px] leading-relaxed font-mono">
            <span className="text-gold">$</span> saw override --session{" "}
            <span className="text-phosphor">authenticated</span>
            <br />
            owner-signed on-chain powers. each instruction is signed by{" "}
            <span className="text-gold">your</span> wallet in Phantom — the agent
            key can never reach them.
          </p>
          <div className="mt-2 pt-2 border-t border-ash/60">
            <Readout
              items={[
                { label: "agent", value: `${agentKey.slice(0, 4)}…${agentKey.slice(-4)}`, tone: "bone" },
                { label: "scope", value: "owner-only", tone: "gold" },
                { label: "chain", value: "devnet", tone: "phosphor" },
              ]}
            />
          </div>
        </div>

        <div className="space-y-3">
          {/* Edit policy */}
          <button
            onClick={onEditPolicy}
            disabled={busy}
            className="w-full text-left border border-ash hover:border-gold p-4 transition group disabled:opacity-40"
          >
            <div className="font-mono text-sm text-bone group-hover:text-gold transition">
              <span className="select-none text-gold/60 group-hover:text-gold">$</span>{" "}
              saw policy <span className="text-gold">--edit</span>
            </div>
            <div className="text-[11px] text-bone/40 mt-1.5 leading-tight font-mono">
              Change daily cap, per-tx cap, approval threshold, and the
              recipient allowlist. Enforced on-chain.
            </div>
          </button>

          {/* Rotate agent */}
          <button
            onClick={onRotate}
            disabled={busy}
            className="w-full text-left border border-ash hover:border-gold p-4 transition group disabled:opacity-40"
          >
            <div className="font-mono text-sm text-bone group-hover:text-gold transition">
              <span className="select-none text-gold/60 group-hover:text-gold">$</span>{" "}
              saw agent <span className="text-gold">--rotate</span>
            </div>
            <div className="text-[11px] text-bone/40 mt-1.5 leading-tight font-mono">
              Swap the agent to a fresh keypair (and fund it). Keeps the funds
              and history; a compromised key stops working.
            </div>
          </button>

          {/* Revoke agent */}
          {confirm === "revoke" ? (
            <ConfirmRow
              label="Freeze the agent? It can't spend until you set a new one."
              busy={busy}
              onCancel={() => setConfirm(null)}
              onConfirm={() => {
                setConfirm(null);
                onRevoke();
              }}
            />
          ) : (
            <button
              onClick={() => setConfirm("revoke")}
              disabled={busy}
              className="w-full text-left border border-rust/40 hover:border-rust hover:bg-rust/5 p-4 transition group disabled:opacity-40"
            >
              <div className="font-mono text-sm text-rust/90 group-hover:text-rust transition">
                <span className="select-none text-rust/60 group-hover:text-rust">$</span>{" "}
                saw agent <span className="font-semibold text-rust">--revoke</span>{" "}
                <span className="text-rust/50 text-[10px] uppercase tracking-widest">[danger]</span>
              </div>
              <div className="text-[11px] text-bone/40 mt-1.5 leading-tight font-mono">
                Freeze the agent immediately. Funds stay put; nothing can move
                until you rotate in a new key.
              </div>
            </button>
          )}

          {/* Emergency withdraw */}
          {confirm === "withdraw" ? (
            <ConfirmRow
              label="Pull the entire balance back to your wallet now?"
              busy={busy}
              onCancel={() => setConfirm(null)}
              onConfirm={() => {
                setConfirm(null);
                onWithdraw();
              }}
            />
          ) : (
            <button
              onClick={() => setConfirm("withdraw")}
              disabled={busy}
              className="w-full text-left border border-rust/40 hover:border-rust hover:bg-rust/5 p-4 transition group disabled:opacity-40"
            >
              <div className="font-mono text-sm text-rust/90 group-hover:text-rust transition">
                <span className="select-none text-rust/60 group-hover:text-rust">$</span>{" "}
                saw withdraw <span className="font-semibold text-rust">--emergency --all</span>{" "}
                <span className="text-rust/50 text-[10px] uppercase tracking-widest">[kill-switch]</span>
              </div>
              <div className="text-[11px] text-bone/40 mt-1.5 leading-tight font-mono">
                Pull the full wallet balance back to you, bypassing policy. The
                kill switch.
              </div>
            </button>
          )}
        </div>

        {(busy || message) && (
          <div
            className={`mt-6 border-t border-ash pt-3 font-mono text-xs leading-relaxed ${
              message?.toLowerCase().includes("failed")
                ? "text-rust"
                : "text-gold"
            }`}
          >
            <span aria-hidden="true" className="mr-1 text-bone/40">
              &gt;
            </span>
            {busy ? (
              <>
                Working… confirm in Phantom.<Caret className="ml-1" />
              </>
            ) : (
              message
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function ConfirmRow({
  label,
  busy,
  onConfirm,
  onCancel,
}: {
  label: string;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="border border-rust p-4 bg-rust/5">
      <div className="text-xs text-bone/80 mb-3 leading-relaxed font-mono">
        <span className="text-rust mr-1">⚠</span>
        {label}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={onCancel}
          disabled={busy}
          className="font-mono border border-bone/30 text-bone/60 py-2 uppercase tracking-widest text-[10px] hover:border-bone hover:text-bone disabled:opacity-30 transition"
        >
          abort
        </button>
        <button
          onClick={onConfirm}
          disabled={busy}
          className="font-mono bg-rust text-ink py-2 uppercase tracking-widest text-[10px] hover:bg-goldlit disabled:opacity-30 transition"
        >
          confirm ↵
        </button>
      </div>
    </div>
  );
}

/**
 * Edit the on-chain policy: caps, threshold, and the recipient allowlist.
 * The demo's built-in recipient is always kept (so the sample pay flow keeps
 * working); the handler can add more pre-authorized destinations. Amounts are
 * human USDC-dev and converted to base-units before set_policy is signed.
 */
export function PolicyEditorModal({
  initialDaily,
  initialPerTx,
  initialThreshold,
  lockedRecipient,
  busy,
  message,
  onSave,
  onClose,
}: {
  initialDaily: number;
  initialPerTx: number;
  initialThreshold: number;
  lockedRecipient: string;
  busy: boolean;
  message: string | null;
  onSave: (input: {
    dailyLimit: number;
    perTxLimit: number;
    approvalThreshold: number;
    extraRecipients: string[];
  }) => void | Promise<void>;
  onClose: () => void;
}) {
  const [daily, setDaily] = useState(String(initialDaily));
  const [perTx, setPerTx] = useState(String(initialPerTx));
  const [threshold, setThreshold] = useState(String(initialThreshold));
  const [recipients, setRecipients] = useState("");

  const num = (s: string) => {
    const n = Number(s);
    return Number.isFinite(n) && n >= 0 ? n : null;
  };
  const dailyN = num(daily);
  const perTxN = num(perTx);
  const thresholdN = num(threshold);
  const valid = dailyN !== null && perTxN !== null && thresholdN !== null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-obsidian/85 backdrop-blur-sm animate-fade-in p-4">
      <div className="relative w-full max-w-md bg-ink border border-gold shadow-glow p-6 sm:p-8 animate-slide-up max-h-[90vh] overflow-y-auto">
        {/* Corner bracket marks — TUI frame for the policy editor. */}
        <span aria-hidden="true" className="pointer-events-none absolute -left-px -top-px font-mono text-[10px] leading-none text-gold/40">┌</span>
        <span aria-hidden="true" className="pointer-events-none absolute -right-px -top-px font-mono text-[10px] leading-none text-gold/40">┐</span>
        <span aria-hidden="true" className="pointer-events-none absolute -bottom-px -left-px font-mono text-[10px] leading-none text-gold/40">└</span>
        <span aria-hidden="true" className="pointer-events-none absolute -bottom-px -right-px font-mono text-[10px] leading-none text-gold/40">┘</span>
        <span className="pointer-events-none absolute -top-[7px] left-5 bg-ink px-1 font-mono text-[10px] uppercase tracking-widest text-gold">
          <span aria-hidden="true" className="text-gold/40">┤</span> set_policy <span aria-hidden="true" className="text-gold/40">├</span>
        </span>

        <div className="flex items-start justify-between mb-6">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-gold mb-2">$ saw policy --edit</p>
            <h2 className="font-display text-2xl uppercase tracking-tight">
              Set the boundaries<Caret className="ml-1" />
            </h2>
          </div>
          <button
            onClick={onClose}
            disabled={busy}
            aria-label="close policy editor"
            className="font-mono text-bone/40 hover:text-bone text-base leading-none border border-ash hover:border-gold/60 px-2 py-1 transition disabled:opacity-40"
          >
            esc ×
          </button>
        </div>

        <div className="space-y-4">
          <Field
            label="Daily cap (USDC-dev)"
            value={daily}
            onChange={setDaily}
            disabled={busy}
            hint="Most the agent can spend per UTC day."
          />
          <Field
            label="Per-transaction cap (USDC-dev)"
            value={perTx}
            onChange={setPerTx}
            disabled={busy}
            hint="Hard ceiling on any single transfer."
          />
          <Field
            label="Approval threshold (USDC-dev)"
            value={threshold}
            onChange={setThreshold}
            disabled={busy}
            hint="Anything above this routes to your signature."
          />

          <div>
            <label className="font-mono text-xs uppercase tracking-widest text-bone/50 mb-2 block">
              <span className="text-gold/60">--</span> recipient allowlist
            </label>
            <div className="text-[11px] text-bone/40 mb-2 font-mono">
              <span className="text-phosphor">kept:</span> {lockedRecipient.slice(0, 8)}…{lockedRecipient.slice(-6)}{" "}
              <span className="text-bone/30">(demo recipient)</span>
            </div>
            <textarea
              value={recipients}
              onChange={(e) => setRecipients(e.target.value)}
              disabled={busy}
              rows={3}
              placeholder="Add more addresses, one per line. Unlisted destinations always escalate to your approval."
              className="w-full bg-smoke border border-ash px-3 py-2 text-bone text-xs font-mono focus:border-gold outline-none resize-none"
            />
          </div>
        </div>

        {message && (
          <div
            className={`mt-4 border-t border-ash pt-3 font-mono text-xs ${
              message.toLowerCase().includes("failed") ? "text-rust" : "text-gold"
            }`}
          >
            <span aria-hidden="true" className="mr-1 text-bone/40">
              &gt;
            </span>
            {message}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 mt-6">
          <button
            onClick={onClose}
            disabled={busy}
            className="font-mono border border-bone/30 text-bone/60 py-3 uppercase tracking-widest text-xs hover:border-bone hover:text-bone disabled:opacity-30 transition"
          >
            abort
          </button>
          <button
            onClick={() =>
              valid &&
              onSave({
                dailyLimit: dailyN!,
                perTxLimit: perTxN!,
                approvalThreshold: thresholdN!,
                extraRecipients: recipients
                  .split(/\s+/)
                  .map((s) => s.trim())
                  .filter(Boolean),
              })
            }
            disabled={busy || !valid}
            className="font-mono bg-gold text-ink py-3 uppercase tracking-widest text-xs hover:bg-goldlit disabled:opacity-30 transition"
          >
            {busy ? "signing…" : "commit on-chain ↵"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  disabled,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled: boolean;
  hint: string;
}) {
  return (
    <div>
      <label className="font-mono text-xs uppercase tracking-widest text-bone/50 mb-1 block">
        <span className="text-gold/60">--</span> {label}
      </label>
      <input
        type="number"
        min={0}
        step="any"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="w-full bg-smoke border border-ash px-3 py-2 text-bone font-display text-lg focus:border-gold outline-none"
      />
      <div className="text-[10px] text-bone/40 mt-1 font-mono">{hint}</div>
    </div>
  );
}
