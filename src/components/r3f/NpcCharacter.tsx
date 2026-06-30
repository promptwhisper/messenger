"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { Html, useTexture } from "@react-three/drei";
import {
  Group,
  Bone,
  SkinnedMesh,
  MeshToonMaterial,
  Vector3,
  Matrix4,
  CatmullRomCurve3,
  AnimationMixer,
  LoopRepeat,
  RepeatWrapping,
  ClampToEdgeWrapping,
  LinearFilter,
  NearestFilter,
  DataTexture,
  RedFormat,
  SRGBColorSpace,
  type Texture,
  type WebGLProgramParametersWithUniforms,
} from "three";
import { useDrcGeometry, useKtx2Texture } from "@/lib/messenger/r3f/hooks";
import { buildSkeleton, buildClip } from "@/lib/messenger/r3f/skeleton";
import { playerPosition, INTERACT_RANGE } from "@/lib/messenger/r3f/interaction";
import { play } from "@/lib/messenger/audio";
import { publicPath } from "@/lib/messenger/assets";

// Flat 3-step toon ramp, matching the avatar's hand-drawn shading.
const TOON_RAMP = (() => {
  const ramp = new Uint8Array([150, 205, 255]);
  const tex = new DataTexture(ramp, ramp.length, 1, RedFormat);
  tex.minFilter = NearestFilter;
  tex.magFilter = NearestFilter;
  tex.needsUpdate = true;
  return tex;
})();

function stableProgress(id: string): number {
  let hash = 0;
  for (const character of id) {
    hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  }
  return (hash % 1000) / 1000;
}

/**
 * NPC body material. The original colours every character by sampling a tiny
 * 16x16 colour atlas (atlas.png) with the mesh UVs, so we do the same here
 * (NearestFilter, no mipmaps) instead of inventing a stand-in palette. The same
 * eye-sprite overlay the avatar uses is layered on top for the humanoid heads,
 * whose eye UVs live at uv.y > 1 (animals have no such UVs, so it's a no-op).
 */
function makeNpcFaceMaterial(eyeTex: Texture, atlasTex: Texture): MeshToonMaterial {
  atlasTex.wrapS = ClampToEdgeWrapping;
  atlasTex.wrapT = ClampToEdgeWrapping;
  atlasTex.minFilter = NearestFilter;
  atlasTex.magFilter = NearestFilter;
  atlasTex.generateMipmaps = false;
  atlasTex.colorSpace = SRGBColorSpace;
  atlasTex.needsUpdate = true;

  eyeTex.wrapS = RepeatWrapping;
  eyeTex.wrapT = RepeatWrapping;
  eyeTex.minFilter = LinearFilter;
  eyeTex.magFilter = LinearFilter;
  eyeTex.generateMipmaps = false;
  eyeTex.needsUpdate = true;

  const mat = new MeshToonMaterial({ map: atlasTex, gradientMap: TOON_RAMP });
  mat.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms) => {
    shader.uniforms.tEye = { value: eyeTex };
    shader.uniforms.uTime = { value: 0 };
    mat.userData.shader = shader;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec2 vFaceUv;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvFaceUv = uv;");
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        "#include <common>\nuniform sampler2D tEye;\nuniform float uTime;\nvarying vec2 vFaceUv;"
      )
      .replace(
        "#include <color_fragment>",
        [
          "#include <color_fragment>",
          "if (vFaceUv.y > 1.0) {", // eyes live above the [0,1] uv block
          "  float bt = fract(uTime * 0.07 + 0.37);",
          "  float frame = bt > 0.97 ? (bt > 0.985 ? 2.0 : 1.0) : 0.0;",
          "  vec2 euv = vec2(fract(vFaceUv.x) * 0.25 + frame * 0.25, fract(vFaceUv.y));",
          "  float e = smoothstep(0.42, 0.58, texture2D(tEye, euv).r);",
          "  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.05, 0.04, 0.04), e);",
          "}",
        ].join("\n")
      );
  };
  return mat;
}

/**
 * A single skinned NPC, reusing the avatar rig pipeline. It is placed at its
 * exact authored world position with its authored euler rotation (matching the
 * original `mesh.position/rotation.fromArray(...)`). NPCs that define a `curve`
 * follow that path on the planet surface, orienting along the tangent and
 * playing their walk clip; the rest stand on their idle loop.
 */
export default function NpcCharacter({
  id,
  model,
  bones,
  clip,
  pos,
  rot,
  curve,
  center,
  voice,
}: {
  id: string;
  model: string;
  bones: string;
  clip: string;
  pos: Vector3;
  rot: Vector3;
  curve?: string;
  center: Vector3;
  voice: string;
}) {
  const meshGeometry = useDrcGeometry(model);
  const bonesGeometry = useDrcGeometry(bones);
  const clipGeometry = useDrcGeometry(clip);
  // Always call the hook (no conditional hooks); when there's no curve we just
  // load the already-cached body geometry and ignore it.
  const curveGeometry = useDrcGeometry(curve ?? model);
  const eyeTex = useKtx2Texture("eye-highq.ktx2");
  const atlasTex = useTexture(publicPath("/assets/images/atlas.png"));

  const rig = useMemo(() => {
    const { bones, roots, skeleton } = buildSkeleton(bonesGeometry);
    const group = new Group();
    const root = roots[0] ?? new Bone();

    const material = makeNpcFaceMaterial(eyeTex, atlasTex);
    const skinned = new SkinnedMesh(meshGeometry, material);
    skinned.frustumCulled = false;
    skinned.add(root);
    skinned.bind(skeleton);
    skinned.normalizeSkinWeights();
    group.add(skinned);

    const mixer = new AnimationMixer(group);
    const action = mixer.clipAction(buildClip("clip", clipGeometry, bones.length))!;
    action.loop = LoopRepeat;
    action.play();
    return { group, mixer, material, action };
  }, [bonesGeometry, meshGeometry, clipGeometry, eyeTex, atlasTex]);

  // Release this NPC's GPU resources on unmount. Body/clip geometries and the
  // shared atlas/eye textures are cached by the loaders, so we only dispose the
  // per-instance material and detach the mixer.
  useEffect(() => {
    const { mixer, material } = rig;
    return () => {
      mixer.stopAllAction();
      material.dispose();
    };
  }, [rig]);

  // Build a Catmull-Rom path from the curve point cloud (authored on-surface).
  const path = useMemo(() => {
    if (!curve) return null;
    const attrs = curveGeometry.attributes ?? {};
    // Draco names the curve's point attribute "position_1" (not "position").
    const attr = attrs.position ?? attrs.position_1;
    if (!attr) return null;
    const pts: Vector3[] = [];
    for (let i = 0; i < attr.count; i++) {
      pts.push(new Vector3(attr.getX(i), attr.getY(i), attr.getZ(i)));
    }
    if (pts.length < 2) return null;
    const c = new CatmullRomCurve3(pts, true, "centripetal");
    return { curve: c, length: c.getLength() };
  }, [curve, curveGeometry]);

  const outer = useRef<Group>(null);
  const progress = useRef(stableProgress(id));
  const basis = useMemo(() => new Matrix4(), []);
  const tmpPoint = useMemo(() => new Vector3(), []);
  const tmpTan = useMemo(() => new Vector3(), []);
  const tmpUp = useMemo(() => new Vector3(), []);
  const tmpRight = useMemo(() => new Vector3(), []);

  const [nearby, setNearby] = useState(false);
  const nearbyRef = useRef(false);

  // Static placement: exact authored world transform.
  useEffect(() => {
    if (!outer.current || path) return;
    outer.current.position.copy(pos);
    outer.current.rotation.set(rot.x, rot.y, rot.z);
  }, [pos, rot, path]);

  useFrame((state, dt) => {
    // Self-healing: if the loop was stopped out from under us (a StrictMode
    // remount runs the dispose cleanup, but the memoised rig — and its
    // play() — is not recreated), restart it so the NPC never freezes in its
    // bind (T-)pose.
    if (!rig.action.isRunning()) rig.action.reset().play();
    rig.mixer.update(dt);

    const faceShader = rig.material.userData.shader as
      | WebGLProgramParametersWithUniforms
      | undefined;
    if (faceShader) {
      faceShader.uniforms.uTime.value = state.clock.elapsedTime;
    }

    if (!outer.current) return;

    // walk the curve at ~1 m/s, orienting along the tangent on the surface
    if (path) {
      progress.current = (progress.current + (dt * 1.0) / path.length) % 1;
      const t = progress.current;
      path.curve.getPointAt(t, tmpPoint);
      path.curve.getTangentAt(t, tmpTan);
      tmpUp.copy(tmpPoint).sub(center).normalize();
      tmpTan.addScaledVector(tmpUp, -tmpTan.dot(tmpUp)).normalize();
      tmpRight.copy(tmpUp).cross(tmpTan).normalize();
      basis.makeBasis(tmpRight, tmpUp, tmpTan);
      outer.current.position.copy(tmpPoint);
      outer.current.quaternion.setFromRotationMatrix(basis);
    }

    // proximity → show the NPC's request bubble and play a one-shot voice line
    const near = outer.current.position.distanceTo(playerPosition) < INTERACT_RANGE;
    if (near !== nearbyRef.current) {
      nearbyRef.current = near;
      setNearby(near);
      if (near) {
        void play("character/bubble-starts.ogg", 0.4);
        void play(voice, 0.6);
      }
    }
  });

  return (
    <group ref={outer}>
      <primitive object={rig.group} />
      {nearby && (
        <Html position={[0, 2, 0]} center distanceFactor={9} zIndexRange={[40, 0]}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            className="npc-marker"
            src={publicPath("/images/icons/npc-active.png")}
            alt=""
          />
        </Html>
      )}
    </group>
  );
}
