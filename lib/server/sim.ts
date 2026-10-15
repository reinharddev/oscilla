import type { SupabaseClient } from "@supabase/supabase-js";
import { demoBaseline, demoScore } from "./health-client";
import { loadBaseline, recordSnapshot, saveBaseline, type AssetRow } from "./snapshots";

const DAY = 86_400_000;
export const TICK_MS = () => Number(process.env.SIM_TICK_MS ?? 30_000);

export interface SimState { severity: number; rate_per_day: number; anchor_at: string }

/** Damage level of a simulated machine at a moment: slow wear from its anchor. */
export function severityAt(s: SimState, now = Date.now()): number {
  const elapsedDays = Math.max(0, now - Date.parse(s.anchor_at)) / DAY;
  return Math.min(0.99, Math.max(0, Number(s.severity) + Number(s.rate_per_day) * elapsedDays));
}

async function ensureBaseline(admin: SupabaseClient, asset: AssetRow) {
  const existing = await loadBaseline(admin, asset.id);
  if (existing) return existing;
  const learned = await demoBaseline(asset.id, Number(asset.rpm ?? 1800));
  await saveBaseline(admin, asset, learned, "baseline-v0");
  return learned;
}

/**
 * Dummy sensors. For every machine whose last tick is older than the tick interval, produce one
 * simulated vibration window at the machine's current damage level and push it through the same
 * scoring and storage path a real gateway would use. Concurrent callers are safe: a tick is claimed
 * with a conditional update, so only one of them produces the reading.
 */
export async function tickSimulator(admin: SupabaseClient, assets: AssetRow[], opts: { force?: boolean } = {}): Promise<number> {
  const cutoff = new Date(Date.now() - TICK_MS()).toISOString();
  const now = new Date().toISOString();
  let produced = 0;
  await Promise.all(
    assets.map(async (asset) => {
      try {
        // A machine without simulator state starts lightly worn; the seed script sets real trajectories.
        await admin.from("sim_state").upsert({ asset_id: asset.id, severity: 0.05, rate_per_day: 0 }, { onConflict: "asset_id", ignoreDuplicates: true });
        let q = admin.from("sim_state").update({ last_tick_at: now }).eq("asset_id", asset.id);
        if (!opts.force) q = q.lt("last_tick_at", cutoff);
        const { data: claimed } = await q.select("severity, rate_per_day, anchor_at");
        const state = claimed?.[0] as SimState | undefined;
        if (!state) return;
        const baseline = await ensureBaseline(admin, asset);
        const result = await demoScore(asset.id, Number(asset.rpm ?? 1800), severityAt(state), baseline);
        await recordSnapshot(admin, asset, result, "simulator");
        produced++;
      } catch {
        // One machine failing must not block the others; its reading is simply missing this round.
      }
    }),
  );
  return produced;
}
