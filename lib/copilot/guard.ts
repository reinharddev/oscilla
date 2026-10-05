import type { Confidence, Facts, LlmAnswer, Source } from "./types";

/**
 * Guardrails that run on the model's output. The model only writes prose; these checks make
 * sure it did not cite things that do not exist or introduce numbers nobody supplied.
 */

const CITATION = /\[(?:M|J)\d+\]/g;

export function extractNumbers(text: string): { raw: string; value: number; decimals: number }[] {
  const cleaned = text.replace(CITATION, " ").replace(/^\s*\d+[.)]\s+/gm, " ");
  const out: { raw: string; value: number; decimals: number }[] = [];
  for (const m of cleaned.matchAll(/\d+(?:[.,]\d+)?/g)) {
    const raw = m[0];
    const decimals = /[.,]/.test(raw) ? raw.split(/[.,]/)[1].length : 0;
    out.push({ raw, value: parseFloat(raw.replace(",", ".")), decimals });
  }
  return out;
}

/** Every number present in the facts and the sources: the only numbers the answer may use. */
export function allowedNumbers(facts: Facts, sources: Source[]): number[] {
  const corpus = [JSON.stringify(facts), ...sources.map((s) => `${s.title} ${s.detail} ${s.text}`)].join(" ");
  return extractNumbers(corpus).map((n) => n.value);
}

const TIME_UNIT = "hari|jam|menit|minggu|bulan|days?|hours?|minutes?|weeks?|months?";
const TIMED = new RegExp(`(\\d+(?:[.,]\\d+)?)\\s*(${TIME_UNIT})\\b`, "gi");

/** Durations the answer may mention: ones in the sources, plus the machine's real service age. */
export function allowedDurations(facts: Facts, sources: Source[]): number[] {
  const out: number[] = [];
  if (facts.lastServiceDays !== null) out.push(facts.lastServiceDays);
  for (const s of sources) for (const m of s.text.matchAll(TIMED)) out.push(parseFloat(m[1].replace(",", ".")));
  return out;
}

/**
 * Time statements ("dalam 3 hari") are exact claims about the future or past. Rounding is not
 * allowed for them: the number must be a duration that really appears in the data or manuals.
 */
export function unverifiedDurations(text: string, allowed: number[]): string[] {
  const out: string[] = [];
  for (const m of text.replace(CITATION, " ").matchAll(TIMED)) {
    const v = parseFloat(m[1].replace(",", "."));
    if (!allowed.some((a) => a === v)) out.push(`${m[1]} ${m[2]}`);
  }
  return out;
}

export function unverifiedNumbers(text: string, allowed: number[]): string[] {
  return extractNumbers(text)
    .filter((n) => !allowed.some((a) => Math.abs(a - n.value) < 0.5 * Math.pow(10, -n.decimals) + 1e-9))
    .map((n) => n.raw);
}

export interface Validation {
  answer: LlmAnswer;
  invalidCitations: string[];
  unverifiedNumbers: string[];
  uncitedRecommendations: number;
}

export function validateAnswer(answer: LlmAnswer, sources: Source[], facts: Facts): Validation {
  const ids = new Set(sources.map((s) => s.id));
  const invalid: string[] = [];
  let uncited = 0;
  const recommendations = answer.recommendations.map((r) => {
    const citations = [...new Set(r.citations.map((c) => c.replace(/[[\]]/g, "")))];
    const good = citations.filter((c) => ids.has(c));
    invalid.push(...citations.filter((c) => !ids.has(c)));
    if (good.length === 0) uncited++;
    return { ...r, citations: good };
  });
  const allowed = allowedNumbers(facts, sources);
  const text = [answer.summary, answer.likelyCause, ...recommendations.map((r) => r.action)].join("\n");
  return {
    answer: { ...answer, recommendations },
    invalidCitations: [...new Set(invalid)],
    unverifiedNumbers: [...new Set([...unverifiedNumbers(text, allowed), ...unverifiedDurations(text, allowedDurations(facts, sources))])],
    uncitedRecommendations: uncited,
  };
}

/** Qualitative level: the evidence has not been calibrated against real failures yet. */
export function confidenceOf(facts: Facts, v: { clean: boolean }, manualSources: number): Confidence {
  const basis: string[] = [];
  const h = facts.health;
  if (!h) return { level: "low", basis: ["Analisis sensor tidak tersedia."] };
  if (h.status === "healthy") {
    basis.push(`Skor ${h.score}, tidak ada penyimpangan berarti.`);
    return { level: h.score >= 90 ? "high" : "medium", basis };
  }
  const topZ = Math.max(0, ...h.evidence.map((e) => e.z_score));
  let points = 0;
  if (topZ >= 20) { points += 2; basis.push(`Penyimpangan terbesar sangat jelas (z ${topZ.toFixed(1)}).`); }
  else if (topZ >= 5) { points += 1; basis.push(`Penyimpangan terbesar cukup jelas (z ${topZ.toFixed(1)}).`); }
  else basis.push(`Penyimpangan lemah (z ${topZ.toFixed(1)}).`);
  if (h.evidence.length >= 2) { points += 1; basis.push(`${h.evidence.length} fitur sinyal menyimpang bersamaan.`); }
  if (manualSources >= 1) { points += 1; basis.push("Ada prosedur terkait di manual."); } else basis.push("Tidak ada prosedur terkait di manual.");
  if (v.clean) points += 1; else { points -= 2; basis.push("Keluaran AI tidak lolos pemeriksaan sumber atau angka."); }
  return { level: points >= 4 ? "high" : points >= 2 ? "medium" : "low", basis };
}

/** Review is decided by rules, not by the model: the model may only ask for more review. */
export function reviewOf(
  facts: Facts,
  confidence: Confidence,
  v: { warnings: string[]; manualSources: number },
  llm: { needsHumanReview?: boolean; reviewReason?: string },
): { required: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (!facts.health) reasons.push("Analisis sensor tidak tersedia.");
  if (facts.health?.status === "critical") reasons.push("Status kritis: teknisi harus mengonfirmasi sebelum tindakan apa pun.");
  if (confidence.level === "low") reasons.push("Keyakinan rendah.");
  if (facts.health && facts.health.status !== "healthy" && v.manualSources === 0) reasons.push("Tidak ada manual yang menjelaskan kondisi ini.");
  reasons.push(...v.warnings);
  if (llm.needsHumanReview) reasons.push(llm.reviewReason ?? "AI meminta peninjauan teknisi.");
  return { required: reasons.length > 0, reasons };
}
