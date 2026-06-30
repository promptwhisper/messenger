# Messenger

A browser-based 3D delivery experience rebuilt with Next.js, React, and
Three.js.

This project recreates the atmosphere and core interaction of Messenger as an
independent technical study. The runtime is a React Three Fiber implementation;
the original website's compiled application code is not included.

## Features

- Interactive WebGL planet with an animated intro.
- Playable character with walking, sprinting, jumping, and follow camera.
- Terrain collision and animated NPCs.
- Outfit customization and multiple visual styles.
- Positional interactions, music, sound effects, and touch controls.
- Responsive desktop and mobile presentation.

## Tech Stack

- Next.js 16
- React 19
- TypeScript
- Three.js and React Three Fiber
- Postprocessing
- Tailwind CSS

## Development

```bash
pnpm install
pnpm dev
```

Open `http://localhost:3000`.

Useful checks:

```bash
pnpm lint
pnpm typecheck
pnpm build
pnpm check
```

## Deployment

The repository includes a GitHub Pages workflow. Pushes to `main` create a
static export and deploy it automatically.

Production URL:

https://promptwhisper.github.io/messenger/

## Disclaimer / 免责声明

This is an independent, non-commercial study and technical demonstration
created for learning and research only. It is not affiliated with, endorsed by,
or an official release of the original website or its creators.

本项目为独立的非商业学习与技术研究作品，仅用于学习、交流和演示。项目与原网站及其
创作者不存在隶属、授权或官方合作关系。请勿将本项目及其中的第三方素材用于侵权、
商业销售、付费分发或其他未经权利人许可的用途。

Original experience / 原站地址:

https://messenger.abeto.co/

All trademarks, visual designs, models, textures, audio, and other third-party
materials belong to their respective owners. If any content infringes your
rights, please open an issue and it will be reviewed and removed promptly.

所有商标、视觉设计、模型、贴图、音频及其他第三方素材的权利均归其各自权利人所有。
如相关内容侵犯了您的合法权益，请提交 Issue 联系处理，核实后将及时修改或删除。

## License

The original source code in this repository is available under the MIT License.
See `LICENSE`. The license does not grant rights to third-party assets, branding,
or content. See `docs/ASSET_LICENSES.md` for details.
