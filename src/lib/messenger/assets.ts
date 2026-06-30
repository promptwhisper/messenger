const APP_BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export function publicPath(path: string): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${APP_BASE_PATH}${normalizedPath}`;
}

export const ASSET_BASE = publicPath("/assets/");
export const GEOMETRY_BASE = publicPath("/assets/geometries/");
export const IMAGE_BASE = publicPath("/assets/images/");
export const AUDIO_BASE = publicPath("/assets/audio/");
export const BASIS_BASE = publicPath("/assets/libs/basis/");
export const DRACO_BASE = publicPath("/assets/libs/draco/");
