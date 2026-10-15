"use client";

import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader } from "@/components/ui/empty";
import { Separator } from "@/components/ui/separator";
import { StatusBadge } from "@/components/status-badge";
import { scoreOf, statusKey } from "@/lib/health";
import { fmtDate } from "@/lib/i18n";
import { useLang, useT } from "@/lib/i18n/use-t";
import { useStore, type WorkOrder } from "@/lib/store";
import { cn } from "@/lib/utils";
import { Page, Panel, useOpenMachine } from "./shared";

const byDue = (a: WorkOrder, b: WorkOrder) => (a.due_at ? Date.parse(a.due_at) : Infinity) - (b.due_at ? Date.parse(b.due_at) : Infinity);

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

  const due = (w: WorkOrder) => (w.due_at ? t("tasks.due", { date: fmtDate(Date.parse(w.due_at), lang, { day: "numeric", month: "short" }) }) : t("tasks.noDue"));
  const late = (w: WorkOrder) => w.status === "scheduled" && w.due_at && Date.parse(w.due_at) < Date.now();

  const List = ({ items, mineRows }: { items: WorkOrder[]; mineRows: boolean }) => (
    <ul className="flex flex-col">
      {items.map((w, i) => {
        const m = machines.find((x) => x.id === w.asset_id);
        if (!m) return null;
        return (
          <li key={w.id}>
            {i > 0 && <Separator />}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
              <div className="min-w-0 flex-1">
                <Button variant="link" className="h-auto p-0 text-sm font-medium text-foreground" onClick={() => open(m)}>{m.label}</Button>
                <p className="text-sm text-muted-foreground">{w.summary}</p>
                <p className={cn("mt-0.5 text-xs", late(w) ? "font-medium text-destructive" : "text-muted-foreground")}>
                  {w.status === "in_progress" ? t("tasks.inProgress") : due(w)}
                </p>
              </div>
              <div className="flex gap-2">
                {mineRows ? (
                  <>
                    {w.status === "scheduled" && <Button size="sm" onClick={async () => { open(m); await startMaintenance(m.id); }}>{t("tasks.start")}</Button>}
                    <Button size="sm" variant="outline" onClick={() => open(m)}>{t("tasks.open")}</Button>
                    {w.status === "scheduled" && <Button size="sm" variant="ghost" onClick={() => void assignWorkOrder(w.id, null)}>{t("tasks.release")}</Button>}
                  </>
                ) : (
                  <Button size="sm" onClick={() => me && void assignWorkOrder(w.id, me)}>{t("tasks.take")}</Button>
                )}
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );

  const none = (text: string) => (
    <Empty className="border border-dashed py-6"><EmptyHeader><EmptyDescription>{text}</EmptyDescription></EmptyHeader></Empty>
  );

  return (
    <Page title={t("tasks.title")} aside={auth?.warehouseName}>
      <Panel title={t("tasks.mine")} description={String(mine.length)}>
        {mine.length === 0 ? none(t("tasks.noneMine")) : <List items={mine} mineRows />}
      </Panel>
      <Panel title={t("tasks.unassigned")} description={String(free.length)}>
        {free.length === 0 ? none(t("tasks.noneUnassigned")) : <List items={free} mineRows={false} />}
      </Panel>
      <Panel title={t("tasks.watch")}>
        {watch.length === 0 ? (
          none(t("tasks.watchNone"))
        ) : (
          <ul className="flex flex-col">
            {watch.map(({ m, h }, i) => (
              <li key={m.id}>
                {i > 0 && <Separator />}
                <Button variant="ghost" className="h-auto w-full justify-between rounded-none px-1 py-2.5 font-normal" onClick={() => open(m)}>
                  <span className="font-medium">{m.label}</span>
                  <span className="flex items-center gap-2">
                    <StatusBadge status={h.status}>{t(statusKey(h.status))}</StatusBadge>
                    <span className="w-8 text-right font-semibold tabular-nums">{scoreOf(h)}</span>
                  </span>
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </Page>
  );
}
