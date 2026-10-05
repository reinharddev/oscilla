import { z } from "zod";
import type { Backend, Proposal, ToolContext } from "./types";

const ref = z.string().min(1).max(80).describe("Machine name, serial number, or short code such as FK-02. Use 'selected' for the machine the user has open.");

export interface ToolResult { ok: boolean; data: unknown; summary: string; proposal?: Proposal }
export interface ToolDef {
  name: string;
  description: string;
  schema: z.ZodObject;
  run: (b: Backend, args: never, ctx: ToolContext) => Promise<ToolResult>;
}

async function find(b: Backend, r: string, ctx: ToolContext) {
  const wanted = r.trim().toLowerCase();
  const key = ["selected", "this", "ini", "mesin ini"].includes(wanted) && ctx.selectedAssetId ? ctx.selectedAssetId : r;
  return b.resolve(key);
}
const notFound = (r: Extract<Awaited<ReturnType<typeof find>>, { ok: false }>): ToolResult => ({
  ok: false,
  data: { error: r.reason, candidates: r.candidates },
  summary: r.reason === "ambiguous" ? `nama ambigu (${r.candidates.slice(0, 3).join(", ")})` : "mesin tidak ditemukan atau tidak boleh diakses",
});

const defs = {
  list_assets: {
    description: "List machines the user can see with their latest health score and status. Filter by status ('problem' means attention or critical) or type.",
    schema: z.object({
      status: z.enum(["healthy", "attention", "critical", "problem"]).optional(),
      type: z.enum(["forklift", "agv", "drone", "conveyor", "robot_arm"]).optional(),
      limit: z.number().int().min(1).max(30).optional(),
    }),
    async run(b: Backend, a: { status?: "healthy" | "attention" | "critical" | "problem"; type?: string; limit?: number }): Promise<ToolResult> {
      const rows = await b.listAssets({ status: a.status, type: a.type, limit: a.limit ?? 30 });
      return { ok: true, data: { count: rows.length, machines: rows }, summary: `${rows.length} mesin` };
    },
  },
  get_asset_health: {
    description: "Latest health score, status, the vibration evidence behind it, recent score trend, last service age and schedule for one machine.",
    schema: z.object({ asset: ref }),
    async run(b: Backend, a: { asset: string }, ctx: ToolContext): Promise<ToolResult> {
      const r = await find(b, a.asset, ctx);
      if (!r.ok) return notFound(r);
      const h = await b.health(r.asset.id);
      if (!h) return { ok: false, data: { error: "no_data" }, summary: "belum ada data kesehatan" };
      return { ok: true, data: h, summary: `${r.asset.name}: skor ${h.brief.score ?? "-"}` };
    },
  },
  get_journal: {
    description: "Most recent journal entries (service notes, schedules, repairs) of one machine.",
    schema: z.object({ asset: ref, limit: z.number().int().min(1).max(10).optional() }),
    async run(b: Backend, a: { asset: string; limit?: number }, ctx: ToolContext): Promise<ToolResult> {
      const r = await find(b, a.asset, ctx);
      if (!r.ok) return notFound(r);
      const rows = await b.journal(r.asset.id, a.limit ?? 5);
      return { ok: true, data: { asset: r.asset.name, entries: rows }, summary: `${rows.length} entri jurnal ${r.asset.name}` };
    },
  },
  list_work_orders: {
    description: "Maintenance work orders (scheduled, in progress, done), optionally for one machine or one status.",
    schema: z.object({ asset: ref.optional(), status: z.enum(["scheduled", "in_progress", "done", "cancelled"]).optional() }),
    async run(b: Backend, a: { asset?: string; status?: string }, ctx: ToolContext): Promise<ToolResult> {
      let assetId: string | undefined;
      if (a.asset) {
        const r = await find(b, a.asset, ctx);
        if (!r.ok) return notFound(r);
        assetId = r.asset.id;
      }
      const rows = await b.workOrders({ assetId, status: a.status });
      return { ok: true, data: { count: rows.length, workOrders: rows }, summary: `${rows.length} work order` };
    },
  },
  search_manuals: {
    description: "Search the maintenance manuals for procedures. Optionally restrict to the type of one machine.",
    schema: z.object({ query: z.string().min(2).max(200), asset: ref.optional() }),
    async run(b: Backend, a: { query: string; asset?: string }, ctx: ToolContext): Promise<ToolResult> {
      let type: string | undefined;
      if (a.asset) {
        const r = await find(b, a.asset, ctx);
        if (!r.ok) return notFound(r);
        type = r.asset.type;
      }
      const hits = await b.manuals(a.query, type);
      return { ok: true, data: { hits }, summary: `${hits.length} bagian manual` };
    },
  },
  diagnose_asset: {
    description: "Run the Maintenance Copilot for one machine: likely cause, recommended actions with citations, confidence and whether a technician must review.",
    schema: z.object({ asset: ref }),
    async run(b: Backend, a: { asset: string }, ctx: ToolContext): Promise<ToolResult> {
      const r = await find(b, a.asset, ctx);
      if (!r.ok) return notFound(r);
      const c = await b.diagnose(r.asset.id);
      if (!c) return { ok: false, data: { error: "no_data" }, summary: "diagnosis tidak tersedia" };
      const data = {
        asset: r.asset.name, summary: c.summary, likelyCause: c.likelyCause,
        recommendations: c.recommendations.map((x) => ({ action: x.action.replace(/\s*\[(?:M|J)\d+\]/g, ""), urgency: x.urgency })),
        confidence: c.confidence.level, reviewRequired: c.review.required, reviewReasons: c.review.reasons,
        sources: c.sources.map((s) => ({ id: s.id, title: s.title, detail: s.detail })),
      };
      return { ok: true, data, summary: `diagnosis ${r.asset.name}` };
    },
  },
  propose_work_order: {
    description: "PROPOSE a maintenance work order. This does not create anything: the user must confirm the proposal. Fails if the user's role may not create work orders for that machine.",
    schema: z.object({
      asset: ref,
      summary: z.string().min(3).max(400).describe("What should be inspected or repaired and why, in Indonesian, using only facts from other tools."),
      due_in_days: z.number().int().min(0).max(30).optional(),
      urgency: z.enum(["immediate", "within_days", "monitor"]).optional(),
    }),
    async run(b: Backend, a: { asset: string; summary: string; due_in_days?: number; urgency?: Proposal["urgency"] }, ctx: ToolContext): Promise<ToolResult> {
      const r = await find(b, a.asset, ctx);
      if (!r.ok) return notFound(r);
      if (!(await b.canWrite(r.asset.id))) {
        return { ok: false, data: { error: "forbidden", message: "Peran pengguna tidak boleh membuat work order untuk mesin ini." }, summary: "ditolak: tidak punya hak" };
      }
      const dueAt = new Date(ctx.now() + (a.due_in_days ?? 1) * 86_400_000).toISOString();
      const proposal: Proposal = {
        id: globalThis.crypto.randomUUID(), kind: "work_order", assetId: r.asset.id, assetName: r.asset.name,
        summary: a.summary, dueAt, urgency: a.urgency ?? "within_days",
      };
      return {
        ok: true,
        data: { proposed: true, requiresUserConfirmation: true, asset: r.asset.name, dueAt, summary: a.summary },
        summary: `usulan work order ${r.asset.name}`,
        proposal,
      };
    },
  },
};

export const TOOLS: ToolDef[] = Object.entries(defs).map(([name, d]) => ({ name, ...d })) as unknown as ToolDef[];
export const TOOL_BY_NAME = new Map(TOOLS.map((t) => [t.name, t]));

/** OpenAI-style tool specs, generated from the same schemas that validate the arguments. */
export function toolSpecs() {
  return TOOLS.map((t) => {
    const { $schema: _ignored, ...parameters } = z.toJSONSchema(t.schema) as Record<string, unknown>;
    void _ignored;
    return { type: "function" as const, function: { name: t.name, description: t.description, parameters } };
  });
}

/** Validate arguments and run one tool. Never throws: errors become a failed step the model can read. */
export async function executeTool(b: Backend, name: string, rawArgs: unknown, ctx: ToolContext): Promise<ToolResult & { args: unknown }> {
  const tool = TOOL_BY_NAME.get(name);
  if (!tool) return { ok: false, args: rawArgs, data: { error: "unknown_tool", name }, summary: "alat tidak dikenal" };
  const parsed = tool.schema.safeParse(rawArgs ?? {});
  if (!parsed.success) return { ok: false, args: rawArgs, data: { error: "invalid_arguments", issues: parsed.error.issues.slice(0, 3).map((i) => i.message) }, summary: "argumen tidak valid" };
  try {
    return { ...(await tool.run(b, parsed.data as never, ctx)), args: parsed.data };
  } catch (e) {
    return { ok: false, args: parsed.data, data: { error: "tool_failed", message: (e as Error).message }, summary: "alat gagal dijalankan" };
  }
}
