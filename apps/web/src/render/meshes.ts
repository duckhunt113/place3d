// Plain mesh data from the world package -> Three.js meshes. Colours come from the palette by name.

import type { MeshData, Palette, TileMeshes } from "@somewhere/world";
import * as THREE from "three";

/** One shared material per palette colour, made the first time the colour is used. */
export class PaletteMaterials {
  readonly #palette: Palette;
  readonly #materials = new Map<string, THREE.Material>();

  constructor(palette: Palette) {
    this.#palette = palette;
  }

  colour(name: string): THREE.Color {
    const entry = this.#palette.colors[name];
    if (!entry) throw new Error(`"${name}" is not a colour in palette.json`);
    return new THREE.Color(entry.hex);
  }

  get(name: string): THREE.Material {
    let material = this.#materials.get(name);
    if (!material) {
      material = new THREE.MeshLambertMaterial({ color: this.colour(name) });
      this.#materials.set(name, material);
    }
    return material;
  }
}

function toGeometry(data: MeshData): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(data.positions, 3));
  geometry.setAttribute("normal", new THREE.BufferAttribute(data.normals, 3));
  geometry.setAttribute("uv", new THREE.BufferAttribute(data.uvs, 2));
  geometry.setIndex(new THREE.BufferAttribute(data.indices, 1));
  return geometry;
}

/** One group per tile, holding one mesh per material. */
export function tileToGroup(tile: TileMeshes, materials: PaletteMaterials): THREE.Group {
  const group = new THREE.Group();
  group.name = tile.key;
  for (const data of tile.meshes) {
    const mesh = new THREE.Mesh(toGeometry(data), materials.get(data.material));
    mesh.name = `${tile.key} ${data.material}`;
    group.add(mesh);
  }
  return group;
}

/** Frees a tile's GPU memory. Materials are shared, so they are left alone. */
export function disposeGroup(group: THREE.Group): void {
  group.traverse((object) => {
    if (object instanceof THREE.Mesh) object.geometry.dispose();
  });
}
