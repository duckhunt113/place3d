// Flat shapes with holes, and the three ways of combining them: join, cut away, overlap.
// A thin layer over the `polygon-clipping` library, plus thick lines ("ribbons") built from
// simple pieces. Points are [x, z] pairs in local metres.

import polygonClipping from "polygon-clipping";
import { type Pair, pointInRing, signedArea } from "./geometry.ts";

/** One outline followed by the holes cut into it. No ring repeats its first point at the end. */
export type Polygon = Pair[][];
/** Any flat shape: several separate polygons, each with its holes. An empty list is nothing. */
export type Shape = Polygon[];

/** Rings smaller than this (a square centimetre) are slivers left by rounding: dropped. */
const MIN_RING_AREA = 1e-4;

// Coordinates are passed to the library exactly as they are. Rounding them first (say, to a
// millimetre) looks tidy but turns edges that lie exactly on top of each other into edges
// that almost do, which is the one thing the library cannot cope with.
function cleanRing(ring: readonly Pair[]): Pair[] {
  const out: Pair[] = [];
  for (const p of ring) {
    const last = out[out.length - 1];
    if (!last || last[0] !== p[0] || last[1] !== p[1]) out.push(p);
  }
  const first = out[0];
  const last = out[out.length - 1];
  if (first && last && out.length > 1 && first[0] === last[0] && first[1] === last[1]) out.pop();
  return out;
}

function clean(shape: readonly (readonly (readonly Pair[])[])[]): Shape {
  const out: Shape = [];
  for (const polygon of shape) {
    const rings = polygon.map(cleanRing);
    const outline = rings[0];
    if (!outline || outline.length < 3 || Math.abs(signedArea(outline)) < MIN_RING_AREA) continue;
    const holes = rings
      .slice(1)
      .filter((ring) => ring.length >= 3 && Math.abs(signedArea(ring)) >= MIN_RING_AREA);
    out.push([outline, ...holes]);
  }
  return out;
}

type Operation = (first: Shape, ...rest: Shape[]) => Pair[][][];

/**
 * The library sometimes gives up on shapes whose edges almost touch. Nudging every point
 * onto a slightly coarser grid changes which edges touch, and it then succeeds: try the
 * exact shapes first, then grids of a ten-thousandth of a millimetre and coarser.
 */
const RETRY_GRIDS = [1e7, 1e5, 1e4];

function attempt(operation: Operation, shapes: readonly Shape[]): Shape | undefined {
  const [first, ...rest] = shapes as [Shape, ...Shape[]];
  try {
    return clean(operation(first, ...rest));
  } catch {
    for (const grid of RETRY_GRIDS) {
      const nudge = (shape: Shape): Shape =>
        clean(
          shape.map((polygon) =>
            polygon.map((ring) =>
              ring.map(
                ([x, z]): Pair => [Math.round(x * grid) / grid, Math.round(z * grid) / grid],
              ),
            ),
          ),
        );
      try {
        return clean(operation(nudge(first), ...rest.map(nudge)));
      } catch {
        // Try the next, coarser grid.
      }
    }
    return undefined;
  }
}

/** A single ring as a shape. */
export function ringShape(ring: readonly Pair[]): Shape {
  return clean([[ring]]);
}

/** An upright rectangle. */
export function boxShape(minX: number, minZ: number, maxX: number, maxZ: number): Shape {
  return ringShape([
    [minX, minZ],
    [maxX, minZ],
    [maxX, maxZ],
    [minX, maxZ],
  ]);
}

/**
 * Joins simple rings (they may overlap freely) into one shape. If the library cannot join
 * them all at once, they are joined one by one and a ring it cannot handle is left out.
 */
export function unite(rings: readonly (readonly Pair[])[]): Shape {
  const pieces = rings.map((ring) => clean([[ring]])).filter((piece) => piece.length > 0);
  if (pieces.length === 0) return [];
  const all = attempt(polygonClipping.union, pieces);
  if (all) return all;
  let joined: Shape = [];
  for (const piece of pieces) {
    // Leave one piece out rather than lose the whole shape.
    joined =
      joined.length === 0 ? piece : (attempt(polygonClipping.union, [joined, piece]) ?? joined);
  }
  return joined;
}

/** Everything covered by any of the shapes. */
export function join(...shapes: readonly Shape[]): Shape {
  const filled = shapes.filter((shape) => shape.length > 0);
  if (filled.length === 0) return [];
  if (filled.length === 1) return filled[0] as Shape;
  return attempt(polygonClipping.union, filled) ?? (filled[0] as Shape);
}

/** `shape` with every part covered by `others` cut away. */
export function cutAway(shape: Shape, ...others: readonly Shape[]): Shape {
  const cutters = others.filter((other) => other.length > 0);
  if (shape.length === 0 || cutters.length === 0) return shape;
  return attempt(polygonClipping.difference, [shape, ...cutters]) ?? shape;
}

/** The part covered by both shapes. */
export function overlap(a: Shape, b: Shape): Shape {
  if (a.length === 0 || b.length === 0) return [];
  return attempt(polygonClipping.intersection, [a, b]) ?? [];
}

/** True if the point is inside the shape (and not in one of its holes). */
export function pointInShape(point: Pair, shape: Shape): boolean {
  for (const [outline, ...holes] of shape) {
    if (!outline || !pointInRing(point, outline)) continue;
    if (!holes.some((hole) => pointInRing(point, hole))) return true;
  }
  return false;
}

/** Ground area of a shape in square metres, holes taken off. */
export function shapeArea(shape: Shape): number {
  let area = 0;
  for (const [outline, ...holes] of shape) {
    if (!outline) continue;
    area += Math.abs(signedArea(outline));
    for (const hole of holes) area -= Math.abs(signedArea(hole));
  }
  return area;
}

// ---------- Thick lines ----------

/** Round corners and ends are drawn with one flat side per this many radians (22.5 degrees). */
const ARC_STEP = Math.PI / 8;
/** Bends gentler than this leave a gap too small to see; no corner piece is added. */
const MIN_BEND = 0.005;

export type RibbonEnds = {
  /** Radius of the round end at the line's first point; 0 for a square cut. */
  start: number;
  /** The same at its last point. */
  end: number;
};

/** Points along an arc around `centre`, from angle `from` to `to` (radians, the short way given). */
function arc(centre: Pair, radius: number, from: number, to: number): Pair[] {
  const steps = Math.max(1, Math.ceil(Math.abs(to - from) / ARC_STEP));
  const out: Pair[] = [];
  for (let i = 0; i <= steps; i++) {
    const angle = from + ((to - from) * i) / steps;
    out.push([centre[0] + Math.cos(angle) * radius, centre[1] + Math.sin(angle) * radius]);
  }
  return out;
}

/**
 * The simple pieces that together cover a line thickened by `left` metres on its left and
 * `right` on its right (left and right as you travel along it; north is -z). One rectangle
 * per segment, a rounded wedge on the outside of every bend, and optional round ends.
 * Join them with `unite`.
 */
export function ribbonPieces(
  line: readonly Pair[],
  left: number,
  right: number,
  ends: RibbonEnds = { start: 0, end: 0 },
): Pair[][] {
  const points: Pair[] = [];
  for (const p of line) {
    const last = points[points.length - 1];
    if (!last || Math.hypot(p[0] - last[0], p[1] - last[1]) > 0.01) points.push(p);
  }
  if (points.length < 2 || left < 0 || right < 0 || left + right <= 0) return [];
  const pieces: Pair[][] = [];
  // The direction of each segment as an angle; its left-hand side is a quarter turn back.
  const headings: number[] = [];
  // Each segment's four corners. Corner pieces reuse these very points, so shared edges match exactly.
  const corners: { leftStart: Pair; leftEnd: Pair; rightStart: Pair; rightEnd: Pair }[] = [];
  for (let i = 0; i + 1 < points.length; i++) {
    const a = points[i] as Pair;
    const b = points[i + 1] as Pair;
    const heading = Math.atan2(b[1] - a[1], b[0] - a[0]);
    headings.push(heading);
    const lx = Math.cos(heading - Math.PI / 2);
    const lz = Math.sin(heading - Math.PI / 2);
    const quad = {
      leftStart: [a[0] + lx * left, a[1] + lz * left] as Pair,
      leftEnd: [b[0] + lx * left, b[1] + lz * left] as Pair,
      rightStart: [a[0] - lx * right, a[1] - lz * right] as Pair,
      rightEnd: [b[0] - lx * right, b[1] - lz * right] as Pair,
    };
    corners.push(quad);
    pieces.push([quad.leftStart, quad.leftEnd, quad.rightEnd, quad.rightStart]);
  }
  // Bends: the rectangles overlap on the inside and leave a wedge open on the outside.
  for (let i = 1; i + 1 < points.length; i++) {
    const before = headings[i - 1] as number;
    let turn = (headings[i] as number) - before;
    while (turn > Math.PI) turn -= 2 * Math.PI;
    while (turn < -Math.PI) turn += 2 * Math.PI;
    if (Math.abs(turn) < MIN_BEND) continue;
    const centre = points[i] as Pair;
    // Turning right (positive, as z grows southwards) opens the left side, and the other way round.
    const onLeft = turn > 0;
    const radius = onLeft ? left : right;
    if (radius <= 0) continue;
    const side = onLeft ? -Math.PI / 2 : Math.PI / 2;
    const from = onLeft ? corners[i - 1]?.leftEnd : corners[i - 1]?.rightEnd;
    const to = onLeft ? corners[i]?.leftStart : corners[i]?.rightStart;
    if (!from || !to) continue;
    const between = arc(centre, radius, before + side, before + turn + side).slice(1, -1);
    pieces.push([centre, from, ...between, to]);
  }
  // Round ends: a quarter circle per side, each no bigger than that side's width.
  const cap = (centre: Pair, heading: number, radius: number): void => {
    if (radius <= 0) return;
    // `heading` points out of the line's end; left of the line is then on our right.
    const leftR = Math.min(radius, left);
    const rightR = Math.min(radius, right);
    if (leftR > 0) {
      pieces.push([centre, ...arc(centre, leftR, heading + Math.PI / 2, heading)]);
    }
    if (rightR > 0) {
      pieces.push([centre, ...arc(centre, rightR, heading, heading - Math.PI / 2)]);
    }
  };
  cap(points[0] as Pair, (headings[0] as number) + Math.PI, ends.start);
  cap(points[points.length - 1] as Pair, headings[headings.length - 1] as number, ends.end);
  return pieces;
}
