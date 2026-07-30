# Multiplayer behavior record

## Reference evidence

The public reference at `https://messenger.abeto.co/` currently loads
`webgl-CS4l6lxD.js` and `App3D-DwM1eiaC.js`. Bounded inspection of the delivered
client shows a `MicroRealmConnection`, a shared `planet-present` room prefix, a
15-character render limit, a 35 ms relay interval, and a ten-item emoji system.
The captured bundles are research evidence only and are not included in this
repository.

## Interaction sweep

| Subsystem | Model | Trigger | Observable result | Timing / reset |
| --- | --- | --- | --- | --- |
| Connect | time + state | Complete the intro | Join the shared present-planet room | Connect once the playable scene starts; reconnect after interruption |
| Remote movement | network | Another player moves | Their avatar moves and rotates over the terrain | Updates around every 35 ms; interpolate between samples |
| Remote animation | network | Idle, walk/run, sprint, jump/air | Matching remote clip plays | Cross-fade rather than snap |
| Remote wardrobe | click + network | A player changes hair/top/bottom/shoes | Other clients load the same accessory variants | Persist until changed or the player leaves |
| Join | network | A new client enters | A remote avatar appears | Scale in over about 150 ms |
| Leave | network | Socket closes or client changes room | The remote avatar disappears | Scale out over about 150 ms |
| Emoji picker | click | Press the HUD emoji button | Ten choices appear; conflicting overlays close | Toggle; clicking away or opening another overlay closes it |
| Emoji shortcut | keyboard | Press `0` through `9` | Broadcast the mapped emoji | Rate-limited to one every 350 ms |
| Emoji effect | network | Local or remote emoji event | A symbol appears above that avatar | Roughly 2 seconds; near-player cue only |
| Visibility | browser state | Tab becomes hidden/visible | Connection pauses and rejoins | Remote roster is reconciled on reconnect |

## Reference constants

- Realm prefix: `planet-present`.
- Requested room: empty, resulting in one public shared realm.
- Maximum visible characters: 15 total (local plus 14 remote).
- Network relay interval: 35 ms.
- Position and rotation values: rounded to two decimal places before relay.
- Remote interpolation defaults: position `0.4`, rotation `0.4`, animation `0.1`.
- Join/leave scale transition: approximately 150 ms.
- Emoji count: 10.
- Emoji keyboard mapping: `1→2`, `2→0`, `3→1`, `4→8`, `5→5`, `6→6`,
  `7→7`, `8→9`, `9→3`, `0→4` (zero-based geometry IDs).
- Emoji duration: 2 seconds; rate limit: 350 ms; maximum presentation distance:
  20 world units; nearby audio radius: 3 world units.
