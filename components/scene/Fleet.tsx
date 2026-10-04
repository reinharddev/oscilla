"use client";

import { useMemo } from "react";
import { CatmullRomCurve3, Vector3 } from "three";
import { Line } from "@react-three/drei";
import { FLEET, PATHS, Pose, TRUCK_BAYS, TRUCK_X, Vec3 } from "@/lib/layout";
import { useStore } from "@/lib/store";
import { curveSampler, Follower, Sampler } from "./Follower";
import { AgvModel, DroneModel, ForkliftModel, TruckModel, WorkerModel } from "./Models";

const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
const easeIn = (t: number) => t * t * t;

/** Truck: truk spawn → ke bay masing masing → keluar, loop */
function truckSampler(zStop: number): Sampler {
  return (p: number, out: Pose) => {
    let z: number;
    if (p < 0.3) z = 28 + (zStop - 28) * easeOut(p / 0.3);
    else if (p < 0.65) z = zStop;
    else z = zStop + (-28 - zStop) * easeIn((p - 0.65) / 0.35);
    out.x = TRUCK_X; out.y = 0; out.z = z; out.yaw = Math.PI;
  };
}

function PathLine({ points, color }: { points: Vec3[]; color: string }) {
  const pts = useMemo(() => new CatmullRomCurve3(points.map((p) => new Vector3(...p)), true, "centripetal").getPoints(120), [points]);
  return <Line points={pts} color={color} lineWidth={1.2} dashed dashSize={0.35} gapSize={0.25} transparent opacity={0.6} position={[0, 0.04, 0]} />;
}

const label = (id: string) => FLEET.find((f) => f.id === id)!.label;

export function Fleet() {
  const showPaths = useStore((s) => s.layers.paths);
  const pallet = useStore((s) => s.pallet);
  const truckServed = useStore((s) => s.truckServed);

  const s = useMemo(() => ({
    fk1: curveSampler(PATHS.fk1), fk2: curveSampler(PATHS.fk2), fk3: curveSampler(PATHS.fk3),
    agv1: curveSampler(PATHS.agv1), agv2: curveSampler(PATHS.agv2), agv3: curveSampler(PATHS.agv3),
    dr1: curveSampler(PATHS.drone1), dr2: curveSampler(PATHS.drone2),
    w1: curveSampler(PATHS.w1), w2: curveSampler(PATHS.w2), w3: curveSampler(PATHS.w3),
    trucks: TRUCK_BAYS.map(truckSampler),
  }), []);

  const pathColors: [Vec3[], string][] = [
    [PATHS.fk1, "#ffd98a"], [PATHS.fk2, "#ffd98a"], [PATHS.fk3, "#ffd98a"],
    [PATHS.agv1, "#8ec9ff"], [PATHS.agv2, "#8ec9ff"], [PATHS.agv3, "#8ec9ff"],
    [PATHS.w1, "#ffb98a"], [PATHS.w2, "#ffb98a"], [PATHS.w3, "#ffb98a"],
    [PATHS.drone1, "#c5b8ff"], [PATHS.drone2, "#c5b8ff"],
  ];

  return (
    <group>
      {showPaths && pathColors.map(([pts, c], i) => <PathLine key={i} points={pts} color={c} />)}

      <Follower id="fk-1" type="forklift" label={label("fk-1")} sample={s.fk1} duration={26} onLoop={pallet}><ForkliftModel /></Follower>
      <Follower id="fk-2" type="forklift" label={label("fk-2")} sample={s.fk2} duration={30} offset={0.35} onLoop={pallet}><ForkliftModel color="#ffb98a" /></Follower>
      <Follower id="fk-3" type="forklift" label={label("fk-3")} sample={s.fk3} duration={24} offset={0.6} onLoop={pallet}><ForkliftModel color="#ffe29a" /></Follower>

      <Follower id="agv-1" type="agv" label={label("agv-1")} sample={s.agv1} duration={20}><AgvModel /></Follower>
      <Follower id="agv-2" type="agv" label={label("agv-2")} sample={s.agv2} duration={12} offset={0.4}><AgvModel color="#ffb0cf" parcel="#a8d8ff" /></Follower>
      <Follower id="agv-3" type="agv" label={label("agv-3")} sample={s.agv3} duration={10} offset={0.2}><AgvModel color="#b5eac9" parcel="#ffb0cf" /></Follower>

      <Follower id="dr-1" type="drone" label={label("dr-1")} sample={s.dr1} duration={26}><DroneModel /></Follower>
      <Follower id="dr-2" type="drone" label={label("dr-2")} sample={s.dr2} duration={32} offset={0.5}><DroneModel color="#8ec9ff" /></Follower>

      <Follower id="wk-1" type="worker" label={label("wk-1")} sample={s.w1} duration={34}><WorkerModel /></Follower>
      <Follower id="wk-2" type="worker" label={label("wk-2")} sample={s.w2} duration={30} offset={0.3}><WorkerModel vest="#b5eac9" hat="#f8fafc" /></Follower>
      <Follower id="wk-3" type="worker" label={label("wk-3")} sample={s.w3} duration={36} offset={0.7}><WorkerModel vest="#ffb0cf" /></Follower>

      {TRUCK_BAYS.map((_, k) => (
        <Follower
          key={k}
          id={`tr-${k + 1}`}
          type="truck"
          label={label(`tr-${k + 1}`)}
          sample={s.trucks[k]}
          duration={30}
          offset={0.4 - 0.12 * k}
          onLoop={() => truckServed(label(`tr-${k + 1}`))}
        >
          <TruckModel cab={["#8ec9ff", "#c5b8ff", "#ffb0b8"][k]} />
        </Follower>
      ))}
    </group>
  );
}
