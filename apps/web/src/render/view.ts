// The 3D view: scene, lights, a fly-around debug camera and an FPS counter.
// src/render is the only place that imports three.js.

import type { Palette, TileMeshes, Vec2 } from "@somewhere/world";
import * as THREE from "three";
import { MapControls } from "three/addons/controls/MapControls.js";
import Stats from "three/addons/libs/stats.module.js";
import { disposeGroup, PaletteMaterials, tileToGroup } from "./meshes.ts";

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

export function createWorldView(container: HTMLElement, palette: Palette): WorldView {
  const materials = new PaletteMaterials(palette);
  // A logarithmic depth buffer keeps roads from flickering against the ground far away.
  const renderer = new THREE.WebGLRenderer({ antialias: true, logarithmicDepthBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO));
  container.append(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = materials.colour("cloud.shade");
  scene.add(
    new THREE.HemisphereLight(materials.colour("cloud"), materials.colour("wall.base"), 1.6),
  );
  // One sun, from the south-west and high up, so walls facing different ways differ in shade.
  const sun = new THREE.DirectionalLight(materials.colour("cloud"), 2.2);
  sun.position.set(-0.5, 1, 0.7);
  scene.add(sun);

  const tiles = new Map<string, THREE.Group>();
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
      if (old) {
        world.remove(old);
        disposeGroup(old);
      }
      const group = tileToGroup(tile, materials);
      tiles.set(tile.key, group);
      world.add(group);
    },
    clear() {
      for (const group of tiles.values()) {
        world.remove(group);
        disposeGroup(group);
      }
      tiles.clear();
    },
    lookAt(centre, radiusM) {
      // The camera sits south of the point and above it, so north is up on screen and east is right.
      controls.target.set(centre[0], 0, centre[1]);
      camera.position.set(centre[0], radiusM * 1.3, centre[1] + radiusM * 1.1);
      controls.update();
    },
  };
}
