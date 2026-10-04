"use client";

import { Check, Minus, Zap } from "lucide-react";
import { FLEET, ZONES } from "@/lib/layout";
import { useStore } from "@/lib/store";

function Section({ title, aside, children }: { title: string; aside?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="border-b border-rule px-4 py-4">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-xs font-semibold text-ink/70">{title}</h2>
        {aside && <span className="text-xs text-ink/45">{aside}</span>}
      </div>
      {children}
    </section>
  );
}

function Bar({ value, warn }: { value: number; warn?: boolean }) {
  return (
    <div className="h-1 bg-ink/10">
      <div className={`h-full transition-[width] duration-300 ${warn ? "bg-warn" : "bg-accent"}`} style={{ width: `${Math.min(100, value)}%` }} />
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div>
      <div className="text-xs text-ink/55">{label}</div>
      <div className="text-2xl font-semibold leading-8">{value}</div>
      <div className="text-xs text-ink/45">{sub}</div>
    </div>
  );
}

export function Kpis() {
  const { ordersToday, shipped, series, fleet, zones } = useStore();
  const per = Math.round(series[series.length - 1] * 2.4);
  const active = Object.values(fleet).filter((f) => f.status === "active").length;
  const fill = Math.round(Object.values(zones).reduce((a, b) => a + b, 0) / 4);
  return (
    <Section title="Operasi hari ini" aside="Live">
      <div className="grid grid-cols-2 gap-x-4 gap-y-5">
        <Stat label="Orders" value={ordersToday.toLocaleString("en-US")} sub="+12.4% vs kemarin" />
        <Stat label="Terkirim" value={shipped.toLocaleString("en-US")} sub={`${Math.round((shipped / ordersToday) * 100)}% fulfillment`} />
        <Stat label="Throughput" value={`${per}/jam`} sub="parcel per jam" />
        <Stat label="Armada aktif" value={`${active}/${FLEET.length}`} sub={`Gudang terisi ${fill}%`} />
      </div>
    </Section>
  );
}

export function Throughput() {
  const series = useStore((s) => s.series);
  const W = 260, H = 72;
  const pts = series.map((v, i) => `${i ? "L" : "M"}${((i / (series.length - 1)) * W).toFixed(1)},${(H - (v / 100) * H).toFixed(1)}`).join(" ");
  return (
    <Section title="Throughput" aside="30 detik terakhir">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-[72px] w-full" preserveAspectRatio="none" role="img" aria-label="Grafik throughput">
        {[0, 0.5, 1].map((g) => <line key={g} x1="0" x2={W} y1={Math.min(H - 0.5, H * g + 0.5)} y2={Math.min(H - 0.5, H * g + 0.5)} className="stroke-rule" strokeWidth="1" vectorEffect="non-scaling-stroke" />)}
        <path d={pts} fill="none" className="stroke-accent" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
      </svg>
    </Section>
  );
}

export function Zones() {
  const zones = useStore((s) => s.zones);
  return (
    <Section title="Kapasitas zona">
      <div className="space-y-3">
        {ZONES.map((z) => (
          <div key={z.id}>
            <div className="mb-1 flex justify-between text-xs"><span>{z.name}</span><span className="text-ink/60">{Math.round(zones[z.id])}%</span></div>
            <Bar value={zones[z.id]} warn={zones[z.id] >= 90} />
          </div>
        ))}
      </div>
    </Section>
  );
}

const STATUS_CLASS = { Picking: "text-ink/60", Packed: "text-ink", Shipped: "text-ok" } as const;

export function Orders() {
  const orders = useStore((s) => s.orders);
  return (
    <Section title="Antrian order">
      <table className="w-full text-xs">
        <tbody className="divide-y divide-rule">
          {orders.map((o) => (
            <tr key={o.id}>
              <td className="py-1.5 pr-2 text-ink/55">{o.id}</td>
              <td className="py-1.5 pr-2">{o.customer}</td>
              <td className="py-1.5 pr-2 text-right text-ink/55">{o.items} item</td>
              <td className={`py-1.5 text-right ${STATUS_CLASS[o.status]}`}>{o.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Section>
  );
}

export function Missions() {
  const { missions, counters, claim } = useStore();
  const achievements = [
    { n: "First Truck", ok: counters.trucks >= 1 },
    { n: "Parcel Pro", ok: counters.delivered >= 50 },
    { n: "Fleet Boss", ok: counters.boosts >= 3 },
    { n: "Pallet King", ok: counters.pallets >= 10 },
  ];
  return (
    <Section title="Misi">
      <ul className="divide-y divide-rule border-y border-rule">
        {missions.map((m) => {
          const cur = Math.min(m.goal, counters[m.metric] - m.base);
          const done = cur >= m.goal;
          return (
            <li key={m.id} className="py-2.5">
              <div className="flex items-start justify-between gap-3">
                <span className="text-[13px]">{m.title}</span>
                <span className="shrink-0 text-xs text-ink/55">{cur}/{m.goal}</span>
              </div>
              <div className="mt-2 flex items-center gap-3">
                <div className="flex-1"><Bar value={(cur / m.goal) * 100} /></div>
                {done ? (
                  <button onClick={() => claim(m.id)} className="h-6 rounded-ui bg-accent px-2.5 text-xs font-semibold text-canvas transition-opacity duration-150 hover:opacity-90">Klaim</button>
                ) : (
                  <span className="text-xs text-ink/45">+{m.xp} XP · {m.coins} coins</span>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      <div className="mt-4 text-xs text-ink/55">Pencapaian · {achievements.filter((a) => a.ok).length}/{achievements.length}</div>
      <ul className="mt-1.5 grid grid-cols-2 gap-y-1 text-xs">
        {achievements.map((a) => (
          <li key={a.n} className={`flex items-center gap-1.5 ${a.ok ? "" : "text-ink/40"}`}>
            {a.ok ? <Check size={12} /> : <Minus size={12} />}{a.n}
          </li>
        ))}
      </ul>
    </Section>
  );
}

export function Fleet() {
  const { fleet, select, selected, boosts } = useStore();
  return (
    <Section title="Armada" aside="Klik baris untuk memilih">
      <div className="grid grid-cols-[1fr_64px_44px] px-2 pb-1 text-xs text-ink/45">
        <span>Unit</span><span>Status</span><span className="text-right">Baterai</span>
      </div>
      <ul className="divide-y divide-rule border-y border-rule">
        {FLEET.map((f) => {
          const st = fleet[f.id];
          const boosted = (boosts[f.id] ?? 0) > Date.now();
          return (
            <li key={f.id}>
              <button
                onClick={() => select(f)}
                className={`grid w-full grid-cols-[1fr_64px_44px] items-center px-2 py-1.5 text-left text-xs transition-colors duration-150 ${selected?.id === f.id ? "bg-ink/10" : "hover:bg-ink/5"}`}
              >
                <span className="truncate">{f.label}</span>
                <span className={boosted ? "inline-flex items-center gap-1 text-accent" : st.status === "charging" ? "text-warn" : "text-ink/60"}>
                  {boosted ? <><Zap size={11} fill="currentColor" />Boost</> : st.status === "charging" ? "Charging" : "Active"}
                </span>
                <span className={`text-right ${st.battery < 25 ? "text-warn" : "text-ink/60"}`}>{Math.round(st.battery)}%</span>
              </button>
            </li>
          );
        })}
      </ul>
    </Section>
  );
}

const KIND_CLASS = { info: "", success: "", warn: "text-warn", level: "font-semibold" } as const;

export function Activity() {
  const events = useStore((s) => s.events);
  return (
    <Section title="Aktivitas">
      <ul className="scroll-thin max-h-40 space-y-1.5 overflow-y-auto pr-1">
        {events.length === 0 && <li className="text-xs text-ink/45">Menunggu aktivitas…</li>}
        {events.map((e) => (
          <li key={e.id} className="flex gap-3 text-xs leading-snug">
            <span className="shrink-0 text-ink/45">{e.time}</span>
            <span className={KIND_CLASS[e.kind]}>{e.text}</span>
          </li>
        ))}
      </ul>
    </Section>
  );
}

export function OverviewPanels() {
  return (
    <>
      <Kpis />
      <Throughput />
      <Zones />
      <Orders />
    </>
  );
}

export function LeftColumn() {
  return (
    <aside className="scroll-thin hidden w-[300px] shrink-0 overflow-y-auto border-r border-rule bg-surface lg:block">
      <OverviewPanels />
    </aside>
  );
}

export function RightColumn() {
  return (
    <aside className="scroll-thin hidden w-[300px] shrink-0 overflow-y-auto border-l border-rule bg-surface lg:block">
      <Missions />
      <Fleet />
      <Activity />
    </aside>
  );
}
