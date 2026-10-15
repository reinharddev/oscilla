/** Measurements the benchmark panel shows. Everything is taken in the user's session, end to end. */
export interface LlmSample {
  at: number;
  source: "copilot" | "agent";
  /** "llm" = a model answered; "fallback" = template or rule-based answer was shown. */
  mode: "llm" | "fallback";
  model?: string;
  endpoint?: string;
  latencyMs: number;
  promptTokens?: number;
  completionTokens?: number;
  /** Tool calls made by the agent for this question. */
  toolCalls?: number;
  cached?: boolean;
}
export interface AnalyzeSample { at: number; ms: number; machines: number; serviceUp: boolean }

export const MAX_SAMPLES = 50;

/** Nearest-rank percentile; undefined for an empty list. */
export function percentile(values: number[], p: number): number | undefined {
  if (values.length === 0) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.max(1, Math.ceil((p / 100) * sorted.length));
  return sorted[rank - 1];
}

export interface LlmSummary {
  /** Calls answered by a model, not counting cached replies. */
  n: number;
  fallbacks: number;
  cached: number;
  p50?: number;
  p95?: number;
  /** Completion tokens over total wall time of the call (includes network, prompt processing, tools). */
  tokensPerSecP50?: number;
  avgPromptTokens?: number;
  avgCompletionTokens?: number;
}

export function summarizeLlm(samples: LlmSample[]): LlmSummary {
  const live = samples.filter((s) => s.mode === "llm" && !s.cached);
  const lat = live.map((s) => s.latencyMs);
  const tps = live.filter((s) => s.completionTokens && s.latencyMs > 0).map((s) => (s.completionTokens! / s.latencyMs) * 1000);
  const avg = (xs: (number | undefined)[]) => {
    const v = xs.filter((x): x is number => typeof x === "number");
    return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : undefined;
  };
  return {
    n: live.length,
    fallbacks: samples.filter((s) => s.mode === "fallback").length,
    cached: samples.filter((s) => s.cached).length,
    p50: percentile(lat, 50),
    p95: percentile(lat, 95),
    tokensPerSecP50: percentile(tps, 50),
    avgPromptTokens: avg(live.map((s) => s.promptTokens)),
    avgCompletionTokens: avg(live.map((s) => s.completionTokens)),
  };
}

export function summarizeAnalyze(samples: AnalyzeSample[]) {
  const ms = samples.map((s) => s.ms);
  return { n: samples.length, p50: percentile(ms, 50), p95: percentile(ms, 95), liveShare: samples.length ? samples.filter((s) => s.serviceUp).length / samples.length : undefined };
}

const fmt = (v: number | undefined, unit = "", digits = 0) => (v === undefined ? "n/a" : `${v.toFixed(digits)}${unit}`);

/** Plain-text table for pasting into the README or slides. */
export function toMarkdown(llm: LlmSample[], analyze: AnalyzeSample[], meta: { endpoint?: string; model?: string }): string {
  const rows = (["copilot", "agent"] as const).map((src) => {
    const s = summarizeLlm(llm.filter((x) => x.source === src));
    return `| ${src} | ${s.n} | ${fmt(s.p50, " ms")} | ${fmt(s.p95, " ms")} | ${fmt(s.tokensPerSecP50, "", 1)} | ${fmt(s.avgPromptTokens)} / ${fmt(s.avgCompletionTokens)} | ${s.fallbacks} | ${s.cached} |`;
  });
  const a = summarizeAnalyze(analyze);
  return [
    `Endpoint: ${meta.endpoint ?? "n/a"}, model: ${meta.model ?? "n/a"}. Measured in the browser, end to end (network included).`,
    "",
    "| Feature | Model calls | p50 latency | p95 latency | tokens/s (p50) | avg tokens in / out | fallbacks | cached |",
    "|---|---|---|---|---|---|---|---|",
    ...rows,
    "",
    `Health analysis round trips: ${a.n}, p50 ${fmt(a.p50, " ms")}, p95 ${fmt(a.p95, " ms")}.`,
  ].join("\n");
}
