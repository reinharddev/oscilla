// Creates the dummy-sensor state and 30 days of history for every machine, through the real
// scoring pipeline. Run again with --reset to start over.
//   node --env-file=.env.local scripts/seed-sim.mjs [--reset]
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY;
const svc = process.env.HEALTH_SERVICE_URL ?? "http://localhost:8100";
if (!url || !key) { console.error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY are required"); process.exit(1); }
const reset = process.argv.includes("--reset");
const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

// Machines that are already worn today, with how fast they are wearing (damage per day).
const WORN = {
  "FK-2024-0002": { now: 0.52, rate: 0.011 },
  "AGV-2024-0002": { now: 0.31, rate: 0.007 },
  "AGV-2025-0102": { now: 0.42, rate: 0.009 },
};
const DAYS = 30, PER_DAY = 4, DAY = 86_400_000;

async function post(path, body, ms = 60_000) {
  const headers = { "content-type": "application/json", ...(process.env.HEALTH_SERVICE_KEY ? { "x-api-key": process.env.HEALTH_SERVICE_KEY } : {}) };
  const res = await fetch(`${svc}${path}`, { method: "POST", headers, body: JSON.stringify(body), signal: AbortSignal.timeout(ms) });
  if (!res.ok) throw new Error(`${path} -> ${res.status} ${await res.text()}`);
  return res.json();
}

const { data: assets, error } = await admin.from("assets").select("id, org_id, warehouse_id, serial_number, rpm, name").order("serial_number");
if (error) throw error;
console.log(`${assets.length} machines`);

let i = 0;
for (const a of assets) {
  i++;
  const cfg = WORN[a.serial_number] ?? { now: 0.03 + ((i * 7) % 9) / 100, rate: 0.0006 };
  const rpm = Number(a.rpm ?? 1800);

  const { count } = await admin.from("health_snapshots").select("id", { count: "exact", head: true }).eq("asset_id", a.id);
  if (count && !reset) { console.log(`  skip ${a.serial_number} (already has ${count} snapshots; use --reset)`); continue; }

  const baseline = await post("/demo/baseline", { asset_id: a.id, rpm });
  const { error: be } = await admin.from("asset_baselines").upsert({ asset_id: a.id, org_id: a.org_id, warehouse_id: a.warehouse_id, model_version: "baseline-v0", payload: baseline });
  if (be) throw be;

  const total = DAYS * PER_DAY;
  const now = Date.now();
  const sev = [], when = [];
  for (let k = total; k >= 1; k--) {
    const ageDays = (k * DAY) / PER_DAY / DAY;
    sev.push(Math.min(0.99, Math.max(0.02, cfg.now - cfg.rate * ageDays)));
    when.push(new Date(now - (k * DAY) / PER_DAY));
  }
  const { points } = await post("/demo/series", { asset_id: a.id, rpm, severities: sev, baseline });
  const rows = points.map((r, n) => ({
    asset_id: a.id, org_id: a.org_id, warehouse_id: a.warehouse_id, taken_at: when[n].toISOString(),
    score: r.score, status: r.status, features: r.features, evidence: r.evidence, model_version: r.model_version, source: "simulator", aux: r.aux,
  }));
  if (reset) await admin.from("health_snapshots").delete().eq("asset_id", a.id);
  for (let o = 0; o < rows.length; o += 100) {
    const { error: ie } = await admin.from("health_snapshots").insert(rows.slice(o, o + 100));
    if (ie) throw ie;
  }
  const { error: se } = await admin.from("sim_state").upsert({ asset_id: a.id, severity: cfg.now, rate_per_day: cfg.rate, anchor_at: new Date().toISOString(), last_tick_at: new Date(0).toISOString() });
  if (se) throw se;
  console.log(`  ${a.serial_number.padEnd(14)} ${rows.length} points, now ${cfg.now.toFixed(2)} -> last score ${points.at(-1).score}`);
}
console.log("done");
