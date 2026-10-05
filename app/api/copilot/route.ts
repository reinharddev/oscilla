import { NextResponse } from "next/server";
import manuals from "@/knowledge/manuals.json";
import { runCopilot, type JournalSnippet } from "@/lib/copilot";
import type { Facts, ManualChunk } from "@/lib/copilot/types";
import { featureLabel, LIMIT, type Evidence } from "@/lib/health";
import { createClient } from "@/lib/supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SNAPSHOT_MAX_AGE_MS = 15 * 60_000;
const DAY = 86_400_000;

// Small per-instance limiter so one user cannot run up the model bill.
const hits = new Map<string, number[]>();
function limited(userId: string): boolean {
  const now = Date.now();
  const recent = (hits.get(userId) ?? []).filter((t) => now - t < 60_000);
  recent.push(now);
  hits.set(userId, recent);
  return recent.length > 10;
}

function llmConfig() {
  const baseUrl = process.env.LLM_BASE_URL;
  if (!baseUrl) return null;
  return { baseUrl, apiKey: process.env.LLM_API_KEY, model: process.env.LLM_MODEL ?? "default", timeoutMs: 30_000 };
}

/**
 * Maintenance Copilot. Facts come from the database under the caller's own permissions
 * (row-level security), never from the browser, so a user cannot make the Copilot talk about
 * a machine they are not allowed to see or feed it invented sensor values.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (limited(user.id)) return NextResponse.json({ error: "too many requests" }, { status: 429 });

  let assetId: unknown;
  try { assetId = ((await request.json()) as { assetId?: unknown }).assetId; } catch { /* handled below */ }
  if (typeof assetId !== "string" || !UUID.test(assetId)) return NextResponse.json({ error: "assetId (uuid) required" }, { status: 400 });

  const { data: asset } = await supabase
    .from("assets")
    .select("id, name, serial_number, type, manufacturer, model")
    .eq("id", assetId)
    .maybeSingle();
  if (!asset) return NextResponse.json({ error: "not found" }, { status: 404 });

  const [snap, jr, wo, prof] = await Promise.all([
    supabase.from("health_snapshots").select("score, status, evidence, model_version, taken_at").eq("asset_id", assetId).order("taken_at", { ascending: false }).limit(1),
    supabase.from("journal_entries").select("author_id, kind, body, created_at").eq("asset_id", assetId).order("created_at", { ascending: false }).limit(6),
    supabase.from("work_orders").select("status, due_at, completed_at").eq("asset_id", assetId),
    supabase.from("profiles").select("id, full_name"),
  ]);
  const names = new Map((prof.data ?? []).map((p) => [p.id as string, p.full_name as string]));

  const s = snap.data?.[0];
  const fresh = s && Date.now() - Date.parse(s.taken_at) < SNAPSHOT_MAX_AGE_MS;
  const health: Facts["health"] = fresh
    ? {
        score: Math.round(Number(s.score)),
        status: s.status,
        evidence: ((s.evidence ?? []) as Evidence[]).map((e) => ({ ...e, labelId: featureLabel(e) })),
        modelVersion: s.model_version ?? "unknown",
        takenAt: s.taken_at,
      }
    : null;

  const done = (wo.data ?? []).filter((w) => w.status === "done" && w.completed_at).map((w) => Date.parse(w.completed_at));
  const planned = (wo.data ?? []).filter((w) => w.status === "scheduled" && w.due_at).map((w) => w.due_at as string).sort()[0] ?? null;
  const facts: Facts = {
    machine: { name: asset.name, serial: asset.serial_number, type: asset.type, manufacturer: asset.manufacturer, model: asset.model },
    health,
    lastServiceDays: done.length ? Math.floor((Date.now() - Math.max(...done)) / DAY) : null,
    scheduledFor: planned,
    limits: { vibration: LIMIT.vib, temperature: LIMIT.temp, current: LIMIT.cur },
  };

  const journal: JournalSnippet[] = (jr.data ?? [])
    .filter((j) => j.kind !== "alert") // simulated alerts are not evidence
    .map((j) => ({
      when: new Date(j.created_at).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" }),
      author: names.get(j.author_id),
      kind: j.kind,
      text: j.body,
    }));

  const llm = llmConfig();
  const result = await runCopilot({ facts, manuals: manuals as ManualChunk[], journal, llm });
  return NextResponse.json({ ...result, machine: asset.name, llmConfigured: Boolean(llm), snapshotAt: health?.takenAt ?? null });
}
