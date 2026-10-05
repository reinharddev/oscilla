"use client";

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import type { Mesh, MeshStandardMaterial } from "three";
import { statusOf } from "@/lib/health";
import type { WarehouseLayout } from "@/lib/layout-schema";
import { useStore } from "@/lib/store";
import { Follower, Sampler } from "./Follower";
import { BOX_COLORS, Parcel, RobotArm } from "./Models";

const BELT_Y = 0.72;
const STATUS_COLOR = { healthy: "#3fb68b", attention: "#e8a33d", critical: "#e5484d" } as const;

/** Small lamp on a monitored belt: green / amber / red by health, blue while under maintenance. */
function StatusLight({ machineId, position }: { machineId: string; position: [number, number, number] }) {
  const ref = useRef<Mesh>(null);
  const last = useRef("");
  useFrame(() => {
    const s = useStore.getState();
    const h = s.health[machineId];
    const mesh = ref.current;
    if (!h || !mesh) return;
    const color = s.schedules[machineId]?.inProgress ? "#5b8def" : STATUS_COLOR[statusOf(h)];
    if (color === last.current) return;
    const mat = mesh.material as MeshStandardMaterial;
    mat.color.set(color);
    mat.emissive.set(color);
    last.current = color;
  });
  return (
    <mesh ref={ref} position={position}>
      <sphereGeometry args={[0.16, 12, 12]} />
      <meshStandardMaterial emissiveIntensity={0.9} />
    </mesh>
  );
}

function Belt({ z, x0, x1, machineId, label }: { z: number; x0: number; x1: number; machineId?: string; label: string }) {
  const L = x1 - x0;
  const cx = (x0 + x1) / 2;
  const selected = useStore((s) => Boolean(machineId) && s.selected?.id === machineId);
  const pick = machineId
    ? {
        onClick: (e: { stopPropagation: () => void }) => { e.stopPropagation(); useStore.getState().select({ id: machineId, type: "conveyor", label }); },
        onPointerOver: (e: { stopPropagation: () => void }) => { e.stopPropagation(); document.body.style.cursor = "pointer"; },
        onPointerOut: () => { document.body.style.cursor = ""; },
      }
    : {};
  return (
    <group position={[cx, 0, z]} {...pick}>
      <mesh castShadow receiveShadow position={[0, BELT_Y - 0.12, 0]}>
        <boxGeometry args={[L, 0.14, 1]} />
        <meshStandardMaterial color="#9aa5c7" roughness={0.6} />
      </mesh>
      <mesh position={[0, BELT_Y - 0.04, 0]}>
        <boxGeometry args={[L, 0.03, 0.78]} />
        <meshStandardMaterial color="#7f8aae" roughness={0.9} />
      </mesh>
      {Array.from({ length: Math.floor(L / 0.9) }).map((_, i) => (
        <mesh key={i} position={[-L / 2 + 0.45 + i * 0.9, BELT_Y - 0.02, 0]}>
          <boxGeometry args={[0.06, 0.01, 0.78]} />
          <meshStandardMaterial color="#cfe6ff" emissive="#8ec9ff" emissiveIntensity={0.3} />
        </mesh>
      ))}
      {[-1, 1].map((s) => (
        <mesh key={s} castShadow position={[0, BELT_Y + 0.03, s * 0.47]}>
          <boxGeometry args={[L, 0.14, 0.06]} />
          <meshStandardMaterial color="#ffe29a" />
        </mesh>
      ))}
      {Array.from({ length: Math.floor(L / 2.4) + 1 }).map((_, i) => (
        <group key={i} position={[-L / 2 + 0.3 + i * 2.4, 0, 0]}>
          {[-1, 1].map((s) => (
            <mesh key={s} castShadow position={[0, (BELT_Y - 0.2) / 2, s * 0.4]}>
              <boxGeometry args={[0.1, BELT_Y - 0.2, 0.1]} />
              <meshStandardMaterial color="#c3cadf" metalness={0.5} />
            </mesh>
          ))}
        </group>
      ))}
      {machineId && <StatusLight machineId={machineId} position={[-L / 2 + 0.3, BELT_Y + 0.5, 0.62]} />}
      {selected && (
        <mesh position={[0, BELT_Y - 0.05, 0]}>
          <boxGeometry args={[L + 0.2, 0.5, 1.3]} />
          <meshBasicMaterial color="#5b8def" wireframe />
        </mesh>
      )}
    </group>
  );
}

export function Conveyors({ layout }: { layout: WarehouseLayout }) {
  const deliver = useStore((s) => s.deliver);
  const machines = useStore((s) => s.machines);
  return (
    <group>
      {layout.conveyors.map((c, ci) => {
        const machine = c.serial ? machines.find((m) => m.serial === c.serial) : undefined;
        const sample: Sampler = (p, out) => { out.x = c.x0 + 0.3 + (c.x1 - c.x0 - 0.6) * p; out.y = BELT_Y; out.z = c.z; out.yaw = 0; };
        const parcels = Math.max(4, Math.round((c.x1 - c.x0) / 2));
        return (
          <group key={c.id}>
            <Belt z={c.z} x0={c.x0} x1={c.x1} machineId={machine?.id} label={machine?.label ?? c.label} />
            {Array.from({ length: parcels }).map((_, i) => (
              <Follower
                key={i}
                id={`${c.id}-p${i}`}
                statusId={machine?.id}
                type="conveyor"
                label={c.label}
                sample={sample}
                duration={16 + ci * 3}
                offset={i / parcels}
                onLoop={deliver}
                inert
              >
                <Parcel size={[0.55 + (i % 3) * 0.08, 0.4 + (i % 2) * 0.12, 0.55]} color={BOX_COLORS[(i + ci * 2) % BOX_COLORS.length]} />
              </Follower>
            ))}
          </group>
        );
      })}
      {layout.arms.map((a, i) => <RobotArm key={i} position={[a.x, 0, a.z]} rotation={a.rot} />)}
    </group>
  );
}
