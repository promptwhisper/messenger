/**
 * Build a Three.js Skeleton + AnimationClips from abeto's avatar `.drc` data.
 *
 * - Bones file (`avatar-bones.drc`, type:1): N points, each a bone's BIND-pose
 *   local TRS (`position`, `quaternion`, `scale`) plus `hierarchy` where the
 *   parent index = hierarchy[i] - 1 (-1 => root).
 * - Animation files (`avatar-idle.drc`, …, type:1): frames*N points laid out
 *   FRAME-MAJOR (idx = frame * boneCount + bone), with userData {fps, frames}.
 */
import {
  type BufferGeometry,
  Bone,
  Skeleton,
  AnimationClip,
  VectorKeyframeTrack,
  QuaternionKeyframeTrack,
} from "three";

export interface BuiltSkeleton {
  bones: Bone[];
  roots: Bone[];
  skeleton: Skeleton;
}

export function buildSkeleton(bonesGeometry: BufferGeometry): BuiltSkeleton {
  const position = bonesGeometry.getAttribute("position");
  const quaternion = bonesGeometry.getAttribute("quaternion");
  const scale = bonesGeometry.getAttribute("scale");
  const hierarchy = bonesGeometry.getAttribute("hierarchy");
  const count = position.count;

  const bones: Bone[] = [];
  for (let i = 0; i < count; i++) {
    const bone = new Bone();
    bone.name = `bone_${i}`;
    bone.position.set(position.getX(i), position.getY(i), position.getZ(i));
    bone.quaternion.set(
      quaternion.getX(i),
      quaternion.getY(i),
      quaternion.getZ(i),
      quaternion.getW(i)
    );
    bone.scale.set(scale.getX(i), scale.getY(i), scale.getZ(i));
    bones.push(bone);
  }

  const roots: Bone[] = [];
  for (let i = 0; i < count; i++) {
    const parent = hierarchy.getX(i) - 1;
    if (parent >= 0 && parent < count && parent !== i) {
      bones[parent].add(bones[i]);
    } else {
      roots.push(bones[i]);
    }
  }

  // Skeleton inverses are computed from the bind pose; ensure world matrices are
  // current first (roots will be re-parented into the mesh by the caller, but
  // local TRS is identical so inverses stay valid).
  for (const root of roots) root.updateMatrixWorld(true);
  const skeleton = new Skeleton(bones);

  return { bones, roots, skeleton };
}

/** Build an AnimationClip from a frame-major TRS animation geometry. */
export function buildClip(
  name: string,
  animGeometry: BufferGeometry,
  boneCount: number
): AnimationClip {
  const position = animGeometry.getAttribute("position");
  const quaternion = animGeometry.getAttribute("quaternion");
  const scale = animGeometry.getAttribute("scale");

  const userData = (animGeometry.userData ?? {}) as { fps?: number; frames?: number };
  const fps = userData.fps ?? 24;
  const frames = userData.frames ?? position.count / boneCount;

  const times = new Float32Array(frames);
  for (let f = 0; f < frames; f++) times[f] = f / fps;

  const tracks: (VectorKeyframeTrack | QuaternionKeyframeTrack)[] = [];

  for (let b = 0; b < boneCount; b++) {
    const pos = new Float32Array(frames * 3);
    const quat = new Float32Array(frames * 4);
    const scl = new Float32Array(frames * 3);

    for (let f = 0; f < frames; f++) {
      const idx = f * boneCount + b;
      pos[f * 3] = position.getX(idx);
      pos[f * 3 + 1] = position.getY(idx);
      pos[f * 3 + 2] = position.getZ(idx);
      quat[f * 4] = quaternion.getX(idx);
      quat[f * 4 + 1] = quaternion.getY(idx);
      quat[f * 4 + 2] = quaternion.getZ(idx);
      quat[f * 4 + 3] = quaternion.getW(idx);
      scl[f * 3] = scale.getX(idx);
      scl[f * 3 + 1] = scale.getY(idx);
      scl[f * 3 + 2] = scale.getZ(idx);
    }

    tracks.push(new VectorKeyframeTrack(`bone_${b}.position`, times, pos));
    tracks.push(new QuaternionKeyframeTrack(`bone_${b}.quaternion`, times, quat));
    tracks.push(new VectorKeyframeTrack(`bone_${b}.scale`, times, scl));
  }

  return new AnimationClip(name, frames / fps, tracks);
}
