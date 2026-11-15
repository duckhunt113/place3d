import { describe, expect, it } from "vitest";
import { layoutSignText } from "./sign-text.ts";

// A stand-in for real letter measuring: every letter is 0.55 times as wide as it is tall.
const measure = (text: string, sizePx: number) => text.length * sizePx * 0.55;
const WIDTH = 768;
const HEIGHT = 128;
const fits = (lines: string[], sizePx: number) =>
  lines.every((line) => measure(line, sizePx) <= WIDTH * 0.92 + 1e-6);

describe("layoutSignText", () => {
  it("writes a short name on one line at full size", () => {
    const layout = layoutSignText("Hasty Market", WIDTH, HEIGHT, measure);
    expect(layout.lines).toEqual(["Hasty Market"]);
    expect(layout.sizePx).toBeCloseTo(HEIGHT * 0.62, 6);
  });

  it("shrinks a longer name a little to keep it on one line", () => {
    const layout = layoutSignText("The Beagle Bicycle Co.", WIDTH, HEIGHT, measure);
    expect(layout.lines).toHaveLength(1);
    expect(layout.sizePx).toBeLessThan(HEIGHT * 0.62);
    expect(layout.sizePx).toBeGreaterThan(HEIGHT * 0.62 * 0.7);
    expect(fits(layout.lines, layout.sizePx)).toBe(true);
  });

  it("splits a long name near its middle, on a space", () => {
    const layout = layoutSignText("Battaglia's Lorne Park Marketplace", WIDTH, HEIGHT, measure);
    expect(layout.lines).toEqual(["Battaglia's Lorne", "Park Marketplace"]);
    expect(fits(layout.lines, layout.sizePx)).toBe(true);
    expect(layout.sizePx).toBeLessThanOrEqual(HEIGHT * 0.4);
  });

  it("cuts a name short only when even two small lines do not fit", () => {
    const name =
      "The Extraordinarily Long Winded Emporium Of Miscellaneous Household Sundries And More";
    const layout = layoutSignText(name, WIDTH, HEIGHT, measure);
    expect(layout.lines).toHaveLength(2);
    expect(layout.sizePx).toBeCloseTo(HEIGHT * 0.26, 6);
    expect(layout.lines.some((line) => line.endsWith("…"))).toBe(true);
    expect(fits(layout.lines, layout.sizePx)).toBe(true);
  });

  it("keeps one very long word on one line, shrunk or cut", () => {
    const layout = layoutSignText("Supercalifragilisticexpialidocious", WIDTH, HEIGHT, measure);
    expect(layout.lines).toHaveLength(1);
    expect(fits(layout.lines, layout.sizePx)).toBe(true);
    const longer = layoutSignText("X".repeat(80), WIDTH, HEIGHT, measure);
    expect(longer.lines[0]?.endsWith("…")).toBe(true);
    expect(fits(longer.lines, longer.sizePx)).toBe(true);
  });
});
