import type { Evidence } from "../health";
import type { ManualChunk } from "./types";

const STOP = new Set([
  "a", "an", "the", "and", "or", "of", "to", "in", "on", "at", "for", "with", "is", "are", "be", "by", "as", "it",
  "that", "this", "from", "than", "if", "then", "when", "after", "before", "must", "not", "do", "can", "will",
]);

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((t) => t.length > 1 && !STOP.has(t))
    .map((t) => (t.length > 3 && t.endsWith("s") ? t.slice(0, -1) : t));
}

/** BM25 over manual chunks, limited to chunks that apply to the machine type. */
export function searchManuals(chunks: ManualChunk[], query: string, type: string, limit = 3): { chunk: ManualChunk; score: number }[] {
  const pool = chunks.filter((c) => c.appliesTo.includes(type));
  if (pool.length === 0) return [];
  const docs = pool.map((c) => tokenize(`${c.section} ${c.section} ${c.text}`));
  const avg = docs.reduce((a, d) => a + d.length, 0) / docs.length;
  const df = new Map<string, number>();
  for (const d of docs) for (const t of new Set(d)) df.set(t, (df.get(t) ?? 0) + 1);
  const k1 = 1.5, b = 0.75;
  const q = [...new Set(tokenize(query))];
  const scored = pool.map((chunk, i) => {
    const d = docs[i];
    const tf = new Map<string, number>();
    for (const t of d) tf.set(t, (tf.get(t) ?? 0) + 1);
    let score = 0;
    for (const t of q) {
      const f = tf.get(t);
      if (!f) continue;
      const n = df.get(t) ?? 0;
      const idf = Math.log(1 + (pool.length - n + 0.5) / (n + 0.5));
      score += idf * ((f * (k1 + 1)) / (f + k1 * (1 - b + (b * d.length) / avg)));
    }
    return { chunk, score };
  });
  return scored.filter((s) => s.score > 0).sort((a, b2) => b2.score - a.score).slice(0, limit);
}

const FEATURE_TERMS: Record<string, string> = {
  bpfo_envelope_ratio: "bearing defect frequency envelope spectrum outer race wear rumbling",
  kurtosis: "impacts spikes vibration rise",
  crest_factor: "impacts spikes vibration rise",
  peak: "vibration rise",
  rms: "overall vibration level rise",
};

/** Turn the machine and its evidence into a search query. */
export function buildQuery(type: string, model: string | null | undefined, evidence: Evidence[], score: number | null): string {
  const parts: string[] = [type, model ?? ""];
  for (const e of evidence) parts.push(FEATURE_TERMS[e.feature] ?? (e.feature.startsWith("band_") ? "vibration" : ""));
  if (score !== null && score < 75) parts.push("inspection replace schedule");
  if (score !== null && score < 50) parts.push("critical remove from service");
  return parts.join(" ");
}
