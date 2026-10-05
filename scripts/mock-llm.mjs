// A tiny OpenAI-compatible chat endpoint for developing the Copilot without a GPU.
//   node scripts/mock-llm.mjs            -> grounded answers
//   MOCK_MODE=liar node scripts/mock-llm.mjs -> invents a number and a citation (to test guardrails)
import { createServer } from "node:http";

const mode = process.env.MOCK_MODE ?? "honest";
const port = Number(process.env.PORT ?? 8199);

createServer(async (req, res) => {
  if (req.method !== "POST" || !req.url?.endsWith("/chat/completions")) { res.writeHead(404).end(); return; }
  let body = "";
  for await (const c of req) body += c;
  const { messages, model, tools } = JSON.parse(body);
  if (tools) return agentReply(res, messages, model);
  const user = messages.find((m) => m.role === "user").content;
  const facts = JSON.parse(user.slice(user.indexOf("{"), user.indexOf("\n\nSOURCES:")));
  const h = facts.health;
  const top = h?.evidence?.[0];
  const hasM1 = /\[M1\]/.test(user);

  const answer = mode === "liar"
    ? {
        summary: `${facts.machine.name} rusak parah dan akan gagal dalam 3 hari.`,
        likelyCause: "Bearing hancur.",
        recommendations: [{ action: "Ganti bearing dan kencangkan mur dengan 777 Nm.", urgency: "immediate", citations: ["M9"] }],
        needsHumanReview: false, reviewReason: "",
      }
    : {
        summary: h
          ? `${facts.machine.name} berstatus ${h.status} dengan skor ${h.score}.${top ? ` ${top.labelId} bernilai ${top.value.toFixed(2)} dibanding normal ${top.baseline.toFixed(2)}.` : ""}`
          : `${facts.machine.name}: tidak ada data analisis sensor yang segar.`,
        likelyCause: top?.feature === "bpfo_envelope_ratio" ? "Pola khas keausan bearing." : "Belum dapat dipastikan dari sinyal.",
        recommendations: [{ action: hasM1 ? "Lakukan inspeksi sesuai prosedur di manual [M1]." : "Periksa mesin secara langsung.", urgency: h?.status === "critical" ? "immediate" : "within_days", citations: hasM1 ? ["M1"] : [] }],
        needsHumanReview: false, reviewReason: "",
      };
  await new Promise((r) => setTimeout(r, 400));
  res.writeHead(200, { "content-type": "application/json" });
  res.end(JSON.stringify({ model: model ?? "mock", usage: { prompt_tokens: Math.round(user.length / 4), completion_tokens: 140 }, choices: [{ message: { role: "assistant", content: JSON.stringify(answer) } }] }));
}).listen(port, () => console.log(`mock LLM (${mode}) on :${port}`));

/** Agent mode: a tiny rule-based "model" that calls tools, then restates the tool results. */
function agentReply(res, messages, model) {
  const send = (message) => {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ model: model ?? "mock", usage: { prompt_tokens: 600, completion_tokens: 60 }, choices: [{ message }] }));
  };
  const lastTool = [...messages].reverse().find((m) => m.role === "tool");
  const question = [...messages].reverse().find((m) => m.role === "user").content.toLowerCase();
  const call = (name, args) => send({ role: "assistant", content: null, tool_calls: [{ id: "call_1", type: "function", function: { name, arguments: JSON.stringify(args) } }] });

  if (!lastTool) {
    const code = /\b(fk-?\d+|[a-z]{1,3}\d)\b/.exec(question)?.[0];
    if (/jadwalkan|buat/.test(question) && code) return call("propose_work_order", { asset: code, summary: "Inspeksi mesin sesuai permintaan pengguna.", due_in_days: 1 });
    if (code) return call("get_asset_health", { asset: code });
    if (/kritis/.test(question)) return call("list_assets", { status: "critical" });
    return call("list_assets", { status: "problem" });
  }

  const data = JSON.parse(lastTool.content);
  const tail = mode === "liar" ? " Mesin ini akan gagal dalam 9 hari." : "";
  if (data.error === "forbidden") return send({ role: "assistant", content: `Maaf, ${data.message}` });
  if (data.error) return send({ role: "assistant", content: "Mesin itu tidak ditemukan atau kamu tidak punya akses." });
  if (data.machines) {
    const list = data.machines.map((m) => `${m.name} (skor ${m.score}, ${m.status})`).join("; ");
    return send({ role: "assistant", content: data.machines.length ? `Ada ${data.count} mesin: ${list}.${tail}` : "Tidak ada mesin yang cocok." });
  }
  if (data.proposed) return send({ role: "assistant", content: `Saya menyiapkan usulan work order untuk ${data.asset}. Ini baru usulan; konfirmasi dulu supaya dibuat.${tail}` });
  if (data.brief) return send({ role: "assistant", content: `${data.brief.name} berskor ${data.brief.score} (${data.brief.status}).${tail}` });
  return send({ role: "assistant", content: "Selesai." + tail });
}
