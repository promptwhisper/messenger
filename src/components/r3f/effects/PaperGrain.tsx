"use client";

import { useMemo } from "react";
import { Effect } from "postprocessing";
import { Color, Uniform, Vector2 } from "three";

/**
 * Final "hand-painted paper" pass: a gentle desaturation toward the original's
 * low-saturation palette, plus a soft mid-scale grain so the flat toon fills read
 * as watercolour-on-paper rather than clean 3D gradients.
 */
const fragmentShader = /* glsl */ `
uniform vec2 uResolution;
uniform float uSaturation;
uniform float uGrain;
uniform float uBrightness;
uniform float uContrast;
uniform float uWarmth;
uniform float uVignette;
uniform float uHalftone;
uniform float uHalftoneScale;
uniform float uDuotone;
uniform float uPosterize;
uniform float uComic;
uniform vec3 uDuotoneDark;
uniform vec3 uDuotoneLight;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}

float screenDot(vec2 uv, float scale, float angle, float radius) {
  float c = cos(angle);
  float s = sin(angle);
  mat2 rot = mat2(c, -s, s, c);
  vec2 p = rot * (uv * uResolution / max(scale, 1.0));
  vec2 cell = fract(p) - 0.5;
  return 1.0 - smoothstep(radius, radius + 0.075, length(cell));
}

void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  vec3 col = inputColor.rgb;
  float l = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(vec3(l), col, uSaturation);
  col = (col - 0.5) * uContrast + 0.5;
  col += vec3(0.09, 0.035, -0.08) * uWarmth;

  // Graphic-print modes: either remap luminance to two inks, or keep colour
  // while snapping each channel into chunky comic-book colour plates.
  float printLuma = clamp(dot(col, vec3(0.299, 0.587, 0.114)), 0.0, 1.0);
  if (uPosterize > 1.5) {
    if (uComic > 0.01) {
      col = floor(clamp(col, 0.0, 1.0) * (uPosterize - 1.0) + 0.5) / (uPosterize - 1.0);
      col = mix(col, smoothstep(vec3(0.04), vec3(0.96), col), 0.35);
    } else {
      printLuma = floor(printLuma * (uPosterize - 1.0) + 0.5) / (uPosterize - 1.0);
    }
  }
  vec3 printColor = mix(uDuotoneDark, uDuotoneLight, printLuma);
  col = mix(col, printColor, uDuotone);

  // multi-scale paper grain so flat fills read as watercolour on paper
  float g1 = vnoise(uv * uResolution * 0.5);
  float g2 = vnoise(uv * uResolution * 0.12);
  float paper = g1 * 0.55 + g2 * 0.45;
  col *= 1.0 - uGrain + uGrain * 2.0 * paper;

  // subtle warm/cool pigment mottling (watercolour pooling)
  float m = paper - 0.5;
  col.r *= 1.0 + m * 0.05;
  col.b *= 1.0 - m * 0.05;

  // American-comic pass: bold Ben-Day colour plates with tiny registration
  // offsets. It stays screen-space stable so moving the camera keeps the comic
  // texture glued to the page, not swimming through the 3D world.
  float comicShade = clamp(1.0 - dot(col, vec3(0.299, 0.587, 0.114)), 0.0, 1.0);
  float comicLuma = 1.0 - comicShade;
  float plateMask = smoothstep(0.16, 0.42, comicLuma) * (1.0 - smoothstep(0.88, 1.0, comicLuma));
  float comicRadius = mix(0.035, 0.23, comicShade);
  float redPlate = screenDot(uv + vec2(0.0025, -0.0015), uHalftoneScale * 1.25, 0.18, comicRadius);
  float bluePlate = screenDot(uv + vec2(-0.002, 0.002), uHalftoneScale * 1.45, -0.35, comicRadius * 0.86);
  float yellowPlate = screenDot(uv + vec2(0.001, 0.0025), uHalftoneScale * 1.08, 0.7, comicRadius * 0.72);
  vec3 plateColor = vec3(1.0, 0.18, 0.08) * redPlate * 0.12
    + vec3(0.06, 0.24, 0.95) * bluePlate * 0.075
    + vec3(1.0, 0.76, 0.06) * yellowPlate * 0.07;
  vec3 plateShadow = vec3(redPlate * 0.022, (redPlate + bluePlate) * 0.014, bluePlate * 0.022);
  col = mix(col, clamp(col + (plateColor - plateShadow) * plateMask, 0.0, 1.0), uComic);

  // Printed manga dots: darker areas receive larger ink dots on a stable
  // screen-space grid, preserving the hand-drawn outlines underneath.
  vec2 cell = fract(uv * uResolution / max(uHalftoneScale, 1.0)) - 0.5;
  float shade = clamp(1.0 - dot(col, vec3(0.299, 0.587, 0.114)), 0.0, 1.0);
  float radius = mix(0.05, 0.46, shade);
  float ink = 1.0 - smoothstep(radius, radius + 0.08, length(cell));
  col *= 1.0 - ink * uHalftone * 0.58;

  float vignette = smoothstep(0.26, 0.72, length(uv - 0.5));
  col *= 1.0 - vignette * uVignette;
  col *= uBrightness;
  outputColor = vec4(col, inputColor.a);
}
`;

interface PaperGrainOptions {
  saturation?: number;
  grain?: number;
  brightness?: number;
  contrast?: number;
  warmth?: number;
  vignette?: number;
  halftone?: number;
  halftoneScale?: number;
  duotone?: number;
  posterize?: number;
  comic?: number;
  duotoneDark?: string;
  duotoneLight?: string;
}

class PaperGrainEffectImpl extends Effect {
  constructor({
    saturation = 0.84,
    grain = 0.06,
    brightness = 1,
    contrast = 1,
    warmth = 0,
    vignette = 0,
    halftone = 0,
    halftoneScale = 5,
    duotone = 0,
    posterize = 0,
    comic = 0,
    duotoneDark = "#17324d",
    duotoneLight = "#f3dfb0",
  }: PaperGrainOptions = {}) {
    super("PaperGrainEffect", fragmentShader, {
      uniforms: new Map<string, Uniform>([
        ["uResolution", new Uniform(new Vector2(1, 1))],
        ["uSaturation", new Uniform(saturation)],
        ["uGrain", new Uniform(grain)],
        ["uBrightness", new Uniform(brightness)],
        ["uContrast", new Uniform(contrast)],
        ["uWarmth", new Uniform(warmth)],
        ["uVignette", new Uniform(vignette)],
        ["uHalftone", new Uniform(halftone)],
        ["uHalftoneScale", new Uniform(halftoneScale)],
        ["uDuotone", new Uniform(duotone)],
        ["uPosterize", new Uniform(posterize)],
        ["uComic", new Uniform(comic)],
        ["uDuotoneDark", new Uniform(new Color(duotoneDark))],
        ["uDuotoneLight", new Uniform(new Color(duotoneLight))],
      ]),
    });
  }

  setSize(width: number, height: number) {
    (this.uniforms.get("uResolution")!.value as Vector2).set(width, height);
  }
}

export default function PaperGrain(props: PaperGrainOptions) {
  const effect = useMemo(
    () => new PaperGrainEffectImpl(props),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      props.saturation,
      props.grain,
      props.brightness,
      props.contrast,
      props.warmth,
      props.vignette,
      props.halftone,
      props.halftoneScale,
      props.duotone,
      props.posterize,
      props.comic,
      props.duotoneDark,
      props.duotoneLight,
    ]
  );
  return <primitive object={effect} dispose={null} />;
}
