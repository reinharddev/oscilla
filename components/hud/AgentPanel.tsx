"use client";

import { useEffect, useRef, useState } from "react";
import { Send } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/spinner";
import type { AgentResult, Proposal } from "@/lib/agent/types";
import { fmtDate, type Key } from "@/lib/i18n";
import { useLang, useT } from "@/lib/i18n/use-t";
import { canWrite, useStore } from "@/lib/store";

type Reply = AgentResult & { llmConfigured: boolean };
type Msg = { role: "user"; content: string } | { role: "assistant"; content: string; reply?: Reply };

function ProposalCard({ p, question }: { p: Proposal; question: string }) {
  const t = useT();
  const lang = useLang();
  const auth = useStore((s) => s.auth);
  const scheduleMaintenance = useStore((s) => s.scheduleMaintenance);
  const [state, setState] = useState<"open" | "busy" | "done" | "failed" | "dismissed">("open");
  if (state === "dismissed") return <p className="text-xs text-muted-foreground">{t("agent.dismissed")}</p>;
  return (
    <Alert>
      <AlertTitle>{t("agent.proposal", { name: p.assetName })}</AlertTitle>
      <AlertDescription>
        <p className="text-foreground">{p.summary}</p>
        <p className="mt-1 text-xs">{t(`urgency.${p.urgency}` as Key)} · {t("agent.due", { date: fmtDate(p.dueAt, lang) })}</p>
        {state === "done" ? (
          <p className="mt-2 text-sm font-medium text-success">{t("agent.created")}</p>
        ) : (
          <div className="mt-3 flex gap-2">
            {canWrite(auth) && (
              <Button
                size="sm"
                disabled={state === "busy"}
                onClick={async () => {
                  setState("busy");
                  const due = Date.parse(p.dueAt);
                  await scheduleMaintenance(p.assetId, due, { summary: p.summary, aiDiagnosis: { source: "agent", proposalId: p.id, urgency: p.urgency, question, at: new Date().toISOString() } });
                  setState(useStore.getState().schedules[p.assetId]?.due === due ? "done" : "failed");
                }}
              >
                {state === "busy" ? <Spinner data-icon="inline-start" /> : null}
                {state === "busy" ? t("agent.creating") : t("agent.confirm")}
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={() => setState("dismissed")}>{t("agent.dismiss")}</Button>
          </div>
        )}
        {state === "failed" && <p role="alert" className="mt-2 text-sm text-destructive">{t("agent.createFailed")}</p>}
      </AlertDescription>
    </Alert>
  );
}

function Assistant({ msg, question }: { msg: Extract<Msg, { role: "assistant" }>; question: string }) {
  const t = useT();
  const r = msg.reply;
  return (
    <div className="flex flex-col gap-2">
      <p className="whitespace-pre-line text-sm leading-relaxed">{msg.content}</p>
      {r?.proposals.map((p) => <ProposalCard key={p.id} p={p} question={question} />)}
      {r && r.warnings.length > 0 && (
        <ul className="list-disc pl-4 text-xs text-warning">{r.warnings.map((w) => <li key={w}>{w}</li>)}</ul>
      )}
      {r?.rejectedAnswer && (
        <Collapsible>
          <CollapsibleTrigger asChild><Button variant="link" size="xs" className="h-auto p-0 text-xs text-muted-foreground">{t("agent.showRejected")}</Button></CollapsibleTrigger>
          <CollapsibleContent><p className="mt-1 border-l pl-3 text-xs text-muted-foreground">{r.rejectedAnswer}</p></CollapsibleContent>
        </Collapsible>
      )}
      {r && r.steps.length > 0 && (
        <Collapsible>
          <CollapsibleTrigger asChild><Button variant="link" size="xs" className="h-auto p-0 text-xs text-muted-foreground">{t("agent.toolsUsed", { n: r.steps.length })}</Button></CollapsibleTrigger>
          <CollapsibleContent>
            <ul className="mt-1 flex flex-col text-xs">
              {r.steps.map((s, i) => (
                <li key={i}>
                  {i > 0 && <Separator />}
                  <div className="py-1.5">
                    <span className="font-medium">{s.tool}</span>
                    <span className="text-muted-foreground"> {JSON.stringify(s.args)}</span>
                    <div className={s.ok ? "text-muted-foreground" : "text-warning"}>{s.summary}</div>
                  </div>
                </li>
              ))}
            </ul>
          </CollapsibleContent>
        </Collapsible>
      )}
      {r && (
        <p className="text-xs text-muted-foreground">
          {r.mode === "llm"
            ? `${r.model} · ${t("copilot.seconds", { n: (r.latencyMs / 1000).toFixed(1) })}${r.usage ? ` · ${t("copilot.tokens", { n: r.usage.promptTokens + r.usage.completionTokens })}` : ""}`
            : t("agent.simpleMode")}
        </p>
      )}
    </div>
  );
}

export function AgentPanel() {
  const t = useT();
  const selectedId = useStore((s) => (s.machines.some((m) => m.id === s.selected?.id) ? s.selected?.id : null));
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ block: "nearest" }); }, [msgs, busy]);
  const suggestions = [t("agent.s1"), t("agent.s2"), t("agent.s3"), t("agent.s4")];

  async function ask(text: string) {
    const q = text.trim();
    if (q.length < 2 || busy) return;
    setInput(""); setError(undefined); setBusy(true);
    const history = msgs.slice(-6).map((m) => ({ role: m.role, content: m.content }));
    setMsgs((m) => [...m, { role: "user", content: q }]);
    try {
      const res = await fetch("/api/agent", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ question: q, history, selectedAssetId: selectedId }) });
      if (res.status === 429) throw new Error(t("agent.errBusy"));
      if (!res.ok) throw new Error(t("agent.errFail"));
      const reply: Reply = await res.json();
      setMsgs((m) => [...m, { role: "assistant", content: reply.answer, reply }]);
      const r = reply as Reply & { endpoint?: string };
      useStore.getState().recordLlm({
        at: Date.now(), source: "agent", mode: r.mode === "llm" ? "llm" : "fallback", model: r.model, endpoint: r.endpoint,
        latencyMs: r.latencyMs, promptTokens: r.usage?.promptTokens, completionTokens: r.usage?.completionTokens, toolCalls: r.steps?.length,
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const lastQuestion = (i: number) => [...msgs.slice(0, i)].reverse().find((m) => m.role === "user")?.content ?? "";

  return (
    <div className="px-4 pb-4">
      <Card size="sm">
        <CardHeader>
          <CardTitle>{t("agent.title")}</CardTitle>
          {selectedId && <CardDescription>{t("agent.context")}</CardDescription>}
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {msgs.length === 0 && (
            <div className="flex flex-col gap-2">
              <p className="text-sm text-muted-foreground">{t("agent.intro")}</p>
              <div className="flex flex-col items-stretch gap-1">
                {suggestions.map((s) => (
                  <Button key={s} variant="outline" size="sm" className="h-auto justify-start whitespace-normal py-1.5 text-left font-normal" onClick={() => void ask(s)}>{s}</Button>
                ))}
              </div>
            </div>
          )}

          {msgs.length > 0 && (
            <ScrollArea className="max-h-[380px]">
              <div className="flex flex-col gap-4 pr-3">
                {msgs.map((m, i) => (
                  <div key={i}>
                    <div className="mb-0.5 text-xs text-muted-foreground">{m.role === "user" ? t("agent.you") : t("agent.assistant")}</div>
                    {m.role === "user" ? <p className="text-sm">{m.content}</p> : <Assistant msg={m} question={lastQuestion(i)} />}
                  </div>
                ))}
                {busy && <p className="flex items-center gap-2 text-xs text-muted-foreground"><Spinner />{t("agent.working")}</p>}
                <div ref={end} />
              </div>
            </ScrollArea>
          )}
          {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}

          <form onSubmit={(e) => { e.preventDefault(); void ask(input); }} className="flex gap-2">
            <Input value={input} onChange={(e) => setInput(e.target.value)} maxLength={500} placeholder={t("agent.placeholder")} aria-label={t("agent.input")} />
            <Button type="submit" size="icon" disabled={busy || input.trim().length < 2} aria-label={t("agent.send")}><Send /></Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
