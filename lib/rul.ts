/**
 * Estimated remaining life from the trend of recent health scores: a straight line fitted to the
 * last readings and extended to the failure threshold. Returns null when the trend is flat or
 * improving (no failure in sight) or there is too little data.
 */
export interface ScorePoint { t: number; score: number }

const DAY = 86_400_000;

export function estimateRulDays(points: ScorePoint[], now = Date.now(), failScore = 25): number | null {
  const recent = points.filter((p) => now - p.t <= 14 * DAY).slice(-60);
  if (recent.length < 6) return null;
  const latest = recent[recent.length - 1].score;
  if (latest <= failScore) return 0;

  // Least squares on (days since first point, score).
  const t0 = recent[0].t;
  const xs = recent.map((p) => (p.t - t0) / DAY);
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = recent.reduce((a, p) => a + p.score, 0) / n;
  let sxx = 0, sxy = 0;
  recent.forEach((p, i) => { sxx += (xs[i] - mx) ** 2; sxy += (xs[i] - mx) * (p.score - my); });
  if (sxx === 0) return null;
  const slope = sxy / sxx;
  if (slope > -0.05) return null; // under 0.05 points per day: not a meaningful decline
  const intercept = my - slope * mx;
  const tFail = (failScore - intercept) / slope;
  const days = tFail - xs[n - 1];
  if (!Number.isFinite(days)) return null;
  // Beyond a quarter the straight-line extrapolation says nothing useful: report no foreseeable failure.
  if (days > 90) return null;
  return Math.max(0, days);
}
