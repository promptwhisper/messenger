import { createReadStream } from "node:fs";
import { access, stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { WebSocket, WebSocketServer } from "ws";
import {
  EMOJI_COUNT,
  EMOJI_RATE_LIMIT_MS,
  MAX_MESSAGES_PER_SECOND,
  MAX_PAYLOAD_BYTES,
  MAX_PLAYERS,
  PROTOCOL_VERSION,
  ROOM,
  parseClientMessage,
  sanitizePlayerState,
} from "./protocol.mjs";

const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".ktx2": "image/ktx2",
  ".mp3": "audio/mpeg",
  ".ogg": "audio/ogg",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ttf": "font/ttf",
  ".wasm": "application/wasm",
  ".woff2": "font/woff2",
};

function json(socket, message) {
  if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
}

function roomClients(rooms, room) {
  let clients = rooms.get(room);
  if (!clients) {
    clients = new Map();
    rooms.set(room, clients);
  }
  return clients;
}

function broadcast(clients, message, except = null) {
  const payload = JSON.stringify(message);
  for (const session of clients.values()) {
    if (session !== except && session.socket.readyState === WebSocket.OPEN) {
      session.socket.send(payload);
    }
  }
}

function createStaticHandler(staticRoot) {
  if (!staticRoot) {
    return (request, response) => {
      if (request.url === "/healthz") {
        response.writeHead(200, { "content-type": "application/json; charset=utf-8" });
        response.end(JSON.stringify({ ok: true, service: "messenger-realtime" }));
        return;
      }
      response.writeHead(404);
      response.end("Not found");
    };
  }

  const root = resolve(staticRoot);
  return async (request, response) => {
    try {
      const requestUrl = new URL(request.url ?? "/", "http://localhost");
      if (requestUrl.pathname === "/healthz") {
        response.writeHead(200, { "content-type": "application/json; charset=utf-8" });
        response.end(JSON.stringify({ ok: true, service: "messenger-realtime" }));
        return;
      }
      const decoded = decodeURIComponent(requestUrl.pathname);
      const safePath = normalize(decoded).replace(/^([/\\])+/, "");
      let filePath = resolve(root, safePath);
      if (!filePath.startsWith(`${root}/`) && filePath !== root) throw new Error("invalid path");

      let fileStat;
      try {
        fileStat = await stat(filePath);
      } catch {
        fileStat = null;
      }
      if (fileStat?.isDirectory() || decoded.endsWith("/")) filePath = join(filePath, "index.html");
      await access(filePath);
      const finalStat = await stat(filePath);
      response.writeHead(200, {
        "content-type": MIME_TYPES[extname(filePath)] ?? "application/octet-stream",
        "content-length": finalStat.size,
        "cache-control": extname(filePath) === ".html" ? "no-cache" : "public, max-age=31536000, immutable",
      });
      createReadStream(filePath).pipe(response);
    } catch {
      response.writeHead(404);
      response.end("Not found");
    }
  };
}

export async function createRealtimeServer({ port = 0, host = "127.0.0.1", staticRoot = null } = {}) {
  const rooms = new Map();
  const server = createServer(createStaticHandler(staticRoot));
  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_PAYLOAD_BYTES, perMessageDeflate: false });

  server.on("upgrade", (request, socket, head) => {
    const url = new URL(request.url ?? "/", "http://localhost");
    if (url.pathname !== "/realtime") {
      socket.write("HTTP/1.1 404 Not Found\r\n\r\n");
      socket.destroy();
      return;
    }
    wss.handleUpgrade(request, socket, head, (websocket) => wss.emit("connection", websocket, request));
  });

  wss.on("connection", (socket) => {
    const session = {
      id: randomUUID().replaceAll("-", "").slice(0, 10),
      socket,
      room: null,
      state: null,
      joined: false,
      alive: true,
      lastEmojiAt: -Infinity,
      windowStartedAt: Date.now(),
      messagesInWindow: 0,
    };

    socket.on("pong", () => {
      session.alive = true;
    });

    socket.on("message", (raw, isBinary) => {
      if (isBinary) {
        socket.close(1003, "text-only");
        return;
      }

      const now = Date.now();
      if (now - session.windowStartedAt >= 1_000) {
        session.windowStartedAt = now;
        session.messagesInWindow = 0;
      }
      session.messagesInWindow += 1;
      if (session.messagesInWindow > MAX_MESSAGES_PER_SECOND) {
        socket.close(1008, "rate-limit");
        return;
      }

      const message = parseClientMessage(raw.toString());
      if (!message) {
        json(socket, { type: "error", code: "invalid-message", message: "Invalid message" });
        return;
      }

      if (!session.joined) {
        const state = sanitizePlayerState(message.state);
        if (
          message.type !== "join" ||
          message.version !== PROTOCOL_VERSION ||
          message.room !== ROOM ||
          !state
        ) {
          json(socket, { type: "error", code: "invalid-message", message: "A valid join message is required" });
          socket.close(1008, "invalid-join");
          return;
        }

        const clients = roomClients(rooms, ROOM);
        if (clients.size >= MAX_PLAYERS) {
          json(socket, { type: "error", code: "room-full", message: "This planet is full" });
          socket.close(1013, "room-full");
          return;
        }

        session.room = ROOM;
        session.state = state;
        session.joined = true;
        json(socket, {
          type: "welcome",
          id: session.id,
          room: ROOM,
          peers: [...clients.values()].map((peer) => ({ id: peer.id, state: peer.state })),
        });
        clients.set(session.id, session);
        broadcast(clients, { type: "peer-join", peer: { id: session.id, state } }, session);
        return;
      }

      const clients = rooms.get(session.room);
      if (!clients) return;

      if (message.type === "state") {
        const state = sanitizePlayerState(message.state);
        if (!state) return;
        session.state = state;
        broadcast(clients, { type: "peer-state", id: session.id, state }, session);
        return;
      }

      if (message.type === "emoji") {
        if (
          !Number.isInteger(message.emoji) ||
          message.emoji < 0 ||
          message.emoji >= EMOJI_COUNT ||
          typeof message.nonce !== "string" ||
          message.nonce.length > 64 ||
          now - session.lastEmojiAt < EMOJI_RATE_LIMIT_MS
        ) {
          return;
        }
        session.lastEmojiAt = now;
        broadcast(
          clients,
          { type: "peer-emoji", id: session.id, emoji: message.emoji, nonce: message.nonce },
          session
        );
      }
    });

    socket.on("close", () => {
      if (!session.joined || !session.room) return;
      const clients = rooms.get(session.room);
      if (!clients) return;
      clients.delete(session.id);
      broadcast(clients, { type: "peer-leave", id: session.id });
      if (clients.size === 0) rooms.delete(session.room);
    });
  });

  const heartbeat = setInterval(() => {
    for (const socket of wss.clients) {
      const session = [...rooms.values()]
        .flatMap((clients) => [...clients.values()])
        .find((candidate) => candidate.socket === socket);
      if (session && !session.alive) {
        socket.terminate();
        continue;
      }
      if (session) session.alive = false;
      socket.ping();
    }
  }, 30_000);
  heartbeat.unref();

  await new Promise((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen(port, host, () => {
      server.off("error", rejectListen);
      resolveListen();
    });
  });

  return {
    server,
    wss,
    rooms,
    address: server.address(),
    async close() {
      clearInterval(heartbeat);
      for (const socket of wss.clients) socket.terminate();
      await new Promise((resolveClose) => wss.close(() => resolveClose()));
      await new Promise((resolveClose) => server.close(() => resolveClose()));
    },
  };
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isMain) {
  const portIndex = process.argv.indexOf("--port");
  const staticIndex = process.argv.indexOf("--static");
  const port = Number(portIndex >= 0 ? process.argv[portIndex + 1] : process.env.PORT ?? 3000);
  const staticRoot = staticIndex >= 0 ? process.argv[staticIndex + 1] : null;
  const runtime = await createRealtimeServer({ port, host: "0.0.0.0", staticRoot });
  const address = runtime.address;
  const renderedAddress = typeof address === "object" && address ? `${address.address}:${address.port}` : String(address);
  console.log(`Messenger realtime listening on ${renderedAddress}${staticRoot ? ` and serving ${staticRoot}` : ""}`);

  const stop = async () => {
    await runtime.close();
    process.exit(0);
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
}
