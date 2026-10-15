"use client";

import { useT } from "@/lib/i18n/use-t";
import type { Key } from "@/lib/i18n";
import type { Role } from "@/lib/roles";
import { useStore } from "@/lib/store";
import { Page, Panel, td, th } from "./shared";

const ROLES: Role[] = ["admin", "manager", "technician", "viewer"];

/** Admin only: who works where, and in what role. The database refuses everything else. */
export function PeopleView() {
  const t = useT();
  const { members, warehouses, auth, setMemberRole } = useStore();
  const scope = (id: string | null) => (id === null ? t("people.all") : warehouses.find((w) => w.id === id)?.name ?? "–");

  return (
    <Page title={t("people.title")} aside={auth?.orgName}>
      <Panel>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-[13px]">
            <thead className="border-b border-rule">
              <tr><th className={th}>{t("people.name")}</th><th className={th}>{t("people.scope")}</th><th className={th}>{t("people.role")}</th></tr>
            </thead>
            <tbody className="divide-y divide-rule">
              {members.map((m) => {
                const me = m.user_id === auth?.userId;
                // Administrators are organization-wide, so a warehouse-scoped member cannot be made one.
                const options = m.warehouse_id === null ? ROLES : ROLES.filter((r) => r !== "admin");
                return (
                  <tr key={m.id}>
                    <td className={td}>{m.full_name || m.user_id.slice(0, 8)}{me && <span className="ml-2 text-xs text-ink/45">({t("people.you")})</span>}</td>
                    <td className={`${td} text-ink/70`}>{scope(m.warehouse_id)}</td>
                    <td className={td}>
                      <select
                        aria-label={t("people.role")}
                        value={m.role}
                        disabled={me}
                        onChange={(e) => setMemberRole(m.id, e.target.value as Role)}
                        className="h-8 rounded-ui border border-rule bg-surface px-2 text-xs outline-none focus:border-accent disabled:opacity-60"
                      >
                        {options.map((r) => <option key={r} value={r}>{t(`role.${r}` as Key)}</option>)}
                      </select>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>
      <p className="text-xs text-ink/55">{t("people.note")}</p>
    </Page>
  );
}
