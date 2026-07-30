"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { NoToneMapping } from "three";
import { getDeviceProfile } from "@/lib/messenger/device";
import { EffectComposer, SMAA } from "@react-three/postprocessing";
import { PerformanceMonitor } from "@react-three/drei";
import { SMAAPreset } from "postprocessing";
import IntroScene from "./IntroScene";
import PresentScene from "./PresentScene";
import OutlineEdge from "./effects/OutlineEdge";
import Lut3D from "./effects/Lut3D";
import PaperGrain from "./effects/PaperGrain";
import WardrobePanel from "@/components/WardrobePanel";
import TouchControls from "@/components/TouchControls";
import EmojiPanel from "@/components/EmojiPanel";
import {
  type Outfit,
  DEFAULT_OUTFIT,
  loadOrCreateOutfit,
  saveOutfit,
} from "@/lib/messenger/outfit";
import { play, playMusic, unlockAudio, setMuted } from "@/lib/messenger/audio";
import { publicPath } from "@/lib/messenger/assets";
import { multiplayer } from "@/lib/messenger/multiplayer/client";
import { useMultiplayerSnapshot } from "@/lib/messenger/multiplayer/hooks";
import { EMOJI_KEY_MAP } from "@/lib/messenger/multiplayer/protocol";
import MessengerLighting from "./MessengerLighting";
import RenderMetrics from "./RenderMetrics";

// White PNG icons are used as CSS masks so each takes the button's currentColor
// and inverts on the active state. Fullscreen uses a currentColor line icon.
function MaskIcon({ src }: { src: string }) {
  return (
    <span
      aria-hidden="true"
      className="messenger-hud__icon"
      style={{ WebkitMaskImage: `url(${src})`, maskImage: `url(${src})` }}
    />
  );
}

const ICONS = {
  shirt: <MaskIcon src={publicPath("/images/icons/t-shirt.png")} />,
  soundOn: <MaskIcon src={publicPath("/images/icons/sound.png")} />,
  soundOff: <MaskIcon src={publicPath("/images/icons/sound-muted.png")} />,
  info: <MaskIcon src={publicPath("/images/icons/list.png")} />,
  emoji: <MaskIcon src={publicPath("/images/icons/poo.svg")} />,
};

const INTRO_DIALOGUE = [
  "Looks like I slept in... I better start today's deliveries.",
  "I've got five on the list. Hopefully they're easy to find.",
  "Alright, I better get going.",
] as const;

const QUEST_CHECKLIST = [
  { key: "employee", lines: ["Falling off the corporate", "ladder (0/3)"] },
  { key: "caveman", lines: ["A man who's hiding from", "something (0/3)"] },
  { key: "scientists", lines: ["Scientists and mixed-up", "deliveries (0/3)"] },
  { key: "temple", lines: ["An offering to the mountain", "temple (0/2)"] },
  { key: "musician", lines: ["A note lost at sea (0/2)"] },
] as const;

type VisualStyle = "watercolor" | "anime" | "manga" | "print";

interface VisualStylePreset {
  label: string;
  shortLabel: string;
  outline: {
    color: string;
    strength: number;
    threshold: number;
    normalStrength: number;
    normalThreshold: number;
    width: number;
  };
  lut: number;
  grade: {
    saturation: number;
    grain: number;
    brightness: number;
    contrast: number;
    warmth: number;
    vignette: number;
    halftone: number;
    halftoneScale: number;
    duotone: number;
    posterize: number;
    comic: number;
    duotoneDark: string;
    duotoneLight: string;
  };
}

const VISUAL_STYLE_PRESETS: Record<VisualStyle, VisualStylePreset> = {
  watercolor: {
    label: "水彩原版",
    shortLabel: "水彩",
    outline: {
      color: "#363a3c",
      strength: 1,
      threshold: 0.0001,
      normalStrength: 0.3,
      normalThreshold: 0.4,
      width: 1,
    },
    lut: 1,
    grade: {
      saturation: 1,
      grain: 0,
      brightness: 1,
      contrast: 1,
      warmth: 0,
      vignette: 0,
      halftone: 0,
      halftoneScale: 5,
      duotone: 0,
      posterize: 0,
      comic: 0,
      duotoneDark: "#17324d",
      duotoneLight: "#f3dfb0",
    },
  },
  anime: {
    label: "日系动画",
    shortLabel: "动画",
    outline: {
      color: "#34434b",
      strength: 0.74,
      threshold: 0.00015,
      normalStrength: 0.58,
      normalThreshold: 0.55,
      width: 0.9,
    },
    lut: 0.3,
    grade: {
      saturation: 1.16,
      grain: 0.015,
      brightness: 1.06,
      contrast: 1.08,
      warmth: -0.03,
      vignette: 0,
      halftone: 0,
      halftoneScale: 5,
      duotone: 0,
      posterize: 0,
      comic: 0,
      duotoneDark: "#17324d",
      duotoneLight: "#f3dfb0",
    },
  },
  manga: {
    label: "黑白漫画",
    shortLabel: "漫画",
    outline: {
      color: "#171717",
      strength: 1,
      threshold: 0.00008,
      normalStrength: 0.98,
      normalThreshold: 0.38,
      width: 1.55,
    },
    lut: 0,
    grade: {
      saturation: 0,
      grain: 0.035,
      brightness: 1.08,
      contrast: 1.32,
      warmth: 0,
      vignette: 0.08,
      halftone: 0.52,
      halftoneScale: 5,
      duotone: 0,
      posterize: 0,
      comic: 0,
      duotoneDark: "#17324d",
      duotoneLight: "#f3dfb0",
    },
  },
  print: {
    label: "美式漫画",
    shortLabel: "美漫",
    outline: {
      color: "#171412",
      strength: 1,
      threshold: 0.00006,
      normalStrength: 1,
      normalThreshold: 0.36,
      width: 1.75,
    },
    lut: 0,
    grade: {
      saturation: 1.52,
      grain: 0.004,
      brightness: 1.08,
      contrast: 1.26,
      warmth: 0.04,
      vignette: 0.055,
      halftone: 0,
      halftoneScale: 18,
      duotone: 0,
      posterize: 5,
      comic: 0.12,
      duotoneDark: "#171412",
      duotoneLight: "#fff0bc",
    },
  },
};

/**
 * Hand-built React + Three.js (R3F) rebuild of the Messenger experience.
 * - Phase 1: loading → BEGIN intro (title planet) + camera.
 * - Phase 2: playable skinned avatar, follow camera, input.
 * - Phase 3: BEGIN transitions into the real "present" planet with terrain
 *   collision; the avatar walks the surface.
 * All reusing the original `.drc` geometry and `.ogg` audio.
 */
export default function RebuiltExperience() {
  const [introReady, setIntroReady] = useState(false);
  const [presentReady, setPresentReady] = useState(false);
  const [begun, setBegun] = useState(false);
  const [outfit, setOutfit] = useState<Outfit>(DEFAULT_OUTFIT);
  const [outfitReady, setOutfitReady] = useState(false);
  const [wardrobeOpen, setWardrobeOpen] = useState(false);
  const [muted, setMutedState] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [dialogueStep, setDialogueStep] = useState(0);
  const visualStyle: VisualStyle = "watercolor";
  const [rendererCanvas, setRendererCanvas] = useState<HTMLCanvasElement | null>(null);
  const [webglLost, setWebglLost] = useState(false);
  // Scale render resolution + shadow map to the device once on mount.
  const [device] = useState(getDeviceProfile);
  const [renderDpr, setRenderDpr] = useState(() => getDeviceProfile().dpr[1]);
  const multiplayerSnapshot = useMultiplayerSnapshot();
  const stylePreset = VISUAL_STYLE_PRESETS[visualStyle];

  const handleIntroReady = useCallback(() => setIntroReady(true), []);
  const handlePresentReady = useCallback(() => setPresentReady(true), []);

  const toggleMute = useCallback(() => {
    setMutedState((m) => {
      const next = !m;
      setMuted(next);
      return next;
    });
  }, []);

  const handleBegin = useCallback(() => {
    unlockAudio();
    void play("intro/button-turn.ogg", 0.6);
    void play("camera/zoom-in-5.ogg", 0.5);
    void play("ui/title.ogg", 0.4);
    void playMusic("music/bgmusic-highq.ogg", 0.4);
    setBegun(true);
  }, []);

  useEffect(() => {
    if (!rendererCanvas) return;
    const handleLost: EventListener = (event) => {
      event.preventDefault();
      setWebglLost(true);
    };
    const handleRestored = () => setWebglLost(false);
    rendererCanvas.addEventListener("webglcontextlost", handleLost);
    rendererCanvas.addEventListener("webglcontextrestored", handleRestored);
    return () => {
      rendererCanvas.removeEventListener("webglcontextlost", handleLost);
      rendererCanvas.removeEventListener("webglcontextrestored", handleRestored);
    };
  }, [rendererCanvas]);

  useEffect(() => {
    const restored = loadOrCreateOutfit(window.localStorage);
    const frame = window.requestAnimationFrame(() => {
      setOutfit(restored);
      setOutfitReady(true);
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (!outfitReady) return;
    saveOutfit(window.localStorage, outfit);
    multiplayer.setOutfit(outfit);
  }, [outfit, outfitReady]);

  useEffect(() => {
    if (!begun || !presentReady) return;
    multiplayer.connect();
    return () => multiplayer.disconnect();
  }, [begun, presentReady]);

  useEffect(() => {
    if (!begun || !presentReady) return;
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return;
      const emoji = EMOJI_KEY_MAP[event.key];
      if (emoji === undefined) return;
      event.preventDefault();
      multiplayer.sendEmoji(emoji);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [begun, presentReady]);

  const selectEmoji = useCallback((id: number) => {
    multiplayer.sendEmoji(id);
  }, []);

  const loading = begun ? !presentReady || !outfitReady : !introReady;
  const introDialogueOpen = begun && presentReady && dialogueStep < INTRO_DIALOGUE.length;

  return (
    <div
      className={`messenger-stage${begun ? "" : " messenger-stage--intro"}`}
      data-player-outfit={`${outfit.hair}-${outfit.top}-${outfit.bottom}-${outfit.shoes}`}
      data-multiplayer-status={multiplayerSnapshot.status}
      data-peer-count={multiplayerSnapshot.peers.length}
      data-peer-outfits={multiplayerSnapshot.peers
        .map((peer) => `${peer.id}:${peer.outfit.hair}-${peer.outfit.top}-${peer.outfit.bottom}-${peer.outfit.shoes}`)
        .sort()
        .join("|")}
      data-peer-emojis={multiplayerSnapshot.peers
        .filter((peer) => peer.emoji)
        .map((peer) => `${peer.id}:${peer.emoji!.id}:${peer.emoji!.nonce}`)
        .sort()
        .join("|")}
    >
      <Canvas
        shadows="percentage"
        dpr={renderDpr}
        camera={{ fov: 45, near: 0.1, far: 1000, position: [0, 0, -120] }}
        gl={{
          alpha: false,
          antialias: false,
          stencil: false,
          depth: false,
          toneMapping: NoToneMapping,
          powerPreference: "high-performance",
        }}
        onCreated={({ gl }) => {
          setRendererCanvas(gl.domElement);
        }}
      >
        <color attach="background" args={["#75bdc3"]} />
        <PerformanceMonitor
          iterations={8}
          ms={250}
          threshold={0.75}
          bounds={(refreshRate) => (refreshRate > 90 ? [55, 90] : [45, 60])}
          onChange={({ factor }) => {
            const [minimum, maximum] = device.dpr;
            const next = minimum + (maximum - minimum) * factor;
            setRenderDpr(Math.round(next * 20) / 20);
          }}
        />
        <RenderMetrics dpr={renderDpr} />
        <MessengerLighting present={begun} shadowMapSize={device.shadowMapSize} />

        {!begun && (
          <Suspense fallback={null}>
            <IntroScene onBegin={handleBegin} onReady={handleIntroReady} />
          </Suspense>
        )}

        {begun && outfitReady && (
          <Suspense fallback={null}>
            <PresentScene
              onReady={handlePresentReady}
              outfit={outfit}
              wardrobe={wardrobeOpen}
              introDialogue={introDialogueOpen}
            />
          </Suspense>
        )}

        {/* The reference renders without native MSAA, then applies its outline,
            3D LUT and high-quality SMAA. Low tier keeps silhouette depth edges
            but skips the extra full-scene normal pass. */}
        {device.tier === "high" ? (
          <EffectComposer multisampling={0} enableNormalPass>
            <OutlineEdge
              color={stylePreset.outline.color}
              strength={stylePreset.outline.strength}
              threshold={stylePreset.outline.threshold}
              normalStrength={begun ? stylePreset.outline.normalStrength : 0.72}
              normalThreshold={begun ? stylePreset.outline.normalThreshold : 0.2}
              width={begun ? stylePreset.outline.width : 1.1}
              fadeNear={begun ? 5 : 0}
              fadeFar={begun ? 120 : 155}
            />
            <Lut3D intensity={stylePreset.lut} />
            <PaperGrain {...stylePreset.grade} />
            <SMAA preset={SMAAPreset.HIGH} />
          </EffectComposer>
        ) : (
          <EffectComposer multisampling={0}>
            <OutlineEdge
              color={stylePreset.outline.color}
              strength={stylePreset.outline.strength}
              threshold={stylePreset.outline.threshold}
              normalStrength={0}
              normalThreshold={stylePreset.outline.normalThreshold}
              width={stylePreset.outline.width}
              fadeNear={begun ? 5 : 0}
              fadeFar={begun ? 120 : 155}
            />
            <Lut3D intensity={stylePreset.lut} />
            <PaperGrain {...stylePreset.grade} />
            <SMAA preset={SMAAPreset.HIGH} />
          </EffectComposer>
        )}
      </Canvas>

      {(loading || webglLost) && (
        <div className="messenger-splash" role="status" aria-label="Loading Messenger">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            className="messenger-splash__spinner"
            src={publicPath("/images/loader.svg")}
            alt="Loading"
            width={120}
            height={120}
          />
        </div>
      )}

      {!begun && introReady && (
        <button type="button" className="messenger-begin" onClick={handleBegin} aria-label="BEGIN">
          <span aria-hidden="true" className="messenger-begin__label">BEGIN</span>
        </button>
      )}

      {introDialogueOpen && (
        <div className="messenger-dialogue" role="dialog" aria-label="Messenger introduction">
          <div className="messenger-dialogue__tag" aria-hidden="true">MESSENGER</div>
          <div className="messenger-dialogue__card">
            <p key={dialogueStep}>{INTRO_DIALOGUE[dialogueStep]}</p>
          </div>
          <button
            type="button"
            className="messenger-dialogue__continue"
            onClick={() => {
              void play("ui/title.ogg", 0.28);
              setDialogueStep((step) => Math.min(INTRO_DIALOGUE.length, step + 1));
            }}
            aria-label="Continue"
          >
            <span aria-hidden="true" />
          </button>
        </div>
      )}

      {begun && presentReady && !introDialogueOpen && (
        <>
          {!wardrobeOpen && (
          <div className="messenger-hud">
            <button
              type="button"
              className={`messenger-hud__btn messenger-hud__btn--quest${infoOpen ? " messenger-hud__btn--active" : ""}`}
              onClick={() => {
                setInfoOpen((open) => !open);
                setEmojiOpen(false);
              }}
              aria-label="任务列表"
              title="任务列表"
            >
              {ICONS.info}
            </button>
            <button
              type="button"
              className={`messenger-hud__btn messenger-hud__btn--sound${muted ? " messenger-hud__btn--active" : ""}`}
              onClick={toggleMute}
              aria-label={muted ? "开启声音" : "静音"}
              title={muted ? "开启声音" : "静音"}
            >
              {muted ? ICONS.soundOff : ICONS.soundOn}
            </button>
            <button
              type="button"
              className={`messenger-hud__btn messenger-hud__btn--wardrobe${wardrobeOpen ? " messenger-hud__btn--active" : ""}`}
              onClick={() => {
                setWardrobeOpen((open) => !open);
                setEmojiOpen(false);
                setInfoOpen(false);
              }}
              aria-label="换装"
              title="换装"
            >
              {ICONS.shirt}
            </button>
            <button
              type="button"
              className={`messenger-hud__btn messenger-hud__btn--emoji${emojiOpen ? " messenger-hud__btn--active" : ""}`}
              onClick={() => {
                setEmojiOpen((open) => !open);
                setInfoOpen(false);
              }}
              aria-label={`表情 · ${multiplayerSnapshot.status === "online" ? `${multiplayerSnapshot.peers.length + 1} 人在线` : "离线可用"}`}
              title="表情 · 快捷键 0–9"
              data-multiplayer-status={multiplayerSnapshot.status}
            >
              {ICONS.emoji}
            </button>
          </div>
          )}

          {wardrobeOpen && (
            <WardrobePanel
              outfit={outfit}
              onChange={setOutfit}
              onClose={() => setWardrobeOpen(false)}
            />
          )}

          {emojiOpen && (
            <EmojiPanel onSelect={selectEmoji} onClose={() => setEmojiOpen(false)} />
          )}

          {infoOpen && (
            <div
              className="messenger-info"
              role="dialog"
              aria-modal="true"
              onClick={() => setInfoOpen(false)}
            >
              <div className="messenger-info__card" onClick={(e) => e.stopPropagation()}>
                <h2 className="messenger-info__title">CHECKLIST:</h2>
                <ol className="messenger-info__keys">
                  {QUEST_CHECKLIST.map((quest, index) => (
                    <li key={quest.key}>
                      <span>{index + 1}.</span>
                      <strong>
                        {quest.lines.map((line) => <span key={line}>{line}</span>)}
                      </strong>
                    </li>
                  ))}
                </ol>
                <button
                  type="button"
                  className="messenger-info__close"
                  onClick={() => setInfoOpen(false)}
                  aria-label="关闭任务列表"
                >
                  ×
                </button>
              </div>
            </div>
          )}

          {!wardrobeOpen && !emojiOpen && !infoOpen && device.touch && <TouchControls />}
        </>
      )}
    </div>
  );
}
