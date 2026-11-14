// Keyboard and mouse for walking. Plain browser events; nothing here knows about the 3D view.

import type { Intent } from "./walker.ts";

export type Input = {
  /** What the player is asking for right now, including which way they face. */
  intent(): Intent;
  /** Looking up (positive) or down, in radians. */
  pitch(): number;
  /** Turns the player to face a direction, looking level. */
  face(yaw: number): void;
  /** Turns walking controls on or off. Turning them off lets go of the mouse and all keys. */
  setEnabled(enabled: boolean): void;
};

/** Radians turned per pixel of mouse movement. */
const LOOK_SPEED = 0.0022;
/** How far up or down the player can look: just short of straight up. */
const MAX_PITCH = (85 * Math.PI) / 180;

const FORWARD = ["KeyW", "ArrowUp"];
const BACK = ["KeyS", "ArrowDown"];
const LEFT = ["KeyA", "ArrowLeft"];
const RIGHT = ["KeyD", "ArrowRight"];
const RUN = ["ShiftLeft", "ShiftRight"];
const JUMP = ["Space"];
const USED = new Set([...FORWARD, ...BACK, ...LEFT, ...RIGHT, ...RUN, ...JUMP]);

/** True while the player is typing in a text box, where keys must not move them. */
const isTyping = (event: Event): boolean =>
  event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement;

/** Listens on the page for keys, and on `surface` (the 3D view) for the mouse. */
export function createInput(surface: HTMLElement): Input {
  const down = new Set<string>();
  let enabled = false;
  let yaw = 0;
  let pitch = 0;
  /** True while a mouse button is held on the view (looking around without capturing the mouse). */
  let dragging = false;

  const captured = () => document.pointerLockElement === surface;
  const held = (codes: readonly string[]) => codes.some((code) => down.has(code));

  window.addEventListener("keydown", (event) => {
    if (!enabled || isTyping(event) || !USED.has(event.code)) return;
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    down.add(event.code);
    // Space and the arrow keys would otherwise scroll the page or press a focused button.
    event.preventDefault();
  });
  window.addEventListener("keyup", (event) => {
    down.delete(event.code);
  });
  // Keys held while the window loses focus would otherwise stay "held" forever.
  window.addEventListener("blur", () => down.clear());

  surface.addEventListener("mousedown", () => {
    if (!enabled) return;
    dragging = true;
    if (captured()) return;
    // Capturing the mouse can be refused (for example right after pressing Esc); dragging still works.
    try {
      void Promise.resolve(surface.requestPointerLock()).catch(() => {});
    } catch {
      // Older browsers throw instead of returning a promise.
    }
  });
  window.addEventListener("mouseup", () => {
    dragging = false;
  });
  window.addEventListener("mousemove", (event) => {
    if (!enabled || !(captured() || dragging)) return;
    yaw += event.movementX * LOOK_SPEED;
    pitch = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, pitch - event.movementY * LOOK_SPEED));
  });

  return {
    intent: () => ({
      forward: (held(FORWARD) ? 1 : 0) - (held(BACK) ? 1 : 0),
      right: (held(RIGHT) ? 1 : 0) - (held(LEFT) ? 1 : 0),
      run: held(RUN),
      jump: held(JUMP),
      yaw,
    }),
    pitch: () => pitch,
    face(next) {
      yaw = next;
      pitch = 0;
    },
    setEnabled(next) {
      enabled = next;
      if (enabled) return;
      down.clear();
      dragging = false;
      if (captured()) document.exitPointerLock();
    },
  };
}
