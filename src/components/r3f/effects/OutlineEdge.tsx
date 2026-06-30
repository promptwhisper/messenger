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
uniform sampler2D uNormalBuffer;

vec3 readNormal(const in vec2 uv) {
  return texture2D(uNormalBuffer, uv).xyz * 2.0 - 1.0;
}

// 8-neighbour sampling (incl. diagonals) over two radii so the ink line is thick
// and continuous around every silhouette/crease, closer to the original's bold
// hand-drawn outline than a thin 4-tap edge.
const vec2 DIRS[8] = vec2[8](
  vec2(1.0, 0.0), vec2(-1.0, 0.0), vec2(0.0, 1.0), vec2(0.0, -1.0),
  vec2(0.707, 0.707), vec2(-0.707, 0.707), vec2(0.707, -0.707), vec2(-0.707, -0.707)
);

void mainImage(const in vec4 inputColor, const in vec2 uv, const in float depth, out vec4 outputColor) {
  vec2 tx = uTexel * uWidth;
  float zc = -getViewZ(depth);
  vec3 nC = readNormal(uv);

  // Take the strongest single-direction discontinuity (max), not the sum, so
  // dense thin geometry (railings, boat scaffolding) doesn't accumulate into a
  // solid black blob. Depth is relativised by view distance for consistent lines.
  float dMax = 0.0;
  float nMax = 0.0;
  for (int i = 0; i < 8; i++) {
    vec2 o1 = DIRS[i] * tx;
    vec2 o2 = DIRS[i] * tx * 2.0;
    float z1 = -getViewZ(readDepth(uv + o1));
    float z2 = -getViewZ(readDepth(uv + o2));
    dMax = max(dMax, max(abs(zc - z1), abs(zc - z2) * 0.8));
    nMax = max(nMax, 1.0 - max(0.0, dot(nC, readNormal(uv + o1))));
    nMax = max(nMax, (1.0 - max(0.0, dot(nC, readNormal(uv + o2)))) * 0.85);
  }

  float depthEdge = step(uThreshold, dMax / max(zc, 1.0)) * uStrength;
  float normalEdge = step(uNormalThreshold, nMax) * uNormalStrength;
  float edge = max(depthEdge, normalEdge);
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
}

class OutlineEdgeEffectImpl extends Effect {
  constructor({
    color = "#241f1b",
    strength = 0.9,
    threshold = 0.18,
    normalStrength = 0.95,
    normalThreshold = 0.55,
    width = 1.6,
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
