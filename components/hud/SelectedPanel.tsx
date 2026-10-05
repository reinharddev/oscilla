"use client";

import { useEffect, useState } from "react";
import { Bot, Drone, Forklift, HardHat, Package, Truck, X, Zap } from "lucide-react";
import { useT } from "@/lib/i18n/use-t";
import type { Key } from "@/lib/i18n";
import { BOOST_COST, useStore } from "@/lib/store";

const ICON: Record<string, React.ComponentType<{ size?: number; strokeWidth?: number }>> = { forklift: Forklift, agv: Bot, drone: Drone, worker: HardHat, truck: Truck, conveyor: Package };
export function SelectedPanel() {
  const t = useT();
  const { selected, boosts, coins, boost, fleet, select } = useStore();
  const [, force] = useState(0);
  useEffect(() => { const id = setInterval(() => force((n) => n + 1), 500); return () => clearInterval(id); }, []);
  if (!selected) return null;

  const Icon = ICON[selected.type];
  const left = Math.max(0, Math.ceil(((boosts[selected.id] ?? 0) - Date.now()) / 1000));
  const f = fleet[selected.id];

  return (
    <div className="pointer-events-auto flex w-full max-w-xl items-center gap-3 rounded-ui border border-rule bg-surface px-3 py-3 sm:gap-5 sm:px-4">
      <span className="shrink-0"><Icon size={22} strokeWidth={1.6} /></span>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold">{selected.label}</div>
        <div className="hidden text-xs text-ink/60 sm:block">{t(`sel.desc.${selected.type}` as Key)}</div>
        {f && (
          <div className="mt-1 text-xs text-ink/60">
            {t("sel.battery", { pct: Math.round(f.battery) })} · <span className={f.status === "charging" ? "text-warn" : "text-ok"}>{f.status === "charging" ? t("fleet.charging") : t("fleet.active")}</span>
          </div>
        )}
      </div>
      {left > 0 ? (
        <div className="shrink-0 text-xs text-ink/70"><span className="font-semibold text-ink">{t("sel.boostActive", { s: left })}</span></div>
      ) : (
        <button
          disabled={coins < BOOST_COST}
          onClick={() => boost(selected.id)}
          className="inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-ui bg-accent px-3 text-xs font-semibold text-canvas transition-opacity duration-150 hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Zap size={13} fill="currentColor" /> {t("sel.boost", { cost: BOOST_COST })}
        </button>
      )}
      <button onClick={() => select(null)} className="shrink-0 p-1 text-ink/45 transition-colors duration-150 hover:text-ink" aria-label={t("sel.close")}><X size={16} /></button>
    </div>
  );
}
