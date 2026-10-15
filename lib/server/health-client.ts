const SERVICE = () => process.env.HEALTH_SERVICE_URL ?? "http://localhost:8100";

export interface BaselinePayload { feature_names: string[]; mean: number[]; std: number[]; n_windows: number }
export interface ScoreResult {
  model_version: string;
  score: number;
  status: "healthy" | "attention" | "critical";
  evidence: unknown[];
  features: Record<string, number>;
  aux?: { vibration_mm_s: number; temperature_c: number; current_a: number };
}

async function call<T>(path: string, body: unknown, timeoutMs = 6000): Promise<T> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (process.env.HEALTH_SERVICE_KEY) headers["x-api-key"] = process.env.HEALTH_SERVICE_KEY;
  const res = await fetch(`${SERVICE()}${path}`, { method: "POST", headers, body: JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs), cache: "no-store" });
  if (!res.ok) throw new Error(`health service ${path} returned ${res.status}`);
  return res.json() as Promise<T>;
}

export const fitBaseline = (rpm: number, fs: number, windows: number[][]) => call<BaselinePayload>("/baseline/fit", { rpm, fs, windows });
export const scoreWindow = (rpm: number, fs: number, signal: number[], baseline: BaselinePayload) => call<ScoreResult>("/score", { rpm, fs, signal, baseline });
export const demoBaseline = (assetId: string, rpm: number) => call<BaselinePayload>("/demo/baseline", { asset_id: assetId, rpm });
export const demoScore = (assetId: string, rpm: number, severity: number, baseline: BaselinePayload) =>
  call<ScoreResult>("/demo/score", { asset_id: assetId, rpm, severity, baseline });
export const demoSeries = (assetId: string, rpm: number, severities: number[], baseline: BaselinePayload) =>
  call<{ points: ScoreResult[] }>("/demo/series", { asset_id: assetId, rpm, severities, baseline }, 30_000);
