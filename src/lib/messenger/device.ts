// Lightweight device-capability tiering, used to scale render cost to the
// hardware: the resolution we render at (devicePixelRatio cap) and the shadow
// map resolution. "low" covers phones / weak GPUs / low-core or low-memory
// machines; everything else is "high".

export type DeviceTier = "high" | "low";

export interface DeviceProfile {
  tier: DeviceTier;
  /** [min, max] pixel-ratio clamp for the <Canvas dpr>. */
  dpr: [number, number];
  /** Directional-light shadow map size (4K on desktop, 2K on low-end). */
  shadowMapSize: number;
  /** Touch device → show on-screen joystick + drop expensive post-processing. */
  touch: boolean;
}

export function getDeviceProfile(): DeviceProfile {
  if (typeof navigator === "undefined" || typeof window === "undefined") {
    return { tier: "high", dpr: [0.75, 1.15], shadowMapSize: 2400, touch: false };
  }

  // Headless multiplayer capture renders two live WebGL clients at once. The
  // default capture mode trades internal resolution for smoothness; the HD
  // mode keeps a true 1:1 render buffer so exported proof footage remains
  // sharp after it is placed into a vertical composition. Both modes are
  // opt-in and never change the normal visitor experience.
  const captureMode = new URLSearchParams(window.location.search).get("capture");
  if (captureMode === "hd") {
    return { tier: "low", dpr: [1, 1], shadowMapSize: 1024, touch: false };
  }
  if (captureMode === "1") {
    return { tier: "low", dpr: [0.55, 0.65], shadowMapSize: 512, touch: false };
  }

  const ua = navigator.userAgent || "";
  const isMobile = /Android|iPhone|iPad|iPod|Mobile|Silk/i.test(ua);

  // navigator.deviceMemory / hardwareConcurrency are not in every lib.dom; read
  // them defensively.
  const nav = navigator as Navigator & {
    deviceMemory?: number;
    hardwareConcurrency?: number;
  };
  const lowMemory = typeof nav.deviceMemory === "number" && nav.deviceMemory <= 4;
  const lowCores =
    typeof nav.hardwareConcurrency === "number" && nav.hardwareConcurrency <= 4;
  const coarsePointer =
    typeof window.matchMedia === "function" &&
    window.matchMedia("(pointer: coarse)").matches;
  const touch =
    coarsePointer || isMobile || (navigator.maxTouchPoints ?? 0) > 0;

  const low = isMobile || lowMemory || lowCores || coarsePointer;
  if (low) {
    // The original uses 1024px shadows on iPhone-class devices.
    return { tier: "low", dpr: [0.75, 1], shadowMapSize: 1024, touch };
  }
  // Original cap: 1.15 for DPR <= 2, otherwise 1.5. The lower bound is used
  // only by our adaptive fallback when sustained frame time drops.
  const maxDpr = window.devicePixelRatio <= 2 ? 1.15 : 1.5;
  return { tier: "high", dpr: [0.75, maxDpr], shadowMapSize: 2400, touch };
}
