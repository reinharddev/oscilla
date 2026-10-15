"use client";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { scoreOf, statusKey } from "@/lib/health";
import { fmtDate, type Key } from "@/lib/i18n";
import { useLang, useT } from "@/lib/i18n/use-t";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import { StatusBadge, STATUS_TEXT } from "@/components/status-badge";

const ORDER = { critical: 0, attention: 1, maintenance: 2, healthy: 3 } as const;

/** Main view: every monitored machine, worst first, with the numbers a planner needs. */
export function FleetHealth() {
  const t = useT();
  const lang = useLang();
  const { machines, health, schedules, select, selected, feed } = useStore();

  const rows = machines
    .map((m) => {
      const h = health[m.id];
      const sch = schedules[m.id];
      if (!h || !sch) return null;
      const status = sch.inProgress ? ("maintenance" as const) : h.status;
      return { m, h, sch, status, score: scoreOf(h) };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null)
    .sort((a, b) => ORDER[a.status] - ORDER[b.status] || a.score - b.score);

  const latest = rows.reduce((m, r) => Math.max(m, r.h.takenAt), 0) || null;
  const ago = (ts: number) => {
    const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
    return s < 90 ? t("time.secondsAgo", { n: s }) : s < 5400 ? t("time.minutesAgo", { n: Math.round(s / 60) }) : t("time.hoursAgo", { n: Math.round(s / 3600) });
  };
  const count = (s: keyof typeof ORDER) => rows.filter((r) => r.status === s).length;
  const summary = (["critical", "attention", "healthy", "maintenance"] as const).filter((s) => s !== "maintenance" || count(s) > 0);

  return (
    <section className="flex min-h-0 flex-1 flex-col" aria-label={t("fh.title")}>
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-b px-4 py-3">
        <h1 className="text-xl font-semibold tracking-tight">{t("fh.title")}</h1>
        <div className="flex flex-wrap items-center gap-2">
          {summary.map((s) => (
            <StatusBadge key={s} status={s}>
              <span className="font-semibold tabular-nums">{count(s)}</span> {t(statusKey(s))}
            </StatusBadge>
          ))}
        </div>
      </div>

      <div className="scroll-thin min-h-0 flex-1 overflow-auto">
        <Table className="min-w-[640px]">
          <TableHeader className="sticky top-0 bg-card">
            <TableRow>
              <TableHead className="pl-4">{t("fh.machine")}</TableHead>
              <TableHead>{t("fh.type")}</TableHead>
              <TableHead>{t("fh.status")}</TableHead>
              <TableHead className="text-right">{t("fh.score")}</TableHead>
              <TableHead className="text-right">{t("fh.life")}</TableHead>
              <TableHead className="pr-4 text-right">{t("fh.service")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map(({ m, h, sch, status, score }) => {
              const overdue = sch.due !== null && sch.due < Date.now() && !sch.inProgress;
              const days = Math.floor((Date.now() - (sch.lastDone ?? 0)) / 86_400_000);
              return (
                <TableRow key={m.id} onClick={() => select(m)} data-state={selected?.id === m.id ? "selected" : undefined} className="cursor-pointer">
                  <TableCell className="pl-4">
                    <button className="text-left font-medium outline-none focus-visible:underline" onClick={(e) => { e.stopPropagation(); select(m); }}>{m.label}</button>
                    <div className="text-xs text-muted-foreground">{m.serial}</div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{t(`type.${m.type}` as Key)}</TableCell>
                  <TableCell><StatusBadge status={status}>{t(statusKey(status))}</StatusBadge></TableCell>
                  <TableCell className={cn("text-right text-base font-semibold tabular-nums", STATUS_TEXT[status])}>{score}</TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {h.rulDays === null ? "–" : h.rulDays < 1 ? t("fh.underDay") : t("fh.days", { n: Math.round(h.rulDays) })}
                  </TableCell>
                  <TableCell className={cn("pr-4 text-right", overdue ? "font-medium text-destructive" : "text-muted-foreground")}>
                    {sch.inProgress ? t("maint.running") : sch.due !== null ? (overdue ? t("maint.late") : fmtDate(sch.due, lang, { day: "numeric", month: "short" })) : sch.lastDone ? t("fh.lastAgo", { n: days }) : "–"}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t px-4 py-2 text-xs text-muted-foreground">
        <span>{t("fh.legend")}</span>
        <span className={feed === "error" ? "text-warning" : undefined}>
          {feed === "error" ? t("fh.feedError") : latest ? t("fh.updated", { ago: ago(latest) }) : t("fh.noData")}
          {rows.some((r) => r.h.source === "simulator") && ` · ${t("fh.simulated")}`}
        </span>
      </div>
    </section>
  );
}
