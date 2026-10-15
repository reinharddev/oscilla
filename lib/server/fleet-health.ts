import type { SupabaseClient } from "@supabase/supabase-js";
import type { Evidence, HealthStatus } from "../health";
import { estimateRulDays } from "../rul";
import { tickSimulator } from "./sim";
import { adminClient, simEnabled } from "./admin";
import type { AssetRow } from "./snapshots";

export interface AssetHealth {
  assetId: string;
  score: number;
  status: HealthStatus;
  evidence: Evidence[];
  modelVersion: string;
  source: "sensor" | "simulator";
  takenAt: string;
  vib: number | null; temp: number | null; cur: number | null;
  rulDays: number | null;
  hist: { score: number[]; vib: number[]; temp: number[]; cur: number[] };
}

const HIST = 40;

interface Row {
  taken_at: string; score: number | string; status: HealthStatus; evidence: Evidence[] | null; model_version: string | null;
  source: "sensor" | "simulator"; aux: { vibration_mm_s?: number; temperature_c?: number; current_a?: number } | null;
}

/** Latest reading and short history per machine, read under the caller's row-level security. */
export async function loadFleetHealth(supabase: SupabaseClient, assetIds: string[]): Promise<AssetHealth[]> {
  const out = await Promise.all(
    assetIds.map(async (id): Promise<AssetHealth | null> => {
      const { data } = await supabase
        .from("health_snapshots")
        .select("taken_at, score, status, evidence, model_version, source, aux")
        .eq("asset_id", id)
        .order("taken_at", { ascending: false })
        .limit(60);
      const rows = ((data ?? []) as Row[]).reverse(); // oldest first
      const last = rows[rows.length - 1];
      if (!last) return null;
      const tail = rows.slice(-HIST);
      const num = (f: (r: Row) => number | undefined) => tail.map((r) => f(r)).filter((v): v is number => typeof v === "number");
      return {
        assetId: id,
        score: Number(last.score),
        status: last.status,
        evidence: last.evidence ?? [],
        modelVersion: last.model_version ?? "unknown",
        source: last.source,
        takenAt: last.taken_at,
        vib: last.aux?.vibration_mm_s ?? null, temp: last.aux?.temperature_c ?? null, cur: last.aux?.current_a ?? null,
        rulDays: estimateRulDays(rows.map((r) => ({ t: Date.parse(r.taken_at), score: Number(r.score) }))),
        hist: { score: tail.map((r) => Number(r.score)), vib: num((r) => r.aux?.vibration_mm_s), temp: num((r) => r.aux?.temperature_c), cur: num((r) => r.aux?.current_a) },
      };
    }),
  );
  return out.filter((x): x is AssetHealth => x !== null);
}

/**
 * Make sure the dummy sensors have reported recently for these machines. Only does anything in
 * simulator mode (SIM_ENABLED); with real sensors, readings arrive through /api/ingest instead.
 */
export async function freshenSimulated(supabase: SupabaseClient, filter: { assetIds?: string[]; warehouseId?: string }): Promise<void> {
  if (!simEnabled()) return;
  const admin = adminClient();
  if (!admin) return;
  let q = supabase.from("assets").select("id, org_id, warehouse_id, serial_number, rpm"); // RLS: only machines the caller may see
  if (filter.assetIds) q = q.in("id", filter.assetIds);
  if (filter.warehouseId) q = q.eq("warehouse_id", filter.warehouseId);
  const { data } = await q;
  await tickSimulator(admin, (data ?? []) as AssetRow[]);
}
