import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { adminClient, simEnabled } from "@/lib/server/admin";
import { loadFleetHealth } from "@/lib/server/fleet-health";
import { severityAt, tickSimulator, type SimState } from "@/lib/server/sim";
import type { AssetRow } from "@/lib/server/snapshots";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Dummy-data mode only: set the damage level of a simulated machine, as if it wore down or was
 * repaired, and have the dummy sensor report straight away. Needs a role that may write.
 *   POST { "assetId": "...", "severity": 0.5 }   ->   { previous, health }
 */
export async function POST(request: Request) {
  if (!simEnabled()) return NextResponse.json({ error: "simulator is disabled" }, { status: 404 });
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: { assetId?: unknown; severity?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid json" }, { status: 400 }); }
  const { assetId, severity } = body;
  if (typeof assetId !== "string" || !UUID.test(assetId) || typeof severity !== "number" || !(severity >= 0 && severity <= 0.99)) {
    return NextResponse.json({ error: "assetId (uuid) and severity (0-0.99) required" }, { status: 400 });
  }

  const { data: asset } = await supabase.from("assets").select("id, org_id, warehouse_id, serial_number, rpm").eq("id", assetId).maybeSingle();
  if (!asset) return NextResponse.json({ error: "not found" }, { status: 404 });
  const a = asset as AssetRow;

  const { data: mem } = await supabase.from("memberships").select("role, warehouse_id").eq("user_id", user.id);
  const mayWrite = (mem ?? []).some((m) => (m.warehouse_id === null || m.warehouse_id === a.warehouse_id) && ["admin", "manager", "technician"].includes(m.role as string));
  if (!mayWrite) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const admin = adminClient();
  if (!admin) return NextResponse.json({ error: "server is not configured" }, { status: 503 });

  const { data: prev } = await admin.from("sim_state").select("severity, rate_per_day, anchor_at").eq("asset_id", assetId).maybeSingle();
  const previous = prev ? severityAt(prev as SimState) : null;
  const { error } = await admin.from("sim_state").upsert({
    asset_id: assetId, severity, rate_per_day: prev?.rate_per_day ?? 0, anchor_at: new Date().toISOString(), last_tick_at: new Date(0).toISOString(),
  });
  if (error) return NextResponse.json({ error: "could not update" }, { status: 500 });

  await tickSimulator(admin, [a], { force: true });
  const health = await loadFleetHealth(supabase, [assetId]);
  return NextResponse.json({ previous, health: health[0] ?? null });
}
