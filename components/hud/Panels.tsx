"use client";

import { fmtTime, renderMsg, type Key } from "@/lib/i18n";
import { useLang, useT } from "@/lib/i18n/use-t";
import { useStore } from "@/lib/store";
import { AgentPanel } from "./AgentPanel";
import { Benchmark } from "./Benchmark";
import { MachinePanel, MaintenanceTable } from "./MachinePanel";
import { Bar, Section } from "./ui";

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
  const t = useT();
  const { ordersToday, shipped, series, fleet, zones, entities } = useStore();
  const per = Math.round(series[series.length - 1] * 2.4);
  const active = Object.values(fleet).filter((f) => f.status === "active").length;
  const fill = Math.round(Object.values(zones).reduce((a, b) => a + b, 0) / Math.max(1, Object.keys(zones).length));
  return (
    <Section title={t("kpi.title")} aside={t("kpi.live")}>
      <div className="grid grid-cols-2 gap-x-4 gap-y-5">
        <Stat label={t("kpi.orders")} value={ordersToday.toLocaleString("en-US")} sub={t("kpi.vsYesterday")} />
        <Stat label={t("kpi.shipped")} value={shipped.toLocaleString("en-US")} sub={t("kpi.fulfilment", { pct: Math.round((shipped / ordersToday) * 100) })} />
        <Stat label={t("kpi.throughput")} value={t("kpi.perHour", { n: per })} sub={t("kpi.parcelsPerHour")} />
        <Stat label={t("kpi.fleetActive")} value={`${active}/${entities.length}`} sub={t("kpi.capacity", { pct: fill })} />
      </div>
    </Section>
  );
}

export function Throughput() {
  const t = useT();
  const series = useStore((s) => s.series);
  const W = 260, H = 72;
  const pts = series.map((v, i) => `${i ? "L" : "M"}${((i / (series.length - 1)) * W).toFixed(1)},${(H - (v / 100) * H).toFixed(1)}`).join(" ");
  return (
    <Section title={t("thr.title")} aside={t("thr.last")}>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-[72px] w-full" preserveAspectRatio="none" role="img" aria-label={t("thr.aria")}>
        {[0, 0.5, 1].map((g) => <line key={g} x1="0" x2={W} y1={Math.min(H - 0.5, H * g + 0.5)} y2={Math.min(H - 0.5, H * g + 0.5)} className="stroke-rule" strokeWidth="1" vectorEffect="non-scaling-stroke" />)}
        <path d={pts} fill="none" className="stroke-accent" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
      </svg>
    </Section>
  );
}

export function Zones() {
  const t = useT();
  const zones = useStore((s) => s.zones);
  const layoutZones = useStore((s) => s.layout?.zones ?? []);
  return (
    <Section title={t("zones.title")}>
      <div className="space-y-3">
        {layoutZones.map((z) => (
          <div key={z.id}>
            <div className="mb-1 flex justify-between text-xs"><span>{z.name}</span><span className="text-ink/60">{Math.round(zones[z.id] ?? 0)}%</span></div>
            <Bar value={zones[z.id] ?? 0} warn={(zones[z.id] ?? 0) >= 90} />
          </div>
        ))}
      </div>
    </Section>
  );
}

const STATUS_CLASS = { Picking: "text-ink/60", Packed: "text-ink", Shipped: "text-ok" } as const;

export function Orders() {
  const t = useT();
  const orders = useStore((s) => s.orders);
  return (
    <Section title={t("orders.title")}>
      <table className="w-full text-xs">
        <tbody className="divide-y divide-rule">
          {orders.map((o) => (
            <tr key={o.id}>
              <td className="py-1.5 pr-2 text-ink/55">{o.id}</td>
              <td className="py-1.5 pr-2">{o.customer}</td>
              <td className="py-1.5 pr-2 text-right text-ink/55">{t("orders.items", { n: o.items })}</td>
              <td className={`py-1.5 text-right ${STATUS_CLASS[o.status]}`}>{t(`orders.status.${o.status}` as Key)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Section>
  );
}

export function Fleet() {
  const t = useT();
  const { fleet, select, selected, entities } = useStore();
  return (
    <Section title={t("fleet.title")} aside={t("fleet.hint")}>
      <div className="grid grid-cols-[1fr_72px_44px] px-2 pb-1 text-xs text-ink/45">
        <span>{t("fleet.unit")}</span><span>{t("fleet.status")}</span><span className="text-right">{t("fleet.battery")}</span>
      </div>
      <ul className="divide-y divide-rule border-y border-rule">
        {entities.map((f) => {
          const st = fleet[f.id];
          if (!st) return null;
          return (
            <li key={f.id}>
              <button
                onClick={() => select(f)}
                className={`grid w-full grid-cols-[1fr_72px_44px] items-center px-2 py-1.5 text-left text-xs transition-colors duration-150 ${selected?.id === f.id ? "bg-ink/10" : "hover:bg-ink/5"}`}
              >
                <span className="truncate">{f.label}</span>
                <span className={st.status === "charging" ? "text-warn" : "text-ink/60"}>{st.status === "charging" ? t("fleet.charging") : t("fleet.active")}</span>
                <span className={`text-right ${st.battery < 25 ? "text-warn" : "text-ink/60"}`}>{Math.round(st.battery)}%</span>
              </button>
            </li>
          );
        })}
      </ul>
    </Section>
  );
}

const KIND_CLASS = { info: "", success: "", warn: "text-warn" } as const;

export function Activity() {
  const t = useT();
  const lang = useLang();
  const events = useStore((s) => s.events);
  return (
    <Section title={t("activity.title")}>
      <ul className="scroll-thin max-h-40 space-y-1.5 overflow-y-auto pr-1">
        {events.length === 0 && <li className="text-xs text-ink/45">{t("activity.waiting")}</li>}
        {events.map((e) => (
          <li key={e.id} className="flex gap-3 text-xs leading-snug">
            <span className="shrink-0 text-ink/45">{fmtTime(e.at, lang)}</span>
            <span className={KIND_CLASS[e.kind]}>{renderMsg(t, e.key, e.params)}</span>
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
      <AgentPanel />
      <MachinePanel />
      <MaintenanceTable />
      <Fleet />
      <Benchmark />
      <Activity />
    </aside>
  );
}
