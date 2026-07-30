# Exact versus approximate decisions

| Subsystem | Decision | Notes |
| --- | --- | --- |
| Shared public planet room | Exact observable behavior | Automatic join after `BEGIN`; no lobby or account gate |
| Player limit | Exact | 15 visible characters including the local avatar |
| Pose cadence | Exact | 35 ms coalesced state relay |
| State fields | Exact in effect | Pose, current animation, outfit, identity, and transient emoji event are synchronized |
| Wire encoding | Approximate internally | Clean JSON protocol replaces the reference's protobuf payload; no visible effect |
| Remote interpolation | Exact in feel | Frame-rate-independent damping matches the reference's 0.4-per-60-Hz-frame position/quaternion interpolation and animation cross-fades |
| Initial outfit | Exact observable behavior | Valid `modelFiles` is restored; otherwise one variant per category is randomized and persisted before Present loads |
| Multiplayer decoration ownership | Exact | Multiplayer starts after the normal Present scene; local and remote characters share one decoration stack |
| Remote avatar rendering | Exact assets and near-exact material | Same skeleton, clips, atlas, eye texture, accessory files, shadow palette, fog and outline family as the local character |
| Renderer / camera / lighting | Exact measured parameters | No tone mapping or native AA; original DPR caps, 45° camera, Present light/shadows, fog colours/density, LUT and SMAA |
| Authored Present VFX | Exact assets, clean-room shaders | Waterfall, splash, inlet, beach foam, tree leaves, cables and smoke reuse public assets and independently rebuilt behavior |
| Grass / butterfly patch expansion | Approximate | Reference instance expansion is private-worker-specific; the remaining authored foliage and terrain retain the scene density |
| Emoji effects and mapping | Exact | Ten original geometries and the observed number-key mapping |
| Emoji picker preview marks | Approximate | Semantic platform emoji stand in for the reference's private icon font; the observed skull/package/ghost/hourglass/search/prohibition/shoe/poo/heart/hand order, shortcuts, panel behavior, and emitted 3D effects are exact |
| Emoji shader | Approximate | Reuses the clean toon/atlas rendering path instead of the reference engine's proprietary batched shader |
| Intro title geometry and framing | Exact public assets and measured placement | Reuses the title Draco geometry and original fixed-distance/screen-up constants |
| Intro and HUD typography | Approximate | The original private heading/icon fonts are not redistributable; tuned local fallbacks preserve measured geometry and hierarchy |
| Intro dialogue | Exact text, sequence and measured layout | The three public dialogue strings, front-facing portrait camera, panel/tag/continue geometry, and HUD handoff match the observed reference sequence; the private dialogue font uses a metrically tuned local fallback |
| Quest/list panel content | Exact public content and measured layout | Uses the five quest descriptions and step counts exposed by the public client bundle, with the observed wrapping, spacing, card geometry, and toggle behavior |
| Multiplayer backend | Independent equivalent | A local/deployable WebSocket relay replaces the reference Cloud Run service |
| Presence labels | Exact | Reference disables player tags, so no names float over avatars |
| Offline UI | Exact | No blocking error surface; the single-player experience remains playable while reconnecting |
