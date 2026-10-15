import type { SupabaseClient } from "@supabase/supabase-js";
import { demoBaseline, demoScore, type BaselinePayload, type ScoreResult } from "./health-client";
import { saveBaseline, type AssetRow } from "./snapshots";

const DAY = 86_400_000;
export const TICK_MS = () => Number(process.env.SIM_TICK_MS ?? 30_000);

export interface SimState { severity: number; rate_per_day: number; anchor_at: string }

/** Damage level of a simulated machine at a moment: slow wear from its anchor. */
export function severityAt(s: SimState, now = Date.now()): number {
  const elapsedDays = Math.max(0, now - Date.parse(s.anchor_at)) / DAY;
  return Math.min(0.99, Math.max(0, Number(s.severity) + Number(s.rate_per_day) * elapsedDays));
}

/**
 * Dummy sensors. For every machine whose last tick is older than the tick interval, produce one
 * simulated vibration window at the machine's current damage level and push it through the same
 * scoring and storage path a real gateway would use.
 *
 * Three database requests however many machines are due: claim the due ones (atomic, so two
 * callers never produce the same reading), read their baselines, insert the readings.
 */
export async function tickSimulator(admin: SupabaseClient, assets: AssetRow[], opts: { force?: boolean } = {}): Promise<number> {
  if (assets.length === 0) return 0;
  const cutoff = new Date(Date.now() - TICK_MS()).toISOString();
  const { data: claimed, error } = await admin.rpc("claim_sim_ticks", { p_asset_ids: assets.map((a) => a.id), p_cutoff: cutoff, p_force: Boolean(opts.force) });
  if (error || !claimed?.length) return 0;

  const due = (claimed as ({ asset_id: string } & SimState)[]).map((c) => ({ asset: assets.find((a) => a.id === c.asset_id), state: c })).filter((x): x is { asset: AssetRow; state: SimState & { asset_id: string } } => Boolean(x.asset));
  const { data: stored } = await admin.from("asset_baselines").select("asset_id, payload").in("asset_id", due.map((d) => d.asset.id));
  const baselines = new Map((stored ?? []).map((b) => [b.asset_id as string, b.payload as BaselinePayload]));

  const rows: Record<string, unknown>[] = [];
  await Promise.all(
    due.map(async ({ asset, state }) => {
      try {
        let baseline = baselines.get(asset.id);
        if (!baseline) {
          baseline = await demoBaseline(asset.id, Number(asset.rpm ?? 1800));
          await saveBaseline(admin, asset, baseline, "baseline-v0");
        }
        const r: ScoreResult = await demoScore(asset.id, Number(asset.rpm ?? 1800), severityAt(state), baseline);
        rows.push({
          asset_id: asset.id, org_id: asset.org_id, warehouse_id: asset.warehouse_id,
          score: r.score, status: r.status, features: r.features, evidence: r.evidence, model_version: r.model_version, source: "simulator", aux: r.aux ?? {},
        });
      } catch {
        // One machine failing must not block the others; its reading is simply missing this round.
      }
    }),
  );
  if (rows.length) await admin.from("health_snapshots").insert(rows);
  return rows.length;
}
