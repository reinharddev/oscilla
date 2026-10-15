"use client";

import { useState } from "react";
import { fmtDate, type Key } from "@/lib/i18n";
import { useLang, useT } from "@/lib/i18n/use-t";
import { canAssignOthers } from "@/lib/roles";
import { useStore } from "@/lib/store";
import { Page, Panel, td, th, useOpenMachine } from "./shared";

type Filter = "all" | "open" | "done";

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
      <div role="group" className="mb-3 inline-flex overflow-hidden rounded-ui border border-rule text-xs">
        {(["open", "done", "all"] as const).map((f) => (
          <button key={f} onClick={() => setFilter(f)} aria-pressed={filter === f} className={`border-l border-rule px-3 py-1.5 first:border-l-0 ${filter === f ? "bg-ink/10 font-semibold" : "text-ink/60 hover:bg-ink/5"}`}>
            {t(`orders.${f}` as Key)}
          </button>
        ))}
      </div>
      <Panel>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-[13px]">
            <thead className="border-b border-rule">
              <tr>
                <th className={th}>{t("orders.machine")}</th><th className={th}>{t("orders.summary")}</th><th className={th}>{t("orders.status")}</th>
                <th className={th}>{t("orders.due")}</th><th className={th}>{t("orders.assignee")}</th><th className={th}>{t("orders.ai")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-rule">
              {rows.length === 0 && <tr><td colSpan={6} className="px-3 py-4 text-xs text-ink/50">{t("orders.empty")}</td></tr>}
              {rows.map((w) => {
                const m = machines.find((x) => x.id === w.asset_id);
                const editable = lead && (w.status === "scheduled" || w.status === "in_progress");
                return (
                  <tr key={w.id}>
                    <td className={td}><button onClick={() => open(m)} className="text-left font-medium hover:underline">{m?.label ?? "–"}</button></td>
                    <td className={`${td} max-w-[280px] text-ink/70`}><span className="line-clamp-2">{w.summary}</span></td>
                    <td className={td}>{t(`orders.st.${w.status}` as Key)}</td>
                    <td className={`${td} tabular-nums ${w.status === "scheduled" && w.due_at && Date.parse(w.due_at) < Date.now() ? "text-bad" : ""}`}>{w.due_at ? fmtDate(Date.parse(w.due_at), lang, { day: "numeric", month: "short" }) : "–"}</td>
                    <td className={td}>
                      {editable ? (
                        <select
                          aria-label={t("orders.assignee")}
                          value={w.assigned_to ?? ""}
                          onChange={(e) => assignWorkOrder(w.id, e.target.value || null)}
                          className="h-8 max-w-[170px] rounded-ui border border-rule bg-surface px-2 text-xs outline-none focus:border-accent"
                        >
                          <option value="">{t("orders.unassigned")}</option>
                          {people.map((p) => <option key={p.user_id} value={p.user_id}>{p.full_name || p.user_id.slice(0, 8)}</option>)}
                        </select>
                      ) : assignee(w.assigned_to)}
                    </td>
                    <td className={td}>{w.diagnosis_feedback ? t(`orders.ai.${w.diagnosis_feedback}` as Key) : t("orders.ai.none")}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>
    </Page>
  );
}
