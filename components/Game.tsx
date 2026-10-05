"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { useStore, type HydrateInput } from "@/lib/store";
import { TopBar } from "./hud/TopBar";
import { Activity, Fleet, LeftColumn, Missions, OverviewPanels, RightColumn } from "./hud/Panels";
import { MachinePanel, MaintenanceTable } from "./hud/MachinePanel";
import { SelectedPanel } from "./hud/SelectedPanel";
import { LevelToast } from "./hud/LevelToast";

const WarehouseScene = dynamic(() => import("./scene/WarehouseScene"), {
  ssr: false,
  loading: () => <div className="absolute inset-0 grid place-items-center text-sm text-ink/50">Loading warehouse…</div>,
});

export default function Game({ initial }: { initial: HydrateInput }) {
  const [focus, setFocus] = useState(false);
  const [tab, setTab] = useState<"overview" | "machine" | "missions" | "fleet" | null>(null);

  useEffect(() => {
    const id = setInterval(() => useStore.getState().tick(), 1000);
    try {
      const saved = localStorage.getItem("wt-theme");
      if (saved === "night" || saved === "day") useStore.getState().setTheme(saved);
      else if (window.matchMedia("(prefers-color-scheme: dark)").matches) useStore.getState().setTheme("night");
    } catch {}
    useStore.getState().hydrate(initial);
    useStore.getState().log("info", "Sistem online — semua unit siap beroperasi");
    return () => clearInterval(id);
  }, [initial]);

  return (
    <main className="flex h-dvh w-screen flex-col bg-canvas">
      <TopBar focus={focus} onFocus={() => setFocus((f) => !f)} />
      <div className="flex min-h-0 flex-1">
        {!focus && <LeftColumn />}
        <div className="relative min-w-0 flex-1">
          <div className="absolute inset-0"><WarehouseScene /></div>
          <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center px-3">
            <SelectedPanel />
          </div>
          <p className="pointer-events-none absolute right-4 top-3 hidden text-xs text-ink/45 md:block">
            Drag to rotate · scroll to zoom · right-click to pan
          </p>
          {tab && (
            <div className="scroll-thin absolute inset-x-0 bottom-0 top-[38%] overflow-y-auto border-t border-rule bg-surface lg:hidden">
              {tab === "overview" && <OverviewPanels />}
              {tab === "machine" && <><MachinePanel /><MaintenanceTable /></>}
              {tab === "missions" && <Missions />}
              {tab === "fleet" && <><Fleet /><Activity /></>}
            </div>
          )}
        </div>
        {!focus && <RightColumn />}
      </div>
      <nav aria-label="Panel" className="grid h-12 shrink-0 grid-cols-5 border-t border-rule bg-surface text-xs lg:hidden">
        {([["overview", "Operasi"], ["machine", "Mesin"], ["missions", "Misi"], ["fleet", "Armada"]] as const).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setTab((t) => (t === k ? null : k))}
            aria-pressed={tab === k}
            className={`border-l border-rule first:border-l-0 transition-colors duration-150 ${tab === k ? "bg-ink/10 font-semibold" : "text-ink/60 hover:bg-ink/5"}`}
          >
            {label}
          </button>
        ))}
        <button onClick={() => setTab(null)} className="border-l border-rule text-ink/60 transition-colors duration-150 hover:bg-ink/5">Scene</button>
      </nav>
      <LevelToast />
    </main>
  );
}
