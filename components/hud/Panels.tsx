"use client";

import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { scoreOf } from "@/lib/health";
import { fmtDate, fmtTime, renderMsg } from "@/lib/i18n";
import { useLang, useT } from "@/lib/i18n/use-t";
import { canSeeBenchmark } from "@/lib/roles";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import { AgentPanel } from "./AgentPanel";
import { Benchmark } from "./Benchmark";
import { MachinePanel } from "./MachinePanel";

const DAY = 86_400_000;

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-2xl font-semibold leading-8 tabular-nums">{value}</div>
      {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}

/** Numbers a maintenance planner looks at first, all computed from the database. */
export function Overview() {
  const t = useT();
  const { machines, health, workOrders } = useStore();
  const now = Date.now();
  const scores = machines.map((m) => health[m.id]).filter(Boolean).map(scoreOf);
  const needAttention = machines.filter((m) => health[m.id] && health[m.id].status !== "healthy").length;
  const open = workOrders.filter((w) => w.status === "scheduled" || w.status === "in_progress");
  const overdue = open.filter((w) => w.status === "scheduled" && w.due_at && Date.parse(w.due_at) < now).length;
  const done30 = workOrders.filter((w) => w.status === "done" && w.completed_at && now - Date.parse(w.completed_at) <= 30 * DAY).length;
  const reviewed = workOrders.filter((w) => w.diagnosis_feedback);
  const correct = reviewed.filter((w) => w.diagnosis_feedback === "correct").length;
  const avg = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;

  return (
    <Card>
      <CardHeader><CardTitle>{t("ov.title")}</CardTitle></CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-3">
          <Stat label={t("ov.monitored")} value={String(machines.length)} />
          <Stat label={t("ov.needAttention")} value={String(needAttention)} />
          <Stat label={t("ov.avgScore")} value={avg === null ? "–" : String(avg)} />
          <Stat label={t("ov.openOrders")} value={String(open.length)} sub={overdue ? t("ov.overdue", { n: overdue }) : undefined} />
          <Stat label={t("ov.done30")} value={String(done30)} />
          <Stat
            label={t("ov.aiConfirmed")}
            value={reviewed.length ? `${Math.round((correct / reviewed.length) * 100)}%` : "–"}
            sub={reviewed.length ? t("ov.reviewed", { n: reviewed.length }) : t("ov.noReviews")}
          />
        </div>
      </CardContent>
    </Card>
  );
}

/** Open work orders, soonest first. Selecting one opens the machine. */
export function WorkOrders() {
  const t = useT();
  const lang = useLang();
  const { workOrders, machines, select, selected } = useStore();
  const open = workOrders
    .filter((w) => w.status === "scheduled" || w.status === "in_progress")
    .sort((a, b) => (a.due_at ? Date.parse(a.due_at) : Infinity) - (b.due_at ? Date.parse(b.due_at) : Infinity))
    .slice(0, 8);
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("wo.title")}</CardTitle>
        <CardAction className="text-sm text-muted-foreground">{t("wo.count", { n: open.length })}</CardAction>
      </CardHeader>
      <CardContent>
        {open.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("wo.none")}</p>
        ) : (
          <ul className="flex flex-col">
            {open.map((w, i) => {
              const m = machines.find((x) => x.id === w.asset_id);
              if (!m) return null;
              const late = w.status === "scheduled" && w.due_at && Date.parse(w.due_at) < Date.now();
              return (
                <li key={w.id}>
                  {i > 0 && <Separator />}
                  <Button variant="ghost" onClick={() => select(m)} data-active={selected?.id === m.id} className="h-auto w-full justify-between gap-4 rounded-none px-1 py-2 font-normal data-[active=true]:bg-muted">
                    <span className="flex min-w-0 flex-col items-start">
                      <span className="truncate font-medium">{m.label}</span>
                      <span className="text-xs text-muted-foreground">{w.status === "in_progress" ? t("maint.running") : t("wo.scheduled")}</span>
                    </span>
                    <span className={cn("shrink-0 text-xs", late ? "font-medium text-destructive" : "text-muted-foreground")}>
                      {late ? t("maint.late") : w.due_at ? fmtDate(Date.parse(w.due_at), lang, { day: "numeric", month: "short" }) : "–"}
                    </span>
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

const KIND_CLASS = { info: "", success: "", warn: "text-warning" } as const;

/** What happened lately: status changes seen in this session and journal entries from the database. */
export function Activity() {
  const t = useT();
  const lang = useLang();
  const { events, journal, machines } = useStore();
  const label = (id: string) => machines.find((m) => m.id === id)?.label ?? id;
  const items = [
    ...events.map((e) => ({ id: `e${e.id}`, at: e.at, cls: KIND_CLASS[e.kind], text: renderMsg(t, e.key, e.params) })),
    ...Object.entries(journal).flatMap(([assetId, entries]) =>
      entries.filter((j) => j.kind !== "alert").slice(0, 5).map((j) => ({
        id: `j${j.id}`, at: j.ts, cls: "", text: `${label(assetId)}: ${j.key ? renderMsg(t, j.key, j.params) : j.text}`,
      })),
    ),
  ].sort((a, b) => b.at - a.at).slice(0, 12);
  return (
    <div className="px-4 pb-4">
      <Card size="sm">
        <CardHeader><CardTitle>{t("act.title")}</CardTitle></CardHeader>
        <CardContent>
          <ul className="flex flex-col gap-2">
            {items.length === 0 && <li className="text-sm text-muted-foreground">{t("activity.waiting")}</li>}
            {items.map((e) => (
              <li key={e.id} className="flex gap-3 text-xs leading-snug">
                <span className="w-28 shrink-0 text-muted-foreground">{fmtDate(e.at, lang, { day: "numeric", month: "short" })} {fmtTime(e.at, lang)}</span>
                <span className={e.cls}>{e.text}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

/** Detail column of the Machines screen. `only` narrows it on small screens where tabs split the content. */
export function RightColumn({ only }: { only?: "machine" | "agent" }) {
  const role = useStore((s) => s.auth?.role);
  return (
    <>
      {only !== "agent" && <MachinePanel />}
      {only !== "machine" && <AgentPanel />}
      {!only && canSeeBenchmark(role) && <Benchmark />}
      {!only && <Activity />}
    </>
  );
}
