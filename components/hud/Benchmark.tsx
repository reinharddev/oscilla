"use client";

import { useState } from "react";
import { summarizeAnalyze, summarizeLlm, toMarkdown } from "@/lib/bench";
import { useT } from "@/lib/i18n/use-t";
import { useStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const na = "–";
const ms = (v?: number) => (v === undefined ? na : v >= 1000 ? `${(v / 1000).toFixed(1)} s` : `${Math.round(v)} ms`);

export function Benchmark() {
  const t = useT();
  const { llm, analyze } = useStore((s) => s.bench);
  const clear = useStore((s) => s.clearBench);
  const [copied, setCopied] = useState(false);

  const last = [...llm].reverse().find((s) => s.mode === "llm" && s.model);
  const endpoint = last?.endpoint;
  const a = summarizeAnalyze(analyze);

  const rows = (["copilot", "agent"] as const).map((src) => ({ src, s: summarizeLlm(llm.filter((x) => x.source === src)) }));
  const empty = llm.length === 0;

  async function copy() {
    try {
      await navigator.clipboard.writeText(toMarkdown(llm, analyze, { endpoint, model: last?.model }));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  }

  return (
    <div className="px-4 pb-4">
      <Card size="sm">
        <CardHeader>
          <CardTitle>{t("bench.title")}</CardTitle>
          <CardDescription>{last ? `${last.model}${endpoint ? ` · ${endpoint}` : ""}` : t("bench.noModel")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-0">{t("bench.feature")}</TableHead>
                <TableHead className="text-right">{t("bench.calls")}</TableHead>
                <TableHead className="text-right">p50</TableHead>
                <TableHead className="text-right">p95</TableHead>
                <TableHead className="pr-0 text-right">{t("bench.tps")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(({ src, s }) => (
                <TableRow key={src}>
                  <TableCell className="pl-0">{t(`bench.${src}`)}</TableCell>
                  <TableCell className="text-right tabular-nums">{s.n}</TableCell>
                  <TableCell className="text-right tabular-nums">{ms(s.p50)}</TableCell>
                  <TableCell className="text-right tabular-nums">{ms(s.p95)}</TableCell>
                  <TableCell className="pr-0 text-right tabular-nums">{s.tokensPerSecP50 === undefined ? na : s.tokensPerSecP50.toFixed(1)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-sm">
            <dt className="text-muted-foreground">{t("bench.fallbacks")}</dt>
            <dd className="text-right tabular-nums">{rows.reduce((n, r) => n + r.s.fallbacks, 0)}</dd>
            <dt className="text-muted-foreground">{t("bench.cached")}</dt>
            <dd className="text-right tabular-nums">{rows.reduce((n, r) => n + r.s.cached, 0)}</dd>
            <dt className="text-muted-foreground">{t("bench.analysis")}</dt>
            <dd className="text-right tabular-nums">{a.n === 0 ? na : `${ms(a.p50)} · ${a.n}×`}</dd>
          </dl>

          <p className="text-xs leading-snug text-muted-foreground">{empty ? t("bench.empty") : t("bench.note")}</p>

          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={copy} disabled={empty}>{copied ? t("bench.copied") : t("bench.copy")}</Button>
            <Button variant="ghost" size="sm" onClick={clear} disabled={empty && analyze.length === 0}>{t("bench.clear")}</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
