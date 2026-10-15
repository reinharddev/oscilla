import { StatusBadge, type StatusKind } from "@/components/status-badge";
import { makeT, type Key, type Lang } from "@/lib/i18n";

const ROWS: { id: string; kind: string; status: StatusKind; score: number; bars: number[] }[] = [
  { id: "FL-014", kind: "Forklift", status: "critical", score: 38, bars: [30, 34, 33, 41, 52, 63, 78] },
  { id: "AGV-07", kind: "AGV", status: "attention", score: 61, bars: [28, 30, 35, 38, 42, 47, 55] },
  { id: "DR-03", kind: "Drone", status: "healthy", score: 92, bars: [20, 22, 19, 21, 20, 23, 21] },
  { id: "FL-009", kind: "Forklift", status: "healthy", score: 88, bars: [24, 22, 25, 23, 26, 24, 25] },
];

/** Static preview of the product, fictional values, decoration only. */
export default function Preview({ lang }: { lang: Lang }) {
  const t = makeT(lang);
  return (
    <div className="flex w-full max-w-md flex-col gap-4" aria-hidden>
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium">{t("login.previewTitle" as Key)}</p>
        <p className="text-xs text-muted-foreground">{t("login.previewNote" as Key)}</p>
      </div>
      <ul className="flex flex-col divide-y rounded-lg border bg-card">
        {ROWS.map((r) => (
          <li key={r.id} className="flex items-center gap-4 px-4 py-3">
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="text-sm font-medium">{r.id}</span>
              <span className="text-xs text-muted-foreground">{r.kind}</span>
            </div>
            <div className="flex h-8 items-end gap-0.5">
              {r.bars.map((b, i) => (
                <span key={i} className="w-1 rounded-sm bg-muted-foreground/40" style={{ height: `${b}%` }} />
              ))}
            </div>
            <span className="w-8 text-right text-sm tabular-nums">{r.score}</span>
            <StatusBadge status={r.status}>{t(`status.${r.status}` as Key)}</StatusBadge>
          </li>
        ))}
      </ul>
    </div>
  );
}
