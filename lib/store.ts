import { create } from "zustand";
import { toast } from "sonner";
import type { Theme } from "./theme";
import { createClient } from "./supabase/client";
import { MAX_SAMPLES, type AnalyzeSample, type LlmSample } from "./bench";
import type { Health, HealthStatus, Machine, MachineType } from "./health";
import type { AssetHealth } from "./server/fleet-health";
import { statusKey } from "./health";
import { fmtDateTime, LOCALE_COOKIE, renderMsg, makeT, translate, type Key, type Lang, type MsgParams } from "./i18n";
import { DEFAULT_VIEW, type Role, type ViewId } from "./roles";

export interface Selected { id: string; type: MachineType; label: string }
export interface LogEvent { id: number; at: number; kind: "info" | "success" | "warn"; key: Key; params?: MsgParams }
export type { Role } from "./roles";
export interface AuthInfo { userId: string; email: string; name: string; role: Role; orgName: string; warehouseName: string; warehouseId: string }
export interface Schedule { due: number | null; lastDone: number | null; inProgress: boolean; workOrderId?: string }
export interface JournalEntry { id: string; ts: number; kind: "note" | "alert" | "schedule" | "start" | "done"; text: string; author?: string; key?: Key; params?: MsgParams }
export interface WorkOrder {
  id: string; asset_id: string; status: "scheduled" | "in_progress" | "done" | "cancelled";
  summary?: string; due_at: string | null; started_at?: string | null; completed_at: string | null; created_at?: string;
  diagnosis_feedback?: "correct" | "incorrect" | null;
  assigned_to?: string | null;
}
export interface Person { user_id: string; full_name: string; role: Role }
export interface Member { id: string; user_id: string; role: Role; warehouse_id: string | null; full_name: string }
export interface AuditRow { id: number; created_at: string; actor_id: string | null; action: string; entity: string; entity_id: string | null; warehouse_id: string | null; details: Record<string, unknown> }
export interface BaselineRow { asset_id: string; learned_at: string; n_windows: number | null; model_version: string }
export interface OrgWarehouse { id: string; name: string; machines: number; critical: number; attention: number; healthy: number; openOrders: number; overdue: number; avgScore: number | null; lastReadingAt: string | null }
export interface DemoState {
  open: boolean;
  active: boolean;
  step: number;
  targetId: string | null;
  scores: { baseline?: number; peak?: number; after?: number };
  skipped: boolean;
  dueAt?: number;
  /** Damage level the machine had before the demo touched it, so exiting can put it back. */
  restore?: number | null;
}
export type UiTab = "overview" | "machine" | "agent" | "fleet" | null;
export interface HydrateInput {
  locale: Lang;
  auth: AuthInfo;
  names: Record<string, string>;
  warehouses: { id: string; name: string }[];
  assets: { id: string; name: string; serial_number: string; type: MachineType; org_id: string; warehouse_id: string }[];
  journal: { id: string; asset_id: string; author_id: string; kind: JournalEntry["kind"]; body: string; created_at: string }[];
  workOrders: WorkOrder[];
  health: AssetHealth[];
  /** Filled according to the role: people to assign, members, audit trail, baselines, org summary. */
  people: Person[];
  members: Member[];
  audit: AuditRow[];
  baselines: BaselineRow[];
  org: OrgWarehouse[];
}

export const canWrite = (a: AuthInfo | null) => a?.role === "admin" || a?.role === "manager" || a?.role === "technician";

let eventId = 1;

const toHealth = (h: AssetHealth): Health => ({
  score: h.score, status: h.status, evidence: h.evidence, modelVersion: h.modelVersion, source: h.source,
  takenAt: Date.parse(h.takenAt), vib: h.vib, temp: h.temp, cur: h.cur, rulDays: h.rulDays, hist: h.hist,
});

function schedulesFrom(orders: WorkOrder[], assetIds: string[]): Record<string, Schedule> {
  const out: Record<string, Schedule> = {};
  for (const id of assetIds) {
    const mine = orders.filter((w) => w.asset_id === id);
    const open = mine.find((w) => w.status === "in_progress");
    const planned = mine.filter((w) => w.status === "scheduled" && w.due_at).sort((x, y) => Date.parse(x.due_at!) - Date.parse(y.due_at!))[0];
    const done = mine.filter((w) => w.status === "done" && w.completed_at).map((w) => Date.parse(w.completed_at!));
    out[id] = {
      due: planned?.due_at ? Date.parse(planned.due_at) : null,
      lastDone: done.length ? Math.max(...done) : null,
      inProgress: Boolean(open),
      workOrderId: open?.id ?? planned?.id,
    };
  }
  return out;
}

interface State {
  theme: Theme;
  locale: Lang;
  selected: Selected | null;
  events: LogEvent[];
  health: Record<string, Health>;
  schedules: Record<string, Schedule>;
  workOrders: WorkOrder[];
  journal: Record<string, JournalEntry[]>;
  auth: AuthInfo | null;
  machines: Machine[];
  warehouses: { id: string; name: string }[];
  assetMeta: Record<string, { org_id: string; warehouse_id: string }>;
  names: Record<string, string>;
  people: Person[];
  members: Member[];
  audit: AuditRow[];
  baselines: BaselineRow[];
  org: OrgWarehouse[];
  view: ViewId;
  setView: (v: ViewId) => void;
  assignWorkOrder: (workOrderId: string, userId: string | null) => Promise<void>;
  setMemberRole: (membershipId: string, role: Role) => Promise<void>;

  /** State of the data feed: "ok" after a successful read, "error" after a failed one. */
  feed: "idle" | "ok" | "error";
  feedAt: number | null;
  pollNonce: number;
  requestPoll: () => void;
  requestTab: { tab: UiTab; n: number } | null;
  showTab: (tab: UiTab) => void;
  copilotRequest: { id: string; n: number } | null;
  requestCopilot: (id: string) => void;
  copilotReplies: Record<string, unknown>;
  demo: DemoState;
  bench: { llm: LlmSample[]; analyze: AnalyzeSample[] };
  recordLlm: (s: LlmSample) => void;
  recordAnalyze: (s: AnalyzeSample) => void;
  clearBench: () => void;
  setDemo: (p: Partial<DemoState>) => void;
  demoPrepare: () => Promise<void>;
  demoReset: () => Promise<void>;
  setSimulated: (id: string, severity: number) => Promise<number | null | undefined>;
  applyHealth: (list: AssetHealth[], ok: boolean) => void;

  hydrate: (init: HydrateInput) => void;
  scheduleMaintenance: (id: string, due: number, extra?: { summary?: string; aiDiagnosis?: unknown }) => Promise<void>;
  startMaintenance: (id: string) => Promise<void>;
  completeMaintenance: (id: string, note: string, feedback?: "correct" | "incorrect") => Promise<void>;
  addNote: (id: string, text: string) => Promise<void>;

  setTheme: (t: Theme) => void;
  setLocale: (l: Lang) => void;
  select: (s: Selected | null) => void;
  log: (kind: LogEvent["kind"], key: Key, params?: MsgParams) => void;
}

type Get = () => State;
type Set = (p: Partial<State> | ((s: State) => Partial<State>)) => void;

const toEntry = (j: HydrateInput["journal"][number], names: Record<string, string>): JournalEntry => ({
  id: j.id, ts: Date.parse(j.created_at), kind: j.kind, text: j.body, author: names[j.author_id],
});

/** Insert a journal row (RLS decides whether this user may) and show it locally. */
async function addEntry(get: Get, set: Set, id: string, kind: JournalEntry["kind"], text: string) {
  const s = get();
  const meta = s.assetMeta[id];
  if (!meta) return;
  const { data, error } = await createClient()
    .from("journal_entries")
    .insert({ asset_id: id, ...meta, kind, body: text })
    .select("id, created_at, author_id")
    .single();
  if (error) { get().log("warn", "log.journalFail", { msg: error.message }); return; }
  const entry: JournalEntry = { id: data.id, ts: Date.parse(data.created_at), kind, text, author: s.auth?.name };
  set((st) => ({ journal: { ...st.journal, [id]: [entry, ...(st.journal[id] ?? [])] } }));
}

const idleDemo: DemoState = { open: false, active: false, step: 0, targetId: null, scores: {}, skipped: false };

export const useStore = create<State>((set, get) => ({
  theme: "night",
  locale: "en",
  selected: null,
  events: [],
  health: {},
  schedules: {},
  workOrders: [],
  journal: {},
  auth: null,
  machines: [],
  warehouses: [],
  assetMeta: {},
  names: {},
  people: [], members: [], audit: [], baselines: [], org: [],
  view: "machines",
  feed: "idle",
  feedAt: null,
  pollNonce: 0,
  requestTab: null,
  copilotRequest: null,
  copilotReplies: {},
  demo: idleDemo,
  bench: { llm: [], analyze: [] },

  hydrate: (init) => {
    const machines: Machine[] = init.assets.map((a) => ({ id: a.id, label: a.name, type: a.type, serial: a.serial_number }));
    const assetMeta: Record<string, { org_id: string; warehouse_id: string }> = {};
    const journal: Record<string, JournalEntry[]> = {};
    for (const a of init.assets) {
      assetMeta[a.id] = { org_id: a.org_id, warehouse_id: a.warehouse_id };
      journal[a.id] = init.journal.filter((j) => j.asset_id === a.id).map((j) => toEntry(j, init.names)).sort((x, y) => y.ts - x.ts);
    }
    const health: Record<string, Health> = {};
    for (const h of init.health) health[h.assetId] = toHealth(h);
    set({
      locale: init.locale, auth: init.auth, warehouses: init.warehouses, machines, assetMeta, journal, names: init.names,
      people: init.people, members: init.members, audit: init.audit, baselines: init.baselines, org: init.org,
      view: DEFAULT_VIEW[init.auth.role],
      workOrders: init.workOrders, schedules: schedulesFrom(init.workOrders, init.assets.map((a) => a.id)),
      health, feed: init.health.length ? "ok" : "idle", feedAt: init.health.length ? Date.now() : null,
      selected: null, events: [],
    });
  },

  setView: (view) => set({ view }),

  assignWorkOrder: async (workOrderId, userId) => {
    const { error } = await createClient().from("work_orders").update({ assigned_to: userId }).eq("id", workOrderId);
    if (error) { get().log("warn", "log.assignFail", { msg: error.message }); return; }
    set((st) => ({ workOrders: st.workOrders.map((w) => (w.id === workOrderId ? { ...w, assigned_to: userId } : w)) }));
  },

  setMemberRole: async (membershipId, role) => {
    const { error } = await createClient().from("memberships").update({ role }).eq("id", membershipId);
    if (error) { get().log("warn", "log.roleFail", { msg: error.message }); return; }
    set((st) => ({ members: st.members.map((m) => (m.id === membershipId ? { ...m, role } : m)) }));
  },

  requestPoll: () => set((s) => ({ pollNonce: s.pollNonce + 1 })),
  showTab: (tab) => set((s) => ({ requestTab: { tab, n: (s.requestTab?.n ?? 0) + 1 } })),
  requestCopilot: (id) => set((s) => ({ copilotRequest: { id, n: (s.copilotRequest?.n ?? 0) + 1 } })),
  recordLlm: (sample) => set((s) => ({ bench: { ...s.bench, llm: [...s.bench.llm, sample].slice(-MAX_SAMPLES) } })),
  recordAnalyze: (sample) => set((s) => ({ bench: { ...s.bench, analyze: [...s.bench.analyze, sample].slice(-MAX_SAMPLES) } })),
  clearBench: () => set({ bench: { llm: [], analyze: [] } }),
  setDemo: (p) => set((s) => ({ demo: { ...s.demo, ...p } })),

  /** Dummy-data mode: set a machine's damage level on the server and take the new reading. */
  setSimulated: async (id, severity) => {
    try {
      const res = await fetch("/api/sim/fault", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ assetId: id, severity }) });
      if (!res.ok) return undefined;
      const data = (await res.json()) as { previous: number | null; health: AssetHealth | null };
      if (data.health) get().applyHealth([data.health], true);
      return data.previous;
    } catch {
      return undefined;
    }
  },

  /** The guided demo follows the machine that is currently worst, taken back to a healthy level. */
  demoPrepare: async () => {
    const s = get();
    const target = [...s.machines].sort((a, b) => (s.health[a.id]?.score ?? 100) - (s.health[b.id]?.score ?? 100))[0];
    if (!target) return;
    set({
      view: "machines",
      demo: { open: true, active: true, step: 1, targetId: target.id, scores: {}, skipped: false, restore: undefined },
      selected: { id: target.id, type: target.type, label: target.label },
      copilotReplies: {}, copilotRequest: null,
    });
    if (canWrite(s.auth)) {
      const previous = await get().setSimulated(target.id, 0.03);
      get().setDemo({ restore: previous ?? null });
    }
  },
  demoReset: async () => {
    const { demo } = get();
    set({ demo: idleDemo, copilotReplies: {}, copilotRequest: null });
    // Put the machine back where it was unless the demo already repaired it.
    if (demo.targetId && demo.restore !== undefined && demo.restore !== null && demo.step < 6) await get().setSimulated(demo.targetId, demo.restore);
  },

  applyHealth: (list, ok) =>
    set((st) => {
      if (!ok) return { feed: "error" as const };
      const health = { ...st.health };
      const alerts: { label: string; status: HealthStatus }[] = [];
      for (const raw of list) {
        const next = toHealth(raw);
        const prev = health[raw.assetId];
        if (prev && prev.status !== next.status && next.status !== "healthy" && !st.schedules[raw.assetId]?.inProgress) {
          alerts.push({ label: st.machines.find((m) => m.id === raw.assetId)?.label ?? raw.assetId, status: next.status });
        }
        health[raw.assetId] = next;
      }
      queueMicrotask(() => alerts.forEach((a) => get().log("warn", "log.statusAnalysis", { name: a.label, status: { k: statusKey(a.status) } })));
      return { health, feed: "ok" as const, feedAt: Date.now() };
    }),

  scheduleMaintenance: async (id, due, extra) => {
    const s = get();
    const meta = s.assetMeta[id];
    if (!meta) return;
    const summary = (extra?.summary ?? translate(get().locale, "wo.scheduledDefault")).slice(0, 2000);
    const { data, error } = await createClient()
      .from("work_orders")
      .insert({ asset_id: id, ...meta, summary, due_at: new Date(due).toISOString(), ai_diagnosis: extra?.aiDiagnosis ?? null })
      .select("id, created_at")
      .single();
    if (error) { get().log("warn", "log.scheduleFail", { msg: error.message }); return; }
    set((st) => {
      const workOrders = [...st.workOrders, { id: data.id, asset_id: id, status: "scheduled" as const, summary, due_at: new Date(due).toISOString(), completed_at: null, created_at: data.created_at }];
      return { workOrders, schedules: { ...st.schedules, [id]: { ...st.schedules[id], due, workOrderId: data.id } } };
    });
    await addEntry(get, set, id, "schedule", translate(get().locale, "journal.scheduled", { date: fmtDateTime(due, get().locale) }));
  },

  startMaintenance: async (id) => {
    const s = get();
    const meta = s.assetMeta[id];
    if (!meta) return;
    const sb = createClient();
    const now = new Date().toISOString();
    let workOrderId = s.schedules[id].workOrderId;
    if (workOrderId) {
      const { error } = await sb.from("work_orders").update({ status: "in_progress", started_at: now }).eq("id", workOrderId);
      if (error) { get().log("warn", "log.startFail", { msg: error.message }); return; }
      set((st) => ({ workOrders: st.workOrders.map((w) => (w.id === workOrderId ? { ...w, status: "in_progress" as const, started_at: now } : w)) }));
    } else {
      const summary = translate(get().locale, "wo.startedDefault");
      const { data, error } = await sb
        .from("work_orders")
        .insert({ asset_id: id, ...meta, status: "in_progress", started_at: now, summary })
        .select("id")
        .single();
      if (error) { get().log("warn", "log.startFail", { msg: error.message }); return; }
      workOrderId = data.id as string;
      const created = workOrderId;
      set((st) => ({ workOrders: [...st.workOrders, { id: created, asset_id: id, status: "in_progress" as const, summary, due_at: null, started_at: now, completed_at: null, created_at: now }] }));
    }
    set((st) => ({ schedules: { ...st.schedules, [id]: { ...st.schedules[id], inProgress: true, workOrderId } } }));
    await addEntry(get, set, id, "start", translate(get().locale, "journal.started"));
    get().log("info", "log.maintStart", { name: get().machines.find((m) => m.id === id)?.label ?? id });
  },

  completeMaintenance: async (id, note, feedback) => {
    const s = get();
    const workOrderId = s.schedules[id].workOrderId;
    const text = note.trim() || translate(get().locale, "journal.finishedDefault");
    const completedAt = new Date().toISOString();
    if (workOrderId) {
      const { error } = await createClient()
        .from("work_orders")
        .update({ status: "done", completed_at: completedAt, ...(feedback ? { diagnosis_feedback: feedback } : {}) })
        .eq("id", workOrderId);
      if (error) { get().log("warn", "log.finishFail", { msg: error.message }); return; }
    }
    set((st) => ({
      workOrders: st.workOrders.map((w) => (w.id === workOrderId ? { ...w, status: "done" as const, completed_at: completedAt, diagnosis_feedback: feedback ?? null } : w)),
      schedules: { ...st.schedules, [id]: { due: null, lastDone: Date.now(), inProgress: false } },
    }));
    await addEntry(get, set, id, "done", text);
    get().log("success", "log.maintDone", { name: get().machines.find((m) => m.id === id)?.label ?? id });
    // Dummy sensors report the repaired machine on the next read; ask for it now.
    get().requestPoll();
  },

  addNote: async (id, text) => {
    if (!text.trim()) return;
    await addEntry(get, set, id, "note", text.trim());
  },

  setTheme: (theme) => {
    document.documentElement.classList.toggle("dark", theme === "night");
    try { localStorage.setItem("wt-theme", theme); } catch {}
    set({ theme });
  },
  setLocale: (locale) => {
    document.documentElement.lang = locale;
    document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=31536000; samesite=lax`;
    set({ locale });
  },
  select: (selected) => set({ selected }),

  log: (kind, key, params) => {
    set((s) => ({ events: [{ id: eventId++, at: Date.now(), kind, key, params }, ...s.events].slice(0, 30) }));
    // Failures are shown right away, not only in the activity list.
    if (kind === "warn" && /Fail$/.test(key)) toast.error(renderMsg(makeT(get().locale), key, params));
  },
}));
