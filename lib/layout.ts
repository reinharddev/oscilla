export type Vec3 = [number, number, number];
export type EntityType = "forklift" | "agv" | "drone" | "worker" | "truck" | "conveyor";

export interface Pose { x: number; y: number; z: number; yaw: number }

/** Warehouse floor bounds (world units) */
export const FLOOR = { x0: -14, x1: 12, z0: -10, z1: 10 };

/** Rounded rectangle loop (chamfered corners) — gives a smooth closed Catmull-Rom path. */
export function rectLoop(x0: number, x1: number, z0: number, z1: number, y = 0, r = 1, cw = true): Vec3[] {
  const pts: Vec3[] = [
    [x0 + r, y, z0], [x1 - r, y, z0],
    [x1, y, z0 + r], [x1, y, z1 - r],
    [x1 - r, y, z1], [x0 + r, y, z1],
    [x0, y, z1 - r], [x0, y, z0 + r],
  ];
  return cw ? pts : pts.reverse();
}

/** Lissajous loop for flying things. */
export function lissajous(cx: number, cz: number, ax: number, az: number, y: number, n = 28, phase = 0): Vec3[] {
  return Array.from({ length: n }, (_, i) => {
    const t = (i / n) * Math.PI * 2 + phase;
    return [cx + ax * Math.sin(t), y + 0.6 * Math.sin(3 * t), cz + az * Math.sin(2 * t)] as Vec3;
  });
}

export const RACK_ROWS_Z = [-8.5, -5.5, -2.5, 0.5];
export const RACK_X0 = -12;
export const RACK_BAYS = 5;

export const PATHS = {
  fk1: rectLoop(-13, 0, -7, -4, 0, 0.9),
  fk2: rectLoop(-13, 0, -1, 2.6, 0, 0.9, false),
  fk3: rectLoop(2, 8, -9, 3.5, 0, 1.4),
  agv1: rectLoop(3.5, 11, 5.2, 9.2, 0, 1.2),
  agv2: rectLoop(5.3, 9.2, 6.2, 8.2, 0, 0.8, false),
  agv3: rectLoop(-13, -9, 3.2, 4.2, 0, 0.45),
  drone1: lissajous(-6, -3, 8, 6, 6),
  drone2: lissajous(4, 3, 6, 5, 7.5, 24, 1.2),
  w1: rectLoop(-12, 2, 2.9, 4.0, 0, 0.4),
  w2: rectLoop(8.8, 10.2, -9, 3, 0, 0.4, false),
  w3: rectLoop(-12, 3, 9.2, 9.7, 0, 0.3),
};

export const CONVEYORS = [
  { id: "cv-1", z: 5.8, x0: -12, x1: 1.5, label: "Inbound Belt A" },
  { id: "cv-2", z: 7.9, x0: -12, x1: 1.5, label: "Sorting Belt B" },
];

export const TRUCK_BAYS = [-6, -0.5, 5];
export const TRUCK_X = 13.7;

export const FLEET: { id: string; type: EntityType; label: string }[] = [
  { id: "fk-1", type: "forklift", label: "Forklift FK-01" },
  { id: "fk-2", type: "forklift", label: "Forklift FK-02" },
  { id: "fk-3", type: "forklift", label: "Forklift FK-03" },
  { id: "agv-1", type: "agv", label: "AGV Robot R1" },
  { id: "agv-2", type: "agv", label: "AGV Robot R2" },
  { id: "agv-3", type: "agv", label: "AGV Robot R3" },
  { id: "dr-1", type: "drone", label: "Scan Drone D1" },
  { id: "dr-2", type: "drone", label: "Scan Drone D2" },
  { id: "wk-1", type: "worker", label: "Picker Rina" },
  { id: "wk-2", type: "worker", label: "Loader Budi" },
  { id: "wk-3", type: "worker", label: "Packer Sari" },
  { id: "tr-1", type: "truck", label: "Truck TR-101" },
  { id: "tr-2", type: "truck", label: "Truck TR-102" },
  { id: "tr-3", type: "truck", label: "Truck TR-103" },
];

export const ZONES = [
  { id: "A", name: "Zone A · Fast Moving", color: "#8ec9ff", x: -7, z: -7, w: 12.4, d: 4.6 },
  { id: "B", name: "Zone B · Bulk", color: "#c5b8ff", x: -7, z: -1.2, w: 12.4, d: 4.6 },
  { id: "P", name: "Packing & Sorting", color: "#ffd98a", x: -5.2, z: 6.9, w: 15, d: 4.4 },
  { id: "D", name: "Dock", color: "#b5eac9", x: 10.8, z: -1.5, w: 2.6, d: 18 },
];
