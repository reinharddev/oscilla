import type { Key } from "./i18n";

export type Role = "admin" | "manager" | "technician" | "viewer";
export type ViewId = "organization" | "overview" | "tasks" | "machines" | "orders" | "people" | "audit" | "sources";

/**
 * What each role works with. The database enforces the same boundaries with row-level security;
 * this only decides which screens are shown, so people see their own job and not a shared console.
 */
export const VIEWS: Record<Role, ViewId[]> = {
  admin: ["organization", "overview", "machines", "orders", "people", "audit", "sources"],
  manager: ["overview", "machines", "orders", "audit", "sources"],
  technician: ["tasks", "machines"],
  viewer: ["overview", "machines"],
};

export const DEFAULT_VIEW: Record<Role, ViewId> = { admin: "organization", manager: "overview", technician: "tasks", viewer: "overview" };

export const VIEW_LABEL: Record<ViewId, Key> = {
  organization: "view.organization", overview: "view.overview", tasks: "view.tasks", machines: "view.machines",
  orders: "view.orders", people: "view.people", audit: "view.audit", sources: "view.sources",
};

export const isLead = (r: Role | undefined) => r === "admin" || r === "manager";
export const canAssignOthers = isLead;
export const canManageMembers = (r: Role | undefined) => r === "admin";
export const canSeeBenchmark = (r: Role | undefined) => r === "admin";
