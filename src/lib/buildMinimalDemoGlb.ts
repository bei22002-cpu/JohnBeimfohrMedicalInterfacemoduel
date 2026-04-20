/** Tiny valid glTF 2.0 binary (low-poly icosahedron). Used for offline encounter-mesh demos/smoke tests. */

const GLTF_MAGIC = 0x46546c67; // "glTF"
const GLTF_VERSION = 2;
const CHUNK_JSON = 0x4e4f534a; // "JSON"
const CHUNK_BIN = 0x004e4942; // "BIN\0"

function padJsonChunk(json: string): Uint8Array {
  const src = new TextEncoder().encode(json);
  const pad = (4 - (src.length % 4)) % 4;
  const out = new Uint8Array(src.length + pad);
  out.set(src);
  for (let i = 0; i < pad; i++) out[src.length + i] = 0x20;
  return out;
}

function padBinChunk(bin: Uint8Array): Uint8Array {
  const pad = (4 - (bin.length % 4)) % 4;
  if (pad === 0) return bin;
  const out = new Uint8Array(bin.length + pad);
  out.set(bin);
  return out;
}

const ICO_POSITIONS: ReadonlyArray<readonly [number, number, number]> = (() => {
  // Classic icosahedron (normalized-ish). We keep it small and centered.
  const t = (1 + Math.sqrt(5)) / 2;
  const s = 1 / Math.sqrt(1 + t * t); // normalize so vertex length ~ 1
  const a = s;
  const b = t * s;
  return [
    [-a, b, 0],
    [a, b, 0],
    [-a, -b, 0],
    [a, -b, 0],
    [0, -a, b],
    [0, a, b],
    [0, -a, -b],
    [0, a, -b],
    [b, 0, -a],
    [b, 0, a],
    [-b, 0, -a],
    [-b, 0, a],
  ] as const;
})();

const ICO_INDICES: ReadonlyArray<readonly [number, number, number]> = [
  [0, 11, 5],
  [0, 5, 1],
  [0, 1, 7],
  [0, 7, 10],
  [0, 10, 11],
  [1, 5, 9],
  [5, 11, 4],
  [11, 10, 2],
  [10, 7, 6],
  [7, 1, 8],
  [3, 9, 4],
  [3, 4, 2],
  [3, 2, 6],
  [3, 6, 8],
  [3, 8, 9],
  [4, 9, 5],
  [2, 4, 11],
  [6, 2, 10],
  [8, 6, 7],
  [9, 8, 1],
];

function normalize3([x, y, z]: readonly [number, number, number]): [number, number, number] {
  const m = Math.sqrt(x * x + y * y + z * z) || 1;
  return [x / m, y / m, z / m];
}

/**
 * BIN chunk payload:
 * - POSITION: 12 × vec3 (float32)
 * - NORMAL:   12 × vec3 (float32) (normalized from position; good enough for a demo)
 * - indices:  60 × uint16
 */
function binPayload(): { bin: Uint8Array; positionBytes: number; normalBytes: number; indexBytes: number } {
  const vertexCount = ICO_POSITIONS.length;
  const triCount = ICO_INDICES.length;
  const indexCount = triCount * 3;

  const positionBytes = vertexCount * 3 * 4;
  const normalBytes = vertexCount * 3 * 4;
  const indexBytes = indexCount * 2;
  const totalBytes = positionBytes + normalBytes + indexBytes;

  const buf = new ArrayBuffer(totalBytes);
  const dv = new DataView(buf);
  let o = 0;

  const f32 = (x: number) => {
    dv.setFloat32(o, x, true);
    o += 4;
  };
  const u16 = (x: number) => {
    dv.setUint16(o, x, true);
    o += 2;
  };

  for (const p of ICO_POSITIONS) {
    f32(p[0]);
    f32(p[1]);
    f32(p[2]);
  }

  for (const p of ICO_POSITIONS) {
    const n = normalize3(p);
    f32(n[0]);
    f32(n[1]);
    f32(n[2]);
  }

  for (const [a, b, c] of ICO_INDICES) {
    u16(a);
    u16(b);
    u16(c);
  }

  return { bin: new Uint8Array(buf), positionBytes, normalBytes, indexBytes };
}

export function buildMinimalDemoGlb(): Uint8Array {
  const payload = binPayload();
  const bin = padBinChunk(payload.bin);

  const posMin: [number, number, number] = [Infinity, Infinity, Infinity];
  const posMax: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (const [x, y, z] of ICO_POSITIONS) {
    posMin[0] = Math.min(posMin[0], x);
    posMin[1] = Math.min(posMin[1], y);
    posMin[2] = Math.min(posMin[2], z);
    posMax[0] = Math.max(posMax[0], x);
    posMax[1] = Math.max(posMax[1], y);
    posMax[2] = Math.max(posMax[2], z);
  }

  const json = JSON.stringify({
    asset: { version: "2.0" },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0 }],
    meshes: [
      {
        primitives: [
          {
            attributes: { POSITION: 0, NORMAL: 1 },
            indices: 2,
            mode: 4,
          },
        ],
      },
    ],
    accessors: [
      {
        bufferView: 0,
        componentType: 5126,
        count: ICO_POSITIONS.length,
        type: "VEC3",
        max: posMax,
        min: posMin,
      },
      {
        bufferView: 1,
        componentType: 5126,
        count: ICO_POSITIONS.length,
        type: "VEC3",
      },
      {
        bufferView: 2,
        componentType: 5123,
        count: ICO_INDICES.length * 3,
        type: "SCALAR",
      },
    ],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: payload.positionBytes },
      { buffer: 0, byteOffset: payload.positionBytes, byteLength: payload.normalBytes },
      { buffer: 0, byteOffset: payload.positionBytes + payload.normalBytes, byteLength: payload.indexBytes },
    ],
    buffers: [{ byteLength: bin.length }],
  });

  const jsonChunk = padJsonChunk(json);
  const binChunk = bin;

  const headerSize = 12;
  const jsonBlock = 8 + jsonChunk.length;
  const binBlock = 8 + binChunk.length;
  const total = headerSize + jsonBlock + binBlock;

  const out = new Uint8Array(total);
  const dv = new DataView(out.buffer);
  let off = 0;
  dv.setUint32(off, GLTF_MAGIC, true);
  off += 4;
  dv.setUint32(off, GLTF_VERSION, true);
  off += 4;
  dv.setUint32(off, total, true);
  off += 4;

  dv.setUint32(off, jsonChunk.length, true);
  off += 4;
  dv.setUint32(off, CHUNK_JSON, true);
  off += 4;
  out.set(jsonChunk, off);
  off += jsonChunk.length;

  dv.setUint32(off, binChunk.length, true);
  off += 4;
  dv.setUint32(off, CHUNK_BIN, true);
  off += 4;
  out.set(binChunk, off);

  return out;
}
