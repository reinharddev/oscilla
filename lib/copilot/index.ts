import { makeT, type Lang } from "../i18n";
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
  /** Language of everything the Copilot writes. English by default. */
  lang?: Lang;
}

export function gatherSources(input: Pick<CopilotInput, "facts" | "manuals" | "journal" | "lang">): Source[] {
  const { facts, manuals, journal } = input;
  const t = makeT(input.lang ?? "en");
  const query = buildQuery(facts.machine.type, facts.machine.model, facts.health?.evidence ?? [], facts.health?.score ?? null);
  const found = searchManuals(manuals, query, facts.machine.type, 3);
  const sources: Source[] = found.map((f, i) => {
    const pageLabel = t("src.page", { n: f.chunk.page });
    return {
      id: `M${i + 1}`, kind: "manual", title: f.chunk.docTitle, detail: `${pageLabel} · ${f.chunk.section}`,
      section: f.chunk.section, pageLabel, text: f.chunk.text, sample: true,
    };
  });
  journal.slice(0, 4).forEach((j, i) => {
    sources.push({ id: `J${i + 1}`, kind: "journal", title: t("src.journalTitle", { when: j.when }) + (j.author ? ` (${j.author})` : ""), detail: j.kind, text: j.text });
  });
  return sources;
}

export async function runCopilot(input: CopilotInput): Promise<CopilotResult> {
  const t0 = Date.now();
  const lang = input.lang ?? "en";
  const t = makeT(lang);
  const { facts } = input;
  const sources = gatherSources({ ...input, lang });
  const manualSources = sources.filter((s) => s.kind === "manual").length;
  const warnings: string[] = []; // everything shown to the user
  const checkWarnings: string[] = []; // problems with the model's output: these affect confidence and review

  let answer: LlmAnswer | null = null;
  let mode: CopilotResult["mode"] = "template";
  let model: string | undefined;
  let usage: CopilotResult["usage"];

  if (input.llm) {
    try {
      const reply = await callLlm(input.llm, buildMessages(facts, sources, lang), input.fetchImpl);
      const parsed = LlmAnswerSchema.safeParse(extractJson(reply.content));
      if (!parsed.success) throw new Error("reply does not match the expected shape");
      answer = parsed.data;
      mode = "llm";
      model = reply.model;
      usage = reply.usage;
    } catch (e) {
      warnings.push(t("warn.llmUnavailable", { reason: (e as Error).message }));
    }
  }
  if (!answer) answer = composeTemplate(facts, sources, t);

  // Check the model's output; templates pass trivially because they only use supplied facts.
  let v = validateAnswer(answer, sources, facts);
  let rejected: CopilotResult["rejected"];
  if (mode === "llm") {
    if (v.invalidCitations.length) checkWarnings.push(t("warn.badCitation", { ids: v.invalidCitations.join(", ") }));
    if (v.unverifiedNumbers.length) checkWarnings.push(t("warn.badNumber", { nums: v.unverifiedNumbers.join(", ") }));
    if (v.uncitedRecommendations) checkWarnings.push(t("warn.uncited", { n: v.uncitedRecommendations }));
    if (checkWarnings.length) {
      // A fabricated answer is never shown as the answer: keep it for transparency, show the template.
      rejected = { summary: v.answer.summary, likelyCause: v.answer.likelyCause ?? "", recommendations: v.answer.recommendations };
      warnings.push(t("warn.rejected"), ...checkWarnings);
      v = validateAnswer(composeTemplate(facts, sources, t), sources, facts);
      mode = "template";
    }
  }
  const clean = checkWarnings.length === 0;
  const confidence = confidenceOf(facts, { clean }, manualSources, t);
  const review = reviewOf(facts, confidence, { warnings: checkWarnings, manualSources }, v.answer, t);

  return {
    mode, model,
    summary: v.answer.summary,
    likelyCause: v.answer.likelyCause ?? "",
    recommendations: v.answer.recommendations,
    sources, confidence, review, warnings, usage, llmRejected: Boolean(rejected), rejected,
    latencyMs: Date.now() - t0,
  };
}
