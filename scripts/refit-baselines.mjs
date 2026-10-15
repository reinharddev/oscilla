// Re-learns the healthy baseline of every dummy-sensor machine with the current feature set, so
// newer features (for example the inner-race and rolling-element envelope peaks) are scored.
// Baselines learned earlier keep working; this only adds the new features. History is untouched.
//   node --env-file=.env.local scripts/refit-baselines.mjs
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY;
const svc = process.env.HEALTH_SERVICE_URL ?? "http://localhost:8100";
if (!url || !key) { console.error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY are required"); process.exit(1); }
const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

const headers = { "content-type": "application/json", ...(process.env.HEALTH_SERVICE_KEY ? { "x-api-key": process.env.HEALTH_SERVICE_KEY } : {}) };
const { data: assets, error } = await admin.from("assets").select("id, org_id, warehouse_id, serial_number, rpm").order("serial_number");
if (error) throw error;
for (const a of assets) {
  const res = await fetch(`${svc}/demo/baseline`, { method: "POST", headers, body: JSON.stringify({ asset_id: a.id, rpm: Number(a.rpm ?? 1800) }), signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new Error(`${a.serial_number}: ${res.status} ${await res.text()}`);
  const payload = await res.json();
  const { error: e } = await admin.from("asset_baselines").upsert({ asset_id: a.id, org_id: a.org_id, warehouse_id: a.warehouse_id, model_version: "baseline-v0", payload, learned_at: new Date().toISOString() });
  if (e) throw e;
  console.log(`ok  ${a.serial_number}  ${payload.feature_names.length} features`);
}
