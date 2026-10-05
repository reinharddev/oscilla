// Writes supabase/layouts/*.json into warehouses.layout (service role).
//   node --env-file=.env.local scripts/seed-layouts.mjs
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const files = { "b0000000-0000-4000-8000-000000000001": "jakarta-dc", "b0000000-0000-4000-8000-000000000002": "surabaya-hub" };
for (const [id, name] of Object.entries(files)) {
  const layout = JSON.parse(readFileSync(new URL(`../supabase/layouts/${name}.json`, import.meta.url), "utf8"));
  const { error } = await admin.from("warehouses").update({ layout }).eq("id", id);
  if (error) throw new Error(`${name}: ${error.message}`);
  console.log(`ok  ${name}: ${layout.entities.length} entities, ${layout.zones.length} zones`);
}
