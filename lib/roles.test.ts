import { describe, expect, it } from "vitest";
import { canAssignOthers, canManageMembers, canSeeBenchmark, DEFAULT_VIEW, VIEWS, type Role } from "./roles";

const roles: Role[] = ["admin", "manager", "technician", "viewer"];

describe("role views", () => {
  it("opens every role on a screen it is allowed to see", () => {
    for (const r of roles) expect(VIEWS[r]).toContain(DEFAULT_VIEW[r]);
  });

  it("gives each role a different set of screens", () => {
    const sets = roles.map((r) => [...VIEWS[r]].sort().join(","));
    expect(new Set(sets).size).toBe(4);
  });

  it("keeps administration to admins and assignment to leads", () => {
    expect(VIEWS.admin).toEqual(expect.arrayContaining(["people", "organization"]));
    for (const r of ["manager", "technician", "viewer"] as Role[]) {
      expect(VIEWS[r]).not.toContain("people");
      expect(VIEWS[r]).not.toContain("organization");
    }
    expect(VIEWS.technician).toContain("tasks");
    expect(VIEWS.technician).not.toContain("orders");
    expect(canManageMembers("admin")).toBe(true);
    expect(canManageMembers("manager")).toBe(false);
    expect(canAssignOthers("manager")).toBe(true);
    expect(canAssignOthers("technician")).toBe(false);
    expect(canSeeBenchmark("manager")).toBe(false);
  });
});
