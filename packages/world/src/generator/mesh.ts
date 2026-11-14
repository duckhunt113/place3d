// Collects triangles into plain mesh data: one mesh per material (a palette colour name) per tile.
// Nothing here knows about three.js; the renderer turns MeshData into real meshes.

import type { MeshData } from "../types.ts";

export type Vec3 = [number, number, number];
export type Uv = [number, number];

const NO_UV: Uv = [0, 0];

export class MeshBuilder {
  readonly #positions: number[] = [];
  readonly #normals: number[] = [];
  readonly #uvs: number[] = [];

  get triangleCount(): number {
    return this.#positions.length / 9;
  }

  /**
   * Adds one flat triangle. The corners are reordered if needed so the triangle faces the
   * way `normal` points (counter-clockwise when seen from that side).
   */
  addTriangle(
    a: Vec3,
    b: Vec3,
    c: Vec3,
    normal: Vec3,
    uvA = NO_UV,
    uvB = NO_UV,
    uvC = NO_UV,
  ): void {
    const ux = b[0] - a[0];
    const uy = b[1] - a[1];
    const uz = b[2] - a[2];
    const vx = c[0] - a[0];
    const vy = c[1] - a[1];
    const vz = c[2] - a[2];
    const facing =
      (uy * vz - uz * vy) * normal[0] +
      (uz * vx - ux * vz) * normal[1] +
      (ux * vy - uy * vx) * normal[2];
    const corners: [Vec3, Uv][] =
      facing >= 0
        ? [
            [a, uvA],
            [b, uvB],
            [c, uvC],
          ]
        : [
            [a, uvA],
            [c, uvC],
            [b, uvB],
          ];
    for (const [position, uv] of corners) {
      this.#positions.push(position[0], position[1], position[2]);
      this.#normals.push(normal[0], normal[1], normal[2]);
      this.#uvs.push(uv[0], uv[1]);
    }
  }

  /** Adds a flat four-sided face, corners given in order around it. */
  addQuad(a: Vec3, b: Vec3, c: Vec3, d: Vec3, normal: Vec3, uvs: [Uv, Uv, Uv, Uv]): void {
    this.addTriangle(a, b, c, normal, uvs[0], uvs[1], uvs[2]);
    this.addTriangle(a, c, d, normal, uvs[0], uvs[2], uvs[3]);
  }

  toMeshData(material: string): MeshData {
    const indices = new Uint32Array(this.#positions.length / 3);
    for (let i = 0; i < indices.length; i++) indices[i] = i;
    return {
      material,
      positions: new Float32Array(this.#positions),
      normals: new Float32Array(this.#normals),
      uvs: new Float32Array(this.#uvs),
      indices,
    };
  }
}

/** The meshes of one tile, keyed by material. */
export class MeshSet {
  readonly #builders = new Map<string, MeshBuilder>();

  get(material: string): MeshBuilder {
    let builder = this.#builders.get(material);
    if (!builder) {
      builder = new MeshBuilder();
      this.#builders.set(material, builder);
    }
    return builder;
  }

  /** One mesh per material, sorted by material name so the output order never varies. */
  toMeshData(): MeshData[] {
    return [...this.#builders.entries()]
      .filter(([, builder]) => builder.triangleCount > 0)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([material, builder]) => builder.toMeshData(material));
  }
}
