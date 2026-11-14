// The player: input, a walking body, and the eyes the camera looks through.

import type { Spawn } from "@somewhere/world";
import type { Physics, Vec3 } from "../physics/world.ts";
import { createInput } from "./input.ts";
import { type Bounds, createWalker, PLAYER } from "./walker.ts";

export type Eye = {
  /** Where the eyes are, in local metres. */
  pos: Vec3;
  /** Radians, 0 looks north, growing clockwise. */
  yaw: number;
  /** Radians, positive looks up. */
  pitch: number;
};

export type Player = {
  /** Moves time forward. Call once per frame while walking. */
  update(seconds: number): void;
  eye(): Eye;
  /** Puts the player at a starting point, facing its direction. */
  spawn(spawn: Spawn): void;
  /** Keeps the player inside a circle on the ground. */
  setBounds(bounds: Bounds | undefined): void;
  /** Turns the walking controls on or off. */
  setActive(active: boolean): void;
};

/** The player starts this far above the ground and settles onto it. */
const DROP_M = 0.1;
/** Falling this far below the start means there was no ground: go back to the start. */
const LOST_BELOW_M = 50;
/** How fast the eyes follow a change in height (per second). Smooths steps and tiny bumps. */
const EYE_FOLLOW = 18;

export function createPlayer(physics: Physics, surface: HTMLElement): Player {
  const input = createInput(surface);
  const walker = createWalker(physics.createCharacter(PLAYER));
  let start: Vec3 = [0, DROP_M, 0];
  let eyeY = start[1] + PLAYER.eyeHeightM;

  return {
    update(seconds) {
      walker.update(seconds, input.intent());
      const feet = walker.position();
      if (feet[1] < start[1] - LOST_BELOW_M) {
        walker.place(start);
        eyeY = start[1] + PLAYER.eyeHeightM;
        return;
      }
      const target = feet[1] + PLAYER.eyeHeightM;
      eyeY += (target - eyeY) * Math.min(1, seconds * EYE_FOLLOW);
    },
    eye() {
      const feet = walker.position();
      return { pos: [feet[0], eyeY, feet[2]], yaw: input.intent().yaw, pitch: input.pitch() };
    },
    spawn(spawn) {
      start = [spawn.pos[0], spawn.pos[1] + DROP_M, spawn.pos[2]];
      walker.place(start);
      eyeY = start[1] + PLAYER.eyeHeightM;
      input.face(spawn.yaw);
    },
    setBounds: (bounds) => walker.setBounds(bounds),
    setActive: (active) => input.setEnabled(active),
  };
}
