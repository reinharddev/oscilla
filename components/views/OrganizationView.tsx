"use client";

import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fmtDateTime } from "@/lib/i18n";
import { useLang, useT } from "@/lib/i18n/use-t";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import { Page, Panel } from "./shared";

/** Admin start screen: every warehouse of the organization side by side. */
export function OrganizationView() {
  const t = useT();
  const lang = useLang();
  const { org, auth, setView } = useStore();
  const total = (f: (w: (typeof org)[number]) => number) => org.reduce((n, w) => n + f(w), 0);
  const num = "text-right tabular-nums";

  return (
    <Page title={t("org.title")} purpose={t("purpose.org")} aside={auth?.orgName}>
      <Panel flush>
        <Table className="min-w-[860px]">
          <TableHeader>
            <TableRow>
              <TableHead className="pl-4">{t("org.warehouse")}</TableHead>
              <TableHead className={num}>{t("org.machines")}</TableHead>
              <TableHead className={num}>{t("org.critical")}</TableHead>
              <TableHead className={num}>{t("org.attention")}</TableHead>
              <TableHead className={num}>{t("org.healthy")}</TableHead>
              <TableHead className={num}>{t("org.avg")}</TableHead>
              <TableHead className={num}>{t("org.open")}</TableHead>
              <TableHead className={num}>{t("org.overdue")}</TableHead>
              <TableHead>{t("org.last")}</TableHead>
              <TableHead className="pr-4" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {org.map((w) => (
              <TableRow key={w.id} data-state={w.id === auth?.warehouseId ? "selected" : undefined}>
                <TableCell className="pl-4 font-medium">{w.name}</TableCell>
                <TableCell className={num}>{w.machines}</TableCell>
                <TableCell className={cn(num, w.critical ? "font-semibold text-destructive" : "text-muted-foreground")}>{w.critical}</TableCell>
                <TableCell className={cn(num, w.attention ? "font-medium text-warning" : "text-muted-foreground")}>{w.attention}</TableCell>
                <TableCell className={num}>{w.healthy}</TableCell>
                <TableCell className={num}>{w.avgScore ?? "–"}</TableCell>
                <TableCell className={num}>{w.openOrders}</TableCell>
                <TableCell className={cn(num, w.overdue ? "font-medium text-destructive" : "text-muted-foreground")}>{w.overdue}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{w.lastReadingAt ? fmtDateTime(Date.parse(w.lastReadingAt), lang) : "–"}</TableCell>
                <TableCell className="pr-4 text-right">
                  {w.id === auth?.warehouseId ? (
                    <Button variant="secondary" size="sm" onClick={() => setView("overview")}>{t("org.current")}</Button>
                  ) : (
                    <Button variant="outline" size="sm" onClick={() => void useStore.getState().loadWorkspace(w.id)}>{t("org.switch")}</Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
          <TableFooter>
            <TableRow>
              <TableCell className="pl-4">Σ</TableCell>
              <TableCell className={num}>{total((w) => w.machines)}</TableCell>
              <TableCell className={num}>{total((w) => w.critical)}</TableCell>
              <TableCell className={num}>{total((w) => w.attention)}</TableCell>
              <TableCell className={num}>{total((w) => w.healthy)}</TableCell>
              <TableCell />
              <TableCell className={num}>{total((w) => w.openOrders)}</TableCell>
              <TableCell className={num}>{total((w) => w.overdue)}</TableCell>
              <TableCell colSpan={2} />
            </TableRow>
          </TableFooter>
        </Table>
      </Panel>
    </Page>
  );
}
