import assert from "node:assert/strict";
import test from "node:test";
import { WebSocket } from "ws";
import { createRealtimeServer } from "./realtime.mjs";
import { MAX_PLAYERS, PROTOCOL_VERSION, ROOM, sanitizePlayerState } from "./protocol.mjs";

const baseState = (x = 0) => ({
  p: [x, 2, 3],
  q: [0, 0, 0, 1],
  a: "idle",
  o: {
    hair: 1,
    hairColor: "#5a3d28",
    top: 1,
    topColor: "#c96b52",
    bottom: 1,
    bottomColor: "#3c4a63",
    shoes: 1,
    shoesColor: "#2c2825",
  },
  n: "Unnamed",
});

function waitForJson(socket, predicate, timeout = 2_000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off("message", onMessage);
      reject(new Error("Timed out waiting for WebSocket message"));
    }, timeout);
    const onMessage = (raw) => {
      const message = JSON.parse(raw.toString());
      if (!predicate(message)) return;
      clearTimeout(timer);
      socket.off("message", onMessage);
      resolve(message);
    };
    socket.on("message", onMessage);
  });
}

test("rounds relayed positions and rotations to two decimals", () => {
  const state = sanitizePlayerState({
    ...baseState(),
    p: [1.234, -2.345, 3.999],
    q: [0.1234, 0.2345, 0.3456, 0.9012],
  });

  assert.ok(state);
  assert.deepEqual(state.p, [1.23, -2.35, 4]);
  for (const component of state.q) {
    const decimals = String(component).split(".")[1]?.length ?? 0;
    assert.ok(decimals <= 2);
  }
});

async function openClient(url, state = baseState()) {
  const socket = new WebSocket(url);
  await new Promise((resolve, reject) => {
    socket.once("open", resolve);
    socket.once("error", reject);
  });
  const welcome = waitForJson(socket, (message) => message.type === "welcome");
  socket.send(JSON.stringify({ type: "join", version: PROTOCOL_VERSION, room: ROOM, state }));
  return { socket, welcome: await welcome };
}

test("relays roster, pose, emoji, and leave events", async (t) => {
  const runtime = await createRealtimeServer();
  t.after(() => runtime.close());
  const { port } = runtime.address;
  const url = `ws://127.0.0.1:${port}/realtime`;

  const first = await openClient(url, baseState(1));
  t.after(() => first.socket.terminate());
  const joinNotice = waitForJson(first.socket, (message) => message.type === "peer-join");
  const second = await openClient(url, baseState(2));
  t.after(() => second.socket.terminate());

  assert.equal(second.welcome.peers.length, 1);
  assert.equal((await joinNotice).peer.id, second.welcome.id);

  const poseNotice = waitForJson(first.socket, (message) => message.type === "peer-state");
  second.socket.send(JSON.stringify({ type: "state", state: { ...baseState(8), a: "sprint" } }));
  const pose = await poseNotice;
  assert.deepEqual(pose.state.p, [8, 2, 3]);
  assert.equal(pose.state.a, "sprint");

  const emojiNotice = waitForJson(first.socket, (message) => message.type === "peer-emoji");
  second.socket.send(JSON.stringify({ type: "emoji", emoji: 7, nonce: "test-emoji" }));
  assert.equal((await emojiNotice).emoji, 7);

  const leaveNotice = waitForJson(first.socket, (message) => message.type === "peer-leave");
  second.socket.close();
  assert.equal((await leaveNotice).id, second.welcome.id);
});

test("rejects the sixteenth player", async (t) => {
  const runtime = await createRealtimeServer();
  t.after(() => runtime.close());
  const { port } = runtime.address;
  const url = `ws://127.0.0.1:${port}/realtime`;
  const clients = [];
  t.after(() => clients.forEach((socket) => socket.terminate()));

  for (let index = 0; index < MAX_PLAYERS; index += 1) {
    const client = await openClient(url, baseState(index));
    clients.push(client.socket);
  }

  const overflow = new WebSocket(url);
  clients.push(overflow);
  await new Promise((resolve, reject) => {
    overflow.once("open", resolve);
    overflow.once("error", reject);
  });
  const error = waitForJson(overflow, (message) => message.type === "error");
  overflow.send(
    JSON.stringify({ type: "join", version: PROTOCOL_VERSION, room: ROOM, state: baseState(99) })
  );
  assert.equal((await error).code, "room-full");
});
