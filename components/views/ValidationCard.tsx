"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useT } from "@/lib/i18n/use-t";
import result from "@/knowledge/validation-cwru.json";

const FAULT: Record<string, string> = { inner_race: "Inner race", ball: "Rolling element", outer_race: "Outer race" };
const named = (v: string | null) => (v ? FAULT[v] ?? v : null);

/** Results of scoring real bearing recordings with the production code. Only the derived numbers are kept in the repository. */
export function ValidationCard() {
  const t = useT();
  const detected = result.faults.filter((f) => f.detected_pct === 100).length;
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("val.title")}</CardTitle>
        <CardDescription>{t("val.note")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <div className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
          <div>
            <div className="text-xs text-muted-foreground">{t("val.detected")}</div>
            <div className="mt-0.5 text-2xl font-semibold tabular-nums">{detected} / {result.faults.length}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">{t("val.falseAlarms")}</div>
            <div className="mt-0.5 text-2xl font-semibold tabular-nums">{result.normal.false_alarm_pct}%</div>
            <div className="text-xs text-muted-foreground">{t("val.heldOut", { n: result.heldout_normal_windows })}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">{t("val.normalScore")}</div>
            <div className="mt-0.5 text-2xl font-semibold tabular-nums">{result.normal.median_score}</div>
          </div>
        </div>
        <Table className="min-w-[520px]">
          <TableHeader>
            <TableRow>
              <TableHead>{t("val.fault")}</TableHead><TableHead className="text-right">{t("val.size")}</TableHead>
              <TableHead className="text-right">{t("val.windows")}</TableHead><TableHead className="text-right">{t("val.median")}</TableHead>
              <TableHead className="text-right">{t("val.outcome")}</TableHead>
              <TableHead className="text-right">{t("val.named")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {result.faults.map((f) => (
              <TableRow key={f.file}>
                <TableCell>{FAULT[f.fault] ?? f.fault}</TableCell>
                <TableCell className="text-right tabular-nums">{f.diameter_in.toFixed(3)} in</TableCell>
                <TableCell className="text-right tabular-nums">{f.windows}</TableCell>
                <TableCell className="text-right tabular-nums">{f.median_score}</TableCell>
                <TableCell className="text-right">
                  <StatusBadge status={f.detected_pct === 100 ? "healthy" : "attention"}>{f.detected_pct === 100 ? t("val.allFlagged") : `${f.detected_pct}%`}</StatusBadge>
                </TableCell>
                <TableCell className="text-right text-muted-foreground">
                  {named(f.identified_as) ?? t("val.notNamed")}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <p className="text-xs text-muted-foreground">
          {t("val.typeSummary", { ok: result.type.named_correct, wrong: result.type.named_wrong, none: result.type.not_named, n: result.faults.length })}
        </p>
        <p className="text-xs text-muted-foreground">{t("val.caveat")}</p>
      </CardContent>
    </Card>
  );
}
