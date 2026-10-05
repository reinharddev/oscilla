// Layout data checks. Run: node --test tests/layouts.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { LayoutSchema } from "../lib/layout-schema.ts";

const seed = readFileSync(new URL("../supabase/seed.sql", import.meta.url), "utf8");
const load = (n) => JSON.parse(readFileSync(new URL(`../supabase/layouts/${n}.json`, import.meta.url), "utf8"));
const WAREHOUSES = {
  "jakarta-dc": "b0000000-0000-4000-8000-000000000001",
  "surabaya-hub": "b0000000-0000-4000-8000-000000000002",
};

/** Serial numbers seeded for one warehouse, read from seed.sql. */
function seededSerials(warehouseId) {
  return [...seed.matchAll(new RegExp(`'${warehouseId}', '([A-Z]+-\\d{4}-\\d{4})'`, "g"))].map((m) => m[1]);
}

for (const [name, wh] of Object.entries(WAREHOUSES)) {
  test(`${name}: layout passes the schema`, () => {
    const r = LayoutSchema.safeParse(load(name));
    assert.ok(r.success, r.success ? "" : JSON.stringify(r.error.issues[0]));
  });

  test(`${name}: every seeded asset appears in the scene exactly once`, () => {
    const layout = load(name);
    const linked = [...layout.entities.map((e) => e.serial), ...layout.conveyors.map((c) => c.serial)].filter(Boolean);
    const seeded = seededSerials(wh);
    assert.ok(seeded.length > 0);
    assert.deepEqual([...linked].sort(), [...seeded].sort());
  });

  test(`${name}: entity ids are unique and routes stay on the floor`, () => {
    const layout = load(name);
    const keys = layout.entities.map((e) => e.serial ?? e.id);
    assert.equal(new Set(keys).size, keys.length);
    const { x0, x1, z0, z1 } = layout.floor;
    for (const e of layout.entities) {
      const m = e.motion;
      if (m.kind === "rect") {
        assert.ok(m.x0 < m.x1 && m.z0 < m.z1, `${keys} rect bounds`);
        assert.ok(m.x0 >= x0 && m.x1 <= x1 && m.z0 >= z0 && m.z1 <= z1, `${e.serial ?? e.id} leaves the floor`);
      }
      if (m.kind === "lissajous") assert.ok(m.cx - m.ax >= x0 - 1 && m.cx + m.ax <= x1 + 1, `${e.serial} drone range`);
    }
  });

  test(`${name}: each truck parks at a dock bay`, () => {
    const layout = load(name);
    const trucks = layout.entities.filter((e) => e.motion.kind === "truck");
    for (const t of trucks) assert.ok(layout.dock.bays.includes(t.motion.bayZ), `${t.id} bay`);
    assert.equal(new Set(trucks.map((t) => t.motion.bayZ)).size, trucks.length, "two trucks share a bay");
  });
}

test("the two warehouses really differ", () => {
  const a = load("jakarta-dc"), b = load("surabaya-hub");
  assert.notEqual(a.racks.length, b.racks.length);
  assert.notEqual(a.dock.bays.length, b.dock.bays.length);
  assert.ok(b.conveyors.every((c) => c.serial) && a.conveyors.every((c) => !c.serial));
});
