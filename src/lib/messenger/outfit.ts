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
