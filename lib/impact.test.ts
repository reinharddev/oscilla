import { describe, expect, it } from "vitest";
import { computeImpact, DEFAULT_ASSUMPTIONS, type ImpactOrder } from "./impact";

const now = Date.parse("2026-10-16T12:00:00Z");
const iso = (h: number) => new Date(now - h * 3_600_000).toISOString();
const machines = [
  { id: "f", type: "forklift" as const },
  { id: "a", type: "agv" as const },
  { id: "d", type: "drone" as const },
];

describe("computeImpact", () => {
  const orders: ImpactOrder[] = [
    { asset_id: "f", status: "done", created_at: iso(30), started_at: iso(24), completed_at: iso(20), ai: true },
    { asset_id: "a", status: "done", created_at: iso(50), started_at: iso(40), completed_at: iso(36), ai: true },
    { asset_id: "d", status: "done", created_at: iso(50), started_at: iso(40), completed_at: iso(36), ai: false },
    { asset_id: "f", status: "done", created_at: iso(24 * 60), started_at: iso(24 * 59), completed_at: iso(24 * 58), ai: true },
    { asset_id: "a", status: "scheduled", created_at: iso(2), started_at: null, completed_at: null, ai: true },
  ];
  const health = { f: { status: "critical" as const, rulDays: 4 }, a: { status: "attention" as const, rulDays: null }, d: { status: "healthy" as const, rulDays: null } };

  it("counts only AI-raised repairs finished inside the window", () => {
    const r = computeImpact(now, orders, machines, health, DEFAULT_ASSUMPTIONS);
    expect(r.aiJobs).toBe(2);
  });
  it("derives downtime and cost from the stated assumptions", () => {
    const r = computeImpact(now, orders, machines, health, DEFAULT_ASSUMPTIONS);
    // 2 jobs x (8 - 2) h x 50% = 6 h; forklift 300 + agv 500 per hour => 3 h each
    expect(r.downtimeAvoidedHours).toBe(6);
    expect(r.costAvoided).toBe(3 * 300 + 3 * 500);
    expect(r.techMinutesSaved).toBe(40);
  });
  it("is zero when nothing was finished, not NaN", () => {
    const r = computeImpact(now, [], machines, {}, DEFAULT_ASSUMPTIONS);
    expect(r).toMatchObject({ aiJobs: 0, costAvoided: 0, medianResponseHours: null, medianRepairHours: null, flagged: 0 });
  });
  it("uses medians for response and repair time", () => {
    const r = computeImpact(now, orders, machines, health, DEFAULT_ASSUMPTIONS);
    // three jobs finished in the window: responses 6, 10 and 10 h, repairs 4 h each
    expect(r.medianResponseHours).toBe(10);
    expect(r.medianRepairHours).toBe(4);
  });
  it("reports flagged machines without an open order and the exposure", () => {
    const r = computeImpact(now, orders, machines, health, DEFAULT_ASSUMPTIONS);
    expect(r.flagged).toBe(2);
    expect(r.flaggedWithoutOrder).toBe(1); // forklift has no open order, agv has
    expect(r.shortestRulDays).toBe(4);
    expect(r.costAtRisk).toBe(6 * 300 + 6 * 500);
  });
});
