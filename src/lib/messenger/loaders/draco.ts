/**
 * Clean loader for abeto's `.drc` geometry, rebuilt from scratch for the
 * React/Three.js port. It reuses the original Draco WASM decoder (mirrored at
 * /assets/libs/draco/) but is otherwise our own code.
 *
 * Container format (reverse-engineered from the original `dracoworker`):
 *   - If the buffer starts with the ASCII magic "DRACO", the WHOLE buffer is a
 *     standard Draco stream and the attribute map is stored in Draco metadata
 *     under the "info" key.
 *   - Otherwise the first 4 bytes are a uint32 JSON length, followed by the
 *     attribute-map JSON, followed by the raw Draco stream.
 *
 * The "info" JSON looks like:
 *   { "type": 0, "attributes": [["position", 7], ["normal", 7], ["uv", 7], ...] }
 * where `type` is 0 = mesh / 1 = point cloud, and each attribute is
 * [name, typedArrayIndex] indexing TYPED_ARRAYS below. Attribute unique ids are
 * the array order (0..n).
 */
import { BufferGeometry, BufferAttribute } from "three";
import { DRACO_BASE } from "@/lib/messenger/assets";

const TYPED_ARRAYS = [
  Int8Array,
  Uint8Array,
  Uint8ClampedArray,
  Int16Array,
  Uint16Array,
  Int32Array,
  Uint32Array,
  Float32Array,
  Float64Array,
] as const;

type TypedArrayCtor = (typeof TYPED_ARRAYS)[number];

interface DrcInfo {
  type: 0 | 1;
  attributes: [string, number][];
  userData?: Record<string, unknown>;
}

// Minimal structural typing for the parts of the emscripten module we touch.
interface DracoModule {
  Decoder: new () => DracoDecoder;
  Mesh: new () => DracoGeometry;
  PointCloud: new () => DracoGeometry;
  MetadataQuerier: new () => DracoMetadataQuerier;
  TRIANGULAR_MESH: number;
  POINT_CLOUD: number;
  DT_FLOAT32: number;
  DT_INT8: number;
  DT_INT16: number;
  DT_INT32: number;
  DT_UINT8: number;
  DT_UINT16: number;
  DT_UINT32: number;
  HEAPF32: { buffer: ArrayBuffer };
  _malloc: (n: number) => number;
  _free: (ptr: number) => void;
  destroy: (obj: unknown) => void;
}

interface DracoGeometry {
  ptr: number;
  num_faces: () => number;
  num_points: () => number;
}
interface DracoAttribute {
  num_components: () => number;
}
interface DracoStatus {
  ok: () => boolean;
  error_msg: () => string;
}
interface DracoDecoder {
  GetEncodedGeometryType: (data: Int8Array) => number;
  DecodeArrayToMesh: (data: Int8Array, len: number, out: DracoGeometry) => DracoStatus;
  DecodeArrayToPointCloud: (data: Int8Array, len: number, out: DracoGeometry) => DracoStatus;
  GetMetadata: (geom: DracoGeometry) => unknown;
  GetAttributeByUniqueId: (geom: DracoGeometry, id: number) => DracoAttribute;
  GetAttributeDataArrayForAllPoints: (
    geom: DracoGeometry,
    attr: DracoAttribute,
    dataType: number,
    size: number,
    ptr: number
  ) => void;
  GetTrianglesUInt32Array: (geom: DracoGeometry, size: number, ptr: number) => void;
}
interface DracoMetadataQuerier {
  HasEntry: (metadata: unknown, key: string) => boolean;
  GetStringEntry: (metadata: unknown, key: string) => string;
}

let modulePromise: Promise<DracoModule> | null = null;

/** Loads the original Draco WASM decoder exactly once. */
function getDecoderModule(): Promise<DracoModule> {
  if (modulePromise) return modulePromise;
  modulePromise = (async () => {
    const wrapperUrl = new URL(DRACO_BASE + "draco_wasm_wrapper.js", location.origin).href;
    // Runtime ESM import that bundlers must not try to resolve at build time.
    const dynamicImport = new Function("u", "return import(u)") as (
      u: string
    ) => Promise<{ default: (opts: { wasmBinary: ArrayBuffer }) => Promise<DracoModule> }>;
    const [{ default: factory }, wasmBinary] = await Promise.all([
      dynamicImport(wrapperUrl),
      fetch(DRACO_BASE + "draco_decoder.wasm", { credentials: "same-origin" }).then((r) =>
        r.arrayBuffer()
      ),
    ]);
    return factory({ wasmBinary });
  })();
  return modulePromise;
}

function dataTypeFor(m: DracoModule, ctor: TypedArrayCtor): number {
  switch (ctor) {
    case Float32Array:
      return m.DT_FLOAT32;
    case Int8Array:
      return m.DT_INT8;
    case Int16Array:
      return m.DT_INT16;
    case Int32Array:
      return m.DT_INT32;
    case Uint8Array:
    case Uint8ClampedArray:
      return m.DT_UINT8;
    case Uint16Array:
      return m.DT_UINT16;
    case Uint32Array:
      return m.DT_UINT32;
    default:
      return m.DT_FLOAT32;
  }
}

// THREE attribute names we map abeto's names onto; everything else is kept as-is
// (e.g. surfaceId/elementId/batchId), available for custom shaders later.
const NAME_MAP: Record<string, string> = {
  position: "position",
  normal: "normal",
  uv: "uv",
  color: "color",
};

const textDecoder = new TextDecoder();

/** Decode a `.drc` ArrayBuffer into a Three.js BufferGeometry. */
export async function decodeDrc(buffer: ArrayBuffer): Promise<BufferGeometry> {
  const m = await getDecoderModule();
  const decoder = new m.Decoder();
  try {
    const startsWithMagic =
      textDecoder.decode(new Uint8Array(buffer.slice(0, 5))) === "DRACO";

    let stream: Int8Array;
    let info: DrcInfo | null = null;

    if (startsWithMagic) {
      stream = new Int8Array(buffer);
    } else {
      const jsonLen = new Uint32Array(buffer.slice(0, 4))[0];
      info = JSON.parse(textDecoder.decode(buffer.slice(4, 4 + jsonLen))) as DrcInfo;
      stream = new Int8Array(buffer.slice(4 + jsonLen));
    }

    const geomType = decoder.GetEncodedGeometryType(stream);
    const out =
      geomType === m.TRIANGULAR_MESH ? new m.Mesh() : new m.PointCloud();
    const status =
      geomType === m.TRIANGULAR_MESH
        ? decoder.DecodeArrayToMesh(stream, stream.byteLength, out)
        : decoder.DecodeArrayToPointCloud(stream, stream.byteLength, out);

    if (!status.ok() || out.ptr === 0) {
      throw new Error(`Draco decode failed: ${status.error_msg()}`);
    }

    if (startsWithMagic) {
      const querier = new m.MetadataQuerier();
      const metadata = decoder.GetMetadata(out);
      if (querier.HasEntry(metadata, "info")) {
        info = JSON.parse(querier.GetStringEntry(metadata, "info")) as DrcInfo;
      }
      m.destroy(querier);
    }

    if (!info) throw new Error("Draco decode: missing attribute info metadata");

    const geometry = new BufferGeometry();
    if (info.userData) geometry.userData = info.userData;

    info.attributes.forEach(([name, typeIndex], uniqueId) => {
      const Ctor = TYPED_ARRAYS[typeIndex];
      const attribute = decoder.GetAttributeByUniqueId(out, uniqueId);
      const components = attribute.num_components();
      const count = out.num_points() * components;
      const bytes = count * Ctor.BYTES_PER_ELEMENT;
      const ptr = m._malloc(bytes);
      decoder.GetAttributeDataArrayForAllPoints(
        out,
        attribute,
        dataTypeFor(m, Ctor),
        bytes,
        ptr
      );
      const src = new Ctor(m.HEAPF32.buffer, ptr, count).slice();
      m._free(ptr);

      const threeName = NAME_MAP[name] ?? name;
      const normalized = name === "color" && !(src instanceof Float32Array);
      // All typed-array variants satisfy THREE's TypedArray param structurally.
      geometry.setAttribute(
        threeName,
        new BufferAttribute(src as unknown as Float32Array, components, normalized)
      );
    });

    if (geomType === m.TRIANGULAR_MESH) {
      const indexCount = out.num_faces() * 3;
      const bytes = indexCount * 4;
      const ptr = m._malloc(bytes);
      decoder.GetTrianglesUInt32Array(out, bytes, ptr);
      const index = new Uint32Array(m.HEAPF32.buffer, ptr, indexCount).slice();
      m._free(ptr);
      geometry.setIndex(new BufferAttribute(index, 1));
    }

    m.destroy(out);

    if (!geometry.getAttribute("normal") && geomType === m.TRIANGULAR_MESH) {
      geometry.computeVertexNormals();
    }
    geometry.computeBoundingSphere();
    return geometry;
  } finally {
    m.destroy(decoder);
  }
}

const geometryCache = new Map<string, Promise<BufferGeometry>>();

/** Fetch + decode a `.drc` URL, cached by URL. */
export function loadDrc(url: string): Promise<BufferGeometry> {
  let cached = geometryCache.get(url);
  if (!cached) {
    cached = fetch(url, { credentials: "same-origin" })
      .then((r) => {
        if (!r.ok) throw new Error(`Failed to fetch ${url}: ${r.status}`);
        return r.arrayBuffer();
      })
      .then(decodeDrc);
    geometryCache.set(url, cached);
  }
  return cached;
}
