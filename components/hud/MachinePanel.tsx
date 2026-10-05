"use client";

import { useState } from "react";
import { analysis, FAULT_LABEL, featureLabel, LIMIT, rulDays, scoreOf, STATUS_LABEL, statusOf } from "@/lib/health";
import { canWrite, useStore } from "@/lib/store";
import { Section } from "./ui";

const fmt = (ts: number) => new Date(ts).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" });
const ago = (ts: number) => { const d = Math.floor((Date.now() - ts) / 86_400_000); return d <= 0 ? "hari ini" : `${d} hari lalu`; };
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

const KIND_LABEL = { note: "Catatan", alert: "Peringatan", schedule: "Jadwal", start: "Mulai", done: "Selesai" } as const;

export function MachinePanel() {
  const { selected, health, schedules, journal, scheduleMaintenance, startMaintenance, completeMaintenance, addNote, auth, machines, analysisStatus } = useStore();
  const writable = canWrite(auth);
  const [due, setDue] = useState("");
  const [note, setNote] = useState("");
  const [work, setWork] = useState("");

  const machine = selected ? machines.find((m) => m.id === selected.id) : undefined;
  if (!selected || !machine || !health[selected.id]) {
    return (
      <Section title="Detail mesin">
        <p className="text-xs text-ink/55">Pilih mesin di scene atau di tabel pemeliharaan untuk melihat kesehatan, jadwal, dan jurnalnya.</p>
      </Section>
    );
  }

  const id = selected.id;
  const h = health[id], sch = schedules[id], log = journal[id] ?? [];
  const st = sch.inProgress ? "maintenance" : statusOf(h);
  const overdue = sch.due !== null && sch.due < Date.now() && !sch.inProgress;

  return (
    <>
      <Section title={selected.label} aside={FAULT_LABEL[h.fault]}>
        <div className="mb-3 text-xs text-ink/55">No. seri {machine.serial}</div>
        <div className="flex items-end justify-between">
          <div>
            <div className="text-xs text-ink/55">Skor kesehatan</div>
            <div className="text-3xl font-semibold leading-9">{scoreOf(h)}<span className="text-base font-normal text-ink/45">/100</span></div>
          </div>
          <div className="text-right">
            <div className={`text-sm font-semibold ${STATUS_CLASS[st]}`}>{STATUS_LABEL[st]}</div>
            <div className="text-xs text-ink/55">Sisa umur ≈ {rulDays(h)} hari</div>
          </div>
        </div>
        <div className="mt-3 divide-y divide-rule border-y border-rule">
          <Reading label="Getaran" unit="mm/s" value={h.vib} data={h.hist.vib} limit={LIMIT.vib} />
          <Reading label="Suhu motor" unit="°C" value={h.temp} data={h.hist.temp} limit={LIMIT.temp} />
          <Reading label="Arus" unit="A" value={h.cur} data={h.hist.cur} limit={LIMIT.cur} />
        </div>
        <div className="mt-3 text-xs text-ink/55">Analisis otomatis</div>
        <p className="mt-1 text-[13px] leading-relaxed">{analysis(h)}</p>
        {h.analysis ? (
          <div className="mt-3">
            <div className="text-xs text-ink/55">Bukti dari sinyal getaran</div>
            {h.analysis.evidence.length === 0 ? (
              <p className="mt-1 text-xs text-ink/70">Tidak ada fitur yang menyimpang dari baseline.</p>
            ) : (
              <ul className="mt-1 divide-y divide-rule border-y border-rule text-xs">
                {h.analysis.evidence.map((e) => (
                  <li key={e.feature} className="flex justify-between gap-3 py-1.5">
                    <span>{featureLabel(e)}</span>
                    <span className="shrink-0 text-ink/60">{e.value.toFixed(2)} vs {e.baseline.toFixed(2)} · z {e.z_score}</span>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-1.5 text-xs text-ink/45">Dihitung Health Service ({h.analysis.modelVersion}) dari sensor simulasi.</div>
          </div>
        ) : analysisStatus === "offline" ? (
          <p className="mt-2 text-xs text-ink/45">Health Service tidak terjangkau; memakai estimasi lokal.</p>
        ) : null}
      </Section>

      <Section title="Maintenance" aside={sch.lastDone ? `Terakhir ${ago(sch.lastDone)}` : "Belum pernah"}>
        {!writable ? (
          <div className="space-y-1 text-xs">
            {sch.inProgress && <p className="text-ink/70">Unit sedang dalam maintenance.</p>}
            {sch.due !== null && <p className="text-ink/70">Terjadwal · {fmt(sch.due)}</p>}
            <p className="text-ink/50">Peran Pemantau hanya dapat melihat. Mengubah jadwal atau jurnal memerlukan peran Teknisi atau lebih tinggi.</p>
          </div>
        ) : sch.inProgress ? (
          <div className="space-y-2">
            <p className="text-xs text-ink/70">Unit sedang dihentikan untuk maintenance. Tulis pekerjaan yang dilakukan lalu tandai selesai.</p>
            <textarea value={work} onChange={(e) => setWork(e.target.value)} rows={3} placeholder="Pekerjaan yang dilakukan, suku cadang, temuan…" className="w-full rounded-ui border border-rule bg-surface p-2 text-xs outline-none focus:border-accent" />
            <button onClick={() => { completeMaintenance(id, work); setWork(""); }} className="h-8 w-full rounded-ui bg-accent text-xs font-semibold text-canvas transition-opacity duration-150 hover:opacity-90">Tandai selesai</button>
          </div>
        ) : (
          <div className="space-y-2">
            {sch.due !== null && (
              <div className={`text-xs ${overdue ? "font-semibold text-bad" : "text-ink/70"}`}>
                {overdue ? "Terlambat · " : "Terjadwal · "}{fmt(sch.due)}
              </div>
            )}
            <div className="flex gap-2">
              <input type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} aria-label="Waktu maintenance" className="h-8 min-w-0 flex-1 rounded-ui border border-rule bg-surface px-2 text-xs outline-none focus:border-accent" />
              <button
                disabled={!due}
                onClick={() => { scheduleMaintenance(id, new Date(due).getTime()); setDue(""); }}
                className="h-8 rounded-ui border border-rule px-3 text-xs transition-colors duration-150 hover:bg-ink/5 disabled:opacity-40"
              >Jadwalkan</button>
            </div>
            <button onClick={() => setDue(toLocalInput(Date.now() + 86_400_000))} className="text-xs text-accent hover:underline">Isi besok jam ini</button>
            <button onClick={() => startMaintenance(id)} className="block h-8 w-full rounded-ui border border-rule text-xs transition-colors duration-150 hover:bg-ink/5">Mulai maintenance sekarang</button>
          </div>
        )}
      </Section>

      <Section title="Jurnal mesin" aside={`${log.length} entri`}>
        {writable && <div className="flex gap-2">
          <input value={note} onChange={(e) => setNote(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { addNote(id, note); setNote(""); } }} placeholder="Tambah catatan…" className="h-8 min-w-0 flex-1 rounded-ui border border-rule bg-surface px-2 text-xs outline-none focus:border-accent" />
          <button disabled={!note.trim()} onClick={() => { addNote(id, note); setNote(""); }} className="h-8 rounded-ui border border-rule px-3 text-xs transition-colors duration-150 hover:bg-ink/5 disabled:opacity-40">Simpan</button>
        </div>}
        <ul className="scroll-thin mt-3 max-h-64 divide-y divide-rule overflow-y-auto border-y border-rule">
          {log.length === 0 && <li className="py-2 text-xs text-ink/45">Belum ada catatan.</li>}
          {log.map((e) => (
            <li key={e.id} className="py-2">
              <div className="flex justify-between text-xs text-ink/55"><span className={e.kind === "alert" ? "text-warn" : ""}>{KIND_LABEL[e.kind]}{e.author ? ` · ${e.author}` : ""}</span><span>{fmt(e.ts)}</span></div>
              <div className="mt-0.5 text-[13px] leading-snug">{e.text}</div>
            </li>
          ))}
        </ul>
      </Section>
    </>
  );
}

export function MaintenanceTable() {
  const { health, schedules, select, selected, machines } = useStore();
  return (
    <Section title="Pemeliharaan" aside="Klik baris untuk detail">
      <div className="grid grid-cols-[1fr_44px_84px] px-2 pb-1 text-xs text-ink/45"><span>Mesin</span><span className="text-right">Skor</span><span className="text-right">Servis</span></div>
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
                  {sch.inProgress ? "Berjalan" : sch.due !== null ? (overdue ? "Terlambat" : new Date(sch.due).toLocaleDateString("id-ID", { day: "numeric", month: "short" })) : sch.lastDone ? ago(sch.lastDone) : "-"}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <p className="mt-2 text-xs text-ink/45">Skor: 75+ sehat, 50–74 perlu perhatian, di bawah 50 kritis. MT = sedang maintenance.</p>
    </Section>
  );
}
