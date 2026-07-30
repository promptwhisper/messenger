"use client";

import { useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { DirectionalLight, Object3D, Quaternion, Spherical, Vector3 } from "three";
import {
  playerCameraTarget,
  playerPosition,
  playerQuaternion,
  playerUp,
} from "@/lib/messenger/r3f/interaction";

const SHADOW_EXTENT = 24;
const SHADOW_FOLLOW_RATE = 10;
const SHADOW_RADIUS = 2.5;

export default function MessengerLighting({
  present,
  shadowMapSize,
}: {
  present: boolean;
  shadowMapSize: number;
}) {
  const camera = useThree((state) => state.camera);
  const light = useRef<DirectionalLight>(null);
  const target = useMemo(() => new Object3D(), []);
  const offset = useMemo(
    () => new Vector3().setFromSpherical(new Spherical(100, Math.PI * 0.2, -Math.PI * 0.25)),
    []
  );
  const transportedOffset = useMemo(() => new Vector3(), []);
  const previousUp = useMemo(() => new Vector3(0, 1, 0), []);
  const transport = useMemo(() => new Quaternion(), []);
  const viewForward = useMemo(() => new Vector3(), []);
  const desiredCenter = useMemo(() => new Vector3(), []);
  const shadowCenter = useMemo(() => new Vector3(), []);
  const snappedCenter = useMemo(() => new Vector3(), []);
  const lightDirection = useMemo(() => new Vector3(), []);
  const lightRight = useMemo(() => new Vector3(), []);
  const lightUp = useMemo(() => new Vector3(), []);
  const initialized = useRef(false);

  useFrame((_, delta) => {
    if (!present || !light.current) return;
    if (!initialized.current && playerPosition.lengthSq() < 1) return;

    // The reference light follows the camera focus, while its offset is
    // transported with the planet surface. It does not inherit the avatar's
    // instantaneous heading. Applying playerQuaternion on every frame made a
    // left/right input rotate the whole shadow map at once, which was most
    // obvious on large buildings.
    if (!initialized.current) {
      transportedOffset.copy(offset).applyQuaternion(playerQuaternion);
      previousUp.copy(playerUp);
      shadowCenter.copy(
        playerCameraTarget.lengthSq() > 0.001 ? playerCameraTarget : playerPosition
      );
      initialized.current = true;
    } else {
      transport.setFromUnitVectors(previousUp, playerUp);
      transportedOffset.applyQuaternion(transport).setLength(offset.length());
      previousUp.copy(playerUp);
    }

    camera.getWorldDirection(viewForward);
    desiredCenter
      .copy(playerCameraTarget.lengthSq() > 0.001 ? playerCameraTarget : playerPosition)
      .addScaledVector(viewForward, 6);
    shadowCenter.lerp(desiredCenter, 1 - Math.exp(-delta * SHADOW_FOLLOW_RATE));

    // Snap the moving orthographic projection to its texel grid. The shadow
    // window still follows the player continuously, but static edges no longer
    // crawl or flicker from sub-texel camera movement.
    lightDirection.copy(transportedOffset).normalize().negate();
    lightRight.crossVectors(lightDirection, playerUp).normalize();
    lightUp.crossVectors(lightRight, lightDirection).normalize();
    const texelWorldSize = (SHADOW_EXTENT * 2) / shadowMapSize;
    const rightShift =
      Math.round(shadowCenter.dot(lightRight) / texelWorldSize) * texelWorldSize -
      shadowCenter.dot(lightRight);
    const upShift =
      Math.round(shadowCenter.dot(lightUp) / texelWorldSize) * texelWorldSize -
      shadowCenter.dot(lightUp);
    snappedCenter
      .copy(shadowCenter)
      .addScaledVector(lightRight, rightShift)
      .addScaledVector(lightUp, upShift);

    target.position.copy(snappedCenter);
    light.current.position.copy(snappedCenter).add(transportedOffset);
    light.current.up.copy(playerUp);
    light.current.shadow.camera.up.copy(playerUp);
    target.updateMatrixWorld();
  });

  if (!present) {
    return (
      <directionalLight
        color="#ffffff"
        intensity={1}
        position={[100, 100, 0]}
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-camera-near={50}
        shadow-camera-far={180}
        shadow-camera-left={-100}
        shadow-camera-right={100}
        shadow-camera-top={100}
        shadow-camera-bottom={-100}
        shadow-camera-zoom={3.25}
        shadow-normalBias={0.3}
        shadow-bias={0.002}
      />
    );
  }

  return (
    <>
      <primitive object={target} />
      <directionalLight
        ref={light}
        target={target}
        color="#ffffff"
        intensity={3}
        position={[45, 80, 30]}
        castShadow
        shadow-mapSize-width={shadowMapSize}
        shadow-mapSize-height={shadowMapSize}
        shadow-camera-near={0.1}
        shadow-camera-far={175}
        shadow-camera-left={-24}
        shadow-camera-right={24}
        shadow-camera-top={24}
        shadow-camera-bottom={-24}
        shadow-normalBias={0.07}
        shadow-bias={-0.0001}
        shadow-radius={SHADOW_RADIUS}
      />
    </>
  );
}
