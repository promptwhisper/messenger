export const PROTOCOL_VERSION = 1;
export const ROOM = "planet-present";
export const MAX_PLAYERS = 15;
export const EMOJI_COUNT = 10;
export const EMOJI_RATE_LIMIT_MS = 350;
export const MAX_MESSAGES_PER_SECOND = 60;
export const MAX_PAYLOAD_BYTES = 4 * 1024;

const animationNames = new Set(["idle", "run", "sprint", "air"]);

function finiteTuple(value, length, limit = 10_000) {
  if (!Array.isArray(value) || value.length !== length) return null;
  const result = value.map(Number);
  if (!result.every((number) => Number.isFinite(number) && Math.abs(number) <= limit)) return null;
  return result;
}

function integerInRange(value, min, max) {
  return Number.isInteger(value) && value >= min && value <= max ? value : null;
}

function color(value, fallback) {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;
}

export function sanitizePlayerState(value) {
  if (!value || typeof value !== "object") return null;
  const p = finiteTuple(value.p, 3);
  const q = finiteTuple(value.q, 4, 1.1);
  if (!p || !q || !animationNames.has(value.a) || !value.o || typeof value.o !== "object") {
    return null;
  }

  const hair = integerInRange(value.o.hair, 1, 7);
  const top = integerInRange(value.o.top, 1, 9);
  const bottom = integerInRange(value.o.bottom, 1, 7);
  const shoes = integerInRange(value.o.shoes, 1, 7);
  if (hair === null || top === null || bottom === null || shoes === null) return null;

  const length = Math.hypot(...q);
  if (length < 0.8 || length > 1.2) return null;

  return {
    p: p.map((component) => Number(component.toFixed(2))),
    q: q.map((component) => Number((component / length).toFixed(2))),
    a: value.a,
    o: {
      hair,
      hairColor: color(value.o.hairColor, "#5a3d28"),
      top,
      topColor: color(value.o.topColor, "#c96b52"),
      bottom,
      bottomColor: color(value.o.bottomColor, "#3c4a63"),
      shoes,
      shoesColor: color(value.o.shoesColor, "#2c2825"),
    },
    n: typeof value.n === "string" ? value.n.trim().slice(0, 24) || "Unnamed" : "Unnamed",
  };
}

export function parseClientMessage(raw) {
  if (typeof raw !== "string" || Buffer.byteLength(raw) > MAX_PAYLOAD_BYTES) return null;
  try {
    const message = JSON.parse(raw);
    if (!message || typeof message !== "object" || typeof message.type !== "string") return null;
    return message;
  } catch {
    return null;
  }
}
