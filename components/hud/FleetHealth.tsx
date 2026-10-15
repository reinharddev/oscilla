"use client";

import { scoreOf, statusKey } from "@/lib/health";
import { fmtDate, type Key } from "@/lib/i18n";
import { useLang, useT } from "@/lib/i18n/use-t";
import { useStore } from "@/lib/store";

const STATUS_CLASS = { healthy: "text-ok", attention: "text-warn", critical: "text-bad", maintenance: "text-accent" } as const;
const ORDER = { critical: 0, attention: 1, maintenance: 2, healthy: 3 } as const;

/** Main view: every monitored machine, worst first, with the numbers a planner needs. */
export function FleetHealth() {
  const t = useT();
  const lang = useLang();
  const { machines, health, schedules, select, selected, feed, feedAt } = useStore();

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
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2 border-b border-rule px-4 py-3">
        <h1 className="text-sm font-semibold">{t("fh.title")}</h1>
        <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs">
          {summary.map((s) => (
            <span key={s} className="text-ink/60">
              <span className={`mr-1.5 text-base font-semibold ${STATUS_CLASS[s]}`}>{count(s)}</span>
              {t(statusKey(s))}
            </span>
          ))}
          <span className={feed === "error" ? "text-warn" : "text-ink/45"}>{feed === "error" ? t("fh.feedError") : latest ? t("fh.updated", { ago: ago(latest) }) : t("fh.noData")}</span>
          {rows.some((r) => r.h.source === "simulator") && <span className="text-ink/45">{t("fh.simulated")}</span>}
        </div>
      </div>

      <div className="scroll-thin min-h-0 flex-1 overflow-auto">
        <table className="w-full min-w-[620px] text-left text-[13px]">
          <thead className="sticky top-0 bg-surface text-xs text-ink/50">
            <tr className="border-b border-rule">
              <th scope="col" className="px-4 py-2 font-normal">{t("fh.machine")}</th>
              <th scope="col" className="px-2 py-2 font-normal">{t("fh.type")}</th>
              <th scope="col" className="px-2 py-2 font-normal">{t("fh.status")}</th>
              <th scope="col" className="px-2 py-2 text-right font-normal">{t("fh.score")}</th>
              <th scope="col" className="px-2 py-2 text-right font-normal">{t("fh.life")}</th>
              <th scope="col" className="px-4 py-2 text-right font-normal">{t("fh.service")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-rule">
            {rows.map(({ m, h, sch, status, score }) => {
              const overdue = sch.due !== null && sch.due < Date.now() && !sch.inProgress;
              const days = Math.floor((Date.now() - (sch.lastDone ?? 0)) / 86_400_000);
              return (
                <tr key={m.id} onClick={() => select(m)} className={`cursor-pointer transition-colors duration-150 ${selected?.id === m.id ? "bg-ink/10" : "hover:bg-ink/5"}`}>
                  <td className="px-4 py-2">
                    <button className="text-left font-medium outline-none focus-visible:underline" onClick={(e) => { e.stopPropagation(); select(m); }}>{m.label}</button>
                    <div className="text-xs text-ink/45">{m.serial}</div>
                  </td>
                  <td className="px-2 py-2 text-ink/70">{t(`type.${m.type}` as Key)}</td>
                  <td className={`px-2 py-2 ${STATUS_CLASS[status]}`}>{t(statusKey(status))}</td>
                  <td className={`px-2 py-2 text-right font-semibold tabular-nums ${STATUS_CLASS[status]}`}>{score}</td>
                  <td className="px-2 py-2 text-right tabular-nums text-ink/70">{h.rulDays === null ? "–" : h.rulDays < 1 ? t("fh.underDay") : t("fh.days", { n: Math.round(h.rulDays) })}</td>
                  <td className={`px-4 py-2 text-right ${overdue ? "text-bad" : "text-ink/70"}`}>
                    {sch.inProgress ? t("maint.running") : sch.due !== null ? (overdue ? t("maint.late") : fmtDate(sch.due, lang, { day: "numeric", month: "short" })) : sch.lastDone ? t("fh.lastAgo", { n: days }) : "–"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="border-t border-rule px-4 py-2 text-xs text-ink/45">{t("fh.legend")}</p>
    </section>
  );
}
