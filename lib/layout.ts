export type Vec3 = [number, number, number];
export type EntityType = "forklift" | "agv" | "drone" | "worker" | "truck" | "conveyor";

export interface Pose { x: number; y: number; z: number; yaw: number }

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
