// Adds a handful of open work orders so each role has something to work with.
// Does nothing if a warehouse already has open work orders.
//   node --env-file=.env.local scripts/seed-workorders.mjs
import { createClient } from "@supabase/supabase-js";

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const DAY = 86_400_000;
const at = (days, hour = 9) => { const d = new Date(Date.now() + days * DAY); d.setHours(hour, 0, 0, 0); return d.toISOString(); };

const { data: users } = await admin.auth.admin.listUsers({ perPage: 200 });
const id = (email) => users.users.find((u) => u.email === email)?.id;
const manager = id("manager@oscilla.example"), tech = id("technician@oscilla.example"), techSby = id("technician.sby@oscilla.example");
if (!manager || !tech) { console.error("demo users not found; run seed-demo-users.mjs first"); process.exit(1); }

const { data: assets } = await admin.from("assets").select("id, org_id, warehouse_id, serial_number, name");
const bySerial = Object.fromEntries(assets.map((a) => [a.serial_number, a]));

const plan = [
  { serial: "FK-2024-0002", by: manager, to: tech, due: at(1), summary: "Replace the front wheel motor bearing. Vibration at the bearing defect frequency is well above baseline and still rising." },
  { serial: "FK-2024-0003", by: manager, to: tech, due: at(-1), summary: "Quarterly lubrication of the drive axle (overdue)." },
  { serial: "AGV-2024-0002", by: manager, to: null, due: at(3), summary: "Inspect the drive wheel bearing; the health score has been falling for two weeks." },
  { serial: "DR-2024-0001", by: manager, to: null, due: at(6), summary: "Routine rotor and propeller inspection." },
  { serial: "AGV-2025-0102", by: manager, to: techSby ?? null, due: at(2), summary: "Inspect the drive wheel; score is below the attention threshold." },
];

const warehousesWithOpen = new Set((await admin.from("work_orders").select("warehouse_id").in("status", ["scheduled", "in_progress"])).data.map((w) => w.warehouse_id));
let made = 0;
for (const p of plan) {
  const a = bySerial[p.serial];
  if (!a) { console.log(`  skip ${p.serial} (not found)`); continue; }
  if (warehousesWithOpen.has(a.warehouse_id)) { console.log(`  skip ${p.serial} (warehouse already has open work orders)`); continue; }
  const { data: wo, error } = await admin.from("work_orders").insert({
    asset_id: a.id, org_id: a.org_id, warehouse_id: a.warehouse_id, summary: p.summary, due_at: p.due, created_by: p.by, assigned_to: p.to,
  }).select("id").single();
  if (error) { console.error(`  ${p.serial}: ${error.message}`); continue; }
  await admin.from("journal_entries").insert({ asset_id: a.id, org_id: a.org_id, warehouse_id: a.warehouse_id, author_id: p.by, kind: "schedule", body: `Work order scheduled for ${new Date(p.due).toLocaleDateString("en-GB")}.` });
  made++;
  console.log(`  ${p.serial.padEnd(14)} due ${p.due.slice(0, 10)} ${p.to ? "assigned" : "unassigned"}`);
}
console.log(`created ${made} work orders`);
