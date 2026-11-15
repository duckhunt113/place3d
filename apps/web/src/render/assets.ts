// Loads the pre-made models (.glb) listed in the asset catalog, only the ones a tile uses.
// Each model is flattened into ONE piece of geometry with its palette colours written into
// its corners, so it can share the surface material and be drawn many times at once.

import type { AssetCatalog, AssetId } from "@somewhere/world";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import type { PaletteColours } from "./meshes.ts";

/** Models name their materials "pal:<palette colour>" (CLAUDE.md, asset conventions). */
const PALETTE_PREFIX = "pal:";
/** The face of a sign board, where a shop's name goes (signs.ts). Plain cream underneath. */
const SIGN_FACE = "sign:face";
const SIGN_FACE_COLOUR = "cream";

/** Where a model's text face is, in the model's own metres: a flat rectangle facing +z. */
export type TextFace = { minX: number; maxX: number; minY: number; maxY: number; z: number };

/** Blender adds ".001" to repeated material names; the real name is the part before it. */
const nameOf = (material: THREE.Material): string => material.name.replace(/\.\d{3}$/, "");

export class AssetLibrary {
  readonly #files = new Map<AssetId, string>();
  readonly #loading = new Map<AssetId, Promise<THREE.BufferGeometry>>();
  readonly #ready = new Map<AssetId, THREE.BufferGeometry>();
  readonly #textFaces = new Map<AssetId, TextFace>();
  readonly #loader = new GLTFLoader();
  readonly #colours: PaletteColours;
  readonly #baseUrl: string;

  constructor(catalog: AssetCatalog, colours: PaletteColours, baseUrl: string) {
    for (const entry of catalog.assets) this.#files.set(entry.id, entry.file);
    this.#colours = colours;
    this.#baseUrl = baseUrl;
  }

  /** The geometry of a model that has finished loading. */
  get(id: AssetId): THREE.BufferGeometry | undefined {
    return this.#ready.get(id);
  }

  /** The text face of a loaded model, if it has one (sign boards do). */
  textFace(id: AssetId): TextFace | undefined {
    return this.#textFaces.get(id);
  }

  /** Loads the given models (each file only once). Models that fail are reported and skipped. */
  async load(ids: Iterable<AssetId>): Promise<void> {
    await Promise.all(
      [...new Set(ids)].map(async (id) => {
        try {
          this.#ready.set(id, await this.#one(id));
        } catch (error) {
          console.warn(`Model "${id}" could not be loaded: ${String(error)}`);
        }
      }),
    );
  }

  #one(id: AssetId): Promise<THREE.BufferGeometry> {
    let pending = this.#loading.get(id);
    if (!pending) {
      const file = this.#files.get(id);
      pending = file
        ? this.#loader
            .loadAsync(`${this.#baseUrl}${file}`)
            .then((gltf) => this.#flatten(id, gltf.scene))
        : Promise.reject(new Error("not in catalog.json"));
      this.#loading.set(id, pending);
    }
    return pending;
  }

  #colourOf(material: THREE.Material): THREE.Color {
    const name = nameOf(material);
    if (name === SIGN_FACE) return this.#colours.get(SIGN_FACE_COLOUR);
    if (name.startsWith(PALETTE_PREFIX)) {
      const colour = name.slice(PALETTE_PREFIX.length);
      if (this.#colours.has(colour)) return this.#colours.get(colour);
      console.warn(`Model material "${material.name}" is not a colour in palette.json`);
    }
    const own = (material as THREE.MeshStandardMaterial).color;
    return own instanceof THREE.Color ? own : new THREE.Color(0xff00ff);
  }

  #flatten(id: AssetId, root: THREE.Object3D): THREE.BufferGeometry {
    root.updateMatrixWorld(true);
    const parts: THREE.BufferGeometry[] = [];
    root.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      const material = Array.isArray(object.material) ? object.material[0] : object.material;
      const source = object.geometry as THREE.BufferGeometry;
      const flat = source.index ? source.toNonIndexed() : source.clone();
      flat.applyMatrix4(object.matrixWorld);
      if (!flat.getAttribute("normal")) flat.computeVertexNormals();
      if (nameOf(material) === SIGN_FACE) {
        flat.computeBoundingBox();
        const box = flat.boundingBox;
        if (box) {
          this.#textFaces.set(id, {
            minX: box.min.x,
            maxX: box.max.x,
            minY: box.min.y,
            maxY: box.max.y,
            z: box.max.z,
          });
        }
      }
      const count = flat.getAttribute("position").count;
      const colour = this.#colourOf(material);
      const tints = new Float32Array(count * 3);
      for (let i = 0; i < count; i++) tints.set([colour.r, colour.g, colour.b], i * 3);
      const part = new THREE.BufferGeometry();
      part.setAttribute("position", flat.getAttribute("position"));
      part.setAttribute("normal", flat.getAttribute("normal"));
      part.setAttribute("color", new THREE.BufferAttribute(tints, 3));
      parts.push(part);
    });
    const merged = parts.length > 0 ? mergeGeometries(parts) : null;
    if (!merged) throw new Error("the file has no meshes");
    return merged;
  }
}
