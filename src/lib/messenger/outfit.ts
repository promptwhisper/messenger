/** Avatar wardrobe model for the customization UI. */
export type OutfitSlot = "hair" | "top" | "bottom" | "shoes";

export interface Outfit {
  hair: number;
  hairColor: string;
  top: number;
  topColor: string;
  bottom: number;
  bottomColor: string;
  shoes: number;
  shoesColor: string;
}

/** Variant counts per slot (number of `<slot>N.drc` files mirrored). */
export const SLOT_VARIANTS: Record<OutfitSlot, number> = {
  hair: 7,
  top: 9,
  bottom: 7,
  shoes: 7,
};

/** Shared colour swatches for any slot. */
export const OUTFIT_COLORS = [
  "#e7e2d8",
  "#c96b52",
  "#4a8fb0",
  "#6aa05a",
  "#e0b84e",
  "#9c6fb0",
  "#d98aa6",
  "#3a3a3a",
  "#8a5a3a",
  "#ffffff",
];

export const DEFAULT_OUTFIT: Outfit = {
  hair: 1,
  hairColor: "#5a3d28",
  top: 1,
  topColor: "#c96b52",
  bottom: 1,
  bottomColor: "#3c4a63",
  shoes: 1,
  shoesColor: "#2c2825",
};

/** The original stores the five ordered accessory names under `modelFiles`. */
export const OUTFIT_STORAGE_KEY = "modelFiles";

const orderedAccessoryNames = (outfit: Outfit) => [
  "base",
  `hair${outfit.hair}`,
  `top${outfit.top}`,
  `bottom${outfit.bottom}`,
  `shoes${outfit.shoes}`,
];

function randomVariant(slot: OutfitSlot): number {
  return 1 + Math.floor(Math.random() * SLOT_VARIANTS[slot]);
}

export function createRandomOutfit(): Outfit {
  return {
    ...DEFAULT_OUTFIT,
    hair: randomVariant("hair"),
    top: randomVariant("top"),
    bottom: randomVariant("bottom"),
    shoes: randomVariant("shoes"),
  };
}

function outfitFromStored(value: unknown): Outfit | null {
  if (!Array.isArray(value) || value.length !== 5 || value[0] !== "base") return null;
  const slots: OutfitSlot[] = ["hair", "top", "bottom", "shoes"];
  const variants: Partial<Record<OutfitSlot, number>> = {};
  for (let index = 0; index < slots.length; index += 1) {
    const slot = slots[index];
    const match = new RegExp(`^${slot}(\\d+)$`).exec(String(value[index + 1]));
    const variant = Number(match?.[1]);
    if (!Number.isInteger(variant) || variant < 1 || variant > SLOT_VARIANTS[slot]) return null;
    variants[slot] = variant;
  }
  return { ...DEFAULT_OUTFIT, ...(variants as Pick<Outfit, OutfitSlot>) };
}

export function loadOrCreateOutfit(storage: Pick<Storage, "getItem" | "setItem">): Outfit {
  let parsed: unknown = null;
  try {
    const saved = storage.getItem(OUTFIT_STORAGE_KEY);
    parsed = saved ? JSON.parse(saved) : null;
  } catch {
    // Invalid or inaccessible storage follows the original's random fallback.
  }
  const outfit = outfitFromStored(parsed) ?? createRandomOutfit();
  saveOutfit(storage, outfit);
  return outfit;
}

export function saveOutfit(
  storage: Pick<Storage, "setItem">,
  outfit: Outfit
): void {
  try {
    storage.setItem(OUTFIT_STORAGE_KEY, JSON.stringify(orderedAccessoryNames(outfit)));
  } catch {
    // Storage can be disabled; the selected outfit still works for this session.
  }
}
