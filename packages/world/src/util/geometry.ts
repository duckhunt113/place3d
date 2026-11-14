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
