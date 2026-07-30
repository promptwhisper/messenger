"use client";

import { useEffect, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import { Color, RepeatWrapping, ShaderMaterial } from "three";
import { useDrcGeometry, useKtx2Texture } from "@/lib/messenger/r3f/hooks";

const vertexShader = /* glsl */ `
attribute vec3 centr;
attribute vec3 centr_tree;
attribute vec4 rand;
attribute float detail;
attribute float leavescolor;
uniform float uTime;
uniform float uScale;
varying vec2 vLeafUv;
varying vec4 vLeafRand;
varying float vLeafDetail;
varying float vLeafColor;
varying vec3 vLeafViewPosition;

void main() {
  vLeafUv = mix(uv, vec2(1.0 - uv.x, uv.y), step(0.5, rand.x));
  vLeafRand = rand;
  vLeafDetail = detail;
  vLeafColor = leavescolor;
  float scale = mix(0.5, 1.0, rand.w) * uScale;
  float shake = sin((centr.x + centr.z) * 2.0 - uTime * 0.75 + rand.y * 6.2831853) * 0.25 * mix(0.25, 1.0, rand.y);
  vec2 leaf = (uv * 2.0 - 1.0) * scale;
  float cs = cos(shake), sn = sin(shake);
  leaf = mat2(cs, -sn, sn, cs) * leaf;
  vec4 viewCenter = modelViewMatrix * vec4(centr, 1.0);
  viewCenter.xy += leaf;
  vLeafViewPosition = -viewCenter.xyz;
  gl_Position = projectionMatrix * viewCenter;
}
`;

const fragmentShader = /* glsl */ `
uniform sampler2D uLeaves;
uniform sampler2D uDetail;
uniform vec3 uColor1;
uniform vec3 uColor2;
uniform vec3 uColor3;
uniform vec3 uFogNear;
uniform vec3 uFogFar;
varying vec2 vLeafUv;
varying vec4 vLeafRand;
varying float vLeafDetail;
varying float vLeafColor;
varying vec3 vLeafViewPosition;

void main() {
  float shape;
  if (vLeafDetail > 0.5) {
    float offset = floor(mod((vLeafRand.z * 4.35 + vLeafRand.w * 43.5) * 5.0, 5.0));
    vec2 detailUv = vec2(vLeafUv.x / 5.0 + offset / 5.0, vLeafUv.y);
    shape = texture2D(uDetail, detailUv).r;
  } else {
    shape = texture2D(uLeaves, vLeafUv).r;
  }
  if (shape > 0.9) discard;
  vec3 color = mix(uColor1, uColor2, clamp(vLeafColor, 0.0, 1.0));
  color = mix(color, uColor3, clamp(vLeafColor - 1.0, 0.0, 1.0));
  color *= mix(0.82, 1.04, vLeafRand.x);
  float distanceToCamera = length(vLeafViewPosition);
  float fog = 1.0 - exp(-0.011 * 0.011 * distanceToCamera * distanceToCamera);
  vec3 fogColor = mix(uFogNear, uFogFar, smoothstep(0.0, 0.8, fog));
  gl_FragColor = vec4(mix(color, fogColor, fog), 1.0);
  #include <colorspace_fragment>
}
`;

export default function TreeLeaves() {
  const g0 = useDrcGeometry("planets/present/tree-leaves_0.drc");
  const g1 = useDrcGeometry("planets/present/tree-leaves_1.drc");
  const g2 = useDrcGeometry("planets/present/tree-leaves_2.drc");
  const g3 = useDrcGeometry("planets/present/tree-leaves_3.drc");
  const g4 = useDrcGeometry("planets/present/tree-leaves_4.drc");
  const geometries = useMemo(() => [g0, g1, g2, g3, g4], [g0, g1, g2, g3, g4]);
  const leaves = useKtx2Texture("tree-leaves.ktx2");
  const detail = useKtx2Texture("tree-leaves-detail.ktx2");
  const material = useMemo(() => {
    leaves.wrapS = leaves.wrapT = RepeatWrapping;
    detail.wrapS = detail.wrapT = RepeatWrapping;
    leaves.needsUpdate = detail.needsUpdate = true;
    return new ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        uTime: { value: 0 },
        uScale: { value: 0.28 },
        uLeaves: { value: leaves },
        uDetail: { value: detail },
        uColor1: { value: new Color("#5b9f7b") },
        uColor2: { value: new Color("#649c75") },
        uColor3: { value: new Color("#4e8c6d") },
        uFogNear: { value: new Color("#93a2bf") },
        uFogFar: { value: new Color("#9ea7b8") },
      },
    });
  }, [detail, leaves]);

  useFrame((state) => {
    material.uniforms.uTime.value = state.clock.elapsedTime;
  });
  useEffect(() => () => material.dispose(), [material]);

  return (
    <group name="present-tree-leaves">
      {geometries.map((geometry, index) => (
        <mesh
          key={index}
          geometry={geometry}
          material={material}
          frustumCulled={false}
          receiveShadow
        />
      ))}
    </group>
  );
}
