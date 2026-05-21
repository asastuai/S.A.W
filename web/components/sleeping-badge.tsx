"use client";

/**
 * Visual badge showing the agent's cron status:
 *   - "Sleeping. Next wake in 47m" (when nextWakeAt > now)
 *   - "Waking now…" (when nextWakeAt <= now, the worker is presumably firing)
 *   - "Idle — cron not set" (when nextWakeAt is null)
 *
 * Reads the live clock via `now` prop (the demo already ticks every second).
 */
export function SleepingBadge({
  nextWakeAt,
  cronCadenceMinutes,
  now,
}: {
  nextWakeAt: string | null;
  cronCadenceMinutes: number;
  now: number;
}) {
  if (!nextWakeAt) {
    return (
      <div className="inline-flex items-center gap-2 px-3 py-1.5 border border-ash text-xs uppercase tracking-widest text-bone/40">
        <span>○ idle · cron not set</span>
      </div>
    );
  }

  const wakeMs = new Date(nextWakeAt).getTime();
  const diffMs = wakeMs - now;
  const cadenceLabel = `${cronCadenceMinutes}m cadence`;

  if (diffMs <= 0) {
    return (
      <div className="inline-flex items-center gap-2 px-3 py-1.5 border border-gold text-xs uppercase tracking-widest text-gold animate-pulse">
        <span>● waking now</span>
        <span className="text-bone/40 normal-case tracking-normal text-[10px]">
          {cadenceLabel}
        </span>
      </div>
    );
  }

  const totalSec = Math.floor(diffMs / 1000);
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;

  let countdown: string;
  if (mins >= 60) {
    const hours = Math.floor(mins / 60);
    countdown = `${hours}h ${mins % 60}m`;
  } else if (mins > 0) {
    countdown = `${mins}m ${secs.toString().padStart(2, "0")}s`;
  } else {
    countdown = `${secs}s`;
  }

  return (
    <div className="inline-flex items-center gap-2 px-3 py-1.5 border border-bone/30 text-xs uppercase tracking-widest text-bone/70">
      <span>💤 sleeping · next wake in {countdown}</span>
      <span className="text-bone/30 normal-case tracking-normal text-[10px]">
        {cadenceLabel}
      </span>
    </div>
  );
}
