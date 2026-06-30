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
    return { tier: "high", dpr: [1, 2], shadowMapSize: 4096, touch: false };
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
    // Phones: cap pixel ratio harder to save fill-rate.
    return { tier: "low", dpr: [1, 1.5], shadowMapSize: 2048, touch };
  }
  return { tier: "high", dpr: [1, 2], shadowMapSize: 4096, touch };
}
