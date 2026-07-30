import { createHash } from "node:crypto";
import { mkdir, readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const ASSET_ORIGIN = "https://messenger.abeto.co/assets";
const FORCE = process.argv.includes("--force");
const MAX_FILE_BYTES = 256 * 1024;
const CONCURRENCY = 4;
const REQUEST_TIMEOUT_MS = 20_000;
const RETRIES = 2;

const assets = [
  ...Array.from({ length: 10 }, (_, index) => ({
    url: `${ASSET_ORIGIN}/geometries/emojis/${index + 1}.drc`,
    output: resolve(`public/assets/geometries/emojis/${index + 1}.drc`),
  })),
  ...[1, 2, 3].flatMap((index) =>
    ["starts", "ends"].map((phase) => ({
      url: `${ASSET_ORIGIN}/audio/character/emoji-${phase}${index}.ogg`,
      output: resolve(`public/assets/audio/character/emoji-${phase}${index}.ogg`),
    }))
  ),
];

const sleep = (milliseconds) => new Promise((resolveSleep) => setTimeout(resolveSleep, milliseconds));

async function fetchAsset(asset) {
  if (!FORCE) {
    try {
      const existing = await stat(asset.output);
      if (existing.size > 0 && existing.size <= MAX_FILE_BYTES) return { ...asset, skipped: true };
    } catch {
      // Missing output is downloaded below.
    }
  }

  await mkdir(dirname(asset.output), { recursive: true });
  const partial = `${asset.output}.partial`;
  for (let attempt = 0; attempt <= RETRIES; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(asset.url, { redirect: "follow", signal: controller.signal });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const type = response.headers.get("content-type") ?? "";
      if (type.includes("text/html")) throw new Error(`unexpected content type ${type}`);
      const bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.length === 0 || bytes.length > MAX_FILE_BYTES) {
        throw new Error(`unexpected size ${bytes.length}`);
      }
      await writeFile(partial, bytes);
      await rename(partial, asset.output);
      return {
        ...asset,
        bytes: bytes.length,
        sha256: createHash("sha256").update(bytes).digest("hex"),
      };
    } catch (error) {
      await unlink(partial).catch(() => {});
      if (attempt === RETRIES) throw new Error(`${asset.url}: ${error.message}`);
      await sleep(300 * 2 ** attempt);
    } finally {
      clearTimeout(timeout);
    }
  }
}

const queue = [...assets];
const results = [];
async function worker() {
  while (queue.length > 0) {
    const asset = queue.shift();
    if (!asset) return;
    results.push(await fetchAsset(asset));
  }
}

await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));

for (const result of results.sort((a, b) => a.output.localeCompare(b.output))) {
  if (result.skipped) {
    const bytes = await readFile(result.output);
    console.log(`kept ${result.output} ${bytes.length} bytes`);
  } else {
    console.log(`fetched ${result.output} ${result.bytes} bytes sha256=${result.sha256}`);
  }
}
