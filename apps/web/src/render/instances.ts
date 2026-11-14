// Draws a tile's models. Every copy of the same model in a tile is one instanced mesh, so
// hundreds of trees cost one draw call per kind of tree (CLAUDE.md, hard rule 7).

import type { AssetId, Placement } from "@somewhere/world";
import * as THREE from "three";
import type { AssetLibrary } from "./assets.ts";

const UP = new THREE.Vector3(0, 1, 0);

export function placementsToGroup(
  placements: readonly Placement[],
  library: AssetLibrary,
  material: THREE.Material,
): THREE.Group {
  const byAsset = new Map<AssetId, Placement[]>();
  for (const placement of placements) {
    const list = byAsset.get(placement.asset) ?? [];
    list.push(placement);
    byAsset.set(placement.asset, list);
  }
  const group = new THREE.Group();
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const turn = new THREE.Quaternion();
  const size = new THREE.Vector3();
  for (const [asset, list] of byAsset) {
    const geometry = library.get(asset);
    if (!geometry) continue;
    const mesh = new THREE.InstancedMesh(geometry, material, list.length);
    mesh.name = asset;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    list.forEach((placement, i) => {
      position.fromArray(placement.pos);
      turn.setFromAxisAngle(UP, placement.rotY);
      size.setScalar(placement.scale);
      mesh.setMatrixAt(i, matrix.compose(position, turn, size));
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    group.add(mesh);
  }
  return group;
}

/** Frees the per-tile instance buffers. The model geometry itself is shared and stays loaded. */
export function disposeInstances(group: THREE.Group): void {
  for (const child of group.children) {
    if (child instanceof THREE.InstancedMesh) child.dispose();
  }
}
