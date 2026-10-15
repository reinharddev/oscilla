import { redirect } from "next/navigation";
import Workspace from "@/components/Workspace";
import NoLayout from "@/components/NoLayout";
import { freshenSimulated, loadFleetHealth } from "@/lib/server/fleet-health";
import { getLang } from "@/lib/i18n/server";
import { makeT } from "@/lib/i18n";
import { createClient } from "@/lib/supabase/server";
import type { HydrateInput, Role } from "@/lib/store";

const RANK: Record<Role, number> = { viewer: 0, technician: 1, manager: 2, admin: 3 };

export default async function Page({ searchParams }: { searchParams: Promise<{ w?: string }> }) {
  const { w } = await searchParams;
  const lang = await getLang();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Everything below is filtered by row-level security: a user only receives their own scope.
  const [wh, mem, prof, org] = await Promise.all([
    supabase.from("warehouses").select("id, name").order("name"),
    supabase.from("memberships").select("role, warehouse_id").eq("user_id", user.id),
    supabase.from("profiles").select("id, full_name"),
    supabase.from("organizations").select("name").limit(1),
  ]);
  const names: Record<string, string> = Object.fromEntries((prof.data ?? []).map((p) => [p.id, p.full_name]));
  const name = names[user.id] || user.email || makeT(lang)("common.user");
  const all = wh.data ?? [];
  const warehouse = all.find((x) => x.id === w) ?? all[0];
  if (!warehouse) return <NoLayout name={name} warehouses={[]} reason="nolayout.noAccess" lang={lang} />;

  const roles = (mem.data ?? [])
    .filter((m) => m.warehouse_id === null || m.warehouse_id === warehouse.id)
    .map((m) => m.role as Role);
  const role = roles.sort((a, b) => RANK[b] - RANK[a])[0] ?? "viewer";

  const [assets, journal, orders] = await Promise.all([
    supabase.from("assets").select("id, name, serial_number, type, org_id, warehouse_id").eq("warehouse_id", warehouse.id).order("name"),
    supabase.from("journal_entries").select("id, asset_id, author_id, kind, body, created_at").eq("warehouse_id", warehouse.id).order("created_at", { ascending: false }).limit(500),
    supabase.from("work_orders").select("id, asset_id, status, summary, due_at, started_at, completed_at, created_at, diagnosis_feedback").eq("warehouse_id", warehouse.id),
  ]);

  // Dummy-sensor mode: make sure the sensors have reported recently, then read the latest values.
  await freshenSimulated(supabase, { warehouseId: warehouse.id });
  const health = await loadFleetHealth(supabase, (assets.data ?? []).map((a) => a.id as string));

  const initial: HydrateInput = {
    locale: lang,
    auth: { userId: user.id, email: user.email ?? "", name, role, orgName: org.data?.[0]?.name ?? "", warehouseName: warehouse.name, warehouseId: warehouse.id },
    names,
    warehouses: all.map((x) => ({ id: x.id, name: x.name })),
    assets: (assets.data ?? []) as HydrateInput["assets"],
    journal: journal.data ?? [],
    workOrders: (orders.data ?? []) as HydrateInput["workOrders"],
    health,
  };
  return <Workspace key={warehouse.id} initial={initial} />;
}
