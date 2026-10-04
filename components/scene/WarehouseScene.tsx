"use client";

import { useEffect } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { RACK_ROWS_Z } from "@/lib/layout";
import { useStore } from "@/lib/store";
import { PALETTE } from "@/lib/theme";
import { Dock, Floor, Lamps, Rack, Walls } from "./Environment";
import { Conveyors } from "./Conveyors";
import { Fleet } from "./Fleet";

/** Keep the whole warehouse in view regardless of viewport size. */
function FitZoom() {
  const { size, camera } = useThree();
  useEffect(() => {
    const usable = size.width;
    camera.zoom = Math.max(8, Math.min(usable / (usable < 700 ? 34 : 31), size.height / 20, 60));
    camera.updateProjectionMatrix();
  }, [size.width, size.height, camera]);
  return null;
}

export default function WarehouseScene() {
  const P = PALETTE[useStore((s) => s.theme)];
  return (
    <Canvas
      shadows
      orthographic
      dpr={[1, 2]}
      camera={{ position: [24, 24, 24], zoom: 34, near: -200, far: 300 }}
      onPointerMissed={() => useStore.getState().select(null)}
    >
      <FitZoom />
      <color attach="background" args={[P.bg]} />
      <hemisphereLight key={P.bg} args={[P.hemiSky, P.hemiGround, P.hemi]} />
      <ambientLight intensity={P.ambient} />
      <directionalLight
        castShadow
        position={P.sunPos}
        intensity={P.sunIntensity}
        color={P.sun}
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-26}
        shadow-camera-right={26}
        shadow-camera-top={26}
        shadow-camera-bottom={-26}
        shadow-camera-near={1}
        shadow-camera-far={80}
        shadow-bias={-0.0004}
        shadow-radius={6}
      />

      <group position={[-1.5, 0, 0]}>
        <Floor />
        <Walls />
        <Dock />
        {RACK_ROWS_Z.map((z, i) => <Rack key={z} z={z} row={i} />)}
        <Conveyors />
        <Fleet />
        <Lamps />
      </group>

      <OrbitControls
        makeDefault
        enableDamping
        target={[0, 0, 0]}
        minZoom={8}
        maxZoom={90}
        minPolarAngle={Math.PI / 5}
        maxPolarAngle={Math.PI / 2.6}
        minAzimuthAngle={-0.15}
        maxAzimuthAngle={Math.PI / 2 + 0.15}
      />
    </Canvas>
  );
}
