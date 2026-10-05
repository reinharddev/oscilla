"use client";

import { Bot, Drone, Forklift, HardHat, Package, Truck, X } from "lucide-react";
import { useT } from "@/lib/i18n/use-t";
import type { Key } from "@/lib/i18n";
import { useStore } from "@/lib/store";

const ICON: Record<string, React.ComponentType<{ size?: number; strokeWidth?: number }>> = { forklift: Forklift, agv: Bot, drone: Drone, worker: HardHat, truck: Truck, conveyor: Package };
export function SelectedPanel() {
  const t = useT();
  const { selected, fleet, select } = useStore();
  if (!selected) return null;

  const Icon = ICON[selected.type];
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
      <button onClick={() => select(null)} className="shrink-0 p-1 text-ink/45 transition-colors duration-150 hover:text-ink" aria-label={t("sel.close")}><X size={16} /></button>
    </div>
  );
}
