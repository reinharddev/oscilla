import type { T } from "../i18n";
import type { Facts, LlmAnswer, Source, Urgency } from "./types";

const fmt = (v: number) => (Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(2));

/**
 * Deterministic answer used when no language model is configured or the model's output is
 * rejected. It uses only the supplied facts and sources, so it can never invent anything.
 */
export function composeTemplate(facts: Facts, sources: Source[], t: T): LlmAnswer {
  const h = facts.health;
  const manual = sources.filter((s) => s.kind === "manual");
  const policy = manual.find((s) => s.title.startsWith("Site Maintenance Policy"));
  const procedure = manual.find((s) => s !== policy) ?? manual[0];

  if (!h) {
    return {
      summary: t("tmpl.noData", { name: facts.machine.name }),
      likelyCause: "",
      recommendations: [{ action: t("tmpl.waitOrCheck"), urgency: "monitor", citations: policy ? [policy.id] : [] }],
      needsHumanReview: true,
      reviewReason: t("tmpl.noDataReason"),
    };
  }

  const top = h.evidence[0];
  const bearing = h.evidence.some((e) => e.feature === "bpfo_envelope_ratio");
  const spiky = h.evidence.some((e) => e.feature === "kurtosis" || e.feature === "crest_factor");
  const summary =
    t("tmpl.summary", { name: facts.machine.name, score: h.score, status: t(`statusWord.${h.status}`) }) +
    (top ? t("tmpl.top", { label: top.labelId, value: fmt(top.value), baseline: fmt(top.baseline) }) : "");
  const likelyCause = h.status === "healthy" ? "" : bearing ? t("tmpl.causeBearing") : spiky ? t("tmpl.causeSpiky") : t("tmpl.causeUnknown");

  const urgency: Urgency = h.status === "critical" ? "immediate" : h.status === "attention" ? "within_days" : "monitor";
  const recommendations: LlmAnswer["recommendations"] = [];
  if (h.status === "healthy") {
    recommendations.push({ action: t("tmpl.healthyAction"), urgency: "monitor", citations: policy ? [policy.id] : [] });
  } else {
    if (procedure) {
      recommendations.push({
        action: t("tmpl.inspect", { section: procedure.section ?? procedure.title, title: procedure.title, page: procedure.pageLabel ?? "" }),
        urgency,
        citations: [procedure.id],
      });
    } else {
      recommendations.push({ action: t("tmpl.noManual"), urgency, citations: [] });
    }
    recommendations.push({
      action: h.status === "critical" ? t("tmpl.critAction") : t("tmpl.attnAction"),
      urgency,
      citations: policy ? [policy.id] : [],
    });
  }
  return { summary, likelyCause, recommendations };
}
