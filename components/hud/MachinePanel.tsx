"use client";

import { useState } from "react";
import { analysis, featureLabel, LIMIT, scoreOf, statusKey } from "@/lib/health";
import { fmtDateTime, renderMsg, type Key, type Lang, type T } from "@/lib/i18n";
import { useLang, useT } from "@/lib/i18n/use-t";
import { canWrite, useStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { StatusBadge } from "@/components/status-badge";
import { cn } from "@/lib/utils";
import { CopilotPanel } from "./CopilotPanel";
import { ScoreTrend } from "./ScoreTrend";

const ago = (ts: number, t: T) => {
  const d = Math.floor((Date.now() - ts) / 86_400_000);
  return d <= 0 ? t("time.today") : t("time.daysAgo", { n: d });
};
const toLocalInput = (ts: number) => { const d = new Date(ts - new Date().getTimezoneOffset() * 60_000); return d.toISOString().slice(0, 16); };

function Spark({ data, limit }: { data: number[]; limit: number }) {
  const W = 96, H = 24;
  const max = Math.max(limit * 1.15, ...data), min = Math.min(...data) * 0.9;
  const y = (v: number) => H - ((v - min) / (max - min || 1)) * H;
  const pts = data.map((v, i) => `${((i / Math.max(1, data.length - 1)) * W).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} aria-hidden className="text-foreground">
      <line x1="0" x2={W} y1={y(limit)} y2={y(limit)} stroke="var(--warning)" strokeWidth="1" strokeDasharray="2 3" opacity=".7" />
      <polyline points={pts} fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function Reading({ label, unit, value, data, limit }: { label: string; unit: string; value: number; data: number[]; limit: number }) {
  const over = value > limit;
  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <div>
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className={cn("text-sm font-semibold tabular-nums", over && "text-warning")}>{value.toFixed(1)} <span className="text-xs font-normal text-muted-foreground">{unit}</span></div>
      </div>
      <Spark data={data} limit={limit} />
    </div>
  );
}

export function MachinePanel() {
  const t = useT();
  const lang: Lang = useLang();
  const { selected, health, schedules, journal, scheduleMaintenance, startMaintenance, completeMaintenance, addNote, auth, machines } = useStore();
  const writable = canWrite(auth);
  const [due, setDue] = useState("");
  const [note, setNote] = useState("");
  const [work, setWork] = useState("");
  const [feedback, setFeedback] = useState<"correct" | "incorrect" | undefined>();

  const machine = selected ? machines.find((m) => m.id === selected.id) : undefined;
  if (!selected || !machine || !health[selected.id]) {
    return (
      <div className="p-4">
        <Empty className="border border-dashed">
          <EmptyHeader>
            <EmptyTitle>{t("mach.empty.title")}</EmptyTitle>
            <EmptyDescription>{t("mach.empty.body")}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    );
  }

  const id = selected.id;
  const h = health[id], sch = schedules[id], log = journal[id] ?? [];
  const st = sch.inProgress ? "maintenance" : h.status;
  const overdue = sch.due !== null && sch.due < Date.now() && !sch.inProgress;

  return (
    <div className="flex flex-col gap-4 p-4">
      <Card size="sm">
        <CardHeader>
          <CardTitle>{selected.label}</CardTitle>
          <CardDescription>{t("mach.serial", { s: machine.serial })} · {h.source === "simulator" ? t("fh.simulated") : t("fh.sensors")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex items-end justify-between">
            <div>
              <div className="text-xs text-muted-foreground">{t("mach.score")}</div>
              <div className="text-4xl font-semibold leading-none tabular-nums">{scoreOf(h)}<span className="ml-1 text-base font-normal text-muted-foreground">/100</span></div>
            </div>
            <div className="flex flex-col items-end gap-1.5">
              <StatusBadge status={st}>{t(statusKey(st))}</StatusBadge>
              <span className="text-xs text-muted-foreground">
                {h.rulDays === null ? t("mach.noDecline") : h.rulDays < 1 ? t("mach.rulUnderDay") : t("mach.rul", { n: Math.round(h.rulDays) })}
              </span>
            </div>
          </div>

          <ScoreTrend data={h.hist.score} />

          <div className="divide-y">
            {h.vib !== null && <Reading label={t("mach.vibration")} unit="mm/s" value={h.vib} data={h.hist.vib} limit={LIMIT.vib} />}
            {h.temp !== null && <Reading label={t("mach.motorTemp")} unit="°C" value={h.temp} data={h.hist.temp} limit={LIMIT.temp} />}
            {h.cur !== null && <Reading label={t("mach.current")} unit="A" value={h.cur} data={h.hist.cur} limit={LIMIT.cur} />}
          </div>

          <div>
            <div className="text-xs text-muted-foreground">{t("mach.autoAnalysis")}</div>
            <p className="mt-1 text-sm leading-relaxed">{analysis(h, t)}</p>
          </div>

          <div>
            <div className="text-xs text-muted-foreground">{t("mach.evidence")}</div>
            {h.evidence.length === 0 ? (
              <p className="mt-1 text-sm">{t("mach.noDeviation")}</p>
            ) : (
              <Table className="mt-1">
                <TableBody>
                  {h.evidence.map((e) => (
                    <TableRow key={e.feature}>
                      <TableCell className="whitespace-normal pl-0">{featureLabel(e, t)}</TableCell>
                      <TableCell className="pr-0 text-right text-xs text-muted-foreground tabular-nums">{e.value.toFixed(2)} vs {e.baseline.toFixed(2)} · z {e.z_score}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
            <div className="mt-2 text-xs text-muted-foreground">{t("mach.computedBy", { v: h.modelVersion })} · {fmtDateTime(h.takenAt, lang)}</div>
          </div>
        </CardContent>
      </Card>

      <CopilotPanel key={id} machineId={id} canAct={writable} />

      <Card size="sm">
        <CardHeader>
          <CardTitle>{t("mach.maint.title")}</CardTitle>
          <CardDescription>{sch.lastDone ? t("mach.lastService", { ago: ago(sch.lastDone, t) }) : t("mach.never")}</CardDescription>
        </CardHeader>
        <CardContent>
          {!writable ? (
            <div className="flex flex-col gap-1 text-sm">
              {sch.inProgress && <p>{t("mach.inMaintenance")}</p>}
              {sch.due !== null && <p>{t("mach.scheduled", { date: fmtDateTime(sch.due, lang) })}</p>}
              <p className="text-xs text-muted-foreground">{t("mach.readOnly")}</p>
            </div>
          ) : sch.inProgress ? (
            <FieldGroup className="gap-3">
              <p className="text-sm">{t("mach.stopped")}</p>
              <Field>
                <FieldLabel htmlFor="work-done">{t("mach.workPlaceholder")}</FieldLabel>
                <Textarea id="work-done" value={work} onChange={(e) => setWork(e.target.value)} rows={3} />
              </Field>
              <Field>
                <FieldLabel>{t("mach.feedback")}</FieldLabel>
                <ToggleGroup type="single" variant="outline" size="sm" value={feedback ?? ""} onValueChange={(v) => setFeedback((v || undefined) as typeof feedback)} className="justify-start">
                  <ToggleGroupItem value="correct">{t("mach.fbCorrect")}</ToggleGroupItem>
                  <ToggleGroupItem value="incorrect">{t("mach.fbIncorrect")}</ToggleGroupItem>
                </ToggleGroup>
              </Field>
              <Button onClick={() => { void completeMaintenance(id, work, feedback); setWork(""); setFeedback(undefined); }}>{t("mach.complete")}</Button>
            </FieldGroup>
          ) : (
            <FieldGroup className="gap-3">
              {sch.due !== null && (
                <p className={cn("text-sm", overdue ? "font-medium text-destructive" : "text-muted-foreground")}>
                  {t(overdue ? "mach.overdue" : "mach.scheduled", { date: fmtDateTime(sch.due, lang) })}
                </p>
              )}
              <Field>
                <FieldLabel htmlFor="due">{t("mach.whenAria")}</FieldLabel>
                <div className="flex gap-2">
                  <Input id="due" type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} />
                  <Button variant="outline" disabled={!due} onClick={() => { void scheduleMaintenance(id, new Date(due).getTime()); setDue(""); }}>{t("mach.schedule")}</Button>
                </div>
              </Field>
              <div className="flex flex-wrap gap-2">
                <Button variant="ghost" size="sm" onClick={() => setDue(toLocalInput(Date.now() + 86_400_000))}>{t("mach.fillTomorrow")}</Button>
                <Button variant="secondary" size="sm" onClick={() => void startMaintenance(id)}>{t("mach.startNow")}</Button>
              </div>
            </FieldGroup>
          )}
        </CardContent>
      </Card>

      <Card size="sm">
        <CardHeader>
          <CardTitle>{t("mach.journal.title")}</CardTitle>
          <CardDescription>{t("mach.entries", { n: log.length })}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {writable && (
            <div className="flex gap-2">
              <Input value={note} onChange={(e) => setNote(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { void addNote(id, note); setNote(""); } }} placeholder={t("mach.addNote")} aria-label={t("mach.addNote")} />
              <Button variant="outline" disabled={!note.trim()} onClick={() => { void addNote(id, note); setNote(""); }}>{t("mach.save")}</Button>
            </div>
          )}
          <ScrollArea className="max-h-64">
            {log.length === 0 && <p className="py-2 text-sm text-muted-foreground">{t("mach.noNotes")}</p>}
            <ul className="flex flex-col">
              {log.map((e, i) => (
                <li key={e.id}>
                  {i > 0 && <Separator />}
                  <div className="py-2">
                    <div className="flex justify-between gap-2 text-xs text-muted-foreground">
                      <span>{t(`kind.${e.kind}` as Key)}{e.author ? ` · ${e.author}` : ""}</span>
                      <span className="shrink-0">{fmtDateTime(e.ts, lang)}</span>
                    </div>
                    <div className="mt-0.5 text-sm leading-snug">{e.key ? renderMsg(t, e.key, e.params) : e.text}</div>
                  </div>
                </li>
              ))}
            </ul>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}
