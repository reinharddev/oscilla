// Integration test against the real Supabase project (skipped when env is missing).
//   npm run test:remote
import { createClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";
import manuals from "../../knowledge/manuals.json";
import type { ManualChunk } from "../copilot/types";
import { supabaseBackend } from "./backend-supabase";
import { runAgent } from "./index";
import { executeTool } from "./tools";
import type { Backend } from "./types";

const env = process.env;
const ready = Boolean(env.NEXT_PUBLIC_SUPABASE_URL && env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY && env.DEMO_PASSWORD);
const JAKARTA = "b0000000-0000-4000-8000-000000000001";
const SURABAYA = "b0000000-0000-4000-8000-000000000002";

async function as(email: string): Promise<Backend> {
  const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await sb.auth.signInWithPassword({ email, password: env.DEMO_PASSWORD! });
  if (error || !data.user) throw new Error(`login ${email}: ${error?.message}`);
  return supabaseBackend(sb, data.user.id, manuals as ManualChunk[], null);
}

describe.skipIf(!ready)("agent backend with real row-level security", () => {
  let admin: Backend, manager: Backend, viewer: Backend, techSby: Backend;
  beforeAll(async () => {
    [admin, manager, viewer, techSby] = await Promise.all([
      as("admin@oscilla.example"), as("manager@oscilla.example"), as("viewer@oscilla.example"), as("technician.sby@oscilla.example"),
    ]);
  }, 30_000);

  it("each role sees only its own scope", async () => {
    expect((await admin.listAssets({ limit: 30 })).length).toBe(16);
    expect((await manager.listAssets({ limit: 30 })).length).toBe(8);
    const sby = await techSby.listAssets({ limit: 30 });
    expect(sby.length).toBe(8);
    expect(sby.every((a) => a.warehouse.includes("Surabaya"))).toBe(true);
  });

  it("the Surabaya technician cannot reach a Jakarta machine by name, serial or id", async () => {
    expect((await techSby.resolve("FK-02")).ok).toBe(false);
    expect((await techSby.resolve("FK-2024-0002")).ok).toBe(false);
    const jakartaId = (await admin.resolve("FK-2024-0002")) as { ok: true; asset: { id: string } };
    expect(jakartaId.ok).toBe(true);
    expect((await techSby.resolve(jakartaId.asset.id)).ok).toBe(false);
    expect(await techSby.health(jakartaId.asset.id)).toBeNull();
    expect(await techSby.journal(jakartaId.asset.id, 5)).toEqual([]);
    expect(await techSby.canWrite(jakartaId.asset.id)).toBe(false);
  });

  it("write permission follows the role", async () => {
    const fk02 = (await admin.resolve("FK-02")) as { ok: true; asset: { id: string } };
    const s1 = (await techSby.resolve("AGV S1")) as { ok: true; asset: { id: string } };
    expect(await admin.canWrite(fk02.asset.id)).toBe(true);
    expect(await manager.canWrite(fk02.asset.id)).toBe(true);
    expect(await viewer.canWrite(fk02.asset.id)).toBe(false);
    expect(await techSby.canWrite(s1.asset.id)).toBe(true);
  });

  it("the agent tools refuse a viewer's proposal and a cross-warehouse question", async () => {
    const now = () => Date.now();
    const lang = "en" as const;
    const p = await executeTool(viewer, "propose_work_order", { asset: "FK-02", summary: "coba" }, { now, lang });
    expect(p.ok).toBe(false);
    expect(p.proposal).toBeUndefined();

    const r = await runAgent({ question: "kenapa FK-02 skornya turun?", backend: techSby, llm: null, now, lang });
    expect(r.answer).toMatch(/tidak ditemukan|tidak punya akses/);
    expect(r.answer).not.toMatch(/Forklift FK-02/);
  });

  it("only warehouse data of the user's own site shows up in answers", async () => {
    const r = await runAgent({ question: "mesin mana yang bermasalah?", backend: techSby, llm: null, now: Date.now, lang: "en" });
    expect(r.answer).not.toMatch(/Forklift FK-0|AGV Robot R/);
  });
});

void JAKARTA; void SURABAYA;
