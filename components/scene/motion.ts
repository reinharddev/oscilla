import { lissajous, rectLoop, type Pose, type Vec3 } from "@/lib/layout";
import type { MotionSpec } from "@/lib/layout-schema";
import { curveSampler, type Sampler } from "./Follower";

const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
const easeIn = (t: number) => t * t * t;

/** Waypoints of a looping route, or null for motions that are not a closed loop. */
export function waypoints(m: MotionSpec): Vec3[] | null {
  if (m.kind === "rect") return rectLoop(m.x0, m.x1, m.z0, m.z1, m.y ?? 0, m.r ?? 1, m.cw ?? true);
  if (m.kind === "lissajous") return lissajous(m.cx, m.cz, m.ax, m.az, m.y, m.n ?? 28, m.phase ?? 0);
  return null;
}

/** Truck: drive in along the road, park at its bay, drive out, forever. */
function truckSampler(bayZ: number, roadX: number): Sampler {
  return (p: number, out: Pose) => {
    let z: number;
    if (p < 0.3) z = 28 + (bayZ - 28) * easeOut(p / 0.3);
    else if (p < 0.65) z = bayZ;
    else z = bayZ + (-28 - bayZ) * easeIn((p - 0.65) / 0.35);
    out.x = roadX; out.y = 0; out.z = z; out.yaw = Math.PI;
  };
}

export function buildSampler(m: MotionSpec, roadX: number): Sampler {
  if (m.kind === "truck") return truckSampler(m.bayZ, roadX);
  return curveSampler(waypoints(m)!);
}
