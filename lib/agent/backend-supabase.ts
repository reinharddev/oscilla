import type { SupabaseClient } from "@supabase/supabase-js";
import { runCopilot } from "../copilot";
import { loadCopilotInputs } from "../copilot/load";
import type { LlmConfig } from "../copilot/llm";
import { searchManuals } from "../copilot/retrieve";
import type { ManualChunk } from "../copilot/types";
import { featureLabel, type Evidence } from "../health";
import { dateLocale, makeT, type Lang } from "../i18n";
import { findAsset } from "./rules";
import type { AssetBrief, Backend, HealthDetail, Status } from "./types";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SNAPSHOT_MAX_AGE_MS = 15 * 60_000;
const DAY = 86_400_000;

/**
 * Agent backend over the signed-in user's own Supabase client. Because every query goes through
 * row-level security, the agent can never read or reach more than its user can.
 * It has no write methods by design.
 */
export function supabaseBackend(supabase: SupabaseClient, userId: string, manuals: ManualChunk[], llm: LlmConfig | null, lang: Lang = "en"): Backend {
  const t = makeT(lang);
  async function briefs(filter: { type?: string; ids?: string[] } = {}): Promise<AssetBrief[]> {
    let q = supabase.from("assets").select("id, name, serial_number, type, warehouse_id, warehouses ( name )").order("name");
    if (filter.type) q = q.eq("type", filter.type);
    if (filter.ids) q = q.in("id", filter.ids);
    const { data: assets } = await q;
    const rows = assets ?? [];
    if (rows.length === 0) return [];
    const ids = rows.map((a) => a.id as string);
    const [snaps, orders] = await Promise.all([
      Promise.all(ids.map((id) => supabase.from("health_snapshots").select("asset_id, score, status, taken_at").eq("asset_id", id).order("taken_at", { ascending: false }).limit(1))),
      supabase.from("work_orders").select("asset_id, status, due_at, completed_at").in("asset_id", ids),
    ]);
    const latest = new Map(snaps.map((r) => r.data?.[0]).filter(Boolean).map((s) => [s!.asset_id as string, s!]));
    return rows.map((a) => {
      const s = latest.get(a.id);
      const fresh = s && Date.now() - Date.parse(s.taken_at) < SNAPSHOT_MAX_AGE_MS;
      const mine = (orders.data ?? []).filter((w) => w.asset_id === a.id);
      const done = mine.filter((w) => w.status === "done" && w.completed_at).map((w) => Date.parse(w.completed_at));
      const planned = mine.filter((w) => w.status === "scheduled" && w.due_at).map((w) => w.due_at as string).sort()[0] ?? null;
      const wh = Array.isArray(a.warehouses) ? a.warehouses[0] : a.warehouses;
      return {
        id: a.id, name: a.name, serial: a.serial_number, type: a.type, warehouse: wh?.name ?? "",
        score: fresh ? Math.round(Number(s.score)) : null,
        status: fresh ? (s.status as Status) : null,
        lastServiceDays: done.length ? Math.floor((Date.now() - Math.max(...done)) / DAY) : null,
        scheduledFor: planned,
      };
    });
  }

  return {
    async listAssets({ status, type, limit }) {
      const all = await briefs({ type });
      const keep = all.filter((a) => (status === undefined ? true : status === "problem" ? a.status === "attention" || a.status === "critical" : a.status === status));
      return keep.sort((a, b) => (a.score ?? 101) - (b.score ?? 101)).slice(0, limit);
    },

    async resolve(ref) {
      if (UUID.test(ref)) {
        const one = (await briefs({ ids: [ref] }))[0];
        return one ? { ok: true, asset: { id: one.id, name: one.name, serial: one.serial, type: one.type } } : { ok: false, reason: "not_found", candidates: [] };
      }
      const all = await briefs();
      const m = findAsset(ref, all);
      if (m.asset) return { ok: true, asset: { id: m.asset.id, name: m.asset.name, serial: m.asset.serial, type: m.asset.type } };
      if (m.ambiguous) return { ok: false, reason: "ambiguous", candidates: m.ambiguous.map((a) => a.name) };
      return { ok: false, reason: "not_found", candidates: [] };
    },

    async health(assetId): Promise<HealthDetail | null> {
      const brief = (await briefs({ ids: [assetId] }))[0];
      if (!brief) return null;
      const { data: snaps } = await supabase.from("health_snapshots").select("score, evidence, model_version, taken_at").eq("asset_id", assetId).order("taken_at", { ascending: false }).limit(6);
      const latest = snaps?.[0];
      return {
        brief,
        evidence: ((latest?.evidence ?? []) as Evidence[]).map((e) => ({ label: featureLabel(e, t), value: e.value, baseline: e.baseline, z_score: e.z_score })),
        recentScores: (snaps ?? []).map((s) => Math.round(Number(s.score))),
        modelVersion: latest?.model_version ?? null,
        snapshotAgeMin: latest ? Math.round((Date.now() - Date.parse(latest.taken_at)) / 60_000) : null,
      };
    },

    async journal(assetId, limit) {
      const [jr, prof] = await Promise.all([
        supabase.from("journal_entries").select("author_id, kind, body, created_at").eq("asset_id", assetId).order("created_at", { ascending: false }).limit(limit + 4),
        supabase.from("profiles").select("id, full_name"),
      ]);
      const names = new Map((prof.data ?? []).map((p) => [p.id as string, p.full_name as string]));
      return (jr.data ?? []).filter((j) => j.kind !== "alert").slice(0, limit).map((j) => ({
        when: new Date(j.created_at).toLocaleDateString(dateLocale(lang), { day: "numeric", month: "short", year: "numeric" }),
        author: names.get(j.author_id), kind: j.kind, text: j.body,
      }));
    },

    async workOrders({ assetId, status }) {
      let q = supabase.from("work_orders").select("status, due_at, completed_at, summary, assets ( name )").order("created_at", { ascending: false }).limit(20);
      if (assetId) q = q.eq("asset_id", assetId);
      if (status) q = q.eq("status", status);
      const { data } = await q;
      return (data ?? []).map((w) => {
        const a = Array.isArray(w.assets) ? w.assets[0] : w.assets;
        return { asset: a?.name ?? "", status: w.status, dueAt: w.due_at, completedAt: w.completed_at, summary: w.summary };
      });
    },

    async manuals(query, type) {
      return searchManuals(manuals, query, type ?? null, 3).map((h, i) => ({ id: `M${i + 1}`, title: h.chunk.docTitle, detail: `${t("src.page", { n: h.chunk.page })} · ${h.chunk.section}`, text: h.chunk.text }));
    },

    async diagnose(assetId) {
      const loaded = await loadCopilotInputs(supabase, assetId, lang);
      if (!loaded) return null;
      return runCopilot({ facts: loaded.facts, manuals, journal: loaded.journal, llm, lang });
    },

    async canWrite(assetId) {
      const [{ data: asset }, { data: mem }] = await Promise.all([
        supabase.from("assets").select("warehouse_id").eq("id", assetId).maybeSingle(),
        supabase.from("memberships").select("role, warehouse_id").eq("user_id", userId),
      ]);
      if (!asset) return false;
      return (mem ?? []).some((m) => ["admin", "manager", "technician"].includes(m.role) && (m.warehouse_id === null || m.warehouse_id === asset.warehouse_id));
    },
  };
}
