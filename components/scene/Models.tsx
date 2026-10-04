"use client";

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Group, Mesh } from "three";

export const BOX_COLORS = ["#ffd6a5", "#a8d8ff", "#ffb0cf", "#b5eac9", "#d4c5ff", "#ffb0b8"];

/** Cardboard parcel with tape strip. */
export function Parcel({ size = [0.6, 0.45, 0.6], color = "#f2d2a9", position = [0, 0, 0] as [number, number, number], tape = "#ffffff" }) {
  const [w, h, d] = size;
  return (
    <group position={position}>
      <mesh castShadow receiveShadow position={[0, h / 2, 0]}>
        <boxGeometry args={[w, h, d]} />
        <meshStandardMaterial color={color} roughness={0.8} />
      </mesh>
      <mesh position={[0, h + 0.002, 0]}>
        <boxGeometry args={[w * 0.18, 0.004, d * 1.002]} />
        <meshStandardMaterial color={tape} />
      </mesh>
    </group>
  );
}

/** Pallet with stacked boxes. */
export function Pallet({ color = "#a8d8ff", stack = 2, position = [0, 0, 0] as [number, number, number] }) {
  return (
    <group position={position}>
      <mesh castShadow position={[0, 0.07, 0]}>
        <boxGeometry args={[1.1, 0.14, 1.1]} />
        <meshStandardMaterial color="#e8cfa8" roughness={0.9} />
      </mesh>
      {Array.from({ length: stack }).map((_, i) => (
        <Parcel key={i} size={[1, 0.4, 1]} color={color} position={[0, 0.14 + i * 0.4, 0]} />
      ))}
    </group>
  );
}

function Wheel({ position, r = 0.22, w = 0.2 }: { position: [number, number, number]; r?: number; w?: number }) {
  return (
    <mesh castShadow position={position} rotation={[0, 0, Math.PI / 2]}>
      <cylinderGeometry args={[r, r, w, 16]} />
      <meshStandardMaterial color="#4a5273" roughness={0.9} />
    </mesh>
  );
}

/** Forklift made from primitives. Forward = +Z. */
export function ForkliftModel({ color = "#ffd98a", load = true }: { color?: string; load?: boolean }) {
  const fork = useRef<Group>(null);
  useFrame(({ clock }) => {
    if (fork.current) fork.current.position.y = 0.35 + (Math.sin(clock.elapsedTime * 1.3) * 0.5 + 0.5) * 0.55;
  });
  return (
    <group>
      <mesh castShadow position={[0, 0.42, -0.15]}>
        <boxGeometry args={[0.95, 0.5, 1.5]} />
        <meshStandardMaterial color={color} roughness={0.5} />
      </mesh>
      <mesh castShadow position={[0, 0.2, -0.75]}>
        <boxGeometry args={[0.9, 0.3, 0.35]} />
        <meshStandardMaterial color="#9aa3c2" />
      </mesh>
      {[[-0.4, -0.35], [0.4, -0.35], [-0.4, 0.3], [0.4, 0.3]].map(([x, z], i) => (
        <mesh key={i} position={[x, 1.1, z]}>
          <boxGeometry args={[0.06, 0.8, 0.06]} />
          <meshStandardMaterial color="#8a93b5" />
        </mesh>
      ))}
      <mesh position={[0, 1.52, -0.02]} castShadow>
        <boxGeometry args={[0.95, 0.06, 0.8]} />
        <meshStandardMaterial color="#8a93b5" />
      </mesh>
      <mesh position={[0, 0.82, -0.3]}>
        <boxGeometry args={[0.55, 0.12, 0.45]} />
        <meshStandardMaterial color="#b7c0da" />
      </mesh>
      <mesh position={[0, 1.62, -0.02]}>
        <sphereGeometry args={[0.07, 8, 8]} />
        <meshStandardMaterial color="#ffb98a" emissive="#ffb98a" emissiveIntensity={0.3} />
      </mesh>
      {/* mast + carriage */}
      {[-0.28, 0.28].map((x) => (
        <mesh key={x} position={[x, 1.05, 0.68]} castShadow>
          <boxGeometry args={[0.07, 1.9, 0.07]} />
          <meshStandardMaterial color="#c2c9de" metalness={0.6} roughness={0.4} />
        </mesh>
      ))}
      <group ref={fork} position={[0, 0.5, 0.75]}>
        <mesh position={[0, 0.12, 0]}>
          <boxGeometry args={[0.7, 0.35, 0.06]} />
          <meshStandardMaterial color="#c2c9de" metalness={0.6} roughness={0.4} />
        </mesh>
        {[-0.22, 0.22].map((x) => (
          <mesh key={x} position={[x, 0, 0.5]}>
            <boxGeometry args={[0.1, 0.05, 1]} />
            <meshStandardMaterial color="#d5dbea" metalness={0.7} roughness={0.3} />
          </mesh>
        ))}
        {load && <Pallet stack={1} color="#ffb0b8" position={[0, 0.03, 0.62]} />}
      </group>
      <Wheel position={[-0.52, 0.22, 0.35]} r={0.24} />
      <Wheel position={[0.52, 0.22, 0.35]} r={0.24} />
      <Wheel position={[-0.5, 0.2, -0.65]} r={0.2} />
      <Wheel position={[0.5, 0.2, -0.65]} r={0.2} />
    </group>
  );
}

/** Autonomous guided vehicle with pulsing lights and a parcel on top. */
export function AgvModel({ color = "#8ec9ff", parcel = "#ffd6a5" }: { color?: string; parcel?: string }) {
  const light = useRef<Mesh>(null);
  useFrame(({ clock }) => {
    const m = light.current?.material as unknown as { emissiveIntensity: number } | undefined;
    if (m) m.emissiveIntensity = 1.5 + Math.sin(clock.elapsedTime * 5) * 1.2;
  });
  return (
    <group>
      <mesh castShadow position={[0, 0.2, 0]}>
        <boxGeometry args={[0.9, 0.26, 1.2]} />
        <meshStandardMaterial color="#ffffff" roughness={0.35} metalness={0.2} />
      </mesh>
      <mesh position={[0, 0.36, 0]}>
        <boxGeometry args={[0.8, 0.06, 1.1]} />
        <meshStandardMaterial color="#9aa5c7" />
      </mesh>
      <mesh ref={light} position={[0, 0.2, 0.61]}>
        <boxGeometry args={[0.6, 0.06, 0.02]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.3} />
      </mesh>
      <mesh position={[0, 0.33, -0.61]}>
        <boxGeometry args={[0.6, 0.04, 0.02]} />
        <meshStandardMaterial color="#ff9fb0" emissive="#ff9fb0" emissiveIntensity={0.3} />
      </mesh>
      <Parcel size={[0.55, 0.4, 0.55]} color={parcel} position={[0, 0.39, 0]} />
      <Wheel position={[-0.48, 0.1, 0.4]} r={0.1} w={0.1} />
      <Wheel position={[0.48, 0.1, 0.4]} r={0.1} w={0.1} />
      <Wheel position={[-0.48, 0.1, -0.4]} r={0.1} w={0.1} />
      <Wheel position={[0.48, 0.1, -0.4]} r={0.1} w={0.1} />
    </group>
  );
}

/** Quadcopter scan drone with spinning rotors. */
export function DroneModel({ color = "#c5b8ff" }: { color?: string }) {
  const rotors = useRef<Group>(null);
  useFrame((_, dt) => {
    rotors.current?.children.forEach((c) => { c.rotation.y += dt * 40; });
  });
  const arms: [number, number][] = [[0.45, 0.45], [-0.45, 0.45], [0.45, -0.45], [-0.45, -0.45]];
  return (
    <group>
      <mesh castShadow>
        <boxGeometry args={[0.5, 0.18, 0.5]} />
        <meshStandardMaterial color="#ffffff" metalness={0.3} roughness={0.3} />
      </mesh>
      <mesh position={[0, 0.1, 0]}>
        <boxGeometry args={[0.3, 0.06, 0.3]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.3} />
      </mesh>
      {arms.map(([x, z], i) => (
        <mesh key={i} position={[x / 2, 0, z / 2]} rotation={[0, Math.atan2(x, z), 0]}>
          <boxGeometry args={[0.07, 0.05, 0.64]} />
          <meshStandardMaterial color="#b7c0da" />
        </mesh>
      ))}
      <group ref={rotors}>
        {arms.map(([x, z], i) => (
          <mesh key={i} position={[x, 0.08, z]}>
            <boxGeometry args={[0.55, 0.015, 0.07]} />
            <meshStandardMaterial color="#eef1fa" transparent opacity={0.75} />
          </mesh>
        ))}
      </group>
      {/* scan beam */}
      <mesh position={[0, -2.6, 0]}>
        <coneGeometry args={[0.9, 5, 20, 1, true]} />
        <meshBasicMaterial color={color} transparent opacity={0.08} depthWrite={false} />
      </mesh>
      <mesh position={[0, -0.18, 0]}>
        <sphereGeometry args={[0.09, 10, 10]} />
        <meshStandardMaterial color="#8ec9ff" emissive="#8ec9ff" emissiveIntensity={0.3} />
      </mesh>
    </group>
  );
}

/** Low-poly warehouse worker with walking legs & arms. */
export function WorkerModel({ vest = "#ffb98a", hat = "#ffe89a" }: { vest?: string; hat?: string }) {
  const l = useRef<Mesh>(null), r = useRef<Mesh>(null), al = useRef<Mesh>(null), ar = useRef<Mesh>(null);
  useFrame(({ clock }) => {
    const a = Math.sin(clock.elapsedTime * 7) * 0.6;
    if (l.current) l.current.rotation.x = a;
    if (r.current) r.current.rotation.x = -a;
    if (al.current) al.current.rotation.x = -a;
    if (ar.current) ar.current.rotation.x = a;
  });
  return (
    <group scale={0.95}>
      <mesh ref={l} castShadow position={[-0.1, 0.35, 0]}>
        <boxGeometry args={[0.13, 0.5, 0.15]} />
        <meshStandardMaterial color="#8a96c9" />
      </mesh>
      <mesh ref={r} castShadow position={[0.1, 0.35, 0]}>
        <boxGeometry args={[0.13, 0.5, 0.15]} />
        <meshStandardMaterial color="#8a96c9" />
      </mesh>
      <mesh castShadow position={[0, 0.85, 0]}>
        <boxGeometry args={[0.4, 0.55, 0.24]} />
        <meshStandardMaterial color={vest} roughness={0.7} />
      </mesh>
      <mesh position={[0, 0.88, 0.125]}>
        <boxGeometry args={[0.42, 0.06, 0.01]} />
        <meshStandardMaterial color="#ffffff" emissive="#ffffff" emissiveIntensity={0.3} />
      </mesh>
      <mesh ref={al} position={[-0.28, 0.85, 0]}>
        <boxGeometry args={[0.1, 0.45, 0.1]} />
        <meshStandardMaterial color={vest} />
      </mesh>
      <mesh ref={ar} position={[0.28, 0.85, 0]}>
        <boxGeometry args={[0.1, 0.45, 0.1]} />
        <meshStandardMaterial color={vest} />
      </mesh>
      <mesh castShadow position={[0, 1.27, 0]}>
        <sphereGeometry args={[0.17, 14, 14]} />
        <meshStandardMaterial color="#ffdcc0" />
      </mesh>
      <mesh position={[0, 1.33, 0]}>
        <sphereGeometry args={[0.19, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial color={hat} />
      </mesh>
    </group>
  );
}

/** Cargo truck. Forward = +Z. */
export function TruckModel({ cab = "#8ec9ff", trailer = "#ffffff" }: { cab?: string; trailer?: string }) {
  return (
    <group>
      <mesh castShadow position={[0, 0.95, 2.1]}>
        <boxGeometry args={[1.7, 1.5, 1.3]} />
        <meshStandardMaterial color={cab} roughness={0.45} />
      </mesh>
      <mesh position={[0, 1.15, 2.76]}>
        <boxGeometry args={[1.5, 0.55, 0.02]} />
        <meshStandardMaterial color="#7f8aae" metalness={0.8} roughness={0.1} />
      </mesh>
      {[-0.6, 0.6].map((x) => (
        <mesh key={x} position={[x, 0.55, 2.76]}>
          <boxGeometry args={[0.28, 0.14, 0.02]} />
          <meshStandardMaterial color="#fff6d6" emissive="#fff6d6" emissiveIntensity={0.3} />
        </mesh>
      ))}
      <mesh castShadow position={[0, 1.35, -0.35]}>
        <boxGeometry args={[1.9, 2.1, 3.7]} />
        <meshStandardMaterial color={trailer} roughness={0.6} />
      </mesh>
      <mesh position={[0, 1.95, -0.35]}>
        <boxGeometry args={[1.95, 0.35, 3.0]} />
        <meshStandardMaterial color={cab} />
      </mesh>
      <mesh position={[0, 0.35, 0.8]}>
        <boxGeometry args={[1.6, 0.25, 4.6]} />
        <meshStandardMaterial color="#9aa5c7" />
      </mesh>
      {[[-0.85, -1.3], [0.85, -1.3], [-0.85, -0.4], [0.85, -0.4], [-0.85, 2.1], [0.85, 2.1]].map(([x, z], i) => (
        <Wheel key={i} position={[x, 0.32, z]} r={0.34} w={0.28} />
      ))}
    </group>
  );
}

export function RobotArm({ position, rotation = 0 }: { position: [number, number, number]; rotation?: number }) {
  const base = useRef<Group>(null), a1 = useRef<Group>(null), a2 = useRef<Group>(null);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (base.current) base.current.rotation.y = Math.sin(t * 0.9) * 1.1;
    if (a1.current) a1.current.rotation.x = -0.5 + Math.sin(t * 1.8) * 0.45;
    if (a2.current) a2.current.rotation.x = 1.0 + Math.sin(t * 1.8 + 1) * 0.5;
  });
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      <mesh castShadow position={[0, 0.2, 0]}>
        <cylinderGeometry args={[0.55, 0.65, 0.4, 20]} />
        <meshStandardMaterial color="#b7c0da" />
      </mesh>
      <group ref={base} position={[0, 0.4, 0]}>
        <mesh castShadow position={[0, 0.2, 0]}>
          <cylinderGeometry args={[0.32, 0.32, 0.4, 16]} />
          <meshStandardMaterial color="#ffc2a1" />
        </mesh>
        <group ref={a1} position={[0, 0.4, 0]}>
          <mesh castShadow position={[0, 0.7, 0]}>
            <boxGeometry args={[0.28, 1.4, 0.28]} />
            <meshStandardMaterial color="#ffb98a" />
          </mesh>
          <group ref={a2} position={[0, 1.4, 0]}>
            <mesh castShadow position={[0, 0.55, 0]}>
              <boxGeometry args={[0.22, 1.1, 0.22]} />
              <meshStandardMaterial color="#ffc2a1" />
            </mesh>
            <mesh position={[0, 1.15, 0]}>
              <boxGeometry args={[0.4, 0.12, 0.2]} />
              <meshStandardMaterial color="#9aa5c7" />
            </mesh>
            <mesh position={[0, 1.3, 0]}>
              <sphereGeometry args={[0.07, 8, 8]} />
              <meshStandardMaterial color="#8ec9ff" emissive="#8ec9ff" emissiveIntensity={0.3} />
            </mesh>
          </group>
        </group>
      </group>
    </group>
  );
}
