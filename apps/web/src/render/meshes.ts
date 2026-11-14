// Plain mesh data from the world package -> Three.js meshes. Colours come from the palette by name.

import type { MeshData, Palette, TileMeshes } from "@somewhere/world";
import * as THREE from "three";

/** Palette colours by name, as Three.js colours. */
export class PaletteColours {
  readonly #palette: Palette;
  readonly #colours = new Map<string, THREE.Color>();

  constructor(palette: Palette) {
    this.#palette = palette;
  }

  get(name: string): THREE.Color {
    let colour = this.#colours.get(name);
    if (!colour) {
      const entry = this.#palette.colors[name];
      if (!entry) throw new Error(`"${name}" is not a colour in palette.json`);
      colour = new THREE.Color(entry.hex);
      this.#colours.set(name, colour);
    }
    return colour;
  }

  has(name: string): boolean {
    return name in this.#palette.colors;
  }
}

/** One material for everything generated: each surface carries its own colour in its corners. */
export function createSurfaceMaterial(): THREE.Material {
  return new THREE.MeshLambertMaterial({ vertexColors: true });
}

/**
 * One mesh per tile: every material's triangles joined, with the palette colour written into
 * each corner. A whole tile is then a single draw call (CLAUDE.md, hard rule 7).
 */
export function tileToMesh(
  tile: TileMeshes,
  colours: PaletteColours,
  material: THREE.Material,
): THREE.Mesh {
  const count = tile.meshes.reduce((sum, data) => sum + data.positions.length / 3, 0);
  const positions = new Float32Array(count * 3);
  const normals = new Float32Array(count * 3);
  const tints = new Float32Array(count * 3);
  let offset = 0;
  const add = (data: MeshData) => {
    const colour = colours.get(data.material);
    // The world package lists every triangle's corners in order, so no index is needed.
    for (const i of data.indices) {
      positions.set(data.positions.subarray(i * 3, i * 3 + 3), offset);
      normals.set(data.normals.subarray(i * 3, i * 3 + 3), offset);
      tints[offset] = colour.r;
      tints[offset + 1] = colour.g;
      tints[offset + 2] = colour.b;
      offset += 3;
    }
  };
  for (const data of tile.meshes) add(data);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(tints, 3));
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = tile.key;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}
