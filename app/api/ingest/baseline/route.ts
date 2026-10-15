import { NextResponse } from "next/server";
import { adminClient } from "@/lib/server/admin";
import { fitBaseline } from "@/lib/server/health-client";
import { saveBaseline, type AssetRow } from "@/lib/server/snapshots";
import { keyOk } from "../route";

/**
 * Teach the system what a healthy machine looks like: 5-200 windows recorded while it was known to be healthy.
 *   POST /api/ingest/baseline   x-ingest-key: <INGEST_API_KEY>
 *   { "serial_number": "...", "fs": 12000, "rpm": 1800, "windows": [[...], [...], ...] }
 */
export async function POST(request: Request) {
  if (!process.env.INGEST_API_KEY) return NextResponse.json({ error: "ingest is not configured" }, { status: 503 });
  if (!keyOk(request)) return NextResponse.json({ error: "invalid or missing ingest key" }, { status: 401 });
  const admin = adminClient();
  if (!admin) return NextResponse.json({ error: "server is not configured" }, { status: 503 });

  let body: { serial_number?: unknown; fs?: unknown; rpm?: unknown; windows?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid json" }, { status: 400 }); }
  const w = body.windows;
  if (typeof body.serial_number !== "string" || !Array.isArray(w) || w.length < 5 || w.length > 200 || !w.every((x) => Array.isArray(x) && x.length >= 1000 && x.length <= 200_000)) {
    return NextResponse.json({ error: "serial_number and 5-200 windows of 1000-200000 samples are required" }, { status: 400 });
  }
  const { data: asset } = await admin.from("assets").select("id, org_id, warehouse_id, serial_number, rpm").eq("serial_number", body.serial_number).maybeSingle();
  if (!asset) return NextResponse.json({ error: "unknown machine" }, { status: 404 });
  const a = asset as AssetRow;
  try {
    const payload = await fitBaseline(Number(body.rpm ?? a.rpm ?? 1800), Number(body.fs ?? 12_000), w as number[][]);
    await saveBaseline(admin, a, payload, "baseline-v0");
    return NextResponse.json({ ok: true, windows: payload.n_windows });
  } catch {
    return NextResponse.json({ error: "could not learn a baseline from these windows" }, { status: 502 });
  }
}
