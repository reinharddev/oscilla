// Checks the LLM endpoint configured in .env.local without printing the key.
//   npm run check:llm
const base = (process.env.LLM_BASE_URL ?? "").replace(/\/$/, "");
const key = process.env.LLM_API_KEY;
const model = process.env.LLM_MODEL;
if (!base) { console.error("LLM_BASE_URL is empty: the app will use template and rule-based mode."); process.exit(1); }
const headers = { "content-type": "application/json", ...(key ? { authorization: `Bearer ${key}` } : {}) };
console.log(`endpoint: ${base}\nmodel:    ${model ?? "(unset)"}\nkey:      ${key ? `set (${key.length} chars)` : "not set"}`);

const list = await fetch(`${base}/models`, { headers }).catch((e) => ({ ok: false, status: String(e) }));
if (list.ok) {
  const ids = (await list.json()).data?.map((m) => m.id) ?? [];
  console.log(`models:   ${ids.length} listed${model && !ids.includes(model) ? `  WARNING: "${model}" is not in the list` : ""}`);
} else console.log(`models:   could not list (${list.status})`);

const t0 = Date.now();
const res = await fetch(`${base}/chat/completions`, {
  method: "POST", headers,
  body: JSON.stringify({
    model, temperature: 0, max_tokens: 60, response_format: { type: "json_object" },
    ...(process.env.LLM_REASONING_EFFORT ? { reasoning_effort: process.env.LLM_REASONING_EFFORT } : {}),
    messages: [{ role: "system", content: "Reply with a JSON object." }, { role: "user", content: 'Return {"ok": true}.' }],
  }),
});
const ms = Date.now() - t0;
const body = await res.json().catch(() => ({}));
if (!res.ok) { console.error(`chat:     FAILED ${res.status} ${JSON.stringify(body).slice(0, 300)}`); process.exit(1); }
const msg = body.choices?.[0]?.message;
console.log(`chat:     ok in ${ms} ms, finish=${body.choices?.[0]?.finish_reason}, tokens in/out=${body.usage?.prompt_tokens}/${body.usage?.completion_tokens}`);
console.log(`content:  ${JSON.stringify(msg?.content)}`);
for (const h of ["x-ratelimit-remaining-requests", "x-ratelimit-remaining"]) if (res.headers.get(h)) console.log(`${h}: ${res.headers.get(h)}`);
