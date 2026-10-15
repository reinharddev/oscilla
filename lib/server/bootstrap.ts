import type { SupabaseClient } from "@supabase/supabase-js";
import { makeT, type Lang } from "../i18n";
import type { HydrateInput, Role } from "../store";
import type { AuthUser } from "./auth";
import { freshenSimulated, loadFleetHealth } from "./fleet-health";
import { loadAlerts } from "./alerts";
import { loadRoleData } from "./role-data";

const RANK: Record<Role, number> = { viewer: 0, technician: 1, manager: 2, admin: 3 };

export type Bootstrap = { kind: "ready"; data: HydrateInput } | { kind: "none"; name: string };

/**
 * Everything the app needs to draw its first screen, in one response. Every query runs under the
 * caller's own row-level security, so a user only ever receives their own scope.
 */
export async function loadBootstrap(supabase: SupabaseClient, user: AuthUser, lang: Lang, warehouseId?: string): Promise<Bootstrap> {
  const [wh, mem, prof, org] = await Promise.all([
    supabase.from("warehouses").select("id, name").order("name"),
    supabase.from("memberships").select("role, warehouse_id").eq("user_id", user.id),
    supabase.from("profiles").select("id, full_name"),
    supabase.from("organizations").select("name").limit(1),
  ]);
  const names: Record<string, string> = Object.fromEntries((prof.data ?? []).map((p) => [p.id as string, p.full_name as string]));
  const name = names[user.id] || user.email || makeT(lang)("common.user");
  const all = wh.data ?? [];
  const warehouse = all.find((x) => x.id === warehouseId) ?? all[0];
  if (!warehouse) return { kind: "none", name };

  const roles = (mem.data ?? [])
    .filter((m) => m.warehouse_id === null || m.warehouse_id === warehouse.id)
    .map((m) => m.role as Role);
  const role = roles.sort((a, b) => RANK[b] - RANK[a])[0] ?? "viewer";

  // Dummy-sensor mode: have the sensors report if they are due. An admin also sees the other warehouses.
  const fresh = freshenSimulated(supabase, role === "admin" ? {} : { warehouseId: warehouse.id });
  const [assets, journal, orders] = await Promise.all([
    supabase.from("assets").select("id, name, serial_number, type, org_id, warehouse_id").eq("warehouse_id", warehouse.id).order("name"),
    supabase.from("journal_entries").select("id, asset_id, author_id, kind, body, created_at").eq("warehouse_id", warehouse.id).order("created_at", { ascending: false }).limit(500),
    supabase.from("work_orders").select("id, asset_id, status, summary, due_at, started_at, completed_at, created_at, diagnosis_feedback, assigned_to, ai_diagnosis").eq("warehouse_id", warehouse.id),
  ]);
  await fresh;
  const [alerts, health, extra] = await Promise.all([
    loadAlerts(supabase, warehouse.id as string),
    loadFleetHealth(supabase, (assets.data ?? []).map((a) => a.id as string)),
    loadRoleData(supabase, role, warehouse, names, all.map((x) => ({ id: x.id as string, name: x.name as string }))),
  ]);

  return {
    kind: "ready",
    data: {
      locale: lang,
      auth: { userId: user.id, email: user.email, name, role, orgName: org.data?.[0]?.name ?? "", warehouseName: warehouse.name as string, warehouseId: warehouse.id as string },
      names,
      warehouses: all.map((x) => ({ id: x.id as string, name: x.name as string })),
      assets: (assets.data ?? []) as HydrateInput["assets"],
      journal: (journal.data ?? []) as HydrateInput["journal"],
      workOrders: (orders.data ?? []).map(({ ai_diagnosis, ...w }) => ({ ...w, ai: ai_diagnosis != null })) as HydrateInput["workOrders"],
      health,
      alerts,
      ...extra,
    },
  };
}
