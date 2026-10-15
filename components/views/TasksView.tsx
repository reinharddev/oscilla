"use client";

import { fmtDate } from "@/lib/i18n";
import { useLang, useT } from "@/lib/i18n/use-t";
import { scoreOf, statusKey } from "@/lib/health";
import { useStore, type WorkOrder } from "@/lib/store";
import { Page, Panel, useOpenMachine } from "./shared";

const STATUS_CLASS = { healthy: "text-ok", attention: "text-warn", critical: "text-bad" } as const;

/** The technician's start screen: what is assigned to me, what I can pick up, what to keep an eye on. */
export function TasksView() {
  const t = useT();
  const lang = useLang();
  const open = useOpenMachine();
  const { workOrders, machines, auth, assignWorkOrder, startMaintenance, health } = useStore();
  const me = auth?.userId;

  const active = workOrders.filter((w) => w.status === "scheduled" || w.status === "in_progress");
  const mine = active.filter((w) => w.assigned_to === me).sort(byDue);
  const free = active.filter((w) => !w.assigned_to).sort(byDue);
  const watch = machines
    .map((m) => ({ m, h: health[m.id] }))
    .filter((x) => x.h && x.h.status !== "healthy")
    .sort((a, b) => a.h.score - b.h.score)
    .slice(0, 5);

  const machine = (w: WorkOrder) => machines.find((m) => m.id === w.asset_id);
  const due = (w: WorkOrder) => (w.due_at ? t("tasks.due", { date: fmtDate(Date.parse(w.due_at), lang, { day: "numeric", month: "short" }) }) : t("tasks.noDue"));
  const late = (w: WorkOrder) => w.status === "scheduled" && w.due_at && Date.parse(w.due_at) < Date.now();

  const Row = ({ w, mineRow }: { w: WorkOrder; mineRow: boolean }) => {
    const m = machine(w);
    if (!m) return null;
    return (
      <li className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
        <div className="min-w-0 flex-1">
          <button onClick={() => open(m)} className="text-left text-sm font-medium hover:underline">{m.label}</button>
          <div className="text-xs text-ink/60">{w.summary}</div>
          <div className={`mt-0.5 text-xs ${late(w) ? "text-bad" : "text-ink/45"}`}>{w.status === "in_progress" ? t("tasks.inProgress") : due(w)}</div>
        </div>
        <div className="flex gap-2">
          {mineRow && w.status === "scheduled" && (
            <button onClick={async () => { open(m); await startMaintenance(m.id); }} className="h-8 rounded-ui bg-accent px-3 text-xs font-semibold text-canvas hover:opacity-90">{t("tasks.start")}</button>
          )}
          {mineRow ? (
            <>
              <button onClick={() => open(m)} className="h-8 rounded-ui border border-rule px-3 text-xs hover:bg-ink/5">{t("tasks.open")}</button>
              {w.status === "scheduled" && <button onClick={() => assignWorkOrder(w.id, null)} className="h-8 rounded-ui border border-rule px-3 text-xs text-ink/60 hover:bg-ink/5">{t("tasks.release")}</button>}
            </>
          ) : (
            <button onClick={() => me && assignWorkOrder(w.id, me)} className="h-8 rounded-ui bg-accent px-3 text-xs font-semibold text-canvas hover:opacity-90">{t("tasks.take")}</button>
          )}
        </div>
      </li>
    );
  };

  return (
    <Page title={t("tasks.title")} aside={auth?.warehouseName}>
      <Panel title={t("tasks.mine")} aside={String(mine.length)}>
        {mine.length === 0 ? <p className="px-4 py-3 text-xs text-ink/50">{t("tasks.noneMine")}</p> : <ul className="divide-y divide-rule">{mine.map((w) => <Row key={w.id} w={w} mineRow />)}</ul>}
      </Panel>
      <Panel title={t("tasks.unassigned")} aside={String(free.length)}>
        {free.length === 0 ? <p className="px-4 py-3 text-xs text-ink/50">{t("tasks.noneUnassigned")}</p> : <ul className="divide-y divide-rule">{free.map((w) => <Row key={w.id} w={w} mineRow={false} />)}</ul>}
      </Panel>
      <Panel title={t("tasks.watch")}>
        {watch.length === 0 ? (
          <p className="px-4 py-3 text-xs text-ink/50">{t("tasks.watchNone")}</p>
        ) : (
          <ul className="divide-y divide-rule">
            {watch.map(({ m, h }) => (
              <li key={m.id}>
                <button onClick={() => open(m)} className="flex w-full items-center justify-between px-4 py-2.5 text-left text-sm hover:bg-ink/5">
                  <span>{m.label}</span>
                  <span className={`text-xs ${STATUS_CLASS[h.status]}`}>{t(statusKey(h.status))} · {scoreOf(h)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </Page>
  );
}

const byDue = (a: WorkOrder, b: WorkOrder) => (a.due_at ? Date.parse(a.due_at) : Infinity) - (b.due_at ? Date.parse(b.due_at) : Infinity);
