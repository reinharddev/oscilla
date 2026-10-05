import { NextResponse } from "next/server";
import manuals from "@/knowledge/manuals.json";
import { runCopilot } from "@/lib/copilot";
import type { ManualChunk } from "@/lib/copilot/types";
import { loadCopilotInputs } from "@/lib/copilot/load";
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

  const loaded = await loadCopilotInputs(supabase, assetId);
  if (!loaded) return NextResponse.json({ error: "not found" }, { status: 404 });
  const { facts, journal, asset } = loaded;

  const llm = llmConfig();
  const result = await runCopilot({ facts, manuals: manuals as ManualChunk[], journal, llm });
  return NextResponse.json({ ...result, machine: asset.name, llmConfigured: Boolean(llm), snapshotAt: facts.health?.takenAt ?? null });
}
