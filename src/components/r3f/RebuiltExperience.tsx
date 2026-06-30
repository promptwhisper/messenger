"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { ACESFilmicToneMapping } from "three";
import { getDeviceProfile } from "@/lib/messenger/device";
import { EffectComposer } from "@react-three/postprocessing";
import IntroScene from "./IntroScene";
import PresentScene from "./PresentScene";
import OutlineEdge from "./effects/OutlineEdge";
import Lut3D from "./effects/Lut3D";
import PaperGrain from "./effects/PaperGrain";
import WardrobePanel from "@/components/WardrobePanel";
import TouchControls from "@/components/TouchControls";
import { type Outfit, DEFAULT_OUTFIT } from "@/lib/messenger/outfit";
import { play, playMusic, unlockAudio, setMuted } from "@/lib/messenger/audio";
import { publicPath } from "@/lib/messenger/assets";

// Hand-drawn line-style HUD icons (stroke = currentColor so they invert on the
// active/dark button state), matching the original's hand-drawn UI look instead
// of flat emoji.
const ICON_PROPS = {
  viewBox: "0 0 24 24",
  width: 26,
  height: 26,
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2.4,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

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
  style: (
    <svg {...ICON_PROPS} aria-hidden="true">
      <path d="M12 3.5a8.5 8.5 0 1 0 0 17h1.2a1.8 1.8 0 0 0 0-3.6h-.7a1.2 1.2 0 0 1 0-2.4H15a5.5 5.5 0 0 0 0-11Z" />
      <circle cx="7.7" cy="9" r="1" fill="currentColor" stroke="none" />
      <circle cx="10.2" cy="6.8" r="1" fill="currentColor" stroke="none" />
      <circle cx="14" cy="7" r="1" fill="currentColor" stroke="none" />
      <circle cx="16.3" cy="10" r="1" fill="currentColor" stroke="none" />
    </svg>
  ),
  fullscreen: (
    <svg {...ICON_PROPS} aria-hidden="true">
      <path d="M4.5 9V4.5H9M15 4.5h4.5V9M19.5 15v4.5H15M9 19.5H4.5V15" />
    </svg>
  ),
  fullscreenExit: (
    <svg {...ICON_PROPS} aria-hidden="true">
      <path d="M9 4.5V9H4.5M19.5 9H15V4.5M15 19.5V15h4.5M4.5 15H9v4.5" />
    </svg>
  ),
};

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

const VISUAL_STYLE_ORDER: VisualStyle[] = ["watercolor", "anime", "manga", "print"];
const VISUAL_STYLE_STORAGE_KEY = "messenger-visual-style";
const VISUAL_STYLE_PRESETS: Record<VisualStyle, VisualStylePreset> = {
  watercolor: {
    label: "水彩原版",
    shortLabel: "水彩",
    outline: {
      color: "#3a3531",
      strength: 0.9,
      threshold: 0.07,
      normalStrength: 0.85,
      normalThreshold: 0.46,
      width: 1.3,
    },
    lut: 0.85,
    grade: {
      saturation: 0.82,
      grain: 0.1,
      brightness: 1.03,
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
      threshold: 0.085,
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
      threshold: 0.055,
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
      threshold: 0.045,
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

function isVisualStyle(value: string | null): value is VisualStyle {
  return VISUAL_STYLE_ORDER.includes(value as VisualStyle);
}

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
  const [wardrobeOpen, setWardrobeOpen] = useState(false);
  const [muted, setMutedState] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [visualStyle, setVisualStyle] = useState<VisualStyle>("watercolor");
  const [styleNoticeVisible, setStyleNoticeVisible] = useState(false);
  // Scale render resolution + shadow map to the device once on mount.
  const [device] = useState(getDeviceProfile);
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

  const toggleFullscreen = useCallback(() => {
    const el = document.documentElement;
    if (!document.fullscreenElement) {
      void el.requestFullscreen?.().then(() => setFullscreen(true)).catch(() => {});
    } else {
      void document.exitFullscreen?.().then(() => setFullscreen(false)).catch(() => {});
    }
  }, []);

  const cycleVisualStyle = useCallback(() => {
    const currentIndex = VISUAL_STYLE_ORDER.indexOf(visualStyle);
    const next = VISUAL_STYLE_ORDER[(currentIndex + 1) % VISUAL_STYLE_ORDER.length];
    setVisualStyle(next);
    window.localStorage.setItem(VISUAL_STYLE_STORAGE_KEY, next);
    setStyleNoticeVisible(true);
    void play("ui/paper1.ogg", 0.24);
  }, [visualStyle]);

  const handleBegin = useCallback(() => {
    unlockAudio();
    void play("intro/button-turn.ogg", 0.6);
    void play("camera/zoom-in-5.ogg", 0.5);
    void play("ui/title.ogg", 0.4);
    void playMusic("music/bgmusic-highq.ogg", 0.4);
    setBegun(true);
  }, []);

  useEffect(() => {
    const sync = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);

  useEffect(() => {
    const savedStyle = window.localStorage.getItem(VISUAL_STYLE_STORAGE_KEY);
    if (!isVisualStyle(savedStyle)) return;
    const frame = window.requestAnimationFrame(() => setVisualStyle(savedStyle));
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (!styleNoticeVisible) return;
    const timeout = window.setTimeout(() => setStyleNoticeVisible(false), 1400);
    return () => window.clearTimeout(timeout);
  }, [styleNoticeVisible, visualStyle]);

  const loading = begun ? !presentReady : !introReady;

  return (
    <div className={`messenger-stage${begun ? "" : " messenger-stage--intro"}`}>
      <Canvas
        shadows
        dpr={device.dpr}
        camera={{ fov: 68, near: 0.1, far: 5000, position: [0, 2, 14] }}
        gl={{ antialias: true, toneMapping: ACESFilmicToneMapping }}
        onCreated={({ scene }) => {
          scene.background = null;
        }}
      >
        <hemisphereLight args={["#eef6ff", "#aab48c", 1.15]} />
        <ambientLight intensity={0.78} />
        <directionalLight
          position={[45, 80, 30]}
          intensity={0.35}
          color="#fff3df"
          castShadow={false}
          shadow-mapSize-width={device.shadowMapSize}
          shadow-mapSize-height={device.shadowMapSize}
          shadow-camera-far={320}
          shadow-camera-left={-90}
          shadow-camera-right={90}
          shadow-camera-top={90}
          shadow-camera-bottom={-90}
          shadow-bias={-0.0005}
        />

        {!begun && (
          <Suspense fallback={null}>
            <IntroScene onBegin={handleBegin} onReady={handleIntroReady} />
          </Suspense>
        )}

        {begun && (
          <Suspense fallback={null}>
            <PresentScene onReady={handlePresentReady} outfit={outfit} wardrobe={wardrobeOpen} />
          </Suspense>
        )}

        {/* High tier: cartoon outline (needs a full normal pass) + MSAA + LUT +
            grain. Low/mobile tier: drop the normal pass, outline and MSAA (the
            biggest GPU cost) and keep only the cheap colour-grade + paper grain. */}
        {device.tier === "high" ? (
          <EffectComposer multisampling={4} enableNormalPass>
            <OutlineEdge
              color={stylePreset.outline.color}
              strength={stylePreset.outline.strength}
              threshold={stylePreset.outline.threshold}
              normalStrength={stylePreset.outline.normalStrength}
              normalThreshold={stylePreset.outline.normalThreshold}
              width={stylePreset.outline.width}
            />
            <Lut3D intensity={stylePreset.lut} />
            <PaperGrain {...stylePreset.grade} />
          </EffectComposer>
        ) : (
          <EffectComposer multisampling={0}>
            <Lut3D intensity={stylePreset.lut} />
            <PaperGrain {...stylePreset.grade} />
          </EffectComposer>
        )}
      </Canvas>

      {loading && (
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
          <span
            aria-hidden="true"
            className="messenger-begin__label"
            style={{
              WebkitMaskImage: `url(${publicPath("/images/icons/begin.png")})`,
              maskImage: `url(${publicPath("/images/icons/begin.png")})`,
            }}
          />
        </button>
      )}

      {begun && presentReady && (
        <>
          {!wardrobeOpen && (
          <div className="messenger-hud">
            <button
              type="button"
              className={`messenger-hud__btn${wardrobeOpen ? " messenger-hud__btn--active" : ""}`}
              onClick={() => setWardrobeOpen((o) => !o)}
              aria-label="换装"
              title="换装"
            >
              {ICONS.shirt}
            </button>
            <button
              type="button"
              className="messenger-hud__btn messenger-hud__btn--style"
              onClick={cycleVisualStyle}
              aria-label={`画风：${stylePreset.label}，点击切换`}
              title={`画风：${stylePreset.label}（点击切换）`}
              data-testid="visual-style-toggle"
            >
              {ICONS.style}
              <span className="messenger-hud__style-count" aria-hidden="true">
                {VISUAL_STYLE_ORDER.indexOf(visualStyle) + 1}
              </span>
            </button>
            <button
              type="button"
              className={`messenger-hud__btn${muted ? " messenger-hud__btn--active" : ""}`}
              onClick={toggleMute}
              aria-label={muted ? "开启声音" : "静音"}
              title={muted ? "开启声音" : "静音"}
            >
              {muted ? ICONS.soundOff : ICONS.soundOn}
            </button>
            <button
              type="button"
              className="messenger-hud__btn"
              onClick={toggleFullscreen}
              aria-label={fullscreen ? "退出全屏" : "全屏"}
              title={fullscreen ? "退出全屏" : "全屏"}
            >
              {fullscreen ? ICONS.fullscreenExit : ICONS.fullscreen}
            </button>
            <button
              type="button"
              className={`messenger-hud__btn${infoOpen ? " messenger-hud__btn--active" : ""}`}
              onClick={() => setInfoOpen((o) => !o)}
              aria-label="信息"
              title="信息"
            >
              {ICONS.info}
            </button>
          </div>
          )}

          {styleNoticeVisible && (
            <div
              key={visualStyle}
              className="messenger-style-notice"
              role="status"
              aria-live="polite"
            >
              <span>画风</span>
              <strong>{stylePreset.label}</strong>
            </div>
          )}

          {wardrobeOpen && (
            <WardrobePanel
              outfit={outfit}
              onChange={setOutfit}
              onClose={() => setWardrobeOpen(false)}
            />
          )}

          {infoOpen && (
            <div
              className="messenger-info"
              role="dialog"
              aria-modal="true"
              onClick={() => setInfoOpen(false)}
            >
              <div className="messenger-info__card" onClick={(e) => e.stopPropagation()}>
                <h2 className="messenger-info__title">Messenger</h2>
                <p>
                  React + Three.js 手工重建版。复用原版的 <code>.drc</code> 几何、KTX2 贴图与
                  <code>.ogg</code> 音频，重写了加载、镜头、角色控制与卡通着色。
                </p>
                <ul className="messenger-info__keys">
                  <li><kbd>WASD</kbd> 移动</li>
                  <li><kbd>Shift</kbd> 冲刺</li>
                  <li><kbd>Space</kbd> 跳跃</li>
                  <li>鼠标拖拽转视角 · 滚轮缩放</li>
                </ul>
                <button
                  type="button"
                  className="messenger-info__close"
                  onClick={() => setInfoOpen(false)}
                >
                  关闭
                </button>
              </div>
            </div>
          )}

          {!wardrobeOpen && !device.touch && (
            <div className="messenger-controls" aria-hidden="true">
              <span className="messenger-controls__item">
                <kbd>WASD</kbd>
                <span>移动</span>
              </span>
              <span className="messenger-controls__item">
                <kbd>拖拽</kbd>
                <span>转视角</span>
              </span>
              <span className="messenger-controls__item">
                <kbd>滚轮</kbd>
                <span>缩放</span>
              </span>
              <span className="messenger-controls__item">
                <kbd>SHIFT</kbd>
                <span>冲刺</span>
              </span>
              <span className="messenger-controls__item">
                <kbd>SPACE</kbd>
                <span>跳跃</span>
              </span>
            </div>
          )}

          {!wardrobeOpen && device.touch && <TouchControls />}
        </>
      )}
    </div>
  );
}
