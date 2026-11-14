// How the player moves: walking, running, jumping and falling. No keyboard, no camera, no
// three.js here: this file turns "what the player wants" into "where the player is".

import type { Character, Vec3 } from "../physics/world.ts";

/** Sizes and speeds, in metres and seconds. Change the feel of walking here. */
export const PLAYER = {
  heightM: 1.8,
  radiusM: 0.3,
  /** How high the eyes are above the feet. */
  eyeHeightM: 1.7,
  walkSpeed: 4,
  runSpeed: 8,
  /** Upward speed at take-off; with the gravity below, a jump rises about 0.9 m. */
  jumpSpeed: 6,
  gravity: 20,
  /** Falling never gets faster than this. */
  maxFallSpeed: 40,
} as const;

/** The physics runs in fixed steps, so walking feels the same at any frame rate. */
export const STEP_SECONDS = 1 / 60;
/** After a long pause (a hidden tab), catch up by at most this many steps. */
const MAX_STEPS_PER_UPDATE = 5;

/** What the player is asking for right now. */
export type Intent = {
  /** 1 forwards, -1 backwards. */
  forward: number;
  /** 1 right, -1 left. */
  right: number;
  run: boolean;
  jump: boolean;
  /** Which way they face: radians, 0 looks north (-z), growing clockwise. */
  yaw: number;
};

/** The walkable area: a circle on the ground, in local metres. */
export type Bounds = { centre: [number, number]; radiusM: number };

export type Walker = {
  /** Moves time forward by `seconds`, following the intent. */
  update(seconds: number, intent: Intent): void;
  /** Where the feet are, smoothed between physics steps. */
  position(): Vec3;
  /** True while standing on something. */
  grounded(): boolean;
  /** Puts the player somewhere, standing still. */
  place(feet: Vec3): void;
  /** Keeps the player inside a circle, or anywhere when left out. */
  setBounds(bounds: Bounds | undefined): void;
};

export function createWalker(character: Character): Walker {
  let before = character.position();
  let now = before;
  let fallSpeed = 0;
  let onGround = false;
  let leftover = 0;
  let bounds: Bounds | undefined;

  const step = (intent: Intent): void => {
    // The direction asked for, turned to where the player faces; diagonals are no faster.
    const length = Math.hypot(intent.forward, intent.right);
    const speed = intent.run ? PLAYER.runSpeed : PLAYER.walkSpeed;
    const scale = length > 0 ? (speed * STEP_SECONDS) / Math.max(1, length) : 0;
    const sin = Math.sin(intent.yaw);
    const cos = Math.cos(intent.yaw);
    let dx = (intent.forward * sin + intent.right * cos) * scale;
    let dz = (-intent.forward * cos + intent.right * sin) * scale;

    if (bounds) {
      // Past the edge, aim for the nearest point on the circle instead: the player slides along it.
      const tx = now[0] + dx - bounds.centre[0];
      const tz = now[2] + dz - bounds.centre[1];
      const distance = Math.hypot(tx, tz);
      if (distance > bounds.radiusM) {
        const pull = bounds.radiusM / distance;
        dx = bounds.centre[0] + tx * pull - now[0];
        dz = bounds.centre[1] + tz * pull - now[2];
      }
    }

    if (onGround) {
      // A small push down keeps the feet on the ground; jumping replaces it.
      fallSpeed = intent.jump ? PLAYER.jumpSpeed : -1;
    } else {
      fallSpeed = Math.max(-PLAYER.maxFallSpeed, fallSpeed - PLAYER.gravity * STEP_SECONDS);
    }

    const heightBefore = now[1];
    onGround = character.move([dx, fallSpeed * STEP_SECONDS, dz]);
    before = now;
    now = character.position();
    // Bumping the head on something stops the rise.
    if (fallSpeed > 0 && now[1] - heightBefore < fallSpeed * STEP_SECONDS * 0.5) fallSpeed = 0;
  };

  return {
    update(seconds, intent) {
      leftover += Math.max(0, seconds);
      let steps = 0;
      while (leftover >= STEP_SECONDS) {
        leftover -= STEP_SECONDS;
        if (steps++ < MAX_STEPS_PER_UPDATE) step(intent);
      }
    },
    position() {
      const blend = leftover / STEP_SECONDS;
      return [
        before[0] + (now[0] - before[0]) * blend,
        before[1] + (now[1] - before[1]) * blend,
        before[2] + (now[2] - before[2]) * blend,
      ];
    },
    grounded: () => onGround,
    place(feet) {
      character.teleport(feet);
      before = feet;
      now = feet;
      fallSpeed = 0;
      onGround = false;
      leftover = 0;
    },
    setBounds(next) {
      bounds = next;
    },
  };
}
