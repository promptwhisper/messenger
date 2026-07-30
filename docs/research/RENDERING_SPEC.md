# Rendering parity specification

## Reference answer: multiplayer initialization

The reference does not create a second, reduced decoration set for multiplayer.
It first builds the normal Present scene (water, waterfall, beach foam, cables,
smoke, sky, ground vegetation, butterflies, tree leaves, birds, and NPCs), then
connects the character room after the Present play-in sequence. Remote players
therefore inhabit the same decorated scene as single-player exploration.

Character accessories are a separate initialization rule. The ordered set is
`base`, one of seven hairstyles, one of nine tops, one of seven bottoms, and one
of seven shoe variants. A valid set is restored from `localStorage.modelFiles`;
otherwise every variable slot is selected randomly and the set is saved. Remote
clients receive those exact variant names.

## Measured rendering contract

| Layer | Reference parameter | Rebuild |
| --- | --- | --- |
| Renderer | alpha off, native AA off, stencil off, depth off, no tone mapping | Same; Three r184's effective PCF mode selected directly |
| Resolution | DPR cap 1.15 for normal displays, 1.5 above DPR 2; adaptive | Same caps with a 0.75 emergency lower bound |
| Camera | 45° FOV; Present near/far 0.2/175; relative position `(0,1,5)`; target offset `(-0.65,0,1)` | Same projection, distance, height, lateral target offset and follow rate |
| Present light | White directional intensity 3; 2400 shadow map (1024 mobile); ±24 shadow camera; normal bias 0.07; bias -0.0001 | Same, following the local character |
| Fog | near `#93a2bf`, far `#9ea7b8`, distance 0.8, density 0.011 | Same two-colour exponential material fog |
| Sky | radius 55; `#75bdc3`, `#9fe2e0`, `#b9ebea`; authored 512px cloud noise; 0.9 parallax | Same shader inputs and parallax behavior |
| Surface shading | Atlas nearest/sRGB; painted HSV shadow (hue −0.02, value ×0.5); hard character cutoff | Same shared material path; terrain adds the two authored noise textures |
| Water | `#4c868c`, `#437a7f`, waves `#366a6f`, `#6facb2`; authored water noise | Same palette and animated noise family |
| Outline | `#363a3c`, one-pixel scale, fade 5–80, depth start 0.0001, normal range 0.4–0.5 | Four-neighbour depth/normal implementation with the same visible thresholds |
| Grade / AA | 3D LUT intensity 1, then high-quality SMAA | Same; the earlier invented full-screen paper grain is neutral in the reference preset |

## Restored authored decoration layers

- Waterfall body, splash, inlet foam and beach wave geometry with authored noise
  textures and palette constants.
- Five authored tree-leaf geometry groups and their two mask textures.
- Authored cable and smoke curve geometry with screen-space thickness.
- Present terrain, water, NPCs, local character, remote characters, and emoji
  effects remain in their established scene order.

Butterfly and individual grass-blade instancing remain a clean-room behavioral
approximation because the reference packs their instance patch expansion into a
private worker format. Their locations are still represented by the authored
terrain and foliage layers; no reference client code is redistributed.

## Performance policy

- Static terrain and collision chunks are merged.
- Geometry and textures use the existing shared Suspense caches.
- Native MSAA is disabled; one SMAA pass handles edge cleanup.
- Low-tier devices retain silhouette outlines but skip the normal-buffer pass.
- Sustained frame rate controls DPR within the reference cap instead of removing
  multiplayer participants or gameplay systems.
- The canvas exposes rolling `data-render-fps` and `data-render-dpr` values for
  browser regression checks and handles WebGL context loss/restoration.
