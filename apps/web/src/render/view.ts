// The 3D view: scene, sky, lights, a fly-around debug camera and an FPS counter.
// src/render is the only place that imports three.js.

import type { AssetCatalog, Palette, TileMeshes, Vec2 } from "@somewhere/world";
import * as THREE from "three";
import { MapControls } from "three/addons/controls/MapControls.js";
import Stats from "three/addons/libs/stats.module.js";
import { AssetLibrary } from "./assets.ts";
import { disposeInstances, placementsToGroup } from "./instances.ts";
import { createLighting } from "./lighting.ts";
import { createSurfaceMaterial, PaletteColours, tileToMesh } from "./meshes.ts";
import { addSky } from "./sky.ts";

export type WorldView = {
  /** Shows a built tile, replacing an older copy of the same tile. */
  addTile(tile: TileMeshes): void;
  /** Removes every tile. */
  clear(): void;
  /** Moves the camera above a point (local metres), looking north, far enough to see `radiusM` around it. */
  lookAt(centre: Vec2, radiusM: number): void;
};

/** CLAUDE.md, hard rule 7: cap the pixel ratio. */
const MAX_PIXEL_RATIO = 2;
/** Tiles reach past the requested circle (up to a tile's diagonal), and so must the shadows. */
const SHADOW_REACH = 2;

export function createWorldView(
  container: HTMLElement,
  palette: Palette,
  catalog: AssetCatalog,
  assetsUrl: string,
): WorldView {
  const colours = new PaletteColours(palette);
  const surface = createSurfaceMaterial();
  const library = new AssetLibrary(catalog, colours, assetsUrl);
  // A logarithmic depth buffer keeps roads from flickering against the ground far away.
  const renderer = new THREE.WebGLRenderer({ antialias: true, logarithmicDepthBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  container.append(renderer.domElement);

  const scene = new THREE.Scene();
  addSky(scene);
  const lighting = createLighting(scene);

  type Shown = { ground: THREE.Mesh; models?: THREE.Group };
  const tiles = new Map<string, Shown>();
  const remove = (shown: Shown) => {
    world.remove(shown.ground);
    shown.ground.geometry.dispose();
    if (shown.models) {
      world.remove(shown.models);
      disposeInstances(shown.models);
    }
  };
  const world = new THREE.Group();
  scene.add(world);

  const camera = new THREE.PerspectiveCamera(55, 1, 1, 6000);
  const controls = new MapControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.maxPolarAngle = Math.PI / 2 - 0.05;
  controls.minDistance = 5;
  controls.maxDistance = 2500;

  const stats = new Stats();
  // The counter sits top-left by default; move it out of the panel's way.
  stats.dom.style.top = "auto";
  stats.dom.style.bottom = "0";
  container.append(stats.dom);

  const resize = () => {
    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;
    renderer.setSize(width, height);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  };
  window.addEventListener("resize", resize);
  resize();

  renderer.setAnimationLoop(() => {
    controls.update();
    renderer.render(scene, camera);
    stats.update();
  });

  return {
    addTile(tile) {
      const old = tiles.get(tile.key);
      if (old) remove(old);
      const shown: Shown = { ground: tileToMesh(tile, colours, surface) };
      tiles.set(tile.key, shown);
      world.add(shown.ground);
      if (tile.placements.length === 0) return;
      // Models arrive a moment later; skip them if the tile was replaced or cleared meanwhile.
      void library.load(tile.placements.map((p) => p.asset)).then(() => {
        if (tiles.get(tile.key) !== shown) return;
        shown.models = placementsToGroup(tile.placements, library, surface);
        world.add(shown.models);
      });
    },
    clear() {
      for (const shown of tiles.values()) remove(shown);
      tiles.clear();
    },
    lookAt(centre, radiusM) {
      // The camera sits south of the point and above it, so north is up on screen and east is right.
      controls.target.set(centre[0], 0, centre[1]);
      // Shadows cover every tile a circle of this radius can touch.
      lighting.cover(controls.target, radiusM * SHADOW_REACH);
      camera.position.set(centre[0], radiusM * 1.3, centre[1] + radiusM * 1.1);
      controls.update();
    },
  };
}
