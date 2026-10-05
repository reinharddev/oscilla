import { describe, expect, it } from "vitest";
import manuals from "../../knowledge/manuals.json";
import { allowedDurations, extractNumbers, unverifiedDurations, unverifiedNumbers } from "./guard";
import { gatherSources, runCopilot } from "./index";
import { buildQuery, searchManuals, tokenize } from "./retrieve";
import type { Facts, ManualChunk } from "./types";

const chunks = manuals as ManualChunk[];

const bearingEvidence = [
  { feature: "bpfo_envelope_ratio", label: "Energy at the bearing defect frequency", labelId: "Energi di frekuensi cacat bearing", value: 30.42, baseline: 1.84, z_score: 64.5 },
  { feature: "peak", label: "Peak amplitude", labelId: "Amplitudo puncak", value: 2.84, baseline: 1.41, z_score: 19.6 },
];

function facts(over: Partial<Facts> & { type?: string; score?: number; status?: "healthy" | "attention" | "critical"; evidence?: typeof bearingEvidence } = {}): Facts {
  const { type = "forklift", score = 34, status = "critical", evidence = bearingEvidence, ...rest } = over;
  return {
    machine: { name: "Forklift FK-02", serial: "FK-2024-0002", type, manufacturer: "Toyota", model: "8FBE15" },
    health: { score, status, evidence, modelVersion: "baseline-v0", takenAt: "2026-10-06T10:00:00Z" },
    lastServiceDays: 41,
    scheduledFor: null,
    limits: { vibration: 4.5, temperature: 75, current: 10.5 },
    ...rest,
  };
}

const journal = [{ when: "25 Agu 2026", author: "Budi Teknisi", kind: "done", text: "Pelumasan roda depan. Teknisi mencatat getaran sedikit tinggi, pantau." }];

/** Fake OpenAI-compatible endpoint. */
function fakeLlm(content: string, status = 200): typeof fetch {
  return (async () =>
    new Response(JSON.stringify({ model: "mock-model", usage: { prompt_tokens: 900, completion_tokens: 120 }, choices: [{ message: { content } }] }), { status })) as typeof fetch;
}
const llm = { baseUrl: "http://llm.test/v1", model: "mock-model" };
const good = (over: object = {}) =>
  JSON.stringify({
    summary: "FK-02 kritis dengan skor 34; energi di frekuensi cacat bearing 30.42 jauh di atas normal 1.84.",
    likelyCause: "Keausan bearing roda depan.",
    recommendations: [{ action: "Periksa bearing roda depan sesuai prosedur [M1].", urgency: "immediate", citations: ["M1"] }],
    needsHumanReview: false,
    reviewReason: "",
    ...over,
  });

describe("retrieval", () => {
  it("tokenizes simply", () => expect(tokenize("Wheels, Bearings!")).toEqual(["wheel", "bearing"]));

  it.each([
    ["forklift", "FKL-p41"],
    ["agv", "AGV-p19"],
    ["conveyor", "CVR-p14"],
  ])("finds the bearing procedure for a %s", (type, id) => {
    const q = buildQuery(type, null, bearingEvidence, 34);
    expect(searchManuals(chunks, q, type, 3)[0].chunk.id).toBe(id);
  });

  it("only returns manuals that apply to the machine type", () => {
    const hits = searchManuals(chunks, buildQuery("agv", null, bearingEvidence, 34), "agv", 10);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.every((h) => h.chunk.appliesTo.includes("agv"))).toBe(true);
  });

  it("builds sources with stable ids", () => {
    const s = gatherSources({ facts: facts(), manuals: chunks, journal });
    expect(s.map((x) => x.id)).toEqual(expect.arrayContaining(["M1", "J1"]));
    expect(s.find((x) => x.id === "M1")!.sample).toBe(true);
  });
});

describe("number guard", () => {
  it("ignores citation markers and list numbers", () => {
    expect(extractNumbers("1. Periksa [M1] dan [J2]").length).toBe(0);
  });
  it("accepts rounding of a supplied value, rejects a different one", () => {
    expect(unverifiedNumbers("skor 34 dan 30.4", [34.4, 30.42])).toEqual([]);
    expect(unverifiedNumbers("skor 40", [34.4])).toEqual(["40"]);
  });
});

describe("duration guard", () => {
  const f = facts();
  const sources = gatherSources({ facts: f, manuals: chunks, journal });
  const allowed = allowedDurations(f, sources);

  it("allows the real service age and durations written in the manuals", () => {
    expect(unverifiedDurations("Servis terakhir 41 hari lalu.", allowed)).toEqual([]);
    expect(unverifiedDurations("Jalankan mesin selama 10 menit.", allowed)).toEqual([]);
  });
  it("rejects an invented time prediction even when a rounded value exists elsewhere", () => {
    expect(unverifiedDurations("Mesin akan gagal dalam 3 hari.", allowed)).toEqual(["3 hari"]);
    expect(unverifiedDurations("Perlu diganti dalam 2 minggu", allowed)).toEqual(["2 minggu"]);
  });
});

describe("template mode (no LLM configured)", () => {
  it("answers from facts and sources only, with valid citations", async () => {
    const r = await runCopilot({ facts: facts(), manuals: chunks, journal });
    expect(r.mode).toBe("template");
    expect(r.summary).toContain("34");
    expect(r.recommendations.length).toBeGreaterThan(0);
    const ids = new Set(r.sources.map((s) => s.id));
    for (const rec of r.recommendations) for (const c of rec.citations) expect(ids.has(c)).toBe(true);
    expect(r.recommendations[0].citations.length).toBeGreaterThan(0);
  });

  it("requires human review for a critical machine", async () => {
    const r = await runCopilot({ facts: facts(), manuals: chunks, journal });
    expect(r.review.required).toBe(true);
    expect(r.review.reasons.join(" ")).toMatch(/kritis/i);
  });

  it("a healthy machine needs no review and gets high confidence", async () => {
    const r = await runCopilot({ facts: facts({ score: 96, status: "healthy", evidence: [] }), manuals: chunks, journal });
    expect(r.review.required).toBe(false);
    expect(r.confidence.level).toBe("high");
  });

  it("without sensor analysis it says so and asks for review", async () => {
    const f = facts();
    f.health = null;
    const r = await runCopilot({ facts: f, manuals: chunks, journal });
    expect(r.confidence.level).toBe("low");
    expect(r.review.required).toBe(true);
  });
});

describe("LLM mode", () => {
  it("accepts a grounded answer and reports model and usage", async () => {
    const r = await runCopilot({ facts: facts(), manuals: chunks, journal, llm, fetchImpl: fakeLlm(good()) });
    expect(r.mode).toBe("llm");
    expect(r.llmRejected).toBe(false);
    expect(r.model).toBe("mock-model");
    expect(r.usage).toEqual({ promptTokens: 900, completionTokens: 120 });
    expect(r.warnings).toEqual([]);
    expect(r.confidence.level).toBe("high");
  });

  it("rejects an answer that cites a source that does not exist and shows the template instead", async () => {
    const bad = good({ recommendations: [{ action: "Ganti bearing [M9].", urgency: "immediate", citations: ["M9"] }] });
    const r = await runCopilot({ facts: facts(), manuals: chunks, journal, llm, fetchImpl: fakeLlm(bad) });
    expect(r.llmRejected).toBe(true);
    expect(r.mode).toBe("template");
    expect(r.rejected?.recommendations[0].citations).toEqual([]);
    expect(r.warnings.join(" ")).toMatch(/M9/);
    expect(JSON.stringify(r.recommendations)).not.toContain("M9");
    expect(r.review.required).toBe(true);
    expect(r.confidence.level).not.toBe("high");
  });

  it("rejects an answer with a number that appears in neither the facts nor the sources", async () => {
    const bad = good({ recommendations: [{ action: "Kencangkan mur dengan 777 Nm [M1].", urgency: "immediate", citations: ["M1"] }] });
    const r = await runCopilot({ facts: facts(), manuals: chunks, journal, llm, fetchImpl: fakeLlm(bad) });
    expect(r.llmRejected).toBe(true);
    expect(r.warnings.join(" ")).toContain("777");
    expect(r.review.reasons.join(" ")).toContain("777");
    expect(JSON.stringify(r.recommendations)).not.toContain("777");
  });

  it("flags an invented failure forecast", async () => {
    const bad = good({ summary: "FK-02 kritis dengan skor 34 dan akan gagal dalam 3 hari." });
    const r = await runCopilot({ facts: facts(), manuals: chunks, journal, llm, fetchImpl: fakeLlm(bad) });
    expect(r.llmRejected).toBe(true);
    expect(r.warnings.join(" ")).toContain("3 hari");
    expect(r.summary).not.toContain("3 hari");
    expect(r.review.required).toBe(true);
  });

  it("lets the model ask for more review but never for less", async () => {
    const more = await runCopilot({ facts: facts({ score: 96, status: "healthy", evidence: [] }), manuals: chunks, journal, llm, fetchImpl: fakeLlm(good({ summary: "Skor 96, sehat.", likelyCause: "", recommendations: [{ action: "Pantau.", urgency: "monitor", citations: ["M1"] }], needsHumanReview: true, reviewReason: "Data sedikit." })) });
    expect(more.review.required).toBe(true);
    const less = await runCopilot({ facts: facts(), manuals: chunks, journal, llm, fetchImpl: fakeLlm(good({ needsHumanReview: false })) });
    expect(less.review.required).toBe(true); // critical machines always need a technician
  });

  it("falls back to the template when the reply is not JSON", async () => {
    const r = await runCopilot({ facts: facts(), manuals: chunks, journal, llm, fetchImpl: fakeLlm("Maaf, saya tidak bisa.") });
    expect(r.mode).toBe("template");
    expect(r.warnings.join(" ")).toMatch(/LLM tidak dapat dipakai/);
  });

  it("falls back when the endpoint fails", async () => {
    const r = await runCopilot({ facts: facts(), manuals: chunks, journal, llm, fetchImpl: fakeLlm("{}", 500) });
    expect(r.mode).toBe("template");
  });

  it("accepts JSON wrapped in a code fence", async () => {
    const r = await runCopilot({ facts: facts(), manuals: chunks, journal, llm, fetchImpl: fakeLlm("```json\n" + good() + "\n```") });
    expect(r.mode).toBe("llm");
  });
});
