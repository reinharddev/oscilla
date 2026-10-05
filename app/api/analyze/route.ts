import { NextResponse } from "next/server";
import { createClient as createAdmin } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

const SERVICE = process.env.HEALTH_SERVICE_URL ?? "http://localhost:8100";
const SNAPSHOT_EVERY_MS = 60_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface Item { assetId: string; severity: number }

/**
 * Bridge between the signed-in user and the health service.
 * - Only assets the user can read (row-level security) are analysed.
 * - The service key and the database secret never leave the server.
 * - Results are stored as health snapshots (written with the service role, since users cannot).
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let raw: unknown;
  try { raw = await request.json(); } catch { return NextResponse.json({ error: "invalid json" }, { status: 400 }); }
  const list = (raw as { items?: unknown })?.items;
  if (!Array.isArray(list) || list.length === 0 || list.length > 40) {
    return NextResponse.json({ error: "items must be 1-40 entries" }, { status: 400 });
  }
  const items: Item[] = [];
  for (const it of list) {
    const { assetId, severity } = (it ?? {}) as Partial<Item>;
    if (typeof assetId !== "string" || !UUID.test(assetId) || typeof severity !== "number" || !(severity >= 0 && severity <= 1)) {
      return NextResponse.json({ error: "each item needs assetId (uuid) and severity (0-1)" }, { status: 400 });
    }
    items.push({ assetId, severity });
  }

  const { data: assets } = await supabase
    .from("assets")
    .select("id, org_id, warehouse_id, rpm")
    .in("id", items.map((i) => i.assetId));
  const byId = new Map((assets ?? []).map((a) => [a.id as string, a]));

  const headers: Record<string, string> = { "content-type": "application/json" };
  if (process.env.HEALTH_SERVICE_KEY) headers["x-api-key"] = process.env.HEALTH_SERVICE_KEY;

  const results = await Promise.all(
    items.map(async ({ assetId, severity }) => {
      const asset = byId.get(assetId);
      if (!asset) return { assetId, error: "forbidden" as const };
      try {
        const res = await fetch(`${SERVICE}/demo/analyze`, {
          method: "POST",
          headers,
          body: JSON.stringify({ asset_id: assetId, severity, rpm: Number(asset.rpm ?? 1800) }),
          signal: AbortSignal.timeout(4000),
          cache: "no-store",
        });
        if (!res.ok) return { assetId, error: "unavailable" as const };
        const out = await res.json();
        return {
          assetId,
          score: out.score as number,
          status: out.status as "healthy" | "attention" | "critical",
          evidence: out.evidence as unknown[],
          features: out.features as Record<string, number>,
          modelVersion: out.model_version as string,
          source: out.source as string,
          _meta: asset,
        };
      } catch {
        return { assetId, error: "unavailable" as const };
      }
    }),
  );

  // Keep a trend: at most one snapshot per asset per minute.
  const secret = process.env.SUPABASE_SECRET_KEY;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (secret && url) {
    try {
      const admin = createAdmin(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
      const ok = results.filter((r): r is Extract<typeof r, { score: number }> => "score" in r);
      if (ok.length) {
        const since = new Date(Date.now() - SNAPSHOT_EVERY_MS).toISOString();
        const { data: recent } = await admin.from("health_snapshots").select("asset_id").in("asset_id", ok.map((r) => r.assetId)).gt("taken_at", since);
        const skip = new Set((recent ?? []).map((r) => r.asset_id as string));
        const rows = ok.filter((r) => !skip.has(r.assetId)).map((r) => ({
          asset_id: r.assetId, org_id: r._meta.org_id, warehouse_id: r._meta.warehouse_id,
          score: r.score, status: r.status, features: r.features, evidence: r.evidence, model_version: r.modelVersion,
        }));
        if (rows.length) await admin.from("health_snapshots").insert(rows);
      }
    } catch {
      // Snapshots are best-effort; the live result is still returned.
    }
  }

  return NextResponse.json({
    serviceUp: results.some((r) => "score" in r),
    results: results.map((r) => ("_meta" in r ? { ...r, _meta: undefined, features: undefined } : r)),
  });
}
