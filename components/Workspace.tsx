"use client";

import { useEffect, useState } from "react";
import { makeT } from "@/lib/i18n";
import { useT } from "@/lib/i18n/use-t";
import { useStore, type HydrateInput } from "@/lib/store";
import { TopBar } from "./hud/TopBar";
import { Activity, LeftColumn, OverviewPanels, RightColumn } from "./hud/Panels";
import { FleetHealth } from "./hud/FleetHealth";
import { AgentPanel } from "./hud/AgentPanel";
import { MachinePanel } from "./hud/MachinePanel";
import { Benchmark } from "./hud/Benchmark";
import { DemoPanel } from "./hud/DemoPanel";

export default function Workspace({ initial }: { initial: HydrateInput }) {
  const t = useT();
  const ready = useStore((s) => s.auth?.warehouseId === initial.auth.warehouseId);
  const [tab, setTab] = useState<"overview" | "machine" | "agent" | "fleet">("fleet");
  const requestTab = useStore((s) => s.requestTab);
  useEffect(() => { if (requestTab) setTab(requestTab.tab ?? "fleet"); }, [requestTab]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("wt-theme");
      if (saved === "night" || saved === "day") useStore.getState().setTheme(saved);
      else if (window.matchMedia("(prefers-color-scheme: dark)").matches) useStore.getState().setTheme("night");
    } catch {}
    useStore.getState().hydrate(initial);
  }, [initial]);

  // Read the latest readings from the server. In dummy-sensor mode this also lets the sensors report
  // when they are due; with real sensors it is a plain read.
  useEffect(() => {
    let busy = false;
    let again = false;
    const run = async (force = false) => {
      const s = useStore.getState();
      if (busy) { if (force) again = true; return; }
      if (!force && document.hidden) return;
      if (s.machines.length === 0 || !s.auth) return;
      busy = true;
      try {
        const t0 = performance.now();
        const res = await fetch(`/api/health?warehouse=${s.auth.warehouseId}`, { method: "POST", cache: "no-store" });
        if (!res.ok) throw new Error(String(res.status));
        const data = await res.json();
        useStore.getState().applyHealth(data.health, true);
        useStore.getState().recordAnalyze({ at: Date.now(), ms: Math.round(performance.now() - t0), machines: data.health.length, serviceUp: true });
      } catch {
        useStore.getState().applyHealth([], false);
      } finally {
        busy = false;
        if (again) { again = false; void run(true); }
      }
    };
    const id = setInterval(() => void run(), 10_000);
    const unsub = useStore.subscribe((s, prev) => { if (s.pollNonce !== prev.pollNonce) void run(true); });
    return () => { clearInterval(id); unsub(); };
  }, [initial]);

  if (!ready) {
    return <main className="grid h-dvh w-screen place-items-center bg-canvas text-sm text-ink/50">{makeT(initial.locale)("ws.loading")}</main>;
  }

  const tabs = [["overview", t("tab.overview")], ["fleet", t("tab.fleet")], ["machine", t("tab.machine")], ["agent", t("tab.ask")]] as const;

  return (
    <main className="flex h-dvh w-screen flex-col bg-canvas">
      <TopBar />
      <div className="flex min-h-0 flex-1">
        <div className={`${tab === "overview" ? "block" : "hidden"} min-h-0 w-full overflow-y-auto bg-surface lg:block lg:w-auto`}>
          <LeftColumn />
        </div>
        <div className={`${tab === "fleet" ? "flex" : "hidden"} min-h-0 min-w-0 flex-1 flex-col lg:flex`}>
          <DemoPanel />
          <FleetHealth />
        </div>
        <div className={`${tab === "machine" || tab === "agent" ? "block" : "hidden"} scroll-thin min-h-0 w-full overflow-y-auto border-l border-rule bg-surface lg:block lg:w-[380px] lg:shrink-0`}>
          <RightColumn only={tab === "agent" ? "agent" : tab === "machine" ? "machine" : undefined} />
        </div>
      </div>
      <nav aria-label={t("tab.panel")} className="grid h-12 shrink-0 grid-cols-4 border-t border-rule bg-surface text-xs lg:hidden">
        {tabs.map(([k, label]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            aria-pressed={tab === k}
            className={`border-l border-rule first:border-l-0 transition-colors duration-150 ${tab === k ? "bg-ink/10 font-semibold" : "text-ink/60 hover:bg-ink/5"}`}
          >
            {label}
          </button>
        ))}
      </nav>
    </main>
  );
}
