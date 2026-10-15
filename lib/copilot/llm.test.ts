import { describe, expect, it } from "vitest";
import { beforeEach, vi } from "vitest";
import { chatRequest, llmBudget, resetLlmBudget } from "./llm";

const ok = (body: unknown = { choices: [] }) => new Response(JSON.stringify(body), { status: 200 });

function fakeFetch(responses: Response[]) {
  const calls: { url: string; body: any; auth: string | null }[] = [];
  const impl = (async (url: string, init: RequestInit) => {
    calls.push({ url, body: JSON.parse(init.body as string), auth: new Headers(init.headers).get("authorization") });
    return responses.shift() ?? ok();
  }) as unknown as typeof fetch;
  return { impl, calls };
}

describe("chatRequest", () => {
  const cfg = { baseUrl: "https://example.test/api/v1/", apiKey: "rc-test", model: "DeepSeek-V4-Flash" };

  it("builds the URL, auth header and body, and leaves reasoning_effort out by default", async () => {
    const f = fakeFetch([ok()]);
    await chatRequest(cfg, { messages: [], temperature: 0.1 }, f.impl);
    expect(f.calls[0].url).toBe("https://example.test/api/v1/chat/completions");
    expect(f.calls[0].auth).toBe("Bearer rc-test");
    expect(f.calls[0].body).toEqual({ model: "DeepSeek-V4-Flash", messages: [], temperature: 0.1 });
  });

  it("sends reasoning_effort only when configured", async () => {
    const f = fakeFetch([ok()]);
    await chatRequest({ ...cfg, reasoningEffort: "low" }, { messages: [] }, f.impl);
    expect(f.calls[0].body.reasoning_effort).toBe("low");
  });

  it("retries once on a short concurrency 429", async () => {
    const f = fakeFetch([new Response("{}", { status: 429, headers: { "retry-after": "1" } }), ok({ choices: [1] })]);
    const data = await chatRequest(cfg, { messages: [] }, f.impl);
    expect(f.calls).toHaveLength(2);
    expect(data.choices).toEqual([1]);
  });

  it("does not wait out a per-minute 429; the caller falls back instead", async () => {
    const f = fakeFetch([new Response("{}", { status: 429, headers: { "retry-after": "60" } })]);
    await expect(chatRequest(cfg, { messages: [] }, f.impl)).rejects.toThrow("rate limit");
    expect(f.calls).toHaveLength(1);
  });

  describe("request budget", () => {
    beforeEach(() => { resetLlmBudget(); vi.stubEnv("LLM_MAX_RPM", "2"); });

    it("refuses calls past the per-minute budget without hitting the network", async () => {
      const f = fakeFetch([ok(), ok(), ok()]);
      await chatRequest(cfg, { messages: [] }, f.impl);
      await chatRequest(cfg, { messages: [] }, f.impl);
      await expect(chatRequest(cfg, { messages: [] }, f.impl)).rejects.toThrow("request budget");
      expect(f.calls).toHaveLength(2);
      expect(llmBudget().used).toBe(2);
    });

    it("is off when LLM_MAX_RPM is 0", async () => {
      vi.stubEnv("LLM_MAX_RPM", "0");
      const f = fakeFetch([ok(), ok(), ok()]);
      for (let i = 0; i < 3; i++) await chatRequest(cfg, { messages: [] }, f.impl);
      expect(f.calls).toHaveLength(3);
    });
  });
});
