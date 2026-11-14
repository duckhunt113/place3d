// Sun and sky light. Starting values come from the art-style skill: a warm late-afternoon sun
// about 40 degrees up and slightly from the side, soft blue-grey shadows, a sky-blue fill.

import * as THREE from "three";

const SUN_COLOUR = 0xffe6c0;
const SUN_STRENGTH = 3.2;
const SKY_FILL = 0xbfd9f5;
const GROUND_BOUNCE = 0x8a9a5b;
const FILL_STRENGTH = 2.2;
/** Where the sun sits: 40 degrees above the horizon, in the south-west. */
const SUN_HEIGHT_DEG = 40;
const SUN_BEARING_DEG = 235;
/** CLAUDE.md, hard rule 7: one shadow-casting light. Its map is shared by the whole view. */
const SHADOW_MAP_SIZE = 4096;

export type Lighting = {
  /** Points the shadows at the area around a centre (local metres), `radiusM` wide. */
  cover(centre: THREE.Vector3, radiusM: number): void;
};

export function createLighting(scene: THREE.Scene): Lighting {
  scene.add(new THREE.HemisphereLight(SKY_FILL, GROUND_BOUNCE, FILL_STRENGTH));

  const sun = new THREE.DirectionalLight(SUN_COLOUR, SUN_STRENGTH);
  sun.castShadow = true;
  sun.shadow.mapSize.set(SHADOW_MAP_SIZE, SHADOW_MAP_SIZE);
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.08;
  scene.add(sun, sun.target);

  // Local axes: x east, z south, y up. A bearing is measured clockwise from north.
  const height = THREE.MathUtils.degToRad(SUN_HEIGHT_DEG);
  const bearing = THREE.MathUtils.degToRad(SUN_BEARING_DEG);
  const towardsSun = new THREE.Vector3(
    Math.sin(bearing) * Math.cos(height),
    Math.sin(height),
    -Math.cos(bearing) * Math.cos(height),
  );

  return {
    cover(centre, radiusM) {
      const distance = radiusM * 3;
      sun.target.position.copy(centre);
      sun.position.copy(centre).addScaledVector(towardsSun, distance);
      const camera = sun.shadow.camera;
      camera.left = -radiusM;
      camera.right = radiusM;
      camera.top = radiusM;
      camera.bottom = -radiusM;
      camera.near = 1;
      camera.far = distance * 2;
      camera.updateProjectionMatrix();
    },
  };
}
