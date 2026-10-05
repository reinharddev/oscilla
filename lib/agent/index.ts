import type { LlmConfig } from "../copilot/llm";
import { runAgentLlm } from "./loop";
import { runRules } from "./rules";
import type { AgentResult, Backend, ChatTurn } from "./types";

export * from "./types";

export async function runAgent(opts: {
  question: string; history?: ChatTurn[]; backend: Backend; llm?: LlmConfig | null;
  selectedAssetId?: string | null; fetchImpl?: typeof fetch; now?: () => number;
}): Promise<AgentResult> {
  const ctx = { selectedAssetId: opts.selectedAssetId ?? null, now: opts.now ?? Date.now };
  if (opts.llm) {
    try {
      return await runAgentLlm({ question: opts.question, history: opts.history, backend: opts.backend, llm: opts.llm, ctx, fetchImpl: opts.fetchImpl });
    } catch (e) {
      const r = await runRules(opts.question, opts.backend, ctx);
      return { ...r, warnings: [`LLM tidak dapat dipakai (${(e as Error).message}); memakai mode sederhana.`, ...r.warnings] };
    }
  }
  return runRules(opts.question, opts.backend, ctx);
}
