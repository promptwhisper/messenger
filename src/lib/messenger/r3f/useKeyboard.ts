"use client";

import { useEffect, useRef } from "react";
import { type InputState, inputState, resetInput } from "./input";

export type { InputState };

const KEY_MAP: Record<string, keyof InputState> = {
  KeyW: "forward",
  ArrowUp: "forward",
  KeyS: "back",
  ArrowDown: "back",
  KeyA: "left",
  ArrowLeft: "left",
  KeyD: "right",
  ArrowRight: "right",
  ShiftLeft: "sprint",
  ShiftRight: "sprint",
  Space: "jump",
  KeyE: "interact",
};

/**
 * Tracks the Messenger control bindings (WASD/arrows + Shift sprint + Space
 * jump) into the shared input singleton, and returns it as a ref so the render
 * loop reads input without re-rendering. Touch controls write to the same
 * singleton.
 */
export function useKeyboard(): React.RefObject<InputState> {
  const state = useRef<InputState>(inputState);

  useEffect(() => {
    const set = (code: string, value: boolean) => {
      const key = KEY_MAP[code];
      if (key) inputState[key] = value;
    };
    const down = (e: KeyboardEvent) => {
      if (e.code in KEY_MAP) e.preventDefault();
      set(e.code, true);
    };
    const up = (e: KeyboardEvent) => set(e.code, false);
    const blur = () => resetInput();

    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
    };
  }, []);

  return state;
}
