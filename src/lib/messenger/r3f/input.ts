// Shared player input state. Both the keyboard hook and the on-screen touch
// controls write into this single object; the Avatar frame loop reads it. Using
// a module singleton (like playerPosition) avoids prop-drilling a ref from the
// DOM HUD into the R3F scene.

export interface InputState {
  forward: boolean;
  back: boolean;
  left: boolean;
  right: boolean;
  sprint: boolean;
  jump: boolean;
  interact: boolean;
}

export const inputState: InputState = {
  forward: false,
  back: false,
  left: false,
  right: false,
  sprint: false,
  jump: false,
  interact: false,
};

export function resetInput() {
  inputState.forward = false;
  inputState.back = false;
  inputState.left = false;
  inputState.right = false;
  inputState.sprint = false;
  inputState.jump = false;
  inputState.interact = false;
}

/** Set movement from an analog stick vector (x: right+, y: down+ in screen
 *  space). Mapped to the digital flags the Avatar already understands, with the
 *  outer ring acting as sprint. */
export function setMoveVector(x: number, y: number) {
  const mag = Math.hypot(x, y);
  const dead = 0.32;
  if (mag < dead) {
    inputState.forward = inputState.back = inputState.left = inputState.right = false;
    inputState.sprint = false;
    return;
  }
  inputState.forward = y < -dead;
  inputState.back = y > dead;
  inputState.left = x < -dead;
  inputState.right = x > dead;
  inputState.sprint = mag > 0.9;
}
