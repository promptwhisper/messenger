"use client";

import {
  EMOJI_COUNT,
  EMOJI_SHORTCUTS,
} from "@/lib/messenger/multiplayer/protocol";

// The picker mirrors the reference's ten choices and order. The emitted
// in-world effects use the corresponding authored 3D geometry assets.
const LABELS = ["💀", "📦", "👻", "⌛", "🔎", "🚫", "👠", "💩", "🩵", "✋"];

export default function EmojiPanel({
  onSelect,
  onClose,
}: {
  onSelect: (id: number) => void;
  onClose: () => void;
}) {
  return (
    <>
      <button
        type="button"
        className="emoji-panel__backdrop"
        aria-label="关闭表情"
        onClick={onClose}
      />
      <div className="emoji-panel" role="dialog" aria-label="表情">
        {Array.from({ length: EMOJI_COUNT }, (_, id) => (
          <button
            type="button"
            className="emoji-panel__item"
            key={id}
            onClick={() => onSelect(id)}
            aria-label={`表情 ${id + 1}`}
            title={`表情 ${id + 1} · 快捷键 ${EMOJI_SHORTCUTS[id]}`}
          >
            <span aria-hidden="true">{LABELS[id]}</span>
            <kbd aria-hidden="true">{EMOJI_SHORTCUTS[id]}</kbd>
          </button>
        ))}
      </div>
    </>
  );
}
