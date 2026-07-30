import type { Outfit } from "@/lib/messenger/outfit";

export const MULTIPLAYER_PROTOCOL_VERSION = 1;
export const MULTIPLAYER_ROOM = "planet-present";
export const MAX_ROOM_PLAYERS = 15;
export const STATE_RELAY_INTERVAL_MS = 35;
export const EMOJI_DURATION_MS = 2_000;
export const EMOJI_RATE_LIMIT_MS = 350;
export const EMOJI_COUNT = 10;

export const EMOJI_KEY_MAP: Readonly<Record<string, number>> = {
  "1": 2,
  "2": 0,
  "3": 1,
  "4": 8,
  "5": 5,
  "6": 6,
  "7": 7,
  "8": 9,
  "9": 3,
  "0": 4,
};

// Inverse lookup in geometry/picker order. The reference's picker order is not
// the same as the keyboard's numeric order.
export const EMOJI_SHORTCUTS: ReadonlyArray<string> = [
  "2",
  "3",
  "1",
  "9",
  "0",
  "5",
  "6",
  "7",
  "4",
  "8",
];

export type Vec3Tuple = [number, number, number];
export type QuatTuple = [number, number, number, number];
export type AvatarAnimation = "idle" | "run" | "sprint" | "air";

export interface PlayerWireState {
  p: Vec3Tuple;
  q: QuatTuple;
  a: AvatarAnimation;
  o: Outfit;
  n: string;
}

export interface PeerWireState {
  id: string;
  state: PlayerWireState;
}

export type ClientWireMessage =
  | {
      type: "join";
      version: typeof MULTIPLAYER_PROTOCOL_VERSION;
      room: typeof MULTIPLAYER_ROOM;
      state: PlayerWireState;
    }
  | { type: "state"; state: PlayerWireState }
  | { type: "emoji"; emoji: number; nonce: string };

export type ServerWireMessage =
  | {
      type: "welcome";
      id: string;
      room: typeof MULTIPLAYER_ROOM;
      peers: PeerWireState[];
    }
  | { type: "peer-join"; peer: PeerWireState }
  | { type: "peer-state"; id: string; state: PlayerWireState }
  | { type: "peer-emoji"; id: string; emoji: number; nonce: string }
  | { type: "peer-leave"; id: string }
  | { type: "error"; code: "room-full" | "invalid-message"; message: string };
