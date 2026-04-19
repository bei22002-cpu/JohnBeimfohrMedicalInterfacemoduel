/**
 * Writes the same minimal triangle GLB as `src/lib/buildMinimalDemoGlb.ts`.
 * Run: `npm run write-demo-glb` — keeps `public/meshes/demo/triangle.glb` in sync for static hosting.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const GLTF_MAGIC = 0x46546c67;
const GLTF_VERSION = 2;
const CHUNK_JSON = 0x4e4f534a;
const CHUNK_BIN = 0x004e4942;

function padJsonChunk(json) {
  const src = Buffer.from(json, "utf8");
  const pad = (4 - (src.length % 4)) % 4;
  return Buffer.concat([src, Buffer.alloc(pad, 0x20)]);
}

function padBinChunk(bin) {
  const pad = (4 - (bin.length % 4)) % 4;
  if (pad === 0) return bin;
  return Buffer.concat([bin, Buffer.alloc(pad, 0)]);
}

function binPayload() {
  const buf = Buffer.alloc(44);
  let o = 0;
  const v = (x, y, z) => {
    buf.writeFloatLE(x, o);
    o += 4;
    buf.writeFloatLE(y, o);
    o += 4;
    buf.writeFloatLE(z, o);
    o += 4;
  };
  v(0, 0, 0);
  v(1, 0, 0);
  v(0, 1, 0);
  buf.writeUInt16LE(0, o);
  o += 2;
  buf.writeUInt16LE(1, o);
  o += 2;
  buf.writeUInt16LE(2, o);
  o += 2;
  buf.writeUInt16LE(0, o);
  o += 2;
  return buf;
}

function buildMinimalDemoGlb() {
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

  const out = Buffer.alloc(total);
  let off = 0;
  out.writeUInt32LE(GLTF_MAGIC, off);
  off += 4;
  out.writeUInt32LE(GLTF_VERSION, off);
  off += 4;
  out.writeUInt32LE(total, off);
  off += 4;

  out.writeUInt32LE(jsonChunk.length, off);
  off += 4;
  out.writeUInt32LE(CHUNK_JSON, off);
  off += 4;
  jsonChunk.copy(out, off);
  off += jsonChunk.length;

  out.writeUInt32LE(binChunk.length, off);
  off += 4;
  out.writeUInt32LE(CHUNK_BIN, off);
  off += 4;
  binChunk.copy(out, off);

  return out;
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const outDir = path.join(root, "public", "meshes", "demo");
const outFile = path.join(outDir, "triangle.glb");

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(outFile, buildMinimalDemoGlb());
console.log("Wrote", outFile);
