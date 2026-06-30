/**
 * Minimal WebAudio cue player for the rebuilt experience. Decodes `.ogg` cues
 * from /assets/audio/ on demand and plays one-shots. Designed to grow into the
 * full positional/ambiance system in later phases.
 */
import { AUDIO_BASE } from "@/lib/messenger/assets";

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
const buffers = new Map<string, Promise<AudioBuffer>>();
let muted = false;

function context(): AudioContext {
  if (!ctx) {
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    ctx = new Ctor();
  }
  return ctx;
}

/** Shared master bus so muting affects one-shots AND the music bed. */
function masterGain(): GainNode {
  const c = context();
  if (!master) {
    master = c.createGain();
    master.gain.value = muted ? 0 : 1;
    master.connect(c.destination);
  }
  return master;
}

function loadBuffer(path: string): Promise<AudioBuffer> {
  let cached = buffers.get(path);
  if (!cached) {
    cached = fetch(AUDIO_BASE + path, { credentials: "same-origin" })
      .then((r) => r.arrayBuffer())
      .then((data) => context().decodeAudioData(data));
    buffers.set(path, cached);
  }
  return cached;
}

/** Resume the audio context after a user gesture (autoplay policy). */
export async function unlockAudio(): Promise<void> {
  const c = context();
  if (c.state === "suspended") await c.resume();
}

/** Play a one-shot cue, e.g. play("intro/button-turn.ogg"). */
export async function play(path: string, volume = 1): Promise<void> {
  if (muted) return;
  const c = context();
  const buffer = await loadBuffer(path);
  const source = c.createBufferSource();
  source.buffer = buffer;
  const gain = c.createGain();
  gain.gain.value = volume;
  source.connect(gain).connect(masterGain());
  source.start(0);
}

let musicSource: AudioBufferSourceNode | null = null;

/** Start (or restart) a looping music/ambiance bed. */
export async function playMusic(path: string, volume = 0.5): Promise<void> {
  const c = context();
  const buffer = await loadBuffer(path);
  if (musicSource) {
    try {
      musicSource.stop();
    } catch {
      /* already stopped */
    }
  }
  const source = c.createBufferSource();
  source.buffer = buffer;
  source.loop = true;
  const gain = c.createGain();
  gain.gain.value = volume;
  source.connect(gain).connect(masterGain());
  source.start(0);
  musicSource = source;
}

export function setMuted(value: boolean): void {
  muted = value;
  if (master) master.gain.value = value ? 0 : 1;
}

export function isMuted(): boolean {
  return muted;
}
