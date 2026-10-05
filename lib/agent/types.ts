import type { CopilotResult } from "../copilot/types";

export type Status = "healthy" | "attention" | "critical";

export interface AssetBrief {
  id: string; name: string; serial: string; type: string; warehouse: string;
  score: number | null; status: Status | null;
  lastServiceDays: number | null; scheduledFor: string | null;
}

export type Resolved =
  | { ok: true; asset: { id: string; name: string; serial: string; type: string } }
  | { ok: false; reason: "not_found" | "ambiguous"; candidates: string[] };

export interface HealthDetail {
  brief: AssetBrief;
  evidence: { label: string; value: number; baseline: number; z_score: number }[];
  recentScores: number[];
  modelVersion: string | null;
  snapshotAgeMin: number | null;
}
export interface JournalRow { when: string; author?: string; kind: string; text: string }
export interface WorkOrderRow { asset: string; status: string; dueAt: string | null; completedAt: string | null; summary: string }
export interface ManualHit { id: string; title: string; detail: string; text: string }

/**
 * Everything the agent can reach. The production implementation runs queries with the
 * signed-in user's own Supabase client, so row-level security limits every tool to what that
 * user may see. There is deliberately no write method: the agent can only propose.
 */
export interface Backend {
  listAssets(f: { status?: Status | "problem"; type?: string; limit: number }): Promise<AssetBrief[]>;
  resolve(ref: string): Promise<Resolved>;
  health(assetId: string): Promise<HealthDetail | null>;
  journal(assetId: string, limit: number): Promise<JournalRow[]>;
  workOrders(f: { assetId?: string; status?: string }): Promise<WorkOrderRow[]>;
  manuals(query: string, type?: string): Promise<ManualHit[]>;
  diagnose(assetId: string): Promise<CopilotResult | null>;
  canWrite(assetId: string): Promise<boolean>;
}

export interface Proposal {
  id: string; kind: "work_order"; assetId: string; assetName: string;
  summary: string; dueAt: string; urgency: "immediate" | "within_days" | "monitor";
}
export interface ToolStep { tool: string; args: unknown; ok: boolean; summary: string; data: unknown }

export interface AgentResult {
  mode: "llm" | "rules";
  answer: string;
  steps: ToolStep[];
  proposals: Proposal[];
  warnings: string[];
  answerRejected?: boolean;
  rejectedAnswer?: string;
  model?: string;
  usage?: { promptTokens: number; completionTokens: number };
  latencyMs: number;
}

export interface ToolContext { selectedAssetId?: string | null; now: () => number }
export interface ChatTurn { role: "user" | "assistant"; content: string }
