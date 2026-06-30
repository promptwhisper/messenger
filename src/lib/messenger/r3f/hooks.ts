import { useThree } from "@react-three/fiber";
import type { BufferGeometry, Texture } from "three";
import { loadDrc } from "@/lib/messenger/loaders/draco";
import { loadKtx2 } from "@/lib/messenger/loaders/ktx2";
import { GEOMETRY_BASE, IMAGE_BASE } from "@/lib/messenger/assets";
import { suspend } from "./resources";

/** Suspense hook: decoded BufferGeometry for a `.drc` under /assets/geometries/. */
export function useDrcGeometry(path: string): BufferGeometry {
  return suspend(`drc:${path}`, () => loadDrc(GEOMETRY_BASE + path));
}

/** Suspense hook: KTX2 Texture for a file under /assets/images/. */
export function useKtx2Texture(path: string): Texture {
  const gl = useThree((s) => s.gl);
  return suspend(`ktx2:${path}`, () => loadKtx2(gl, IMAGE_BASE + path));
}
