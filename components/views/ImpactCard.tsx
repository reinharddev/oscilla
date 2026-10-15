"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { computeImpact, DEFAULT_ASSUMPTIONS, type ImpactAssumptions } from "@/lib/impact";
import { useT } from "@/lib/i18n/use-t";
import { useStore } from "@/lib/store";

const KEY = "wt-impact-assumptions";
const usd = (n: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
const num = (v: string, fallback: number) => (v.trim() !== "" && Number.isFinite(Number(v)) && Number(v) >= 0 ? Number(v) : fallback);

function Figure({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-2xl font-semibold tabular-nums">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}

/** Measurable effect of the product, computed from this warehouse's own records and stated assumptions. */
export function ImpactCard() {
  const t = useT();
  const { machines, health, workOrders } = useStore();
  const [a, setA] = useState<ImpactAssumptions>(DEFAULT_ASSUMPTIONS);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) setA({ ...DEFAULT_ASSUMPTIONS, ...JSON.parse(raw), costPerHour: { ...DEFAULT_ASSUMPTIONS.costPerHour, ...JSON.parse(raw).costPerHour } });
    } catch { /* defaults */ }
  }, []);
  const update = (next: ImpactAssumptions) => {
    setA(next);
    try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* not persisted */ }
  };

  const r = useMemo(
    () => computeImpact(Date.now(), workOrders.map((w) => ({ ...w, ai: w.ai })), machines, health, a),
    [workOrders, machines, health, a],
  );
  const hours = (n: number | null) => {
    if (n === null) return t("impact.none");
    if (n < 1 / 60) return "< 1 min";
    if (n < 1) return `${Math.round(n * 60)} min`;
    return t("impact.hoursUnit", { n: n < 10 ? n.toFixed(1) : Math.round(n) });
  };
  const types = [...new Set(machines.map((m) => m.type))];

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("impact.title", { n: r.windowDays })}</CardTitle>
        <CardDescription>{t("impact.note")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <div className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-3">
          <Figure label={t("impact.cost")} value={usd(r.costAvoided)} sub={t("impact.costSub", { jobs: r.aiJobs })} />
          <Figure label={t("impact.hours")} value={r.downtimeAvoidedHours.toFixed(r.downtimeAvoidedHours % 1 ? 1 : 0)} sub={t("impact.hoursSub")} />
          <Figure label={t("impact.time")} value={(r.techMinutesSaved / 60).toFixed(1)} sub={t("impact.timeSub")} />
          <Figure label={t("impact.response")} value={hours(r.medianResponseHours)} />
          <Figure label={t("impact.repair")} value={hours(r.medianRepairHours)} />
          <Figure
            label={t("impact.atRisk")}
            value={usd(r.costAtRisk)}
            sub={t("impact.atRiskSub", { n: r.flagged, open: r.flaggedWithoutOrder })}
          />
        </div>

        <Collapsible>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="-ml-2 gap-1 text-muted-foreground">
              {t("impact.assumptions")}<ChevronDown data-icon="inline-end" />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-3">
            <p className="mb-4 text-xs text-muted-foreground">{t("impact.formula")}</p>
            <FieldGroup className="grid gap-4 sm:grid-cols-2">
              {types.map((ty) => (
                <Field key={ty}>
                  <FieldLabel htmlFor={`cph-${ty}`}>{t("impact.perHour", { type: ty })}</FieldLabel>
                  <Input id={`cph-${ty}`} type="number" min={0} inputMode="decimal" value={a.costPerHour[ty] ?? a.costPerHour.other}
                    onChange={(e) => update({ ...a, costPerHour: { ...a.costPerHour, [ty]: num(e.target.value, 0) } })} />
                </Field>
              ))}
              <Field>
                <FieldLabel htmlFor="im-un">{t("impact.unplanned")}</FieldLabel>
                <Input id="im-un" type="number" min={0} value={a.unplannedHours} onChange={(e) => update({ ...a, unplannedHours: num(e.target.value, a.unplannedHours) })} />
              </Field>
              <Field>
                <FieldLabel htmlFor="im-pl">{t("impact.planned")}</FieldLabel>
                <Input id="im-pl" type="number" min={0} value={a.plannedHours} onChange={(e) => update({ ...a, plannedHours: num(e.target.value, a.plannedHours) })} />
              </Field>
              <Field>
                <FieldLabel htmlFor="im-sh">{t("impact.share")}</FieldLabel>
                <Input id="im-sh" type="number" min={0} max={100} value={Math.round(a.preventedShare * 100)}
                  onChange={(e) => update({ ...a, preventedShare: Math.min(100, num(e.target.value, a.preventedShare * 100)) / 100 })} />
              </Field>
              <Field>
                <FieldLabel htmlFor="im-mn">{t("impact.minutes")}</FieldLabel>
                <Input id="im-mn" type="number" min={0} value={a.minutesSavedPerJob} onChange={(e) => update({ ...a, minutesSavedPerJob: num(e.target.value, a.minutesSavedPerJob) })} />
              </Field>
            </FieldGroup>
            <Button variant="outline" size="sm" className="mt-4" onClick={() => update(DEFAULT_ASSUMPTIONS)}>{t("impact.reset")}</Button>
          </CollapsibleContent>
        </Collapsible>
      </CardContent>
    </Card>
  );
}
