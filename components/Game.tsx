"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { useStore } from "@/lib/store";
import { TopBar } from "./hud/TopBar";
import { LeftColumn, RightColumn } from "./hud/Panels";
import { SelectedPanel } from "./hud/SelectedPanel";
import { LevelToast } from "./hud/LevelToast";

const WarehouseScene = dynamic(() => import("./scene/WarehouseScene"), {
  ssr: false,
  loading: () => <div className="absolute inset-0 grid place-items-center text-sm text-ink/50">Loading warehouse…</div>,
});

export default function Game() {
  const [focus, setFocus] = useState(false);

  useEffect(() => {
    const id = setInterval(() => useStore.getState().tick(), 1000);
    try {
      const saved = localStorage.getItem("wt-theme");
      if (saved === "night" || saved === "day") useStore.getState().setTheme(saved);
      else if (window.matchMedia("(prefers-color-scheme: dark)").matches) useStore.getState().setTheme("night");
    } catch {}
    useStore.getState().log("info", "Sistem online — semua unit siap beroperasi");
    return () => clearInterval(id);
  }, []);

  return (
    <main className="flex h-dvh w-screen flex-col bg-canvas">
      <TopBar focus={focus} onFocus={() => setFocus((f) => !f)} />
      <div className="flex min-h-0 flex-1">
        {!focus && <LeftColumn />}
        <div className="relative min-w-0 flex-1">
          <div className="absolute inset-0"><WarehouseScene /></div>
          <div className="pointer-events-none absolute inset-x-0 bottom-4 flex justify-center px-4">
            <SelectedPanel />
          </div>
          <p className="pointer-events-none absolute right-4 top-3 hidden text-xs text-ink/45 md:block">
            Drag to rotate · scroll to zoom · right-click to pan
          </p>
        </div>
        {!focus && <RightColumn />}
      </div>
      <LevelToast />
    </main>
  );
}
