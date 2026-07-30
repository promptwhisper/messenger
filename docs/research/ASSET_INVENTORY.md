# Multiplayer asset inventory

| Role | Local path | Source | Variant / selection | License and attribution |
| --- | --- | --- | --- | --- |
| Ten 3D emoji symbols | `public/assets/geometries/emojis/1.drc` … `10.drc` | `https://messenger.abeto.co/assets/geometries/emojis/{n}.drc` | Selected by picker or `0`–`9` shortcut | Third-party Messenger media; non-commercial study only; see `docs/ASSET_LICENSES.md` |
| Emoji start/end cues | `public/assets/audio/character/emoji-starts1.ogg` … `emoji-ends3.ogg` | `https://messenger.abeto.co/assets/audio/character/emoji-{starts,ends}{n}.ogg` | One of three variants selected by emoji ID | Third-party Messenger media; non-commercial study only; see `docs/ASSET_LICENSES.md` |
| Rendering noise textures | `public/assets/images/{clouds_noise_512,noise-simplex-layered-pixellated-highq,noise-simplex-layered-blur-highq,noises-terrain,water-noises-highq}.ktx2` | Public reference deployment | Sky, terrain, water and VFX material inputs | Same third-party study-only notice |
| Tree-leaf masks | `public/assets/images/tree-leaves*.ktx2` | Public reference deployment | Authored foliage cards | Same third-party study-only notice |
| Present VFX geometry | `public/assets/geometries/planets/present/{waterfall_vfx,waterfallsplash_vfx,waterfall_inlet_vfx,beachfoam_vfx,smoke-1,cables-1,cables-2,tree-leaves_0..4,butterflies}.drc` | Public reference deployment | Present decoration stack and retained butterfly source data | Same third-party study-only notice |
| Intro bird and particle inputs | `public/assets/geometries/birds/*.drc`, `public/assets/images/particle_sprites.ktx2` | Public reference deployment | Intro flight curve, bird mesh and particle sprites | Same third-party study-only notice |
| UI silhouette masks | `public/images/icons/{begin-reference,poo}.svg` | Clean-room SVG reconstruction of observed public controls | `BEGIN` lettering and emoji HUD control | Independent source code; observed design remains subject to the repository rights notice |

The assets are mirrored by `scripts/fetch-multiplayer-assets.mjs` and
`scripts/fetch-rendering-assets.mjs`. Both downloaders validate bounded size,
format signature, retries and atomic writes. Runtime code never requests them
from the reference host.

The WebSocket endpoint is original code and contains no copied server asset,
credential, analytics identifier, or private user data.
