import { describe, it, expect } from "vitest";
import { clamp, relPointer, lookTarget, scrambleFrame } from "./fx-math";

describe("clamp", () => {
  it("clampa a los bordes", () => {
    expect(clamp(5, -1, 1)).toBe(1);
    expect(clamp(-5, -1, 1)).toBe(-1);
    expect(clamp(0.3, -1, 1)).toBe(0.3);
  });
});

describe("relPointer", () => {
  const rect = { left: 100, top: 50, width: 200, height: 100 } as DOMRect;
  it("centro → nx=0, ny=0, mx/my en px locales", () => {
    expect(relPointer(rect, 200, 100)).toEqual({ mx: 100, my: 50, nx: 0, ny: 0 });
  });
  it("esquina inferior derecha → nx=1, ny=1", () => {
    const r = relPointer(rect, 300, 150);
    expect(r.nx).toBe(1);
    expect(r.ny).toBe(1);
  });
  it("fuera del rect → nx/ny > 1 (sin clamp — near zone los usa)", () => {
    expect(relPointer(rect, 400, 100).nx).toBe(2);
  });
  it("rect de tamaño cero (elemento oculto) → nx/ny = 0, sin Infinity/NaN", () => {
    const hidden = { left: 0, top: 0, width: 0, height: 0 } as DOMRect;
    expect(relPointer(hidden, 50, 50)).toEqual({ mx: 50, my: 50, nx: 0, ny: 0 });
  });
});

describe("lookTarget", () => {
  it("clampa yaw a ±0.45 y pitch a ±0.25 (spec hologram)", () => {
    expect(lookTarget(2, 2)).toEqual({ yaw: 0.45, pitch: -0.25 });
    expect(lookTarget(-2, -2)).toEqual({ yaw: -0.45, pitch: 0.25 });
  });
  it("dentro del rango es lineal", () => {
    const result = lookTarget(0.5, 0);
    expect(result.yaw).toBe(0.225);
    expect(Object.is(result.pitch, 0) || result.pitch === 0).toBe(true);
  });
});

describe("scrambleFrame", () => {
  const rng = () => 0.42; // RNG inyectado determinístico
  it("progress 0 → todo scrambled (mismo length, distinto contenido)", () => {
    const out = scrambleFrame("DOSSIER", 0, rng);
    expect(out).toHaveLength(7);
    expect(out).not.toBe("DOSSIER");
  });
  it("progress 1 → texto original", () => {
    expect(scrambleFrame("DOSSIER", 1, rng)).toBe("DOSSIER");
  });
  it("settle de izquierda a derecha: progress 0.5 fija la primera mitad", () => {
    const out = scrambleFrame("DOSSIER", 0.5, rng);
    expect(out.slice(0, 3)).toBe("DOS");
    expect(out.slice(3)).not.toBe("SIER");
  });
  it("espacios nunca se scramblean", () => {
    expect(scrambleFrame("A B", 0, rng)[1]).toBe(" ");
  });
});
