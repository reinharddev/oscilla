"use client";

import { useRouter } from "next/navigation";
import { useLang, useT } from "@/lib/i18n/use-t";
import { fmtDateTime } from "@/lib/i18n";
import { useStore } from "@/lib/store";
import { Page, Panel, td, th } from "./shared";

/** Admin start screen: every warehouse of the organization side by side. */
export function OrganizationView() {
  const t = useT();
  const lang = useLang();
  const router = useRouter();
  const { org, auth, setView } = useStore();
  const total = (f: (w: (typeof org)[number]) => number) => org.reduce((n, w) => n + f(w), 0);

  return (
    <Page title={t("org.title")} aside={auth?.orgName}>
      <Panel>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-[13px]">
            <thead className="border-b border-rule">
              <tr>
                <th className={th}>{t("org.warehouse")}</th>
                <th className={`${th} text-right`}>{t("org.machines")}</th>
                <th className={`${th} text-right`}>{t("org.critical")}</th>
                <th className={`${th} text-right`}>{t("org.attention")}</th>
                <th className={`${th} text-right`}>{t("org.healthy")}</th>
                <th className={`${th} text-right`}>{t("org.avg")}</th>
                <th className={`${th} text-right`}>{t("org.open")}</th>
                <th className={`${th} text-right`}>{t("org.overdue")}</th>
                <th className={th}>{t("org.last")}</th>
                <th className={th} />
              </tr>
            </thead>
            <tbody className="divide-y divide-rule">
              {org.map((w) => (
                <tr key={w.id} className={w.id === auth?.warehouseId ? "bg-ink/5" : ""}>
                  <td className={`${td} font-medium`}>{w.name}</td>
                  <td className={`${td} text-right tabular-nums`}>{w.machines}</td>
                  <td className={`${td} text-right tabular-nums ${w.critical ? "font-semibold text-bad" : "text-ink/50"}`}>{w.critical}</td>
                  <td className={`${td} text-right tabular-nums ${w.attention ? "text-warn" : "text-ink/50"}`}>{w.attention}</td>
                  <td className={`${td} text-right tabular-nums`}>{w.healthy}</td>
                  <td className={`${td} text-right tabular-nums`}>{w.avgScore ?? "–"}</td>
                  <td className={`${td} text-right tabular-nums`}>{w.openOrders}</td>
                  <td className={`${td} text-right tabular-nums ${w.overdue ? "text-bad" : "text-ink/50"}`}>{w.overdue}</td>
                  <td className={`${td} text-xs text-ink/60`}>{w.lastReadingAt ? fmtDateTime(Date.parse(w.lastReadingAt), lang) : "–"}</td>
                  <td className={`${td} text-right`}>
                    {w.id === auth?.warehouseId ? (
                      <button onClick={() => setView("overview")} className="text-xs text-accent hover:underline">{t("org.current")}</button>
                    ) : (
                      <button onClick={() => router.push(`/?w=${w.id}`)} className="text-xs text-accent hover:underline">{t("org.switch")}</button>
                    )}
                  </td>
                </tr>
              ))}
              <tr className="border-t border-rule bg-ink/[0.03] font-semibold">
                <td className={td}>Σ</td>
                <td className={`${td} text-right tabular-nums`}>{total((w) => w.machines)}</td>
                <td className={`${td} text-right tabular-nums`}>{total((w) => w.critical)}</td>
                <td className={`${td} text-right tabular-nums`}>{total((w) => w.attention)}</td>
                <td className={`${td} text-right tabular-nums`}>{total((w) => w.healthy)}</td>
                <td className={td} />
                <td className={`${td} text-right tabular-nums`}>{total((w) => w.openOrders)}</td>
                <td className={`${td} text-right tabular-nums`}>{total((w) => w.overdue)}</td>
                <td className={td} colSpan={2} />
              </tr>
            </tbody>
          </table>
        </div>
      </Panel>
    </Page>
  );
}
