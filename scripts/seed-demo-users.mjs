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
  { email: "technician@oscilla.example", name: "Budi Teknisi", role: "technician", warehouse: JKT },
  { email: "viewer@oscilla.example", name: "Vina Viewer", role: "viewer", warehouse: JKT },
  { email: "technician.sby@oscilla.example", name: "Sari Teknisi (Surabaya)", role: "technician", warehouse: SBY },
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
const { count } = await admin.from("journal_entries").select("id", { count: "exact", head: true });
if (!count) {
  const DAY = 86_400_000, now = Date.now();
  const author = ids["technician@oscilla.example"];
  const history = [
    ["Forklift FK-01", 12, "Servis berkala 250 jam: ganti oli hidrolik, cek rantai mast."],
    ["Forklift FK-02", 41, "Pelumasan roda depan. Teknisi mencatat getaran sedikit tinggi, pantau."],
    ["Forklift FK-03", 20, "Ganti filter hidrolik."],
    ["AGV Robot R1", 9, "Kalibrasi sensor lidar dan roda."],
    ["AGV Robot R2", 33, "Update firmware navigasi v2.4."],
    ["AGV Robot R3", 15, "Ganti sikat roda penggerak."],
    ["Scan Drone D1", 7, "Ganti baling-baling dan kalibrasi gimbal."],
    ["Scan Drone D2", 26, "Tes kapasitas baterai: 91%."],
  ];
  const { data: assets } = await admin.from("assets").select("id,name,org_id,warehouse_id").eq("warehouse_id", JKT);
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
} else {
  console.log("journal already has data, skipped history");
}
