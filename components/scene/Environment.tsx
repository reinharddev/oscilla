"use client";

import { useMemo } from "react";
import { CanvasTexture, PlaneGeometry, SRGBColorSpace } from "three";
import type { WarehouseLayout } from "@/lib/layout-schema";
import { useStore } from "@/lib/store";
import { PALETTE } from "@/lib/theme";
import { BOX_COLORS, Parcel } from "./Models";

/** Billboard text tag drawn on a canvas (no extra React roots, unlike drei <Html>). */
function Label({ position, text, color, anchor = "left" }: { position: [number, number, number]; text: string; color: string; anchor?: "left" | "center" }) {
  const P = PALETTE[useStore((st) => st.theme)];
  const { tex, aspect } = useMemo(() => {
    const c = document.createElement("canvas");
    const ctx = c.getContext("2d")!;
    const font = "600 26px ui-monospace, Menlo, monospace";
    ctx.font = font;
    const w = Math.ceil(ctx.measureText(text.toUpperCase()).width) + 28, h = 44;
    c.width = w * 2; c.height = h * 2;
    ctx.scale(2, 2);
    ctx.font = font;
    ctx.fillStyle = P.labelBg;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(2, 2, w - 4, h - 4, 8);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = P.labelText;
    ctx.textBaseline = "middle";
    ctx.fillText(text.toUpperCase(), 14, h / 2 + 1);
    const t = new CanvasTexture(c);
    t.colorSpace = SRGBColorSpace;
    return { tex: t, aspect: w / h };
  }, [text, color, P]);
  const H = 0.55, W = H * aspect;
  return (
    <sprite position={[position[0] + (anchor === "left" ? W / 2 : 0), position[1], position[2]]} scale={[W, H, 1]} renderOrder={10}>
      <spriteMaterial map={tex} transparent depthTest={false} toneMapped={false} />
    </sprite>
  );
}

const rnd = (n: number) => { const x = Math.sin(n * 127.1) * 43758.5453; return x - Math.floor(x); };

export function Rack({ z, x0, bays, levels = 3, row }: { z: number; x0: number; bays: number; levels?: number; row: number }) {
  const bayW = 2, depth = 1.2, lh = 1.15;
  const L = bayW * bays;
  const cx = x0 + L / 2;
  return (
    <group position={[cx, 0, z]}>
      {Array.from({ length: bays + 1 }).map((_, i) =>
        [-1, 1].map((s) => (
          <mesh key={`${i}${s}`} castShadow position={[-L / 2 + i * bayW, (levels * lh) / 2 + 0.05, (s * (depth - 0.08)) / 2]}>
            <boxGeometry args={[0.09, levels * lh + 0.1, 0.09]} />
            <meshStandardMaterial color="#a9b8ff" roughness={0.5} />
          </mesh>
        ))
      )}
      {Array.from({ length: levels }).map((_, lv) => (
        <group key={lv} position={[0, 0.35 + lv * lh, 0]}>
          {[-1, 1].map((s) => (
            <mesh key={s} position={[0, 0, (s * (depth - 0.08)) / 2]}>
              <boxGeometry args={[L, 0.1, 0.07]} />
              <meshStandardMaterial color="#ffc2a1" roughness={0.5} />
            </mesh>
          ))}
          <mesh receiveShadow position={[0, 0.05, 0]}>
            <boxGeometry args={[L, 0.03, depth - 0.1]} />
            <meshStandardMaterial color="#e0e5f3" roughness={0.8} />
          </mesh>
          {Array.from({ length: bays }).map((_, b) => {
            const seed = row * 100 + lv * 10 + b;
            const n = rnd(seed) > 0.12 ? (rnd(seed + 1) > 0.5 ? 2 : 1) : 0;
            return Array.from({ length: n }).map((__, k) => (
              <Parcel
                key={`${b}-${k}`}
                size={[0.8, 0.55 + rnd(seed + k) * 0.25, depth - 0.35]}
                color={BOX_COLORS[Math.floor(rnd(seed + k + 7) * BOX_COLORS.length)]}
                position={[-L / 2 + b * bayW + 0.55 + k * 0.85, 0.065, 0]}
              />
            ));
          })}
        </group>
      ))}
    </group>
  );
}

function ZoneOutline({ x, z, w, d, color }: { x: number; z: number; w: number; d: number; color: string }) {
  const geo = useMemo(() => new PlaneGeometry(w, d), [w, d]);
  return (
    <lineSegments position={[x, 0.02, z]} rotation={[-Math.PI / 2, 0, 0]}>
      <edgesGeometry args={[geo]} />
      <lineBasicMaterial color={color} transparent opacity={0.9} />
    </lineSegments>
  );
}

export function Floor({ layout }: { layout: WarehouseLayout }) {
  const FLOOR = layout.floor, ZONES = layout.zones, TRUCK_X = layout.dock?.roadX ?? 13.7;
  const w = FLOOR.x1 - FLOOR.x0, d = FLOOR.z1 - FLOOR.z0, cx = (FLOOR.x0 + FLOOR.x1) / 2;
  const layers = useStore((s) => s.layers);
  const theme = useStore((s) => s.theme);
  const P = PALETTE[theme];
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.06, 0]} receiveShadow>
        <planeGeometry args={[140, 140]} />
        <meshStandardMaterial color={P.ground} roughness={1} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[TRUCK_X, -0.04, 0]} receiveShadow>
        <planeGeometry args={[3.6, 80]} />
        <meshStandardMaterial color={P.road} roughness={1} />
      </mesh>
      {Array.from({ length: 16 }).map((_, i) => (
        <mesh key={i} rotation={[-Math.PI / 2, 0, 0]} position={[TRUCK_X + 1.5, -0.03, -20 + i * 2.6]}>
          <planeGeometry args={[0.1, 1.3]} />
          <meshBasicMaterial color={P.roadDash} />
        </mesh>
      ))}
      <mesh position={[cx, -0.15, 0]} receiveShadow castShadow>
        <boxGeometry args={[w + 0.4, 0.3, d + 0.4]} />
        <meshStandardMaterial color={P.slab} roughness={0.9} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[cx, 0.002, 0]} receiveShadow>
        <planeGeometry args={[w, d]} />
        <meshStandardMaterial color={P.floor} roughness={0.75} />
      </mesh>
      <gridHelper key={theme} args={[26, 26, P.grid1, P.grid2]} position={[cx, 0.006, 0]} />
      {layers.zones && ZONES.map((z) => (
        <group key={z.id}>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[z.x, 0.012, z.z]}>
            <planeGeometry args={[z.w, z.d]} />
            <meshBasicMaterial color={z.color} transparent opacity={P.zoneOpacity} depthWrite={false} />
          </mesh>
          <ZoneOutline x={z.x} z={z.z} w={z.w} d={z.d} color={z.color} />
        </group>
      ))}
      {layers.labels && ZONES.map((z) => (
        <Label key={`l${z.id}`} position={[z.x - z.w / 2 + 0.2, 0.6, z.z + z.d / 2 - 0.2]} text={z.name} color={z.color} />
      ))}
    </group>
  );
}

export function Walls({ floor }: { floor: WarehouseLayout["floor"] }) {
  const { x0, x1, z0, z1 } = floor;
  const P = PALETTE[useStore((st) => st.theme)];
  const H = 2.4;
  const mat = <meshStandardMaterial color={P.wall} roughness={0.8} />;
  return (
    <group>
      <mesh castShadow position={[(x0 + x1) / 2, H / 2, z0 - 0.15]}>
        <boxGeometry args={[x1 - x0 + 0.6, H, 0.3]} />
        {mat}
      </mesh>
      <mesh castShadow position={[x0 - 0.15, H / 2, (z0 + z1) / 2]}>
        <boxGeometry args={[0.3, H, z1 - z0]} />
        {mat}
      </mesh>
      <mesh position={[(x0 + x1) / 2, H + 0.04, z0 - 0.15]}>
        <boxGeometry args={[x1 - x0 + 0.6, 0.08, 0.34]} />
        <meshStandardMaterial color="#8ec9ff" emissive="#8ec9ff" emissiveIntensity={0.3} />
      </mesh>
      <mesh position={[x0 - 0.15, H + 0.04, (z0 + z1) / 2]}>
        <boxGeometry args={[0.34, 0.08, z1 - z0]} />
        <meshStandardMaterial color="#c5b8ff" emissive="#c5b8ff" emissiveIntensity={0.3} />
      </mesh>
    </group>
  );
}

export function Dock({ dock }: { dock: NonNullable<WarehouseLayout["dock"]> }) {
  const labels = useStore((s) => s.layers.labels);
  const zMin = Math.min(...dock.bays) - 2.5, zMax = Math.max(...dock.bays) + 2.5;
  return (
    <group position={[dock.wallX, 0, 0]}>
      <mesh castShadow position={[0, 1.6, (zMin + zMax) / 2]}>
        <boxGeometry args={[0.5, 0.25, zMax - zMin]} />
        <meshStandardMaterial color="#b7c0da" />
      </mesh>
      {dock.bays.map((z, i) => (
        <group key={z} position={[0, 0, z]}>
          <mesh position={[0, 0.7, 0]}>
            <boxGeometry args={[0.5, 1.4, 3]} />
            <meshStandardMaterial color="#aab3d1" />
          </mesh>
          {[-1.6, 1.6].map((o) => (
            <mesh key={o} castShadow position={[0, 0.8, o]}>
              <boxGeometry args={[0.55, 1.6, 0.2]} />
              <meshStandardMaterial color="#e0e5f3" />
            </mesh>
          ))}
          <mesh position={[0.1, 0.06, 0]}>
            <boxGeometry args={[0.9, 0.12, 2.6]} />
            <meshStandardMaterial color="#ffe29a" />
          </mesh>
          <mesh position={[0.3, 1.45, 0]}>
            <boxGeometry args={[0.1, 0.1, 3]} />
            <meshStandardMaterial color="#b5eac9" emissive="#b5eac9" emissiveIntensity={0.3} />
          </mesh>
          {labels && <Label position={[0.4, 2.3, 0]} text={`Bay ${i + 1}`} color="#b5eac9" anchor="center" />}
        </group>
      ))}
    </group>
  );
}

/** Street + ceiling lamps, only rendered at night. */
export function Lamps({ layout }: { layout: WarehouseLayout }) {
  const night = useStore((s) => s.theme === "night");
  if (!night) return null;
  const roadX = (layout.dock?.roadX ?? 13.7) + 2.9;
  const spots: [number, number][] = [[roadX, -14], [roadX, -4], [roadX, 6], [roadX, 16]];
  const ceiling: [number, number, number][] = layout.zones.slice(0, 3).map((z) => [z.x, 4.2, z.z]);
  return (
    <group>
      {spots.map(([x, z], i) => (
        <group key={i} position={[x, 0, z]}>
          <mesh position={[0, 1.7, 0]}><cylinderGeometry args={[0.06, 0.08, 3.4, 8]} /><meshStandardMaterial color="#3a4672" /></mesh>
          <mesh position={[-0.5, 3.35, 0]}><boxGeometry args={[1.1, 0.1, 0.3]} /><meshStandardMaterial color="#3a4672" /></mesh>
          <mesh position={[-0.9, 3.28, 0]}><boxGeometry args={[0.4, 0.06, 0.26]} /><meshStandardMaterial color="#fff2c8" emissive="#fff2c8" emissiveIntensity={3} /></mesh>
          <pointLight position={[-0.9, 3.1, 0]} color="#ffe2a8" intensity={22} distance={11} />
        </group>
      ))}
      {ceiling.map(([x, y, z], i) => (
        <group key={`c${i}`} position={[x, y, z]}>
          <mesh><boxGeometry args={[3, 0.08, 0.4]} /><meshStandardMaterial color="#dfe8ff" emissive="#cfe0ff" emissiveIntensity={3} /></mesh>
          <pointLight position={[0, -0.4, 0]} color="#bcd0ff" intensity={26} distance={12} />
        </group>
      ))}
    </group>
  );
}
