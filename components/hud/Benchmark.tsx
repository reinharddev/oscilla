"use client";

import { useState } from "react";
import { summarizeAnalyze, summarizeLlm, toMarkdown } from "@/lib/bench";
import { useT } from "@/lib/i18n/use-t";
import { useStore } from "@/lib/store";
import { Section } from "./ui";

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
    <Section title={t("bench.title")} aside={last ? `${last.model}${endpoint ? ` · ${endpoint}` : ""}` : t("bench.noModel")}>
      <table className="w-full text-xs">
        <thead>
          <tr className="text-left text-ink/45">
            <th className="pb-1 font-normal">{t("bench.feature")}</th>
            <th className="pb-1 text-right font-normal">{t("bench.calls")}</th>
            <th className="pb-1 text-right font-normal">p50</th>
            <th className="pb-1 text-right font-normal">p95</th>
            <th className="pb-1 text-right font-normal">{t("bench.tps")}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-rule">
          {rows.map(({ src, s }) => (
            <tr key={src}>
              <td className="py-1.5">{t(`bench.${src}`)}</td>
              <td className="py-1.5 text-right">{s.n}</td>
              <td className="py-1.5 text-right">{ms(s.p50)}</td>
              <td className="py-1.5 text-right">{ms(s.p95)}</td>
              <td className="py-1.5 text-right">{s.tokensPerSecP50 === undefined ? na : s.tokensPerSecP50.toFixed(1)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
        <dt className="text-ink/55">{t("bench.fallbacks")}</dt>
        <dd className="text-right">{rows.reduce((n, r) => n + r.s.fallbacks, 0)}</dd>
        <dt className="text-ink/55">{t("bench.cached")}</dt>
        <dd className="text-right">{rows.reduce((n, r) => n + r.s.cached, 0)}</dd>
        <dt className="text-ink/55">{t("bench.analysis")}</dt>
        <dd className="text-right">{a.n === 0 ? na : `${ms(a.p50)} · ${a.n}×`}</dd>
      </dl>

      <p className="mt-3 text-[11px] leading-snug text-ink/50">{empty ? t("bench.empty") : t("bench.note")}</p>

      <div className="mt-3 flex gap-2">
        <button onClick={copy} disabled={empty} className="h-7 rounded-ui border border-rule px-2.5 text-xs transition-colors duration-150 hover:bg-ink/5 disabled:opacity-40">
          {copied ? t("bench.copied") : t("bench.copy")}
        </button>
        <button onClick={clear} disabled={empty && analyze.length === 0} className="h-7 rounded-ui border border-rule px-2.5 text-xs text-ink/60 transition-colors duration-150 hover:bg-ink/5 disabled:opacity-40">
          {t("bench.clear")}
        </button>
      </div>
    </Section>
  );
}
