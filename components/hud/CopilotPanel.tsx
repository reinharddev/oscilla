"use client";

import { useEffect, useRef, useState } from "react";
import { Sparkles } from "lucide-react";
import type { CopilotResult } from "@/lib/copilot/types";
import type { Key } from "@/lib/i18n";
import { useT } from "@/lib/i18n/use-t";
import { useStore } from "@/lib/store";
import { Section } from "./ui";

type Reply = CopilotResult & { machine: string; llmConfigured: boolean; endpoint?: string; cached?: boolean };

const toLocalInput = (ts: number) => new Date(ts - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 16);

export function CopilotPanel({ machineId, canAct }: { machineId: string; canAct: boolean }) {
  const t = useT();
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
      if (res.status === 429) throw new Error(t("copilot.errBusy"));
      if (!res.ok) throw new Error(t("copilot.errFail"));
      const data: Reply = await res.json();
      setReply(data);
      useStore.getState().recordLlm({
        at: Date.now(), source: "copilot", mode: data.mode === "llm" ? "llm" : "fallback", model: data.model, endpoint: data.endpoint,
        latencyMs: data.cached ? 0 : data.latencyMs, promptTokens: data.usage?.promptTokens, completionTokens: data.usage?.completionTokens, cached: data.cached,
      });
      useStore.setState((s) => ({ copilotReplies: { ...s.copilotReplies, [machineId]: data } }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  // The guided demo can ask on the user's behalf.
  const request = useStore((s) => s.copilotRequest);
  const handled = useRef(request?.n ?? 0);
  const askRef = useRef(ask);
  askRef.current = ask;
  useEffect(() => {
    if (request && request.n !== handled.current && request.id === machineId) { handled.current = request.n; void askRef.current(); }
  }, [request, machineId]);

  const source = reply?.sources.find((s) => s.id === open);
  const chips = (ids: string[]) =>
    ids.map((id) => (
      <button key={id} onClick={() => setOpen(open === id ? null : id)} className={`ml-1.5 rounded-ui border px-1 text-[11px] transition-colors duration-150 ${open === id ? "border-accent text-accent" : "border-rule text-ink/60 hover:bg-ink/5"}`}>
        {id}
      </button>
    ));
  const badge = reply ? (reply.mode === "llm" ? t("copilot.badge.llm") : reply.llmRejected ? t("copilot.badge.rejected") : t("copilot.badge.template")) : undefined;

  return (
    <Section title={t("copilot.title")} aside={badge}>
      {!reply && <p className="mb-3 text-xs text-ink/60">{t("copilot.intro")}</p>}
      <button
        onClick={ask}
        disabled={busy}
        className="inline-flex h-8 items-center gap-1.5 rounded-ui border border-rule px-3 text-xs transition-colors duration-150 hover:bg-ink/5 disabled:opacity-50"
      >
        <Sparkles size={13} /> {busy ? t("copilot.running") : reply ? t("copilot.again") : t("copilot.ask")}
      </button>
      {error && <p role="alert" className="mt-2 text-xs text-bad">{error}</p>}

      {reply && (
        <div className="mt-4 space-y-4 text-[13px] leading-relaxed">
          {reply.review.required && (
            <div className="border-l-2 border-warn pl-3">
              <div className="text-xs font-semibold text-warn">{t("copilot.review")}</div>
              <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs text-ink/75">
                {reply.review.reasons.map((r) => <li key={r}>{r}</li>)}
              </ul>
            </div>
          )}

          <p>{reply.summary}</p>
          {reply.likelyCause && (
            <div>
              <div className="text-xs text-ink/55">{t("copilot.cause")}</div>
              <p>{reply.likelyCause}</p>
            </div>
          )}

          <div>
            <div className="text-xs text-ink/55">{t("copilot.recs")}</div>
            <ol className="mt-1 divide-y divide-rule border-y border-rule">
              {reply.recommendations.map((r, i) => (
                <li key={i} className="py-2">
                  <span className="mr-2 text-xs font-semibold text-ink/70">{t(`urgency.${r.urgency}` as Key)}</span>
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
              {source.sample && <p className="mt-2 text-ink/45">{t("copilot.sampleNote")}</p>}
            </div>
          )}

          <div className="text-xs text-ink/60">
            {t("copilot.confidence")} <span className="font-semibold text-ink">{t(`level.${reply.confidence.level}` as Key)}</span> {t("copilot.notCalibrated")}
            <details className="mt-1">
              <summary className="cursor-pointer text-ink/50">{t("copilot.basis")}</summary>
              <ul className="mt-1 list-disc space-y-0.5 pl-4">{reply.confidence.basis.map((b) => <li key={b}>{b}</li>)}</ul>
            </details>
          </div>

          {reply.rejected && (
            <details className="text-xs text-ink/60">
              <summary className="cursor-pointer text-ink/50">{t("copilot.showRejected")}</summary>
              <div className="mt-2 border-l-2 border-rule pl-3">
                <p>{reply.rejected.summary}</p>
                {reply.rejected.likelyCause && <p className="mt-1">{reply.rejected.likelyCause}</p>}
                <ul className="mt-1 list-disc space-y-0.5 pl-4">{reply.rejected.recommendations.map((r, i) => <li key={i}>{r.action}</li>)}</ul>
              </div>
            </details>
          )}

          <div className="text-xs text-ink/45">
            {reply.mode === "llm" || reply.llmRejected
              ? `${reply.llmRejected ? `${t("copilot.rejectedPrefix")} · ` : ""}${reply.model} · ${t("copilot.seconds", { n: (reply.latencyMs / 1000).toFixed(1) })}${reply.usage?.completionTokens ? ` · ${t("copilot.tokens", { n: (reply.usage.promptTokens ?? 0) + reply.usage.completionTokens })}` : ""}`
              : t("copilot.templateNote")}
          </div>

          {canAct && (
            <div className="space-y-2 border-t border-rule pt-3">
              {scheduled ? (
                <p className="text-xs text-ok">{t("copilot.created")}</p>
              ) : (
                <div className="flex gap-2">
                  <input type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} aria-label={t("mach.whenAria")} className="h-8 min-w-0 flex-1 rounded-ui border border-rule bg-surface px-2 text-xs outline-none focus:border-accent" />
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
                    {t("copilot.scheduleFrom")}
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
