"use client";

import { Info } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { StatusBadge } from "@/components/status-badge";
import { Overview, WorkOrders } from "@/components/hud/Panels";
import { scoreOf, statusKey } from "@/lib/health";
import { useT } from "@/lib/i18n/use-t";
import { useStore } from "@/lib/store";
import { ImpactCard } from "./ImpactCard";
import { Page, Panel, useOpenMachine } from "./shared";

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
      {auth?.role === "viewer" && (
        <Alert><Info /><AlertDescription>{t("ov2.readOnly")}</AlertDescription></Alert>
      )}
      <Overview />
      <ImpactCard />
      <Panel title={t("ov2.attention")} description={String(attention.length)}>
        {attention.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("ov2.none")}</p>
        ) : (
          <ul className="flex flex-col">
            {attention.map(({ m, h }, i) => (
              <li key={m.id}>
                {i > 0 && <Separator />}
                <Button variant="ghost" className="h-auto w-full justify-between rounded-none px-1 py-2.5 font-normal" onClick={() => open(m)}>
                  <span><span className="font-medium">{m.label}</span><span className="ml-2 text-xs text-muted-foreground">{m.serial}</span></span>
                  <span className="flex items-center gap-2">
                    <StatusBadge status={h.status}>{t(statusKey(h.status))}</StatusBadge>
                    <span className="w-8 text-right font-semibold tabular-nums">{scoreOf(h)}</span>
                  </span>
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Panel>
      <WorkOrders />
    </Page>
  );
}
