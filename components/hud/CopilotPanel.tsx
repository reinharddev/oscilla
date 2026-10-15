"use client";

import { loadCopilot, saveCopilot } from "@/lib/copilot-cache";
import { useEffect, useRef, useState } from "react";
import { Sparkles } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import type { CopilotResult } from "@/lib/copilot/types";
import type { Key } from "@/lib/i18n";
import { useT } from "@/lib/i18n/use-t";
import { useStore } from "@/lib/store";

type Reply = CopilotResult & { machine: string; llmConfigured: boolean; endpoint?: string; cached?: boolean };

const toLocalInput = (ts: number) => new Date(ts - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 16);

export function CopilotPanel({ machineId, canAct }: { machineId: string; canAct: boolean }) {
  const t = useT();
  const scheduleMaintenance = useStore((s) => s.scheduleMaintenance);
  const [reply, setReply] = useState<Reply | null>(() => loadCopilot<Reply>(machineId)?.data ?? null);
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
      saveCopilot(machineId, data);
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
      <Button key={id} variant={open === id ? "secondary" : "outline"} size="xs" className="ml-1.5 align-middle" onClick={() => setOpen(open === id ? null : id)}>
        {id}
      </Button>
    ));
  const badge = reply ? (reply.mode === "llm" ? t("copilot.badge.llm") : reply.llmRejected ? t("copilot.badge.rejected") : t("copilot.badge.template")) : undefined;
  const meta =
    reply && (reply.mode === "llm" || reply.llmRejected)
      ? `${reply.llmRejected ? `${t("copilot.rejectedPrefix")} · ` : ""}${reply.model} · ${t("copilot.seconds", { n: (reply.latencyMs / 1000).toFixed(1) })}${reply.usage?.completionTokens ? ` · ${t("copilot.tokens", { n: (reply.usage.promptTokens ?? 0) + reply.usage.completionTokens })}` : ""}`
      : t("copilot.templateNote");

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>{t("copilot.title")}</CardTitle>
        {badge && <CardDescription><Badge variant="secondary">{badge}</Badge></CardDescription>}
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {!reply && <p className="text-sm text-muted-foreground">{t("copilot.intro")}</p>}
        <div>
          <Button variant="outline" onClick={ask} disabled={busy}>
            {busy ? <Spinner data-icon="inline-start" /> : <Sparkles data-icon="inline-start" />}
            {busy ? t("copilot.running") : reply ? t("copilot.again") : t("copilot.ask")}
          </Button>
        </div>
        {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}

        {reply && (
          <div className="flex flex-col gap-4 text-sm leading-relaxed">
            {reply.review.required && (
              <Alert className="border-warning/40 bg-warning/10 text-foreground">
                <AlertTitle className="text-warning">{t("copilot.review")}</AlertTitle>
                <AlertDescription>
                  <ul className="mt-1 list-disc pl-4">{reply.review.reasons.map((r) => <li key={r}>{r}</li>)}</ul>
                </AlertDescription>
              </Alert>
            )}

            <p>{reply.summary}</p>
            {reply.likelyCause && (
              <div>
                <div className="text-xs text-muted-foreground">{t("copilot.cause")}</div>
                <p>{reply.likelyCause}</p>
              </div>
            )}

            <div>
              <div className="mb-1 text-xs text-muted-foreground">{t("copilot.recs")}</div>
              <ol className="flex flex-col">
                {reply.recommendations.map((r, i) => (
                  <li key={i}>
                    {i > 0 && <Separator />}
                    <div className="py-2">
                      <Badge variant="outline" className="mr-2">{t(`urgency.${r.urgency}` as Key)}</Badge>
                      {r.action.replace(/\s*\[(?:M|J)\d+\]/g, "")}
                      {chips(r.citations)}
                    </div>
                  </li>
                ))}
              </ol>
            </div>

            {source && (
              <Alert>
                <AlertTitle>{source.title}</AlertTitle>
                <AlertDescription>
                  <span className="text-xs">{source.detail}</span>
                  <p className="mt-2 text-foreground">{source.text}</p>
                  {source.sample && <p className="mt-2 text-xs">{t("copilot.sampleNote")}</p>}
                </AlertDescription>
              </Alert>
            )}

            <Collapsible>
              <p className="text-xs text-muted-foreground">
                {t("copilot.confidence")} <span className="font-semibold text-foreground">{t(`level.${reply.confidence.level}` as Key)}</span> {t("copilot.notCalibrated")}
              </p>
              <CollapsibleTrigger asChild>
                <Button variant="link" size="xs" className="h-auto p-0 text-xs text-muted-foreground">{t("copilot.basis")}</Button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <ul className="mt-1 list-disc pl-4 text-xs text-muted-foreground">{reply.confidence.basis.map((b) => <li key={b}>{b}</li>)}</ul>
              </CollapsibleContent>
            </Collapsible>

            {reply.rejected && (
              <Collapsible>
                <CollapsibleTrigger asChild>
                  <Button variant="link" size="xs" className="h-auto p-0 text-xs text-muted-foreground">{t("copilot.showRejected")}</Button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="mt-2 border-l pl-3 text-xs text-muted-foreground">
                    <p>{reply.rejected.summary}</p>
                    {reply.rejected.likelyCause && <p className="mt-1">{reply.rejected.likelyCause}</p>}
                    <ul className="mt-1 list-disc pl-4">{reply.rejected.recommendations.map((r, i) => <li key={i}>{r.action}</li>)}</ul>
                  </div>
                </CollapsibleContent>
              </Collapsible>
            )}

            <p className="text-xs text-muted-foreground">{meta}</p>

            {canAct && (
              <>
                <Separator />
                {scheduled ? (
                  <p className={cn("text-sm font-medium text-success")}>{t("copilot.created")}</p>
                ) : (
                  <div className="flex gap-2">
                    <Input type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} aria-label={t("mach.whenAria")} />
                    <Button
                      onClick={async () => {
                        await scheduleMaintenance(machineId, new Date(due).getTime(), {
                          summary: `${reply.summary} ${reply.recommendations[0]?.action ?? ""}`.replace(/\s*\[(?:M|J)\d+\]/g, ""),
                          aiDiagnosis: { mode: reply.mode, model: reply.model, summary: reply.summary, likelyCause: reply.likelyCause, recommendations: reply.recommendations, confidence: reply.confidence, review: reply.review, at: new Date().toISOString() },
                        });
                        setScheduled(true);
                      }}
                    >
                      {t("copilot.scheduleFrom")}
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
