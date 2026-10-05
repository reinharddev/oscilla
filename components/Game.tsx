"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { useStore, type HydrateInput } from "@/lib/store";
import { TopBar } from "./hud/TopBar";
import { Activity, Fleet, LeftColumn, Missions, OverviewPanels, RightColumn } from "./hud/Panels";
import { AgentPanel } from "./hud/AgentPanel";
import { MachinePanel, MaintenanceTable } from "./hud/MachinePanel";
import { SelectedPanel } from "./hud/SelectedPanel";
import { LevelToast } from "./hud/LevelToast";

const WarehouseScene = dynamic(() => import("./scene/WarehouseScene"), {
  ssr: false,
  loading: () => <div className="absolute inset-0 grid place-items-center text-sm text-ink/50">Loading warehouse…</div>,
});

export default function Game({ initial }: { initial: HydrateInput }) {
  const [focus, setFocus] = useState(false);
  const ready = useStore((s) => s.layout !== null && s.auth?.warehouseId === initial.auth.warehouseId);
  const [tab, setTab] = useState<"overview" | "machine" | "agent" | "missions" | "fleet" | null>(null);

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

  // Ask the health service to score every machine; falls back to local estimates if unreachable.
  useEffect(() => {
    let busy = false;
    const run = async () => {
      const s = useStore.getState();
      if (busy || s.speed === 0 || document.hidden || s.machines.length === 0) return;
      busy = true;
      try {
        const items = s.machines.map((m) => ({ assetId: m.id, severity: Math.min(1, Math.max(0, s.health[m.id]?.wear ?? 0)) }));
        const res = await fetch("/api/analyze", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ items }) });
        if (!res.ok) throw new Error(String(res.status));
        const data = await res.json();
        useStore.getState().applyAnalyses(data.results, data.serviceUp);
      } catch {
        useStore.setState({ analysisStatus: "offline" });
      } finally {
        busy = false;
      }
    };
    const first = setTimeout(run, 1500);
    const id = setInterval(run, 5000);
    return () => { clearTimeout(first); clearInterval(id); };
  }, [initial]);

  if (!ready) {
    return <main className="grid h-dvh w-screen place-items-center bg-canvas text-sm text-ink/50">Memuat gudang…</main>;
  }

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
              {tab === "agent" && <AgentPanel />}
              {tab === "missions" && <Missions />}
              {tab === "fleet" && <><Fleet /><Activity /></>}
            </div>
          )}
        </div>
        {!focus && <RightColumn />}
      </div>
      <nav aria-label="Panel" className="grid h-12 shrink-0 grid-cols-6 border-t border-rule bg-surface text-xs lg:hidden">
        {([["overview", "Operasi"], ["machine", "Mesin"], ["agent", "Tanya"], ["missions", "Misi"], ["fleet", "Armada"]] as const).map(([k, label]) => (
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
