import type { SupabaseClient } from "@supabase/supabase-js";

export interface AlertRow {
  id: string; asset_id: string; kind: "health" | "data_quality"; severity: "attention" | "critical"; score: number; headline: string;
  rul_days: number | null; status: "open" | "acknowledged" | "resolved"; created_at: string;
  acknowledged_by: string | null; acknowledged_at: string | null; resolved_at: string | null;
}

/** Active alerts plus whatever closed in the last week, newest first. Row-level security scopes it. */
export async function loadAlerts(supabase: SupabaseClient, warehouseId: string): Promise<AlertRow[]> {
  const since = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const { data } = await supabase
    .from("alerts")
    .select("id, asset_id, kind, severity, score, headline, rul_days, status, created_at, acknowledged_by, acknowledged_at, resolved_at")
    .eq("warehouse_id", warehouseId)
    .or(`status.neq.resolved,resolved_at.gte.${since}`)
    .order("created_at", { ascending: false })
    .limit(30);
  return ((data ?? []) as AlertRow[]).map((a) => ({ ...a, score: Number(a.score) }));
}
