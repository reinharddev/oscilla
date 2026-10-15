import { NextResponse } from "next/server";
import manuals from "@/knowledge/manuals.json";
import { runAgent, type ChatTurn } from "@/lib/agent";
import { supabaseBackend } from "@/lib/agent/backend-supabase";
import { getLang } from "@/lib/i18n/server";
import type { ManualChunk } from "@/lib/copilot/types";
import { createClient } from "@/lib/supabase/server";
import { getAuthUser } from "@/lib/server/auth";
import { freshenSimulated } from "@/lib/server/fleet-health";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Per-instance limiter so one user cannot run up the model bill.
const hits = new Map<string, number[]>();
function limited(userId: string): boolean {
  const now = Date.now();
  const recent = (hits.get(userId) ?? []).filter((t) => now - t < 60_000);
  recent.push(now);
  hits.set(userId, recent);
  return recent.length > 12;
}

function endpointHost(): string | undefined {
  try { return process.env.LLM_BASE_URL ? new URL(process.env.LLM_BASE_URL).host : undefined; } catch { return undefined; }
}

function llmConfig() {
  const baseUrl = process.env.LLM_BASE_URL;
  if (!baseUrl) return null;
  return { baseUrl, apiKey: process.env.LLM_API_KEY, model: process.env.LLM_MODEL ?? "default", timeoutMs: 30_000, reasoningEffort: process.env.LLM_REASONING_EFFORT || undefined };
}

/**
 * Question-and-answer agent with tools.
 * Every tool runs with the caller's own permissions (row-level security) and the agent can only
 * propose changes; the browser asks the user to confirm before anything is written.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const user = await getAuthUser(supabase);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (limited(user.id)) return NextResponse.json({ error: "too many requests" }, { status: 429 });

  let body: { question?: unknown; history?: unknown; selectedAssetId?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid json" }, { status: 400 }); }
  const question = typeof body.question === "string" ? body.question.trim() : "";
  if (question.length < 2 || question.length > 500) return NextResponse.json({ error: "question must be 2-500 characters" }, { status: 400 });

  const history: ChatTurn[] = Array.isArray(body.history)
    ? body.history.slice(-6).flatMap((h: unknown) => {
        const t = h as Partial<ChatTurn>;
        return (t.role === "user" || t.role === "assistant") && typeof t.content === "string" ? [{ role: t.role, content: t.content.slice(0, 1500) }] : [];
      })
    : [];
  const selected = typeof body.selectedAssetId === "string" && UUID.test(body.selectedAssetId) ? body.selectedAssetId : null;

  const lang = await getLang();
  await freshenSimulated(supabase, {});
  const llm = llmConfig();
  const backend = supabaseBackend(supabase, user.id, manuals as ManualChunk[], llm, lang);
  const result = await runAgent({ question, history, backend, llm, selectedAssetId: selected, lang });
  const reply = { ...result, llmConfigured: Boolean(llm), endpoint: endpointHost() };
  // History is a convenience: a failed write must not lose the answer the user is waiting for.
  const at = Date.now();
  await supabase.from("agent_messages").insert([
    { user_id: user.id, role: "user", content: question, created_at: new Date(at - 1).toISOString() },
    { user_id: user.id, role: "assistant", content: result.answer, reply, created_at: new Date(at).toISOString() },
  ]);
  return NextResponse.json(reply);
}

/** The signed-in user's recent conversation. Row-level security limits it to their own rows. */
export async function GET() {
  const supabase = await createClient();
  const user = await getAuthUser(supabase);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { data, error } = await supabase
    .from("agent_messages").select("id,role,content,reply,created_at").order("created_at", { ascending: false }).limit(40);
  if (error) return NextResponse.json({ error: "read failed" }, { status: 500 });
  return NextResponse.json({ messages: (data ?? []).reverse() });
}

export async function DELETE() {
  const supabase = await createClient();
  const user = await getAuthUser(supabase);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { error } = await supabase.from("agent_messages").delete().eq("user_id", user.id);
  if (error) return NextResponse.json({ error: "delete failed" }, { status: 500 });
  return NextResponse.json({ ok: true });
}
