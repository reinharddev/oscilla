import { describe, expect, it } from "vitest";
import { percentile, summarizeLlm, toMarkdown, type LlmSample } from "./bench";

const s = (over: Partial<LlmSample>): LlmSample => ({ at: 0, source: "copilot", mode: "llm", latencyMs: 1000, completionTokens: 100, ...over });

describe("bench", () => {
  it("computes nearest-rank percentiles", () => {
    expect(percentile([], 50)).toBeUndefined();
    expect(percentile([5], 95)).toBe(5);
    expect(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 50)).toBe(5);
    expect(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 95)).toBe(10);
  });

  it("leaves fallbacks and cached replies out of the latency numbers but counts them", () => {
    const sum = summarizeLlm([
      s({ latencyMs: 2000, completionTokens: 100, promptTokens: 1000 }),
      s({ latencyMs: 4000, completionTokens: 100, promptTokens: 2000 }),
      s({ mode: "fallback", latencyMs: 50 }),
      s({ cached: true, latencyMs: 1 }),
    ]);
    expect(sum).toMatchObject({ n: 2, fallbacks: 1, cached: 1, p50: 2000, avgPromptTokens: 1500, avgCompletionTokens: 100 });
    expect(sum.tokensPerSecP50).toBe(25); // 100 tokens / 4 s and 100 / 2 s -> p50 of [25, 50]
  });

  it("renders n/a when nothing was measured", () => {
    expect(toMarkdown([], [], {})).toContain("n/a");
  });
});
