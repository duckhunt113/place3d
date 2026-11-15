// Shop names on sign boards. The boards themselves are ordinary models (instances.ts); this
// file draws every name of a tile into ONE picture and lays one flat piece over each board's
// face, so all the signs of a tile cost a single extra draw call.

import "@fontsource/fredoka/latin-600.css";
import "@fontsource/fredoka/latin-ext-600.css";
import type { Placement } from "@somewhere/world";
import * as THREE from "three";
import type { AssetLibrary } from "./assets.ts";
import type { PaletteColours } from "./meshes.ts";
import { layoutSignText } from "./sign-text.ts";

/** Our sign lettering: rounded and bold. The others are fallbacks if it cannot be loaded. */
const FONT = '600 {size}px Fredoka, "Avenir Next", "Segoe UI", system-ui, sans-serif';
const fontAt = (sizePx: number) => FONT.replace("{size}", String(Math.round(sizePx)));
/** One name's patch of the picture, in pixels. The same shape as a board's face (6 to 1). */
const CELL = { width: 768, height: 128 };
/** Names sit side by side in this many columns. */
const COLUMNS = 2;
/** Face colour when a sign did not get one, and the two letter colours (palette names). */
const DEFAULT_FACE = "cream";
const LIGHT_LETTERS = "road.white";
const DARK_LETTERS = "charcoal";
/** Faces brighter than this get dark letters. */
const BRIGHT = 0.6;
/** The names float this far in front of the board's face, so the two never flicker. */
const LIFT_M = 0.004;
/** Space between two lines of a name, as a share of the letter size. */
const LINE_GAP = 1.12;

/** Makes sure the sign lettering is loaded before anything is drawn with it. */
async function fontReady(text: string): Promise<void> {
  try {
    await document.fonts.load(fontAt(64), text);
  } catch {
    // The fallback lettering is used instead.
  }
}

/**
 * The names of a tile's signs as one mesh, or undefined if no placement carries a name.
 * `maxSharpness` is the renderer's best texture filtering (anisotropy).
 */
export async function signsToMesh(
  placements: readonly Placement[],
  library: AssetLibrary,
  colours: PaletteColours,
  maxSharpness: number,
): Promise<THREE.Mesh | undefined> {
  const signs = placements.filter(
    (placement) => placement.text && library.textFace(placement.asset),
  );
  if (signs.length === 0) return undefined;
  await fontReady(signs.map((sign) => sign.text).join(" "));

  const rows = Math.ceil(signs.length / COLUMNS);
  const canvas = document.createElement("canvas");
  canvas.width = CELL.width * COLUMNS;
  canvas.height = CELL.height * rows;
  const pen = canvas.getContext("2d");
  if (!pen) return undefined;
  pen.textAlign = "center";
  pen.textBaseline = "middle";
  const measure = (text: string, sizePx: number): number => {
    pen.font = fontAt(sizePx);
    return pen.measureText(text).width;
  };

  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  signs.forEach((sign, i) => {
    const column = i % COLUMNS;
    const row = Math.floor(i / COLUMNS);
    const left = column * CELL.width;
    const top = row * CELL.height;
    const faceName = sign.tint && colours.has(sign.tint) ? sign.tint : DEFAULT_FACE;
    const face = colours.get(faceName);
    pen.fillStyle = `#${face.getHexString()}`;
    pen.fillRect(left, top, CELL.width, CELL.height);
    const hsl = { h: 0, s: 0, l: 0 };
    face.getHSL(hsl);
    const letters = colours.get(hsl.l > BRIGHT ? DARK_LETTERS : LIGHT_LETTERS);
    pen.fillStyle = `#${letters.getHexString()}`;
    const layout = layoutSignText(sign.text ?? "", CELL.width, CELL.height, measure);
    pen.font = fontAt(layout.sizePx);
    const step = layout.sizePx * LINE_GAP;
    layout.lines.forEach((line, n) => {
      const y = top + CELL.height / 2 + (n - (layout.lines.length - 1) / 2) * step;
      pen.fillText(line, left + CELL.width / 2, y);
    });

    // The board's face in the model, moved to where this board hangs.
    const rect = library.textFace(sign.asset);
    if (!rect) return;
    const cos = Math.cos(sign.rotY);
    const sin = Math.sin(sign.rotY);
    const corner = (x: number, y: number): [number, number, number] => {
      const mx = x * sign.scale;
      const mz = (rect.z + LIFT_M) * sign.scale;
      return [
        sign.pos[0] + mx * cos + mz * sin,
        sign.pos[1] + y * sign.scale,
        sign.pos[2] - mx * sin + mz * cos,
      ];
    };
    const u0 = left / canvas.width;
    const u1 = (left + CELL.width) / canvas.width;
    const v0 = 1 - (top + CELL.height) / canvas.height;
    const v1 = 1 - top / canvas.height;
    const quad: [[number, number, number], [number, number]][] = [
      [corner(rect.minX, rect.minY), [u0, v0]],
      [corner(rect.maxX, rect.minY), [u1, v0]],
      [corner(rect.maxX, rect.maxY), [u1, v1]],
      [corner(rect.minX, rect.minY), [u0, v0]],
      [corner(rect.maxX, rect.maxY), [u1, v1]],
      [corner(rect.minX, rect.maxY), [u0, v1]],
    ];
    for (const [point, uv] of quad) {
      positions.push(...point);
      normals.push(sin, 0, cos);
      uvs.push(...uv);
    }
  });

  const picture = new THREE.CanvasTexture(canvas);
  picture.colorSpace = THREE.SRGBColorSpace;
  picture.anisotropy = maxSharpness;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  const mesh = new THREE.Mesh(geometry, new THREE.MeshLambertMaterial({ map: picture }));
  mesh.name = "sign names";
  mesh.receiveShadow = true;
  return mesh;
}

/** Frees a tile's sign picture and mesh. */
export function disposeSigns(mesh: THREE.Mesh): void {
  mesh.geometry.dispose();
  const material = mesh.material as THREE.MeshLambertMaterial;
  material.map?.dispose();
  material.dispose();
}
