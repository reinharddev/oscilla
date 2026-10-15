import { describe, expect, it } from "vitest";
import { en } from "./en";
import { translate } from "./index";

describe("catalog", () => {
  it("has no empty strings", () => {
    for (const k of Object.keys(en) as (keyof typeof en)[]) expect(en[k].length, k).toBeGreaterThan(0);
  });
});

describe("translate", () => {
  it("fills placeholders and keeps unknown ones visible", () => {
    expect(translate("en", "mach.rul", { n: 3 })).toBe("Remaining life ≈ 3 days");
    expect(translate("en", "mach.rul")).toBe("Remaining life ≈ {n} days");
  });
});
