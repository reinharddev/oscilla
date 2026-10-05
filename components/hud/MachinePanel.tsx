"use client";

import { useState } from "react";
import { analysis, faultKey, featureLabel, LIMIT, rulDays, scoreOf, statusKey, statusOf } from "@/lib/health";
import { fmtDate, fmtDateTime, renderMsg, type Key, type Lang, type T } from "@/lib/i18n";
import { useLang, useT } from "@/lib/i18n/use-t";
import { canWrite, useStore } from "@/lib/store";
import { CopilotPanel } from "./CopilotPanel";
import { Section } from "./ui";

const ago = (ts: number, t: T) => {
  const d = Math.floor((Date.now() - ts) / 86_400_000);
  return d <= 0 ? t("time.today") : t("time.daysAgo", { n: d });
};
const toLocalInput = (ts: number) => { const d = new Date(ts - new Date().getTimezoneOffset() * 60_000); return d.toISOString().slice(0, 16); };

const STATUS_CLASS = { healthy: "text-ok", attention: "text-warn", critical: "text-bad", maintenance: "text-accent" } as const;

function Spark({ data, limit }: { data: number[]; limit: number }) {
  const W = 96, H = 22;
  const max = Math.max(limit * 1.15, ...data), min = Math.min(...data) * 0.9;
  const y = (v: number) => H - ((v - min) / (max - min || 1)) * H;
  const pts = data.map((v, i) => `${((i / Math.max(1, data.length - 1)) * W).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} aria-hidden>
      <line x1="0" x2={W} y1={y(limit)} y2={y(limit)} className="stroke-warn" strokeWidth="1" strokeDasharray="2 3" opacity=".6" />
      <polyline points={pts} fill="none" className="stroke-accent" strokeWidth="1.5" />
    </svg>
  );
}

function Reading({ label, unit, value, data, limit }: { label: string; unit: string; value: number; data: number[]; limit: number }) {
  const over = value > limit;
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <div>
        <div className="text-xs text-ink/55">{label}</div>
        <div className={`text-sm font-semibold ${over ? "text-warn" : ""}`}>{value.toFixed(1)} <span className="text-xs font-normal text-ink/55">{unit}</span></div>
      </div>
      <Spark data={data} limit={limit} />
    </div>
  );
}

export function MachinePanel() {
  const t = useT();
  const lang: Lang = useLang();
  const { selected, health, schedules, journal, scheduleMaintenance, startMaintenance, completeMaintenance, addNote, auth, machines, analysisStatus } = useStore();
  const writable = canWrite(auth);
  const [due, setDue] = useState("");
  const [note, setNote] = useState("");
  const [work, setWork] = useState("");
  const [feedback, setFeedback] = useState<"correct" | "incorrect" | undefined>();

  const machine = selected ? machines.find((m) => m.id === selected.id) : undefined;
  if (!selected || !machine || !health[selected.id]) {
    return (
      <Section title={t("mach.empty.title")}>
        <p className="text-xs text-ink/55">{t("mach.empty.body")}</p>
      </Section>
    );
  }

  const id = selected.id;
  const h = health[id], sch = schedules[id], log = journal[id] ?? [];
  const st = sch.inProgress ? "maintenance" : statusOf(h);
  const overdue = sch.due !== null && sch.due < Date.now() && !sch.inProgress;

  return (
    <>
      <Section title={selected.label} aside={t(faultKey(h.fault))}>
        <div className="mb-3 text-xs text-ink/55">{t("mach.serial", { s: machine.serial })}</div>
        <div className="flex items-end justify-between">
          <div>
            <div className="text-xs text-ink/55">{t("mach.score")}</div>
            <div className="text-3xl font-semibold leading-9">{scoreOf(h)}<span className="text-base font-normal text-ink/45">/100</span></div>
          </div>
          <div className="text-right">
            <div className={`text-sm font-semibold ${STATUS_CLASS[st]}`}>{t(statusKey(st))}</div>
            <div className="text-xs text-ink/55">{t("mach.rul", { n: rulDays(h) })}</div>
          </div>
        </div>
        <div className="mt-3 divide-y divide-rule border-y border-rule">
          <Reading label={t("mach.vibration")} unit="mm/s" value={h.vib} data={h.hist.vib} limit={LIMIT.vib} />
          <Reading label={t("mach.motorTemp")} unit="°C" value={h.temp} data={h.hist.temp} limit={LIMIT.temp} />
          <Reading label={t("mach.current")} unit="A" value={h.cur} data={h.hist.cur} limit={LIMIT.cur} />
        </div>
        <div className="mt-3 text-xs text-ink/55">{t("mach.autoAnalysis")}</div>
        <p className="mt-1 text-[13px] leading-relaxed">{analysis(h, t)}</p>
        {h.analysis ? (
          <div className="mt-3">
            <div className="text-xs text-ink/55">{t("mach.evidence")}</div>
            {h.analysis.evidence.length === 0 ? (
              <p className="mt-1 text-xs text-ink/70">{t("mach.noDeviation")}</p>
            ) : (
              <ul className="mt-1 divide-y divide-rule border-y border-rule text-xs">
                {h.analysis.evidence.map((e) => (
                  <li key={e.feature} className="flex justify-between gap-3 py-1.5">
                    <span>{featureLabel(e, t)}</span>
                    <span className="shrink-0 text-ink/60">{e.value.toFixed(2)} vs {e.baseline.toFixed(2)} · z {e.z_score}</span>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-1.5 text-xs text-ink/45">{t("mach.computedBy", { v: h.analysis.modelVersion })}</div>
          </div>
        ) : analysisStatus === "offline" ? (
          <p className="mt-2 text-xs text-ink/45">{t("mach.offline")}</p>
        ) : null}
      </Section>

      <CopilotPanel key={id} machineId={id} canAct={writable} />

      <Section title={t("mach.maint.title")} aside={sch.lastDone ? t("mach.lastService", { ago: ago(sch.lastDone, t) }) : t("mach.never")}>
        {!writable ? (
          <div className="space-y-1 text-xs">
            {sch.inProgress && <p className="text-ink/70">{t("mach.inMaintenance")}</p>}
            {sch.due !== null && <p className="text-ink/70">{t("mach.scheduled", { date: fmtDateTime(sch.due, lang) })}</p>}
            <p className="text-ink/50">{t("mach.readOnly")}</p>
          </div>
        ) : sch.inProgress ? (
          <div className="space-y-2">
            <p className="text-xs text-ink/70">{t("mach.stopped")}</p>
            <textarea value={work} onChange={(e) => setWork(e.target.value)} rows={3} placeholder={t("mach.workPlaceholder")} className="w-full rounded-ui border border-rule bg-surface p-2 text-xs outline-none focus:border-accent" />
            <div className="text-xs text-ink/60">
              {t("mach.feedback")}
              <div className="mt-1 flex gap-2">
                {([["correct", t("mach.fbCorrect")], ["incorrect", t("mach.fbIncorrect")]] as const).map(([k, label]) => (
                  <button key={k} onClick={() => setFeedback(feedback === k ? undefined : k)} aria-pressed={feedback === k} className={`h-7 rounded-ui border px-2.5 text-xs transition-colors duration-150 ${feedback === k ? "border-ink/40 bg-ink/10 text-ink" : "border-rule hover:bg-ink/5"}`}>{label}</button>
                ))}
              </div>
            </div>
            <button onClick={() => { completeMaintenance(id, work, feedback); setWork(""); setFeedback(undefined); }} className="h-8 w-full rounded-ui bg-accent text-xs font-semibold text-canvas transition-opacity duration-150 hover:opacity-90">{t("mach.complete")}</button>
          </div>
        ) : (
          <div className="space-y-2">
            {sch.due !== null && (
              <div className={`text-xs ${overdue ? "font-semibold text-bad" : "text-ink/70"}`}>
                {t(overdue ? "mach.overdue" : "mach.scheduled", { date: fmtDateTime(sch.due, lang) })}
              </div>
            )}
            <div className="flex gap-2">
              <input type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} aria-label={t("mach.whenAria")} className="h-8 min-w-0 flex-1 rounded-ui border border-rule bg-surface px-2 text-xs outline-none focus:border-accent" />
              <button
                disabled={!due}
                onClick={() => { scheduleMaintenance(id, new Date(due).getTime()); setDue(""); }}
                className="h-8 rounded-ui border border-rule px-3 text-xs transition-colors duration-150 hover:bg-ink/5 disabled:opacity-40"
              >{t("mach.schedule")}</button>
            </div>
            <button onClick={() => setDue(toLocalInput(Date.now() + 86_400_000))} className="text-xs text-accent hover:underline">{t("mach.fillTomorrow")}</button>
            <button onClick={() => startMaintenance(id)} className="block h-8 w-full rounded-ui border border-rule text-xs transition-colors duration-150 hover:bg-ink/5">{t("mach.startNow")}</button>
          </div>
        )}
      </Section>

      <Section title={t("mach.journal.title")} aside={t("mach.entries", { n: log.length })}>
        {writable && <div className="flex gap-2">
          <input value={note} onChange={(e) => setNote(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { addNote(id, note); setNote(""); } }} placeholder={t("mach.addNote")} className="h-8 min-w-0 flex-1 rounded-ui border border-rule bg-surface px-2 text-xs outline-none focus:border-accent" />
          <button disabled={!note.trim()} onClick={() => { addNote(id, note); setNote(""); }} className="h-8 rounded-ui border border-rule px-3 text-xs transition-colors duration-150 hover:bg-ink/5 disabled:opacity-40">{t("mach.save")}</button>
        </div>}
        <ul className="scroll-thin mt-3 max-h-64 divide-y divide-rule overflow-y-auto border-y border-rule">
          {log.length === 0 && <li className="py-2 text-xs text-ink/45">{t("mach.noNotes")}</li>}
          {log.map((e) => (
            <li key={e.id} className="py-2">
              <div className="flex justify-between text-xs text-ink/55"><span className={e.kind === "alert" ? "text-warn" : ""}>{t(`kind.${e.kind}` as Key)}{e.author ? ` · ${e.author}` : ""}</span><span>{fmtDateTime(e.ts, lang)}</span></div>
              <div className="mt-0.5 text-[13px] leading-snug">{e.key ? renderMsg(t, e.key, e.params) : e.text}</div>
            </li>
          ))}
        </ul>
      </Section>
    </>
  );
}

export function MaintenanceTable() {
  const t = useT();
  const lang = useLang();
  const { health, schedules, select, selected, machines } = useStore();
  return (
    <Section title={t("maint.title")} aside={t("maint.hint")}>
      <div className="grid grid-cols-[1fr_44px_84px] px-2 pb-1 text-xs text-ink/45"><span>{t("maint.machine")}</span><span className="text-right">{t("maint.score")}</span><span className="text-right">{t("maint.service")}</span></div>
      <ul className="divide-y divide-rule border-y border-rule">
        {machines.map((m) => {
          const h = health[m.id], sch = schedules[m.id];
          if (!h || !sch) return null;
          const st = sch.inProgress ? "maintenance" : statusOf(h);
          const overdue = sch.due !== null && sch.due < Date.now() && !sch.inProgress;
          return (
            <li key={m.id}>
              <button onClick={() => select(m)} className={`grid w-full grid-cols-[1fr_44px_84px] items-center px-2 py-1.5 text-left text-xs transition-colors duration-150 ${selected?.id === m.id ? "bg-ink/10" : "hover:bg-ink/5"}`}>
                <span className="truncate">{m.label}</span>
                <span className={`text-right font-semibold ${STATUS_CLASS[st]}`}>{sch.inProgress ? "MT" : scoreOf(h)}</span>
                <span className={`text-right ${overdue ? "text-bad" : "text-ink/60"}`}>
                  {sch.inProgress ? t("maint.running") : sch.due !== null ? (overdue ? t("maint.late") : fmtDate(sch.due, lang, { day: "numeric", month: "short" })) : sch.lastDone ? ago(sch.lastDone, t) : "-"}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <p className="mt-2 text-xs text-ink/45">{t("maint.legend")}</p>
    </Section>
  );
}
