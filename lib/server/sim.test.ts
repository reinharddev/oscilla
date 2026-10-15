import { describe, expect, it } from "vitest";
import { severityAt } from "./sim";

const DAY = 86_400_000;
const anchor = Date.UTC(2026, 9, 1);
const state = (severity: number, rate: number) => ({ severity, rate_per_day: rate, anchor_at: new Date(anchor).toISOString() });

describe("severityAt", () => {
  it("is the anchored level at the anchor and wears linearly after it", () => {
    expect(severityAt(state(0.3, 0.01), anchor)).toBeCloseTo(0.3);
    expect(severityAt(state(0.3, 0.01), anchor + 10 * DAY)).toBeCloseTo(0.4);
  });

  it("never exceeds 0.99, never goes below 0, and ignores times before the anchor", () => {
    expect(severityAt(state(0.9, 0.1), anchor + 30 * DAY)).toBe(0.99);
    expect(severityAt(state(0.3, 0.01), anchor - 5 * DAY)).toBeCloseTo(0.3);
    expect(severityAt(state(0, 0), anchor)).toBe(0);
  });
});
