import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAuthUser } from "@/lib/server/auth";
import { loadAlerts } from "@/lib/server/alerts";
import { freshenSimulated, loadFleetHealth } from "@/lib/server/fleet-health";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function handle(request: Request, tick: boolean) {
  const supabase = await createClient();
  const user = await getAuthUser(supabase);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const w = new URL(request.url).searchParams.get("warehouse");
  if (!w || !UUID.test(w)) return NextResponse.json({ error: "warehouse (uuid) required" }, { status: 400 });

  const t0 = Date.now();
  // Row-level security decides which machines of this warehouse the caller sees.
  const { data: assets } = await supabase.from("assets").select("id").eq("warehouse_id", w);
  if (tick) await freshenSimulated(supabase, { warehouseId: w });
  const [health, alerts] = await Promise.all([
    loadFleetHealth(supabase, (assets ?? []).map((a) => a.id as string)),
    loadAlerts(supabase, w),
  ]);
  return NextResponse.json({ health, alerts, readAt: new Date().toISOString(), ms: Date.now() - t0 });
}

/** Latest health of every machine in a warehouse, as the signed-in user may see it. */
export const GET = (r: Request) => handle(r, false);
/** Same, after asking the dummy sensors to report if they are due (simulator mode only). */
export const POST = (r: Request) => handle(r, true);
