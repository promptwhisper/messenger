# Multiplayer subsystem specification

## Contract

- Name: Present-planet multiplayer and emoji presence
- Target modules: `src/lib/messenger/multiplayer/`,
  `src/components/r3f/RemotePlayers.tsx`, `src/components/EmojiPanel.tsx`,
  `server/realtime.mjs`
- Reference captures: public `Messenger` client bundle dated 2026-07-28;
  1440 x 900 browser triage; responsive constants from the delivered UI code
- Interaction model: time-, network-, keyboard-, click-, and touch-driven
- Exact or approximate: see `EXACT_APPROXIMATE.md`
- Verification path: two-client integration test plus desktop/tablet/mobile local
  browser runs

## Structure and ownership

- The local avatar is authoritative for its position, quaternion, animation, and
  outfit.
- The client coalesces changes and sends no faster than once every 35 ms.
- The server validates and relays state only within `planet-present`, caps the room
  at 15 clients, rate-limits emoji events, and removes abandoned peers.
- Remote renderers keep mutable target state outside React's per-frame render path.
  React updates only for roster, outfit, status, and emoji changes.

## Geometry and appearance

- Coordinate system: the existing present planet's authored world coordinates.
- Remote avatars use the same skeleton, atlas, eye texture, four movement clips,
  painted light/shadow material, restrained outline shell, and accessory variants
  as the local avatar.
- Join/leave uses a short scale transition. Pose samples are interpolated so a
  28.6 Hz network cadence remains visually smooth at render-frame rate.
- Emoji geometry appears above the avatar, grows and shrinks over two seconds,
  rises slightly, and rotates around the avatar's local up axis.

## States and behavior

| State / transition | Trigger | Before | After | Timing / easing | Reset / interruption |
| --- | --- | --- | --- | --- | --- |
| Offline → connecting | Present scene ready | Local-only play | WebSocket attempt | Immediate | Retry with bounded backoff |
| Connecting → online | Welcome packet | No peers | Server roster installed | One packet | Duplicate/stale peers replaced |
| Peer joins | Join packet | No remote object | Scale-in avatar | 150 ms ease-out | Leaving during entry removes it |
| Peer moves | State packet | Previous target | New target pose | 35 ms samples + frame interpolation | Large jumps snap |
| Outfit changes | State packet | Old variants | New accessory paths | Asset readiness | Old accessories dispose on swap |
| Emoji | Click or number key | No effect | Geometry above matching avatar | 2 s | New event supersedes the old one |
| Peer leaves | Close/leave packet | Visible avatar | Scale-out then removal | 150 ms ease-out | Rejoin gets a new session |

## Responsive and performance branches

- Desktop: picker opens beside the right HUD; number keys are active.
- Tablet: same flow, picker constrains itself to the viewport.
- Mobile: picker becomes a compact two-row grid and touch movement is suppressed
  only while a UI overlay is open.
- Reduced motion: pose interpolation remains necessary for networking; decorative
  picker and emoji scale animation is shortened.
- Lower performance: maximum peers stays protocol-compatible, while remote rigs
  reuse cached geometry/textures and avoid React state on pose packets.

## Acceptance criteria

- Two browser clients see one another join, move, turn, change outfit, jump, emit
  every emoji, and leave without refreshing.
- State delivery averages 35 ms or slower and malformed/oversized packets do not
  crash the server.
- A sixteenth connection is rejected as room-full.
- The app stays playable without a configured endpoint.
- No runtime request targets `messenger.abeto.co` or its multiplayer server.
- Lint, typecheck, integration tests, and production build pass.

## Known approximation

- Difference: emoji materials use the clean-room toon/atlas pipeline.
- Reason: the reference implementation's batched shader is engine-coupled and is
  not redistributed.
- Expected impact: geometry, placement, choice, duration, and interaction match;
  subtle shading/noise may differ.
