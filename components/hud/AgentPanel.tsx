"use client";

import { useEffect, useRef, useState } from "react";
import { Send } from "lucide-react";
import type { AgentResult, Proposal } from "@/lib/agent/types";
import { canWrite, useStore } from "@/lib/store";
import { Section } from "./ui";

type Reply = AgentResult & { llmConfigured: boolean };
type Msg = { role: "user"; content: string } | { role: "assistant"; content: string; reply?: Reply };

const SUGGESTIONS = [
  "Mesin mana yang kritis?",
  "Kenapa FK-02 skornya turun?",
  "Kapan AGV Robot R2 terakhir diservis?",
  "Jadwalkan servis FK-02 besok",
];
const URGENCY = { immediate: "Segera", within_days: "Dalam beberapa hari", monitor: "Pantau" } as const;
const day = (iso: string) => new Date(iso).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });

function ProposalCard({ p, question }: { p: Proposal; question: string }) {
  const auth = useStore((s) => s.auth);
  const scheduleMaintenance = useStore((s) => s.scheduleMaintenance);
  const [state, setState] = useState<"open" | "busy" | "done" | "failed" | "dismissed">("open");
  if (state === "dismissed") return <p className="text-xs text-ink/45">Usulan diabaikan.</p>;
  return (
    <div className="rounded-ui border border-rule p-3 text-xs">
      <div className="font-semibold">Usulan work order · {p.assetName}</div>
      <p className="mt-1 text-ink/75">{p.summary}</p>
      <p className="mt-1 text-ink/55">{URGENCY[p.urgency]} · jatuh tempo {day(p.dueAt)}</p>
      {state === "done" ? (
        <p className="mt-2 text-ok">Work order dibuat.</p>
      ) : (
        <div className="mt-2 flex gap-2">
          {canWrite(auth) && (
            <button
              disabled={state === "busy"}
              onClick={async () => {
                setState("busy");
                const due = Date.parse(p.dueAt);
                await scheduleMaintenance(p.assetId, due, { summary: p.summary, aiDiagnosis: { source: "agent", proposalId: p.id, urgency: p.urgency, question, at: new Date().toISOString() } });
                setState(useStore.getState().schedules[p.assetId]?.due === due ? "done" : "failed");
              }}
              className="h-7 rounded-ui bg-accent px-3 text-xs font-semibold text-canvas transition-opacity duration-150 hover:opacity-90 disabled:opacity-50"
            >
              {state === "busy" ? "Membuat…" : "Konfirmasi dan buat"}
            </button>
          )}
          <button onClick={() => setState("dismissed")} className="h-7 rounded-ui border border-rule px-3 text-xs transition-colors duration-150 hover:bg-ink/5">Abaikan</button>
        </div>
      )}
      {state === "failed" && <p role="alert" className="mt-2 text-bad">Gagal membuat work order. Periksa hak aksesmu.</p>}
    </div>
  );
}

function Assistant({ msg, question }: { msg: Extract<Msg, { role: "assistant" }>; question: string }) {
  const r = msg.reply;
  return (
    <div className="space-y-2">
      <p className="whitespace-pre-line text-[13px] leading-relaxed">{msg.content}</p>
      {r?.proposals.map((p) => <ProposalCard key={p.id} p={p} question={question} />)}
      {r && r.warnings.length > 0 && (
        <ul className="list-disc space-y-0.5 pl-4 text-xs text-warn">{r.warnings.map((w) => <li key={w}>{w}</li>)}</ul>
      )}
      {r?.rejectedAnswer && (
        <details className="text-xs text-ink/60">
          <summary className="cursor-pointer text-ink/50">Lihat jawaban AI yang ditolak</summary>
          <p className="mt-1 border-l-2 border-rule pl-3">{r.rejectedAnswer}</p>
        </details>
      )}
      {r && r.steps.length > 0 && (
        <details className="text-xs text-ink/60">
          <summary className="cursor-pointer text-ink/50">{r.steps.length} alat dipakai</summary>
          <ul className="mt-1 divide-y divide-rule border-y border-rule">
            {r.steps.map((s, i) => (
              <li key={i} className="py-1.5">
                <span className="font-medium text-ink/80">{s.tool}</span>
                <span className="text-ink/45"> {JSON.stringify(s.args)}</span>
                <div className={s.ok ? "" : "text-warn"}>{s.summary}</div>
              </li>
            ))}
          </ul>
        </details>
      )}
      {r && (
        <div className="text-xs text-ink/45">
          {r.mode === "llm"
            ? `${r.model} · ${(r.latencyMs / 1000).toFixed(1)} dtk${r.usage ? ` · ${r.usage.promptTokens + r.usage.completionTokens} token` : ""}`
            : "Mode sederhana tanpa LLM. Hubungkan model di server AMD untuk memahami pertanyaan bebas."}
        </div>
      )}
    </div>
  );
}

export function AgentPanel() {
  const selectedId = useStore((s) => (s.machines.some((m) => m.id === s.selected?.id) ? s.selected?.id : null));
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ block: "nearest" }); }, [msgs, busy]);

  async function ask(text: string) {
    const q = text.trim();
    if (q.length < 2 || busy) return;
    setInput(""); setError(undefined); setBusy(true);
    const history = msgs.slice(-6).map((m) => ({ role: m.role, content: m.content }));
    setMsgs((m) => [...m, { role: "user", content: q }]);
    try {
      const res = await fetch("/api/agent", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ question: q, history, selectedAssetId: selectedId }) });
      if (res.status === 429) throw new Error("Terlalu banyak pertanyaan. Coba lagi sebentar.");
      if (!res.ok) throw new Error("Asisten tidak dapat dijalankan.");
      const reply: Reply = await res.json();
      setMsgs((m) => [...m, { role: "assistant", content: reply.answer, reply }]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const lastQuestion = (i: number) => [...msgs.slice(0, i)].reverse().find((m) => m.role === "user")?.content ?? "";

  return (
    <Section title="Asisten" aside={selectedId ? "Mesin terpilih dipakai sebagai konteks" : undefined}>
      {msgs.length === 0 && (
        <div className="mb-3">
          <p className="text-xs text-ink/60">Tanyakan kondisi mesin, jadwal, jurnal, atau prosedur. Asisten hanya melihat apa yang boleh kamu lihat dan hanya mengusulkan; kamu yang mengonfirmasi.</p>
          <ul className="mt-2 divide-y divide-rule border-y border-rule">
            {SUGGESTIONS.map((s) => (
              <li key={s}>
                <button onClick={() => ask(s)} className="w-full px-1 py-1.5 text-left text-xs text-ink/80 transition-colors duration-150 hover:bg-ink/5">{s}</button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {msgs.length > 0 && (
        <div className="scroll-thin mb-3 max-h-[380px] space-y-4 overflow-y-auto pr-1">
          {msgs.map((m, i) => (
            <div key={i}>
              <div className="mb-0.5 text-xs text-ink/50">{m.role === "user" ? "Kamu" : "Asisten"}</div>
              {m.role === "user" ? <p className="text-[13px]">{m.content}</p> : <Assistant msg={m} question={lastQuestion(i)} />}
            </div>
          ))}
          {busy && <p className="text-xs text-ink/50">Asisten bekerja…</p>}
          <div ref={end} />
        </div>
      )}
      {error && <p role="alert" className="mb-2 text-xs text-bad">{error}</p>}

      <form onSubmit={(e) => { e.preventDefault(); ask(input); }} className="flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          maxLength={500}
          placeholder="Tanya sesuatu…"
          aria-label="Pertanyaan untuk asisten"
          className="h-8 min-w-0 flex-1 rounded-ui border border-rule bg-surface px-2.5 text-xs outline-none focus:border-accent"
        />
        <button disabled={busy || input.trim().length < 2} aria-label="Kirim" className="grid h-8 w-8 place-items-center rounded-ui bg-accent text-canvas transition-opacity duration-150 hover:opacity-90 disabled:opacity-40">
          <Send size={14} />
        </button>
      </form>
    </Section>
  );
}
