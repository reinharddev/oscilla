"use client";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fmtDateTime, type Key } from "@/lib/i18n";
import { useLang, useT } from "@/lib/i18n/use-t";
import { useStore } from "@/lib/store";
import { Page, Panel } from "./shared";

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
      <Panel flush>
        <Table className="min-w-[620px]">
          <TableHeader>
            <TableRow><TableHead className="pl-4">{t("audit.when")}</TableHead><TableHead>{t("audit.who")}</TableHead><TableHead className="pr-4">{t("audit.what")}</TableHead></TableRow>
          </TableHeader>
          <TableBody>
            {audit.length === 0 && <TableRow><TableCell colSpan={3} className="py-6 text-center text-muted-foreground">{t("audit.empty")}</TableCell></TableRow>}
            {audit.map((a) => (
              <TableRow key={a.id}>
                <TableCell className="whitespace-nowrap pl-4 text-xs text-muted-foreground">{fmtDateTime(Date.parse(a.created_at), lang)}</TableCell>
                <TableCell>{a.actor_id ? names[a.actor_id] || a.actor_id.slice(0, 8) : t("audit.system")}</TableCell>
                <TableCell className="pr-4"><span className="text-muted-foreground">{t(`audit.${a.action}` as Key)}</span> {what(a)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Panel>
    </Page>
  );
}
