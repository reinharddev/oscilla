import type { LlmConfig } from "../copilot/llm";
import { makeT, type Lang } from "../i18n";
import { runAgentLlm } from "./loop";
import { runRules } from "./rules";
import type { AgentResult, Backend, ChatTurn } from "./types";

export * from "./types";

export async function runAgent(opts: {
  question: string; history?: ChatTurn[]; backend: Backend; llm?: LlmConfig | null;
  selectedAssetId?: string | null; fetchImpl?: typeof fetch; now?: () => number; lang?: Lang;
}): Promise<AgentResult> {
  const lang = opts.lang ?? "en";
  const ctx = { selectedAssetId: opts.selectedAssetId ?? null, now: opts.now ?? Date.now, lang };
  if (opts.llm) {
    try {
      return await runAgentLlm({ question: opts.question, history: opts.history, backend: opts.backend, llm: opts.llm, ctx, fetchImpl: opts.fetchImpl });
    } catch (e) {
      const r = await runRules(opts.question, opts.backend, ctx);
      return { ...r, warnings: [makeT(lang)("ag.llmFallback", { reason: (e as Error).message }), ...r.warnings] };
    }
  }
  return runRules(opts.question, opts.backend, ctx);
}
