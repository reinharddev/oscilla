import { FLEET } from "./layout";

export type FaultKind = "bearing" | "overheat" | "battery";
export type HealthStatus = "healthy" | "attention" | "critical";

export interface Health {
  wear: number; // 0 = new, 1 = failed
  fault: FaultKind;
  vib: number; temp: number; cur: number;
  hist: { vib: number[]; temp: number[]; cur: number[] };
}

export const MACHINES = FLEET.filter((f) => f.type === "forklift" || f.type === "agv" || f.type === "drone");
export const isMachine = (id: string) => MACHINES.some((m) => m.id === id);

export const BASE = { vib: 2, temp: 52, cur: 8 };
export const LIMIT = { vib: 4.5, temp: 75, cur: 10.5 };

export const FAULT_LABEL: Record<FaultKind, string> = {
  bearing: "Keausan bearing",
  overheat: "Motor overheat",
  battery: "Degradasi baterai",
};

export const STATUS_LABEL: Record<HealthStatus | "maintenance", string> = {
  healthy: "Sehat", attention: "Perlu perhatian", critical: "Kritis", maintenance: "Sedang maintenance",
};

export const scoreOf = (h: Health) => Math.max(0, Math.min(100, Math.round(100 - h.wear * 95)));
export const statusOf = (h: Health): HealthStatus => { const s = scoreOf(h); return s >= 75 ? "healthy" : s >= 50 ? "attention" : "critical"; };
export const rulDays = (h: Health) => Math.max(0, Math.round(((0.97 - h.wear) / 0.97) * 14));

export function readings(wear: number, fault: FaultKind, noise = 0) {
  const n = (a: number) => a * noise;
  if (fault === "bearing") return { vib: BASE.vib + 5 * wear + n(0.25), temp: BASE.temp + 8 * wear + n(1.2), cur: BASE.cur + 2 * wear + n(0.2) };
  if (fault === "overheat") return { vib: BASE.vib + wear + n(0.2), temp: BASE.temp + 35 * wear + n(1.5), cur: BASE.cur + 3 * wear + n(0.2) };
  return { vib: BASE.vib + wear + n(0.2), temp: BASE.temp + 12 * wear + n(1.2), cur: BASE.cur + 5 * wear + n(0.3) };
}

/** Deterministic seed (no Math.random) so server and client render the same first frame. */
export function seedHealth(): Record<string, Health> {
  const kinds: FaultKind[] = ["bearing", "overheat", "battery"];
  const out: Record<string, Health> = {};
  MACHINES.forEach((m, i) => {
    const wear = m.id === "fk-2" ? 0.52 : m.id === "agv-2" ? 0.31 : 0.04 + ((i * 7) % 9) / 100;
    const fault = kinds[i % 3];
    const hist = { vib: [] as number[], temp: [] as number[], cur: [] as number[] };
    for (let t = 0; t < 30; t++) {
      const w = Math.max(0, wear - (30 - t) * 0.0015);
      const r = readings(w, fault, Math.sin(t * 1.7 + i));
      hist.vib.push(r.vib); hist.temp.push(r.temp); hist.cur.push(r.cur);
    }
    const r = readings(wear, fault);
    out[m.id] = { wear, fault, ...r, hist };
  });
  return out;
}

export function analysis(h: Health): string {
  const st = statusOf(h);
  if (st === "healthy") return "Semua parameter dalam batas normal. Tidak ada tindakan yang diperlukan.";
  const d = rulDays(h);
  if (h.fault === "bearing") return `Getaran ${Math.round((h.vib / BASE.vib - 1) * 100)}% di atas baseline dan terus naik. Pola konsisten dengan keausan bearing. Rekomendasi: inspeksi dan ganti bearing dalam ${d} hari.`;
  if (h.fault === "overheat") return `Suhu motor ${h.temp.toFixed(0)}°C, ${Math.round(h.temp - BASE.temp)}°C di atas normal. Kemungkinan kipas pendingin atau belitan motor bermasalah. Rekomendasi: periksa pendinginan dalam ${d} hari.`;
  return `Arus beban naik ${Math.round((h.cur / BASE.cur - 1) * 100)}% dan kapasitas baterai menurun. Rekomendasi: uji kapasitas dan jadwalkan penggantian sel dalam ${d} hari.`;
}
