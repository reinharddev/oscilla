"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { StatusBadge, type StatusKind } from "@/components/status-badge";
import { fmtDate, type Key } from "@/lib/i18n";
import { useLang, useT } from "@/lib/i18n/use-t";
import { canAssignOthers } from "@/lib/roles";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import { Page, Panel, useOpenMachine } from "./shared";

type Filter = "all" | "open" | "done";
const NONE = "none";
const ST: Record<string, StatusKind> = { scheduled: "maintenance", in_progress: "attention", done: "healthy", cancelled: "maintenance" };

/** Every work order of the warehouse. Managers and admins assign people here. */
export function OrdersView() {
  const t = useT();
  const lang = useLang();
  const open = useOpenMachine();
  const { workOrders, machines, people, auth, names, assignWorkOrder } = useStore();
  const [filter, setFilter] = useState<Filter>("open");
  const lead = canAssignOthers(auth?.role);

  const rows = workOrders
    .filter((w) => (filter === "all" ? true : filter === "open" ? w.status === "scheduled" || w.status === "in_progress" : w.status === "done"))
    .sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""));
  const assignee = (id?: string | null) => (id ? names[id] || people.find((p) => p.user_id === id)?.full_name || "–" : t("orders.unassigned"));

  return (
    <Page title={t("orders.title")} aside={auth?.warehouseName}>
      <ToggleGroup type="single" variant="outline" size="sm" value={filter} onValueChange={(v) => v && setFilter(v as Filter)} className="justify-start" spacing={0}>
        {(["open", "done", "all"] as const).map((f) => <ToggleGroupItem key={f} value={f}>{t(`orders.${f}` as Key)}</ToggleGroupItem>)}
      </ToggleGroup>
      <Panel flush>
        <Table className="min-w-[760px]">
          <TableHeader>
            <TableRow>
              <TableHead className="pl-4">{t("orders.machine")}</TableHead><TableHead>{t("orders.summary")}</TableHead><TableHead>{t("orders.status")}</TableHead>
              <TableHead>{t("orders.due")}</TableHead><TableHead>{t("orders.assignee")}</TableHead><TableHead className="pr-4">{t("orders.ai")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && <TableRow><TableCell colSpan={6} className="py-6 text-center text-muted-foreground">{t("orders.empty")}</TableCell></TableRow>}
            {rows.map((w) => {
              const m = machines.find((x) => x.id === w.asset_id);
              const editable = lead && (w.status === "scheduled" || w.status === "in_progress");
              const late = w.status === "scheduled" && w.due_at && Date.parse(w.due_at) < Date.now();
              return (
                <TableRow key={w.id}>
                  <TableCell className="pl-4"><Button variant="link" className="h-auto p-0 font-medium text-foreground" onClick={() => open(m)}>{m?.label ?? "–"}</Button></TableCell>
                  <TableCell className="max-w-[280px] whitespace-normal text-muted-foreground"><span className="line-clamp-2">{w.summary}</span></TableCell>
                  <TableCell><StatusBadge status={ST[w.status]}>{t(`orders.st.${w.status}` as Key)}</StatusBadge></TableCell>
                  <TableCell className={cn("tabular-nums", late && "font-medium text-destructive")}>{w.due_at ? fmtDate(Date.parse(w.due_at), lang, { day: "numeric", month: "short" }) : "–"}</TableCell>
                  <TableCell>
                    {editable ? (
                      <Select value={w.assigned_to ?? NONE} onValueChange={(v) => void assignWorkOrder(w.id, v === NONE ? null : v)}>
                        <SelectTrigger size="sm" className="w-44" aria-label={t("orders.assignee")}><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectGroup>
                            <SelectItem value={NONE}>{t("orders.unassigned")}</SelectItem>
                            {people.map((p) => <SelectItem key={p.user_id} value={p.user_id}>{p.full_name || p.user_id.slice(0, 8)}</SelectItem>)}
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                    ) : assignee(w.assigned_to)}
                  </TableCell>
                  <TableCell className="pr-4">{w.diagnosis_feedback ? t(`orders.ai.${w.diagnosis_feedback}` as Key) : t("orders.ai.none")}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Panel>
    </Page>
  );
}
