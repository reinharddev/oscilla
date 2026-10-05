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
  const { messages, model } = JSON.parse(body);
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
