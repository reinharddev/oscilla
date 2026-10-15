import type { SupabaseClient } from "@supabase/supabase-js";
import type { AuditRow, BaselineRow, Member, OrgWarehouse, Person, Role } from "../store";
import { loadFleetHealth } from "./fleet-health";

export interface RoleData { people: Person[]; members: Member[]; audit: AuditRow[]; baselines: BaselineRow[]; org: OrgWarehouse[] }

const empty: RoleData = { people: [], members: [], audit: [], baselines: [], org: [] };

/**
 * Extra data a role works with. Every query still runs under the caller's own row-level security,
 * so asking for more than the role may see simply returns less.
 */
export async function loadRoleData(
  supabase: SupabaseClient,
  role: Role,
  warehouse: { id: string },
  names: Record<string, string>,
  warehouses: { id: string; name: string }[],
): Promise<RoleData> {
  if (role === "technician" || role === "viewer") return empty;
  const out: RoleData = { people: [], members: [], audit: [], baselines: [], org: [] };

  const [people, audit, baselines] = await Promise.all([
    supabase.rpc("warehouse_people", { p_warehouse: warehouse.id }),
    supabase.from("audit_log").select("id, created_at, actor_id, action, entity, entity_id, warehouse_id, details").order("created_at", { ascending: false }).limit(100),
    supabase.from("asset_baselines").select("asset_id, learned_at, model_version, payload").eq("warehouse_id", warehouse.id),
  ]);
  out.people = (people.data ?? []) as Person[];
  out.audit = (audit.data ?? []) as AuditRow[];
  out.baselines = ((baselines.data ?? []) as { asset_id: string; learned_at: string; model_version: string; payload: { n_windows?: number } }[]).map((b) => ({
    asset_id: b.asset_id, learned_at: b.learned_at, model_version: b.model_version, n_windows: b.payload?.n_windows ?? null,
  }));

  if (role !== "admin") return out;

  const [members, assets, orders] = await Promise.all([
    supabase.from("memberships").select("id, user_id, role, warehouse_id").order("created_at"),
    supabase.from("assets").select("id, warehouse_id"),
    supabase.from("work_orders").select("warehouse_id, status, due_at"),
  ]);
  out.members = ((members.data ?? []) as Omit<Member, "full_name">[]).map((m) => ({ ...m, full_name: names[m.user_id] ?? "" }));

  const assetRows = (assets.data ?? []) as { id: string; warehouse_id: string }[];
  const health = await loadFleetHealth(supabase, assetRows.map((a) => a.id));
  const byAsset = new Map(health.map((h) => [h.assetId, h]));
  const now = Date.now();
  out.org = warehouses.map((w) => {
    const mine = assetRows.filter((a) => a.warehouse_id === w.id);
    const hs = mine.map((a) => byAsset.get(a.id)).filter((h): h is NonNullable<typeof h> => Boolean(h));
    const wos = ((orders.data ?? []) as { warehouse_id: string; status: string; due_at: string | null }[]).filter((o) => o.warehouse_id === w.id && (o.status === "scheduled" || o.status === "in_progress"));
    return {
      id: w.id, name: w.name, machines: mine.length,
      critical: hs.filter((h) => h.status === "critical").length,
      attention: hs.filter((h) => h.status === "attention").length,
      healthy: hs.filter((h) => h.status === "healthy").length,
      openOrders: wos.length,
      overdue: wos.filter((o) => o.status === "scheduled" && o.due_at && Date.parse(o.due_at) < now).length,
      avgScore: hs.length ? Math.round(hs.reduce((a, h) => a + h.score, 0) / hs.length) : null,
      lastReadingAt: hs.length ? hs.map((h) => h.takenAt).sort().at(-1) ?? null : null,
    };
  });
  return out;
}
