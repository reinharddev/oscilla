"use client";

import { useState } from "react";
import { Bell } from "lucide-react";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { fmtDateTime, type Key } from "@/lib/i18n";
import { useLang, useT } from "@/lib/i18n/use-t";
import { canWrite, useStore } from "@/lib/store";

/** Bell with the open alerts. An alert leads to the Copilot's explanation and then to a work order. */
export function AlertInbox() {
  const t = useT();
  const lang = useLang();
  const { alerts, machines, health, auth } = useStore();
  const [open, setOpen] = useState(false);

  const active = alerts.filter((a) => a.status !== "resolved");
  const unread = active.filter((a) => a.status === "open");
  const closed = alerts.filter((a) => a.status === "resolved");
  const label = (id: string) => machines.find((m) => m.id === id)?.label ?? id;

  function explain(assetId: string, askCopilot = true) {
    const m = machines.find((x) => x.id === assetId);
    if (!m) return;
    const s = useStore.getState();
    s.select(m);
    s.setView("machines");
    s.showTab("machine");
    if (askCopilot) s.requestCopilot(assetId);
    setOpen(false);
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon-sm" className="relative" aria-label={t("alerts.aria", { n: unread.length })}>
          <Bell />
          {unread.length > 0 && (
            <span className="absolute -right-0.5 -top-0.5 grid min-w-4 place-items-center rounded-full bg-destructive px-1 text-[10px] font-semibold leading-4 text-white">
              {unread.length}
            </span>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent className="w-full gap-0 sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{t("alerts.title")}</SheetTitle>
          <SheetDescription>{t("alerts.open", { n: active.length })}</SheetDescription>
        </SheetHeader>
        <div className="scroll-thin flex-1 overflow-y-auto px-4 pb-6">
          {active.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("alerts.empty")}</p>
          ) : (
            <ul className="flex flex-col">
              {active.map((a, i) => {
                const rul = health[a.asset_id]?.rulDays ?? a.rul_days;
                return (
                  <li key={a.id}>
                    {i > 0 && <Separator />}
                    <div className="flex flex-col gap-2 py-4">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium">{label(a.asset_id)}</span>
                        <StatusBadge status={a.severity}>
                          {a.kind === "data_quality" ? t("alerts.dq") : t(a.severity === "critical" ? "alerts.critical" : "alerts.attention")}
                        </StatusBadge>
                      </div>
                      {a.kind === "data_quality" ? (
                        <>
                          <ul className="text-sm text-muted-foreground">
                            {a.headline.split(",").filter(Boolean).map((code) => <li key={code}>{t(`alerts.dq.${code}` as Key)}</li>)}
                          </ul>
                          <p className="text-xs text-muted-foreground">
                            {t("alerts.dq.note")} · {t("alerts.since", { when: fmtDateTime(a.created_at, lang) })}
                          </p>
                        </>
                      ) : (
                        <>
                          <p className="text-sm text-muted-foreground">{a.headline || t("alerts.shift")}</p>
                          <p className="text-xs text-muted-foreground">
                            {[t("alerts.score", { n: Math.round(a.score) }), rul != null ? t("alerts.rul", { n: Math.max(0, Math.round(rul)) }) : null, t("alerts.since", { when: fmtDateTime(a.created_at, lang) })]
                              .filter(Boolean).join(" · ")}
                          </p>
                        </>
                      )}
                      <div className="flex gap-2">
                        {a.kind === "data_quality" ? (
                          <Button size="sm" variant="outline" onClick={() => explain(a.asset_id, false)}>{t("alerts.open.machine")}</Button>
                        ) : (
                          <Button size="sm" onClick={() => explain(a.asset_id)}>{t("alerts.explain")}</Button>
                        )}
                        {a.status === "open" && canWrite(auth) && (
                          <Button size="sm" variant="outline" onClick={() => void useStore.getState().acknowledgeAlert(a.id)}>{t("alerts.ack")}</Button>
                        )}
                        {a.status === "acknowledged" && <span className="self-center text-xs text-muted-foreground">{t("alerts.acked")}</span>}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          {closed.length > 0 && (
            <div className="mt-6">
              <p className="mb-2 text-xs text-muted-foreground">{t("alerts.earlier")}</p>
              <ul className="flex flex-col gap-1.5 text-sm text-muted-foreground">
                {closed.slice(0, 8).map((a) => (
                  <li key={a.id} className="flex justify-between gap-3">
                    <span>{label(a.asset_id)}</span>
                    <span>{t("alerts.resolved")}{a.resolved_at ? ` · ${fmtDateTime(a.resolved_at, lang)}` : ""}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
