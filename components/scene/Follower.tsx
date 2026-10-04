"use client";

import { ReactNode, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { CatmullRomCurve3, Group, Vector3 } from "three";
import { EntityType, Pose, Vec3 } from "@/lib/layout";
import { useStore } from "@/lib/store";

export type Sampler = (p: number, out: Pose) => void;

/** Build a sampler from waypoints (closed → seamless infinite loop). */
export function curveSampler(points: Vec3[], closed = true): Sampler {
  const curve = new CatmullRomCurve3(points.map((p) => new Vector3(...p)), closed, "centripetal");
  const pt = new Vector3();
  const tg = new Vector3();
  return (p, out) => {
    curve.getPointAt(p, pt);
    curve.getTangentAt(p, tg);
    out.x = pt.x; out.y = pt.y; out.z = pt.z;
    out.yaw = Math.atan2(tg.x, tg.z);
  };
}

interface Props {
  id: string;
  type: EntityType;
  label: string;
  sample: Sampler;
  /** seconds for one full loop at 1× speed */
  duration: number;
  /** start phase 0..1 */
  offset?: number;
  onLoop?: () => void;
  /** disable click-select (e.g. conveyor parcels) */
  inert?: boolean;
  children: ReactNode;
}

/**
 * Moves its children along a path forever. Speed follows the global sim speed and per-unit boosts.
 */
export function Follower({ id, type, label, sample, duration, offset = 0, onLoop, inert, children }: Props) {
  const ref = useRef<Group>(null);
  const ring = useRef<Group>(null);
  const progress = useRef(offset);
  const pose = useMemo<Pose>(() => ({ x: 0, y: 0, z: 0, yaw: 0 }), []);
  const hovered = useRef(false);

  useFrame((_, dt) => {
    const g = ref.current;
    if (!g) return;
    const s = useStore.getState();
    const boost = (s.boosts[id] ?? 0) > Date.now() ? 2 : 1;
    const next = progress.current + (Math.min(dt, 0.1) * s.speed * boost) / duration;
    if (Math.floor(next) > Math.floor(progress.current) && onLoop) onLoop();
    progress.current = next;
    sample(next - Math.floor(next), pose);
    g.position.set(pose.x, pose.y, pose.z);
    g.rotation.y = pose.yaw;
    if (ring.current) {
      const sel = s.selected?.id === id;
      ring.current.visible = sel || hovered.current;
      ring.current.rotation.y = -pose.yaw + performance.now() / 700;
      const c = ring.current.children[0] as unknown as { material: { color: { set: (c: string) => void } } };
      c.material.color.set(sel ? "#5b8def" : "#8b95bd");
    }
  });

  return (
    <group
      ref={ref}
      onClick={inert ? undefined : (e) => { e.stopPropagation(); useStore.getState().select({ id, type, label }); }}
      onPointerOver={inert ? undefined : (e) => { e.stopPropagation(); hovered.current = true; document.body.style.cursor = "pointer"; }}
      onPointerOut={inert ? undefined : () => { hovered.current = false; document.body.style.cursor = ""; }}
    >
      {children}
      {!inert && (
        <group ref={ring} visible={false} position={[0, 0.05, 0]}>
          <mesh rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[type === "truck" ? 2.6 : 1.1, type === "truck" ? 2.8 : 1.25, 6]} />
            <meshBasicMaterial color="#5b8def" transparent opacity={0.9} />
          </mesh>
        </group>
      )}
    </group>
  );
}
