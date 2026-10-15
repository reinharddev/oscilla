import { create } from "zustand";
import type { EntityType } from "./layout";
import type { WarehouseLayout } from "./layout-schema";
import type { Theme } from "./theme";
import { createClient } from "./supabase/client";
import { MAX_SAMPLES, type AnalyzeSample, type LlmSample } from "./bench";
import { Evidence, Health, Machine, readings, scoreOf, seedHealth, statusOf, statusKey, faultKey } from "./health";
import { fmtDateTime, LOCALE_COOKIE, translate, type Key, type Lang, type MsgParams } from "./i18n";

export interface Selected { id: string; type: EntityType; label: string }
export interface EntityInfo { id: string; label: string; type: EntityType }
export interface LogEvent { id: number; at: number; kind: "info" | "success" | "warn" ; key: Key; params?: MsgParams }
export interface Order { id: string; customer: string; items: number; status: "Picking" | "Packed" | "Shipped" }
export type Role = "admin" | "manager" | "technician" | "viewer";
export interface AuthInfo { userId: string; email: string; name: string; role: Role; orgName: string; warehouseName: string; warehouseId: string }
export interface Schedule { due: number | null; lastDone: number | null; inProgress: boolean; workOrderId?: string }
export interface JournalEntry { id: string; ts: number; kind: "note" | "alert" | "schedule" | "start" | "done"; text: string; author?: string; key?: Key; params?: MsgParams }
export interface DemoState {
  open: boolean;
  active: boolean;
  step: number;
  targetId: string | null;
  scores: { baseline?: number; peak?: number; after?: number };
  skipped: boolean;
  dueAt?: number;
}
export type UiTab = "overview" | "machine" | "agent" | "fleet" | null;
export interface HydrateInput {
  locale: Lang;
  auth: AuthInfo;
  names: Record<string, string>;
  warehouses: { id: string; name: string }[];
  layout: WarehouseLayout;
  assets: { id: string; name: string; serial_number: string; type: EntityType; org_id: string; warehouse_id: string }[];
  journal: { id: string; asset_id: string; author_id: string; kind: JournalEntry["kind"]; body: string; created_at: string }[];
  workOrders: { id: string; asset_id: string; status: string; due_at: string | null; completed_at: string | null }[];
}

export type AnalysisResult =
  | { assetId: string; score: number; status: "healthy" | "attention" | "critical"; evidence: Evidence[]; modelVersion: string; source: string }
  | { assetId: string; error: string };

export const canWrite = (a: AuthInfo | null) => a?.role === "admin" || a?.role === "manager" || a?.role === "technician";
export interface FleetState { battery: number; status: "active" | "charging" }

const CUSTOMERS = ["Tokopedia", "Shopee", "Lazada", "Blibli", "Bukalapak", "JD.ID", "Zalora", "Sociolla"];
let eventId = 1;
let orderSeq = 4820;

interface State {
  speed: number;
  theme: Theme;
  locale: Lang;
  selected: Selected | null;
  ordersToday: number; shipped: number;
  series: number[];
  zones: Record<string, number>;
  fleet: Record<string, FleetState>;
  orders: Order[];
  events: LogEvent[];
  health: Record<string, Health>;
  schedules: Record<string, Schedule>;
  journal: Record<string, JournalEntry[]>;
  auth: AuthInfo | null;
  machines: Machine[];
  entities: EntityInfo[];
  layout: WarehouseLayout | null;
  warehouses: { id: string; name: string }[];
  assetMeta: Record<string, { org_id: string; warehouse_id: string }>;

  analysisStatus: "idle" | "live" | "offline";
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
  demoPrepare: () => void;
  demoReset: () => void;
  setWear: (id: string, wear: number) => void;
  applyAnalyses: (results: AnalysisResult[], serviceUp: boolean) => void;

  hydrate: (init: HydrateInput) => void;
  scheduleMaintenance: (id: string, due: number, extra?: { summary?: string; aiDiagnosis?: unknown }) => Promise<void>;
  startMaintenance: (id: string) => Promise<void>;
  completeMaintenance: (id: string, note: string, feedback?: "correct" | "incorrect") => Promise<void>;
  addNote: (id: string, text: string) => Promise<void>;

  setTheme: (t: Theme) => void;
  setLocale: (l: Lang) => void;
  select: (s: Selected | null) => void;
  log: (kind: LogEvent["kind"], key: Key, params?: MsgParams) => void;
  deliver: () => void;
  pallet: () => void;
  truckServed: (label: string) => void;
  tick: () => void;
}

type Get = () => State;
type Set = (p: Partial<State> | ((s: State) => Partial<State>)) => void;

const toEntry = (j: HydrateInput["journal"][number], names: Record<string, string>): JournalEntry => ({
  id: j.id, ts: Date.parse(j.created_at), kind: j.kind, text: j.body, author: names[j.author_id],
});

/** Insert a journal row (RLS decides whether this user may) and show it locally. */
async function addEntry(get: Get, set: Set, id: string, kind: JournalEntry["kind"], text: string) {
  const s = get();
  const assetId = id;
  const meta = s.assetMeta[assetId];
  if (!meta) return;
  const { data, error } = await createClient()
    .from("journal_entries")
    .insert({ asset_id: assetId, ...meta, kind, body: text })
    .select("id, created_at, author_id")
    .single();
  if (error) { get().log("warn", "log.journalFail", { msg: error.message }); return; }
  const entry: JournalEntry = { id: data.id, ts: Date.parse(data.created_at), kind, text, author: s.auth?.name };
  set((st) => ({ journal: { ...st.journal, [id]: [entry, ...(st.journal[id] ?? [])] } }));
}

export const useStore = create<State>((set, get) => ({
  speed: 1,
  theme: "day",
  locale: "en",
  selected: null,
  ordersToday: 1284, shipped: 1127,
  series: [34, 41, 38, 52, 47, 58, 49, 61, 55, 63, 59, 70, 64, 72, 66, 75, 69, 78, 71, 80, 74, 69, 77, 83, 79, 86, 81, 88, 84, 90],
  zones: {},
  fleet: {},
  orders: [
    { id: "SO-4815", customer: "Shopee", items: 6, status: "Shipped" },
    { id: "SO-4816", customer: "Tokopedia", items: 2, status: "Packed" },
    { id: "SO-4817", customer: "Blibli", items: 9, status: "Packed" },
    { id: "SO-4818", customer: "Lazada", items: 4, status: "Picking" },
    { id: "SO-4819", customer: "Zalora", items: 1, status: "Picking" },
  ],
  events: [],
  health: {},
  schedules: {},
  journal: {},

  auth: null,
  analysisStatus: "idle",
  pollNonce: 0,
  requestTab: null,
  copilotRequest: null,
  copilotReplies: {},
  demo: { open: false, active: false, step: 0, targetId: null, scores: {}, skipped: false },
  bench: { llm: [], analyze: [] },
  machines: [],
  entities: [],
  layout: null,
  warehouses: [],
  assetMeta: {},

  hydrate: (init) => {
    const machines: Machine[] = init.assets.map((a) => ({ id: a.id, label: a.name, type: a.type, serial: a.serial_number }));
    const actors: EntityInfo[] = init.layout.entities
      .filter((e) => !e.serial)
      .map((e) => ({ id: e.id!, label: e.label ?? e.id!, type: e.model }));
    const entities: EntityInfo[] = [...machines.map(({ id, label, type }) => ({ id, label, type })), ...actors];
    const demoWear = Object.fromEntries(
      init.layout.entities.filter((e) => e.serial && e.demoWear !== undefined).map((e) => [e.serial!, e.demoWear!]),
    );
    const assetMeta: Record<string, { org_id: string; warehouse_id: string }> = {};
    const journal: Record<string, JournalEntry[]> = {};
    const schedules: Record<string, Schedule> = {};
    for (const a of init.assets) {
      assetMeta[a.id] = { org_id: a.org_id, warehouse_id: a.warehouse_id };
      journal[a.id] = init.journal.filter((j) => j.asset_id === a.id).map((j) => toEntry(j, init.names)).sort((x, y) => y.ts - x.ts);
      const orders = init.workOrders.filter((w) => w.asset_id === a.id);
      const open = orders.find((w) => w.status === "in_progress");
      const planned = orders
        .filter((w) => w.status === "scheduled" && w.due_at)
        .sort((x, y) => Date.parse(x.due_at!) - Date.parse(y.due_at!))[0];
      const done = orders.filter((w) => w.status === "done" && w.completed_at).map((w) => Date.parse(w.completed_at!));
      schedules[a.id] = {
        due: planned?.due_at ? Date.parse(planned.due_at) : null,
        lastDone: done.length ? Math.max(...done) : null,
        inProgress: Boolean(open),
        workOrderId: open?.id ?? planned?.id,
      };
    }
    set({
      locale: init.locale, auth: init.auth, layout: init.layout, warehouses: init.warehouses, machines, entities, assetMeta, journal, schedules,
      health: seedHealth(machines, demoWear),
      fleet: Object.fromEntries(entities.map((f, i) => [f.id, { battery: 62 + ((i * 17) % 36), status: "active" as const }])),
      zones: Object.fromEntries(init.layout.zones.map((z, i) => [z.id, 40 + ((i * 17) % 45)])),
      selected: null, events: [],
    });
  },

  requestPoll: () => set((s) => ({ pollNonce: s.pollNonce + 1 })),
  showTab: (tab) => set((s) => ({ requestTab: { tab, n: (s.requestTab?.n ?? 0) + 1 } })),
  requestCopilot: (id) => set((s) => ({ copilotRequest: { id, n: (s.copilotRequest?.n ?? 0) + 1 } })),
  recordLlm: (sample) => set((s) => ({ bench: { ...s.bench, llm: [...s.bench.llm, sample].slice(-MAX_SAMPLES) } })),
  recordAnalyze: (sample) => set((s) => ({ bench: { ...s.bench, analyze: [...s.bench.analyze, sample].slice(-MAX_SAMPLES) } })),
  clearBench: () => set({ bench: { llm: [], analyze: [] } }),
  setDemo: (p) => set((s) => ({ demo: { ...s.demo, ...p } })),

  /** The machine the guided demo follows: the one the layout marks as starting worn, else the first. */
  demoPrepare: () => {
    const s = get();
    if (!s.layout || s.machines.length === 0) return;
    const worn = s.layout.entities.filter((e) => e.serial && e.demoWear !== undefined).sort((a, b) => (b.demoWear ?? 0) - (a.demoWear ?? 0))[0];
    const target = s.machines.find((m) => m.serial === worn?.serial) ?? s.machines[0];
    const fresh = seedHealth(s.machines, {}); // every machine healthy; natural drift is frozen while the demo runs
    const h = fresh[target.id];
    const r = readings(0.03, h.fault);
    fresh[target.id] = { ...h, wear: 0.03, ...r, hist: { vib: [r.vib], temp: [r.temp], cur: [r.cur] } };
    set({
      health: fresh,
      demo: { open: true, active: true, step: 1, targetId: target.id, scores: {}, skipped: false },
      selected: { id: target.id, type: target.type, label: target.label },
      copilotReplies: {}, copilotRequest: null,
      pollNonce: s.pollNonce + 1,
    });
  },
  demoReset: () => {
    const s = get();
    const demoWear = Object.fromEntries((s.layout?.entities ?? []).filter((e) => e.serial && e.demoWear !== undefined).map((e) => [e.serial!, e.demoWear!]));
    set({ health: seedHealth(s.machines, demoWear), demo: { open: false, active: false, step: 0, targetId: null, scores: {}, skipped: false }, copilotReplies: {}, copilotRequest: null, pollNonce: s.pollNonce + 1 });
  },
  setWear: (id, wear) =>
    set((s) => {
      const h = s.health[id];
      if (!h) return {};
      const r = readings(wear, h.fault, (Math.random() - 0.5) * 2);
      const cap = (a: number[], v: number) => [...a.slice(-39), v];
      return { health: { ...s.health, [id]: { ...h, wear, ...r, hist: { vib: cap(h.hist.vib, r.vib), temp: cap(h.hist.temp, r.temp), cur: cap(h.hist.cur, r.cur) } } } };
    }),

  applyAnalyses: (results, serviceUp) =>
    set((st) => {
      const health = { ...st.health };
      const alerts: { id: string; label: string; status: "healthy" | "attention" | "critical" }[] = [];
      for (const r of results) {
        const prev = health[r.assetId];
        if (!prev || !("score" in r)) continue;
        const next: Health = { ...prev, analysis: { score: r.score, status: r.status, evidence: r.evidence, modelVersion: r.modelVersion, source: r.source, at: Date.now() } };
        if (statusOf(prev) !== statusOf(next) && statusOf(next) !== "healthy" && !st.schedules[r.assetId]?.inProgress) {
          const label = st.machines.find((m) => m.id === r.assetId)?.label ?? r.assetId;
          alerts.push({ id: r.assetId, label, status: statusOf(next) });
        }
        health[r.assetId] = next;
      }
      const journal = { ...st.journal };
      for (const a of alerts) {
        journal[a.id] = [{ id: `local-${Date.now()}-${a.id}`, ts: Date.now(), kind: "alert" as const, text: "", key: "alert.statusAnalysis" as Key, params: { status: { k: statusKey(a.status) } } }, ...(journal[a.id] ?? [])];
      }
      queueMicrotask(() => alerts.forEach((a) => get().log("warn", "log.statusAnalysis", { name: a.label, status: { k: statusKey(a.status) } })));
      return { health, journal, analysisStatus: serviceUp ? ("live" as const) : ("offline" as const) };
    }),

  scheduleMaintenance: async (id, due, extra) => {
    const s = get();
    const assetId = id;
    const meta = s.assetMeta[assetId];
    if (!meta) return;
    const { data, error } = await createClient()
      .from("work_orders")
      .insert({ asset_id: assetId, ...meta, summary: (extra?.summary ?? translate(get().locale, "wo.scheduledDefault")).slice(0, 2000), due_at: new Date(due).toISOString(), ai_diagnosis: extra?.aiDiagnosis ?? null })
      .select("id")
      .single();
    if (error) { get().log("warn", "log.scheduleFail", { msg: error.message }); return; }
    set((st) => ({ schedules: { ...st.schedules, [id]: { ...st.schedules[id], due, workOrderId: data.id } } }));
    await addEntry(get, set, id, "schedule", translate(get().locale, "journal.scheduled", { date: fmtDateTime(due, get().locale) }));
  },

  startMaintenance: async (id) => {
    const s = get();
    const assetId = id;
    const meta = s.assetMeta[assetId];
    if (!meta) return;
    const sb = createClient();
    const now = new Date().toISOString();
    let workOrderId = s.schedules[id].workOrderId;
    if (workOrderId) {
      const { error } = await sb.from("work_orders").update({ status: "in_progress", started_at: now }).eq("id", workOrderId);
      if (error) { get().log("warn", "log.startFail", { msg: error.message }); return; }
    } else {
      const { data, error } = await sb
        .from("work_orders")
        .insert({ asset_id: assetId, ...meta, status: "in_progress", started_at: now, summary: translate(get().locale, "wo.startedDefault") })
        .select("id")
        .single();
      if (error) { get().log("warn", "log.startFail", { msg: error.message }); return; }
      workOrderId = data.id;
    }
    set((st) => ({ schedules: { ...st.schedules, [id]: { ...st.schedules[id], inProgress: true, workOrderId } } }));
    await addEntry(get, set, id, "start", translate(get().locale, "journal.started"));
    get().log("info", "log.maintStart", { name: get().machines.find((m) => m.id === id)?.label ?? id });
  },

  completeMaintenance: async (id, note, feedback) => {
    const s = get();
    const workOrderId = s.schedules[id].workOrderId;
    const text = note.trim() || translate(get().locale, "journal.finishedDefault");
    if (workOrderId) {
      const { error } = await createClient()
        .from("work_orders")
        .update({ status: "done", completed_at: new Date().toISOString(), ...(feedback ? { diagnosis_feedback: feedback } : {}) })
        .eq("id", workOrderId);
      if (error) { get().log("warn", "log.finishFail", { msg: error.message }); return; }
    }
    const h = s.health[id];
    const r = readings(0.02, h.fault);
    set((st) => ({
      schedules: { ...st.schedules, [id]: { due: null, lastDone: Date.now(), inProgress: false } },
      health: { ...st.health, [id]: { ...h, wear: 0.02, ...r, hist: { vib: [r.vib], temp: [r.temp], cur: [r.cur] }, analysis: undefined } },
    }));
    await addEntry(get, set, id, "done", text);
    get().log("success", "log.maintDone", { name: get().machines.find((m) => m.id === id)?.label ?? id });
  },

  addNote: async (id, text) => {
    if (!text.trim()) return;
    await addEntry(get, set, id, "note", text.trim());
  },

  setTheme: (theme) => {
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem("wt-theme", theme); } catch {}
    set({ theme });
  },
  setLocale: (locale) => {
    document.documentElement.lang = locale;
    document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=31536000; samesite=lax`;
    set({ locale });
  },
  select: (selected) => set({ selected }),

  log: (kind, key, params) => set((s) => ({ events: [{ id: eventId++, at: Date.now(), kind, key, params }, ...s.events].slice(0, 30) })),

  deliver: () => set((s) => ({ ordersToday: s.ordersToday + 1 })),
  pallet: () => {},
  truckServed: (label) => {
    set((s) => ({ shipped: s.shipped + 18 }));
    get().log("success", "log.truckServed", { name: label });
  },

  tick: () => {
    const s = get();
    if (s.speed === 0) return;
    const k = s.speed;
    const rate = Math.round((3 + Math.random() * 5) * k);
    const series = [...s.series.slice(1), Math.min(99, 45 + rate * 6 + Math.random() * 10)];

    const fleet = { ...s.fleet };
    for (const f of s.entities) {
      const st = fleet[f.id];
      if (!st) continue;
      if (st.status === "charging") {
        const b = Math.min(100, st.battery + 4 * k);
        fleet[f.id] = { battery: b, status: b >= 90 ? "active" : "charging" };
      } else {
        const b = Math.max(0, st.battery - (0.25 + Math.random() * 0.5) * k * (f.type === "truck" || f.type === "worker" ? 0.4 : 1));
        fleet[f.id] = { battery: b, status: b < 14 && f.type !== "truck" && f.type !== "worker" ? "charging" : "active" };
        if (b < 14 && st.status === "active" && f.type !== "truck" && f.type !== "worker") get().log("warn", "log.batteryLow", { name: f.label });
      }
    }

    const zones = Object.fromEntries(Object.entries(s.zones).map(([z, v]) => [z, Math.max(20, Math.min(97, v + (Math.random() - 0.5) * 3))]));

    const health = { ...s.health };
    const journal = { ...s.journal };
    for (const m of s.machines) {
      const h = health[m.id];
      if (!h) continue;
      if (s.schedules[m.id]?.inProgress) continue;
      const before = statusOf(h);
      const wear = s.demo.active ? h.wear : Math.min(0.99, h.wear + 0.0009 * k * (0.7 + Math.random() * 0.6));
      const r = readings(wear, h.fault, (Math.random() - 0.5) * 2);
      const cap = (a: number[], v: number) => [...a.slice(-39), v];
      const nh: Health = { ...h, wear, ...r, hist: { vib: cap(h.hist.vib, r.vib), temp: cap(h.hist.temp, r.temp), cur: cap(h.hist.cur, r.cur) } };
      health[m.id] = nh;
      const after = statusOf(nh);
      if (after !== before && after !== "healthy") {
        journal[m.id] = [{ id: `local-${Date.now()}-${m.id}`, ts: Date.now(), kind: "alert", text: "", key: "alert.statusFault", params: { status: { k: statusKey(after) }, fault: { k: faultKey(nh.fault) } } }, ...journal[m.id]];
        get().log("warn", "log.statusChange", { name: m.label, status: { k: statusKey(after) }, fault: { k: faultKey(nh.fault) } });
      }
    }

    let orders = s.orders;
    if (Math.random() < 0.45 * k) {
      orders = orders.map((o) => (o.status === "Picking" && Math.random() < 0.5 ? { ...o, status: "Packed" as const } : o.status === "Packed" && Math.random() < 0.5 ? { ...o, status: "Shipped" as const } : o));
      orders = [...orders.filter((o) => o.status !== "Shipped" || Math.random() < 0.6)];
      if (orders.length < 6) orders = [...orders, { id: `SO-${++orderSeq}`, customer: CUSTOMERS[Math.floor(Math.random() * CUSTOMERS.length)], items: 1 + Math.floor(Math.random() * 9), status: "Picking" }];
      orders = orders.slice(-6);
    }

    if (Math.random() < 0.05) {
      const msgs: Key[] = ["log.alert.stock", "log.alert.door", "log.alert.pallet", "log.alert.temp"];
      get().log("warn", msgs[Math.floor(Math.random() * msgs.length)]);
    }
    set({ series, fleet, zones, orders, health, journal, ordersToday: s.ordersToday + rate, shipped: s.shipped + Math.floor(rate / 2) });
  },
}));
