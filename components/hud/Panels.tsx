"use client";

import { fmtDate, fmtTime, renderMsg, type Key } from "@/lib/i18n";
import { useLang, useT } from "@/lib/i18n/use-t";
import { scoreOf } from "@/lib/health";
import { useStore } from "@/lib/store";
import { AgentPanel } from "./AgentPanel";
import { Benchmark } from "./Benchmark";
import { MachinePanel } from "./MachinePanel";
import { Section } from "./ui";

const DAY = 86_400_000;

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div>
      <div className="text-xs text-ink/55">{label}</div>
      <div className="text-2xl font-semibold leading-8 tabular-nums">{value}</div>
      {sub && <div className="text-xs text-ink/45">{sub}</div>}
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
    <Section title={t("ov.title")}>
      <div className="grid grid-cols-2 gap-x-4 gap-y-5">
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
    </Section>
  );
}

const WO_STATUS_CLASS = { scheduled: "text-ink/70", in_progress: "text-accent", done: "text-ok", cancelled: "text-ink/45" } as const;

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
    <Section title={t("wo.title")} aside={t("wo.count", { n: open.length })}>
      {open.length === 0 ? (
        <p className="text-xs text-ink/45">{t("wo.none")}</p>
      ) : (
        <ul className="divide-y divide-rule border-y border-rule">
          {open.map((w) => {
            const m = machines.find((x) => x.id === w.asset_id);
            if (!m) return null;
            const late = w.status === "scheduled" && w.due_at && Date.parse(w.due_at) < Date.now();
            return (
              <li key={w.id}>
                <button onClick={() => select(m)} className={`grid w-full grid-cols-[1fr_auto] items-baseline gap-x-3 px-2 py-2 text-left text-xs transition-colors duration-150 ${selected?.id === m.id ? "bg-ink/10" : "hover:bg-ink/5"}`}>
                  <span className="truncate font-medium">{m.label}</span>
                  <span className={late ? "text-bad" : "text-ink/60"}>{late ? t("maint.late") : w.due_at ? fmtDate(Date.parse(w.due_at), lang, { day: "numeric", month: "short" }) : "–"}</span>
                  <span className={`truncate ${WO_STATUS_CLASS[w.status]}`}>{w.status === "in_progress" ? t("maint.running") : t("wo.scheduled")}</span>
                  <span className="text-ink/40">{w.summary ? "" : ""}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Section>
  );
}

const KIND_CLASS = { info: "", success: "", warn: "text-warn" } as const;

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
    <Section title={t("act.title")}>
      <ul className="scroll-thin max-h-48 space-y-1.5 overflow-y-auto pr-1">
        {items.length === 0 && <li className="text-xs text-ink/45">{t("activity.waiting")}</li>}
        {items.map((e) => (
          <li key={e.id} className="flex gap-3 text-xs leading-snug">
            <span className="shrink-0 text-ink/45">{fmtDate(e.at, lang, { day: "numeric", month: "short" })} {fmtTime(e.at, lang)}</span>
            <span className={e.cls}>{e.text}</span>
          </li>
        ))}
      </ul>
    </Section>
  );
}

export function OverviewPanels() {
  return (
    <>
      <Overview />
      <WorkOrders />
    </>
  );
}

export function LeftColumn() {
  return (
    <aside className="scroll-thin w-full overflow-y-auto border-r border-rule bg-surface lg:w-[280px] lg:shrink-0">
      <OverviewPanels />
    </aside>
  );
}

/** Detail column. `only` narrows it on small screens where tabs split the content. */
export function RightColumn({ only }: { only?: "machine" | "agent" }) {
  return (
    <>
      {only !== "agent" && <MachinePanel />}
      {only !== "machine" && <AgentPanel />}
      {!only && <Benchmark />}
      {!only && <Activity />}
    </>
  );
}
