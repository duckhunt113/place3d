// The sky: saturated blue overhead fading to a paler blue at the horizon, plus light haze.
// Sky colours are not in the palette; the art-style skill gives them.

import * as THREE from "three";

const SKY_TOP = 0x5b9be6;
const SKY_HORIZON = 0xa9cdf2;
const HAZE = 0xcfe3f5;
/** Haze by view: light and close while walking; far away for the free view, hundreds of metres up. */
const HAZE_RANGE = {
  walk: { near: 120, far: 450 },
  free: { near: 900, far: 6000 },
} as const;

export type Sky = {
  /** Sets how near the haze starts, to suit walking or the free view. */
  setHaze(view: keyof typeof HAZE_RANGE): void;
};

export function addSky(scene: THREE.Scene): Sky {
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(1, 32, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        top: { value: new THREE.Color(SKY_TOP) },
        horizon: { value: new THREE.Color(SKY_HORIZON) },
      },
      vertexShader: /* glsl */ `
        varying float height;
        void main() {
          height = normalize(position).y;
          // Keep the dome centred on the camera and behind everything else.
          vec4 placed = projectionMatrix * vec4(mat3(modelViewMatrix) * position, 1.0);
          gl_Position = placed.xyww;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 top;
        uniform vec3 horizon;
        varying float height;
        void main() {
          float blend = pow(clamp(height, 0.0, 1.0), 0.6);
          gl_FragColor = vec4(mix(horizon, top, blend), 1.0);
          #include <colorspace_fragment>
        }
      `,
    }),
  );
  dome.name = "sky";
  dome.frustumCulled = false;
  dome.renderOrder = -1;
  scene.add(dome);
  const haze = new THREE.Fog(HAZE, HAZE_RANGE.free.near, HAZE_RANGE.free.far);
  scene.fog = haze;
  return {
    setHaze(view) {
      haze.near = HAZE_RANGE[view].near;
      haze.far = HAZE_RANGE[view].far;
    },
  };
}
