"use client";

import { useEffect, useState } from "react";
import { Bot, Drone, Forklift, HardHat, Package, Truck, X, Zap } from "lucide-react";
import { BOOST_COST, useStore } from "@/lib/store";

const ICON: Record<string, React.ComponentType<{ size?: number; strokeWidth?: number }>> = { forklift: Forklift, agv: Bot, drone: Drone, worker: HardHat, truck: Truck, conveyor: Package };
const DESC: Record<string, string> = {
  forklift: "Memindahkan pallet antar rak dan dock.",
  agv: "Robot otonom pengantar parcel di area packing.",
  drone: "Memindai inventory rak secara udara.",
  worker: "Staf gudang: picking, packing, loading.",
  truck: "Armada pengiriman yang bersandar di dock bay.",
};

export function SelectedPanel() {
  const { selected, boosts, coins, boost, fleet, select } = useStore();
  const [, force] = useState(0);
  useEffect(() => { const id = setInterval(() => force((n) => n + 1), 500); return () => clearInterval(id); }, []);
  if (!selected) return null;

  const Icon = ICON[selected.type];
  const left = Math.max(0, Math.ceil(((boosts[selected.id] ?? 0) - Date.now()) / 1000));
  const f = fleet[selected.id];

  return (
    <div className="pointer-events-auto flex items-center gap-5 rounded-ui border border-rule bg-surface px-4 py-3">
      <Icon size={22} strokeWidth={1.6} />
      <div className="min-w-[220px]">
        <div className="text-sm font-semibold">{selected.label}</div>
        <div className="text-xs text-ink/60">{DESC[selected.type]}</div>
        {f && (
          <div className="mt-1 text-xs text-ink/60">
            Baterai {Math.round(f.battery)}% · <span className={f.status === "charging" ? "text-warn" : "text-ok"}>{f.status === "charging" ? "Charging" : "Active"}</span>
          </div>
        )}
      </div>
      {left > 0 ? (
        <div className="text-xs text-ink/70"><span className="font-semibold text-ink">Boost 2×</span> aktif · {left}s</div>
      ) : (
        <button
          disabled={coins < BOOST_COST}
          onClick={() => boost(selected.id)}
          className="inline-flex h-8 items-center gap-1.5 rounded-ui bg-accent px-3 text-xs font-semibold text-canvas transition-opacity duration-150 hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Zap size={13} fill="currentColor" /> Boost 2× · {BOOST_COST} coins
        </button>
      )}
      <button onClick={() => select(null)} className="text-ink/45 transition-colors duration-150 hover:text-ink" aria-label="Tutup"><X size={16} /></button>
    </div>
  );
}
