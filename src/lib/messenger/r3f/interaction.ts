import { Vector3 } from "three";

/**
 * Shared player world position, written by the Avatar each frame and read by
 * NPCs for proximity-based interaction. A plain module singleton keeps this off
 * the React render path (it's only read inside the r3f frame loop).
 */
export const playerPosition = new Vector3();

/** Distance (metres) within which an NPC becomes interactable. */
export const INTERACT_RANGE = 6;
