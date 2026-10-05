import { buildQuery, searchManuals } from "./retrieve";
import { callLlm, extractJson, type LlmConfig } from "./llm";
import { buildMessages } from "./prompt";
import { composeTemplate } from "./template";
import { confidenceOf, reviewOf, validateAnswer } from "./guard";
import { LlmAnswerSchema, type CopilotResult, type Facts, type LlmAnswer, type ManualChunk, type Source } from "./types";

export interface JournalSnippet { when: string; author?: string; kind: string; text: string }

export interface CopilotInput {
  facts: Facts;
  manuals: ManualChunk[];
  journal: JournalSnippet[];
  llm?: LlmConfig | null;
  fetchImpl?: typeof fetch;
}

export function gatherSources(input: Pick<CopilotInput, "facts" | "manuals" | "journal">): Source[] {
  const { facts, manuals, journal } = input;
  const query = buildQuery(facts.machine.type, facts.machine.model, facts.health?.evidence ?? [], facts.health?.score ?? null);
  const found = searchManuals(manuals, query, facts.machine.type, 3);
  const sources: Source[] = found.map((f, i) => ({
    id: `M${i + 1}`, kind: "manual", title: f.chunk.docTitle, detail: `hal. ${f.chunk.page} · ${f.chunk.section}`, text: f.chunk.text, sample: true,
  }));
  journal.slice(0, 4).forEach((j, i) => {
    sources.push({ id: `J${i + 1}`, kind: "journal", title: `Jurnal mesin, ${j.when}${j.author ? ` (${j.author})` : ""}`, detail: j.kind, text: j.text });
  });
  return sources;
}

export async function runCopilot(input: CopilotInput): Promise<CopilotResult> {
  const t0 = Date.now();
  const { facts } = input;
  const sources = gatherSources(input);
  const manualSources = sources.filter((s) => s.kind === "manual").length;
  const warnings: string[] = [];

  let answer: LlmAnswer | null = null;
  let mode: CopilotResult["mode"] = "template";
  let model: string | undefined;
  let usage: CopilotResult["usage"];

  if (input.llm) {
    try {
      const reply = await callLlm(input.llm, buildMessages(facts, sources), input.fetchImpl);
      const parsed = LlmAnswerSchema.safeParse(extractJson(reply.content));
      if (!parsed.success) throw new Error("reply does not match the expected shape");
      answer = parsed.data;
      mode = "llm";
      model = reply.model;
      usage = reply.usage;
    } catch (e) {
      warnings.push(`LLM tidak dapat dipakai (${(e as Error).message}); memakai jawaban templat.`);
    }
  }
  if (!answer) answer = composeTemplate(facts, sources);

  // Check the model's output; templates pass trivially because they only use supplied facts.
  let v = validateAnswer(answer, sources, facts);
  let rejected: CopilotResult["rejected"];
  if (mode === "llm") {
    if (v.invalidCitations.length) warnings.push(`AI mengutip sumber yang tidak ada: ${v.invalidCitations.join(", ")}.`);
    if (v.unverifiedNumbers.length) warnings.push(`Angka tidak ditemukan di data atau sumber: ${v.unverifiedNumbers.join(", ")}.`);
    if (v.uncitedRecommendations) warnings.push(`${v.uncitedRecommendations} rekomendasi tanpa sumber yang valid.`);
    if (v.invalidCitations.length || v.unverifiedNumbers.length || v.uncitedRecommendations) {
      // A fabricated answer is never shown as the answer: keep it for transparency, show the template.
      rejected = { summary: v.answer.summary, likelyCause: v.answer.likelyCause ?? "", recommendations: v.answer.recommendations };
      warnings.unshift("Jawaban AI ditolak karena tidak lolos pemeriksaan; yang ditampilkan adalah jawaban templat dari data dan manual.");
      v = validateAnswer(composeTemplate(facts, sources), sources, facts);
      mode = "template";
    }
  }
  const real = warnings.filter((w) => !w.startsWith("LLM tidak"));
  const clean = real.length === 0;
  const confidence = confidenceOf(facts, { clean }, manualSources);
  const review = reviewOf(facts, confidence, { warnings: real, manualSources }, v.answer);

  return {
    mode, model,
    summary: v.answer.summary,
    likelyCause: v.answer.likelyCause ?? "",
    recommendations: v.answer.recommendations,
    sources, confidence, review, warnings, usage, llmRejected: Boolean(rejected), rejected,
    latencyMs: Date.now() - t0,
  };
}
