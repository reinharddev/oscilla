export interface LlmConfig { baseUrl: string; apiKey?: string; model: string; timeoutMs?: number }
export interface LlmReply { content: string; model: string; usage?: { promptTokens?: number; completionTokens?: number } }

/** Calls any OpenAI-compatible chat endpoint, such as vLLM serving a model on AMD GPUs. */
export async function callLlm(cfg: LlmConfig, messages: { role: string; content: string }[], fetchImpl: typeof fetch = fetch): Promise<LlmReply> {
  const res = await fetchImpl(`${cfg.baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(cfg.apiKey ? { authorization: `Bearer ${cfg.apiKey}` } : {}) },
    body: JSON.stringify({ model: cfg.model, messages, temperature: 0.2, max_tokens: 700, response_format: { type: "json_object" } }),
    signal: AbortSignal.timeout(cfg.timeoutMs ?? 30_000),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`LLM endpoint returned ${res.status}`);
  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== "string") throw new Error("LLM reply has no content");
  return { content, model: data.model ?? cfg.model, usage: { promptTokens: data.usage?.prompt_tokens, completionTokens: data.usage?.completion_tokens } };
}

/** Pull the JSON object out of a reply that may be wrapped in a code fence or prose. */
export function extractJson(text: string): unknown {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("no JSON object in reply");
  return JSON.parse(text.slice(start, end + 1));
}
