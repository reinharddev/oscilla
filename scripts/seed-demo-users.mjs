// Creates the demo accounts and a believable service history.
//   node --env-file=.env.local scripts/seed-demo-users.mjs
// Idempotent: existing users are reused. The shared demo password is generated once and
// stored in .env.local as DEMO_PASSWORD (never printed, never committed).
import { randomBytes } from "node:crypto";
import { appendFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY;
if (!url || !secret) throw new Error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY in .env.local");

let password = process.env.DEMO_PASSWORD;
if (!password) {
  password = randomBytes(15).toString("base64url");
  appendFileSync(".env.local", `\nDEMO_PASSWORD=${password}\n`);
  console.log("Generated DEMO_PASSWORD and saved it to .env.local");
}

const admin = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
const ORG = "a0000000-0000-4000-8000-000000000001";
const JKT = "b0000000-0000-4000-8000-000000000001";
const SBY = "b0000000-0000-4000-8000-000000000002";

const USERS = [
  { email: "admin@oscilla.example", name: "Dina Admin", role: "admin", warehouse: null },
  { email: "manager@oscilla.example", name: "Made Manager", role: "manager", warehouse: JKT },
  { email: "technician@oscilla.example", name: "Budi Technician", role: "technician", warehouse: JKT },
  { email: "viewer@oscilla.example", name: "Vina Viewer", role: "viewer", warehouse: JKT },
  { email: "technician2@oscilla.example", name: "Agus Teknisi", role: "technician", warehouse: JKT },
  { email: "technician3@oscilla.example", name: "Rina Teknisi", role: "technician", warehouse: JKT },
  { email: "technician4@oscilla.example", name: "Dewi Teknisi", role: "technician", warehouse: JKT },
  { email: "technician5@oscilla.example", name: "Hendra Teknisi", role: "technician", warehouse: JKT },
  { email: "technician6@oscilla.example", name: "Siti Teknisi", role: "technician", warehouse: JKT },
  { email: "technician7@oscilla.example", name: "Yoga Teknisi", role: "technician", warehouse: JKT },
  { email: "technician8@oscilla.example", name: "Putri Teknisi", role: "technician", warehouse: JKT },
  { email: "technician9@oscilla.example", name: "Rudi Teknisi", role: "technician", warehouse: JKT },
  { email: "technician10@oscilla.example", name: "Wulan Teknisi", role: "technician", warehouse: JKT },
  { email: "technician.sby@oscilla.example", name: "Sari Technician (Surabaya)", role: "technician", warehouse: SBY },
];

const ids = {};
const { data: existing, error: listErr } = await admin.auth.admin.listUsers({ perPage: 200 });
if (listErr) throw listErr;
for (const u of USERS) {
  let user = existing.users.find((x) => x.email === u.email);
  if (!user) {
    const { data, error } = await admin.auth.admin.createUser({
      email: u.email, password, email_confirm: true, user_metadata: { full_name: u.name },
    });
    if (error) throw new Error(`createUser ${u.email}: ${error.message}`);
    user = data.user;
  } else {
    await admin.auth.admin.updateUserById(user.id, { password });
  }
  ids[u.email] = user.id;
  await admin.from("profiles").upsert({ id: user.id, org_id: ORG, full_name: u.name });
  const { data: has } = await admin.from("memberships").select("id").eq("user_id", user.id).eq("role", u.role);
  if (!has?.length) {
    const { error } = await admin.from("memberships").insert({ user_id: user.id, org_id: ORG, warehouse_id: u.warehouse, role: u.role });
    if (error) throw new Error(`membership ${u.email}: ${error.message}`);
  }
  console.log(`ok  ${u.role.padEnd(10)} ${u.email}`);
}

// Service history, written with the service role so timestamps can be in the past.
const DAY = 86_400_000, now = Date.now();
async function seedHistory(warehouseId, authorEmail, history) {
  const { count } = await admin.from("journal_entries").select("id", { count: "exact", head: true }).eq("warehouse_id", warehouseId);
  if (count) { console.log(`journal for ${warehouseId.slice(-1)} already has data, skipped history`); return; }
  const author = ids[authorEmail];
  const { data: assets } = await admin.from("assets").select("id,name,org_id,warehouse_id").eq("warehouse_id", warehouseId);
  for (const [name, ago, text] of history) {
    const a = assets.find((x) => x.name === name);
    if (!a) throw new Error(`asset not found: ${name}`);
    const at = new Date(now - ago * DAY).toISOString();
    const { error: e1 } = await admin.from("work_orders").insert({
      asset_id: a.id, org_id: a.org_id, warehouse_id: a.warehouse_id, status: "done", summary: text,
      created_by: author, completed_at: at, started_at: at, due_at: at, created_at: at,
    });
    const { error: e2 } = await admin.from("journal_entries").insert({
      asset_id: a.id, org_id: a.org_id, warehouse_id: a.warehouse_id, author_id: author, kind: "done", body: text, created_at: at,
    });
    if (e1 || e2) throw new Error((e1 ?? e2).message);
  }
  console.log(`ok  seeded ${history.length} service history entries`);
}

if (process.argv.includes("--reset-history")) {
  await admin.from("journal_entries").delete().eq("org_id", ORG);
  await admin.from("work_orders").delete().eq("org_id", ORG);
  console.log("ok  cleared journal entries and work orders of the demo organization");
}

await seedHistory(JKT, "technician@oscilla.example", [
  ["Forklift FK-01", 12, "250-hour service: replaced hydraulic oil, checked the mast chain."],
  ["Forklift FK-02", 41, "Lubricated the front wheel. Technician noted slightly high vibration, keep monitoring."],
  ["Forklift FK-03", 20, "Replaced the hydraulic filter."],
  ["AGV Robot R1", 9, "Calibrated the lidar sensor and wheels."],
  ["AGV Robot R2", 33, "Updated navigation firmware to v2.4."],
  ["AGV Robot R3", 15, "Replaced the drive wheel brush."],
  ["Scan Drone D1", 7, "Replaced the propellers and calibrated the gimbal."],
  ["Scan Drone D2", 26, "Battery capacity test: 91%."],
]);
await seedHistory(SBY, "technician.sby@oscilla.example", [
  ["AGV S1", 10, "Calibrated the collision sensor and replaced the rear wheel."],
  ["AGV S2", 38, "Replaced the left drive motor. Vibration still slightly high, keep monitoring."],
  ["AGV S3", 18, "Updated navigation firmware and tested the route."],
  ["AGV S4", 22, "Routine service: lubrication and bolt tightening."],
  ["Forklift S-FK1", 14, "250-hour service and air filter replacement."],
  ["Scan Drone S-D1", 9, "Battery test and camera calibration."],
  ["Sorter Belt 1", 30, "Replaced the roller bearing on roller 12 and adjusted belt tension."],
  ["Sorter Belt 2", 17, "Lubricated the drive chain and checked the belt."],
]);
