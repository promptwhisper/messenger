"use client";

import { useMemo } from "react";
import { BackSide, ShaderMaterial } from "three";

/**
 * Large inward-facing sky dome with a teal vertical gradient + value-noise
 * "watercolour" streaks, approximating the original's painted sky. Drawn first,
 * no depth write, and (being a ShaderMaterial) unaffected by scene fog.
 */
const vertexShader = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const fragmentShader = /* glsl */ `
varying vec3 vDir;

float hash(vec3 p) { return fract(sin(dot(p, vec3(12.989, 78.233, 45.164))) * 43758.5453); }
float noise(vec3 p) {
  vec3 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x), mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
    mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x), mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y),
    f.z
  );
}

void main() {
  float h = clamp(vDir.y * 0.5 + 0.5, 0.0, 1.0);
  vec3 top = vec3(0.38, 0.70, 0.72);
  vec3 horizon = vec3(0.64, 0.86, 0.80);
  vec3 col = mix(horizon, top, smoothstep(0.0, 0.75, h));
  // painted teal cloud blobs (hand-drawn look)
  float cloud = noise(vDir * 3.5) * 0.6 + noise(vDir * 8.0) * 0.3 + noise(vDir * 18.0) * 0.1;
  cloud = smoothstep(0.46, 0.66, cloud) * smoothstep(0.0, 0.25, h);
  vec3 cloudCol = vec3(0.28, 0.62, 0.65);
  col = mix(col, cloudCol, cloud * 0.62);
  gl_FragColor = vec4(col, 1.0);
}
`;

export default function WatercolourSky() {
  const material = useMemo(
    () => new ShaderMaterial({ vertexShader, fragmentShader, side: BackSide, depthWrite: false }),
    []
  );
  return (
    <mesh material={material} renderOrder={-1} frustumCulled={false}>
      <sphereGeometry args={[900, 32, 16]} />
    </mesh>
  );
}
