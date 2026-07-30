"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { BackSide, Color, Mesh, RepeatWrapping, ShaderMaterial } from "three";
import { useKtx2Texture } from "@/lib/messenger/r3f/hooks";
import { playerPosition } from "@/lib/messenger/r3f/interaction";

const vertexShader = /* glsl */ `
varying vec2 vSkyUv;
void main() {
  vSkyUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

// The reference uses one authored cloud-noise texture twice: a very slow drift
// multiplied by a stationary detail sample, then a hard painted-cloud cutoff.
const fragmentShader = /* glsl */ `
uniform sampler2D uCloudNoise;
uniform float uTime;
uniform vec3 uColor1;
uniform vec3 uColor2;
uniform vec3 uColor3;
varying vec2 vSkyUv;

void main() {
  vec2 stretchedUv = vSkyUv * vec2(1.0, 2.0);
  float drifting = texture2D(uCloudNoise, stretchedUv + vec2(uTime * 0.0005, 0.0)).r;
  float detail = texture2D(uCloudNoise, stretchedUv * 1.83 + vec2(0.173, 0.417)).r;
  float poleFade = smoothstep(0.035, 0.18, vSkyUv.y) * (1.0 - smoothstep(0.82, 0.965, vSkyUv.y));
  float cloud = step(0.27, drifting * detail * poleFade);
  vec3 cloudColor = mix(uColor3, uColor2, vSkyUv.y);
  gl_FragColor = vec4(mix(uColor1, cloudColor, cloud), 1.0);
  #include <colorspace_fragment>
}
`;

export default function WatercolourSky() {
  const mesh = useRef<Mesh>(null);
  const cloudNoise = useKtx2Texture("clouds_noise_512.ktx2");
  const material = useMemo(() => {
    cloudNoise.wrapS = cloudNoise.wrapT = RepeatWrapping;
    cloudNoise.needsUpdate = true;
    return new ShaderMaterial({
      vertexShader,
      fragmentShader,
      side: BackSide,
      depthWrite: false,
      uniforms: {
        uCloudNoise: { value: cloudNoise },
        uTime: { value: 0 },
        uColor1: { value: new Color("#75bdc3") },
        uColor2: { value: new Color("#9fe2e0") },
        uColor3: { value: new Color("#b9ebea") },
      },
    });
  }, [cloudNoise]);

  useFrame((state) => {
    material.uniforms.uTime.value = state.clock.elapsedTime;
    // 0.9 parallax follow keeps the 55-unit dome centred around the walkable
    // side of the small planet without making the clouds camera-locked.
    mesh.current?.position.copy(playerPosition).multiplyScalar(0.9);
  });

  useEffect(() => () => material.dispose(), [material]);

  return (
    <mesh ref={mesh} material={material} renderOrder={-100} frustumCulled={false}>
      <sphereGeometry args={[55, 32, 32]} />
    </mesh>
  );
}
