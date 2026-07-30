import { Quaternion, Vector3 } from "three";
import { DEFAULT_OUTFIT, type Outfit } from "@/lib/messenger/outfit";
import {
  EMOJI_COUNT,
  EMOJI_DURATION_MS,
  EMOJI_RATE_LIMIT_MS,
  MAX_ROOM_PLAYERS,
  MULTIPLAYER_PROTOCOL_VERSION,
  MULTIPLAYER_ROOM,
  STATE_RELAY_INTERVAL_MS,
  type AvatarAnimation,
  type ClientWireMessage,
  type PlayerWireState,
  type ServerWireMessage,
} from "./protocol";

export type MultiplayerStatus = "offline" | "connecting" | "online" | "full";

export interface EmojiEvent {
  id: number;
  nonce: string;
  startedAt: number;
  expiresAt: number;
}

export interface RemotePlayerPresence {
  id: string;
  targetPosition: Vector3;
  targetQuaternion: Quaternion;
  animation: AvatarAnimation;
  outfit: Outfit;
  name: string;
  emoji: EmojiEvent | null;
  leaving: boolean;
}

export interface MultiplayerSnapshot {
  status: MultiplayerStatus;
  localId: string | null;
  peers: RemotePlayerPresence[];
  localEmoji: EmojiEvent | null;
  revision: number;
}

const INITIAL_SNAPSHOT: MultiplayerSnapshot = Object.freeze({
  status: "offline",
  localId: null,
  peers: [],
  localEmoji: null,
  revision: 0,
});

const cloneOutfit = (outfit: Outfit): Outfit => ({ ...outfit });

function sameOutfit(a: Outfit, b: Outfit): boolean {
  return (
    a.hair === b.hair &&
    a.hairColor === b.hairColor &&
    a.top === b.top &&
    a.topColor === b.topColor &&
    a.bottom === b.bottom &&
    a.bottomColor === b.bottomColor &&
    a.shoes === b.shoes &&
    a.shoesColor === b.shoesColor
  );
}

function resolveEndpoint(): string | null {
  if (typeof window === "undefined") return null;

  const configured = process.env.NEXT_PUBLIC_MULTIPLAYER_URL?.trim();
  if (configured) return configured;

  const { hostname, protocol, host } = window.location;
  const wsProtocol = protocol === "https:" ? "wss:" : "ws:";

  // GitHub Pages cannot accept WebSocket upgrades. A Pages deployment should
  // provide NEXT_PUBLIC_MULTIPLAYER_URL for its separately hosted relay.
  if (hostname.endsWith("github.io")) return null;
  return `${wsProtocol}//${host}/realtime`;
}

function isAnimation(value: unknown): value is AvatarAnimation {
  return value === "idle" || value === "run" || value === "sprint" || value === "air";
}

function finiteTuple(value: unknown, length: number): number[] | null {
  if (!Array.isArray(value) || value.length !== length) return null;
  const numbers = value.map(Number);
  return numbers.every(Number.isFinite) ? numbers : null;
}

function readPlayerState(value: unknown): PlayerWireState | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<PlayerWireState>;
  const p = finiteTuple(candidate.p, 3);
  const q = finiteTuple(candidate.q, 4);
  if (!p || !q || !isAnimation(candidate.a) || !candidate.o) return null;

  const outfit = candidate.o as Outfit;
  if (
    !Number.isInteger(outfit.hair) ||
    !Number.isInteger(outfit.top) ||
    !Number.isInteger(outfit.bottom) ||
    !Number.isInteger(outfit.shoes)
  ) {
    return null;
  }

  return {
    p: p as PlayerWireState["p"],
    q: q as PlayerWireState["q"],
    a: candidate.a,
    o: cloneOutfit(outfit),
    n: typeof candidate.n === "string" ? candidate.n.slice(0, 24) : "Unnamed",
  };
}

class MultiplayerClient {
  private listeners = new Set<() => void>();
  private peers = new Map<string, RemotePlayerPresence>();
  private snapshot: MultiplayerSnapshot = INITIAL_SNAPSHOT;
  private socket: WebSocket | null = null;
  private relayTimer: number | null = null;
  private reconnectTimer: number | null = null;
  private desired = false;
  private endpoint: string | null = null;
  private localId: string | null = null;
  private lastSent = "";
  private lastEmojiAt = -Infinity;
  private revision = 0;
  private visibilityListening = false;
  private local: PlayerWireState = {
    p: [0, 0, 0],
    q: [0, 0, 0, 1],
    a: "idle",
    o: cloneOutfit(DEFAULT_OUTFIT),
    n: "Unnamed",
  };

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  readonly getSnapshot = (): MultiplayerSnapshot => this.snapshot;
  readonly getServerSnapshot = (): MultiplayerSnapshot => INITIAL_SNAPSHOT;

  connect(): void {
    this.desired = true;
    this.endpoint = resolveEndpoint();
    if (!this.endpoint) {
      this.setStatus("offline");
      return;
    }
    if (!this.visibilityListening) {
      document.addEventListener("visibilitychange", this.onVisibilityChange);
      this.visibilityListening = true;
    }
    if (document.visibilityState !== "hidden") this.open();
  }

  disconnect(): void {
    this.desired = false;
    this.clearTimers();
    if (this.visibilityListening) {
      document.removeEventListener("visibilitychange", this.onVisibilityChange);
      this.visibilityListening = false;
    }
    const socket = this.socket;
    this.socket = null;
    if (socket && socket.readyState < WebSocket.CLOSING) socket.close(1000, "scene-left");
    this.localId = null;
    this.peers.clear();
    this.lastSent = "";
    this.publish("offline", null);
  }

  setLocalPose(position: Vector3, quaternion: Quaternion, animation: AvatarAnimation): void {
    this.local.p[0] = Number(position.x.toFixed(2));
    this.local.p[1] = Number(position.y.toFixed(2));
    this.local.p[2] = Number(position.z.toFixed(2));
    this.local.q[0] = Number(quaternion.x.toFixed(2));
    this.local.q[1] = Number(quaternion.y.toFixed(2));
    this.local.q[2] = Number(quaternion.z.toFixed(2));
    this.local.q[3] = Number(quaternion.w.toFixed(2));
    this.local.a = animation;
  }

  setOutfit(outfit: Outfit): void {
    if (sameOutfit(this.local.o, outfit)) return;
    this.local.o = cloneOutfit(outfit);
  }

  sendEmoji(id: number): boolean {
    const now = Date.now();
    if (!Number.isInteger(id) || id < 0 || id >= EMOJI_COUNT) return false;
    if (now - this.lastEmojiAt < EMOJI_RATE_LIMIT_MS) return false;
    this.lastEmojiAt = now;

    const nonce = `${now.toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const event: EmojiEvent = {
      id,
      nonce,
      startedAt: now,
      expiresAt: now + EMOJI_DURATION_MS,
    };
    this.snapshot = { ...this.snapshot, localEmoji: event, revision: ++this.revision };
    this.emit();
    this.send({ type: "emoji", emoji: id, nonce });
    return true;
  }

  private onVisibilityChange = (): void => {
    if (!this.desired) return;
    if (document.visibilityState === "hidden") {
      this.clearTimers();
      const socket = this.socket;
      this.socket = null;
      if (socket && socket.readyState < WebSocket.CLOSING) socket.close(1000, "hidden");
      this.peers.clear();
      this.localId = null;
      this.publish("offline", null);
    } else {
      this.open();
    }
  };

  private open(): void {
    if (!this.desired || !this.endpoint) return;
    if (this.socket && this.socket.readyState <= WebSocket.OPEN) return;

    this.clearTimers();
    this.setStatus("connecting");
    const socket = new WebSocket(this.endpoint);
    this.socket = socket;

    socket.addEventListener("open", () => {
      if (this.socket !== socket) return;
      this.lastSent = "";
      this.send({
        type: "join",
        version: MULTIPLAYER_PROTOCOL_VERSION,
        room: MULTIPLAYER_ROOM,
        state: this.copyLocalState(),
      });
    });

    socket.addEventListener("message", (event) => {
      if (this.socket !== socket || typeof event.data !== "string") return;
      try {
        this.onMessage(JSON.parse(event.data) as ServerWireMessage);
      } catch {
        // Malformed server data is ignored; the relay enforces the protocol.
      }
    });

    socket.addEventListener("close", () => {
      if (this.socket !== socket) return;
      this.socket = null;
      this.stopRelay();
      this.localId = null;
      this.peers.clear();
      if (this.snapshot.status !== "full") this.publish("offline", null);
      if (this.desired && document.visibilityState !== "hidden" && this.snapshot.status !== "full") {
        this.reconnectTimer = window.setTimeout(() => this.open(), 1_000);
      }
    });
  }

  private onMessage(message: ServerWireMessage): void {
    if (message.type === "welcome") {
      this.localId = message.id;
      this.peers.clear();
      for (const peer of message.peers.slice(0, MAX_ROOM_PLAYERS - 1)) {
        this.upsertPeer(peer.id, peer.state);
      }
      this.publish("online", message.id);
      this.startRelay();
      return;
    }

    if (message.type === "peer-join") {
      if (this.upsertPeer(message.peer.id, message.peer.state)) this.publish();
      return;
    }

    if (message.type === "peer-state") {
      const presence = this.peers.get(message.id);
      const state = readPlayerState(message.state);
      if (!presence || !state) return;
      const outfitChanged = !sameOutfit(presence.outfit, state.o);
      presence.targetPosition.fromArray(state.p);
      presence.targetQuaternion.fromArray(state.q).normalize();
      presence.animation = state.a;
      presence.name = state.n;
      if (outfitChanged) presence.outfit = state.o;
      if (outfitChanged) this.publish();
      return;
    }

    if (message.type === "peer-emoji") {
      const presence = this.peers.get(message.id);
      if (!presence || message.emoji < 0 || message.emoji >= EMOJI_COUNT) return;
      const now = Date.now();
      presence.emoji = {
        id: message.emoji,
        nonce: message.nonce,
        startedAt: now,
        expiresAt: now + EMOJI_DURATION_MS,
      };
      this.publish();
      return;
    }

    if (message.type === "peer-leave") {
      const presence = this.peers.get(message.id);
      if (!presence) return;
      presence.leaving = true;
      this.publish();
      window.setTimeout(() => {
        if (this.peers.get(message.id) !== presence) return;
        this.peers.delete(message.id);
        this.publish();
      }, 150);
      return;
    }

    if (message.type === "error" && message.code === "room-full") {
      this.clearTimers();
      this.publish("full", null);
      this.socket?.close(1000, "room-full");
    }
  }

  private upsertPeer(id: string, value: unknown): boolean {
    const state = readPlayerState(value);
    if (!state || id === this.localId) return false;
    const current = this.peers.get(id);
    if (current) {
      current.targetPosition.fromArray(state.p);
      current.targetQuaternion.fromArray(state.q).normalize();
      current.animation = state.a;
      current.outfit = state.o;
      current.name = state.n;
      current.leaving = false;
      return false;
    }
    this.peers.set(id, {
      id,
      targetPosition: new Vector3().fromArray(state.p),
      targetQuaternion: new Quaternion().fromArray(state.q).normalize(),
      animation: state.a,
      outfit: state.o,
      name: state.n,
      emoji: null,
      leaving: false,
    });
    return true;
  }

  private startRelay(): void {
    this.stopRelay();
    this.relayTimer = window.setInterval(() => {
      const state = this.copyLocalState();
      const serialized = JSON.stringify(state);
      if (serialized === this.lastSent) return;
      this.lastSent = serialized;
      this.send({ type: "state", state });
    }, STATE_RELAY_INTERVAL_MS);
  }

  private stopRelay(): void {
    if (this.relayTimer !== null) window.clearInterval(this.relayTimer);
    this.relayTimer = null;
  }

  private clearTimers(): void {
    this.stopRelay();
    if (this.reconnectTimer !== null) window.clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
  }

  private send(message: ClientWireMessage): void {
    if (this.socket?.readyState !== WebSocket.OPEN) return;
    this.socket.send(JSON.stringify(message));
  }

  private copyLocalState(): PlayerWireState {
    return {
      p: [...this.local.p],
      q: [...this.local.q],
      a: this.local.a,
      o: cloneOutfit(this.local.o),
      n: this.local.n,
    };
  }

  private setStatus(status: MultiplayerStatus): void {
    if (this.snapshot.status === status) return;
    this.publish(status, this.localId);
  }

  private publish(status = this.snapshot.status, localId = this.localId): void {
    this.snapshot = {
      status,
      localId,
      peers: [...this.peers.values()],
      localEmoji: this.snapshot.localEmoji,
      revision: ++this.revision,
    };
    this.emit();
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }
}

export const multiplayer = new MultiplayerClient();
