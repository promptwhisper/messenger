"use client";

import { type RefObject, Suspense, useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import {
  Group,
  Bone,
  Object3D,
  Skeleton,
  SkinnedMesh,
  MeshToonMaterial,
  MeshBasicMaterial,
  BackSide,
  Color,
  Vector3,
  Quaternion,
  Matrix4,
  Raycaster,
  AnimationMixer,
  AnimationClip,
  LoopRepeat,
  RepeatWrapping,
  ClampToEdgeWrapping,
  LinearFilter,
  NearestFilter,
  DataTexture,
  RedFormat,
  SRGBColorSpace,
  type BufferGeometry,
  type AnimationAction,
  type Texture,
  type WebGLProgramParametersWithUniforms,
} from "three";
import { useTexture } from "@react-three/drei";
import { useDrcGeometry, useKtx2Texture } from "@/lib/messenger/r3f/hooks";
import { buildSkeleton, buildClip } from "@/lib/messenger/r3f/skeleton";
import { useKeyboard } from "@/lib/messenger/r3f/useKeyboard";
import { playerPosition } from "@/lib/messenger/r3f/interaction";
import { play } from "@/lib/messenger/audio";
import { type Outfit } from "@/lib/messenger/outfit";
import { publicPath } from "@/lib/messenger/assets";

// Shared 3-step toon ramp giving the character flat, hand-drawn-ish shading
// instead of smooth 3D lighting.
const TOON_RAMP = (() => {
  const ramp = new Uint8Array([150, 205, 255]);
  const tex = new DataTexture(ramp, ramp.length, 1, RedFormat);
  tex.minFilter = NearestFilter;
  tex.magFilter = NearestFilter;
  tex.needsUpdate = true;
  return tex;
})();

// Per-part black outline so the bag/clothes/hair read as distinct layers (the
// screen-space outline can't separate parts that share depth+normal, e.g. a bag
// pressed against the back). This is a classic inverted-hull: render back-faces
// pushed out along the skinned normal, drawn behind the lit mesh.
const OUTLINE_THICKNESS = 0.014;
const OUTLINE_MATERIAL = (() => {
  const mat = new MeshBasicMaterial({ color: new Color("#2b2622"), side: BackSide });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uThickness = { value: OUTLINE_THICKNESS };
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nuniform float uThickness;")
      .replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\ntransformed += objectNormal * uThickness;"
      );
  };
  return mat;
})();

/** Build the inverted-hull outline twin for a skinned part. */
function makeOutlineMesh(geometry: BufferGeometry, skeleton: Skeleton): SkinnedMesh {
  const mesh = new SkinnedMesh(geometry, OUTLINE_MATERIAL);
  mesh.frustumCulled = false;
  mesh.bind(skeleton, new Matrix4());
  mesh.renderOrder = -1; // draw before the lit mesh
  return mesh;
}

/**
 * One swappable accessory (hair/top/bottom/shoes). Decodes its geometry, binds
 * it to the shared skeleton, and attaches it to the rig group. Like the
 * original, each part's colour comes from sampling the shared colour atlas with
 * the mesh UVs (not per-slot tinting), so switching a variant changes its look
 * via its own UVs. Re-mounts when the variant path changes.
 */
function AccessorySlot({
  path,
  atlasTex,
  skeleton,
  parent,
}: {
  path: string;
  atlasTex: Texture;
  skeleton: Skeleton;
  parent: Group;
}) {
  const geometry = useDrcGeometry(path);
  useEffect(() => {
    const material = new MeshToonMaterial({ map: atlasTex, gradientMap: TOON_RAMP });
    const mesh = new SkinnedMesh(geometry, material);
    mesh.frustumCulled = false;
    mesh.bind(skeleton, new Matrix4());
    // Some Draco-decoded accessories have skin weights that don't sum to 1 on a
    // few verts; without this they get pulled toward the skeleton root and the
    // outline shell shows them as a black spike.
    mesh.normalizeSkinWeights();
    parent.add(mesh);
    const outline = makeOutlineMesh(geometry, skeleton);
    parent.add(outline);
    return () => {
      parent.remove(mesh);
      parent.remove(outline);
      material.dispose();
    };
  }, [geometry, atlasTex, skeleton, parent]);
  return null;
}

/**
 * Main-character face/skin material, faithful to the original: the whole body
 * (skin + clothing regions) is coloured by sampling the shared colour atlas with
 * the mesh UVs, and the eyes are overlaid from the eye sprite-sheet in the uv
 * band y>1 (with a random blink) over the skin colour. The original main char
 * has no mouth and no mask.
 */
function makeFaceMaterial(eyeTex: Texture, atlasTex: Texture): MeshToonMaterial {
  atlasTex.wrapS = ClampToEdgeWrapping;
  atlasTex.wrapT = ClampToEdgeWrapping;
  atlasTex.minFilter = NearestFilter;
  atlasTex.magFilter = NearestFilter;
  atlasTex.generateMipmaps = false;
  atlasTex.colorSpace = SRGBColorSpace;
  atlasTex.needsUpdate = true;

  eyeTex.wrapS = RepeatWrapping; // eye UVs live outside [0,1] (y>1)
  eyeTex.wrapT = RepeatWrapping;
  eyeTex.minFilter = LinearFilter; // no mipmaps so the uv-shrunk sprite stays crisp
  eyeTex.magFilter = LinearFilter;
  eyeTex.generateMipmaps = false;
  eyeTex.needsUpdate = true;

  const mat = new MeshToonMaterial({ map: atlasTex, gradientMap: TOON_RAMP });
  mat.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms) => {
    shader.uniforms.tEye = { value: eyeTex };
    shader.uniforms.uTime = { value: 0 };
    shader.uniforms.uSkinColor = { value: new Color("#ebced0") };
    mat.userData.shader = shader;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec2 vFaceUv;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvFaceUv = uv;");
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        "#include <common>\nuniform sampler2D tEye;\nuniform float uTime;\nuniform vec3 uSkinColor;\nvarying vec2 vFaceUv;"
      )
      .replace(
        "#include <color_fragment>",
        [
          "#include <color_fragment>",
          "if (vFaceUv.y > 1.0) {", // eye band sits above the [0,1] uv block
          "  float bt = fract(uTime * 0.07 + 0.37);",
          "  float frame = bt > 0.97 ? (bt > 0.985 ? 2.0 : 1.0) : 0.0;",
          "  vec2 euv = vec2(fract(vFaceUv.x) * 0.25 + frame * 0.25, fract(vFaceUv.y));",
          "  float e = smoothstep(0.42, 0.58, texture2D(tEye, euv).r);",
          "  diffuseColor.rgb = mix(uSkinColor, vec3(0.05, 0.04, 0.04), e);",
          "}",
        ].join("\n")
      );
  };
  return mat;
}

// Tunables in ABSOLUTE world units. The avatar (~1.6 tall, origin at the feet)
// and the present planet share the original coordinate system, so the model is
// used at scale 1 and motion is in metres, not fractions of the planet radius.
const MODEL_SCALE = 1;
const WALK_SPEED = 3.2; // m/s along the surface
const SPRINT_SPEED = 6.0;
const JUMP_VELOCITY = 5.0; // m/s
const GRAVITY = 18; // m/s²
const LOOK_HEIGHT = 1.25; // look target height on the avatar
const STEP_INTERVAL = 0.34; // seconds between footsteps at walk pace
// Orbit camera (drag to rotate, wheel to zoom), matching the original's
// spherical follow rig and camera-relative movement.
const CAM_HEIGHT = 1.35;
const CAM_DISTANCE = 4.0;
const CAM_MIN_DIST = 3.0;
const CAM_MAX_DIST = 7.5;
const CAM_ROT_SPEED = 0.005;
// Wardrobe mode: camera swings to the avatar's front for a full-body view while
// movement is locked (matches the original's customization screen).
const WARDROBE_DIST = 3.1;
const WARDROBE_HEIGHT = 0.95;
const WARDROBE_LOOK = 0.85;
// Ground probe: cast from just above the avatar's head (not the planet's sky) so
// overhead geometry (bridges, awnings) can't be picked as "ground" and teleport
// the avatar up. Headroom must stay below any walkable overhang's clearance.
const GROUND_HEADROOM = 1.0;
const GROUND_MAX_DROP = 4.0;
// The recurring scene raycast (ground probe against the collision hull) only
// needs to run a few times a second — surfaceDist changes slowly as the avatar
// walks — so we cap it at ~30Hz instead of every rendered frame.
const SCENE_RAY_INTERVAL = 1 / 30;

const ANIMATION_FILES = {
  idle: "avatar/avatar-idle.drc",
  run: "avatar/avatar-run.drc",
  sprint: "avatar/avatar-sprint.drc",
  air: "avatar/avatar-air.drc",
} as const;

type AnimName = keyof typeof ANIMATION_FILES;

export default function Avatar({
  center,
  radius,
  surface,
  outfit,
  initialDir,
  initialRotation = 0,
  wardrobe = false,
}: {
  center: Vector3;
  radius: number;
  surface: RefObject<Object3D | null>;
  outfit: Outfit;
  initialDir?: Vector3;
  initialRotation?: number;
  wardrobe?: boolean;
}) {
  const camera = useThree((s) => s.camera);
  const gl = useThree((s) => s.gl);
  const input = useKeyboard();

  // keep the latest wardrobe flag readable inside the frame loop
  const wardrobeRef = useRef(wardrobe);
  useEffect(() => {
    wardrobeRef.current = wardrobe;
  }, [wardrobe]);

  // --- decode geometry (Suspense) ---
  const bonesGeometry = useDrcGeometry("avatar/avatar-bones.drc");
  const bodyGeometry = useDrcGeometry("avatar/accessories/base.drc");
  const eyeTex = useKtx2Texture("mainchar-eye-highq.ktx2");
  const atlasTex = useTexture(publicPath("/assets/images/atlas.png"));
  const idleGeometry = useDrcGeometry(ANIMATION_FILES.idle);
  const runGeometry = useDrcGeometry(ANIMATION_FILES.run);
  const sprintGeometry = useDrcGeometry(ANIMATION_FILES.sprint);
  const airGeometry = useDrcGeometry(ANIMATION_FILES.air);

  // --- assemble skeleton, body mesh, mixer (accessories added separately) ---
  const rig = useMemo(() => {
    const { bones, roots, skeleton } = buildSkeleton(bonesGeometry);
    const boneCount = bones.length;

    const group = new Group();
    const root = roots[0] ?? new Bone();

    const bodyMaterial = makeFaceMaterial(eyeTex, atlasTex);
    const body = new SkinnedMesh(bodyGeometry, bodyMaterial);
    body.frustumCulled = false;
    body.add(root); // bones live under the body skinned mesh
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
        const action = mixer.clipAction(clips[name])!;
        action.loop = LoopRepeat;
        return [name, action];
      })
    ) as Record<AnimName, AnimationAction>;

    actions.idle.play();
    return { group, mixer, actions, skeleton, boneCount, bodyMaterial };
  }, [
    bonesGeometry,
    bodyGeometry,
    eyeTex,
    atlasTex,
    idleGeometry,
    runGeometry,
    sprintGeometry,
    airGeometry,
  ]);

  // hold the body material in a ref so the frame loop can drive its uniforms
  const faceMatRef = useRef<MeshToonMaterial | null>(null);
  useEffect(() => {
    faceMatRef.current = rig.bodyMaterial;
  }, [rig]);


  // --- runtime state ---
  // Spawn direction (surface normal at the start point). Matches the original's
  // characterInitialOptions.charPosition, normalised to a planet-surface dir so
  // the avatar starts on open ground instead of the north pole (a tree).
  const initialUp = useMemo(
    () => (initialDir ? initialDir.clone().normalize() : new Vector3(0, 1, 0)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );
  const initialForward = useMemo(() => {
    const f = new Vector3(0, 0, 1);
    if (Math.abs(f.dot(initialUp)) > 0.9) f.set(1, 0, 0);
    f.addScaledVector(initialUp, -f.dot(initialUp)).normalize();
    return f.applyQuaternion(new Quaternion().setFromAxisAngle(initialUp, initialRotation)).normalize();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const outer = useRef<Group>(null);
  const up = useRef(initialUp.clone());
  const forward = useRef(initialForward.clone());
  const footOffset = useRef(0);
  const vertVel = useRef(0);
  const onGround = useRef(true);
  const groundPlaced = useRef(false);
  const current = useRef<AnimName>("idle");

  // scratch
  const q = useMemo(() => new Quaternion(), []);
  const basis = useMemo(() => new Matrix4(), []);
  const tmpRight = useMemo(() => new Vector3(), []);
  const camPos = useMemo(() => new Vector3(), []);
  const camTarget = useMemo(() => new Vector3(), []);
  const charPos = useMemo(() => new Vector3(), []);
  const rayOrigin = useMemo(() => new Vector3(), []);
  const rayDir = useMemo(() => new Vector3(), []);
  const moveDir = useMemo(() => new Vector3(), []);
  const camForward = useMemo(() => new Vector3(), []);
  const camRight = useMemo(() => new Vector3(), []);
  const camRevert = useMemo(() => new Vector3(), []);
  const desiredCamOffset = useMemo(() => new Vector3(), []);
  const camHitDir = useMemo(() => new Vector3(), []);
  const camCaster = useMemo(() => new Raycaster(), []);
  // Persistent ground raycaster (reused, not re-allocated each frame) plus a
  // small accumulator so the probe runs at ~30Hz, not once per frame.
  const groundCaster = useMemo(() => new Raycaster(), []);
  const rayAccum = useRef(0);
  const surfaceDist = useRef(radius);

  // orbit camera state. camDist is the intended offset length (zoom distance);
  // we always re-normalise camOffset to it so the recenter lerp can't shrink it.
  const camOffset = useRef(
    initialForward.clone().multiplyScalar(-CAM_DISTANCE).addScaledVector(initialUp, CAM_HEIGHT)
  );
  const camDist = useRef(Math.hypot(CAM_DISTANCE, CAM_HEIGHT));
  const prevUp = useRef(initialUp.clone());
  const drag = useRef({ x: 0, y: 0 });
  const zoomDelta = useRef(0);
  const dragging = useRef(false);
  const stepTimer = useRef(0);

  // pointer-drag rotate + wheel zoom on the canvas
  useEffect(() => {
    const dom = gl.domElement;
    const onDown = () => {
      dragging.current = true;
    };
    const onUp = () => {
      dragging.current = false;
    };
    const onMove = (e: PointerEvent) => {
      if (dragging.current) {
        drag.current.x += e.movementX;
        drag.current.y += e.movementY;
      }
    };
    const onWheel = (e: WheelEvent) => {
      zoomDelta.current += e.deltaY;
    };
    dom.addEventListener("pointerdown", onDown);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointermove", onMove);
    dom.addEventListener("wheel", onWheel, { passive: true });
    return () => {
      dom.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointermove", onMove);
      dom.removeEventListener("wheel", onWheel);
    };
  }, [gl]);

  const setAction = (name: AnimName) => {
    const next = rig.actions[name];
    // Self-healing: also re-play if the "current" action was stopped out from
    // under us (e.g. a mixer.stopAllAction during a dev StrictMode remount),
    // otherwise the rig would stay stuck in its bind (T-)pose.
    if (current.current === name && next.isRunning()) return;
    const prev = rig.actions[current.current];
    if (prev !== next) prev.fadeOut(0.18);
    next.reset().fadeIn(0.18).play();
    current.current = name;
  };

  // Free this avatar's GPU resources the instant it unmounts (scene swap /
  // StrictMode remount). Geometries + the shared atlas/eye textures and the
  // module-level outline material are owned elsewhere, so we only dispose the
  // per-instance face material we created here.
  useEffect(() => {
    const { mixer, bodyMaterial } = rig;
    return () => {
      mixer.stopAllAction();
      bodyMaterial.dispose();
    };
  }, [rig]);

  useFrame((state, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05);
    const i = input.current;
    const u = up.current;
    const f = forward.current;

    // --- orbit camera offset: parallel-transport as up changes, then apply
    // pointer drag (azimuth/polar) and wheel zoom ---
    q.setFromUnitVectors(prevUp.current, u);
    camOffset.current.applyQuaternion(q);
    prevUp.current.copy(u);
    if (drag.current.x !== 0) {
      q.setFromAxisAngle(u, -drag.current.x * CAM_ROT_SPEED);
      camOffset.current.applyQuaternion(q);
    }
    if (drag.current.y !== 0) {
      camRevert.copy(camOffset.current);
      camRight.copy(u).cross(camOffset.current).normalize();
      q.setFromAxisAngle(camRight, -drag.current.y * CAM_ROT_SPEED);
      camOffset.current.applyQuaternion(q);
      const cosP = camForward.copy(camOffset.current).normalize().dot(u);
      if (cosP > 0.95 || cosP < 0.1) camOffset.current.copy(camRevert); // clamp pitch
    }
    drag.current.x = 0;
    drag.current.y = 0;
    if (zoomDelta.current !== 0) {
      camDist.current = Math.min(
        CAM_MAX_DIST,
        Math.max(CAM_MIN_DIST, camDist.current * (1 + zoomDelta.current * 0.0015))
      );
      zoomDelta.current = 0;
    }
    if (!dragging.current) {
      desiredCamOffset.copy(f).multiplyScalar(-CAM_DISTANCE).addScaledVector(u, CAM_HEIGHT);
      camOffset.current.lerp(desiredCamOffset, Math.min(1, dt * 2.8));
    }
    // Enforce the intended orbit distance every frame. Lerping between two
    // equal-length vectors lands inside the sphere (shorter), which previously
    // crept the camera inward until it clipped into the character.
    camOffset.current.setLength(camDist.current);

    // --- camera-relative movement: WASD along the camera's ground plane,
    // character turns to face the movement direction ---
    camForward.copy(camOffset.current).multiplyScalar(-1);
    camForward.addScaledVector(u, -camForward.dot(u));
    if (camForward.lengthSq() < 1e-6) camForward.copy(f);
    camForward.normalize();
    camRight.copy(camForward).cross(u).normalize();

    const inWardrobe = wardrobeRef.current;
    const driveZ = inWardrobe ? 0 : (i.forward ? 1 : 0) - (i.back ? 1 : 0);
    const driveX = inWardrobe ? 0 : (i.right ? 1 : 0) - (i.left ? 1 : 0);
    const moving = driveZ !== 0 || driveX !== 0;
    const sprinting = i.sprint && moving;
    if (moving) {
      moveDir
        .set(0, 0, 0)
        .addScaledVector(camForward, driveZ)
        .addScaledVector(camRight, driveX)
        .normalize();
      const speed = sprinting ? SPRINT_SPEED : WALK_SPEED;
      const angle = (speed * dt) / radius;
      tmpRight.copy(u).cross(moveDir).normalize(); // surface roll axis
      q.setFromAxisAngle(tmpRight, angle);
      u.applyQuaternion(q).normalize();
      f.copy(moveDir);
    }
    f.addScaledVector(u, -f.dot(u)).normalize(); // keep forward tangent

    // jump / gravity along up
    if (i.jump && onGround.current && !inWardrobe) {
      vertVel.current = JUMP_VELOCITY;
      onGround.current = false;
      void play("character/jump-start.ogg", 0.5);
    }
    if (!onGround.current) {
      footOffset.current += vertVel.current * dt;
      vertVel.current -= GRAVITY * dt;
      if (footOffset.current <= 0) {
        footOffset.current = 0;
        vertVel.current = 0;
        onGround.current = true;
        void play("character/jump-land.ogg", 0.4);
      }
    }

    // ground the avatar on the real terrain. First placement casts from high up
    // (spawn is in the open); afterwards we cast from just above the avatar's
    // head so overhead geometry (e.g. a bridge) can't be picked as ground and
    // teleport the avatar onto it.
    // Throttled to ~30Hz, except the very first placement which must resolve
    // immediately so the avatar doesn't spawn at the planet centre.
    rayAccum.current += dt;
    const mesh = surface.current;
    if (mesh && (!groundPlaced.current || rayAccum.current >= SCENE_RAY_INTERVAL)) {
      rayAccum.current = 0;
      let far: number;
      if (groundPlaced.current) {
        const base = surfaceDist.current + footOffset.current + GROUND_HEADROOM;
        rayOrigin.copy(center).addScaledVector(u, base);
        far = GROUND_HEADROOM + GROUND_MAX_DROP;
      } else {
        rayOrigin.copy(center).addScaledVector(u, radius * 1.6);
        far = radius * 3.2;
      }
      rayDir.copy(u).multiplyScalar(-1);
      groundCaster.set(rayOrigin, rayDir);
      groundCaster.near = 0;
      groundCaster.far = far;
      const hits = groundCaster.intersectObject(mesh, true);
      if (hits.length > 0) {
        surfaceDist.current = center.distanceTo(hits[0].point);
        groundPlaced.current = true;
      }
    }

    // place + orient the avatar on the surface
    charPos.copy(center).addScaledVector(u, surfaceDist.current + footOffset.current);
    playerPosition.copy(charPos); // share with NPC proximity checks
    if (outer.current) {
      outer.current.position.copy(charPos);
      // abeto avatar faces +Z; align its +Z with the travel direction so the
      // follow camera sees its back.
      tmpRight.copy(u).cross(f).normalize();
      basis.makeBasis(tmpRight, u, f);
      outer.current.quaternion.setFromRotationMatrix(basis);
      outer.current.scale.setScalar(MODEL_SCALE);
    }

    // animation state machine
    if (!onGround.current) setAction("air");
    else if (moving) setAction(sprinting ? "sprint" : "run");
    else setAction("idle");
    rig.mixer.update(dt);

    // footsteps while moving on the ground
    if (moving && onGround.current) {
      stepTimer.current -= dt;
      if (stepTimer.current <= 0) {
        void play("character/footsteps4.ogg", 0.3);
        stepTimer.current = sprinting ? STEP_INTERVAL * 0.62 : STEP_INTERVAL;
      }
    } else {
      stepTimer.current = 0;
    }

    // camera: orbit follow normally, or swing to the avatar's front (full-body)
    // while in the wardrobe screen. Look target is resolved first so the camera
    // collision can cast from it toward the desired camera position.
    if (inWardrobe) {
      camTarget.copy(charPos).addScaledVector(u, WARDROBE_LOOK);
      desiredCamOffset
        .copy(f)
        .multiplyScalar(WARDROBE_DIST)
        .addScaledVector(u, WARDROBE_HEIGHT);
      camPos.copy(charPos).add(desiredCamOffset);
    } else {
      camTarget.copy(charPos).addScaledVector(u, LOOK_HEIGHT);
      camPos.copy(charPos).add(camOffset.current);
    }

    // camera collision: cast from the look target toward the desired camera
    // position; if a wall/terrain is nearer than that distance, pull the camera
    // in just short of it so it never clips through geometry.
    let camCollided = false;
    const camMesh = surface.current;
    if (camMesh) {
      camHitDir.copy(camPos).sub(camTarget);
      const wantDist = camHitDir.length();
      if (wantDist > 1e-3) {
        camHitDir.multiplyScalar(1 / wantDist);
        camCaster.set(camTarget, camHitDir);
        camCaster.far = wantDist;
        camCaster.near = 0;
        const camHits = camCaster.intersectObject(camMesh, true);
        if (camHits.length > 0) {
          const safe = Math.max(0.6, camHits[0].distance - 0.3);
          camPos.copy(camTarget).addScaledVector(camHitDir, safe);
          camCollided = true;
        }
      }
    }

    // Snap in immediately when blocked (avoids a visible clip), but ease back out
    // smoothly when the obstruction clears.
    if (camCollided) camera.position.copy(camPos);
    else camera.position.lerp(camPos, Math.min(1, dt * (inWardrobe ? 4 : 10)));
    camera.lookAt(camTarget);
    camera.up.copy(u);

    // drive the blink/face sprite animation (imperative uniform update)
    const faceShader = faceMatRef.current?.userData.shader as
      | WebGLProgramParametersWithUniforms
      | undefined;
    if (faceShader) {
      faceShader.uniforms.uTime.value = state.clock.elapsedTime;
    }
  });

  return (
    <group ref={outer}>
      <primitive object={rig.group} />
      <Suspense fallback={null}>
        <AccessorySlot
          path={`avatar/accessories/hair${outfit.hair}.drc`}
          atlasTex={atlasTex}
          skeleton={rig.skeleton}
          parent={rig.group}
        />
      </Suspense>
      <Suspense fallback={null}>
        <AccessorySlot
          path={`avatar/accessories/top${outfit.top}.drc`}
          atlasTex={atlasTex}
          skeleton={rig.skeleton}
          parent={rig.group}
        />
      </Suspense>
      <Suspense fallback={null}>
        <AccessorySlot
          path={`avatar/accessories/bottom${outfit.bottom}.drc`}
          atlasTex={atlasTex}
          skeleton={rig.skeleton}
          parent={rig.group}
        />
      </Suspense>
      <Suspense fallback={null}>
        <AccessorySlot
          path={`avatar/accessories/shoes${outfit.shoes}.drc`}
          atlasTex={atlasTex}
          skeleton={rig.skeleton}
          parent={rig.group}
        />
      </Suspense>
    </group>
  );
}
