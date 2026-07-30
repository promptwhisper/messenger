"use client";

import { useEffect, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import { Color, DoubleSide, RepeatWrapping, ShaderMaterial } from "three";
import { useDrcGeometry, useKtx2Texture } from "@/lib/messenger/r3f/hooks";

const vertexShader = /* glsl */ `
varying vec2 vDecorationUv;
varying vec3 vDecorationViewPosition;
void main() {
  vDecorationUv = uv;
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  vDecorationViewPosition = -mvPosition.xyz;
  gl_Position = projectionMatrix * mvPosition;
}
`;

const fogFunctions = /* glsl */ `
uniform vec3 uFogNear;
uniform vec3 uFogFar;
vec3 applyMessengerFog(vec3 color, vec3 viewPosition) {
  float distanceToCamera = length(viewPosition);
  float fog = 1.0 - exp(-0.011 * 0.011 * distanceToCamera * distanceToCamera);
  vec3 fogColor = mix(uFogNear, uFogFar, smoothstep(0.0, 0.8, fog));
  return mix(color, fogColor, fog);
}
`;

const waterfallFragment = /* glsl */ `
uniform sampler2D uWaterNoise;
uniform sampler2D uBlurNoise;
uniform float uTime;
uniform vec3 uColor1;
uniform vec3 uColor2;
uniform vec3 uColor3;
${fogFunctions}
varying vec2 vDecorationUv;
varying vec3 vDecorationViewPosition;
void main() {
  vec2 uv = vDecorationUv;
  uv.y = uv.y * 0.08 + uTime * 0.04;
  float n1 = texture2D(uWaterNoise, vec2(uv.x * 0.5 + uTime * 0.01, uv.y)).r;
  float n2 = texture2D(uBlurNoise, vDecorationUv * vec2(0.5, 0.1) + vec2(0.0, uTime * 0.05)).g;
  float n3 = texture2D(uBlurNoise, vDecorationUv * vec2(0.5, 0.6) + vec2(0.0, uTime * 0.3)).r;
  float edge = 1.0 - abs(vDecorationUv.x - 0.5) * 2.0 - n3 * 0.2;
  if (edge < 0.05) discard;
  float streak = 1.0 - abs(n1 - 0.5) * 2.0;
  streak = step(0.5, streak * streak * streak);
  float shine = step(0.94, 1.0 - abs(vDecorationUv.y - 0.57) * 4.0 - n2 * 0.08);
  float shadow = 1.0 - smoothstep(0.12, 0.32, vDecorationUv.y - n2 * 0.25);
  vec3 color = mix(uColor1, uColor2, shadow);
  color = mix(color, uColor3, shine);
  color = mix(color, vec3(1.0), max(streak, 1.0 - smoothstep(0.05, 0.18, edge)));
  color = applyMessengerFog(color, vDecorationViewPosition);
  gl_FragColor = vec4(color, 1.0);
  #include <colorspace_fragment>
}
`;

const splashFragment = /* glsl */ `
uniform sampler2D uWaterNoise;
uniform float uTime;
${fogFunctions}
varying vec2 vDecorationUv;
varying vec3 vDecorationViewPosition;
void main() {
  vec2 uv = vDecorationUv * vec2(1.0, 5.0);
  uv.x *= uv.x;
  float mask = texture2D(uWaterNoise, uv + vec2(-uTime * 0.2, 0.0)).r;
  float rings = pow(sin(uv.x * 25.0 - uTime * 5.0) * 0.5 + 0.5, 20.0);
  float foam = mask * 0.65 + rings * 0.3 + pow(1.0 - vDecorationUv.x, 3.0);
  foam *= 1.0 - pow(smoothstep(0.2, 1.0, vDecorationUv.x), 3.0);
  if (foam < 0.5) discard;
  vec3 color = applyMessengerFog(vec3(1.0), vDecorationViewPosition);
  gl_FragColor = vec4(color, 1.0);
  #include <colorspace_fragment>
}
`;

const inletFragment = /* glsl */ `
uniform sampler2D uWaterNoise;
uniform sampler2D uTerrainNoise;
uniform float uTime;
uniform vec3 uColor1;
uniform vec3 uColor2;
${fogFunctions}
varying vec2 vDecorationUv;
varying vec3 vDecorationViewPosition;
void main() {
  float foam = texture2D(uWaterNoise, vDecorationUv * vec2(0.5, 2.0) + vec2(0.5, uTime * 0.1)).r;
  float foam2 = texture2D(uTerrainNoise, vDecorationUv * vec2(1.0, 4.0) + vec2(0.0, uTime * 0.09)).r;
  float edges = smoothstep(0.3, 0.0, vDecorationUv.x) + smoothstep(0.8, 1.0, vDecorationUv.x);
  float whiteFoam = step(0.7, max(foam, edges));
  float alpha = smoothstep(0.0, 0.05, vDecorationUv.y) - foam2 * 0.35;
  if (alpha < 0.05) discard;
  vec3 color = mix(uColor1, uColor2, step(0.4, smoothstep(0.425, 0.6, vDecorationUv.y) - foam2 * 0.1));
  color = mix(color, vec3(1.0), whiteFoam);
  color = applyMessengerFog(color, vDecorationViewPosition);
  gl_FragColor = vec4(color, 1.0);
  #include <colorspace_fragment>
}
`;

const beachFragment = /* glsl */ `
uniform sampler2D uWaterNoise;
uniform sampler2D uBlurNoise;
uniform float uTime;
uniform vec3 uWater1;
uniform vec3 uWater2;
uniform vec3 uWetSand;
${fogFunctions}
varying vec2 vDecorationUv;
varying vec3 vDecorationViewPosition;

vec4 waveAt(float t) {
  float phase = sin(t) * 0.5 + 0.5;
  float loop = fract(t / 6.2831853 + 15.707963);
  float noiseA = 1.0 - texture2D(uBlurNoise, vDecorationUv * vec2(1.5, 2.5) + vec2(phase, -phase * 0.1)).r;
  float noiseB = texture2D(uWaterNoise, vDecorationUv * vec2(2.0, 4.0) + vec2(phase, -t * 0.24)).r;
  float base = fract(vDecorationUv.x + phase + noiseA * 0.2 - 0.1);
  float front = smoothstep(0.9, 1.0, base);
  float body = base * noiseB * smoothstep(0.0, 0.5, base) * smoothstep(0.0, 0.3, vDecorationUv.x);
  float value = step(0.45, (front + body) * smoothstep(1.0, 0.3, loop));
  return vec4(mix(mix(uWater1, uWater2, step(0.7, noiseB)), vec3(1.0), value), base);
}

void main() {
  float t = uTime * 0.66;
  vec4 wave = max(waveAt(t), waveAt(t + 3.14159265));
  float wet = step(0.025, wave.a) * (1.0 - step(0.2, wave.a));
  if (wave.a + wet < 0.01) discard;
  vec3 color = mix(wave.rgb, uWetSand, wet);
  color = applyMessengerFog(color, vDecorationViewPosition);
  gl_FragColor = vec4(color, 1.0);
  #include <colorspace_fragment>
}
`;

export default function PresentDecorations({ includeBeach = true }: { includeBeach?: boolean } = {}) {
  const waterfall = useDrcGeometry("planets/present/waterfall_vfx.drc");
  const splash = useDrcGeometry("planets/present/waterfallsplash_vfx.drc");
  const inlet = useDrcGeometry("planets/present/waterfall_inlet_vfx.drc");
  const beach = useDrcGeometry("planets/present/beachfoam_vfx.drc");
  const waterNoise = useKtx2Texture("water-noises-highq.ktx2");
  const blurNoise = useKtx2Texture("noise-simplex-layered-blur-highq.ktx2");
  const terrainNoise = useKtx2Texture("noise-simplex-layered-pixellated-highq.ktx2");

  const materials = useMemo(() => {
    for (const texture of [waterNoise, blurNoise, terrainNoise]) {
      texture.wrapS = texture.wrapT = RepeatWrapping;
      texture.needsUpdate = true;
    }
    const common = {
      side: DoubleSide,
      depthWrite: true,
      uniforms: {
        uWaterNoise: { value: waterNoise },
        uBlurNoise: { value: blurNoise },
        uTerrainNoise: { value: terrainNoise },
        uTime: { value: 0 },
        uFogNear: { value: new Color("#93a2bf") },
        uFogFar: { value: new Color("#9ea7b8") },
      },
    };
    const make = (fragmentShader: string, colors: Record<string, string> = {}) =>
      new ShaderMaterial({
        ...common,
        vertexShader,
        fragmentShader,
        uniforms: {
          ...common.uniforms,
          ...Object.fromEntries(Object.entries(colors).map(([name, color]) => [name, { value: new Color(color) }])),
        },
      });
    return [
      make(waterfallFragment, { uColor1: "#739fb1", uColor2: "#376f74", uColor3: "#afe7eb" }),
      make(splashFragment),
      make(inletFragment, { uColor1: "#6695a7", uColor2: "#486c81" }),
      make(beachFragment, { uWater1: "#376b6f", uWater2: "#467d7f", uWetSand: "#bcb1a4" }),
    ];
  }, [blurNoise, terrainNoise, waterNoise]);

  useFrame((state) => {
    for (const material of materials) material.uniforms.uTime.value = state.clock.elapsedTime;
  });
  useEffect(() => () => materials.forEach((material) => material.dispose()), [materials]);

  return (
    <group name="present-authored-vfx">
      <mesh geometry={waterfall} material={materials[0]} frustumCulled />
      <mesh geometry={splash} material={materials[1]} frustumCulled />
      <mesh geometry={inlet} material={materials[2]} frustumCulled />
      {includeBeach && <mesh geometry={beach} material={materials[3]} frustumCulled />}
    </group>
  );
}
