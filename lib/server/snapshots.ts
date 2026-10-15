import type { SupabaseClient } from "@supabase/supabase-js";
import type { BaselinePayload, ScoreResult } from "./health-client";

export interface AssetRow { id: string; org_id: string; warehouse_id: string; serial_number: string; rpm: number | null }

export async function loadBaseline(admin: SupabaseClient, assetId: string): Promise<BaselinePayload | null> {
  const { data } = await admin.from("asset_baselines").select("payload").eq("asset_id", assetId).maybeSingle();
  return (data?.payload as BaselinePayload | undefined) ?? null;
}

export async function saveBaseline(admin: SupabaseClient, asset: AssetRow, payload: BaselinePayload, modelVersion: string) {
  const { error } = await admin.from("asset_baselines").upsert({
    asset_id: asset.id, org_id: asset.org_id, warehouse_id: asset.warehouse_id, model_version: modelVersion, payload, learned_at: new Date().toISOString(),
  });
  if (error) throw new Error(`could not save baseline: ${error.message}`);
}

/** Store one scored window. Written with the service role; users can only read snapshots. */
export async function recordSnapshot(admin: SupabaseClient, asset: AssetRow, r: ScoreResult, source: "sensor" | "simulator", takenAt = new Date()) {
  const { error } = await admin.from("health_snapshots").insert({
    asset_id: asset.id, org_id: asset.org_id, warehouse_id: asset.warehouse_id, taken_at: takenAt.toISOString(),
    score: r.score, status: r.status, features: r.features, evidence: r.evidence, model_version: r.model_version,
    source, aux: r.aux ?? {},
  });
  if (error) throw new Error(`could not store snapshot: ${error.message}`);
}
