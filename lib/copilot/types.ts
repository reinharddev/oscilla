import { z } from "zod";
import type { Evidence } from "../health";

export interface ManualChunk {
  id: string;
  docId: string;
  docTitle: string;
  page: number;
  section: string;
  appliesTo: string[];
  text: string;
}

/** Something the answer may cite: a manual passage (M1, M2…) or a journal entry (J1, J2…). */
export interface Source {
  id: string;
  kind: "manual" | "journal";
  title: string;
  /** Short locator, e.g. "p. 41 · Front wheel and wheel bearing inspection". */
  detail: string;
  /** For manual passages: the section title and the page label ("p. 41"), kept separately. */
  section?: string;
  pageLabel?: string;
  text: string;
  /** True for the demonstration manuals, which are synthetic and not manufacturer documents. */
  sample?: boolean;
}

export interface Facts {
  machine: { name: string; serial: string; type: string; manufacturer?: string | null; model?: string | null };
  health: { score: number; status: "healthy" | "attention" | "critical"; evidence: (Evidence & { labelId: string })[]; modelVersion: string; takenAt: string } | null;
  lastServiceDays: number | null;
  scheduledFor: string | null;
  limits: { vibration: number; temperature: number; current: number };
}

export const Urgency = z.enum(["immediate", "within_days", "monitor"]);
export type Urgency = z.infer<typeof Urgency>;

/** What the language model is asked to return. */
export const LlmAnswerSchema = z.object({
  summary: z.string().min(1).max(700),
  likelyCause: z.string().max(500).default(""),
  recommendations: z
    .array(z.object({ action: z.string().min(1).max(500), urgency: Urgency, citations: z.array(z.string()).max(6).default([]) }))
    .min(1)
    .max(5),
  needsHumanReview: z.boolean().optional(),
  reviewReason: z.string().max(400).optional(),
});
export type LlmAnswer = z.infer<typeof LlmAnswerSchema>;

export type Confidence = { level: "high" | "medium" | "low"; basis: string[] };

export interface CopilotResult {
  mode: "llm" | "template";
  model?: string;
  summary: string;
  likelyCause: string;
  recommendations: { action: string; urgency: Urgency; citations: string[] }[];
  sources: Source[];
  confidence: Confidence;
  review: { required: boolean; reasons: string[] };
  warnings: string[];
  /** True when an LLM answered but failed the checks, so the template answer is shown instead. */
  llmRejected: boolean;
  rejected?: { summary: string; likelyCause: string; recommendations: { action: string; urgency: Urgency; citations: string[] }[] };
  usage?: { promptTokens?: number; completionTokens?: number };
  latencyMs: number;
}
