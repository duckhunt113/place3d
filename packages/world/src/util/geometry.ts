// Small 2D helpers shared by the data and generator code. Points are [a, b] pairs in any
// flat coordinate system: [lon, lat] degrees or local [x, z] metres.

export type Pair = [number, number];

/**
 * Signed area of a ring (no repeated closing point needed). The sign tells the winding.
 * Measured relative to the first point, so rings far from zero (lat/lon) keep their precision.
 */
export function signedArea(ring: readonly Pair[]): number {
  const origin = ring[0];
  if (!origin) return 0;
  let sum = 0;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i] as Pair;
    const b = ring[(i + 1) % ring.length] as Pair;
    sum += (a[0] - origin[0]) * (b[1] - origin[1]) - (b[0] - origin[0]) * (a[1] - origin[1]);
  }
  return sum / 2;
}

/** Area-weighted centre of a ring. Falls back to the average of the points for flat rings. */
export function centroid(ring: readonly Pair[]): Pair {
  const origin = ring[0];
  if (!origin) return [0, 0];
  let cx = 0;
  let cy = 0;
  let twiceArea = 0;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i] as Pair;
    const b = ring[(i + 1) % ring.length] as Pair;
    const ax = a[0] - origin[0];
    const ay = a[1] - origin[1];
    const bx = b[0] - origin[0];
    const by = b[1] - origin[1];
    const cross = ax * by - bx * ay;
    twiceArea += cross;
    cx += (ax + bx) * cross;
    cy += (ay + by) * cross;
  }
  if (Math.abs(twiceArea) < 1e-18) {
    return [
      ring.reduce((sum, p) => sum + p[0], 0) / ring.length,
      ring.reduce((sum, p) => sum + p[1], 0) / ring.length,
    ];
  }
  return [origin[0] + cx / (3 * twiceArea), origin[1] + cy / (3 * twiceArea)];
}

/** True if the point is inside the ring (even-odd rule). */
export function pointInRing(point: Pair, ring: readonly Pair[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i] as Pair;
    const b = ring[j] as Pair;
    const crosses = a[1] > point[1] !== b[1] > point[1];
    if (crosses && point[0] < ((b[0] - a[0]) * (point[1] - a[1])) / (b[1] - a[1]) + a[0]) {
      inside = !inside;
    }
  }
  return inside;
}

/** Removes points that repeat the one before them. */
export function withoutRepeats(points: readonly Pair[]): Pair[] {
  const out: Pair[] = [];
  for (const p of points) {
    const last = out[out.length - 1];
    if (!last || last[0] !== p[0] || last[1] !== p[1]) out.push(p);
  }
  return out;
}

/** The tightest rectangle around a shape, at whatever angle the shape sits. */
export type BoundingRectangle = {
  centre: Pair;
  /** Unit vector along the long side. */
  axis: Pair;
  /** Half the long side and half the short side. */
  halfLong: number;
  halfShort: number;
};

/** Convex hull (Andrew's monotone chain), counter-clockwise, without a repeated closing point. */
export function convexHull(points: readonly Pair[]): Pair[] {
  const sorted = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (sorted.length < 3) return sorted;
  const cross = (o: Pair, a: Pair, b: Pair) =>
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const half = (list: Pair[]): Pair[] => {
    const out: Pair[] = [];
    for (const p of list) {
      while (
        out.length >= 2 &&
        cross(out[out.length - 2] as Pair, out[out.length - 1] as Pair, p) <= 0
      ) {
        out.pop();
      }
      out.push(p);
    }
    out.pop();
    return out;
  };
  return [...half(sorted), ...half(sorted.reverse())];
}

/**
 * The smallest-area rectangle around a ring. One of its sides always lies along an edge of
 * the ring's convex hull, so trying each hull edge finds it. Undefined for flat or empty rings.
 */
export function boundingRectangle(ring: readonly Pair[]): BoundingRectangle | undefined {
  const hull = convexHull(ring);
  if (hull.length < 3) return undefined;
  let best: (BoundingRectangle & { area: number }) | undefined;
  for (let i = 0; i < hull.length; i++) {
    const a = hull[i] as Pair;
    const b = hull[(i + 1) % hull.length] as Pair;
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (length < 1e-12) continue;
    const ux = (b[0] - a[0]) / length;
    const uy = (b[1] - a[1]) / length;
    let minU = Infinity;
    let maxU = -Infinity;
    let minV = Infinity;
    let maxV = -Infinity;
    for (const p of hull) {
      const u = (p[0] - a[0]) * ux + (p[1] - a[1]) * uy;
      const v = -(p[0] - a[0]) * uy + (p[1] - a[1]) * ux;
      minU = Math.min(minU, u);
      maxU = Math.max(maxU, u);
      minV = Math.min(minV, v);
      maxV = Math.max(maxV, v);
    }
    const width = maxU - minU;
    const depth = maxV - minV;
    const area = width * depth;
    if (best && area >= best.area) continue;
    const midU = (minU + maxU) / 2;
    const midV = (minV + maxV) / 2;
    const centre: Pair = [a[0] + midU * ux - midV * uy, a[1] + midU * uy + midV * ux];
    best =
      width >= depth
        ? { centre, axis: [ux, uy], halfLong: width / 2, halfShort: depth / 2, area }
        : { centre, axis: [-uy, ux], halfLong: depth / 2, halfShort: width / 2, area };
  }
  if (!best || best.area <= 0) return undefined;
  return {
    centre: best.centre,
    axis: best.axis,
    halfLong: best.halfLong,
    halfShort: best.halfShort,
  };
}
