import { create } from "zustand";
import { EntityType, FLEET } from "./layout";
import type { Theme } from "./theme";

export interface Selected { id: string; type: EntityType; label: string }
export interface LogEvent { id: number; time: string; kind: "info" | "success" | "warn" | "level"; text: string }
export type Metric = "delivered" | "pallets" | "trucks" | "boosts";
export interface Mission { id: number; title: string; metric: Metric; goal: number; base: number; xp: number; coins: number }
export interface Order { id: string; customer: string; items: number; status: "Picking" | "Packed" | "Shipped" }
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
    set({ series, fleet, zones, orders, ordersToday: s.ordersToday + rate, shipped: s.shipped + Math.floor(rate / 2) });
  },
}));
