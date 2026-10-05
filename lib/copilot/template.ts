import type { Facts, LlmAnswer, Source, Urgency } from "./types";

const STATUS_ID = { healthy: "sehat", attention: "perlu perhatian", critical: "kritis" } as const;
const fmt = (v: number) => (Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(2));

/**
 * Deterministic answer used when no language model is configured or the model's output is
 * rejected. It uses only the supplied facts and sources, so it can never invent anything.
 */
export function composeTemplate(facts: Facts, sources: Source[]): LlmAnswer {
  const h = facts.health;
  const manual = sources.filter((s) => s.kind === "manual");
  const policy = manual.find((s) => s.title.startsWith("Site Maintenance Policy"));
  const procedure = manual.find((s) => s !== policy) ?? manual[0];

  if (!h) {
    return {
      summary: `${facts.machine.name}: data analisis sensor belum tersedia.`,
      likelyCause: "",
      recommendations: [{ action: "Tunggu analisis sensor berikutnya atau periksa mesin secara manual.", urgency: "monitor", citations: policy ? [policy.id] : [] }],
      needsHumanReview: true,
      reviewReason: "Tidak ada data sensor.",
    };
  }

  const top = h.evidence[0];
  const bearing = h.evidence.some((e) => e.feature === "bpfo_envelope_ratio");
  const spiky = h.evidence.some((e) => e.feature === "kurtosis" || e.feature === "crest_factor");
  const summary =
    `${facts.machine.name}: skor kesehatan ${h.score} (${STATUS_ID[h.status]}).` +
    (top ? ` Penyimpangan terbesar: ${top.labelId} bernilai ${fmt(top.value)} dibanding normal ${fmt(top.baseline)}.` : "");
  const likelyCause = h.status === "healthy" ? "" : bearing
    ? "Pola getaran khas keausan bearing: energi di frekuensi cacat bearing meningkat."
    : spiky ? "Ada lonjakan tajam pada getaran; kemungkinan komponen aus atau longgar." : "Getaran meningkat; penyebab belum bisa dipastikan dari sinyal saja.";

  const urgency: Urgency = h.status === "critical" ? "immediate" : h.status === "attention" ? "within_days" : "monitor";
  const recommendations: LlmAnswer["recommendations"] = [];
  if (h.status === "healthy") {
    recommendations.push({ action: "Tidak ada tindakan khusus. Lanjutkan pemantauan dan catat servis berkala di jurnal.", urgency: "monitor", citations: policy ? [policy.id] : [] });
  } else {
    if (procedure) {
      recommendations.push({
        action: `Lakukan inspeksi sesuai "${procedure.detail.split(" · ")[1] ?? procedure.title}" (${procedure.title}, ${procedure.detail.split(" · ")[0]}).`,
        urgency,
        citations: [procedure.id],
      });
    } else {
      recommendations.push({ action: "Periksa mesin secara langsung; tidak ada prosedur terkait di manual.", urgency, citations: [] });
    }
    recommendations.push({
      action: h.status === "critical"
        ? "Hentikan unit dari operasi sampai teknisi memastikan aman, lalu catat hasil inspeksi di jurnal."
        : "Jadwalkan maintenance, lalu catat hasil inspeksi di jurnal dan konfirmasi diagnosis saat menutup work order.",
      urgency,
      citations: policy ? [policy.id] : [],
    });
  }
  return { summary, likelyCause, recommendations };
}
