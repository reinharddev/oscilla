"use client";

import { fmtDateTime } from "@/lib/i18n";
import { useLang, useT } from "@/lib/i18n/use-t";
import { useStore } from "@/lib/store";
import { Page, Panel, td, th } from "./shared";

const STALE_MS = 15 * 60_000;

/** Where each machine's numbers come from and whether the feed is alive. */
export function SourcesView() {
  const t = useT();
  const lang = useLang();
  const { machines, health, baselines } = useStore();
  const age = (ms: number) => (ms < 90 * 60_000 ? `${Math.max(1, Math.round(ms / 60_000))} min` : `${Math.round(ms / 3_600_000)} h`);

  return (
    <Page title={t("ds.title")}>
      <p className="mb-4 text-xs text-ink/60">{t("ds.note")}</p>
      <Panel>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[680px] text-[13px]">
            <thead className="border-b border-rule">
              <tr><th className={th}>{t("ds.machine")}</th><th className={th}>{t("ds.last")}</th><th className={th}>{t("ds.source")}</th><th className={th}>{t("ds.baseline")}</th><th className={th} /></tr>
            </thead>
            <tbody className="divide-y divide-rule">
              {machines.map((m) => {
                const h = health[m.id];
                const b = baselines.find((x) => x.asset_id === m.id);
                const ageMs = h ? Date.now() - h.takenAt : null;
                const stale = ageMs !== null && ageMs > STALE_MS;
                return (
                  <tr key={m.id}>
                    <td className={td}>{m.label}<div className="text-xs text-ink/45">{m.serial}</div></td>
                    <td className={`${td} text-xs text-ink/70`}>{h ? fmtDateTime(h.takenAt, lang) : "–"}</td>
                    <td className={td}>{h ? (h.source === "simulator" ? t("fh.simulated") : t("fh.sensors")) : "–"}</td>
                    <td className={td}>{b ? <>{b.n_windows !== null && t("ds.windows", { n: b.n_windows })}<div className="text-xs text-ink/45">{b.model_version} · {fmtDateTime(Date.parse(b.learned_at), lang)}</div></> : <span className="text-warn">{t("ds.none")}</span>}</td>
                    <td className={`${td} text-xs ${stale ? "text-warn" : "text-ok"}`}>{ageMs === null ? "" : stale ? t("ds.stale", { ago: age(ageMs) }) : t("ds.ok")}</td>
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
