"use client";

import { useEffect, useState } from "react";
import { LUT3DEffect } from "postprocessing";
import {
  Data3DTexture,
  RGBAFormat,
  UnsignedByteType,
  LinearFilter,
  ClampToEdgeWrapping,
  LinearSRGBColorSpace,
} from "three";
import { publicPath } from "@/lib/messenger/assets";

/**
 * Full-screen 3D colour-grading LUT, the final pass that gives the world its
 * warm "Ghibli" tone. This is the original's own lut.ktx2 (a 32^3 RGBA16F
 * tetrahedral LUT), decompressed offline to /assets/lut-data.bin (32^3 RGBA8)
 * and applied here exactly as the original did (tetrahedral interpolation, sRGB
 * domain).
 */
export default function Lut3D({ intensity = 1 }: { intensity?: number }) {
  const [effect, setEffect] = useState<LUT3DEffect | null>(null);

  useEffect(() => {
    let alive = true;
    fetch(publicPath("/assets/lut-data.bin"))
      .then((r) => r.arrayBuffer())
      .then((buf) => {
        if (!alive) return;
        const tex = new Data3DTexture(new Uint8Array(buf), 32, 32, 32);
        tex.format = RGBAFormat;
        tex.type = UnsignedByteType;
        tex.minFilter = LinearFilter;
        tex.magFilter = LinearFilter;
        tex.wrapS = ClampToEdgeWrapping;
        tex.wrapT = ClampToEdgeWrapping;
        tex.wrapR = ClampToEdgeWrapping;
        tex.colorSpace = LinearSRGBColorSpace; // LUT texels are used raw, not sample-converted
        tex.needsUpdate = true;
        const e = new LUT3DEffect(tex, { tetrahedralInterpolation: true });
        e.blendMode.opacity.value = intensity;
        setEffect(e);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (effect) effect.blendMode.opacity.value = intensity;
  }, [effect, intensity]);

  if (!effect) return null;
  return <primitive object={effect} dispose={null} />;
}
