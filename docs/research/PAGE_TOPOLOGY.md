# Multiplayer page topology

## Scope

The multiplayer work extends the existing single-page `Messenger` WebGL experience.
There is no separate lobby, room picker, chat page, or authentication gate in the
reference. Every visitor joins the shared `planet-present` realm after the intro
has completed.

## Layer order

1. Full-viewport WebGL canvas.
2. Present planet, local avatar, remote avatars, NPCs, and transient emoji meshes.
3. Loading and `BEGIN` gates.
4. Right-side HUD. The multiplayer-relevant control is the emoji button.
5. Mutually exclusive wardrobe, emoji picker, and information overlays.
6. Invisible mobile touch zones; the reference does not paint a desktop key legend.

The document itself does not scroll. The canvas and all UI layers are fixed to the
viewport. Pointer drag rotates the camera; keyboard/touch state drives the local
avatar.

## Multiplayer ownership

- `src/lib/messenger/multiplayer/client.ts`: connection lifecycle, shared-room
  membership, local state coalescing, and the externally subscribable roster.
- `src/components/r3f/Avatar.tsx`: authoritative local pose and animation source.
- `src/components/r3f/RemotePlayers.tsx`: remote interpolation, animation,
  wardrobe, join/leave scale transitions, and emoji effects.
- `src/components/EmojiPanel.tsx`: the ten-item emoji picker and keyboard mapping.
- `server/realtime.mjs`: independent WebSocket relay for the shared planet room.

## Responsive states

- Desktop (1440 x 900): 54 px right-side HUD controls, ten-item emoji panel beside
  the HUD, and visible keyboard hints.
- Tablet (about 768 px): the same scene and interaction model with tighter panel
  sizing.
- Mobile (390 x 844): smaller HUD/picker geometry, no desktop key legend, and the
  existing touch movement/jump zones remain active while the emoji panel is closed.
