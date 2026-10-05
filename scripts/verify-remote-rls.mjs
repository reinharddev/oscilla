// Signs in as each demo role against the real project and checks what RLS allows.
//   node --env-file=.env.local scripts/verify-remote-rls.mjs
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const pub = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const secret = process.env.SUPABASE_SECRET_KEY;
const password = process.env.DEMO_PASSWORD;
const mk = (key) => createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

async function login(email) {
  const c = mk(pub);
  const { error } = await c.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`${email}: ${error.message}`);
  return c;
}
let pass = 0, fail = 0;
const check = async (name, fn) => {
  try { await fn(); pass++; console.log("ok   ", name); }
  catch (e) { fail++; console.log("FAIL ", name, "-", e.message.split("\n")[0]); }
};

const admin = await login("admin@oscilla.example");
const manager = await login("manager@oscilla.example");
const tech = await login("technician@oscilla.example");
const viewer = await login("viewer@oscilla.example");
const techSby = await login("technician.sby@oscilla.example");
const anon = mk(pub);

const jakartaAsset = (await mk(secret).from("assets").select("id,org_id,warehouse_id").eq("name", "Forklift FK-01").single()).data;
const entry = (author) => ({ asset_id: jakartaAsset.id, org_id: jakartaAsset.org_id, warehouse_id: jakartaAsset.warehouse_id, body: "RLS verification entry", ...(author ? { author_id: author } : {}) });

await check("anonymous visitors read nothing", async () => {
  const r = await anon.from("assets").select("id");
  assert.ok(r.error || r.data.length === 0);
});
await check("admin sees both warehouses (16 assets)", async () => {
  assert.equal((await admin.from("assets").select("id")).data.length, 16);
});
await check("manager and technician see only Jakarta (8 assets)", async () => {
  assert.equal((await manager.from("assets").select("id")).data.length, 8);
  assert.equal((await tech.from("assets").select("id")).data.length, 8);
});
await check("Surabaya technician sees only Surabaya and no Jakarta data", async () => {
  const a = (await techSby.from("assets").select("id,warehouse_id")).data;
  assert.equal(a.length, 8);
  assert.ok(a.every((x) => x.warehouse_id === "b0000000-0000-4000-8000-000000000002"));
  const j = (await techSby.from("journal_entries").select("warehouse_id")).data;
  assert.ok(j.length > 0 && j.every((x) => x.warehouse_id === "b0000000-0000-4000-8000-000000000002"), "journal must contain only Surabaya entries");
});
await check("viewer can read the journal but cannot write", async () => {
  assert.ok((await viewer.from("journal_entries").select("id")).data.length >= 8);
  const r = await viewer.from("journal_entries").insert(entry());
  assert.ok(r.error, "viewer insert should be rejected");
});
await check("Surabaya technician cannot write to a Jakarta asset", async () => {
  assert.ok((await techSby.from("journal_entries").insert(entry())).error);
});
await check("technician writes as self and cannot forge the author", async () => {
  const ok = await tech.from("journal_entries").insert(entry()).select("author_id").single();
  assert.ok(!ok.error, ok.error?.message);
  const forged = await tech.from("journal_entries").insert(entry("00000000-0000-4000-8000-0000000000aa"));
  assert.ok(forged.error, "forged author should be rejected");
});
await check("journal entries cannot be edited or deleted", async () => {
  const u = await tech.from("journal_entries").update({ body: "tampered" }).eq("body", "RLS verification entry").select();
  assert.ok(u.error || u.data.length === 0);
  const d = await admin.from("journal_entries").delete().eq("body", "RLS verification entry").select();
  assert.ok(d.error || d.data.length === 0);
});
await check("technician cannot change assets or memberships", async () => {
  const u = await tech.from("assets").update({ zone: "HACK" }).eq("id", jakartaAsset.id).select();
  assert.ok(u.error || u.data.length === 0);
  const m = await tech.from("memberships").select("id");
  assert.equal(m.data.length, 1, "technician should only see their own membership");
});
await check("audit log: manager reads, technician does not", async () => {
  assert.ok((await manager.from("audit_log").select("id").limit(1)).data.length > 0);
  assert.equal((await tech.from("audit_log").select("id")).data.length, 0);
});
await check("health snapshots cannot be written by users", async () => {
  const r = await admin.from("health_snapshots").insert({ asset_id: jakartaAsset.id, org_id: jakartaAsset.org_id, warehouse_id: jakartaAsset.warehouse_id, score: 10, status: "critical" });
  assert.ok(r.error);
});

// Clean up the test entry (service role bypasses RLS).
await mk(secret).from("journal_entries").delete().eq("body", "RLS verification entry");
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
