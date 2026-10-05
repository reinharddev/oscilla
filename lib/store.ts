import { create } from "zustand";
import { EntityType, FLEET } from "./layout";
import type { Theme } from "./theme";
import { createClient } from "./supabase/client";
import { Health, MACHINES, readings, seedHealth, statusOf, STATUS_LABEL, FAULT_LABEL } from "./health";

export interface Selected { id: string; type: EntityType; label: string }
export interface LogEvent { id: number; time: string; kind: "info" | "success" | "warn" | "level"; text: string }
export type Metric = "delivered" | "pallets" | "trucks" | "boosts";
export interface Mission { id: number; title: string; metric: Metric; goal: number; base: number; xp: number; coins: number }
export interface Order { id: string; customer: string; items: number; status: "Picking" | "Packed" | "Shipped" }
export type Role = "admin" | "manager" | "technician" | "viewer";
export interface AuthInfo { userId: string; email: string; name: string; role: Role; orgName: string; warehouseName: string }
export interface Schedule { due: number | null; lastDone: number | null; inProgress: boolean; workOrderId?: string }
export interface JournalEntry { id: string; ts: number; kind: "note" | "alert" | "schedule" | "start" | "done"; text: string; author?: string }
export interface HydrateInput {
  auth: AuthInfo;
  names: Record<string, string>;
  assets: { id: string; name: string; org_id: string; warehouse_id: string }[];
  journal: { id: string; asset_id: string; author_id: string; kind: JournalEntry["kind"]; body: string; created_at: string }[];
  workOrders: { id: string; asset_id: string; status: string; due_at: string | null; completed_at: string | null }[];
}

export const canWrite = (a: AuthInfo | null) => a?.role === "admin" || a?.role === "manager" || a?.role === "technician";
export interface FleetState { battery: number; status: "active" | "charging" }

export const levelFromXp = (xp: number) => Math.floor(Math.sqrt(xp / 60)) + 1;
export const xpForLevel = (lvl: number) => (lvl - 1) * (lvl - 1) * 60;

const MISSION_POOL: Omit<Mission, "id" | "base">[] = [
  { title: "Kirim {n} paket dari belt", metric: "delivered", goal: 12, xp: 80, coins: 40 },
  { title: "Pindahkan {n} pallet", metric: "pallets", goal: 4, xp: 100, coins: 55 },
  { title: "Layani {n} truk di dock", metric: "trucks", goal: 2, xp: 140, coins: 80 },
  { title: "Boost {n} unit armada", metric: "boosts", goal: 2, xp: 90, coins: 60 },
];

const CUSTOMERS = ["Tokopedia", "Shopee", "Lazada", "Blibli", "Bukalapak", "JD.ID", "Zalora", "Sociolla"];
let eventId = 1;
let orderSeq = 4820;
let missionSeq = 1;
const nowStr = () => new Date().toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

interface State {
  speed: number;
  theme: Theme;
  layers: { paths: boolean; labels: boolean; zones: boolean };
  selected: Selected | null;
  boosts: Record<string, number>; // id -> expiry (ms)
  xp: number; coins: number;
  counters: Record<Metric, number>;
  ordersToday: number; shipped: number;
  series: number[];
  zones: Record<string, number>;
  fleet: Record<string, FleetState>;
  orders: Order[];
  events: LogEvent[];
  missions: Mission[];
  levelUp: number | null;
  health: Record<string, Health>;
  schedules: Record<string, Schedule>;
  journal: Record<string, JournalEntry[]>;
  auth: AuthInfo | null;
  assetIds: Record<string, string>; // machine id -> database asset id
  assetMeta: Record<string, { org_id: string; warehouse_id: string }>;

  hydrate: (init: HydrateInput) => void;
  scheduleMaintenance: (id: string, due: number) => Promise<void>;
  startMaintenance: (id: string) => Promise<void>;
  completeMaintenance: (id: string, note: string) => Promise<void>;
  addNote: (id: string, text: string) => Promise<void>;

  setSpeed: (s: number) => void;
  setTheme: (t: Theme) => void;
  toggleLayer: (k: "paths" | "labels" | "zones") => void;
  select: (s: Selected | null) => void;
  boost: (id: string) => boolean;
  addXp: (xp: number, coins?: number) => void;
  log: (kind: LogEvent["kind"], text: string) => void;
  deliver: () => void;
  pallet: () => void;
  truckServed: (label: string) => void;
  claim: (id: number) => void;
  tick: () => void;
}

const mkMission = (i: number, base: Record<Metric, number>, scale = 1): Mission => {
  const p = MISSION_POOL[i % MISSION_POOL.length];
  const goal = Math.round(p.goal * scale);
  return { id: missionSeq++, title: p.title.replace("{n}", String(goal)), metric: p.metric, goal, base: base[p.metric], xp: Math.round(p.xp * scale), coins: Math.round(p.coins * scale) };
};

type Get = () => State;
type Set = (p: Partial<State> | ((s: State) => Partial<State>)) => void;

const toEntry = (j: HydrateInput["journal"][number], names: Record<string, string>): JournalEntry => ({
  id: j.id, ts: Date.parse(j.created_at), kind: j.kind, text: j.body, author: names[j.author_id],
});

/** Insert a journal row (RLS decides whether this user may) and show it locally. */
async function addEntry(get: Get, set: Set, id: string, kind: JournalEntry["kind"], text: string) {
  const s = get();
  const assetId = s.assetIds[id];
  const meta = assetId ? s.assetMeta[assetId] : undefined;
  if (!meta) return;
  const { data, error } = await createClient()
    .from("journal_entries")
    .insert({ asset_id: assetId, ...meta, kind, body: text })
    .select("id, created_at, author_id")
    .single();
  if (error) { get().log("warn", `Jurnal gagal disimpan: ${error.message}`); return; }
  const entry: JournalEntry = { id: data.id, ts: Date.parse(data.created_at), kind, text, author: s.auth?.name };
  set((st) => ({ journal: { ...st.journal, [id]: [entry, ...(st.journal[id] ?? [])] } }));
}

const zeroCounters: Record<Metric, number> = { delivered: 0, pallets: 0, trucks: 0, boosts: 0 };

export const BOOST_COST = 25;
export const BOOST_MS = 30_000;

export const useStore = create<State>((set, get) => ({
  speed: 1,
  theme: "day",
  layers: { paths: false, labels: true, zones: true },
  selected: null,
  boosts: {},
  xp: 0, coins: 60,
  counters: { ...zeroCounters },
  ordersToday: 1284, shipped: 1127,
  series: [34, 41, 38, 52, 47, 58, 49, 61, 55, 63, 59, 70, 64, 72, 66, 75, 69, 78, 71, 80, 74, 69, 77, 83, 79, 86, 81, 88, 84, 90],
  zones: { A: 78, B: 54, P: 41, D: 63 },
  fleet: Object.fromEntries(FLEET.map((f, i) => [f.id, { battery: 62 + ((i * 17) % 36), status: "active" as const }])),
  orders: [
    { id: "SO-4815", customer: "Shopee", items: 6, status: "Shipped" },
    { id: "SO-4816", customer: "Tokopedia", items: 2, status: "Packed" },
    { id: "SO-4817", customer: "Blibli", items: 9, status: "Packed" },
    { id: "SO-4818", customer: "Lazada", items: 4, status: "Picking" },
    { id: "SO-4819", customer: "Zalora", items: 1, status: "Picking" },
  ],
  events: [],
  missions: [mkMission(0, zeroCounters), mkMission(1, zeroCounters), mkMission(2, zeroCounters)],
  levelUp: null,
  health: seedHealth(),
  schedules: Object.fromEntries(MACHINES.map((m) => [m.id, { due: null, lastDone: null, inProgress: false }])),
  journal: Object.fromEntries(MACHINES.map((m) => [m.id, []])),

  auth: null,
  assetIds: {},
  assetMeta: {},

  hydrate: (init) => {
    const byName = new Map(init.assets.map((a) => [a.name, a]));
    const assetIds: Record<string, string> = {};
    const assetMeta: Record<string, { org_id: string; warehouse_id: string }> = {};
    const journal: Record<string, JournalEntry[]> = {};
    const schedules: Record<string, Schedule> = {};
    for (const m of MACHINES) {
      journal[m.id] = [];
      schedules[m.id] = { due: null, lastDone: null, inProgress: false };
      const a = byName.get(m.label);
      if (!a) continue;
      assetIds[m.id] = a.id;
      assetMeta[a.id] = { org_id: a.org_id, warehouse_id: a.warehouse_id };
      journal[m.id] = init.journal.filter((j) => j.asset_id === a.id).map((j) => toEntry(j, init.names)).sort((x, y) => y.ts - x.ts);
      const orders = init.workOrders.filter((w) => w.asset_id === a.id);
      const open = orders.find((w) => w.status === "in_progress");
      const planned = orders
        .filter((w) => w.status === "scheduled" && w.due_at)
        .sort((x, y) => Date.parse(x.due_at!) - Date.parse(y.due_at!))[0];
      const done = orders.filter((w) => w.status === "done" && w.completed_at).map((w) => Date.parse(w.completed_at!));
      schedules[m.id] = {
        due: planned?.due_at ? Date.parse(planned.due_at) : null,
        lastDone: done.length ? Math.max(...done) : null,
        inProgress: Boolean(open),
        workOrderId: open?.id ?? planned?.id,
      };
    }
    set({ auth: init.auth, assetIds, assetMeta, journal, schedules });
  },

  scheduleMaintenance: async (id, due) => {
    const s = get();
    const assetId = s.assetIds[id];
    const meta = assetId ? s.assetMeta[assetId] : undefined;
    if (!meta) return;
    const { data, error } = await createClient()
      .from("work_orders")
      .insert({ asset_id: assetId, ...meta, summary: "Maintenance terjadwal", due_at: new Date(due).toISOString() })
      .select("id")
      .single();
    if (error) { get().log("warn", `Jadwal gagal disimpan: ${error.message}`); return; }
    set((st) => ({ schedules: { ...st.schedules, [id]: { ...st.schedules[id], due, workOrderId: data.id } } }));
    await addEntry(get, set, id, "schedule", `Maintenance dijadwalkan ${new Date(due).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" })}`);
  },

  startMaintenance: async (id) => {
    const s = get();
    const assetId = s.assetIds[id];
    const meta = assetId ? s.assetMeta[assetId] : undefined;
    if (!meta) return;
    const sb = createClient();
    const now = new Date().toISOString();
    let workOrderId = s.schedules[id].workOrderId;
    if (workOrderId) {
      const { error } = await sb.from("work_orders").update({ status: "in_progress", started_at: now }).eq("id", workOrderId);
      if (error) { get().log("warn", `Gagal memulai: ${error.message}`); return; }
    } else {
      const { data, error } = await sb
        .from("work_orders")
        .insert({ asset_id: assetId, ...meta, status: "in_progress", started_at: now, summary: "Maintenance dimulai" })
        .select("id")
        .single();
      if (error) { get().log("warn", `Gagal memulai: ${error.message}`); return; }
      workOrderId = data.id;
    }
    set((st) => ({ schedules: { ...st.schedules, [id]: { ...st.schedules[id], inProgress: true, workOrderId } } }));
    await addEntry(get, set, id, "start", "Maintenance dimulai, unit dihentikan dari operasi.");
    get().log("info", `${MACHINES.find((m) => m.id === id)?.label} masuk maintenance`);
  },

  completeMaintenance: async (id, note) => {
    const s = get();
    const workOrderId = s.schedules[id].workOrderId;
    const text = note.trim() || "Maintenance selesai.";
    if (workOrderId) {
      const { error } = await createClient()
        .from("work_orders")
        .update({ status: "done", completed_at: new Date().toISOString(), summary: text.slice(0, 2000) })
        .eq("id", workOrderId);
      if (error) { get().log("warn", `Gagal menyelesaikan: ${error.message}`); return; }
    }
    const h = s.health[id];
    const r = readings(0.02, h.fault);
    set((st) => ({
      schedules: { ...st.schedules, [id]: { due: null, lastDone: Date.now(), inProgress: false } },
      health: { ...st.health, [id]: { ...h, wear: 0.02, ...r, hist: { vib: [r.vib], temp: [r.temp], cur: [r.cur] } } },
    }));
    await addEntry(get, set, id, "done", text);
    get().addXp(35, 15);
    get().log("success", `${MACHINES.find((m) => m.id === id)?.label} selesai maintenance · +35 XP`);
  },

  addNote: async (id, text) => {
    if (!text.trim()) return;
    await addEntry(get, set, id, "note", text.trim());
  },

  setSpeed: (speed) => set({ speed }),
  setTheme: (theme) => {
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem("wt-theme", theme); } catch {}
    set({ theme });
  },
  toggleLayer: (k) => set((s) => ({ layers: { ...s.layers, [k]: !s.layers[k] } })),
  select: (selected) => set({ selected }),

  log: (kind, text) => set((s) => ({ events: [{ id: eventId++, time: nowStr(), kind, text }, ...s.events].slice(0, 30) })),

  addXp: (xp, coins = 0) => {
    const before = levelFromXp(get().xp);
    const nxp = get().xp + xp;
    const after = levelFromXp(nxp);
    set((s) => ({ xp: nxp, coins: s.coins + coins, levelUp: after > before ? Date.now() : s.levelUp }));
    if (after > before) get().log("level", `LEVEL UP! Kamu sekarang Level ${after}`);
  },

  deliver: () => {
    set((s) => ({ counters: { ...s.counters, delivered: s.counters.delivered + 1 }, ordersToday: s.ordersToday + 1 }));
    get().addXp(4, 1);
  },
  pallet: () => {
    set((s) => ({ counters: { ...s.counters, pallets: s.counters.pallets + 1 } }));
    get().addXp(12, 3);
    if (get().counters.pallets % 3 === 0) get().log("info", `Pallet #${get().counters.pallets} dipindahkan ke rak`);
  },
  truckServed: (label) => {
    set((s) => ({ counters: { ...s.counters, trucks: s.counters.trucks + 1 }, shipped: s.shipped + 18 }));
    get().addXp(45, 20);
    get().log("success", `${label} selesai dimuat · +45 XP`);
  },

  boost: (id) => {
    const s = get();
    if (s.coins < BOOST_COST) return false;
    set({ coins: s.coins - BOOST_COST, boosts: { ...s.boosts, [id]: Date.now() + BOOST_MS }, counters: { ...s.counters, boosts: s.counters.boosts + 1 } });
    s.addXp(10);
    s.log("info", `Boost 2× aktif pada ${FLEET.find((f) => f.id === id)?.label ?? id}`);
    return true;
  },

  claim: (id) => {
    const s = get();
    const m = s.missions.find((x) => x.id === id);
    if (!m || s.counters[m.metric] - m.base < m.goal) return;
    const scale = 1 + Math.floor(levelFromXp(s.xp) / 3) * 0.4;
    const idx = MISSION_POOL.findIndex((p) => p.metric === m.metric);
    set({ missions: s.missions.map((x) => (x.id === id ? mkMission(idx + 1 + Math.floor(Math.random() * 3), s.counters, scale) : x)) });
    s.addXp(m.xp, m.coins);
    s.log("success", `Misi selesai: ${m.title} · +${m.xp} XP +${m.coins} coin`);
  },

  tick: () => {
    const s = get();
    if (s.speed === 0) return;
    const k = s.speed;
    const rate = Math.round((3 + Math.random() * 5) * k + Object.keys(s.boosts).filter((b) => s.boosts[b] > Date.now()).length);
    const series = [...s.series.slice(1), Math.min(99, 45 + rate * 6 + Math.random() * 10)];

    const fleet = { ...s.fleet };
    for (const f of FLEET) {
      const st = fleet[f.id];
      if (st.status === "charging") {
        const b = Math.min(100, st.battery + 4 * k);
        fleet[f.id] = { battery: b, status: b >= 90 ? "active" : "charging" };
      } else {
        const b = Math.max(0, st.battery - (0.25 + Math.random() * 0.5) * k * (f.type === "truck" || f.type === "worker" ? 0.4 : 1));
        fleet[f.id] = { battery: b, status: b < 14 && f.type !== "truck" && f.type !== "worker" ? "charging" : "active" };
        if (b < 14 && st.status === "active" && f.type !== "truck" && f.type !== "worker") get().log("warn", `${f.label} baterai rendah — menuju charger`);
      }
    }

    const zones = Object.fromEntries(Object.entries(s.zones).map(([z, v]) => [z, Math.max(20, Math.min(97, v + (Math.random() - 0.5) * 3))]));

    const health = { ...s.health };
    const journal = { ...s.journal };
    for (const m of MACHINES) {
      const h = health[m.id];
      if (s.schedules[m.id]?.inProgress) continue;
      const before = statusOf(h);
      const wear = Math.min(0.99, h.wear + 0.0009 * k * (0.7 + Math.random() * 0.6));
      const r = readings(wear, h.fault, (Math.random() - 0.5) * 2);
      const cap = (a: number[], v: number) => [...a.slice(-39), v];
      const nh: Health = { ...h, wear, ...r, hist: { vib: cap(h.hist.vib, r.vib), temp: cap(h.hist.temp, r.temp), cur: cap(h.hist.cur, r.cur) } };
      health[m.id] = nh;
      const after = statusOf(nh);
      if (after !== before && after !== "healthy") {
        journal[m.id] = [{ id: `local-${Date.now()}-${m.id}`, ts: Date.now(), kind: "alert", text: `Status berubah ke ${STATUS_LABEL[after]}: ${FAULT_LABEL[nh.fault]} terdeteksi.` }, ...journal[m.id]];
        get().log("warn", `${m.label}: ${STATUS_LABEL[after]} (${FAULT_LABEL[nh.fault]})`);
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
      const msgs = ["Stok SKU-2231 menipis di Zone A", "Pintu dock 2 terbuka > 5 menit", "Scan drone mendeteksi pallet miring di Rak B3", "Suhu area packing naik 2°C"];
      get().log("warn", msgs[Math.floor(Math.random() * msgs.length)]);
    }
    set({ series, fleet, zones, orders, health, journal, ordersToday: s.ordersToday + rate, shipped: s.shipped + Math.floor(rate / 2) });
  },
}));
