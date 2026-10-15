"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { fmtDateTime, type Key } from "@/lib/i18n";
import { useLang, useT } from "@/lib/i18n/use-t";
import { scoreOf } from "@/lib/health";
import { canWrite, useStore } from "@/lib/store";

const TOTAL = 7;
const WEAR = { warn: 0.5, bad: 0.88 };

/** Ask the analysis poll to run now and wait (bounded) until this machine has a fresh analysis. */
async function settle(id: string): Promise<number> {
  const before = useStore.getState().health[id]?.analysis?.at;
  useStore.getState().requestPoll();
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 200));
    const a = useStore.getState().health[id]?.analysis?.at;
    if (a && a !== before) break;
  }
  const h = useStore.getState().health[id];
  return h ? scoreOf(h) : 0;
}

export function DemoPanel() {
  const t = useT();
  const lang = useLang();
  const demo = useStore((s) => s.demo);
  const auth = useStore((s) => s.auth);
  const machine = useStore((s) => s.machines.find((m) => m.id === s.demo.targetId));
  const score = useStore((s) => (s.demo.targetId && s.health[s.demo.targetId] ? scoreOf(s.health[s.demo.targetId]) : null));
  const [busy, setBusy] = useState(false);
  const [auto, setAuto] = useState(false);
  const [result, setResult] = useState<string>();
  const run = useRef(0);
  const writer = canWrite(auth);

  const id = demo.targetId;
  const step = demo.step;

  // Reset the per-step result line whenever the step changes.
  useEffect(() => { setResult(undefined); }, [step]);

  // Entering a step brings the machine into view and does that step's setup.
  useEffect(() => {
    if (!demo.active || !id) return;
    const st = useStore.getState();
    if (step >= 4 && step <= 6) st.showTab("machine");
    if (step === 1) { st.showTab(null); void settle(id).then((sc) => setResult(t("demo.s1.result", { score: sc }))); }
  }, [demo.active, id, step]); // eslint-disable-line react-hooks/exhaustive-deps

  async function advance() {
    if (!id || busy) return;
    const my = ++run.current;
    setBusy(true);
    const st = useStore.getState();
    try {
      let next = step + 1;
      if (step === 1) {
        st.setDemo({ scores: { ...st.demo.scores, baseline: score ?? undefined } });
        st.setWear(id, WEAR.warn);
        const sc = await settle(id);
        useStore.getState().setDemo({ step: 2 });
        setResult(t("demo.s2.result", { score: sc }));
        return;
      }
      if (step === 2) {
        st.setWear(id, WEAR.bad);
        const sc = await settle(id);
        useStore.getState().setDemo({ step: 3, scores: { ...useStore.getState().demo.scores, peak: sc } });
        setResult(t("demo.s3.result", { score: sc }));
        return;
      }
      if (step === 3) {
        st.requestCopilot(id);
        // CopilotPanel stores its reply; wait for it (bounded).
        for (let i = 0; i < 100 && !useStore.getState().copilotReplies[id]; i++) await new Promise((r) => setTimeout(r, 200));
        useStore.getState().setDemo({ step: 4 });
        setResult(t("demo.s4.result"));
        return;
      }
      if (step === 4) {
        if (!writer) { st.setDemo({ step: 7, skipped: true }); return; }
        const reply = st.copilotReplies[id] as { summary?: string; recommendations?: { action?: string }[] } | undefined;
        const due = Date.now() + 86_400_000;
        await st.scheduleMaintenance(id, due, {
          summary: `${reply?.summary ?? ""} ${reply?.recommendations?.[0]?.action ?? ""}`.replace(/\s*\[(?:M|J)\d+\]/g, "").trim() || undefined,
          aiDiagnosis: reply ? { ...reply, at: new Date().toISOString(), scenario: "demo" } : undefined,
        });
        useStore.getState().setDemo({ step: 5, dueAt: due });
        setResult(t("demo.s5.result", { date: fmtDateTime(due, lang) }));
        return;
      }
      if (step === 5) {
        await st.startMaintenance(id);
        await useStore.getState().completeMaintenance(id, t("demo.s6.note"), "correct");
        const sc = await settle(id);
        useStore.getState().setDemo({ step: 6, scores: { ...useStore.getState().demo.scores, after: sc } });
        setResult(t("demo.s6.result", { score: sc }));
        return;
      }
      if (step === 6) next = 7;
      useStore.getState().setDemo({ step: next });
    } finally {
      if (run.current === my) setBusy(false);
    }
  }

  // Auto-play: advance every few seconds once the current step has settled.
  useEffect(() => {
    if (!auto || !demo.active || busy || step >= 7) return;
    const timer = setTimeout(() => void advance(), 3500);
    return () => clearTimeout(timer);
  }); // eslint-disable-line react-hooks/exhaustive-deps

  if (!demo.open || !machine) return null;

  const sc = demo.scores;
  const needsWriter = !writer && step >= 4 && step <= 5;
  const key = (k: string) => `demo.s${step}.${k}` as Key;

  return (
    <aside aria-label={t("demo.title")} className="m-3 shrink-0 border border-rule bg-surface">
      <div className="flex items-center justify-between border-b border-rule px-3 py-2">
        <div className="text-xs font-semibold">{t("demo.title")} <span className="font-normal text-ink/55">· {t("demo.step", { n: Math.min(step, TOTAL), total: TOTAL })}</span></div>
        <button onClick={() => useStore.getState().demoReset()} aria-label={t("demo.exit")} title={t("demo.exit")} className="grid h-6 w-6 place-items-center rounded-ui text-ink/60 hover:bg-ink/5"><X size={14} /></button>
      </div>
      <div className="h-0.5 bg-ink/10"><div className="h-full bg-accent transition-[width] duration-300" style={{ width: `${(Math.min(step, TOTAL) / TOTAL) * 100}%` }} /></div>

      <div className="space-y-2 px-3 py-3 text-[13px] leading-relaxed">
        <div className="text-xs text-ink/55">{t("demo.machine", { name: machine.label })}{score !== null && <span className="ml-2 font-semibold text-ink">{score}</span>}</div>
        <h2 className="text-sm font-semibold">{t(key("title"))}</h2>
        {step < 7 && <p className="text-ink/75">{t(key("body"), { name: machine.label })}</p>}
        {result && step < 7 && <p className="text-xs font-medium text-accent" aria-live="polite">{result}</p>}
        {needsWriter && <p className="border-l-2 border-warn pl-3 text-xs text-ink/75">{t("demo.needsWriter")}</p>}
        {step === 7 && (
          <ul className="list-disc space-y-1 pl-4 text-ink/75">
            <li>{t("demo.s7.found", { before: sc.baseline ?? "–", peak: sc.peak ?? "–" })}</li>
            <li>{t("demo.s7.copilot")}</li>
            {demo.skipped ? <li>{t("demo.s7.skipped")}</li> : <><li>{t("demo.s7.wo")}</li><li>{t("demo.s7.after", { after: sc.after ?? "–" })}</li></>}
          </ul>
        )}
        {step === 7 && <p className="text-xs text-ink/55">{t("demo.s7.note")}</p>}
      </div>

      <div className="flex items-center gap-2 border-t border-rule px-3 py-2">
        {step < 7 ? (
          <>
            <button onClick={() => void advance()} disabled={busy} className="h-8 rounded-ui bg-accent px-3 text-xs font-semibold text-canvas transition-opacity duration-150 hover:opacity-90 disabled:opacity-50">
              {busy ? t("demo.working") : needsWriter ? t("demo.skip") : t("demo.next")}
            </button>
            <button onClick={() => setAuto((a) => !a)} aria-pressed={auto} className={`h-8 rounded-ui border px-3 text-xs transition-colors duration-150 ${auto ? "border-ink/40 bg-ink/10" : "border-rule text-ink/60 hover:bg-ink/5"}`}>{t("demo.auto")}</button>
          </>
        ) : (
          <>
            <button onClick={() => { setAuto(false); useStore.getState().demoPrepare(); }} className="h-8 rounded-ui bg-accent px-3 text-xs font-semibold text-canvas hover:opacity-90">{t("demo.replay")}</button>
            <button onClick={() => useStore.getState().demoReset()} className="h-8 rounded-ui border border-rule px-3 text-xs text-ink/70 hover:bg-ink/5">{t("demo.exit")}</button>
          </>
        )}
      </div>
    </aside>
  );
}
