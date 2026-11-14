import { describe, expect, it } from "vitest";
import { createRng } from "./rng.ts";

function take(seed: string, count: number): number[] {
  const rng = createRng(seed);
  return Array.from({ length: count }, () => rng.next());
}

describe("seeded rng", () => {
  it("gives the same sequence for the same seed", () => {
    expect(take("way/123", 50)).toEqual(take("way/123", 50));
  });

  it("gives these exact numbers on every machine", () => {
    // Worked out separately from this code (same algorithm in another language).
    // If these change, every generated world changes.
    expect(take("way/123", 3)).toEqual([
      0.1515454025939107, 0.9941926666069776, 0.08674656366929412,
    ]);
    expect(take("node/1", 3)).toEqual([
      0.8545545618981123, 0.15030576614663005, 0.5302604511380196,
    ]);
  });

  it("gives different sequences for different seeds, even similar ones", () => {
    expect(take("way/123", 5)).not.toEqual(take("way/124", 5));
    expect(take("way/1", 5)).not.toEqual(take("node/1", 5));
    expect(take("", 5)).not.toEqual(take(" ", 5));
  });

  it("keeps streams independent of each other", () => {
    const alone = take("way/123", 10);
    const first = createRng("way/123");
    const other = createRng("way/999");
    const mixed = Array.from({ length: 10 }, () => {
      other.next();
      return first.next();
    });
    expect(mixed).toEqual(alone);
  });

  it("next() stays in [0, 1) and averages near 0.5", () => {
    const values = take("tile/17/36612/47851", 20000);
    expect(Math.min(...values)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...values)).toBeLessThan(1);
    const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
    expect(mean).toBeCloseTo(0.5, 1);
  });

  it("range() stays in [min, max)", () => {
    const rng = createRng("range");
    for (let i = 0; i < 1000; i++) {
      const value = rng.range(-2.5, 4);
      expect(value).toBeGreaterThanOrEqual(-2.5);
      expect(value).toBeLessThan(4);
    }
  });

  it("int() returns whole numbers and reaches both ends", () => {
    const rng = createRng("int");
    const seen = new Set<number>();
    for (let i = 0; i < 500; i++) {
      const value = rng.int(3, 6);
      expect(Number.isInteger(value)).toBe(true);
      seen.add(value);
    }
    expect([...seen].sort()).toEqual([3, 4, 5, 6]);
    expect(rng.int(7, 7)).toBe(7);
    expect(() => rng.int(5, 4)).toThrow(RangeError);
  });

  it("pick() returns items from the list and reaches all of them", () => {
    const rng = createRng("pick");
    const items = ["a", "b", "c"] as const;
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) seen.add(rng.pick(items));
    expect([...seen].sort()).toEqual(["a", "b", "c"]);
    expect(() => rng.pick([])).toThrow(RangeError);
  });

  it("chance() respects 0, 1 and a probability in between", () => {
    const rng = createRng("chance");
    let hits = 0;
    for (let i = 0; i < 10000; i++) {
      expect(rng.chance(0)).toBe(false);
      expect(rng.chance(1)).toBe(true);
      if (rng.chance(0.25)) hits++;
    }
    expect(hits / 10000).toBeCloseTo(0.25, 1);
  });
});
