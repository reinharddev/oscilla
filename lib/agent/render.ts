import { fmtDate, makeT, type Key, type Lang } from "../i18n";
import type { ToolStep } from "./types";

const fmtNum = (v: number) => (Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(2));

interface Brief { name: string; score: number | null; status: "healthy" | "attention" | "critical" | null; lastServiceDays: number | null; scheduledFor: string | null }

/** Deterministic rendering of one tool result. It only restates what the tool returned. */
export function renderStep(s: ToolStep, lang: Lang): string {
  const t = makeT(lang);
  const day = (iso: string) => fmtDate(iso, lang);
  const briefLine = (m: Brief) =>
    `- ${m.name}: ${m.score === null ? t("ag.noData") : t("ag.brief.score", { score: m.score, status: m.status ? t(`ag.status.${m.status}` as Key) : "-" })}` +
    (m.lastServiceDays !== null ? t("ag.brief.service", { n: m.lastServiceDays }) : "") +
    (m.scheduledFor ? t("ag.brief.scheduled", { date: day(m.scheduledFor) }) : "");

  const d = s.data as Record<string, any>;
  if (!s.ok) {
    if (d?.error === "ambiguous") return t("ag.ambiguous", { list: (d.candidates as string[]).slice(0, 4).join(", ") });
    if (d?.error === "not_found") return t("ag.notFound");
    if (d?.error === "forbidden") return d.message as string;
    return t("ag.stepFailed", { tool: s.tool, summary: s.summary });
  }
  switch (s.tool) {
    case "list_assets": {
      const rows = d.machines as Brief[];
      if (rows.length === 0) return t("ag.list.none");
      return `${t("ag.list.some", { n: rows.length })}\n${rows.map(briefLine).join("\n")}`;
    }
    case "get_asset_health": {
      const b = d.brief as Brief;
      const ev = (d.evidence as { label: string; value: number; baseline: number }[])[0];
      const trend = (d.recentScores as number[]).slice(0, 4);
      return [
        briefLine(b).replace(/^- /, ""),
        ev ? t("ag.health.top", { label: ev.label, value: fmtNum(ev.value), baseline: fmtNum(ev.baseline) }) : t("ag.health.none"),
        trend.length > 1 ? t("ag.health.trend", { list: trend.join(", ") }) : "",
      ].filter(Boolean).join("\n");
    }
    case "get_journal": {
      const rows = d.entries as { when: string; author?: string; kind: string; text: string }[];
      return rows.length
        ? `${t("ag.journal.some", { asset: d.asset })}\n${rows.map((r) => `- ${r.when}${r.author ? ` (${r.author})` : ""}: ${r.text}`).join("\n")}`
        : t("ag.journal.none", { asset: d.asset });
    }
    case "list_work_orders": {
      const rows = d.workOrders as { asset: string; status: string; dueAt: string | null; completedAt: string | null }[];
      if (!rows.length) return t("ag.wo.none");
      return `${t("ag.wo.some", { n: rows.length })}\n${rows.map((r) => `- ${r.asset}: ${t(`ag.wo.${r.status}` as Key)}${r.dueAt ? t("ag.wo.due", { date: day(r.dueAt) }) : ""}${r.completedAt ? t("ag.wo.doneOn", { date: day(r.completedAt) }) : ""}`).join("\n")}`;
    }
    case "search_manuals": {
      const hits = d.hits as { title: string; detail: string; text: string }[];
      return hits.length ? hits.map((h) => `- ${h.title}, ${h.detail}: ${h.text.slice(0, 220)}${h.text.length > 220 ? "…" : ""}`).join("\n") : t("ag.manual.none");
    }
    case "diagnose_asset": {
      const recs = d.recommendations as { action: string }[];
      return [d.summary, d.likelyCause ? t("ag.diag.cause", { cause: d.likelyCause }) : "", ...recs.map((r) => `- ${r.action}`), d.reviewRequired ? t("ag.diag.review") : ""].filter(Boolean).join("\n");
    }
    case "propose_work_order":
      return t("ag.propose", { asset: d.asset, date: day(d.dueAt as string) });
    default:
      return s.summary;
  }
}

export const renderSteps = (steps: ToolStep[], lang: Lang) => steps.map((s) => renderStep(s, lang)).join("\n\n");
