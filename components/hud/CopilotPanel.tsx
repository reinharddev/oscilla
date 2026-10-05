"use client";

import { useState } from "react";
import { Sparkles } from "lucide-react";
import type { CopilotResult } from "@/lib/copilot/types";
import { useStore } from "@/lib/store";
import { Section } from "./ui";

type Reply = CopilotResult & { machine: string; llmConfigured: boolean };

const URGENCY = { immediate: "Segera", within_days: "Dalam beberapa hari", monitor: "Pantau" } as const;
const LEVEL = { high: "Tinggi", medium: "Sedang", low: "Rendah" } as const;
const toLocalInput = (ts: number) => new Date(ts - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 16);

export function CopilotPanel({ machineId, canAct }: { machineId: string; canAct: boolean }) {
  const scheduleMaintenance = useStore((s) => s.scheduleMaintenance);
  const [reply, setReply] = useState<Reply | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [open, setOpen] = useState<string | null>(null);
  const [due, setDue] = useState(() => toLocalInput(Date.now() + 86_400_000));
  const [scheduled, setScheduled] = useState(false);

  async function ask() {
    setBusy(true); setError(undefined); setOpen(null); setScheduled(false);
    try {
      const res = await fetch("/api/copilot", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ assetId: machineId }) });
      if (res.status === 429) throw new Error("Terlalu banyak permintaan. Coba lagi sebentar.");
      if (!res.ok) throw new Error("Copilot tidak dapat dijalankan.");
      setReply(await res.json());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const source = reply?.sources.find((s) => s.id === open);
  const chips = (ids: string[]) =>
    ids.map((id) => (
      <button key={id} onClick={() => setOpen(open === id ? null : id)} className={`ml-1.5 rounded-ui border px-1 text-[11px] transition-colors duration-150 ${open === id ? "border-accent text-accent" : "border-rule text-ink/60 hover:bg-ink/5"}`}>
        {id}
      </button>
    ));

  return (
    <Section title="Copilot perawatan" aside={reply ? (reply.mode === "llm" ? "LLM" : reply.llmRejected ? "LLM ditolak" : "Templat") : undefined}>
      {!reply && (
        <p className="mb-3 text-xs text-ink/60">Jelaskan kondisi mesin ini dan sarankan tindakan, berdasarkan hasil analisis sinyal, manual, dan jurnal servis.</p>
      )}
      <button
        onClick={ask}
        disabled={busy}
        className="inline-flex h-8 items-center gap-1.5 rounded-ui border border-rule px-3 text-xs transition-colors duration-150 hover:bg-ink/5 disabled:opacity-50"
      >
        <Sparkles size={13} /> {busy ? "Menganalisis…" : reply ? "Analisis ulang" : "Tanya Copilot"}
      </button>
      {error && <p role="alert" className="mt-2 text-xs text-bad">{error}</p>}

      {reply && (
        <div className="mt-4 space-y-4 text-[13px] leading-relaxed">
          {reply.review.required && (
            <div className="border-l-2 border-warn pl-3">
              <div className="text-xs font-semibold text-warn">Perlu ditinjau teknisi</div>
              <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs text-ink/75">
                {reply.review.reasons.map((r) => <li key={r}>{r}</li>)}
              </ul>
            </div>
          )}

          <p>{reply.summary}</p>
          {reply.likelyCause && (
            <div>
              <div className="text-xs text-ink/55">Dugaan penyebab</div>
              <p>{reply.likelyCause}</p>
            </div>
          )}

          <div>
            <div className="text-xs text-ink/55">Rekomendasi</div>
            <ol className="mt-1 divide-y divide-rule border-y border-rule">
              {reply.recommendations.map((r, i) => (
                <li key={i} className="py-2">
                  <span className="mr-2 text-xs font-semibold text-ink/70">{URGENCY[r.urgency]}</span>
                  {r.action.replace(/\s*\[(?:M|J)\d+\]/g, "")}
                  {chips(r.citations)}
                </li>
              ))}
            </ol>
          </div>

          {source && (
            <div className="rounded-ui border border-rule p-3 text-xs">
              <div className="font-semibold">{source.title}</div>
              <div className="text-ink/55">{source.detail}</div>
              <p className="mt-2 text-ink/80">{source.text}</p>
              {source.sample && <p className="mt-2 text-ink/45">Contoh manual sintetis untuk demo, bukan dokumen pabrikan.</p>}
            </div>
          )}

          <div className="text-xs text-ink/60">
            Keyakinan: <span className="font-semibold text-ink">{LEVEL[reply.confidence.level]}</span> (belum dikalibrasi)
            <details className="mt-1">
              <summary className="cursor-pointer text-ink/50">Dasar penilaian</summary>
              <ul className="mt-1 list-disc space-y-0.5 pl-4">{reply.confidence.basis.map((b) => <li key={b}>{b}</li>)}</ul>
            </details>
          </div>

          {reply.rejected && (
            <details className="text-xs text-ink/60">
              <summary className="cursor-pointer text-ink/50">Lihat jawaban AI yang ditolak</summary>
              <div className="mt-2 border-l-2 border-rule pl-3">
                <p>{reply.rejected.summary}</p>
                {reply.rejected.likelyCause && <p className="mt-1">{reply.rejected.likelyCause}</p>}
                <ul className="mt-1 list-disc space-y-0.5 pl-4">{reply.rejected.recommendations.map((r, i) => <li key={i}>{r.action}</li>)}</ul>
              </div>
            </details>
          )}

          <div className="text-xs text-ink/45">
            {reply.mode === "llm" || reply.llmRejected
              ? `${reply.llmRejected ? "Jawaban ditolak · " : ""}${reply.model} · ${(reply.latencyMs / 1000).toFixed(1)} dtk${reply.usage?.completionTokens ? ` · ${(reply.usage.promptTokens ?? 0) + reply.usage.completionTokens} token` : ""}`
              : "Jawaban templat tanpa LLM. Hubungkan model di server AMD untuk penjelasan yang lebih kaya."}
          </div>

          {canAct && (
            <div className="space-y-2 border-t border-rule pt-3">
              {scheduled ? (
                <p className="text-xs text-ok">Work order dibuat dari rekomendasi ini.</p>
              ) : (
                <div className="flex gap-2">
                  <input type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} aria-label="Waktu maintenance" className="h-8 min-w-0 flex-1 rounded-ui border border-rule bg-surface px-2 text-xs outline-none focus:border-accent" />
                  <button
                    onClick={async () => {
                      await scheduleMaintenance(machineId, new Date(due).getTime(), {
                        summary: `${reply.summary} ${reply.recommendations[0]?.action ?? ""}`.replace(/\s*\[(?:M|J)\d+\]/g, ""),
                        aiDiagnosis: { mode: reply.mode, model: reply.model, summary: reply.summary, likelyCause: reply.likelyCause, recommendations: reply.recommendations, confidence: reply.confidence, review: reply.review, at: new Date().toISOString() },
                      });
                      setScheduled(true);
                    }}
                    className="h-8 rounded-ui bg-accent px-3 text-xs font-semibold text-canvas transition-opacity duration-150 hover:opacity-90"
                  >
                    Jadwalkan dari rekomendasi
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </Section>
  );
}
