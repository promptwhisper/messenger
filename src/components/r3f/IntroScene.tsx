"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useTexture } from "@react-three/drei";
import {
  Group,
  Color,
  Vector3,
  Vector2,
  Mesh,
  Points,
  MeshBasicMaterial,
  ShaderMaterial,
  CustomBlending,
  SrcAlphaFactor,
  OneFactor,
  ZeroFactor,
  DoubleSide,
  BackSide,
  SphereGeometry,
  RepeatWrapping,
  SRGBColorSpace,
  ClampToEdgeWrapping,
  NearestFilter,
  BufferGeometry,
  BufferAttribute,
  type Texture,
} from "three";
import { useDrcGeometry, useKtx2Texture } from "@/lib/messenger/r3f/hooks";
import { publicPath } from "@/lib/messenger/assets";
import { createMessengerMaterial } from "@/lib/messenger/r3f/materials";
import PresentDecorations from "./PresentDecorations";
import CurveDecorations from "./CurveDecorations";

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const quadInOut = (value: number) =>
  value < 0.5 ? 2 * value * value : 1 - Math.pow(-2 * value + 2, 2) / 2;
const quartInOut = (value: number) =>
  value < 0.5 ? 8 * Math.pow(value, 4) : 1 - Math.pow(-2 * value + 2, 4) / 2;
const elasticOut = (value: number, period: number) => {
  if (value === 0 || value === 1) return value;
  return Math.pow(2, -10 * value) * Math.sin(((value - period / 4) * Math.PI * 2) / period) + 1;
};

/** Configure the shared colour atlas exactly like the original (nearest, sRGB). */
function configureAtlas(tex: Texture): Texture {
  tex.wrapS = ClampToEdgeWrapping;
  tex.wrapT = ClampToEdgeWrapping;
  tex.minFilter = NearestFilter;
  tex.magFilter = NearestFilter;
  tex.generateMipmaps = false;
  tex.colorSpace = SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Planet / trees / water: in the original these all sample the shared colour
 * atlas (`atlas.png`) at the mesh UVs (`introMaterial`/`waterMaterial`), which
 * is what gives the painterly, region-coloured look. We mirror that with a toon
 * material mapped to the same atlas; the dark cartoon outline comes from the
 * post-processing outline pass.
 */
function AtlasMesh({
  path,
  atlas,
  terrainNoise,
  terrainDetail,
  cast = true,
  receive = true,
}: {
  path: string;
  atlas: Texture;
  terrainNoise?: Texture;
  terrainDetail?: Texture;
  cast?: boolean;
  receive?: boolean;
}) {
  const geometry = useDrcGeometry(path);
  const material = useMemo(
    () => createMessengerMaterial(atlas, { fog: false, terrainNoise, terrainDetail }),
    [atlas, terrainDetail, terrainNoise]
  );
  useEffect(() => () => material.dispose(), [material]);
  return (
    <mesh geometry={geometry} material={material} castShadow={cast} receiveShadow={receive} />
  );
}

/** Clouds: flat off-white (`cloudMaterial` uColor #F8F8F8 in the original). */
function CloudMesh({ path }: { path: string }) {
  const geometry = useDrcGeometry(path);
  const material = useMemo(
    () => new MeshBasicMaterial({ color: new Color("#f8f8f8") }),
    []
  );
  useEffect(() => () => material.dispose(), [material]);
  return <mesh geometry={geometry} material={material} />;
}

/** Original 16-frame doodle particle sheet driven by the authored point data. */
function IntroParticles({ path }: { path: string }) {
  const geometry = useDrcGeometry(path);
  const sprites = useKtx2Texture("particle_sprites.ktx2");
  const pointsRef = useRef<Points>(null);
  const material = useMemo(() => {
    sprites.wrapS = sprites.wrapT = RepeatWrapping;
    sprites.colorSpace = SRGBColorSpace;
    sprites.needsUpdate = true;
    return new ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: CustomBlending,
      blendSrc: SrcAlphaFactor,
      blendSrcAlpha: ZeroFactor,
      blendDst: OneFactor,
      blendDstAlpha: OneFactor,
      uniforms: {
        uSprites: { value: sprites },
        uColor: { value: new Color("#6a8f89") },
        uShow: { value: 0 },
        uTime: { value: 0 },
        uResolution: { value: new Vector2(1, 1) },
      },
      vertexShader: /* glsl */ `
        attribute vec3 color;
        uniform float uShow;
        uniform float uTime;
        uniform vec2 uResolution;
        varying vec3 vParticleNoise;
        varying float vParticleProgress;
        varying float vParticleRotation;
        varying float vParticleSize;
        void main() {
          vParticleNoise = color;
          float steppedTime = floor(uTime * 2.0) / 2.0;
          vec3 pos = position;
          vParticleRotation = sin(steppedTime + vParticleNoise.r * 20.0) * 3.14159265 * vParticleNoise.g;
          pos.y += vParticleRotation * 0.1;
          vParticleProgress = floor(fract(vParticleNoise.g * 20.0) * 16.0) / 16.0;
          vParticleSize = vParticleNoise.b;
          if (vParticleSize > 0.5) vParticleSize *= 2.0;
          vec4 viewPosition = modelViewMatrix * vec4(pos, 1.0);
          gl_Position = projectionMatrix * viewPosition;
          gl_PointSize = (uResolution.y / mix(70.0, 50.0, vParticleSize)) * uShow;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform sampler2D uSprites;
        uniform vec3 uColor;
        uniform float uShow;
        varying vec3 vParticleNoise;
        varying float vParticleProgress;
        varying float vParticleRotation;
        varying float vParticleSize;
        mat2 rotate2d(float angle) {
          float s = sin(angle);
          float c = cos(angle);
          return mat2(c, s, -s, c);
        }
        void main() {
          vec2 uv = gl_PointCoord - 0.5;
          uv = rotate2d(vParticleRotation) * uv + 0.5;
          uv.y = 1.0 - uv.y;
          uv.x = uv.x / 16.0 + 1.0 / 16.0 + vParticleProgress;
          float sprite = texture2D(uSprites, uv).r;
          if (sprite < 0.5) discard;
          vec3 colorValue = mix(uColor * 1.5, uColor * uColor, vParticleNoise.r);
          gl_FragColor = vec4(colorValue, sprite * smoothstep(0.0, 0.1, uShow));
          #include <colorspace_fragment>
        }
      `,
    });
  }, [sprites]);
  const revealStart = useRef<number | null>(null);
  useFrame((state) => {
    if (revealStart.current === null) revealStart.current = state.clock.elapsedTime;
    const elapsed = state.clock.elapsedTime - revealStart.current;
    const reveal = clamp01((elapsed - 0.5) / 2);
    material.uniforms.uShow.value = 0.5 - Math.cos(reveal * Math.PI) * 0.5;
    material.uniforms.uTime.value = state.clock.elapsedTime;
    material.uniforms.uResolution.value.set(
      state.size.width * state.viewport.dpr,
      state.size.height * state.viewport.dpr
    );
    const mesh = pointsRef.current;
    if (mesh) {
      const turn = quartInOut(clamp01((elapsed - 1) / 4));
      mesh.rotation.y = -Math.PI * 0.75 * (1 - turn);
    }
  });
  useEffect(() => () => material.dispose(), [material]);
  return <points ref={pointsRef} geometry={geometry} material={material} frustumCulled={false} />;
}

function IntroBirds({ atlas }: { atlas: Texture }) {
  const curve = useDrcGeometry("birds/curve-1.drc");
  const bird = useDrcGeometry("birds/1.drc");
  const path = curve.getAttribute("position_1");
  const refs = useRef<Array<Mesh | null>>([]);
  const start = useRef<number | null>(null);
  const current = useMemo(() => new Vector3(), []);
  const next = useMemo(() => new Vector3(), []);
  const material = useMemo(
    () => createMessengerMaterial(atlas, { fog: false }),
    [atlas]
  );
  useFrame((state) => {
    if (start.current === null) start.current = state.clock.elapsedTime;
    const elapsed = state.clock.elapsedTime - start.current;
    const reveal = clamp01((elapsed - 2.7) / 2);
    for (let index = 0; index < refs.current.length; index += 1) {
      const mesh = refs.current[index];
      if (!mesh || !path) continue;
      const group = index % 5;
      const phase = (elapsed * 3 + (path.count / 5) * group + Math.floor(index / 5) * 1.6) % path.count;
      const a = Math.floor(phase);
      const b = (a + 1) % path.count;
      current.fromBufferAttribute(path, a);
      next.fromBufferAttribute(path, b);
      mesh.position.lerpVectors(current, next, phase - a);
      mesh.up.copy(current).normalize();
      mesh.lookAt(next);
      mesh.rotateY(Math.PI * 0.5);
      const randomScale = 0.7 + (Math.sin(index * 43.17) * 0.5 + 0.5) * 0.5;
      const flap = 1 + Math.sin(elapsed * (10 + (index % 4) * 1.7) + index) * 0.08;
      mesh.scale.set(reveal * randomScale, reveal * randomScale * flap, reveal * randomScale);
    }
  });
  useEffect(() => () => material.dispose(), [material]);
  return (
    <group name="intro-birds">
      {Array.from({ length: 15 }, (_, index) => (
        <mesh
          key={index}
          ref={(mesh) => {
            refs.current[index] = mesh;
          }}
          geometry={bird}
          material={material}
          scale={0}
          frustumCulled={false}
        />
      ))}
    </group>
  );
}

/**
 * Split a single decoded geometry into one geometry per `batchId` (the original
 * loads `title_vertical.drc` as a batched geometry whose 9 glyphs are stacked at
 * the origin and tagged by `batchId`), so each glyph can be placed on the grid.
 */
function splitByBatchId(geo: BufferGeometry): BufferGeometry[] {
  const elem = geo.getAttribute("batchId");
  const pos = geo.getAttribute("position");
  if (!elem) return [geo];
  const index = geo.getIndex();
  const idx = index ? (index.array as ArrayLike<number>) : null;
  const triCount = (index ? index.count : pos.count) / 3;
  const nor = geo.getAttribute("normal");
  const uv = geo.getAttribute("uv");

  const buckets = new Map<number, number[]>();
  for (let t = 0; t < triCount; t++) {
    const i0 = idx ? idx[t * 3] : t * 3;
    const i1 = idx ? idx[t * 3 + 1] : t * 3 + 1;
    const i2 = idx ? idx[t * 3 + 2] : t * 3 + 2;
    const id = Math.round(elem.getX(i0));
    let b = buckets.get(id);
    if (!b) {
      b = [];
      buckets.set(id, b);
    }
    b.push(i0, i1, i2);
  }

  return [...buckets.keys()]
    .sort((a, b) => a - b)
    .map((id) => {
      const verts = buckets.get(id)!;
      const remap = new Map<number, number>();
      const P: number[] = [];
      const N: number[] = [];
      const U: number[] = [];
      const I: number[] = [];
      for (const v of verts) {
        let nv = remap.get(v);
        if (nv === undefined) {
          nv = P.length / 3;
          remap.set(v, nv);
          P.push(pos.getX(v), pos.getY(v), pos.getZ(v));
          if (nor) N.push(nor.getX(v), nor.getY(v), nor.getZ(v));
          if (uv) U.push(uv.getX(v), uv.getY(v));
        }
        I.push(nv);
      }
      const g = new BufferGeometry();
      g.setAttribute("position", new BufferAttribute(new Float32Array(P), 3));
      if (nor) g.setAttribute("normal", new BufferAttribute(new Float32Array(N), 3));
      if (uv) g.setAttribute("uv", new BufferAttribute(new Float32Array(U), 2));
      g.setIndex(I);
      // Recenter each glyph so the uniform grid placement reconstructs the word.
      g.computeBoundingBox();
      const c = new Vector3();
      g.boundingBox!.getCenter(c);
      g.translate(-c.x, -c.y, -c.z);
      return g;
    });
}

// Grid spacing between glyphs, in the title's local units (from the original).
const TITLE_GX = 5.35;
const TITLE_GY = 6.9;

function positiveAngle(a: number): number {
  const twoPi = Math.PI * 2;
  return ((a % twoPi) + twoPi) % twoPi;
}

/**
 * A single interactive title glyph. Like the original, hovering pops its scale,
 * and dragging the cursor across it then leaving flips it 180° in 3D around the
 * axis perpendicular to the drag (horizontal drag → flip around Y, vertical →
 * around X), settling with a bouncy elastic spring plus a little squash.
 */
function LetterMesh({
  geometry,
  material,
  position,
  index,
}: {
  geometry: BufferGeometry;
  material: ShaderMaterial;
  position: [number, number, number];
  index: number;
}) {
  const ref = useRef<Mesh>(null);
  const st = useRef({
    rotX: 0,
    rotY: 0,
    velX: 0,
    velY: 0,
    tgtX: 0,
    tgtY: 0,
    scale: 1,
    scaleVel: 0,
    accX: 0,
    accY: 0,
    hovering: false,
  });
  const revealStart = useRef<number | null>(null);
  const initialRotation = useMemo(
    () => [Math.sin(index * 91.73) * Math.PI, Math.sin(index * 47.11 + 2.4) * Math.PI],
    [index]
  );

  useFrame((state, dtRaw) => {
    if (revealStart.current === null) revealStart.current = state.clock.elapsedTime;
    const elapsed = state.clock.elapsedTime - revealStart.current;
    const reveal = elasticOut(clamp01((elapsed - 2.35 - index * 0.075) / 3), 0.75);
    const s = st.current;
    const dt = Math.min(dtRaw, 1 / 30);
    // Underdamped springs give the elastic overshoot the original uses.
    const k = 60;
    const c = 8;
    s.velX += (k * (s.tgtX - s.rotX) - c * s.velX) * dt;
    s.rotX += s.velX * dt;
    s.velY += (k * (s.tgtY - s.rotY) - c * s.velY) * dt;
    s.rotY += s.velY * dt;
    s.scaleVel += (130 * (1 - s.scale) - 13 * s.scaleVel) * dt;
    s.scale += s.scaleVel * dt;
    const m = ref.current;
    if (m) {
      m.position.set(position[0] * reveal, position[1] * reveal, position[2] * reveal);
      m.rotation.set(
        s.rotX + initialRotation[0] * (1 - reveal),
        s.rotY + initialRotation[1] * (1 - reveal),
        0
      );
      m.scale.setScalar(s.scale * reveal);
    }
  });

  return (
    <mesh
      ref={ref}
      geometry={geometry}
      material={material}
      position={[0, 0, 0]}
      scale={0}
      onPointerOver={(e) => {
        e.stopPropagation();
        const s = st.current;
        s.hovering = true;
        s.accX = 0;
        s.accY = 0;
        s.scale = 1.06;
        document.body.style.cursor = "pointer";
      }}
      onPointerMove={(e) => {
        const s = st.current;
        if (!s.hovering) return;
        s.accX = s.accX * 0.7 + (e.nativeEvent.movementX || 0);
        s.accY = s.accY * 0.7 + (e.nativeEvent.movementY || 0);
      }}
      onPointerOut={() => {
        const s = st.current;
        s.hovering = false;
        document.body.style.cursor = "auto";
        if (Math.abs(s.accX) < 2 && Math.abs(s.accY) < 2) return;
        if (Math.abs(s.accX) > Math.abs(s.accY)) {
          const dir = Math.sign(s.accX) || 1;
          const o = positiveAngle(s.tgtX) > 0.1 ? -1 : 1;
          s.tgtY = Math.round((s.tgtY + Math.PI * dir * o) / Math.PI) * Math.PI;
        } else {
          const dir = Math.sign(-s.accY) || 1;
          s.tgtX = Math.round((s.tgtX + Math.PI * dir) / Math.PI) * Math.PI;
        }
        s.scale = 0.9;
      }}
    />
  );
}

/**
 * The big white "MESSENGER" title: `title_vertical.drc` is one geometry holding
 * all 9 glyphs (stacked at the origin, tagged by `batchId`); we split them and
 * lay them out on a 3-column grid, keep the whole thing billboarded a fixed
 * distance in front of the camera while the planet spins behind it, and let each
 * glyph be flipped in 3D with the cursor.
 */
function Title() {
  const geometry = useDrcGeometry("planets/present/intro/title_vertical.drc");
  const camera = useThree((s) => s.camera);
  const groupRef = useRef<Group>(null);

  const material = useMemo(
    () =>
      new ShaderMaterial({
        side: DoubleSide,
        uniforms: {
          uFront: { value: new Color("#f8f8f8") },
          uSide: { value: new Color("#a0a8a6") },
        },
        vertexShader: /* glsl */ `
          varying vec3 vViewNormal;
          void main() {
            vViewNormal = normalize(normalMatrix * normal);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: /* glsl */ `
          uniform vec3 uFront;
          uniform vec3 uSide;
          varying vec3 vViewNormal;
          void main() {
            float facing = abs(dot(normalize(vViewNormal), vec3(0.0, 0.0, 1.0)));
            vec3 color = mix(uFront, uSide, 1.0 - smoothstep(0.2, 0.8, facing));
            gl_FragColor = vec4(color, 1.0);
          }
        `,
      }),
    []
  );
  const letters = useMemo(() => splitByBatchId(geometry), [geometry]);

  const fwd = useMemo(() => new Vector3(), []);
  const screenUp = useMemo(() => new Vector3(), []);
  useFrame((state) => {
    const g = groupRef.current;
    if (!g) return;
    g.quaternion.copy(camera.quaternion);
    fwd.set(0, 0, -1).applyQuaternion(camera.quaternion);
    screenUp.set(0, 1, 0).applyQuaternion(camera.quaternion);
    g.position
      .copy(camera.position)
      .addScaledVector(fwd, 45)
      .addScaledVector(screenUp, 2);
    const mobileLayout = state.size.width < state.size.height && state.size.width < 700;
    g.scale.setScalar(mobileLayout ? 1.2 : 1);
  });

  useEffect(() => () => material.dispose(), [material]);

  return (
    <group ref={groupRef}>
      {letters.map((g, i) => (
        <LetterMesh
          key={i}
          geometry={g}
          material={material}
          position={[((i % 3) - 1) * TITLE_GX, -(Math.floor(i / 3) - 1) * TITLE_GY, 0]}
          index={i}
        />
      ))}
    </group>
  );
}

/**
 * Faithful port of the original intro "galaxies": flat quad cards (each with a
 * per-card `surfaceId` in 0..1) scattered in the background and scaled ×3. The
 * shader samples `galaxy.ktx2` and carves soft nebula/planet shapes out of each
 * card with `clouds_noise_64.ktx2` + a slow per-card spin, additively blended.
 */
function Galaxies() {
  const geometry = useDrcGeometry("planets/present/intro/galaxies.drc");
  const galaxyTex = useKtx2Texture("galaxy.ktx2");
  const noiseTex = useKtx2Texture("clouds_noise_64.ktx2");

  const material = useMemo(() => {
    [galaxyTex, noiseTex].forEach((t) => {
      t.wrapS = t.wrapT = RepeatWrapping;
      t.colorSpace = SRGBColorSpace;
      t.needsUpdate = true;
    });
    return new ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: CustomBlending,
      blendSrc: SrcAlphaFactor,
      blendSrcAlpha: ZeroFactor,
      blendDst: OneFactor,
      blendDstAlpha: OneFactor,
      uniforms: {
        uColor1: { value: new Color("#4f755a") },
        uColor2: { value: new Color("#3a726b") },
        uColor3: { value: new Color("#4b5766") },
        tGalaxy: { value: galaxyTex },
        tCloudNoise: { value: noiseTex },
        uShow: { value: 0 },
        uTime: { value: 0 },
      },
      vertexShader: /* glsl */ `
        attribute float surfaceId;
        varying vec2 vUv;
        varying float vSurfaceId;
        void main() {
          vSurfaceId = surfaceId;
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform sampler2D tCloudNoise;
        uniform sampler2D tGalaxy;
        uniform vec3 uColor1;
        uniform vec3 uColor2;
        uniform vec3 uColor3;
        uniform float uShow;
        uniform float uTime;
        varying vec2 vUv;
        varying float vSurfaceId;
        mat2 rotation2D(float a) {
          float s = sin(a), c = cos(a);
          return mat2(c, s, -s, c);
        }
        void main() {
          float spinDir = vSurfaceId > 0.5 ? 1.0 : -1.0;
          vec2 uv = vUv - 0.5;
          uv = rotation2D(floor(uTime * 2.0 + vSurfaceId * 100.0) * 0.06 * spinDir) * uv;
          uv *= 1.5;
          uv += 0.5;
          float noise = texture2D(tCloudNoise, uv).x;
          vec2 galaxyUv = vUv;
          if (fract(vSurfaceId + 0.75) > 0.5) galaxyUv.x = 1.0 - galaxyUv.x;
          float value = texture2D(tGalaxy, galaxyUv).r;
          value = 1.0 - pow(1.0 - value, 5.0);
          if (fract(vSurfaceId + 0.2) > 0.5) value = 1.0 - clamp(length(vUv - 0.5) * 8.0, 0.0, 1.0);
          value -= noise * mix(0.1, 0.95, fract(vSurfaceId + 0.873));
          float alpha = step(0.25, value * uShow);
          if (alpha < 0.9) discard;
          float colorid = floor(vSurfaceId * 3.0);
          vec3 color = mix(uColor1, uColor2, clamp(colorid, 0.0, 1.0));
          color = mix(color, uColor3, clamp(colorid - 1.0, 0.0, 1.0));
          gl_FragColor = vec4(color, alpha * mix(0.3, 0.4, vSurfaceId));
        }
      `,
    });
  }, [galaxyTex, noiseTex]);

  const mesh = useMemo(() => {
    const m = new Mesh(geometry, material);
    m.scale.setScalar(3);
    m.renderOrder = 5;
    m.frustumCulled = false;
    return m;
  }, [geometry, material]);

  useEffect(() => () => material.dispose(), [material]);

  const revealStart = useRef<number | null>(null);
  useFrame((state) => {
    if (revealStart.current === null) revealStart.current = state.clock.elapsedTime;
    const elapsed = state.clock.elapsedTime - revealStart.current;
    material.uniforms.uTime.value = state.clock.elapsedTime;
    material.uniforms.uShow.value = clamp01((elapsed - 2.2) / 3);
  });

  return <primitive object={mesh} />;
}

/** Broken-up atmospheric shell that becomes visible around the rising planet. */
function IntroAtmosphere() {
  const noise = useKtx2Texture("clouds_noise_64.ktx2");
  const geometry = useMemo(() => new SphereGeometry(38, 32, 32), []);
  const material = useMemo(() => {
    noise.wrapS = noise.wrapT = RepeatWrapping;
    noise.needsUpdate = true;
    return new ShaderMaterial({
      side: BackSide,
      transparent: true,
      depthWrite: false,
      blending: CustomBlending,
      blendSrc: SrcAlphaFactor,
      blendSrcAlpha: ZeroFactor,
      blendDst: OneFactor,
      blendDstAlpha: OneFactor,
      uniforms: {
        uColor: { value: new Color("#568f66") },
        uNoise: { value: noise },
        uShow: { value: 0 },
      },
      vertexShader: /* glsl */ `
        varying vec3 vAtmosphereNormal;
        varying vec3 vAtmospherePosition;
        varying vec3 vAtmosphereViewPosition;
        void main() {
          vAtmospherePosition = position;
          vAtmosphereNormal = normalize(normalMatrix * normal);
          vAtmosphereViewPosition = (modelViewMatrix * vec4(position, 1.0)).xyz;
          gl_Position = projectionMatrix * vec4(vAtmosphereViewPosition, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform sampler2D uNoise;
        uniform vec3 uColor;
        uniform float uShow;
        varying vec3 vAtmosphereNormal;
        varying vec3 vAtmospherePosition;
        varying vec3 vAtmosphereViewPosition;

        float triplanarNoise(vec3 normalDirection, vec3 positionValue) {
          vec3 weights = pow(abs(normalDirection), vec3(4.0));
          weights /= max(weights.x + weights.y + weights.z, 0.0001);
          float x = texture2D(uNoise, positionValue.yz * 0.015).r;
          float y = texture2D(uNoise, positionValue.xz * 0.015).r;
          float z = texture2D(uNoise, positionValue.xy * 0.015).r;
          return x * weights.x + y * weights.y + z * weights.z;
        }

        void main() {
          float fresnel = abs(dot(normalize(vAtmosphereNormal), normalize(vAtmosphereViewPosition)));
          float shape = triplanarNoise(vAtmosphereNormal, vAtmospherePosition);
          shape *= 1.0 - pow(1.0 - fresnel, 2.0);
          shape *= uShow;
          if (shape < 0.3) discard;
          gl_FragColor = vec4(uColor, 0.434532);
        }
      `,
    });
  }, [noise]);
  const revealStart = useRef<number | null>(null);
  useFrame((state) => {
    if (revealStart.current === null) revealStart.current = state.clock.elapsedTime;
    const elapsed = state.clock.elapsedTime - revealStart.current;
    material.uniforms.uShow.value = Math.sin(clamp01((elapsed - 1.45) / 2.5) * Math.PI * 0.5);
  });
  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
    },
    [geometry, material]
  );
  return <mesh geometry={geometry} material={material} renderOrder={5} />;
}

/** Authored crumpled paper button surface; accessible text/click target stays in the DOM. */
function IntroButtonSurface() {
  const geometry = useDrcGeometry("planets/present/intro/button.drc");
  const displacedGeometry = useMemo(() => {
    const clone = geometry.clone();
    const positions = clone.getAttribute("position");
    const vertexIds = clone.getAttribute("vertid");
    const direction = new Vector3();
    const seed = 0.4371;
    for (let index = 0; index < positions.count; index += 1) {
      direction.fromBufferAttribute(positions, index);
      const length = direction.length();
      if (length === 0) continue;
      const vertexId = vertexIds ? vertexIds.getX(index) : index;
      const randomValue = ((seed * 54.32 + vertexId * 31.2344) % 1 + 1) % 1;
      direction.multiplyScalar(1 + (randomValue * 0.3) / length);
      positions.setXYZ(index, direction.x, direction.y, direction.z);
    }
    positions.needsUpdate = true;
    clone.computeBoundingBox();
    clone.computeBoundingSphere();
    return clone;
  }, [geometry]);
  const groupRef = useRef<Group>(null);
  const camera = useThree((state) => state.camera);
  const material = useMemo(
    () =>
      new ShaderMaterial({
        side: DoubleSide,
        uniforms: {
          uColor: { value: new Color("#f6cf5f") },
          uColor2: { value: new Color("#bd8a42") },
        },
        vertexShader: /* glsl */ `
          varying vec3 vButtonNormal;
          void main() {
            vButtonNormal = normalize(normalMatrix * normal);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: /* glsl */ `
          uniform vec3 uColor;
          uniform vec3 uColor2;
          varying vec3 vButtonNormal;
          void main() {
            float facing = abs(dot(normalize(vButtonNormal), vec3(0.0, 0.0, 1.0)));
            vec3 colorValue = mix(uColor, uColor2, 1.0 - smoothstep(0.2, 0.8, facing));
            gl_FragColor = vec4(colorValue, 1.0);
            #include <colorspace_fragment>
          }
        `,
      }),
    []
  );
  const start = useRef<number | null>(null);
  const forward = useMemo(() => new Vector3(), []);
  const screenUp = useMemo(() => new Vector3(), []);
  useFrame((state) => {
    if (start.current === null) start.current = state.clock.elapsedTime;
    const elapsed = state.clock.elapsedTime - start.current;
    const progress = clamp01((elapsed - 3.3) / 3.25);
    const group = groupRef.current;
    if (!group) return;
    group.quaternion.copy(camera.quaternion);
    group.rotateX(-Math.PI * (1 - elasticOut(progress, 0.5)));
    forward.set(0, 0, -1).applyQuaternion(camera.quaternion);
    screenUp.set(0, 1, 0).applyQuaternion(camera.quaternion);
    const mobileLayout = state.size.width < state.size.height && state.size.width < 700;
    group.position
      .copy(camera.position)
      .addScaledVector(forward, 45)
      .addScaledVector(screenUp, mobileLayout ? -16 : -13.5);
    group.scale.setScalar(elasticOut(progress, 0.9) * (mobileLayout ? 1.5 : 1));
  });
  useEffect(
    () => () => {
      displacedGeometry.dispose();
      material.dispose();
    },
    [displacedGeometry, material]
  );
  return (
    <group ref={groupRef}>
      <mesh geometry={displacedGeometry} material={material} frustumCulled={false} />
    </group>
  );
}

/**
 * The little planet world (planet + trees + water + clouds) gently spins, while
 * the title and starfield stay fixed in space. The camera frames the planet
 * using its decoded bounding sphere and eases in once begun.
 */
export default function IntroScene({
  onBegin,
  onReady,
}: {
  onBegin: () => void;
  onReady?: () => void;
}) {
  void onBegin;
  const world = useRef<Group>(null);
  const camera = useThree((s) => s.camera);
  const planetGeometry = useDrcGeometry("planets/present/intro/planet.drc");
  const atlas = useTexture(publicPath("/assets/images/atlas.png"));
  const terrainNoise = useKtx2Texture("noises-terrain.ktx2");
  const terrainDetail = useKtx2Texture("noise-simplex-layered-pixellated-highq.ktx2");
  configureAtlas(atlas);

  // Fires once the whole Suspense subtree (all intro geometry) has committed.
  useEffect(() => {
    onReady?.();
  }, [onReady]);

  const planetMaterial = useMemo(
    () => createMessengerMaterial(atlas, { fog: false, terrainNoise, terrainDetail }),
    [atlas, terrainDetail, terrainNoise]
  );
  useEffect(() => () => planetMaterial.dispose(), [planetMaterial]);

  useEffect(() => {
    camera.position.set(0, 0, -120);
    camera.up.set(0, 1, 0);
    camera.lookAt(0, -2.5, 0);
  }, [camera]);

  const revealStart = useRef<number | null>(null);
  useFrame((state) => {
    if (revealStart.current === null) revealStart.current = state.clock.elapsedTime;
    const elapsed = state.clock.elapsedTime - revealStart.current;
    const g = world.current;
    if (!g) return;
    const mobileLayout = state.size.width < state.size.height && state.size.width < 700;
    const desiredZoom = mobileLayout ? 0.8 : 1;
    if (camera.zoom !== desiredZoom) {
      camera.zoom = desiredZoom;
      camera.updateProjectionMatrix();
    }
    const rise = quadInOut(clamp01((elapsed - 0.2) / 2.25));
    const scale = quartInOut(clamp01((elapsed - 0.2) / 6.3));
    const turn = quartInOut(clamp01((elapsed - 0.35) / 5.65));
    const tip = quadInOut(clamp01((elapsed - 0.2) / 2));
    const finalRotation = Math.PI * 0.35;
    g.position.y = -80 + 80 * rise;
    g.scale.setScalar(0.3 + 0.7 * scale);
    g.rotation.x = -Math.PI + Math.PI * tip;
    g.rotation.y = finalRotation - Math.PI * 1.5 + Math.PI * 1.5 * turn + elapsed * (Math.PI * 2 / 60);
  });

  return (
    <group>
      <group ref={world}>
        <mesh geometry={planetGeometry} material={planetMaterial} castShadow receiveShadow />
        <AtlasMesh
          path="planets/present/intro/trees.drc"
          atlas={atlas}
          terrainNoise={terrainNoise}
          terrainDetail={terrainDetail}
        />
        <AtlasMesh
          path="planets/present/intro/water.drc"
          atlas={atlas}
          terrainNoise={terrainNoise}
          terrainDetail={terrainDetail}
          cast={false}
        />
        <CloudMesh path="planets/present/intro/clouds.drc" />
        <CurveDecorations includeSmoke={false} />
        <PresentDecorations includeBeach={false} />
      </group>

      <IntroAtmosphere />
      <Title />
      <IntroButtonSurface />
      <Galaxies />
      <IntroParticles path="planets/intro/points.drc" />
      <IntroBirds atlas={atlas} />
    </group>
  );
}
