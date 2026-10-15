import { describe, expect, it } from "vitest";
import { estimateRulDays } from "./rul";

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 9, 15);
const series = (scores: number[], stepDays = 1) => scores.map((score, i) => ({ t: NOW - (scores.length - 1 - i) * stepDays * DAY, score }));

describe("estimateRulDays", () => {
  it("extends a declining trend to the failure threshold", () => {
    // 100 falling 5 points a day; at 70 it reaches 25 in 9 days.
    const days = estimateRulDays(series([100, 95, 90, 85, 80, 75, 70]), NOW);
    expect(days).toBeCloseTo(9, 0);
  });

  it("returns null for a flat or improving trend and for too little data", () => {
    expect(estimateRulDays(series([90, 91, 90, 92, 91, 90, 91]), NOW)).toBeNull();
    expect(estimateRulDays(series([60, 70, 80, 90, 95, 99]), NOW)).toBeNull();
    expect(estimateRulDays(series([90, 80, 70]), NOW)).toBeNull();
  });

  it("reports no foreseeable failure when the line reaches the threshold only after a quarter", () => {
    // 0.2 points a day from 90: 325 days to 25.
    expect(estimateRulDays(series([91, 90.8, 90.6, 90.4, 90.2, 90]), NOW)).toBeNull();
  });

  it("is zero once the latest score is at or below the threshold", () => {
    expect(estimateRulDays(series([60, 50, 40, 30, 20, 20]), NOW)).toBe(0);
  });

  it("ignores readings older than two weeks", () => {
    const old = series([100, 100, 100, 100, 100, 100], 5); // 25 days long, only the last 3 are recent
    expect(estimateRulDays(old, NOW)).toBeNull();
  });
});
