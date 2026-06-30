/**
 * KTX2 / Basis texture loading via Three's KTX2Loader, pointed at the mirrored
 * Basis transcoder (/assets/libs/basis/). Reuses the original .ktx2 assets.
 */
import type { WebGLRenderer, Texture } from "three";
import { KTX2Loader } from "three/examples/jsm/loaders/KTX2Loader.js";
import { BASIS_BASE } from "@/lib/messenger/assets";

let loader: KTX2Loader | null = null;

export function getKtx2Loader(renderer: WebGLRenderer): KTX2Loader {
  if (!loader) {
    loader = new KTX2Loader().setTranscoderPath(BASIS_BASE);
    loader.detectSupport(renderer);
  }
  return loader;
}

const cache = new Map<string, Promise<Texture>>();

export function loadKtx2(renderer: WebGLRenderer, url: string): Promise<Texture> {
  let cached = cache.get(url);
  if (!cached) {
    cached = getKtx2Loader(renderer).loadAsync(url);
    cache.set(url, cached);
  }
  return cached;
}
