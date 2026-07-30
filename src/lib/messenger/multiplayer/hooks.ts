"use client";

import { useSyncExternalStore } from "react";
import { multiplayer } from "./client";

export function useMultiplayerSnapshot() {
  return useSyncExternalStore(
    multiplayer.subscribe,
    multiplayer.getSnapshot,
    multiplayer.getServerSnapshot
  );
}
