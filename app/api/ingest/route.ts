import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { adminClient } from "@/lib/server/admin";
import { isRejected, scoreWindow } from "@/lib/server/health-client";
import { loadBaseline, recordSnapshot, type AssetRow } from "@/lib/server/snapshots";

export function keyOk(request: Request): boolean {
  const expected = process.env.INGEST_API_KEY;
  const given = request.headers.get("x-ingest-key");
  if (!expected || !given) return false;
  const a = Buffer.from(given), b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Where a real gateway delivers one window of raw vibration data for one machine.
 *   POST /api/ingest   x-ingest-key: <INGEST_API_KEY>
 *   { "serial_number": "FK-2024-0002", "fs": 12000, "rpm": 1800, "signal": [ ...samples ] }
 * The window is scored against the machine's stored baseline and kept as a health snapshot.
 */
export async function POST(request: Request) {
  if (!process.env.INGEST_API_KEY) return NextResponse.json({ error: "ingest is not configured" }, { status: 503 });
  if (!keyOk(request)) return NextResponse.json({ error: "invalid or missing ingest key" }, { status: 401 });
  const admin = adminClient();
  if (!admin) return NextResponse.json({ error: "server is not configured" }, { status: 503 });

  let body: { serial_number?: unknown; fs?: unknown; rpm?: unknown; signal?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid json" }, { status: 400 }); }
  const { serial_number, signal } = body;
  const fs = Number(body.fs ?? 12_000);
  if (typeof serial_number !== "string" || !Array.isArray(signal) || signal.length < 1000 || signal.length > 200_000 || !signal.every((x) => typeof x === "number" && Number.isFinite(x))) {
    return NextResponse.json({ error: "serial_number and a numeric signal of 1000-200000 samples are required" }, { status: 400 });
  }
  if (!Number.isFinite(fs) || fs < 1000) return NextResponse.json({ error: "fs must be at least 1000" }, { status: 400 });

  const { data: asset } = await admin.from("assets").select("id, org_id, warehouse_id, serial_number, rpm").eq("serial_number", serial_number).maybeSingle();
  if (!asset) return NextResponse.json({ error: "unknown machine" }, { status: 404 });
  const a = asset as AssetRow;
  const rpm = Number(body.rpm ?? a.rpm ?? 1800);

  const baseline = await loadBaseline(admin, a.id);
  if (!baseline) return NextResponse.json({ error: "no baseline for this machine yet; send healthy windows to /api/ingest/baseline first" }, { status: 409 });

  try {
    const result = await scoreWindow(rpm, fs, signal as number[], baseline);
    if (isRejected(result)) {
      // Do not store a score for a window that cannot be trusted; tell people the sensor needs a look.
      // One active alert per machine and kind: a unique violation just means it is already raised.
      await admin.from("alerts").insert(
        { org_id: a.org_id, warehouse_id: a.warehouse_id, asset_id: a.id, kind: "data_quality", severity: "attention", score: 0, headline: result.issues.join(","), status: "open" },
      );
      return NextResponse.json({ error: "window rejected: the signal cannot be trusted", issues: result.issues }, { status: 422 });
    }
    await recordSnapshot(admin, a, result, "sensor");
    return NextResponse.json({ ok: true, score: result.score, status: result.status });
  } catch {
    return NextResponse.json({ error: "scoring failed" }, { status: 502 });
  }
}
