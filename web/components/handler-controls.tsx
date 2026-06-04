"use client";

import { useState } from "react";

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/80 backdrop-blur-sm animate-fade-in p-4">
      <div className="w-full max-w-md bg-ink border border-gold p-6 sm:p-8 animate-slide-up max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between mb-6">
          <div>
            <p className="stamp mb-2">Handler controls</p>
            <h2 className="font-display text-2xl">Hold the override</h2>
          </div>
          <button
            onClick={onClose}
            disabled={busy}
            className="text-bone/40 hover:text-bone text-xl leading-none"
          >
            ×
          </button>
        </div>

        <p className="text-bone/50 text-xs leading-relaxed mb-6">
          These are owner-only, on-chain powers. Each one is signed by{" "}
          <span className="text-gold">your</span> wallet in Phantom — the agent
          key can never reach them. Current agent:{" "}
          <span className="font-mono text-bone/70">
            {agentKey.slice(0, 4)}…{agentKey.slice(-4)}
          </span>
        </p>

        <div className="space-y-3">
          {/* Edit policy */}
          <button
            onClick={onEditPolicy}
            disabled={busy}
            className="w-full text-left border border-ash hover:border-gold p-4 transition group disabled:opacity-40"
          >
            <div className="text-sm uppercase tracking-widest text-bone group-hover:text-gold transition">
              ✎ Edit policy
            </div>
            <div className="text-[11px] text-bone/40 mt-1 leading-tight">
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
            <div className="text-sm uppercase tracking-widest text-bone group-hover:text-gold transition">
              ⟳ Rotate agent
            </div>
            <div className="text-[11px] text-bone/40 mt-1 leading-tight">
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
              className="w-full text-left border border-rust/40 hover:border-rust p-4 transition group disabled:opacity-40"
            >
              <div className="text-sm uppercase tracking-widest text-rust/90 group-hover:text-rust transition">
                ⊘ Revoke agent
              </div>
              <div className="text-[11px] text-bone/40 mt-1 leading-tight">
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
              className="w-full text-left border border-rust/40 hover:border-rust p-4 transition group disabled:opacity-40"
            >
              <div className="text-sm uppercase tracking-widest text-rust/90 group-hover:text-rust transition">
                ⤴ Emergency withdraw
              </div>
              <div className="text-[11px] text-bone/40 mt-1 leading-tight">
                Pull the full wallet balance back to you, bypassing policy. The
                kill switch.
              </div>
            </button>
          )}
        </div>

        {(busy || message) && (
          <div
            className={`mt-6 text-xs leading-relaxed ${
              message?.toLowerCase().includes("failed")
                ? "text-rust"
                : "text-gold"
            }`}
          >
            {busy ? "Working… confirm in Phantom." : message}
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
      <div className="text-xs text-bone/80 mb-3 leading-relaxed">{label}</div>
      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={onCancel}
          disabled={busy}
          className="border border-bone/30 text-bone/60 py-2 uppercase tracking-widest text-[10px] hover:border-bone hover:text-bone disabled:opacity-30"
        >
          Cancel
        </button>
        <button
          onClick={onConfirm}
          disabled={busy}
          className="bg-rust text-ink py-2 uppercase tracking-widest text-[10px] hover:bg-bone disabled:opacity-30"
        >
          Confirm
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/80 backdrop-blur-sm animate-fade-in p-4">
      <div className="w-full max-w-md bg-ink border border-gold p-6 sm:p-8 animate-slide-up max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between mb-6">
          <div>
            <p className="stamp mb-2">Edit policy</p>
            <h2 className="font-display text-2xl">Set the boundaries</h2>
          </div>
          <button
            onClick={onClose}
            disabled={busy}
            className="text-bone/40 hover:text-bone text-xl leading-none"
          >
            ×
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
            <label className="text-xs uppercase tracking-widest text-bone/50 mb-2 block">
              Recipient allowlist
            </label>
            <div className="text-[11px] text-bone/40 mb-2 font-mono">
              kept: {lockedRecipient.slice(0, 8)}…{lockedRecipient.slice(-6)}{" "}
              <span className="text-bone/30">(demo recipient)</span>
            </div>
            <textarea
              value={recipients}
              onChange={(e) => setRecipients(e.target.value)}
              disabled={busy}
              rows={3}
              placeholder="Add more addresses, one per line. Unlisted destinations always escalate to your approval."
              className="w-full bg-ink border border-ash px-3 py-2 text-bone text-xs font-mono focus:border-gold outline-none resize-none"
            />
          </div>
        </div>

        {message && (
          <div
            className={`mt-4 text-xs ${
              message.toLowerCase().includes("failed") ? "text-rust" : "text-gold"
            }`}
          >
            {message}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 mt-6">
          <button
            onClick={onClose}
            disabled={busy}
            className="border border-bone/30 text-bone/60 py-3 uppercase tracking-widest text-xs hover:border-bone hover:text-bone disabled:opacity-30"
          >
            Cancel
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
            className="bg-gold text-ink py-3 uppercase tracking-widest text-xs hover:bg-bone disabled:opacity-30"
          >
            {busy ? "Signing…" : "Save on-chain"}
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
      <label className="text-xs uppercase tracking-widest text-bone/50 mb-1 block">
        {label}
      </label>
      <input
        type="number"
        min={0}
        step="any"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="w-full bg-ink border border-ash px-3 py-2 text-bone font-display text-lg focus:border-gold outline-none"
      />
      <div className="text-[10px] text-bone/40 mt-1">{hint}</div>
    </div>
  );
}
