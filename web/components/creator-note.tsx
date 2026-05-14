"use client";

import { useEffect, useRef, useState } from "react";

type Position =
  | "top-right"
  | "top-left"
  | "bottom-right"
  | "bottom-left"
  | "center";

export function CreatorNote({
  text,
  position = "top-right",
  label = "vision note",
}: {
  text: string;
  position?: Position;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const balloonPos: Record<Position, string> = {
    "top-right": "left-full top-0 ml-3",
    "top-left": "right-full top-0 mr-3",
    "bottom-right": "left-full bottom-0 ml-3",
    "bottom-left": "right-full bottom-0 mr-3",
    center: "left-1/2 -translate-x-1/2 top-full mt-3",
  };

  return (
    <span ref={wrapRef} className="relative inline-flex items-center align-middle">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        aria-label="Creator vision note"
        className={`text-gold text-sm leading-none w-5 h-5 inline-flex items-center justify-center rounded-full border border-gold/40 hover:bg-gold hover:text-ink transition ${
          open ? "bg-gold text-ink" : ""
        } animate-pulse`}
      >
        ✱
      </button>

      {open && (
        <span
          className={`absolute z-40 ${balloonPos[position]} w-72 max-w-[80vw] bg-ink/95 border border-gold p-4 shadow-xl text-left normal-case`}
          onClick={(e) => e.stopPropagation()}
        >
          <span className="block text-[10px] uppercase tracking-widest text-gold/70 mb-2">
            ✱ {label}
          </span>
          <span className="block text-bone/85 text-xs leading-relaxed mb-3">
            {text}
          </span>
          <span className="block text-[10px] text-gold/60 italic">— Juan</span>
        </span>
      )}
    </span>
  );
}
