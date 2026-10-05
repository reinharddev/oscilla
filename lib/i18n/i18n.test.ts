import { describe, expect, it } from "vitest";
import { en } from "./en";
import { id } from "./id";
import { translate } from "./index";

describe("catalogs", () => {
  it("have exactly the same keys", () => {
    expect(Object.keys(id).sort()).toEqual(Object.keys(en).sort());
  });
  it("use the same placeholders in both languages", () => {
    const ph = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(",");
    for (const k of Object.keys(en) as (keyof typeof en)[]) expect(ph(id[k]), k).toBe(ph(en[k]));
  });
  it("have no empty strings", () => {
    for (const k of Object.keys(en) as (keyof typeof en)[]) {
      expect(en[k].length, `en ${k}`).toBeGreaterThan(0);
      expect(id[k].length, `id ${k}`).toBeGreaterThan(0);
    }
  });
});

describe("translate", () => {
  it("fills placeholders and keeps unknown ones visible", () => {
    expect(translate("en", "mach.rul", { n: 3 })).toBe("Remaining life ≈ 3 days");
    expect(translate("id", "mach.rul", { n: 6 })).toBe("Sisa umur ≈ 6 hari");
    expect(translate("en", "mach.rul")).toBe("Remaining life ≈ {n} days");
  });
});
