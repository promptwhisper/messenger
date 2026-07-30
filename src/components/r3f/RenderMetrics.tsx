"use client";

import { useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";

/** Exposes a rolling real-frame FPS sample for deterministic browser QA. */
export default function RenderMetrics({ dpr }: { dpr: number }) {
  const gl = useThree((state) => state.gl);
  const sample = useRef({ elapsed: 0, frames: 0 });

  useFrame((_, delta) => {
    const current = sample.current;
    current.elapsed += delta;
    current.frames += 1;
    if (current.elapsed < 1) return;
    gl.domElement.dataset.renderFps = String(Math.round(current.frames / current.elapsed));
    gl.domElement.dataset.renderDpr = dpr.toFixed(2);
    current.elapsed = 0;
    current.frames = 0;
  });
  return null;
}
