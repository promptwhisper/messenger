# Multiplayer and rendering validation matrix

## Acceptance method

- Spatial tolerance: remote pose settles within 0.05 world units and 2° of the
  sender after interpolation.
- Timing tolerance: relay cadence 35–70 ms; join/leave 100–250 ms; emoji 1.8–2.2 s.
- Animation / physics tolerance: clip identity and transition order must match;
  animation phase itself may differ because each client has its own render clock.
- Nondeterministic regions: water, blink, NPC motion, camera smoothing, and emoji
  rotation are excluded from strict frame identity.
- Browser baseline: Chromium, 100% zoom, DPR capped by the existing device profile,
  `zh-CN` UI copy, normal motion preference.

| Viewport | State / interaction | Original evidence | Clone evidence | Largest delta | Status |
| --- | --- | --- | --- | --- | --- |
| 1280 x 720 | Intro gate | Live reference capture plus public bundle constants | Live production capture at the same CSS viewport; title is 45 world units from the camera with a +2 screen-up offset; `BEGIN` is 134 × 51 at 72 px from the bottom | The private heading font is unavailable; the button label uses a metrically tuned system fallback | Pass with documented approximation |
| 1280 x 720 | Present opening dialogue | Live three-frame reference sequence and public dialogue constants | Three matching lines, front portrait camera, 710 × 131 paper card, 217 × 73 name tag and overlapping continue control before HUD reveal | Private hand font uses a metrically tuned fallback | Pass with documented approximation |
| 1280 x 720 | Quest checklist | Live reference capture and five public quest descriptions/step counts | Exact text, wrapping, numbering, counts, 395 × 405 paper card and top-right anchor | Private hand font uses a metrically tuned fallback | Pass with documented approximation |
| 1280 x 720 | Present spawn and idle | Exact public spawn coordinates and live reference framing | Avatar starts at `[5.81095, 5.80205, 25.7794]` without normalizing away the authored radius; road, NPCs and follow camera are unobstructed | Dynamic NPC/water frames are not pixel-stable | Pass |
| 1280 x 720 | HUD geometry | Live reference DOM geometry and bundle resize formulas | Quest, sound, wardrobe and emoji buttons measure 65 × 65 at the exact original anchors (`right: 30`; `top: 50`; bottoms 215/132.5/50) | Icon masks are clean-room equivalents | Pass |
| 1280 x 720 | Emoji picker | Live reference DOM geometry and bundle resize formulas | Panel and ten 5 × 2 items match the 320 × 133.8 card, 44.4 px cells and original right/bottom anchors | Preview marks approximate the private icon font | Pass with documented approximation |
| 1280 x 720 | Two-player room | Public bundle protocol behavior | Two production tabs both reached `2 人在线`; the remote avatar rendered in-world; outfit changed from `3-3-4-1` to `4-3-4-1` on the other client | JSON wire encoding is intentionally independent | Pass |
| 1280 x 720 | Remote emoji and leave | Public bundle behavior | Emoji id 7 and its nonce appeared on the other client; closing the second tab changed peer count from 1 to 0 and the HUD from 2 to 1 online | None visible | Pass |
| 390 x 844 | Intro, dialogue, HUD and picker | Bundle responsive constants | Live production capture: mobile title/camera scale, responsive `BEGIN`, portrait dialogue stack, 45 px HUD buttons at right 20, and 280 × 121.6 picker at right 80/bottom 40 | Viewport emulation retained desktop pointer capability, so real touch hardware was not asserted | Pass for responsive layout |
| Desktop production | Reference renderer chain | Public client bundle and reference intro capture | No tone mapping/native AA, LUT 1, SMAA high, 45° camera, authored sky/fog/light/material constants | Custom clean-room shaders replace the reference MRT implementation | Pass |
| Desktop production | Present visual + VFX | Bundle constants and public assets | Terrain, character, NPC, water, waterfall, foam, tree leaves, cables and smoke render without shader errors | Grass/butterfly private-worker instancing remains approximate | Pass with documented approximation |
| Desktop production | Initial outfit | `modelFiles` validation/randomization bundle path | Stored outfits survive reload and are published only after restoration; two same-origin clients synchronized a changed hair selection | Different browser profiles randomize independently | Pass |

## Runtime checks

| Check | Command or evidence | Status | Notes |
| --- | --- | --- | --- |
| Console and network | Two fresh local production tabs | Pass | Zero console/shader errors; only Three.js' upstream `Clock` deprecation warning |
| Renderer audit | `audit-three-project.mjs .` | Pass | Context-loss recovery added after audit; manual rAF belongs to app UI/audio scheduling, not a second render loop |
| Original-host requests | Built-output hostname scan | Pass | Zero reference website or Cloud Run multiplayer host strings in `out/` |
| Lint | `pnpm lint` | Pass | Included in `pnpm check` |
| Typecheck | `pnpm typecheck` | Pass | Included in `pnpm check` |
| Multiplayer tests | `pnpm test:multiplayer` | Pass | Two-decimal normalization, roster/pose/outfit/emoji/leave relay and 16th-player rejection: 3/3 |
| Production build | `pnpm build` | Pass | Next.js static export completed successfully |
| Complete check | `pnpm check` | Pass | ESLint, TypeScript, 3 multiplayer integration tests and production build |
| Built deployment | `pnpm start` local production server | Pass | Static app, same-origin WebSocket, and `/healthz` verified on port 3000 |
