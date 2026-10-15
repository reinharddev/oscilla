// Row-level security tests. They run the real migration and seed against an in-process
// Postgres (PGlite), with a stub for Supabase's `auth` schema and roles.
//   node --test supabase/tests/rls.test.mjs
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const root = new URL("../", import.meta.url);
const U = {
  admin: "10000000-0000-4000-8000-000000000001",
  managerA: "10000000-0000-4000-8000-000000000002",
  techA: "10000000-0000-4000-8000-000000000003",
  viewerA: "10000000-0000-4000-8000-000000000004",
  techB: "10000000-0000-4000-8000-000000000005",
  outsider: "10000000-0000-4000-8000-000000000006",
};
const ORG = "a0000000-0000-4000-8000-000000000001";
const WH_A = "b0000000-0000-4000-8000-000000000001";
const WH_B = "b0000000-0000-4000-8000-000000000002";
const OTHER_ORG = "a0000000-0000-4000-8000-000000000002";
const OTHER_WH = "b0000000-0000-4000-8000-000000000003";

let db;
let assetA; // an asset in warehouse A
let assetB; // an asset in warehouse B

async function as(user, sql, params = []) {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${user}', false);`);
  try {
    return await db.query(sql, params);
  } finally {
    await db.exec("reset role");
  }
}
const rejects = (p, re = /./) => assert.rejects(p, re);

before(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
    create schema auth;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable
      as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth to authenticated;
  `);
  for (const f of readdirSync(new URL("migrations/", root)).sort()) {
    await db.exec(readFileSync(new URL(`migrations/${f}`, root), "utf8"));
  }
  await db.exec(readFileSync(new URL("seed.sql", root), "utf8"));
  for (const id of Object.values(U)) await db.query("insert into auth.users (id) values ($1)", [id]);
  await db.query("insert into public.organizations (id, name) values ($1, 'Other Corp')", [OTHER_ORG]);
  await db.query("insert into public.warehouses (id, org_id, name) values ($1, $2, 'Elsewhere')", [OTHER_WH, OTHER_ORG]);
  await db.query(
    `insert into public.memberships (user_id, org_id, warehouse_id, role) values
      ($1, $7, null, 'admin'), ($2, $7, $8, 'manager'), ($3, $7, $8, 'technician'),
      ($4, $7, $8, 'viewer'), ($5, $7, $9, 'technician'), ($6, $10, null, 'admin')`,
    [U.admin, U.managerA, U.techA, U.viewerA, U.techB, U.outsider, ORG, WH_A, WH_B, OTHER_ORG],
  );
  assetA = (await db.query("select id from public.assets where warehouse_id = $1 limit 1", [WH_A])).rows[0].id;
  assetB = (await db.query("select id from public.assets where warehouse_id = $1 limit 1", [WH_B])).rows[0].id;
});

test("seed has two warehouses with different fleets", async () => {
  const r = await db.query(
    "select warehouse_id, type, count(*)::int n from public.assets group by 1, 2 order by 1, 2",
  );
  const a = r.rows.filter((x) => x.warehouse_id === WH_A).map((x) => x.type);
  const b = r.rows.filter((x) => x.warehouse_id === WH_B).map((x) => x.type);
  assert.ok(!a.includes("conveyor") && b.includes("conveyor"));
});

test("a user only sees warehouses they hold a role in", async () => {
  const techA = await as(U.techA, "select id from public.warehouses");
  assert.deepEqual(techA.rows.map((r) => r.id), [WH_A]);
  const admin = await as(U.admin, "select id from public.warehouses");
  assert.equal(admin.rows.length, 2);
});

test("data is isolated between organizations", async () => {
  const out = await as(U.outsider, "select id from public.assets");
  assert.equal(out.rows.length, 0);
  const wh = await as(U.outsider, "select id from public.warehouses");
  assert.deepEqual(wh.rows.map((r) => r.id), [OTHER_WH]);
  const mine = await as(U.admin, "select id from public.warehouses where id = $1", [OTHER_WH]);
  assert.equal(mine.rows.length, 0);
});

test("viewer can read but not write", async () => {
  assert.ok((await as(U.viewerA, "select id from public.assets")).rows.length > 0);
  await rejects(
    as(U.viewerA,
      "insert into public.journal_entries (asset_id, org_id, warehouse_id, body) select id, org_id, warehouse_id, 'x' from public.assets where id = $1",
      [assetA]),
    /row-level security/,
  );
  const upd = await as(U.viewerA, "update public.assets set zone = 'Z' where id = $1 returning id", [assetA]);
  assert.equal(upd.rows.length, 0);
});

test("technician writes journal entries as themselves and cannot spoof the author", async () => {
  const ok = await as(U.techA,
    "insert into public.journal_entries (asset_id, org_id, warehouse_id, body) select id, org_id, warehouse_id, 'Replaced bearing' from public.assets where id = $1 returning author_id",
    [assetA]);
  assert.equal(ok.rows[0].author_id, U.techA);
  await rejects(
    as(U.techA,
      "insert into public.journal_entries (asset_id, org_id, warehouse_id, author_id, body) select id, org_id, warehouse_id, $2, 'forged' from public.assets where id = $1",
      [assetA, U.managerA]),
    /row-level security/,
  );
});

test("journal is append-only", async () => {
  await rejects(as(U.techA, "update public.journal_entries set body = 'edited'"), /permission denied/);
  await rejects(as(U.admin, "delete from public.journal_entries"), /permission denied/);
});

test("technician cannot touch another warehouse", async () => {
  assert.equal((await as(U.techA, "select id from public.assets where id = $1", [assetB])).rows.length, 0);
  // Explicit values: an INSERT ... SELECT would silently insert nothing because the row is invisible.
  await rejects(
    as(U.techA,
      "insert into public.journal_entries (asset_id, org_id, warehouse_id, body) values ($1, $2, $3, 'x')",
      [assetB, ORG, WH_B]),
    /row-level security/,
  );
  await rejects(
    as(U.techA,
      "insert into public.work_orders (asset_id, org_id, warehouse_id, summary) values ($1, $2, $3, 'x')",
      [assetB, ORG, WH_B]),
    /row-level security/,
  );
});

test("technician cannot manage assets or users", async () => {
  const upd = await as(U.techA, "update public.assets set zone = 'Z' where id = $1 returning id", [assetA]);
  assert.equal(upd.rows.length, 0);
  await rejects(
    as(U.techA, "insert into public.memberships (user_id, org_id, warehouse_id, role) values ($1, $2, null, 'admin')", [U.techA, ORG]),
    /row-level security|admin_is_org_wide|violates/,
  );
});

test("manager edits assets in their warehouse only", async () => {
  const ok = await as(U.managerA, "update public.assets set zone = 'Z9' where id = $1 returning zone", [assetA]);
  assert.equal(ok.rows[0].zone, "Z9");
  const no = await as(U.managerA, "update public.assets set zone = 'Z9' where id = $1 returning id", [assetB]);
  assert.equal(no.rows.length, 0);
});

test("work orders: technician creates, viewer cannot, creator cannot be forged", async () => {
  const q = `insert into public.work_orders (asset_id, org_id, warehouse_id, summary) select id, org_id, warehouse_id, 'Check bearing' from public.assets where id = $1 returning id, created_by`;
  const ok = await as(U.techA, q, [assetA]);
  assert.equal(ok.rows[0].created_by, U.techA);
  await rejects(as(U.viewerA, q, [assetA]), /row-level security/);
  await rejects(
    as(U.techA,
      "insert into public.work_orders (asset_id, org_id, warehouse_id, summary, created_by) select id, org_id, warehouse_id, 'x', $2 from public.assets where id = $1",
      [assetA, U.admin]),
    /row-level security/,
  );
  const fb = await as(U.techA, "update public.work_orders set diagnosis_feedback = 'correct', status = 'done' where id = $1 returning status", [ok.rows[0].id]);
  assert.equal(fb.rows[0].status, "done");
});

test("only admins manage memberships", async () => {
  const mine = await as(U.techA, "select id from public.memberships");
  assert.equal(mine.rows.length, 1);
  const all = await as(U.admin, "select id from public.memberships");
  assert.ok(all.rows.length >= 5);
  const esc = await as(U.managerA, "update public.memberships set role = 'admin' where user_id = $1 returning id", [U.managerA]);
  assert.equal(esc.rows.length, 0);
});

test("audit log records changes and is readable by managers only", async () => {
  assert.ok((await as(U.managerA, "select id from public.audit_log where warehouse_id = $1", [WH_A])).rows.length > 0);
  assert.equal((await as(U.techA, "select id from public.audit_log")).rows.length, 0);
  await rejects(as(U.admin, "insert into public.audit_log (org_id, action, entity) values ($1, 'x', 'y')", [ORG]), /permission denied/);
  await rejects(as(U.admin, "delete from public.audit_log"), /permission denied/);
});

test("health snapshots are written by the ingest service only", async () => {
  await rejects(
    as(U.admin,
      "insert into public.health_snapshots (asset_id, org_id, warehouse_id, score, status) select id, org_id, warehouse_id, 90, 'healthy' from public.assets where id = $1",
      [assetA]),
    /permission denied/,
  );
  await db.exec("set role service_role");
  await db.query(
    "insert into public.health_snapshots (asset_id, org_id, warehouse_id, score, status) select id, org_id, warehouse_id, 41, 'critical' from public.assets where id = $1",
    [assetA],
  );
  await db.exec("reset role");
  assert.equal((await as(U.viewerA, "select score from public.health_snapshots")).rows[0].score, "41");
  assert.equal((await as(U.techB, "select score from public.health_snapshots")).rows.length, 0);
});

test("learned baselines are readable inside the warehouse and never writable by users", async () => {
  await db.exec("set role service_role");
  await db.query(
    "insert into public.asset_baselines (asset_id, org_id, warehouse_id, model_version, payload) select id, org_id, warehouse_id, 'baseline-v0', '{}' from public.assets where id = $1",
    [assetA],
  );
  await db.exec("reset role");
  assert.equal((await as(U.techA, "select asset_id from public.asset_baselines")).rows.length, 1);
  assert.equal((await as(U.techB, "select asset_id from public.asset_baselines")).rows.length, 0);
  await rejects(as(U.admin, "update public.asset_baselines set model_version = 'x'"), /permission denied/);
  await rejects(as(U.admin, "delete from public.asset_baselines"), /permission denied/);
});

test("simulator state is invisible to every user", async () => {
  await db.exec("set role service_role");
  await db.query("insert into public.sim_state (asset_id, severity, rate_per_day) values ($1, 0.7, 0.02)", [assetA]);
  await db.exec("reset role");
  await rejects(as(U.admin, "select * from public.sim_state"), /permission denied/);
  await rejects(as(U.techA, "update public.sim_state set severity = 0"), /permission denied/);
});

test("finishing a work order resets the simulated damage (the machine was repaired)", async () => {
  const { rows: [wo] } = await as(U.techA,
    "insert into public.work_orders (asset_id, org_id, warehouse_id, summary) select id, org_id, warehouse_id, 'replace bearing' from public.assets where id = $1 returning id",
    [assetA]);
  await as(U.techA, "update public.work_orders set status = 'in_progress' where id = $1", [wo.id]);
  assert.equal(Number((await db.query("select severity from public.sim_state where asset_id = $1", [assetA])).rows[0].severity), 0.7);
  await as(U.techA, "update public.work_orders set status = 'done', completed_at = now() where id = $1", [wo.id]);
  const after = (await db.query("select severity, rate_per_day from public.sim_state where asset_id = $1", [assetA])).rows[0];
  assert.equal(Number(after.severity), 0.02);
  assert.ok(Number(after.rate_per_day) <= 0.004);
});

test("assignment: technicians take tasks for themselves only, leads assign anyone in the warehouse", async () => {
  const { rows: [wo] } = await as(U.managerA,
    "insert into public.work_orders (asset_id, org_id, warehouse_id, summary) select id, org_id, warehouse_id, 'check brakes' from public.assets where id = $1 returning id",
    [assetA]);
  // A technician cannot hand a task to a colleague, but can take it.
  await rejects(as(U.techA, "update public.work_orders set assigned_to = $1 where id = $2", [U.managerA, wo.id]), /assignment_not_allowed/);
  await as(U.techA, "update public.work_orders set assigned_to = $1 where id = $2", [U.techA, wo.id]);
  // ... and give it back, but not release someone else's.
  await as(U.techA, "update public.work_orders set assigned_to = null where id = $1", [wo.id]);
  // A manager can assign a technician of this warehouse, but not someone from another warehouse or org.
  await as(U.managerA, "update public.work_orders set assigned_to = $1 where id = $2", [U.techA, wo.id]);
  await rejects(as(U.managerA, "update public.work_orders set assigned_to = $1 where id = $2", [U.managerA, wo.id]), /assignee_not_in_warehouse/);
  await rejects(as(U.managerA, "update public.work_orders set assigned_to = $1 where id = $2", [U.techB, wo.id]), /assignee_not_in_warehouse/);
  await rejects(as(U.managerA, "update public.work_orders set assigned_to = $1 where id = $2", [U.outsider, wo.id]), /assignee_not_in_warehouse/);
});

test("people list: managers and admins see who can be assigned; technicians and viewers do not", async () => {
  const names = async (u) => (await as(u, "select user_id from public.warehouse_people($1)", [WH_A])).rows.map((r) => r.user_id);
  const lead = await names(U.managerA);
  assert.ok(lead.includes(U.techA) && lead.includes(U.managerA) && lead.includes(U.admin));
  assert.ok(!lead.includes(U.techB), "a technician of another warehouse is not assignable here");
  assert.deepEqual(await names(U.techA), []);
  assert.deepEqual(await names(U.viewerA), []);
  assert.deepEqual(await names(U.outsider), []);
});

test("health_history returns recent readings per machine and respects row-level security", async () => {
  await db.exec("set role service_role");
  for (let i = 0; i < 5; i++) {
    await db.query(
      "insert into public.health_snapshots (asset_id, org_id, warehouse_id, score, status, taken_at) select id, org_id, warehouse_id, $2, 'healthy', now() - ($3 || ' minutes')::interval from public.assets where id = $1",
      [assetA, 90 - i, String(i * 10)],
    );
  }
  await db.exec("reset role");
  const mine = await as(U.techA, "select score from public.health_history($1::uuid[], 3)", [[assetA]]);
  assert.equal(mine.rows.length, 3, "limited to the last 3 readings");
  const other = await as(U.techB, "select score from public.health_history($1::uuid[], 3)", [[assetA]]);
  assert.equal(other.rows.length, 0, "another warehouse sees nothing");
});

test("claim_sim_ticks hands each due machine to one caller and is service-only", async () => {
  await rejects(as(U.admin, "select * from public.claim_sim_ticks($1::uuid[], now())", [[assetA]]), /permission denied/);
  await db.exec("set role service_role");
  await db.query("update public.sim_state set last_tick_at = 'epoch' where asset_id = $1", [assetA]);
  const first = await db.query("select * from public.claim_sim_ticks($1::uuid[], now() - interval '30 seconds')", [[assetA, assetB]]);
  const second = await db.query("select * from public.claim_sim_ticks($1::uuid[], now() - interval '30 seconds')", [[assetA, assetB]]);
  await db.exec("reset role");
  assert.ok(first.rows.some((r) => r.asset_id === assetA));
  assert.ok(first.rows.some((r) => r.asset_id === assetB), "a machine without state is created and claimed");
  assert.equal(second.rows.length, 0, "nothing is due right after a claim");
});

test("integrity: a child row cannot point at a warehouse from another organization", async () => {
  await assert.rejects(
    db.query("insert into public.assets (org_id, warehouse_id, serial_number, name, type) values ($1, $2, 'BAD-1', 'x', 'agv')", [ORG, OTHER_WH]),
    /foreign key|violates/,
  );
});

test("integrity: admins must be organization-wide", async () => {
  await assert.rejects(
    db.query("insert into public.memberships (user_id, org_id, warehouse_id, role) values ($1, $2, $3, 'admin')", [U.techB, ORG, WH_B]),
    /admin_is_org_wide|check/,
  );
});

test("anonymous users see nothing", async () => {
  await db.exec("set role anon");
  await assert.rejects(db.query("select * from public.assets"), /permission denied/);
  await db.exec("reset role");
});

test("assistant chat history is private to its author", async () => {
  await as(U.techA, "insert into public.agent_messages (role, content) values ('user', 'hello')");
  const own = await as(U.techA, "select id from public.agent_messages");
  const other = await as(U.managerA, "select id from public.agent_messages");
  assert.equal(own.rows.length, 1);
  assert.equal(other.rows.length, 0);
  await assert.rejects(
    as(U.managerA, "insert into public.agent_messages (user_id, role, content) values ($1, 'user', 'spoof')", [U.techA]),
    /row-level security/,
  );
  await as(U.managerA, "delete from public.agent_messages");
  assert.equal((await as(U.techA, "select id from public.agent_messages")).rows.length, 1);
});

test("alerts: confirmed by two readings, escalate, close after two healthy readings, scoped to the warehouse, acknowledged by writers", async () => {
  await db.exec("set role service_role");
  const snap = (status, score) => db.query(
    "insert into public.health_snapshots (asset_id, org_id, warehouse_id, score, status, evidence) values ($1, $2, $3, $4, $5, '[{\"label\":\"Bearing energy\"}]'::jsonb)",
    [assetA, ORG, WH_A, score, status]);
  const active = async (kind = "health") =>
    (await db.query("select severity, status, headline from public.alerts where asset_id = $1 and kind = $2 and status <> 'resolved'", [assetA, kind])).rows;
  await db.query("delete from public.alerts where asset_id = $1", [assetA]);

  await snap("healthy", 95);
  await snap("attention", 60); // one noisy reading is not an alert
  assert.deepEqual(await active(), []);
  await snap("healthy", 94);
  await snap("attention", 61);
  await snap("attention", 58); // second consecutive
  assert.deepEqual(await active(), [{ severity: "attention", status: "open", headline: "Bearing energy" }]);
  await db.exec("reset role");

  // Someone who can write acknowledges; a viewer and a technician of another warehouse cannot, and cannot even see it.
  const id = (await as(U.techA, "select id from public.alerts where asset_id = $1", [assetA])).rows[0].id;
  await rejects(as(U.viewerA, "select public.acknowledge_alert($1)", [id]), /not_allowed/);
  await rejects(as(U.techB, "select public.acknowledge_alert($1)", [id]), /not_allowed/);
  assert.equal((await as(U.techB, "select id from public.alerts where asset_id = $1", [assetA])).rows.length, 0);
  await as(U.techA, "select public.acknowledge_alert($1)", [id]);
  assert.equal((await as(U.viewerA, "select status from public.alerts where id = $1", [id])).rows[0].status, "acknowledged");

  // A single critical reading does not escalate; two consecutive do, and that re-opens it.
  await db.exec("set role service_role");
  await snap("critical", 30);
  assert.deepEqual(await active(), [{ severity: "attention", status: "acknowledged", headline: "Bearing energy" }]);
  await snap("critical", 28);
  assert.deepEqual(await active(), [{ severity: "critical", status: "open", headline: "Bearing energy" }]);

  // One healthy reading does not close it; two do.
  await snap("healthy", 96);
  assert.equal((await active()).length, 1);
  await snap("healthy", 97);
  assert.deepEqual(await active(), []);
  await db.exec("reset role");
});

test("data-quality alerts coexist with health alerts and close when readings arrive again", async () => {
  await db.exec("set role service_role");
  await db.query("delete from public.alerts where asset_id = $1", [assetA]);
  await db.query(
    "insert into public.alerts (org_id, warehouse_id, asset_id, severity, score, headline, kind) values ($1, $2, $3, 'attention', 0, 'flatline', 'data_quality')",
    [ORG, WH_A, assetA]);
  // Only one active alert of each kind per machine.
  await assert.rejects(db.query(
    "insert into public.alerts (org_id, warehouse_id, asset_id, severity, score, headline, kind) values ($1, $2, $3, 'attention', 0, 'clipping', 'data_quality')",
    [ORG, WH_A, assetA]), /duplicate key|unique/);
  await db.query("insert into public.health_snapshots (asset_id, org_id, warehouse_id, score, status) values ($1, $2, $3, 96, 'healthy')", [assetA, ORG, WH_A]);
  assert.equal((await db.query("select count(*)::int n from public.alerts where asset_id = $1 and status <> 'resolved'", [assetA])).rows[0].n, 0);
  await db.exec("reset role");
});
