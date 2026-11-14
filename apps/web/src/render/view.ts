// The 3D view: scene, sky, lights, two cameras (the player's eyes and a fly-around free view)
// and an FPS counter.
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

/** Walking shows the world through the player's eyes; free is the fly-around camera. */
export type ViewMode = "walk" | "free";

export type WorldView = {
  /** The drawing surface, for mouse input. */
  canvas: HTMLCanvasElement;
  /** Switches between the player's eyes and the free view. */
  setMode(mode: ViewMode): void;
  /** Moves the player's eyes: position in local metres, yaw (0 north, clockwise) and pitch (up positive). */
  setEye(pos: readonly [number, number, number], yaw: number, pitch: number): void;
  /** Calls `handler` before every frame is drawn, with the seconds since the last one. */
  onFrame(handler: (seconds: number) => void): void;
  /** Shows a built tile, replacing an older copy of the same tile. */
  addTile(tile: TileMeshes): void;
  /** Removes every tile. */
  clear(): void;
  /** Moves the free camera above a point (local metres), looking north, far enough to see `radiusM` around it. */
  lookAt(centre: Vec2, radiusM: number): void;
};

/** CLAUDE.md, hard rule 7: cap the pixel ratio. */
const MAX_PIXEL_RATIO = 2;
/** Tiles reach past the requested circle (up to a tile's diagonal), and so must the shadows. */
const SHADOW_REACH = 2;
/** While walking, shadows are only drawn this far around the player, which keeps them sharp. */
const WALK_SHADOW_RADIUS_M = 120;
/** The walking shadow area moves in steps of this size, so shadows do not shimmer with every step. */
const WALK_SHADOW_STEP_M = 16;
/** Leaving walking, the free camera starts this far behind and above the player. */
const FREE_START = { backM: 70, upM: 80 };
/** A frame never counts for longer than this, so a pause does not become a leap. */
const MAX_FRAME_SECONDS = 0.1;

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
  const sky = addSky(scene);
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

  // The free view: looks down on the area from high up.
  const overview = new THREE.PerspectiveCamera(55, 1, 1, 6000);
  // The player's eyes: a wider view, and able to stand right next to a wall.
  const eyes = new THREE.PerspectiveCamera(70, 1, 0.1, 2000);
  eyes.rotation.order = "YXZ";
  let mode: ViewMode = "free";
  const camera = () => (mode === "walk" ? eyes : overview);
  /** The area the free view shows: its shadows cover all of it. */
  const area = { centre: new THREE.Vector3(), radiusM: 300 };
  /** Where the walking shadows are centred now. */
  const shadowCentre = new THREE.Vector3(Number.NaN, 0, 0);
  const frameHandlers: ((seconds: number) => void)[] = [];

  const controls = new MapControls(overview, renderer.domElement);
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
    for (const each of [overview, eyes]) {
      each.aspect = width / height;
      each.updateProjectionMatrix();
    }
  };
  window.addEventListener("resize", resize);
  resize();

  /** Keeps the sharp walking shadows around the player, moving them only in whole steps. */
  const followWithShadows = () => {
    const x = Math.round(eyes.position.x / WALK_SHADOW_STEP_M) * WALK_SHADOW_STEP_M;
    const z = Math.round(eyes.position.z / WALK_SHADOW_STEP_M) * WALK_SHADOW_STEP_M;
    if (x === shadowCentre.x && z === shadowCentre.z) return;
    shadowCentre.set(x, 0, z);
    lighting.cover(shadowCentre, WALK_SHADOW_RADIUS_M);
  };

  let lastFrame = performance.now();
  renderer.setAnimationLoop(() => {
    const now = performance.now();
    const seconds = Math.min(MAX_FRAME_SECONDS, (now - lastFrame) / 1000);
    lastFrame = now;
    for (const handler of frameHandlers) handler(seconds);
    if (mode === "free") controls.update();
    renderer.render(scene, camera());
    stats.update();
  });

  return {
    canvas: renderer.domElement,
    setMode(next) {
      if (next === mode) return;
      mode = next;
      controls.enabled = mode === "free";
      sky.setHaze(mode);
      if (mode === "walk") {
        shadowCentre.setX(Number.NaN);
        followWithShadows();
        return;
      }
      // Start the free view behind and above the player, looking the way they were looking.
      const facing = -eyes.rotation.y;
      controls.target.set(eyes.position.x, 0, eyes.position.z);
      overview.position.set(
        eyes.position.x - Math.sin(facing) * FREE_START.backM,
        FREE_START.upM,
        eyes.position.z + Math.cos(facing) * FREE_START.backM,
      );
      controls.update();
      lighting.cover(area.centre, area.radiusM * SHADOW_REACH);
    },
    setEye(pos, yaw, pitch) {
      eyes.position.set(pos[0], pos[1], pos[2]);
      // three.js turns anticlockwise for positive angles; our yaw grows clockwise.
      eyes.rotation.set(pitch, -yaw, 0);
      if (mode === "walk") followWithShadows();
    },
    onFrame(handler) {
      frameHandlers.push(handler);
    },
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
      overview.position.set(centre[0], radiusM * 1.3, centre[1] + radiusM * 1.1);
      controls.update();
      // In the free view, shadows cover every tile a circle of this radius can touch.
      area.centre.copy(controls.target);
      area.radiusM = radiusM;
      if (mode === "free") lighting.cover(area.centre, area.radiusM * SHADOW_REACH);
    },
  };
}
