import type { ToolStep } from "./types";

const STATUS_ID = { healthy: "sehat", attention: "perlu perhatian", critical: "kritis" } as const;
const WO_ID: Record<string, string> = { scheduled: "terjadwal", in_progress: "sedang dikerjakan", done: "selesai", cancelled: "dibatalkan" };
const fmtNum = (v: number) => (Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(2));
const day = (iso: string) => new Date(iso).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });

interface Brief { name: string; score: number | null; status: keyof typeof STATUS_ID | null; lastServiceDays: number | null; scheduledFor: string | null; warehouse?: string }
const briefLine = (m: Brief) =>
  `- ${m.name}: ${m.score === null ? "belum ada data" : `skor ${m.score} (${m.status ? STATUS_ID[m.status] : "-"})`}` +
  (m.lastServiceDays !== null ? `, servis terakhir ${m.lastServiceDays} hari lalu` : "") +
  (m.scheduledFor ? `, terjadwal ${day(m.scheduledFor)}` : "");

/** Deterministic Indonesian rendering of one tool result. It only restates what the tool returned. */
export function renderStep(s: ToolStep): string {
  const d = s.data as Record<string, any>;
  if (!s.ok) {
    if (d?.error === "ambiguous") return `Nama mesin kurang jelas. Maksud kamu: ${(d.candidates as string[]).slice(0, 4).join(", ")}?`;
    if (d?.error === "not_found") return "Mesin itu tidak ditemukan, atau kamu tidak punya akses ke mesin tersebut.";
    if (d?.error === "forbidden") return d.message as string;
    return `Langkah "${s.tool}" gagal: ${s.summary}.`;
  }
  switch (s.tool) {
    case "list_assets": {
      const rows = d.machines as Brief[];
      if (rows.length === 0) return "Tidak ada mesin yang cocok.";
      return `Ada ${rows.length} mesin:\n${rows.map(briefLine).join("\n")}`;
    }
    case "get_asset_health": {
      const b = d.brief as Brief;
      const ev = (d.evidence as { label: string; value: number; baseline: number }[])[0];
      const trend = (d.recentScores as number[]).slice(0, 4);
      return [
        briefLine(b).replace(/^- /, ""),
        ev ? `Penyimpangan terbesar: ${ev.label} bernilai ${fmtNum(ev.value)} (normal ${fmtNum(ev.baseline)}).` : "Tidak ada fitur sinyal yang menyimpang dari baseline.",
        trend.length > 1 ? `Skor terbaru berturut-turut: ${trend.join(", ")}.` : "",
      ].filter(Boolean).join("\n");
    }
    case "get_journal": {
      const rows = d.entries as { when: string; author?: string; kind: string; text: string }[];
      return rows.length ? `Jurnal ${d.asset}:\n${rows.map((r) => `- ${r.when}${r.author ? ` (${r.author})` : ""}: ${r.text}`).join("\n")}` : `Belum ada catatan jurnal untuk ${d.asset}.`;
    }
    case "list_work_orders": {
      const rows = d.workOrders as { asset: string; status: string; dueAt: string | null; completedAt: string | null }[];
      if (!rows.length) return "Tidak ada work order yang cocok.";
      return `Ada ${rows.length} work order:\n${rows.map((r) => `- ${r.asset}: ${WO_ID[r.status] ?? r.status}${r.dueAt ? `, jatuh tempo ${day(r.dueAt)}` : ""}${r.completedAt ? `, selesai ${day(r.completedAt)}` : ""}`).join("\n")}`;
    }
    case "search_manuals": {
      const hits = d.hits as { title: string; detail: string; text: string }[];
      return hits.length ? hits.map((h) => `- ${h.title}, ${h.detail}: ${h.text.slice(0, 220)}${h.text.length > 220 ? "…" : ""}`).join("\n") : "Tidak ada bagian manual yang cocok.";
    }
    case "diagnose_asset": {
      const recs = d.recommendations as { action: string }[];
      return [d.summary, d.likelyCause ? `Dugaan penyebab: ${d.likelyCause}` : "", ...recs.map((r) => `- ${r.action}`), d.reviewRequired ? "Perlu ditinjau teknisi sebelum tindakan." : ""].filter(Boolean).join("\n");
    }
    case "propose_work_order":
      return `Saya menyiapkan usulan work order untuk ${d.asset}, jatuh tempo ${day(d.dueAt as string)}. Belum ada yang dibuat; konfirmasi usulan di bawah untuk menjadwalkannya.`;
    default:
      return s.summary;
  }
}

export const renderSteps = (steps: ToolStep[]) => steps.map(renderStep).join("\n\n");
