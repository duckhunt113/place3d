// Streets: every road, path, curb and sidewalk of a tile worked out together as flat shapes,
// so junctions are clean (no overlapping ribbons) and sidewalks wrap neatly around corners.
//
// How: thicken every road line into a ribbon, join all ribbons into one driving surface, do
// the same with wider ribbons for the curb and the sidewalk, and cut the driving surface out
// of those. A driveway therefore cuts through the curb by itself.

import type { ColorName, RoadDecision, Vec2 } from "../types.ts";
import type { Pair } from "../util/geometry.ts";
import {
  cutAway,
  join,
  overlap,
  type RibbonEnds,
  ribbonPieces,
  type Shape,
  unite,
} from "../util/shapes.ts";
import { addFlat } from "./ground.ts";
import type { MeshSet } from "./mesh.ts";

/** Heights above the ground, so roads, paths and paint never fight for the same pixels. */
export const ROAD_Y = 0.03;
export const PATH_Y = 0.05;
/** Painted lines sit just above the road. */
export const MARKING_Y = ROAD_Y + 0.012;

/** The curb: a strip this wide along the road's edge, raised by CURB_HEIGHT_M. */
export const CURB_WIDTH_M = 0.3;
export const CURB_HEIGHT_M = 0.15;
/** The sidewalk beyond the curb, at the same height. */
export const SIDEWALK_WIDTH_M = 1.5;
/** Width of a painted centre line. Wider than real paint, so it reads from a distance. */
export const CENTRE_LINE_M = 0.2;
export const CENTRE_LINE_COLOUR: ColorName = "road.yellow";
/** A centre line stops this far short of the edge of a road it meets. */
const JUNCTION_CLEAR_M = 1.5;

/** One piece of a road inside the tile's margin, in local metres, with its decision. */
export type RoadPiece = {
  decision: RoadDecision;
  line: Vec2[];
  /** Metres along the whole road to this piece's first point. */
  offsetM: number;
  /** True where the piece was cut at the margin's edge instead of ending at a real end. */
  cutStart: boolean;
  cutEnd: boolean;
};

/** How far the curb and the sidewalk reach beyond each edge of the road. */
export function sideWidths(decision: RoadDecision): {
  curb: number;
  left: number;
  right: number;
} {
  if (decision.kind === "path") return { curb: 0, left: 0, right: 0 };
  const curb = decision.curbs ? CURB_WIDTH_M : 0;
  const walk = (side: "left" | "right") =>
    decision.sidewalks === "both" || decision.sidewalks === side ? SIDEWALK_WIDTH_M : 0;
  return { curb, left: curb + walk("left"), right: curb + walk("right") };
}

/** The furthest anything belonging to the road reaches from its centre line. */
export function roadReach(decision: RoadDecision): number {
  const sides = sideWidths(decision);
  return decision.widthM / 2 + Math.max(sides.left, sides.right);
}

/** Everything a tile's streets are made of, as flat shapes (not yet cut to the tile's edges). */
export type StreetPlan = {
  /** Driving surfaces, one shape per surface colour. */
  roadways: { colour: ColorName; shape: Shape }[];
  /** All driving surfaces together. */
  driving: Shape;
  /** Footpaths and cycle paths, with roads and sidewalks cut out. */
  paths: { colour: ColorName; shape: Shape }[];
  /** The raised strip along road edges. */
  curb: Shape;
  /** The raised walkway beyond the curb. */
  sidewalk: Shape;
  /** Curb and sidewalk together: everything that stands CURB_HEIGHT_M above the road. */
  raised: Shape;
  /** Painted centre lines. */
  centreLines: Shape;
};

const nodeKey = (p: Vec2): string => `${Math.round(p[0] * 100)},${Math.round(p[1] * 100)}`;

type Visit = { piece: number; isEnd: boolean };
type Node = { point: Vec2; visits: Visit[] };

/** Which pieces pass through or end at each point (points match to the centimetre). */
function indexNodes(pieces: readonly RoadPiece[]): Map<string, Node> {
  const nodes = new Map<string, Node>();
  pieces.forEach((piece, index) => {
    piece.line.forEach((point, i) => {
      // A piece's cut end is not a real place where roads meet.
      const isFirst = i === 0;
      const isLast = i === piece.line.length - 1;
      if ((isFirst && piece.cutStart) || (isLast && piece.cutEnd)) return;
      const key = nodeKey(point);
      const node = nodes.get(key) ?? { point, visits: [] };
      node.visits.push({ piece: index, isEnd: isFirst || isLast });
      nodes.set(key, node);
    });
  });
  return nodes;
}

/**
 * How round each end of each piece is, for ribbons of the given half-widths. A dead end gets
 * a full round end. Where roads meet, the end is only as round as the narrowest road there,
 * so a wide road never bulges out of the far side of a narrow one. Cut ends stay square.
 */
function roundEnds(
  pieces: readonly RoadPiece[],
  nodes: Map<string, Node>,
  halfWidth: (piece: RoadPiece) => number,
  takesPart: (piece: RoadPiece) => boolean,
): RibbonEnds[] {
  return pieces.map((piece, index) => {
    const own = halfWidth(piece);
    const at = (point: Vec2 | undefined, cut: boolean): number => {
      if (!point || cut) return 0;
      let radius = own;
      for (const visit of nodes.get(nodeKey(point))?.visits ?? []) {
        const other = pieces[visit.piece] as RoadPiece;
        if (visit.piece !== index && takesPart(other)) radius = Math.min(radius, halfWidth(other));
      }
      return radius;
    };
    return {
      start: at(piece.line[0], piece.cutStart),
      end: at(piece.line[piece.line.length - 1], piece.cutEnd),
    };
  });
}

function byColour(parts: Map<ColorName, Pair[][]>): { colour: ColorName; shape: Shape }[] {
  return [...parts.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([colour, rings]) => ({ colour, shape: unite(rings) }))
    .filter((layer) => layer.shape.length > 0);
}

/** A circle drawn with 16 flat sides. */
function disc(centre: Vec2, radius: number): Pair[] {
  const ring: Pair[] = [];
  for (let i = 0; i < 16; i++) {
    const angle = (i / 16) * 2 * Math.PI;
    ring.push([centre[0] + Math.cos(angle) * radius, centre[1] + Math.sin(angle) * radius]);
  }
  return ring;
}

/** Works out the shapes of all streets from the road pieces in and around a tile. */
export function planStreets(pieces: readonly RoadPiece[]): StreetPlan {
  const nodes = indexNodes(pieces);
  const isRoad = (piece: RoadPiece) => piece.decision.kind !== "path";
  const isPath = (piece: RoadPiece) => piece.decision.kind === "path";
  const half = (piece: RoadPiece) => piece.decision.widthM / 2;

  // Driving surfaces.
  const roadEnds = roundEnds(pieces, nodes, half, isRoad);
  const roadParts = new Map<ColorName, Pair[][]>();
  pieces.forEach((piece, i) => {
    if (!isRoad(piece)) return;
    const rings = roadParts.get(piece.decision.surface) ?? [];
    rings.push(...ribbonPieces(piece.line, half(piece), half(piece), roadEnds[i]));
    roadParts.set(piece.decision.surface, rings);
  });
  const roadways = byColour(roadParts);
  const driving =
    roadways.length === 1 ? (roadways[0]?.shape ?? []) : join(...roadways.map((r) => r.shape));

  // Curbs and sidewalks: the same lines, thickened further, with the driving surface cut out.
  const curbReach = (piece: RoadPiece) => half(piece) + sideWidths(piece.decision).curb;
  const curbEnds = roundEnds(pieces, nodes, curbReach, isRoad);
  const walkEnds = roundEnds(pieces, nodes, (piece) => roadReach(piece.decision), isRoad);
  const curbRings: Pair[][] = [];
  const walkRings: Pair[][] = [];
  pieces.forEach((piece, i) => {
    if (!isRoad(piece)) return;
    const sides = sideWidths(piece.decision);
    if (sides.curb > 0) {
      curbRings.push(...ribbonPieces(piece.line, curbReach(piece), curbReach(piece), curbEnds[i]));
    }
    if (sides.left > sides.curb || sides.right > sides.curb) {
      walkRings.push(
        ...ribbonPieces(
          piece.line,
          half(piece) + sides.left,
          half(piece) + sides.right,
          walkEnds[i],
        ),
      );
    }
  });
  const curbOuter = unite(curbRings);
  const walkOuter = unite(walkRings);
  const curb = cutAway(curbOuter, driving);
  const sidewalk = cutAway(walkOuter, curbOuter, driving);
  const raised = cutAway(join(curbOuter, walkOuter), driving);

  // Paths end where they meet a road or a sidewalk.
  const pathEnds = roundEnds(pieces, nodes, half, isPath);
  const pathParts = new Map<ColorName, Pair[][]>();
  pieces.forEach((piece, i) => {
    if (!isPath(piece)) return;
    const rings = pathParts.get(piece.decision.surface) ?? [];
    rings.push(...ribbonPieces(piece.line, half(piece), half(piece), pathEnds[i]));
    pathParts.set(piece.decision.surface, rings);
  });
  const paths = byColour(pathParts)
    .map((layer) => ({ colour: layer.colour, shape: cutAway(layer.shape, driving, raised) }))
    .filter((layer) => layer.shape.length > 0);

  // Centre lines, broken where three or more street arms meet.
  const isStreet = (piece: RoadPiece) => piece.decision.kind === "road" && piece.decision.curbs;
  const lineRings: Pair[][] = [];
  for (const piece of pieces) {
    if (piece.decision.markings !== "centre" || !isRoad(piece)) continue;
    lineRings.push(...ribbonPieces(piece.line, CENTRE_LINE_M / 2, CENTRE_LINE_M / 2));
  }
  let centreLines = unite(lineRings);
  if (centreLines.length > 0) {
    const gaps: Pair[][] = [];
    for (const { point, visits } of nodes.values()) {
      const streets = visits.filter((visit) => isStreet(pieces[visit.piece] as RoadPiece));
      const arms = streets.reduce((sum, visit) => sum + (visit.isEnd ? 1 : 2), 0);
      if (arms < 3) continue;
      const widest = Math.max(...streets.map((visit) => half(pieces[visit.piece] as RoadPiece)));
      gaps.push(disc(point, widest + JUNCTION_CLEAR_M));
    }
    if (gaps.length > 0) centreLines = cutAway(centreLines, unite(gaps));
  }

  return { roadways, driving, paths, curb, sidewalk, raised, centreLines };
}

/** Adds the flat parts of the streets (driving surfaces, paths, centre lines), cut to the tile. */
export function addStreets(meshes: MeshSet, plan: StreetPlan, tile: Shape): void {
  for (const { colour, shape } of plan.roadways)
    addFlat(meshes, overlap(shape, tile), ROAD_Y, colour);
  for (const { colour, shape } of plan.paths) addFlat(meshes, overlap(shape, tile), PATH_Y, colour);
  addFlat(meshes, overlap(plan.centreLines, tile), MARKING_Y, CENTRE_LINE_COLOUR);
}
