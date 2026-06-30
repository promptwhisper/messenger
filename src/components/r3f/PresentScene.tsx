"use client";

import { Suspense, useEffect, useMemo, useRef } from "react";
import {
  Group,
  Color,
  Vector3,
  Box3,
  Sphere,
  DataTexture,
  RedFormat,
  NearestFilter,
  ClampToEdgeWrapping,
  SRGBColorSpace,
  MeshStandardMaterial,
  MeshToonMaterial,
  type Texture,
} from "three";
import { useTexture } from "@react-three/drei";
import { mergeBufferGeometries } from "three-stdlib";
import { useDrcGeometry } from "@/lib/messenger/r3f/hooks";
import { type Outfit } from "@/lib/messenger/outfit";
import { publicPath } from "@/lib/messenger/assets";
import Avatar from "./Avatar";
import NpcCharacter from "./NpcCharacter";
import WatercolourSky from "./WatercolourSky";

// Avatar spawn point, taken verbatim from the original presentScene's
// charPosition table (it randomly picks one of two designed open-ground spots).
// Used as a planet-surface direction from the centre, then ray-cast onto terrain.
const SPAWN_DIR = new Vector3(13.169294, 14.457445, 8.112895);
const SPAWN_ROTATION = Math.PI * 0.55;

// All 20 NPCs from the original present scene. Each is placed at its exact
// authored world position with its authored euler rotation (the original does
// `mesh.position.fromArray(pos); mesh.rotation.fromArray(rot)`), instead of
// snapping a normalised direction to the terrain — that lost each NPC's height
// and silently dropped the ones whose ray missed the hull, so the planet looked
// half-empty and the survivors all faced the same way. Two NPCs walk a path
// (`curve`), so they get the walk clip; the rest stand on their idle loop.
const NPC_BASE = "npcs/present";
const D2R = Math.PI / 180;
const deg = (x: number, y: number, z: number) =>
  new Vector3(x, y, z).multiplyScalar(D2R);
const NPC_PLACEMENTS: Array<{
  id: string;
  model: string;
  bones: string;
  clip: string;
  pos: Vector3;
  rot: Vector3;
  curve?: string;
  voice: string;
}> = [
  { id: "office-worker", model: `${NPC_BASE}/office-worker/office-worker-alt.drc`, bones: `${NPC_BASE}/office-worker/office-worker-bones.drc`, clip: `${NPC_BASE}/office-worker/office-worker-walk-alt.drc`, curve: `${NPC_BASE}/tall-man-curve.drc`, pos: new Vector3(27.9744, 1.40907, 0.538691), rot: deg(0, 0, -88.6297), voice: "dialogues/male3.ogg" },
  { id: "office-worker-2", model: `${NPC_BASE}/office-worker/office-worker.drc`, bones: `${NPC_BASE}/office-worker/office-worker-bones.drc`, clip: `${NPC_BASE}/office-worker/office-worker-idle.drc`, pos: new Vector3(26.2539, 9.70977, 1.39919), rot: deg(3.52382, -0.260877, -69.5392), voice: "dialogues/male3.ogg" },
  { id: "chef", model: `${NPC_BASE}/chef/chef.drc`, bones: `${NPC_BASE}/chef/chef-bones.drc`, clip: `${NPC_BASE}/chef/chef-idle.drc`, pos: new Vector3(20.3565, 19.1747, 2.20046), rot: deg(63.916, 41.5698, -67.6105), voice: "dialogues/male2.ogg" },
  { id: "caveman", model: `${NPC_BASE}/caveman/caveman.drc`, bones: `${NPC_BASE}/caveman/caveman-bones.drc`, clip: `${NPC_BASE}/caveman/caveman-idle.drc`, pos: new Vector3(-22.9825, -3.72729, 4.71889), rot: deg(44.1775, 26.6551, 93.4536), voice: "dialogues/male3.ogg" },
  { id: "boss", model: `${NPC_BASE}/boss/boss.drc`, bones: `${NPC_BASE}/boss/boss-bones.drc`, clip: `${NPC_BASE}/boss/boss-idle.drc`, pos: new Vector3(-4.04907, 1.05824, 25.4517), rot: deg(223.52, -619.507, -132.333), voice: "dialogues/male1.ogg" },
  { id: "flower-lady", model: `${NPC_BASE}/young-lady/young-lady.drc`, bones: `${NPC_BASE}/young-lady/young-lady-bones.drc`, clip: `${NPC_BASE}/young-lady/young-lady-idle.drc`, pos: new Vector3(27.4269, 4.65974, 3.58217), rot: deg(283.815, -192.997, -266.012), voice: "dialogues/female2.ogg" },
  { id: "scout", model: `${NPC_BASE}/scout/scout.drc`, bones: `${NPC_BASE}/scout/scout-bones.drc`, clip: `${NPC_BASE}/scout/scout-idle.drc`, pos: new Vector3(-8.91062, -21.1061, 0.906382), rot: deg(62.3308, 62.6945, 119.524), voice: "dialogues/female3.ogg" },
  { id: "threekid", model: `${NPC_BASE}/threekid/threekid.drc`, bones: `${NPC_BASE}/threekid/threekid-bones.drc`, clip: `${NPC_BASE}/threekid/threekid-idle.drc`, pos: new Vector3(30.0128, 18.6118, -4.71063), rot: deg(-194.873, -5.41632, 241.095), voice: "dialogues/female3.ogg" },
  { id: "factory-worker-a", model: `${NPC_BASE}/factory-worker-a/factory-worker-a.drc`, bones: `${NPC_BASE}/factory-worker-a/factory-worker-a-bones.drc`, clip: `${NPC_BASE}/factory-worker-a/factory-worker-a-idle.drc`, pos: new Vector3(4.16546, 4.2699, -23.5919), rot: deg(-108.186, -253.3, 27.7728), voice: "dialogues/male1.ogg" },
  { id: "factory-worker-b", model: `${NPC_BASE}/factory-worker-b/factory-worker-b.drc`, bones: `${NPC_BASE}/factory-worker-b/factory-worker-b-bones.drc`, clip: `${NPC_BASE}/factory-worker-b/factory-worker-b-walk.drc`, curve: `${NPC_BASE}/factory-worker-b/curve-1.drc`, pos: new Vector3(27.9744, 1.40907, 0.538691), rot: deg(0, 0, -88.6297), voice: "dialogues/male1.ogg" },
  { id: "female-scientist", model: `${NPC_BASE}/female-scientist/female-scientist.drc`, bones: `${NPC_BASE}/female-scientist/female-scientist-bones.drc`, clip: `${NPC_BASE}/female-scientist/female-scientist-idle.drc`, pos: new Vector3(-7.46008, -7.60516, -19.6894), rot: deg(-181.522, -289.583, 72.0513), voice: "dialogues/female1.ogg" },
  { id: "factory-worker-c", model: `${NPC_BASE}/factory-worker-c/factory-worker-c.drc`, bones: `${NPC_BASE}/factory-worker-c/factory-worker-c-bones.drc`, clip: `${NPC_BASE}/factory-worker-c/factory-worker-c-idle.drc`, pos: new Vector3(-7.33081, -8.43986, -19.3465), rot: deg(-214.607, -292.8, 99.0508), voice: "dialogues/male1.ogg" },
  { id: "alien", model: `${NPC_BASE}/alien/alien.drc`, bones: `${NPC_BASE}/alien/alien-bones.drc`, clip: `${NPC_BASE}/alien/alien-idle.drc`, pos: new Vector3(-12.6363, 17.6926, -5.86315), rot: deg(-240.935, -412.19, 125.999), voice: "dialogues/wtf.ogg" },
  { id: "male-scientist", model: `${NPC_BASE}/male-scientist/male-scientist.drc`, bones: `${NPC_BASE}/male-scientist/male-scientist-bones.drc`, clip: `${NPC_BASE}/male-scientist/male-scientist-idle.drc`, pos: new Vector3(10.8494, 23.3367, -7.73384), rot: deg(-26.3333, -568.175, 25.2803), voice: "dialogues/male3.ogg" },
  { id: "diver", model: `${NPC_BASE}/diver/diver.drc`, bones: `${NPC_BASE}/diver/diver-bones.drc`, clip: `${NPC_BASE}/diver/diver-idle.drc`, pos: new Vector3(15.8793, 16.9006, 11.2543), rot: deg(27.0449, -548.584, 36.7925), voice: "dialogues/male3.ogg" },
  { id: "mountainman", model: `${NPC_BASE}/mountainman/mountainman.drc`, bones: `${NPC_BASE}/mountainman/mountainman-bones.drc`, clip: `${NPC_BASE}/mountainman/mountainman-idle.drc`, pos: new Vector3(-8.17226, 32.3472, -1.76941), rot: deg(22.0663, -603.63, -31.9016), voice: "dialogues/male3.ogg" },
  { id: "oldwoman", model: `${NPC_BASE}/oldwoman/oldwoman.drc`, bones: `${NPC_BASE}/oldwoman/oldwoman-bones.drc`, clip: `${NPC_BASE}/oldwoman/oldwoman-idle.drc`, pos: new Vector3(23.3711, -16.514, 12.462), rot: deg(100.498, -564.362, 62.4696), voice: "dialogues/female1.ogg" },
  { id: "musician", model: `${NPC_BASE}/musician/musician.drc`, bones: `${NPC_BASE}/musician/musician-bones.drc`, clip: `${NPC_BASE}/musician/musician-idle.drc`, pos: new Vector3(15.0288, -14.7864, -7.09569), rot: deg(-194.842, -580.277, 55.2642), voice: "dialogues/male2.ogg" },
  { id: "fox", model: `${NPC_BASE}/fox/fox.drc`, bones: `${NPC_BASE}/fox/fox-bones.drc`, clip: `${NPC_BASE}/fox/fox-idle.drc`, pos: new Vector3(-8.36976, -20.368, 10.0339), rot: deg(224.014, -796.511, 56.1696), voice: "dialogues/male1.ogg" },
  { id: "owl", model: `${NPC_BASE}/owl/owl.drc`, bones: `${NPC_BASE}/owl/owl-bones.drc`, clip: `${NPC_BASE}/owl/owl-idle.drc`, pos: new Vector3(-12.6002, -22.7506, -2.19052), rot: deg(544.177, -551.047, -23.0782), voice: "dialogues/male1.ogg" },
];

// Original terrain colour: sample the shared 16x16 atlas.png by the geometry UVs
// (the same path the characters use). Nearest + sRGB atlas with a toon ramp
// reproduces the original's flat painted street palette.
function createTerrainMaterial(atlasTex: Texture): MeshToonMaterial {
  const ramp = new Uint8Array([175, 215, 255]);
  const gradient = new DataTexture(ramp, ramp.length, 1, RedFormat);
  gradient.minFilter = NearestFilter;
  gradient.magFilter = NearestFilter;
  gradient.needsUpdate = true;

  atlasTex.wrapS = ClampToEdgeWrapping;
  atlasTex.wrapT = ClampToEdgeWrapping;
  atlasTex.minFilter = NearestFilter;
  atlasTex.magFilter = NearestFilter;
  atlasTex.generateMipmaps = false;
  atlasTex.colorSpace = SRGBColorSpace;
  atlasTex.needsUpdate = true;

  return new MeshToonMaterial({ map: atlasTex, gradientMap: gradient });
}

export default function PresentScene({
  onReady,
  outfit,
  wardrobe = false,
}: {
  onReady?: () => void;
  outfit: Outfit;
  wardrobe?: boolean;
}) {
  // Terrain (10 material chunks), collision hull (5 chunks), water surface.
  const f0 = useDrcGeometry("planets/present/full_0.drc");
  const f1 = useDrcGeometry("planets/present/full_1.drc");
  const f2 = useDrcGeometry("planets/present/full_2.drc");
  const f3 = useDrcGeometry("planets/present/full_3.drc");
  const f4 = useDrcGeometry("planets/present/full_4.drc");
  const f5 = useDrcGeometry("planets/present/full_5.drc");
  const f6 = useDrcGeometry("planets/present/full_6.drc");
  const f7 = useDrcGeometry("planets/present/full_7.drc");
  const f8 = useDrcGeometry("planets/present/full_8.drc");
  const f9 = useDrcGeometry("planets/present/full_9.drc");
  const full = useMemo(
    () => [f0, f1, f2, f3, f4, f5, f6, f7, f8, f9],
    [f0, f1, f2, f3, f4, f5, f6, f7, f8, f9]
  );

  const h0 = useDrcGeometry("planets/present/hitmesh_0.drc");
  const h1 = useDrcGeometry("planets/present/hitmesh_1.drc");
  const h2 = useDrcGeometry("planets/present/hitmesh_2.drc");
  const h3 = useDrcGeometry("planets/present/hitmesh_3.drc");
  const h4 = useDrcGeometry("planets/present/hitmesh_4.drc");
  const hit = useMemo(() => [h0, h1, h2, h3, h4], [h0, h1, h2, h3, h4]);

  const waterGeometry = useDrcGeometry("planets/present/water.drc");
  const atlasTex = useTexture(publicPath("/assets/images/atlas.png"));

  useEffect(() => {
    onReady?.();
  }, [onReady]);

  const terrainMaterial = useMemo(() => createTerrainMaterial(atlasTex), [atlasTex]);

  const waterMaterial = useMemo(() => {
    waterGeometry.computeVertexNormals();
    return new MeshStandardMaterial({
      color: new Color("#4ea3c8"),
      transparent: true,
      opacity: 0.78,
      roughness: 0.15,
      metalness: 0.1,
    });
  }, [waterGeometry]);

  const { center, radius } = useMemo(() => {
    const box = new Box3();
    for (const g of full) {
      g.computeBoundingBox();
      if (g.boundingBox) box.union(g.boundingBox);
    }
    const sphere = new Sphere();
    box.getBoundingSphere(sphere);
    return { center: sphere.center.clone(), radius: sphere.radius };
  }, [full]);

  // Static-mesh batching: the 10 terrain chunks all share one material and the
  // 5 collision-hull chunks are a single invisible target, so we merge each set
  // into one BufferGeometry. That collapses 10 terrain draw calls into 1 and
  // lets the avatar's ground ray test a single object instead of 5. (If the
  // chunks ever had mismatched attributes, merge returns null and we fall back
  // to the per-chunk meshes below.)
  const terrainMerged = useMemo(() => mergeBufferGeometries(full, false), [full]);
  const hullMerged = useMemo(() => mergeBufferGeometries(hit, false), [hit]);

  // Release the merged GPU buffers the moment the scene unmounts (the source
  // chunk geometries are owned/cached by the loader, so we only free our copies).
  useEffect(() => {
    return () => {
      terrainMerged?.dispose();
      hullMerged?.dispose();
    };
  }, [terrainMerged, hullMerged]);

  const collisionRef = useRef<Group>(null);

  return (
    <group>
      <fog attach="fog" args={["#c2d6ce", 60, 240]} />
      <WatercolourSky />

      {terrainMerged ? (
        <mesh geometry={terrainMerged} material={terrainMaterial} castShadow={false} receiveShadow={false} />
      ) : (
        full.map((g, i) => (
          <mesh key={`t${i}`} geometry={g} material={terrainMaterial} castShadow={false} receiveShadow={false} />
        ))
      )}

      <mesh geometry={waterGeometry} material={waterMaterial} renderOrder={1} />

      {/* Invisible collision hull; still hit by the avatar's ground raycast. */}
      <group ref={collisionRef} visible={false}>
        {hullMerged ? (
          <mesh geometry={hullMerged} />
        ) : (
          hit.map((g, i) => <mesh key={`h${i}`} geometry={g} />)
        )}
      </group>

      <Avatar
        center={center}
        radius={radius}
        surface={collisionRef}
        outfit={outfit}
        initialDir={SPAWN_DIR}
        initialRotation={SPAWN_ROTATION}
        wardrobe={wardrobe}
      />

      {NPC_PLACEMENTS.map((npc) => (
        <Suspense key={npc.id} fallback={null}>
          <NpcCharacter
            id={npc.id}
            model={npc.model}
            bones={npc.bones}
            clip={npc.clip}
            pos={npc.pos}
            rot={npc.rot}
            curve={npc.curve}
            center={center}
            voice={npc.voice}
          />
        </Suspense>
      ))}
    </group>
  );
}
