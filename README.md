<p align="center">
  <img src="./assets/readme/hero.svg" width="100%" alt="Messenger is an interactive 3D delivery journey across tiny planets and their inhabitants">
</p>

# Messenger

**A browser-based 3D delivery journey rebuilt with Next.js, React Three Fiber, and Three.js.**

[Enter the live experience](https://promptwhisper.github.io/messenger/) · [View source](https://github.com/promptwhisper/messenger)

Walk across a small planet with other visitors, meet animated characters, change your outfit, and explore a responsive WebGL world with sound, collision, and camera-relative movement.

## Controls

| Desktop | Action |
| --- | --- |
| `WASD` or arrow keys | Move |
| `Shift` | Sprint |
| `Space` | Jump |
| `E` | Interact |
| `0`–`9` | Send a 3D emoji |
| Pointer drag | Rotate the camera |
| Mouse wheel | Zoom |

Touch devices receive an on-screen analog stick with sprint on the outer ring plus a dedicated jump button.

## What is rebuilt

- animated intro and interactive planet;
- playable character with walking, sprinting, jumping, gravity, and a follow camera;
- terrain collision and animated NPC paths;
- outfit customization and multiple visual styles;
- reference-matched camera, painted shadow palette, two-colour fog, cloud sky,
  water, foliage and environmental VFX;
- automatic shared-room multiplayer for up to 15 visitors;
- synchronized position, facing, animation, outfit, join/leave transitions, and 3D emoji reactions;
- positional dialogue, music, sound effects, and UI audio;
- responsive desktop and mobile input;
- tiered DPR, shadow, and touch settings for different devices.

The runtime is an independent React Three Fiber implementation. The original website's compiled application code is not included.

## Run locally

Requirements: Node.js 24+ and pnpm 11.

```bash
pnpm install
pnpm dev
```

Open <http://localhost:3000>. The development command starts both the Next.js
app and its WebSocket relay; a second browser tab joins the same planet room.

Run the complete repository check:

```bash
pnpm check
```

Or execute each stage separately:

```bash
pnpm lint
pnpm typecheck
pnpm test:multiplayer
pnpm build
```

## Architecture at a glance

```text
keyboard / touch                         browser peers
       ↓                                      ↕
shared input state                 WebSocket room relay
       ↓                                      ↕
avatar + spherical movement ── pose / outfit / emoji
       ↓
camera, collision, NPCs, audio, post-processing
```

| Layer | Technology |
| --- | --- |
| Application | Next.js 16, React 19, TypeScript |
| 3D runtime | Three.js, React Three Fiber, drei |
| Multiplayer | Node.js HTTP + `ws`, same-origin WebSocket in production |
| Visual finish | React Three Postprocessing |
| Styling | Tailwind CSS |
| Assets | Draco geometry, textures, LUT data, fonts, and OGG audio |

## Production deployment

The production server hosts the static export and WebSocket endpoint on one
port, so no extra environment variable is needed for a normal Node deployment:

```bash
pnpm build
pnpm start
```

`PORT` defaults to `3000`. Static files and the `/realtime` WebSocket endpoint
share one origin; `/healthz` provides a small JSON health check.

GitHub Pages can only host the static frontend. To retain multiplayer there,
deploy `server/realtime.mjs` on a WebSocket-capable service, then build the
frontend with its public secure endpoint:

```bash
NEXT_PUBLIC_MULTIPLAYER_URL=wss://example.com/realtime GITHUB_PAGES=true pnpm build
```

Without that variable, the Pages build remains fully playable offline and
shows the multiplayer control as disconnected.

## Mirrored study assets

The multiplayer reactions and clean-room rendering inputs can be fetched
idempotently from the public reference deployment:

```bash
node scripts/fetch-multiplayer-assets.mjs
pnpm assets:rendering
```

The downloader validates response status, type, size, and checksum before an
atomic write. These files remain third-party study assets under the rights
notice below.

## GitHub Pages

The repository includes a GitHub Pages workflow. Pushes to `main` create and
publish a static export. Configure `NEXT_PUBLIC_MULTIPLAYER_URL` during that
build if a separately deployed relay should be used.

## Independent study and asset rights

This is an independent, non-commercial technical study created for learning and demonstration. It is not affiliated with, endorsed by, or an official release of the [original experience](https://messenger.abeto.co/).

本项目为独立的非商业学习与技术研究作品，仅用于学习、交流和演示；与原网站及其创作者不存在隶属、授权或官方合作关系。

All trademarks, visual designs, models, textures, audio, and other third-party materials belong to their respective owners. Do not use those materials for commercial sale, paid redistribution, or another purpose not permitted by the relevant rights holder. If content infringes your rights, please open an issue for review and removal.

所有商标、视觉设计、模型、贴图、音频及其他第三方素材的权利均归其各自权利人所有。如相关内容侵犯了你的合法权益，请提交 Issue 联系处理，核实后将及时修改或删除。

## License

Original source code in this repository is available under the [MIT License](LICENSE). That license does not grant rights to third-party assets, branding, or content. See [the asset notes](docs/ASSET_LICENSES.md) for details.
