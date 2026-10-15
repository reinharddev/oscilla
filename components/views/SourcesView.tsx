"use client";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge } from "@/components/status-badge";
import { fmtDateTime } from "@/lib/i18n";
import { useLang, useT } from "@/lib/i18n/use-t";
import { useStore } from "@/lib/store";
import { Page, Panel } from "./shared";

const STALE_MS = 15 * 60_000;

/** Where each machine's numbers come from and whether the feed is alive. */
export function SourcesView() {
  const t = useT();
  const lang = useLang();
  const { machines, health, baselines } = useStore();
  const age = (ms: number) => (ms < 90 * 60_000 ? `${Math.max(1, Math.round(ms / 60_000))} min` : `${Math.round(ms / 3_600_000)} h`);

  return (
    <Page title={t("ds.title")}>
      <p className="text-sm text-muted-foreground">{t("ds.note")}</p>
      <Panel flush>
        <Table className="min-w-[700px]">
          <TableHeader>
            <TableRow>
              <TableHead className="pl-4">{t("ds.machine")}</TableHead><TableHead>{t("ds.last")}</TableHead><TableHead>{t("ds.source")}</TableHead>
              <TableHead>{t("ds.baseline")}</TableHead><TableHead className="pr-4" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {machines.map((m) => {
              const h = health[m.id];
              const b = baselines.find((x) => x.asset_id === m.id);
              const ageMs = h ? Date.now() - h.takenAt : null;
              const stale = ageMs !== null && ageMs > STALE_MS;
              return (
                <TableRow key={m.id}>
                  <TableCell className="pl-4">{m.label}<div className="text-xs text-muted-foreground">{m.serial}</div></TableCell>
                  <TableCell className="text-xs text-muted-foreground">{h ? fmtDateTime(h.takenAt, lang) : "–"}</TableCell>
                  <TableCell>{h ? (h.source === "simulator" ? t("fh.simulated") : t("fh.sensors")) : "–"}</TableCell>
                  <TableCell>
                    {b ? (
                      <>
                        {b.n_windows !== null && t("ds.windows", { n: b.n_windows })}
                        <div className="text-xs text-muted-foreground">{b.model_version} · {fmtDateTime(Date.parse(b.learned_at), lang)}</div>
                      </>
                    ) : <span className="text-warning">{t("ds.none")}</span>}
                  </TableCell>
                  <TableCell className="pr-4 text-right">
                    {ageMs === null ? null : <StatusBadge status={stale ? "attention" : "healthy"}>{stale ? t("ds.stale", { ago: age(ageMs) }) : t("ds.ok")}</StatusBadge>}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Panel>
    </Page>
  );
}
