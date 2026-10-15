"use client";

import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { Key } from "@/lib/i18n";
import { useT } from "@/lib/i18n/use-t";
import type { Role } from "@/lib/roles";
import { useStore } from "@/lib/store";
import { Page, Panel } from "./shared";

const ROLES: Role[] = ["admin", "manager", "technician", "viewer"];

/** Admin only: who works where, and in what role. The database refuses everything else. */
export function PeopleView() {
  const t = useT();
  const { members, warehouses, auth, setMemberRole } = useStore();
  const scope = (id: string | null) => (id === null ? t("people.all") : warehouses.find((w) => w.id === id)?.name ?? "–");

  return (
    <Page title={t("people.title")} purpose={t("purpose.people")} aside={auth?.orgName}>
      <Panel flush>
        <Table className="min-w-[560px]">
          <TableHeader>
            <TableRow><TableHead className="pl-4">{t("people.name")}</TableHead><TableHead>{t("people.scope")}</TableHead><TableHead className="pr-4">{t("people.role")}</TableHead></TableRow>
          </TableHeader>
          <TableBody>
            {members.map((m) => {
              const me = m.user_id === auth?.userId;
              // Administrators are organization-wide, so a warehouse-scoped member cannot be made one.
              const options = m.warehouse_id === null ? ROLES : ROLES.filter((r) => r !== "admin");
              return (
                <TableRow key={m.id}>
                  <TableCell className="pl-4">{m.full_name || m.user_id.slice(0, 8)}{me && <span className="ml-2 text-xs text-muted-foreground">({t("people.you")})</span>}</TableCell>
                  <TableCell className="text-muted-foreground">{scope(m.warehouse_id)}</TableCell>
                  <TableCell className="pr-4">
                    <Select value={m.role} disabled={me} onValueChange={(v) => void setMemberRole(m.id, v as Role)}>
                      <SelectTrigger size="sm" className="w-40" aria-label={t("people.role")}><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectGroup>{options.map((r) => <SelectItem key={r} value={r}>{t(`role.${r}` as Key)}</SelectItem>)}</SelectGroup>
                      </SelectContent>
                    </Select>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Panel>
      <p className="text-sm text-muted-foreground">{t("people.note")}</p>
    </Page>
  );
}
