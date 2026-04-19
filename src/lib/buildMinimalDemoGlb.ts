/** Tiny valid glTF 2.0 binary (single triangle). Used for offline encounter-mesh smoke tests. */

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

/** BIN chunk payload: POSITION (3×vec3) + indices (3×uint16) + pad to multiple of 4. */
function binPayload(): Uint8Array {
  const buf = new ArrayBuffer(44);
  const dv = new DataView(buf);
  let o = 0;
  const v = (x: number, y: number, z: number) => {
    dv.setFloat32(o, x, true);
    o += 4;
    dv.setFloat32(o, y, true);
    o += 4;
    dv.setFloat32(o, z, true);
    o += 4;
  };
  v(0, 0, 0);
  v(1, 0, 0);
  v(0, 1, 0);
  dv.setUint16(o, 0, true);
  o += 2;
  dv.setUint16(o, 1, true);
  o += 2;
  dv.setUint16(o, 2, true);
  o += 2;
  dv.setUint16(o, 0, true);
  o += 2;
  return new Uint8Array(buf);
}

export function buildMinimalDemoGlb(): Uint8Array {
  const json = JSON.stringify({
    asset: { version: "2.0" },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0 }],
    meshes: [
      {
        primitives: [
          {
            attributes: { POSITION: 0 },
            indices: 1,
            mode: 4,
          },
        ],
      },
    ],
    accessors: [
      {
        bufferView: 0,
        componentType: 5126,
        count: 3,
        type: "VEC3",
        max: [1, 1, 0],
        min: [0, 0, 0],
      },
      {
        bufferView: 1,
        componentType: 5123,
        count: 3,
        type: "SCALAR",
      },
    ],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: 36 },
      { buffer: 0, byteOffset: 36, byteLength: 6 },
    ],
    buffers: [{ byteLength: 44 }],
  });

  const jsonChunk = padJsonChunk(json);
  const binChunk = padBinChunk(binPayload());

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
