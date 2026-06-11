"use client";
import { useEffect, useState } from "react";

/** Doble kill-switch del spec: FX solo con pointer fine Y sin reduced-motion.
 *  false en SSR y hasta el primer effect (los FX arrancan apagados). */
export function useFxEnabled(): boolean {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    const fine = window.matchMedia("(pointer: fine)");
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setEnabled(fine.matches && !motion.matches);
    update();
    fine.addEventListener("change", update);
    motion.addEventListener("change", update);
    return () => {
      fine.removeEventListener("change", update);
      motion.removeEventListener("change", update);
    };
  }, []);
  return enabled;
}
