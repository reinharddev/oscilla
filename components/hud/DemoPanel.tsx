"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Spinner } from "@/components/ui/spinner";
import { fmtDateTime, type Key } from "@/lib/i18n";
import { useLang, useT } from "@/lib/i18n/use-t";
import { scoreOf } from "@/lib/health";
import { canWrite, useStore } from "@/lib/store";

const TOTAL = 7;
const DAMAGE = { warn: 0.5, bad: 0.88 };

/** Ask for a fresh reading and wait (bounded) until this machine's latest reading changes. */
async function settle(id: string): Promise<number> {
  const before = useStore.getState().health[id]?.takenAt;
  useStore.getState().requestPoll();
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 250));
    if (useStore.getState().health[id]?.takenAt !== before) break;
  }
  const h = useStore.getState().health[id];
  return h ? scoreOf(h) : 0;
}

/** Set a machine's damage level on the server (dummy-sensor mode) and return the resulting score. */
async function inject(id: string, severity: number): Promise<number> {
  await useStore.getState().setSimulated(id, severity);
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
    if (step === 1) {
      st.showTab(null);
      void (async () => {
        for (let i = 0; i < 40 && writer && useStore.getState().demo.restore === undefined; i++) await new Promise((r) => setTimeout(r, 150));
        const h = useStore.getState().health[id];
        if (h) setResult(t("demo.s1.result", { score: scoreOf(h) }));
      })();
    }
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
        if (!writer) { useStore.getState().setDemo({ step: 3, scores: { ...st.demo.scores, baseline: score ?? undefined, peak: score ?? undefined } }); return; }
        const sc = await inject(id, DAMAGE.warn);
        useStore.getState().setDemo({ step: 2 });
        setResult(t("demo.s2.result", { score: sc }));
        return;
      }
      if (step === 2) {
        const sc = await inject(id, DAMAGE.bad);
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
  const needsWriter = !writer && (step <= 2 || step === 4 || step === 5);
  const key = (k: string) => `demo.s${step}.${k}` as Key;
  const shown = Math.min(step, TOTAL);

  return (
    <aside aria-label={t("demo.title")} className="m-3 shrink-0">
      <Card size="sm">
        <CardHeader>
          <CardTitle>{t("demo.title")}</CardTitle>
          <CardDescription>{t("demo.step", { n: shown, total: TOTAL })} · {t("demo.machine", { name: machine.label })}{score !== null && <span className="ml-2 font-semibold text-foreground tabular-nums">{score}</span>}</CardDescription>
          <CardAction>
            <Button variant="ghost" size="icon-xs" onClick={() => void useStore.getState().demoReset()} aria-label={t("demo.exit")} title={t("demo.exit")}><X /></Button>
          </CardAction>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Progress value={(shown / TOTAL) * 100} className="h-1" />
          <h2 className="text-base font-semibold tracking-tight">{t(key("title"))}</h2>
          {step < 7 && <p className="text-sm leading-relaxed text-muted-foreground">{t(key("body"), { name: machine.label })}</p>}
          {result && step < 7 && <p className="text-sm font-medium" aria-live="polite">{result}</p>}
          {needsWriter && <Alert><AlertDescription>{t("demo.needsWriter")}</AlertDescription></Alert>}
          {step === 7 && (
            <ul className="list-disc pl-4 text-sm leading-relaxed">
              <li>{t("demo.s7.found", { before: sc.baseline ?? "–", peak: sc.peak ?? "–" })}</li>
              <li>{t("demo.s7.copilot")}</li>
              {demo.skipped ? <li>{t("demo.s7.skipped")}</li> : <><li>{t("demo.s7.wo")}</li><li>{t("demo.s7.after", { after: sc.after ?? "–" })}</li></>}
            </ul>
          )}
          {step === 7 && <p className="text-xs text-muted-foreground">{t("demo.s7.note")}</p>}
        </CardContent>
        <CardFooter className="gap-2">
          {step < 7 ? (
            <>
              <Button onClick={() => void advance()} disabled={busy}>
                {busy && <Spinner data-icon="inline-start" />}
                {busy ? t("demo.working") : needsWriter ? t("demo.skip") : t("demo.next")}
              </Button>
              <Button variant={auto ? "secondary" : "outline"} aria-pressed={auto} onClick={() => setAuto((a) => !a)}>{t("demo.auto")}</Button>
            </>
          ) : (
            <>
              <Button onClick={() => { setAuto(false); void useStore.getState().demoPrepare(); }}>{t("demo.replay")}</Button>
              <Button variant="outline" onClick={() => void useStore.getState().demoReset()}>{t("demo.exit")}</Button>
            </>
          )}
        </CardFooter>
      </Card>
    </aside>
  );
}
