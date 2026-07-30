"use client";

import { Suspense, useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import {
  AnimationClip,
  AnimationMixer,
  Bone,
  Group,
  LoopRepeat,
  SkinnedMesh,
  type AnimationAction,
  type WebGLProgramParametersWithUniforms,
} from "three";
import { useTexture } from "@react-three/drei";
import { publicPath } from "@/lib/messenger/assets";
import { useDrcGeometry, useKtx2Texture } from "@/lib/messenger/r3f/hooks";
import { buildClip, buildSkeleton } from "@/lib/messenger/r3f/skeleton";
import { playerPosition } from "@/lib/messenger/r3f/interaction";
import { useMultiplayerSnapshot } from "@/lib/messenger/multiplayer/hooks";
import type { RemotePlayerPresence } from "@/lib/messenger/multiplayer/client";
import {
  AccessorySlot,
  ANIMATION_FILES,
  makeFaceMaterial,
  makeOutlineMesh,
  type AnimName,
} from "./Avatar";
import PlayerEmoji from "./PlayerEmoji";

// The reference applies a 0.4 positional/quaternion lerp per 60 Hz frame.
// Convert that coefficient to an exponential rate so the same feel survives
// variable refresh rates without becoming slower on 120 Hz displays.
const REMOTE_LERP_RATE = -Math.log(1 - 0.4) * 60;

function RemoteAvatar({ presence }: { presence: RemotePlayerPresence }) {
  const bonesGeometry = useDrcGeometry("avatar/avatar-bones.drc");
  const bodyGeometry = useDrcGeometry("avatar/accessories/base.drc");
  const eyeTex = useKtx2Texture("mainchar-eye-highq.ktx2");
  const atlasTex = useTexture(publicPath("/assets/images/atlas.png"));
  const idleGeometry = useDrcGeometry(ANIMATION_FILES.idle);
  const runGeometry = useDrcGeometry(ANIMATION_FILES.run);
  const sprintGeometry = useDrcGeometry(ANIMATION_FILES.sprint);
  const airGeometry = useDrcGeometry(ANIMATION_FILES.air);

  const rig = useMemo(() => {
    const { bones, roots, skeleton } = buildSkeleton(bonesGeometry);
    const boneCount = bones.length;
    const group = new Group();
    const root = roots[0] ?? new Bone();
    const bodyMaterial = makeFaceMaterial(eyeTex, atlasTex);
    const body = new SkinnedMesh(bodyGeometry, bodyMaterial);
    body.frustumCulled = false;
    body.castShadow = true;
    body.receiveShadow = true;
    body.add(root);
    body.bind(skeleton);
    body.normalizeSkinWeights();
    group.add(body);
    group.add(makeOutlineMesh(bodyGeometry, skeleton));

    const mixer = new AnimationMixer(group);
    const clips: Record<AnimName, AnimationClip> = {
      idle: buildClip("idle", idleGeometry, boneCount),
      run: buildClip("run", runGeometry, boneCount),
      sprint: buildClip("sprint", sprintGeometry, boneCount),
      air: buildClip("air", airGeometry, boneCount),
    };
    const actions = Object.fromEntries(
      (Object.keys(clips) as AnimName[]).map((name) => {
        const action = mixer.clipAction(clips[name]);
        action.loop = LoopRepeat;
        return [name, action];
      })
    ) as Record<AnimName, AnimationAction>;
    actions.idle.play();
    return { group, mixer, actions, skeleton, bodyMaterial };
  }, [
    atlasTex,
    bodyGeometry,
    bonesGeometry,
    eyeTex,
    idleGeometry,
    runGeometry,
    sprintGeometry,
    airGeometry,
  ]);

  const outer = useRef<Group>(null);
  const current = useRef<AnimName>("idle");
  const scale = useRef(0);

  useEffect(() => {
    if (!outer.current) return;
    outer.current.position.copy(presence.targetPosition);
    outer.current.quaternion.copy(presence.targetQuaternion);
    outer.current.scale.setScalar(0);
  }, [presence]);

  useEffect(() => {
    const { mixer, bodyMaterial } = rig;
    return () => {
      mixer.stopAllAction();
      bodyMaterial.dispose();
    };
  }, [rig]);

  useFrame((state, dtRaw) => {
    if (!outer.current) return;
    const dt = Math.min(dtRaw, 0.05);
    const positionDelta = outer.current.position.distanceTo(presence.targetPosition);
    if (positionDelta > 10) outer.current.position.copy(presence.targetPosition);
    else {
      outer.current.position.lerp(
        presence.targetPosition,
        1 - Math.exp(-dt * REMOTE_LERP_RATE)
      );
    }
    outer.current.quaternion.slerp(
      presence.targetQuaternion,
      1 - Math.exp(-dt * REMOTE_LERP_RATE)
    );

    const targetScale = presence.leaving ? 0 : 1;
    scale.current += (targetScale - scale.current) * Math.min(1, dt / 0.15);
    outer.current.scale.setScalar(scale.current);

    const nextName = presence.animation;
    const next = rig.actions[nextName];
    if (current.current !== nextName || !next.isRunning()) {
      const previous = rig.actions[current.current];
      if (previous !== next) previous.fadeOut(0.18);
      next.reset().fadeIn(0.18).play();
      current.current = nextName;
    }
    rig.mixer.update(dt);

    const faceShader = rig.bodyMaterial.userData.shader as
      | WebGLProgramParametersWithUniforms
      | undefined;
    if (faceShader) faceShader.uniforms.uTime.value = state.clock.elapsedTime;
  });

  const audible = presence.targetPosition.distanceTo(playerPosition) <= 3;
  return (
    <group ref={outer}>
      <primitive object={rig.group} />
      <Suspense fallback={null}>
        <AccessorySlot
          path={`avatar/accessories/hair${presence.outfit.hair}.drc`}
          atlasTex={atlasTex}
          skeleton={rig.skeleton}
          parent={rig.group}
        />
      </Suspense>
      <Suspense fallback={null}>
        <AccessorySlot
          path={`avatar/accessories/top${presence.outfit.top}.drc`}
          atlasTex={atlasTex}
          skeleton={rig.skeleton}
          parent={rig.group}
        />
      </Suspense>
      <Suspense fallback={null}>
        <AccessorySlot
          path={`avatar/accessories/bottom${presence.outfit.bottom}.drc`}
          atlasTex={atlasTex}
          skeleton={rig.skeleton}
          parent={rig.group}
        />
      </Suspense>
      <Suspense fallback={null}>
        <AccessorySlot
          path={`avatar/accessories/shoes${presence.outfit.shoes}.drc`}
          atlasTex={atlasTex}
          skeleton={rig.skeleton}
          parent={rig.group}
        />
      </Suspense>
      <Suspense fallback={null}>
        <PlayerEmoji
          key={presence.emoji?.nonce ?? `${presence.id}-emoji-empty`}
          event={presence.emoji}
          audible={audible}
        />
      </Suspense>
    </group>
  );
}

export default function RemotePlayers() {
  const { peers } = useMultiplayerSnapshot();
  return peers.map((presence) => (
    <Suspense key={presence.id} fallback={null}>
      <RemoteAvatar presence={presence} />
    </Suspense>
  ));
}
