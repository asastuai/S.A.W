"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { MascotPose } from "./mascot";
import { relPointer, lookTarget } from "./fx/fx-math";

/**
 * Operative hologram — a wireframe rendition of the secret-agent operative
 * (fedora + head) rendered in three.js as a rotating, holographic terminal
 * feed. The SVG mascot's signature "blink" becomes a holographic glitch.
 *
 * Same identity, more production. Lazy-loaded (ssr:false) by mascot.tsx and
 * only mounted when the device qualifies (WebGL, not reduced-motion, not a
 * small touch screen) — otherwise the SVG mascot renders instead.
 */

type PoseParams = {
  /** rad/s spin */ speed: number;
  /** bob amplitude */ bob: number;
  /** bob frequency */ bobF: number;
  /** z-lean (rad) */ tilt: number;
  /** x-pitch (rad) */ pitch: number;
  /** body opacity target */ glow: number;
  /** seconds between blinks */ blinkMin: number;
  blinkMax: number;
};

const POSE: Record<MascotPose, PoseParams> = {
  idle: { speed: 0.35, bob: 0.05, bobF: 1.4, tilt: 0, pitch: 0, glow: 0.55, blinkMin: 3, blinkMax: 6 },
  listening: { speed: 0.55, bob: 0.03, bobF: 2.2, tilt: -0.14, pitch: 0.06, glow: 0.72, blinkMin: 2, blinkMax: 4 },
  thinking: { speed: 0.22, bob: 0.06, bobF: 1.0, tilt: 0.1, pitch: -0.18, glow: 0.6, blinkMin: 3, blinkMax: 5 },
  writing: { speed: 0.42, bob: 0.02, bobF: 3.0, tilt: 0.06, pitch: 0.12, glow: 0.62, blinkMin: 2, blinkMax: 3 },
  executing: { speed: 1.35, bob: 0.06, bobF: 3.4, tilt: 0, pitch: 0, glow: 0.98, blinkMin: 1, blinkMax: 2 },
  speaking: { speed: 0.5, bob: 0.045, bobF: 2.6, tilt: 0, pitch: 0, glow: 0.78, blinkMin: 2, blinkMax: 4 },
  sleeping: { speed: 0.08, bob: 0.07, bobF: 0.5, tilt: 0.16, pitch: 0.22, glow: 0.3, blinkMin: 6, blinkMax: 9 },
};

const BASE_Y = -0.35;

function Rig({
  poseRef,
  pointerRef,
}: {
  poseRef: React.MutableRefObject<MascotPose>;
  pointerRef: React.MutableRefObject<{ nx: number; ny: number; near: boolean; over: boolean }>;
}) {
  const group = useRef<THREE.Group>(null);
  const eyes = useRef<THREE.Group>(null);
  const glowRef = useRef(0.55);
  const blink = useRef({ next: 1.5, until: 0, jitter: 0 });

  // Pointer-tracking reactive refs
  const spinFactor = useRef(1);   // 1 = spin libre, →0 cuando near (atención)
  const glowBoost = useRef(0);    // +0.25 cuando over
  const scaleRef = useRef(1);     // →1.04 cuando over
  const prevOver = useRef(false);

  // One shared wireframe material for head + brim + crown, so a single
  // opacity tween dims/brightens the whole operative per pose.
  const bodyMaterial = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: "#f0b429",
        wireframe: true,
        transparent: true,
        opacity: 0.55,
      }),
    []
  );
  useEffect(() => () => bodyMaterial.dispose(), [bodyMaterial]);

  useFrame((state, delta) => {
    const g = group.current;
    if (!g) return;
    const t = state.clock.elapsedTime;
    const p = POSE[poseRef.current] ?? POSE.idle;
    const ptr = pointerRef.current;

    // near → la atención frena el spin y la cabeza sigue el cursor.
    // (spec dice ~35%: implementado como decay→0 mientras trackea — un spin
    // residual pelearía contra el look-at; la vida la pone el bob. Desvío
    // consciente documentado.)
    spinFactor.current = THREE.MathUtils.lerp(spinFactor.current, ptr.near ? 0 : 1, 0.05);
    g.rotation.y += delta * p.speed * spinFactor.current;
    if (ptr.near) {
      const look = lookTarget(ptr.nx, ptr.ny);
      // normalizar el yaw acumulado a [-π, π] para lerpear por el camino corto
      const yaw = Math.atan2(Math.sin(g.rotation.y), Math.cos(g.rotation.y));
      g.rotation.y = THREE.MathUtils.lerp(yaw, look.yaw, 0.08 * (1 - spinFactor.current));
      g.rotation.x = THREE.MathUtils.lerp(g.rotation.x, p.pitch + look.pitch, 0.08);
    } else {
      // not near: pose-driven pitch lerp unchanged (original behavior)
      g.rotation.x = THREE.MathUtils.lerp(g.rotation.x, p.pitch, 0.08);
    }

    g.position.y = BASE_Y + Math.sin(t * p.bobF) * p.bob;
    g.rotation.z = THREE.MathUtils.lerp(g.rotation.z, p.tilt, 0.08);

    // body glow eases toward the pose target
    glowRef.current = THREE.MathUtils.lerp(glowRef.current, p.glow, 0.06);
    bodyMaterial.opacity = glowRef.current;

    // over → glow boost + scale + glitch de saludo en el rising edge
    glowBoost.current = THREE.MathUtils.lerp(glowBoost.current, ptr.over ? 0.25 : 0, 0.08);
    bodyMaterial.opacity = Math.min(1, glowRef.current + glowBoost.current);
    scaleRef.current = THREE.MathUtils.lerp(scaleRef.current, ptr.over ? 1.04 : 1, 0.08);
    g.scale.setScalar(scaleRef.current);
    if (ptr.over && !prevOver.current && blink.current.until === 0) {
      blink.current.next = t; // dispara el glitch holográfico existente YA
    }
    prevOver.current = ptr.over;

    // holographic blink: a brief shudder + eyes cut out, then schedule next
    const b = blink.current;
    if (t > b.next && b.until === 0) {
      b.until = t + 0.12;
      b.jitter = (Math.random() - 0.5) * 0.14;
    }
    if (b.until > 0) {
      g.position.x = b.jitter * Math.sin(t * 80);
      if (eyes.current) eyes.current.visible = false;
      if (t > b.until) {
        b.until = 0;
        b.jitter = 0;
        g.position.x = 0;
        if (eyes.current) eyes.current.visible = true;
        b.next = t + p.blinkMin + Math.random() * (p.blinkMax - p.blinkMin);
      }
    }
  });

  return (
    <group ref={group} position={[0, BASE_Y, 0]}>
      {/* head */}
      <mesh material={bodyMaterial}>
        <sphereGeometry args={[1, 20, 16]} />
      </mesh>
      {/* fedora brim — flattened torus ring */}
      <mesh material={bodyMaterial} position={[0, 0.72, 0]} rotation={[Math.PI / 2, 0, 0]} scale={[1, 1, 0.32]}>
        <torusGeometry args={[1.28, 0.1, 6, 30]} />
      </mesh>
      {/* fedora crown — open truncated cone */}
      <mesh material={bodyMaterial} position={[0, 1.16, 0]}>
        <cylinderGeometry args={[0.72, 0.96, 0.92, 22, 1, true]} />
      </mesh>
      {/* eyes — phosphor points that cut out on blink */}
      <group ref={eyes}>
        <mesh position={[-0.34, 0.06, 0.9]}>
          <sphereGeometry args={[0.11, 10, 10]} />
          <meshBasicMaterial color="#5ad19a" />
        </mesh>
        <mesh position={[0.34, 0.06, 0.9]}>
          <sphereGeometry args={[0.11, 10, 10]} />
          <meshBasicMaterial color="#5ad19a" />
        </mesh>
      </group>
    </group>
  );
}

export function OperativeHologram({ pose = "idle" }: { pose?: MascotPose; size?: number }) {
  const poseRef = useRef<MascotPose>(pose);
  poseRef.current = pose;

  const wrapRef = useRef<HTMLDivElement>(null);
  const pointerRef = useRef({ nx: 0, ny: 0, near: false, over: false });

  useEffect(() => {
    // pointer fine only — qualifies3D ya filtra touch chico, esto cubre tablets
    if (!window.matchMedia("(pointer: fine)").matches) return;
    const onMove = (e: MouseEvent) => {
      const el = wrapRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      // Guard: hidden/unmounted panels have zero-size rect; relPointer would
      // return nx=ny=0 → dist=0 → near=true spuriously. Skip the update.
      if (rect.width === 0) return;
      const { nx, ny } = relPointer(rect, e.clientX, e.clientY);
      const dist = Math.hypot(nx, ny);
      const p = pointerRef.current;
      p.nx = nx;
      p.ny = ny;
      p.near = dist <= 1.5;             // spec: <1.5× del radio del panel
      p.over = Math.abs(nx) <= 1 && Math.abs(ny) <= 1;
    };
    window.addEventListener("mousemove", onMove, { passive: true });
    return () => window.removeEventListener("mousemove", onMove);
  }, []);

  return (
    <div ref={wrapRef} className="sawm-holo relative z-[1] h-full w-full">
      <Canvas
        camera={{ position: [0, 0, 4.2], fov: 42 }}
        dpr={[1, 1.75]}
        gl={{ antialias: true, alpha: true, powerPreference: "low-power" }}
        style={{ width: "100%", height: "100%" }}
      >
        <Rig poseRef={poseRef} pointerRef={pointerRef} />
      </Canvas>
      {/* holographic scanlines layered over the canvas (pure CSS) */}
      <span aria-hidden className="sawm-holo-scan pointer-events-none absolute inset-0" />
      <style jsx>{`
        .sawm-holo {
          filter: drop-shadow(0 0 6px rgba(240, 180, 41, 0.4));
        }
        .sawm-holo-scan {
          background: repeating-linear-gradient(
            0deg,
            rgba(90, 209, 154, 0.06) 0px,
            rgba(90, 209, 154, 0.06) 1px,
            transparent 1px,
            transparent 3px
          );
          mix-blend-mode: screen;
          opacity: 0.5;
        }
      `}</style>
    </div>
  );
}
