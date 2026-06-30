"use client";

import { useCallback, useRef, useState } from "react";
import { inputState, setMoveVector } from "@/lib/messenger/r3f/input";

// On-screen controls for touch devices: a left analog joystick (movement +
// sprint on the outer ring) and a right jump button. Both write into the shared
// input singleton the Avatar reads, so no scene changes are needed.
const KNOB_TRAVEL = 44; // max knob offset from centre (px)

export default function TouchControls() {
  const baseRef = useRef<HTMLDivElement>(null);
  const center = useRef({ x: 0, y: 0 });
  const stickId = useRef<number | null>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const [jumpDown, setJumpDown] = useState(false);

  const onStickDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    const el = baseRef.current;
    if (!el) return;
    // Floating joystick: the centre is wherever the thumb first lands, so the
    // (invisible) stick tracks relative to the initial touch.
    center.current = { x: e.clientX, y: e.clientY };
    stickId.current = e.pointerId;
    el.setPointerCapture(e.pointerId);
  }, []);

  const onStickMove = useCallback((e: React.PointerEvent) => {
    if (stickId.current !== e.pointerId) return;
    e.preventDefault();
    let dx = e.clientX - center.current.x;
    let dy = e.clientY - center.current.y;
    const mag = Math.hypot(dx, dy);
    if (mag > KNOB_TRAVEL) {
      dx = (dx / mag) * KNOB_TRAVEL;
      dy = (dy / mag) * KNOB_TRAVEL;
    }
    setKnob({ x: dx, y: dy });
    setMoveVector(dx / KNOB_TRAVEL, dy / KNOB_TRAVEL);
  }, []);

  const onStickUp = useCallback((e: React.PointerEvent) => {
    if (stickId.current !== e.pointerId) return;
    stickId.current = null;
    setKnob({ x: 0, y: 0 });
    setMoveVector(0, 0);
  }, []);

  const setJump = useCallback((v: boolean) => {
    inputState.jump = v;
    setJumpDown(v);
  }, []);

  return (
    <div className="touch-controls" aria-hidden="true">
      <div
        ref={baseRef}
        className="touch-joystick"
        onPointerDown={onStickDown}
        onPointerMove={onStickMove}
        onPointerUp={onStickUp}
        onPointerCancel={onStickUp}
      >
        <div
          className="touch-joystick__knob"
          style={{ transform: `translate(${knob.x}px, ${knob.y}px)` }}
        />
      </div>

      <button
        type="button"
        className={`touch-jump${jumpDown ? " touch-jump--down" : ""}`}
        onPointerDown={(e) => {
          e.preventDefault();
          setJump(true);
        }}
        onPointerUp={() => setJump(false)}
        onPointerLeave={() => setJump(false)}
        onPointerCancel={() => setJump(false)}
      >
        JUMP
      </button>
    </div>
  );
}
