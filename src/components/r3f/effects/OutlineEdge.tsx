"use client";

import { useContext, useEffect, useMemo } from "react";
import { Effect, EffectAttribute } from "postprocessing";
import { EffectComposerContext } from "@react-three/postprocessing";
import { Uniform, Vector2, Color, type Texture } from "three";

/**
 * Cartoon outline = depth-discontinuity edges (silhouettes) + normal-
 * discontinuity edges (interior creases: nose, chin, folds). The normal buffer
 * comes from the EffectComposer's normal pass. Our own edge-detection effect.
 */
const fragmentShader = /* glsl */ `
uniform vec3 uColor;
uniform float uStrength;
uniform float uThreshold;
uniform float uNormalStrength;
uniform float uNormalThreshold;
uniform vec2 uTexel;
uniform float uWidth;
uniform float uFadeNear;
uniform float uFadeFar;
uniform sampler2D uNormalBuffer;

vec3 readNormal(const in vec2 uv) {
  return texture2D(uNormalBuffer, uv).xyz * 2.0 - 1.0;
}

const vec2 DIRS[4] = vec2[4](
  vec2(1.0, 0.0), vec2(-1.0, 0.0), vec2(0.0, 1.0), vec2(0.0, -1.0)
);

void mainImage(const in vec4 inputColor, const in vec2 uv, const in float depth, out vec4 outputColor) {
  vec2 tx = uTexel * uWidth;
  float zc = -getViewZ(depth);
  vec3 nC = readNormal(uv);

  float dMax = 0.0;
  float nMax = 0.0;
  for (int i = 0; i < 4; i++) {
    vec2 sampleUv = clamp(uv + DIRS[i] * tx, vec2(0.0), vec2(1.0));
    float zn = -getViewZ(readDepth(sampleUv));
    dMax = max(dMax, abs(zc - zn) / max(zc, 1.0));
    nMax = max(nMax, 1.0 - max(0.0, dot(nC, readNormal(sampleUv))));
  }

  float depthEdge = smoothstep(uThreshold, uThreshold + 0.01001, dMax) * uStrength;
  float normalEdge = smoothstep(uNormalThreshold, uNormalThreshold + 0.1, nMax) * uNormalStrength;
  float distanceFade = 1.0 - smoothstep(uFadeNear, uFadeFar, zc);
  float edge = max(depthEdge, normalEdge) * distanceFade;
  outputColor = vec4(mix(inputColor.rgb, uColor, edge), inputColor.a);
}
`;

interface OutlineEdgeOptions {
  color?: string;
  strength?: number;
  threshold?: number;
  normalStrength?: number;
  normalThreshold?: number;
  width?: number;
  fadeNear?: number;
  fadeFar?: number;
}

class OutlineEdgeEffectImpl extends Effect {
  constructor({
    color = "#363a3c",
    strength = 1,
    threshold = 0.0001,
    normalStrength = 0.3,
    normalThreshold = 0.4,
    width = 1,
    fadeNear = 5,
    fadeFar = 80,
  }: OutlineEdgeOptions = {}) {
    super("OutlineEdgeEffect", fragmentShader, {
      attributes: EffectAttribute.DEPTH,
      uniforms: new Map<string, Uniform>([
        ["uColor", new Uniform(new Color(color))],
        ["uStrength", new Uniform(strength)],
        ["uThreshold", new Uniform(threshold)],
        ["uNormalStrength", new Uniform(normalStrength)],
        ["uNormalThreshold", new Uniform(normalThreshold)],
        ["uTexel", new Uniform(new Vector2())],
        ["uWidth", new Uniform(width)],
        ["uFadeNear", new Uniform(fadeNear)],
        ["uFadeFar", new Uniform(fadeFar)],
        ["uNormalBuffer", new Uniform<Texture | null>(null)],
      ]),
    });
  }

  setSize(width: number, height: number) {
    (this.uniforms.get("uTexel")!.value as Vector2).set(1 / width, 1 / height);
  }
}

export default function OutlineEdge(props: OutlineEdgeOptions) {
  const { normalPass } = useContext(EffectComposerContext);
  const effect = useMemo(
    () => new OutlineEdgeEffectImpl(props),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      props.color,
      props.strength,
      props.threshold,
      props.normalStrength,
      props.normalThreshold,
      props.width,
      props.fadeNear,
      props.fadeFar,
    ]
  );

  useEffect(() => {
    const u = effect.uniforms.get("uNormalBuffer");
    if (u && normalPass) {
      u.value = normalPass.texture;
    }
  }, [effect, normalPass]);

  return <primitive object={effect} dispose={null} />;
}
