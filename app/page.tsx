import { redirect } from "next/navigation";
import Game from "@/components/Game";
import NoLayout from "@/components/NoLayout";
import { getLang } from "@/lib/i18n/server";
import { makeT } from "@/lib/i18n";
import { LayoutSchema } from "@/lib/layout-schema";
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
    supabase.from("warehouses").select("id, name, layout").order("name"),
    supabase.from("memberships").select("role, warehouse_id").eq("user_id", user.id),
    supabase.from("profiles").select("id, full_name"),
    supabase.from("organizations").select("name").limit(1),
  ]);
  const names: Record<string, string> = Object.fromEntries((prof.data ?? []).map((p) => [p.id, p.full_name]));
  const name = names[user.id] || user.email || makeT(lang)("common.user");
  const all = wh.data ?? [];
  const warehouse = all.find((x) => x.id === w) ?? all[0];
  if (!warehouse) return <NoLayout name={name} warehouses={[]} reason="nolayout.noAccess" lang={lang} />;

  const parsed = LayoutSchema.safeParse(warehouse.layout);
  if (!parsed.success) {
    return <NoLayout name={name} warehouses={[warehouse.name]} reason="nolayout.badLayout" lang={lang} />;
  }

  const roles = (mem.data ?? [])
    .filter((m) => m.warehouse_id === null || m.warehouse_id === warehouse.id)
    .map((m) => m.role as Role);
  const role = roles.sort((a, b) => RANK[b] - RANK[a])[0] ?? "viewer";

  const [assets, journal, orders] = await Promise.all([
    supabase.from("assets").select("id, name, serial_number, type, org_id, warehouse_id").eq("warehouse_id", warehouse.id).order("name"),
    supabase.from("journal_entries").select("id, asset_id, author_id, kind, body, created_at").eq("warehouse_id", warehouse.id).order("created_at", { ascending: false }).limit(500),
    supabase.from("work_orders").select("id, asset_id, status, due_at, completed_at").eq("warehouse_id", warehouse.id),
  ]);

  const initial: HydrateInput = {
    locale: lang,
    auth: { userId: user.id, email: user.email ?? "", name, role, orgName: org.data?.[0]?.name ?? "", warehouseName: warehouse.name, warehouseId: warehouse.id },
    names,
    warehouses: all.map((x) => ({ id: x.id, name: x.name })),
    layout: parsed.data,
    assets: assets.data ?? [],
    journal: journal.data ?? [],
    workOrders: orders.data ?? [],
  };
  return <Game key={warehouse.id} initial={initial} />;
}
