import type { SupabaseClient } from "@supabase/supabase-js";
import { featureLabel, LIMIT, type Evidence } from "../health";
import type { JournalSnippet } from "./index";
import type { Facts } from "./types";

const SNAPSHOT_MAX_AGE_MS = 15 * 60_000;
const DAY = 86_400_000;

export interface LoadedAsset {
  facts: Facts;
  journal: JournalSnippet[];
  asset: { id: string; name: string; serial_number: string; type: string; warehouse_id: string };
}

/**
 * Loads everything the Copilot may talk about for one machine. Runs with the caller's own
 * Supabase client, so row-level security decides what exists: an asset the user cannot see
 * simply comes back as null.
 */
export async function loadCopilotInputs(supabase: SupabaseClient, assetId: string): Promise<LoadedAsset | null> {
  const { data: asset } = await supabase
    .from("assets")
    .select("id, name, serial_number, type, manufacturer, model, warehouse_id")
    .eq("id", assetId)
    .maybeSingle();
  if (!asset) return null;

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

  return { facts, journal, asset };
}
