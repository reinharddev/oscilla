"use client";

import { useEffect, useState } from "react";
import { makeT } from "@/lib/i18n";
import { useT } from "@/lib/i18n/use-t";
import { useStore, type HydrateInput } from "@/lib/store";
import { TopBar } from "./hud/TopBar";
import { RightColumn } from "./hud/Panels";
import { FleetHealth } from "./hud/FleetHealth";
import { DemoPanel } from "./hud/DemoPanel";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DEFAULT_VIEW, VIEW_LABEL, VIEWS, type ViewId } from "@/lib/roles";
import { TasksView } from "./views/TasksView";
import { OverviewView } from "./views/OverviewView";
import { OrdersView } from "./views/OrdersView";
import { OrganizationView } from "./views/OrganizationView";
import { PeopleView } from "./views/PeopleView";
import { AuditView } from "./views/AuditView";
import { SourcesView } from "./views/SourcesView";

export default function Workspace({ initial }: { initial: HydrateInput }) {
  const t = useT();
  const ready = useStore((s) => s.auth?.warehouseId === initial.auth.warehouseId);
  const [tab, setTab] = useState<"machine" | "agent" | "fleet">("fleet");
  const view = useStore((s) => s.view);
  const setView = useStore((s) => s.setView);
  const role = useStore((s) => s.auth?.role);
  const requestTab = useStore((s) => s.requestTab);
  useEffect(() => { if (requestTab) setTab(requestTab.tab === "machine" || requestTab.tab === "agent" ? requestTab.tab : "fleet"); }, [requestTab]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("wt-theme");
      useStore.getState().setTheme(saved === "day" ? "day" : "night");
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
    return <main className="grid h-dvh w-screen place-items-center bg-background text-sm text-muted-foreground">{makeT(initial.locale)("ws.loading")}</main>;
  }

  const allowed = role ? VIEWS[role] : [];
  const current: ViewId = allowed.includes(view) ? view : role ? DEFAULT_VIEW[role] : "machines";
  const tabs = [["fleet", t("tab.fleet")], ["machine", t("tab.machine")], ["agent", t("tab.ask")]] as const;

  return (
    <main className="flex h-dvh w-screen flex-col bg-background">
      <TopBar />
      <Tabs value={current} onValueChange={(v) => setView(v as ViewId)} className="shrink-0 border-b bg-card">
        <div className="scroll-thin overflow-x-auto px-2 md:px-3">
          <TabsList variant="line" aria-label={t("tab.sections")} className="h-10 gap-0">
            {allowed.map((v) => (
              <TabsTrigger key={v} value={v} className="h-10 flex-none rounded-none px-3 after:bottom-0">
                {t(VIEW_LABEL[v])}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
      </Tabs>

      {current === "machines" ? (
        <>
          <div className="flex min-h-0 flex-1">
            <div className={`${tab === "fleet" ? "flex" : "hidden"} min-h-0 min-w-0 flex-1 flex-col lg:flex`}>
              <DemoPanel />
              <FleetHealth />
            </div>
            <div className={`${tab === "machine" || tab === "agent" ? "block" : "hidden"} scroll-thin min-h-0 w-full overflow-y-auto border-l bg-card lg:block lg:w-[420px] lg:shrink-0`}>
              <RightColumn only={tab === "agent" ? "agent" : tab === "machine" ? "machine" : undefined} />
            </div>
          </div>
          <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)} className="shrink-0 border-t bg-card lg:hidden">
            <TabsList aria-label={t("tab.panel")} className="grid h-11 w-full grid-cols-3 rounded-none bg-transparent p-1">
              {tabs.map(([k, label]) => <TabsTrigger key={k} value={k}>{label}</TabsTrigger>)}
            </TabsList>
          </Tabs>
        </>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
          {current === "tasks" && <TasksView />}
          {current === "overview" && <OverviewView />}
          {current === "orders" && <OrdersView />}
          {current === "organization" && <OrganizationView />}
          {current === "people" && <PeopleView />}
          {current === "audit" && <AuditView />}
          {current === "sources" && <SourcesView />}
        </div>
      )}
    </main>
  );
}
