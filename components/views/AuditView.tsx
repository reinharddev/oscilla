"use client";

import { fmtDateTime, type Key } from "@/lib/i18n";
import { useLang, useT } from "@/lib/i18n/use-t";
import { useStore } from "@/lib/store";
import { Page, Panel, td, th } from "./shared";

/** One line per recorded change. The trail is written by database triggers, not by the app. */
export function AuditView() {
  const t = useT();
  const lang = useLang();
  const { audit, names, machines } = useStore();

  const what = (a: (typeof audit)[number]) => {
    const entity = t(`audit.entity.${a.entity}` as Key);
    const d = a.details as { new?: Record<string, unknown>; old?: Record<string, unknown> };
    const row = d.new ?? d.old ?? {};
    const machine = machines.find((m) => m.id === row.asset_id || m.id === row.id)?.label;
    const bits = [entity, machine, typeof row.status === "string" ? String(row.status).replace("_", " ") : typeof row.role === "string" ? String(row.role) : undefined].filter(Boolean);
    return bits.join(" · ");
  };

  return (
    <Page title={t("audit.title")}>
      <Panel>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[620px] text-[13px]">
            <thead className="border-b border-rule">
              <tr><th className={th}>{t("audit.when")}</th><th className={th}>{t("audit.who")}</th><th className={th}>{t("audit.what")}</th></tr>
            </thead>
            <tbody className="divide-y divide-rule">
              {audit.length === 0 && <tr><td colSpan={3} className="px-3 py-4 text-xs text-ink/50">{t("audit.empty")}</td></tr>}
              {audit.map((a) => (
                <tr key={a.id}>
                  <td className={`${td} whitespace-nowrap text-xs text-ink/60`}>{fmtDateTime(Date.parse(a.created_at), lang)}</td>
                  <td className={td}>{a.actor_id ? names[a.actor_id] || a.actor_id.slice(0, 8) : t("audit.system")}</td>
                  <td className={td}><span className="text-ink/60">{t(`audit.${a.action}` as Key)}</span> {what(a)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </Page>
  );
}
