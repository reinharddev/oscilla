import type { HealthStatus, MachineType } from "./health";

export const DAY = 86_400_000;
const HOUR = 3_600_000;

/** What the impact figures are computed from. Every number is an assumption the viewer can change. */
export interface ImpactAssumptions {
  /** Cost of one hour of downtime, by machine type (USD). */
  costPerHour: Partial<Record<MachineType, number>> & { other: number };
  /** Hours a machine is out when it fails unexpectedly. */
  unplannedHours: number;
  /** Hours it is out when the same repair is planned. */
  plannedHours: number;
  /** Share of AI-flagged repairs that would really have turned into a breakdown (0 to 1). */
  preventedShare: number;
  /** Minutes a technician saves per AI-assisted job by not searching manuals and history. */
  minutesSavedPerJob: number;
}

export const DEFAULT_ASSUMPTIONS: ImpactAssumptions = {
  costPerHour: { forklift: 300, agv: 500, drone: 150, conveyor: 800, robot_arm: 600, other: 300 },
  unplannedHours: 8,
  plannedHours: 2,
  preventedShare: 0.5,
  minutesSavedPerJob: 20,
};

export interface ImpactOrder {
  asset_id: string; status: string; created_at?: string | null; started_at?: string | null; completed_at: string | null; ai?: boolean;
}
export interface ImpactMachine { id: string; type: MachineType }
export interface ImpactHealth { status: HealthStatus; rulDays: number | null }

export interface Impact {
  windowDays: number;
  /** AI-raised repairs completed in the window. */
  aiJobs: number;
  downtimeAvoidedHours: number;
  costAvoided: number;
  techMinutesSaved: number;
  /** Median hours from raising a work order to starting it, and from starting to finishing. */
  medianResponseHours: number | null;
  medianRepairHours: number | null;
  flagged: number;
  /** Flagged machines with no open work order. */
  flaggedWithoutOrder: number;
  shortestRulDays: number | null;
  /** Cost that is exposed if the flagged machines fail unplanned. */
  costAtRisk: number;
}

const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

export function computeImpact(
  now: number,
  orders: ImpactOrder[],
  machines: ImpactMachine[],
  health: Record<string, ImpactHealth | undefined>,
  a: ImpactAssumptions,
  windowDays = 30,
): Impact {
  const type = new Map(machines.map((m) => [m.id, m.type]));
  const rate = (assetId: string) => a.costPerHour[type.get(assetId) ?? "other"] ?? a.costPerHour.other;
  const savedHours = Math.max(0, a.unplannedHours - a.plannedHours);

  const done = orders.filter((o) => o.status === "done" && o.completed_at && now - Date.parse(o.completed_at) <= windowDays * DAY);
  const ai = done.filter((o) => o.ai);
  const downtimeAvoidedHours = ai.length * savedHours * a.preventedShare;
  const costAvoided = ai.reduce((sum, o) => sum + savedHours * a.preventedShare * rate(o.asset_id), 0);

  const hours = (from?: string | null, to?: string | null) =>
    from && to && Date.parse(to) >= Date.parse(from) ? (Date.parse(to) - Date.parse(from)) / HOUR : null;
  const response = done.map((o) => hours(o.created_at, o.started_at)).filter((x): x is number => x !== null);
  const repair = done.map((o) => hours(o.started_at, o.completed_at)).filter((x): x is number => x !== null);

  const open = new Set(orders.filter((o) => o.status === "scheduled" || o.status === "in_progress").map((o) => o.asset_id));
  const flaggedIds = machines.filter((m) => health[m.id] && health[m.id]!.status !== "healthy").map((m) => m.id);
  const ruls = flaggedIds.map((id) => health[id]!.rulDays).filter((x): x is number => x !== null);

  return {
    windowDays,
    aiJobs: ai.length,
    downtimeAvoidedHours,
    costAvoided,
    techMinutesSaved: ai.length * a.minutesSavedPerJob,
    medianResponseHours: median(response),
    medianRepairHours: median(repair),
    flagged: flaggedIds.length,
    flaggedWithoutOrder: flaggedIds.filter((id) => !open.has(id)).length,
    shortestRulDays: ruls.length ? Math.min(...ruls) : null,
    costAtRisk: flaggedIds.reduce((sum, id) => sum + savedHours * rate(id), 0),
  };
}
