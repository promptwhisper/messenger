"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useTexture } from "@react-three/drei";
import {
  Group,
  Color,
  Vector3,
  Mesh,
  MeshToonMaterial,
  MeshBasicMaterial,
  PointsMaterial,
  ShaderMaterial,
  AdditiveBlending,
  CustomBlending,
  SrcAlphaFactor,
  OneFactor,
  ZeroFactor,
  DoubleSide,
  RepeatWrapping,
  SRGBColorSpace,
  ClampToEdgeWrapping,
  NearestFilter,
  DataTexture,
  RedFormat,
  BufferGeometry,
  BufferAttribute,
  type Texture,
  type PerspectiveCamera,
} from "three";
import { useDrcGeometry, useKtx2Texture } from "@/lib/messenger/r3f/hooks";
import { publicPath } from "@/lib/messenger/assets";

// Shared 3-step toon ramp (same flat hand-drawn shading the characters use).
const TOON_RAMP = (() => {
  const ramp = new Uint8Array([150, 205, 255]);
  const tex = new DataTexture(ramp, ramp.length, 1, RedFormat);
  tex.minFilter = NearestFilter;
  tex.magFilter = NearestFilter;
  tex.needsUpdate = true;
  return tex;
})();

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
  cast = true,
  receive = true,
}: {
  path: string;
  atlas: Texture;
  cast?: boolean;
  receive?: boolean;
}) {
  const geometry = useDrcGeometry(path);
  const material = useMemo(
    () => new MeshToonMaterial({ map: atlas, gradientMap: TOON_RAMP }),
    [atlas]
  );
  return (
    <mesh geometry={geometry} material={material} castShadow={cast} receiveShadow={receive} />
  );
}

/** Clouds: flat off-white (`cloudMaterial` uColor #F8F8F8 in the original). */
function CloudMesh({ path }: { path: string }) {
  const geometry = useDrcGeometry(path);
  const material = useMemo(
    () => new MeshToonMaterial({ color: new Color("#f8f8f8"), gradientMap: TOON_RAMP }),
    []
  );
  return <mesh geometry={geometry} material={material} />;
}

/** Point-cloud from a `.drc` (the faint starfield). */
function DrcPoints({
  path,
  size = 0.025,
  color = "#ffffff",
  additive = false,
}: {
  path: string;
  size?: number;
  color?: string;
  additive?: boolean;
}) {
  const geometry = useDrcGeometry(path);
  const material = useMemo(() => {
    const mat = new PointsMaterial({
      size,
      sizeAttenuation: true,
      color: new Color(color),
      vertexColors: Boolean(geometry.getAttribute("color")),
      transparent: true,
      depthWrite: false,
    });
    if (additive) mat.blending = AdditiveBlending;
    return mat;
  }, [geometry, size, color, additive]);
  return <points geometry={geometry} material={material} />;
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
}: {
  geometry: BufferGeometry;
  material: MeshBasicMaterial;
  position: [number, number, number];
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

  useFrame((_, dtRaw) => {
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
      m.rotation.set(s.rotX, s.rotY, 0);
      m.scale.setScalar(s.scale);
    }
  });

  return (
    <mesh
      ref={ref}
      geometry={geometry}
      material={material}
      position={position}
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
function Title({ radius }: { radius: number }) {
  const geometry = useDrcGeometry("planets/present/intro/title_vertical.drc");
  const camera = useThree((s) => s.camera) as PerspectiveCamera;
  const groupRef = useRef<Group>(null);

  const material = useMemo(
    () => new MeshBasicMaterial({ color: new Color("#f6f4ec"), side: DoubleSide }),
    []
  );
  const letters = useMemo(() => splitByBatchId(geometry), [geometry]);

  const dist = radius * 0.42;

  // Scale so the title fills a fixed fraction of the view at `dist`.
  const fillScale = useMemo(() => {
    let minY = Infinity;
    let maxY = -Infinity;
    letters.forEach((g, i) => {
      g.computeBoundingBox();
      const b = g.boundingBox!;
      const py = -(Math.floor(i / 3) - 1) * TITLE_GY;
      minY = Math.min(minY, b.min.y + py);
      maxY = Math.max(maxY, b.max.y + py);
    });
    const h = maxY - minY || 1;
    const visH = 2 * dist * Math.tan(((camera.fov || 68) * Math.PI) / 360);
    return (visH * 0.52) / h;
  }, [letters, dist, camera]);

  const fwd = useMemo(() => new Vector3(), []);
  useFrame(() => {
    const g = groupRef.current;
    if (!g) return;
    g.quaternion.copy(camera.quaternion);
    fwd.set(0, 0, -1).applyQuaternion(camera.quaternion);
    g.position.copy(camera.position).addScaledVector(fwd, dist);
    g.scale.setScalar(fillScale);
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

  useFrame((state) => {
    material.uniforms.uTime.value = state.clock.elapsedTime;
    const u = material.uniforms.uShow;
    if (u.value < 1) u.value = Math.min(1, u.value + 0.02);
  });

  return <primitive object={mesh} />;
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
  configureAtlas(atlas);

  // Fires once the whole Suspense subtree (all intro geometry) has committed.
  useEffect(() => {
    onReady?.();
  }, [onReady]);

  const planetMaterial = useMemo(
    () => new MeshToonMaterial({ map: atlas, gradientMap: TOON_RAMP }),
    [atlas]
  );

  const { radius, center } = useMemo(() => {
    planetGeometry.computeBoundingSphere();
    const sphere = planetGeometry.boundingSphere;
    return {
      radius: sphere?.radius ?? 1,
      center: sphere?.center.clone() ?? new Vector3(),
    };
  }, [planetGeometry]);

  const target = useMemo(() => new Vector3(), []);

  useFrame((state, dt) => {
    if (world.current) world.current.rotation.y += dt * 0.08;
    const dist = radius * 1.45;
    const height = radius * 0.32;
    const sway = Math.sin(state.clock.elapsedTime * 0.15) * radius * 0.1;
    target.set(center.x + sway, center.y + height, center.z + dist);
    camera.position.lerp(target, Math.min(1, dt * 1.5));
    camera.lookAt(center.x, center.y + radius * 0.05, center.z);
  });

  return (
    <group>
      <group ref={world}>
        <mesh geometry={planetGeometry} material={planetMaterial} castShadow receiveShadow />
        <AtlasMesh path="planets/present/intro/trees.drc" atlas={atlas} />
        <AtlasMesh path="planets/present/intro/water.drc" atlas={atlas} cast={false} />
        <CloudMesh path="planets/present/intro/clouds.drc" />
      </group>

      <Title radius={radius} />
      <Galaxies />
      <DrcPoints path="planets/intro/points.drc" size={0.02} color="#ffffff" />
    </group>
  );
}
