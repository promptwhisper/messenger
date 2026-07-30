import { createHash } from "node:crypto";
import { mkdir, readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const ASSET_ORIGIN = "https://messenger.abeto.co/assets";
const FORCE = process.argv.includes("--force");
const MAX_FILE_BYTES = 16 * 1024 * 1024;
const CONCURRENCY = 4;
const REQUEST_TIMEOUT_MS = 30_000;
const RETRIES = 2;

// Only assets used by our clean-room rendering implementation are mirrored.
// Each request is bounded by type, size, timeout, retries and an atomic rename.
const imageFilenames = [
  "clouds_noise_512.ktx2",
  "noise-simplex-layered-pixellated-highq.ktx2",
  "noise-simplex-layered-blur-highq.ktx2",
  "noises-terrain.ktx2",
  "particle_sprites.ktx2",
  "tree-leaves.ktx2",
  "tree-leaves-detail.ktx2",
  "water-noises-highq.ktx2",
];

const geometryFilenames = [
  "waterfall_vfx.drc",
  "waterfallsplash_vfx.drc",
  "waterfall_inlet_vfx.drc",
  "beachfoam_vfx.drc",
  "smoke-1.drc",
  "cables-1.drc",
  "cables-2.drc",
  "butterflies.drc",
  ...Array.from({ length: 5 }, (_, index) => `tree-leaves_${index}.drc`),
];

const extraGeometryPaths = ["birds/curve-1.drc", "birds/1.drc"];

const assets = [
  ...imageFilenames.map((filename) => ({
    kind: "ktx2",
    url: `${ASSET_ORIGIN}/images/${filename}`,
    output: resolve(`public/assets/images/${filename}`),
  })),
  ...geometryFilenames.map((filename) => ({
    kind: "draco",
    url: `${ASSET_ORIGIN}/geometries/planets/present/${filename}`,
    output: resolve(`public/assets/geometries/planets/present/${filename}`),
  })),
  ...extraGeometryPaths.map((path) => ({
    kind: "draco",
    url: `${ASSET_ORIGIN}/geometries/${path}`,
    output: resolve(`public/assets/geometries/${path}`),
  })),
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
      if (asset.kind === "ktx2" && !type.includes("image/ktx2") && !type.includes("application/octet-stream")) {
        throw new Error(`unexpected content type ${type || "missing"}`);
      }
      const announcedBytes = Number(response.headers.get("content-length") ?? 0);
      if (announcedBytes > MAX_FILE_BYTES) throw new Error(`announced size ${announcedBytes}`);
      const bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.length < 64 || bytes.length > MAX_FILE_BYTES) {
        throw new Error(`unexpected size ${bytes.length}`);
      }
      if (asset.kind === "ktx2") {
        // KTX 2.0 identifier: AB 4B 54 58 20 32 30 BB 0D 0A 1A 0A.
        const signature = bytes.subarray(0, 12).toString("hex");
        if (signature !== "ab4b5458203230bb0d0a1a0a") throw new Error("invalid KTX2 signature");
      } else if (bytes.subarray(0, 5).toString("ascii") !== "DRACO") {
        throw new Error("invalid Draco signature");
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
