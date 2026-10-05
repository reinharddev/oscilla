"use client";

import { useMemo } from "react";
import { CatmullRomCurve3, Vector3 } from "three";
import { Line } from "@react-three/drei";
import type { EntityType, Vec3 } from "@/lib/layout";
import type { EntitySpec, WarehouseLayout } from "@/lib/layout-schema";
import { useStore } from "@/lib/store";
import { Follower } from "./Follower";
import { AgvModel, DroneModel, ForkliftModel, TruckModel, WorkerModel } from "./Models";
import { buildSampler, waypoints } from "./motion";

const PATH_COLOR: Record<EntitySpec["model"], string> = {
  forklift: "#ffd98a", agv: "#8ec9ff", drone: "#c5b8ff", worker: "#ffb98a", truck: "#b7c0da",
};

function PathLine({ points, color }: { points: Vec3[]; color: string }) {
  const pts = useMemo(() => new CatmullRomCurve3(points.map((p) => new Vector3(...p)), true, "centripetal").getPoints(120), [points]);
  return <Line points={pts} color={color} lineWidth={1.2} dashed dashSize={0.35} gapSize={0.25} transparent opacity={0.6} position={[0, 0.04, 0]} />;
}

function Model({ model, style = {} }: { model: EntitySpec["model"]; style?: Record<string, string> }) {
  switch (model) {
    case "forklift": return <ForkliftModel color={style.color} />;
    case "agv": return <AgvModel color={style.color} parcel={style.parcel} />;
    case "drone": return <DroneModel color={style.color} />;
    case "worker": return <WorkerModel vest={style.vest} hat={style.hat} />;
    case "truck": return <TruckModel cab={style.cab} />;
  }
}

export function Fleet({ layout }: { layout: WarehouseLayout }) {
  const showPaths = useStore((s) => s.layers.paths);
  const machines = useStore((s) => s.machines);
  const pallet = useStore((s) => s.pallet);
  const truckServed = useStore((s) => s.truckServed);
  const roadX = layout.dock?.roadX ?? 13.7;

  const items = useMemo(
    () =>
      layout.entities.flatMap((e) => {
        const machine = e.serial ? machines.find((m) => m.serial === e.serial) : undefined;
        if (e.serial && !machine) return []; // layout mentions an asset this user cannot see
        const id = machine?.id ?? e.id!;
        return [{ e, id, label: machine?.label ?? e.label ?? id, type: e.model as EntityType, sample: buildSampler(e.motion, roadX), points: waypoints(e.motion) }];
      }),
    [layout, machines, roadX],
  );

  return (
    <group>
      {showPaths && items.map((it) => it.points && <PathLine key={`p-${it.id}`} points={it.points} color={PATH_COLOR[it.e.model]} />)}
      {items.map((it) => (
        <Follower
          key={it.id}
          id={it.id}
          type={it.type}
          label={it.label}
          sample={it.sample}
          duration={it.e.duration}
          offset={it.e.offset ?? 0}
          onLoop={it.e.model === "forklift" ? pallet : it.e.model === "truck" ? () => truckServed(it.label) : undefined}
        >
          <Model model={it.e.model} style={it.e.style} />
        </Follower>
      ))}
    </group>
  );
}
