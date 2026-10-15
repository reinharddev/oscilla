import type { Key, T } from "./i18n";

export type HealthStatus = "healthy" | "attention" | "critical";
export type MachineType = "forklift" | "agv" | "drone" | "conveyor" | "robot_arm" | "other";

export interface Evidence { feature: string; label: string; value: number; baseline: number; z_score: number }

/** Label for a feature name coming from the health service, in the language of `t`. */
export function featureLabel(e: Evidence, t: T): string {
  const band = /^band_(\d+)_(\d+)_db$/.exec(e.feature);
  if (band) return t("feature.band", { lo: band[1], hi: band[2] });
  const key = `feature.${e.feature}` as Key;
  const text = t(key);
  return text === key ? e.label : text;
}

/** Latest reading of one machine plus a short history, as stored in the database. */
export interface Health {
  score: number;
  status: HealthStatus;
  evidence: Evidence[];
  modelVersion: string;
  /** "sensor" = real gateway through /api/ingest; "simulator" = dummy sensor. */
  source: "sensor" | "simulator";
  takenAt: number;
  /** Companion channels reported next to the vibration window. */
  vib: number | null; temp: number | null; cur: number | null;
  /** Estimated days until the failure threshold, from the score trend; null = no decline detected. */
  rulDays: number | null;
  hist: { score: number[]; vib: number[]; temp: number[]; cur: number[] };
}

/** A monitored asset: one row of the `assets` table. */
export interface Machine { id: string; label: string; type: MachineType; serial: string }

/** Alarm thresholds drawn on the sparklines and given to the Copilot. */
export const LIMIT = { vib: 4.5, temp: 75, cur: 10.5 };

export const statusKey = (s: HealthStatus | "maintenance"): Key => `status.${s}` as Key;
export const scoreOf = (h: Health) => Math.round(h.score);
export const statusOf = (h: Health): HealthStatus => h.status;

export function analysis(h: Health, t: T): string {
  if (h.status === "healthy") return t("analysis.healthy");
  const d = h.rulDays === null ? null : Math.max(1, Math.round(h.rulDays));
  const top = h.evidence[0];
  if (!top) return t("analysis.noEvidence", { score: scoreOf(h) });
  const num = (v: number) => (Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(2));
  const bearing = h.evidence.some((e) => e.feature === "bpfo_envelope_ratio");
  const rec = bearing
    ? d === null ? t("analysis.recBearingSoon") : t("analysis.recBearing", { d })
    : d === null ? t("analysis.recGenericSoon") : t("analysis.recGeneric", { d });
  return t("analysis.evidence", { score: scoreOf(h), label: featureLabel(top, t).toLowerCase(), value: num(top.value), baseline: num(top.baseline), rec });
}
