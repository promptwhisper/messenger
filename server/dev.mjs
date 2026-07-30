import { spawn } from "node:child_process";

const children = [
  spawn("pnpm", ["exec", "next", "dev"], {
    stdio: "inherit",
    env: { ...process.env, NEXT_PUBLIC_MULTIPLAYER_URL: "ws://localhost:3001/realtime" },
  }),
  spawn(process.execPath, ["server/realtime.mjs", "--port", "3001"], {
    stdio: "inherit",
    env: process.env,
  }),
];

let stopping = false;
function stop(signal = "SIGTERM") {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (!child.killed) child.kill(signal);
  }
}

for (const child of children) {
  child.once("exit", (code, signal) => {
    if (!stopping) {
      stop();
      process.exitCode = code ?? (signal ? 1 : 0);
    }
  });
}

process.once("SIGINT", () => stop("SIGINT"));
process.once("SIGTERM", () => stop("SIGTERM"));
