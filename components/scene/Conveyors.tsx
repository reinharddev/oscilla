"use client";

import { CONVEYORS } from "@/lib/layout";
import { useStore } from "@/lib/store";
import { Follower, Sampler } from "./Follower";
import { BOX_COLORS, Parcel, RobotArm } from "./Models";

const BELT_Y = 0.72;

function Belt({ z, x0, x1 }: { z: number; x0: number; x1: number }) {
  const L = x1 - x0;
  const cx = (x0 + x1) / 2;
  return (
    <group position={[cx, 0, z]}>
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
          <meshStandardMaterial color="#8ec9ff" emissive="#8ec9ff" emissiveIntensity={0.3} />
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
    </group>
  );
}

export function Conveyors() {
  const deliver = useStore((s) => s.deliver);
  return (
    <group>
      {CONVEYORS.map((c, ci) => {
        const sample: Sampler = (p, out) => { out.x = c.x0 + 0.3 + (c.x1 - c.x0 - 0.6) * p; out.y = BELT_Y; out.z = c.z; out.yaw = 0; };
        return (
          <group key={c.id}>
            <Belt z={c.z} x0={c.x0} x1={c.x1} />
            {Array.from({ length: 7 }).map((_, i) => (
              <Follower key={i} id={`${c.id}-p${i}`} type="conveyor" label={c.label} sample={sample} duration={16 + ci * 3} offset={i / 7} onLoop={deliver} inert>
                <Parcel
                  size={[0.55 + (i % 3) * 0.08, 0.4 + (i % 2) * 0.12, 0.55]}
                  color={BOX_COLORS[(i + ci * 2) % BOX_COLORS.length]}
                />
              </Follower>
            ))}
          </group>
        );
      })}
      <RobotArm position={[2.6, 0, 5.8]} rotation={-1.2} />
      <RobotArm position={[2.6, 0, 7.9]} rotation={-1.9} />
    </group>
  );
}
