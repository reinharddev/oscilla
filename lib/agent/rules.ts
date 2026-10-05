import { executeTool } from "./tools";
import { renderSteps } from "./render";
import type { AgentResult, AssetBrief, Backend, Proposal, ToolContext, ToolStep } from "./types";

/**
 * Plain tokenization so "FK-02", "fk 02" and "FK02" are the same thing:
 * split letters from digits, drop punctuation and leading zeros.
 */
export function toks(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/([a-z])(\d)/g, "$1 $2")
    .replace(/(\d)([a-z])/g, "$1 $2")
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .map((t) => (/^\d+$/.test(t) ? String(Number(t)) : t));
}

function aliases(a: AssetBrief): string[][] {
  const words = a.name.split(/\s+/);
  const last = words[words.length - 1];
  const short = /[a-z]/i.test(last) ? [last] : words.slice(-2);
  return [toks(a.name), toks(a.serial), toks(short.join(" "))].filter((t) => t.length > 0);
}
const contains = (hay: string[], needle: string[]) => hay.some((_, i) => needle.every((t, j) => hay[i + j] === t));

/** Find which machine a question is about: the longest matching alias wins; ties are ambiguous. */
export function findAsset(question: string, assets: AssetBrief[], selectedId?: string | null): { asset?: AssetBrief; ambiguous?: AssetBrief[] } {
  const q = toks(question);
  let best = 0;
  let found: AssetBrief[] = [];
  for (const a of assets) {
    const len = Math.max(0, ...aliases(a).filter((al) => contains(q, al)).map((al) => al.length));
    if (len === 0) continue;
    if (len > best) { best = len; found = [a]; } else if (len === best) found.push(a);
  }
  if (found.length === 1) return { asset: found[0] };
  if (found.length > 1) return { ambiguous: found };
  if (selectedId && /\b(ini|tersebut|yang dipilih|terpilih)\b/i.test(question)) {
    const sel = assets.find((a) => a.id === selectedId);
    if (sel) return { asset: sel };
  }
  return {};
}

export function parseDueDays(q: string): number {
  const s = q.toLowerCase();
  if (/hari ini|sekarang/.test(s)) return 0;
  if (/lusa/.test(s)) return 2;
  if (/besok/.test(s)) return 1;
  if (/minggu depan/.test(s)) return 7;
  const m = /(\d{1,2})\s*hari/.exec(s);
  return m ? Math.min(30, Number(m[1])) : 1;
}

const STATUS_WORD: [RegExp, "critical" | "attention" | "healthy" | "problem"][] = [
  [/kritis|critical|parah|rusak/, "critical"],
  [/perlu perhatian|waspada|attention/, "attention"],
  [/bermasalah|masalah|bahaya|tidak sehat/, "problem"],
  [/sehat|aman|normal/, "healthy"],
];

/**
 * Offline planner used when no language model is configured. It maps common questions to the
 * same tools the LLM would call, so the behavior, permissions and audit trail are identical;
 * only the choice of tools is simpler.
 */
export async function runRules(question: string, backend: Backend, ctx: ToolContext): Promise<AgentResult> {
  const t0 = Date.now();
  const q = question.toLowerCase();
  const steps: ToolStep[] = [];
  const proposals: Proposal[] = [];
  const intro: string[] = [];
  const warnings: string[] = [];

  const run = async (tool: string, args: unknown) => {
    const r = await executeTool(backend, tool, args, ctx);
    steps.push({ tool, args: r.args, ok: r.ok, summary: r.summary, data: r.data });
    if (r.proposal) proposals.push(r.proposal);
    return r;
  };

  const assets = await backend.listAssets({ limit: 30 });
  const match = findAsset(question, assets, ctx.selectedAssetId);
  const ref = match.asset?.id;

  if (match.ambiguous) {
    return { mode: "rules", answer: `Nama mesin kurang jelas. Maksud kamu: ${match.ambiguous.map((a) => a.name).join(", ")}?`, steps, proposals, warnings, latencyMs: Date.now() - t0 };
  }

  // The question names a machine code (FK-02, R2, S1…) that is not among the machines this user can see.
  const code = ref ? null : /\b[a-z]{1,4}-\d{1,4}\b|\b[a-z]{1,3}\d{1,4}\b|\b[a-z]{2,3}\s\d{2}\b/i.exec(question);
  if (code) {
    return { mode: "rules", answer: `Mesin "${code[0]}" tidak ditemukan, atau kamu tidak punya akses ke mesin tersebut.`, steps, proposals, warnings, latencyMs: Date.now() - t0 };
  }

  const wantsProposal = /(buat|buatkan|bikin|jadwalkan|jadwal kan|schedule)/.test(q) && /(work order|servis|service|maintenance|perawatan|perbaikan|inspeksi)/.test(q);
  const wantsJournal = /(jurnal|catatan|riwayat|history)/.test(q);
  const wantsService = /(terakhir|kapan).*(servis|diservis|service|maintenance)|servis terakhir/.test(q);
  const wantsOrders = /(work order|terjadwal|jadwal)/.test(q);
  const wantsManual = /(manual|prosedur|cara|langkah|panduan|ganti)/.test(q);
  const wantsWhy = /(kenapa|mengapa|penyebab|diagnosis|diagnosa|analisis|ada apa|bagaimana kondisi|kondisi)/.test(q);

  if (wantsProposal) {
    if (!ref) {
      intro.push("Mesin mana yang dimaksud? Sebutkan nama atau kodenya, misalnya \"jadwalkan servis FK-02 besok\".");
    } else {
      const h = await run("get_asset_health", { asset: ref });
      const brief = (h.data as { brief?: AssetBrief; evidence?: { label: string }[] })?.brief;
      const top = (h.data as { evidence?: { label: string }[] })?.evidence?.[0];
      const status = brief?.status;
      const summary = brief?.score != null
        ? `Inspeksi ${brief.name}: skor kesehatan ${brief.score}${top ? `, penyimpangan terbesar pada ${top.label}` : ""}.`
        : `Inspeksi rutin ${match.asset!.name}.`;
      await run("propose_work_order", {
        asset: ref, summary, due_in_days: parseDueDays(q),
        urgency: status === "critical" ? "immediate" : status === "attention" ? "within_days" : "monitor",
      });
    }
  } else if (ref && wantsJournal) {
    await run("get_journal", { asset: ref, limit: 5 });
  } else if (ref && wantsService) {
    await run("get_asset_health", { asset: ref });
    await run("list_work_orders", { asset: ref, status: "done" });
  } else if (ref && wantsManual) {
    await run("search_manuals", { query: question, asset: ref });
  } else if (ref && wantsOrders) {
    await run("list_work_orders", { asset: ref });
  } else if (ref && wantsWhy) {
    await run("get_asset_health", { asset: ref });
    await run("diagnose_asset", { asset: ref });
  } else if (ref) {
    await run("get_asset_health", { asset: ref });
  } else if (wantsOrders) {
    await run("list_work_orders", { status: "scheduled" });
  } else if (wantsManual) {
    await run("search_manuals", { query: question });
  } else {
    const hit = STATUS_WORD.find(([re]) => re.test(q));
    if (hit) {
      await run("list_assets", { status: hit[1] });
    } else {
      intro.push("Saya belum yakin maksud pertanyaannya, jadi ini ringkasan mesin yang perlu perhatian. Coba tanyakan misalnya \"mesin mana yang kritis?\" atau \"kenapa FK-02 skornya turun?\".");
      await run("list_assets", { status: "problem" });
    }
  }

  const answer = [...intro, renderSteps(steps)].filter(Boolean).join("\n\n");
  return { mode: "rules", answer, steps, proposals, warnings, latencyMs: Date.now() - t0 };
}
