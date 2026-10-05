import type { Lang } from "../i18n";
import type { Facts, Source } from "./types";

const LANGUAGE: Record<Lang, string> = { en: "English", id: "Indonesian" };

export function systemPrompt(lang: Lang): string {
  return `You are Oscilla Maintenance Copilot, an assistant for warehouse maintenance technicians.

Rules:
1. Use ONLY the FACTS and SOURCES in the user message. They are the whole truth you have.
2. Never invent numbers, dates, part numbers, torque values or procedures. Every number you write must appear in FACTS or SOURCES.
3. Every recommendation must list at least one source id (for example "M1" or "J2") in its "citations". Cite only ids that exist.
4. If the evidence is weak, or the sources do not cover the situation, say so and set "needsHumanReview" to true.
5. You never diagnose with certainty. Write like a careful colleague: short, concrete, in ${LANGUAGE[lang]}.
6. Reply with ONLY one JSON object, no markdown, in exactly this shape:
{"summary": string, "likelyCause": string, "recommendations": [{"action": string, "urgency": "immediate" | "within_days" | "monitor", "citations": [string]}], "needsHumanReview": boolean, "reviewReason": string}`;
}

export function buildMessages(facts: Facts, sources: Source[], lang: Lang) {
  const src = sources.map((s) => `[${s.id}] ${s.title} — ${s.detail}\n${s.text}`).join("\n\n");
  const user = `FACTS (JSON):\n${JSON.stringify(facts, null, 2)}\n\nSOURCES:\n${src || "(none)"}\n\nExplain the likely problem with this machine and recommend what the technician should do.`;
  return [
    { role: "system" as const, content: systemPrompt(lang) },
    { role: "user" as const, content: user },
  ];
}
