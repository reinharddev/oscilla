import { NextResponse } from "next/server";
import manuals from "@/knowledge/manuals.json";
import { runCopilot } from "@/lib/copilot";
import type { ManualChunk } from "@/lib/copilot/types";
import { loadCopilotInputs } from "@/lib/copilot/load";
import { getLang } from "@/lib/i18n/server";
import { createClient } from "@/lib/supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Small per-instance limiter so one user cannot run up the model bill.
const hits = new Map<string, number[]>();
function limited(userId: string): boolean {
  const now = Date.now();
  const recent = (hits.get(userId) ?? []).filter((t) => now - t < 60_000);
  recent.push(now);
  hits.set(userId, recent);
  return recent.length > 10;
}

// Same user + same machine + same data within a minute: reuse the answer instead of spending
// another model call (the key is shared and rate limited).
const CACHE_MS = 60_000;
const cache = new Map<string, { at: number; body: unknown }>();

function llmConfig() {
  const baseUrl = process.env.LLM_BASE_URL;
  if (!baseUrl) return null;
  return { baseUrl, apiKey: process.env.LLM_API_KEY, model: process.env.LLM_MODEL ?? "default", timeoutMs: 30_000, reasoningEffort: process.env.LLM_REASONING_EFFORT || undefined };
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

  const lang = await getLang();
  const loaded = await loadCopilotInputs(supabase, assetId, lang);
  if (!loaded) return NextResponse.json({ error: "not found" }, { status: 404 });
  const { facts, journal, asset } = loaded;

  const llm = llmConfig();
  const key = JSON.stringify([user.id, assetId, lang, facts.health?.takenAt ?? null, facts.health?.score ?? null, journal.length]);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return NextResponse.json({ ...(hit.body as object), cached: true });

  const result = await runCopilot({ facts, manuals: manuals as ManualChunk[], journal, llm, lang });
  const body = { ...result, machine: asset.name, llmConfigured: Boolean(llm), snapshotAt: facts.health?.takenAt ?? null };
  if (result.mode === "llm") {
    for (const [k, v] of cache) if (Date.now() - v.at >= CACHE_MS) cache.delete(k);
    cache.set(key, { at: Date.now(), body });
  }
  return NextResponse.json(body);
}
