export interface LlmConfig {
  baseUrl: string; apiKey?: string; model: string; timeoutMs?: number;
  /** Sent as reasoning_effort when set (none, low, medium, high ...). Left out otherwise. */
  reasoningEffort?: string;
}
export interface LlmReply { content: string; model: string; usage?: { promptTokens?: number; completionTokens?: number } }

/**
 * POST /chat/completions to any OpenAI-compatible endpoint (vLLM on an AMD GPU, AMD Token Factory).
 * Only fields that shared gateways accept are sent. A 429 caused by the concurrency limit
 * (short Retry-After) is retried once; per-minute limits are reported to the caller, which falls back.
 */
export async function chatRequest(cfg: LlmConfig, body: Record<string, unknown>, fetchImpl: typeof fetch = fetch): Promise<any> {
  const url = `${cfg.baseUrl.replace(/\/$/, "")}/chat/completions`;
  const payload = JSON.stringify({ model: cfg.model, ...body, ...(cfg.reasoningEffort ? { reasoning_effort: cfg.reasoningEffort } : {}) });
  for (let attempt = 0; ; attempt++) {
    const res = await fetchImpl(url, {
      method: "POST",
      headers: { "content-type": "application/json", ...(cfg.apiKey ? { authorization: `Bearer ${cfg.apiKey}` } : {}) },
      body: payload,
      signal: AbortSignal.timeout(cfg.timeoutMs ?? 30_000),
      cache: "no-store",
    });
    if (res.status === 429 && attempt === 0) {
      const wait = Number(res.headers.get("retry-after") ?? "");
      if (Number.isFinite(wait) && wait > 0 && wait <= 3) {
        await new Promise((r) => setTimeout(r, wait * 1000));
        continue;
      }
    }
    if (!res.ok) throw new Error(`LLM endpoint returned ${res.status}`);
    return res.json();
  }
}

/** Calls any OpenAI-compatible chat endpoint, such as vLLM serving a model on AMD GPUs. */
export async function callLlm(cfg: LlmConfig, messages: { role: string; content: string }[], fetchImpl: typeof fetch = fetch): Promise<LlmReply> {
  const data = await chatRequest(cfg, { messages, temperature: 0.2, max_tokens: 700, response_format: { type: "json_object" } }, fetchImpl);
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
