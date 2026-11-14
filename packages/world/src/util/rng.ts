// Seeded random numbers for world generation.
// The same seed string gives the same sequence on every machine, which is what makes
// every player see the same world. Never use Math.random() in generation code.
//
// Seed from stable GLOBAL values only: an OSM id ("way/123"), a tile id, or global
// Web Mercator coordinates rounded to a grid. Never from local x/z.

export type Rng = {
  /** A float in [0, 1). */
  next(): number;
  /** A float in [min, max). */
  range(min: number, max: number): number;
  /** An integer in [min, max], both ends included. */
  int(min: number, max: number): number;
  /** One item of a non-empty list. */
  pick<T>(items: readonly T[]): T;
  /** True with the given probability (0 = never, 1 = always). */
  chance(probability: number): boolean;
};

/** Mixes a string into 32-bit numbers (xmur3). Uses only integer maths, so it is exact everywhere. */
function hasher(text: string): () => number {
  let h = 1779033703 ^ text.length;
  for (let i = 0; i < text.length; i++) {
    h = Math.imul(h ^ text.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return h >>> 0;
  };
}

/** Creates an independent random stream for a seed (sfc32 generator, seeded by the string hash). */
export function createRng(seed: string): Rng {
  const hash = hasher(seed);
  let a = hash();
  let b = hash();
  let c = hash();
  let d = hash();

  const next = (): number => {
    const t = (((a + b) | 0) + d) | 0;
    d = (d + 1) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };

  // A few warm-up rounds so similar seeds ("way/1", "way/2") diverge straight away.
  for (let i = 0; i < 12; i++) next();

  return {
    next,
    range: (min, max) => min + next() * (max - min),
    int: (min, max) => {
      const low = Math.ceil(min);
      const high = Math.floor(max);
      if (high < low) throw new RangeError(`int(${min}, ${max}): empty range`);
      return low + Math.floor(next() * (high - low + 1));
    },
    pick: (items) => {
      if (items.length === 0) throw new RangeError("pick(): the list is empty");
      return items[Math.floor(next() * items.length)] as (typeof items)[number];
    },
    chance: (probability) => next() < probability,
  };
}
