"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import {
  Box3,
  Color,
  Group,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Vector3,
} from "three";
import { useDrcGeometry } from "@/lib/messenger/r3f/hooks";
import { EMOJI_DURATION_MS } from "@/lib/messenger/multiplayer/protocol";
import type { EmojiEvent } from "@/lib/messenger/multiplayer/client";
import { play } from "@/lib/messenger/audio";

function EmojiMesh({ event, audible }: { event: EmojiEvent; audible: boolean }) {
  const geometry = useDrcGeometry(`emojis/${event.id + 1}.drc`);
  const outer = useRef<Group>(null);
  const { offset, scale } = useMemo(() => {
    geometry.computeBoundingBox();
    const box = geometry.boundingBox ?? new Box3();
    const size = box.getSize(new Vector3());
    const center = box.getCenter(new Vector3());
    return {
      offset: center.multiplyScalar(-1),
      scale: 0.82 / Math.max(size.x, size.y, size.z, 0.001),
    };
  }, [geometry]);
  const material = useMemo(
    () =>
      new MeshStandardMaterial({
        color: new Color("#f8f8f8"),
        roughness: 0.78,
        metalness: 0,
        emissive: new Color("#647a87"),
        emissiveIntensity: 0.12,
      }),
    []
  );
  const shadowMaterial = useMemo(
    () => new MeshBasicMaterial({ color: new Color("#647a87") }),
    []
  );

  useEffect(() => {
    if (!audible) return;
    const cue = (event.id % 3) + 1;
    void play(`character/emoji-starts${cue}.ogg`, 0.16);
    const timeout = window.setTimeout(() => {
      void play(`character/emoji-ends${cue}.ogg`, 0.12);
    }, 1_400);
    return () => window.clearTimeout(timeout);
  }, [audible, event.id, event.nonce]);

  useEffect(() => {
    return () => {
      material.dispose();
      shadowMaterial.dispose();
    };
  }, [material, shadowMaterial]);

  useFrame(() => {
    if (!outer.current) return;
    const elapsed = Date.now() - event.startedAt;
    const progress = Math.min(1, Math.max(0, elapsed / EMOJI_DURATION_MS));
    const intro = Math.min(1, progress / 0.12);
    const outro = Math.min(1, (1 - progress) / 0.18);
    const pop = Math.sin((Math.min(1, intro) * Math.PI) / 2) * Math.sin((Math.min(1, outro) * Math.PI) / 2);
    outer.current.visible = progress < 1;
    outer.current.position.y = 2.02 + progress * 0.28;
    outer.current.rotation.y = elapsed * 0.0015;
    outer.current.scale.setScalar(pop);
  });

  return (
    <group ref={outer}>
      <mesh
        geometry={geometry}
        material={shadowMaterial}
        position={[offset.x + 0.035 / scale, offset.y - 0.035 / scale, offset.z - 0.015 / scale]}
        scale={scale * 1.025}
      />
      <mesh geometry={geometry} material={material} position={offset} scale={scale} />
    </group>
  );
}

export default function PlayerEmoji({
  event,
  audible = true,
}: {
  event: EmojiEvent | null;
  audible?: boolean;
}) {
  if (!event) return null;
  return <EmojiMesh event={event} audible={audible} />;
}
