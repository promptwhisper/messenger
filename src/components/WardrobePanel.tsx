"use client";

import { type Outfit, type OutfitSlot, SLOT_VARIANTS } from "@/lib/messenger/outfit";
import { play } from "@/lib/messenger/audio";
import { publicPath } from "@/lib/messenger/assets";

// Ordered head-to-toe so each arrow row lines up with the body part it changes,
// matching the original's customization screen.
const SLOTS: { key: OutfitSlot; label: string }[] = [
  { key: "hair", label: "发型" },
  { key: "top", label: "上衣" },
  { key: "bottom", label: "下装" },
  { key: "shoes", label: "鞋子" },
];

export default function WardrobePanel({
  outfit,
  onChange,
  onClose,
}: {
  outfit: Outfit;
  onChange: (next: Outfit) => void;
  onClose: () => void;
}) {
  const cycle = (slot: OutfitSlot, delta: number) => {
    const n = SLOT_VARIANTS[slot];
    const next = ((outfit[slot] - 1 + delta + n) % n) + 1;
    onChange({ ...outfit, [slot]: next });
    void play("ui/customize.ogg", 0.5);
  };

  const close = () => {
    void play("ui/click2.ogg", 0.4);
    onClose();
  };

  return (
    <div className="wardrobe-ov" role="dialog" aria-modal="true" aria-label="换装">
      <button
        type="button"
        className="wardrobe-ov__close"
        onClick={close}
        aria-label="关闭换装"
      >
        <span
          aria-hidden="true"
          className="messenger-hud__icon"
          style={{
            WebkitMaskImage: `url(${publicPath("/images/icons/cross.png")})`,
            maskImage: `url(${publicPath("/images/icons/cross.png")})`,
          }}
        />
      </button>

      <div className="wardrobe-ov__rows">
        {SLOTS.map(({ key, label }) => (
          <div key={key} className="wardrobe-ov__row">
            <button
              type="button"
              className="wardrobe-ov__arrow"
              onClick={() => cycle(key, -1)}
              aria-label={`上一款${label}`}
            >
              <span
                aria-hidden="true"
                className="messenger-hud__icon"
                style={{
                  WebkitMaskImage: `url(${publicPath("/images/icons/arrow.png")})`,
                  maskImage: `url(${publicPath("/images/icons/arrow.png")})`,
                  transform: "scaleX(-1)",
                }}
              />
            </button>
            <button
              type="button"
              className="wardrobe-ov__arrow"
              onClick={() => cycle(key, 1)}
              aria-label={`下一款${label}`}
            >
              <span
                aria-hidden="true"
                className="messenger-hud__icon"
                style={{
                  WebkitMaskImage: `url(${publicPath("/images/icons/arrow.png")})`,
                  maskImage: `url(${publicPath("/images/icons/arrow.png")})`,
                }}
              />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
