"use client";

import { useEffect, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import {
  Color,
  RepeatWrapping,
  ShaderMaterial,
  type BufferGeometry,
} from "three";
import { useKtx2Texture } from "@/lib/messenger/r3f/hooks";

const vertexShader = /* glsl */ `
varying vec2 vWaterUv;
varying vec3 vWaterNormal;
varying vec3 vWaterViewPosition;
void main() {
  vWaterUv = uv;
  vWaterNormal = normalize(normalMatrix * normal);
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  vWaterViewPosition = -mvPosition.xyz;
  gl_Position = projectionMatrix * mvPosition;
}
`;

const fragmentShader = /* glsl */ `
uniform sampler2D uNoise;
uniform float uTime;
uniform vec3 uWaterA;
uniform vec3 uWaterB;
uniform vec3 uWaveA;
uniform vec3 uWaveB;
uniform vec3 uFogNear;
uniform vec3 uFogFar;
varying vec2 vWaterUv;
varying vec3 vWaterNormal;
varying vec3 vWaterViewPosition;

void main() {
  vec2 driftA = vec2(uTime * 0.006, -uTime * 0.003);
  vec2 driftB = vec2(-uTime * 0.004, uTime * 0.007);
  float n1 = texture2D(uNoise, vWaterUv * 3.4 + driftA).r;
  float n2 = texture2D(uNoise, vWaterUv.yx * 6.8 + driftB).g;
  float broad = smoothstep(0.24, 0.78, n1 * 0.7 + n2 * 0.3);
  vec3 color = mix(uWaterB, uWaterA, broad);
  float ribbon = sin((vWaterUv.x + vWaterUv.y) * 96.0 + uTime * 1.15 + n1 * 8.0);
  float foam = smoothstep(0.72, 0.98, ribbon) * smoothstep(0.42, 0.8, n2);
  color = mix(color, mix(uWaveA, uWaveB, n1), foam * 0.58);
  float fresnel = pow(1.0 - abs(dot(normalize(vWaterNormal), normalize(vWaterViewPosition))), 3.0);
  color = mix(color, uWaveB, fresnel * 0.18);

  float distanceToCamera = length(vWaterViewPosition);
  float fogFactor = 1.0 - exp(-0.011 * 0.011 * distanceToCamera * distanceToCamera);
  vec3 fogColor = mix(uFogNear, uFogFar, smoothstep(0.0, 0.8, fogFactor));
  gl_FragColor = vec4(mix(color, fogColor, fogFactor), 1.0);
  #include <colorspace_fragment>
}
`;

export default function PresentWater({ geometry }: { geometry: BufferGeometry }) {
  const noise = useKtx2Texture("water-noises-highq.ktx2");
  const material = useMemo(() => {
    noise.wrapS = noise.wrapT = RepeatWrapping;
    noise.needsUpdate = true;
    return new ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        uNoise: { value: noise },
        uTime: { value: 0 },
        uWaterA: { value: new Color("#4c868c") },
        uWaterB: { value: new Color("#437a7f") },
        uWaveA: { value: new Color("#366a6f") },
        uWaveB: { value: new Color("#6facb2") },
        uFogNear: { value: new Color("#93a2bf") },
        uFogFar: { value: new Color("#9ea7b8") },
      },
    });
  }, [noise]);

  useFrame((state) => {
    material.uniforms.uTime.value = state.clock.elapsedTime;
  });
  useEffect(() => () => material.dispose(), [material]);

  return <mesh geometry={geometry} material={material} renderOrder={1} receiveShadow />;
}
