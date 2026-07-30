"use client";

import { useEffect, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import {
  Color,
  DoubleSide,
  RepeatWrapping,
  ShaderMaterial,
  Vector2,
} from "three";
import { useDrcGeometry, useKtx2Texture } from "@/lib/messenger/r3f/hooks";

const commonVertex = /* glsl */ `
attribute float randomm;
attribute vec3 nextpos;
attribute vec3 prevpos;
attribute vec3 curvepos;
uniform vec2 uResolution;
uniform float uSmoke;
attribute float thickness;
attribute vec2 uv2;
varying vec2 vCurveUv;
varying vec2 vCurveUv2;
varying float vCurveRandom;
varying vec3 vCurveViewPosition;

void main() {
  vCurveUv = uv;
  vCurveUv2 = uv2;
  vCurveRandom = randomm;
  vec4 worldPos = modelMatrix * vec4(curvepos, 1.0);
  vec4 worldPrev = modelMatrix * vec4(prevpos, 1.0);
  vec4 worldNext = modelMatrix * vec4(nextpos, 1.0);
  vec4 viewPos = viewMatrix * worldPos;
  vCurveViewPosition = -viewPos.xyz;
  mat4 pv = projectionMatrix * viewMatrix;
  vec4 finalPos = pv * worldPos;
  vec4 finalPrev = pv * worldPrev;
  vec4 finalNext = pv * worldNext;
  float aspect = uResolution.x / max(1.0, uResolution.y);
  vec2 aspectVec = vec2(aspect, 1.0);
  vec2 currentScreen = finalPos.xy / finalPos.w * aspectVec;
  vec2 previousScreen = finalPrev.xy / finalPrev.w * aspectVec;
  vec2 nextScreen = finalNext.xy / finalNext.w * aspectVec;
  vec2 dirA = normalize(currentScreen - previousScreen);
  vec2 dirB = normalize(nextScreen - currentScreen);
  vec2 tangent = normalize(dirA + dirB);
  vec2 lineNormal = normalize(vec2(-tangent.y, tangent.x));
  if (uv.x > 0.5) lineNormal = -lineNormal;
  lineNormal.x /= aspect;
  float cableWidth = viewPos.z * 0.0009 * aspect;
  float smokeWidth = 0.35 * max(thickness, 0.01) * mix(0.25, 3.0, uv2.y);
  lineNormal *= mix(cableWidth, smokeWidth, uSmoke);
  gl_Position = finalPos + vec4(lineNormal, 0.0, 0.0);
}
`;

const fogChunk = /* glsl */ `
uniform vec3 uFogNear;
uniform vec3 uFogFar;
vec3 curveFog(vec3 color) {
  float distanceToCamera = length(vCurveViewPosition);
  float fog = 1.0 - exp(-0.011 * 0.011 * distanceToCamera * distanceToCamera);
  vec3 fogColor = mix(uFogNear, uFogFar, smoothstep(0.0, 0.8, fog));
  return mix(color, fogColor, fog);
}
`;

const cableFragment = /* glsl */ `
uniform sampler2D uNoise;
uniform vec3 uColor;
varying vec2 vCurveUv;
varying vec2 vCurveUv2;
varying float vCurveRandom;
varying vec3 vCurveViewPosition;
${fogChunk}
void main() {
  float n = texture2D(uNoise, vec2(0.5 + vCurveRandom, vCurveUv.y * 0.2)).r;
  if (n < 0.25) discard;
  gl_FragColor = vec4(curveFog(uColor), 1.0);
  #include <colorspace_fragment>
}
`;

const smokeFragment = /* glsl */ `
uniform sampler2D uNoise;
uniform sampler2D uWaterNoise;
uniform float uTime;
varying vec2 vCurveUv;
varying vec2 vCurveUv2;
varying float vCurveRandom;
varying vec3 vCurveViewPosition;
${fogChunk}
void main() {
  float n1 = texture2D(uNoise, vCurveUv2 * vec2(0.25, 1.0) - vec2(vCurveRandom, uTime * 0.05)).r;
  float n2 = 1.0 - texture2D(uWaterNoise, vCurveUv2 * vec2(0.7, 1.5) - vec2(vCurveRandom, uTime * 0.15)).r;
  n2 = pow(max(0.0, n2 - n1 * 0.4), 2.0);
  float gradient = 1.0 - abs(vCurveUv.x - 0.5) * 2.0;
  float mask = gradient * n2;
  mask -= (sin(vCurveUv.y * 2.0 - uTime + vCurveRandom * 10.0) * 0.5 + 0.5) * 0.15;
  mask *= smoothstep(0.0, 0.15, vCurveUv2.y) * smoothstep(1.0, 0.5, vCurveUv2.y);
  if (mask < 0.05) discard;
  gl_FragColor = vec4(curveFog(vec3(1.0)), 0.35);
  #include <colorspace_fragment>
}
`;

export default function CurveDecorations({ includeSmoke = true }: { includeSmoke?: boolean } = {}) {
  const cable1 = useDrcGeometry("planets/present/cables-1.drc");
  const cable2 = useDrcGeometry("planets/present/cables-2.drc");
  const smoke = useDrcGeometry("planets/present/smoke-1.drc");
  const cloudNoise = useKtx2Texture("clouds_noise_512.ktx2");
  const waterNoise = useKtx2Texture("water-noises-highq.ktx2");
  const materials = useMemo(() => {
    cloudNoise.wrapS = cloudNoise.wrapT = RepeatWrapping;
    waterNoise.wrapS = waterNoise.wrapT = RepeatWrapping;
    cloudNoise.needsUpdate = waterNoise.needsUpdate = true;
    const uniforms = {
      uResolution: { value: new Vector2(1, 1) },
      uSmoke: { value: 0 },
      uTime: { value: 0 },
      uNoise: { value: cloudNoise },
      uWaterNoise: { value: waterNoise },
      uColor: { value: new Color("#565c5f") },
      uFogNear: { value: new Color("#93a2bf") },
      uFogFar: { value: new Color("#9ea7b8") },
    };
    const cable = new ShaderMaterial({
      vertexShader: commonVertex,
      fragmentShader: cableFragment,
      side: DoubleSide,
      uniforms,
    });
    const smokeMaterial = new ShaderMaterial({
      vertexShader: commonVertex,
      fragmentShader: smokeFragment,
      side: DoubleSide,
      transparent: true,
      depthWrite: false,
      uniforms: {
        ...uniforms,
        uResolution: { value: new Vector2(1, 1) },
        uSmoke: { value: 1 },
        uTime: { value: 0 },
      },
    });
    return [cable, smokeMaterial];
  }, [cloudNoise, waterNoise]);

  useFrame((state) => {
    const width = state.size.width * state.viewport.dpr;
    const height = state.size.height * state.viewport.dpr;
    for (const material of materials) material.uniforms.uResolution.value.set(width, height);
    materials[1].uniforms.uTime.value = state.clock.elapsedTime;
  });
  useEffect(() => () => materials.forEach((material) => material.dispose()), [materials]);

  return (
    <group name="present-curves">
      <mesh geometry={cable1} material={materials[0]} frustumCulled={false} />
      <mesh geometry={cable2} material={materials[0]} frustumCulled={false} />
      {includeSmoke && (
        <mesh geometry={smoke} material={materials[1]} frustumCulled={false} renderOrder={2} />
      )}
    </group>
  );
}
