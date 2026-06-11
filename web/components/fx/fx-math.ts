// Math puro de los FX de hover — sin DOM, sin React. Testeable.

export function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

/** Posición del puntero relativa a un rect: mx/my en px locales,
 *  nx/ny normalizados al RADIO (-1..1 dentro; >1 fuera — la near zone
 *  del hologram usa valores sin clamp). */
export function relPointer(
  rect: { left: number; top: number; width: number; height: number },
  clientX: number,
  clientY: number
): { mx: number; my: number; nx: number; ny: number } {
  const mx = clientX - rect.left;
  const my = clientY - rect.top;
  return {
    mx,
    my,
    nx: (mx - rect.width / 2) / (rect.width / 2),
    ny: (my - rect.height / 2) / (rect.height / 2),
  };
}

/** Target de mirada del hologram (spec: clamp ±0.45 rad yaw / ±0.25 rad pitch).
 *  ny positivo (cursor abajo) → pitch negativo (mirar abajo). */
export function lookTarget(nx: number, ny: number): { yaw: number; pitch: number } {
  return { yaw: clamp(nx, -1, 1) * 0.45, pitch: clamp(ny, -1, 1) * -0.25 };
}

const SCRAMBLE_CHARSET = "!<>-_\\/[]{}=+*^?#";

/** Un frame del efecto decode: los primeros floor(progress*len) chars están
 *  asentados, el resto scrambled. Espacios intactos. RNG inyectable. */
export function scrambleFrame(text: string, progress: number, rng: () => number): string {
  const settled = Math.floor(clamp(progress, 0, 1) * text.length);
  let out = "";
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (i < settled || c === " ") out += c;
    else out += SCRAMBLE_CHARSET[Math.floor(rng() * SCRAMBLE_CHARSET.length)];
  }
  return out;
}
