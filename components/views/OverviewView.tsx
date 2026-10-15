"use client";

import { useT } from "@/lib/i18n/use-t";
import { scoreOf, statusKey } from "@/lib/health";
import { useStore } from "@/lib/store";
import { isLead } from "@/lib/roles";
import { Overview, WorkOrders } from "@/components/hud/Panels";
import { Page, Panel, useOpenMachine } from "./shared";

const STATUS_CLASS = { healthy: "text-ok", attention: "text-warn", critical: "text-bad" } as const;

/** Warehouse overview for managers, admins and viewers. Viewers get the same facts without actions. */
export function OverviewView() {
  const t = useT();
  const open = useOpenMachine();
  const { machines, health, auth } = useStore();
  const attention = machines
    .map((m) => ({ m, h: health[m.id] }))
    .filter((x) => x.h && x.h.status !== "healthy")
    .sort((a, b) => a.h.score - b.h.score);

  return (
    <Page title={t("view.overview")} aside={auth?.warehouseName}>
      {!isLead(auth?.role) && auth?.role === "viewer" && <p className="mb-4 border-l-2 border-ink/30 pl-3 text-xs text-ink/65">{t("ov2.readOnly")}</p>}
      <div className="mb-5 border border-rule bg-surface"><Overview /></div>
      <Panel title={t("ov2.attention")} aside={String(attention.length)}>
        {attention.length === 0 ? (
          <p className="px-4 py-3 text-xs text-ink/50">{t("ov2.none")}</p>
        ) : (
          <ul className="divide-y divide-rule">
            {attention.map(({ m, h }) => (
              <li key={m.id}>
                <button onClick={() => open(m)} className="grid w-full grid-cols-[1fr_auto_auto] items-center gap-4 px-4 py-2.5 text-left text-sm hover:bg-ink/5">
                  <span>{m.label}<span className="ml-2 text-xs text-ink/45">{m.serial}</span></span>
                  <span className={`text-xs ${STATUS_CLASS[h.status]}`}>{t(statusKey(h.status))}</span>
                  <span className={`w-8 text-right font-semibold tabular-nums ${STATUS_CLASS[h.status]}`}>{scoreOf(h)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Panel>
      <div className="border border-rule bg-surface"><WorkOrders /></div>
    </Page>
  );
}
