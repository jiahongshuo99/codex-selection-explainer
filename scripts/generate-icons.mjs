import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import zlib from "node:zlib";
import { PROJECT_ROOT } from "./manifest-utils.mjs";

const ICON_DIR = path.join(PROJECT_ROOT, "extension", "icons");
const SIZES = [16, 32, 48, 128];

function makeCrcTable() {
  const table = new Uint32Array(256);

  for (let i = 0; i < 256; i += 1) {
    let value = i;

    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }

    table[i] = value >>> 0;
  }

  return table;
}

const CRC_TABLE = makeCrcTable();

function crc32(buffer) {
  let crc = 0xffffffff;

  for (const byte of buffer) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }

  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data = Buffer.alloc(0)) {
  const typeBuffer = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, crc]);
}

function insideRoundedRect(x, y, size) {
  const margin = size * 0.06;
  const radius = size * 0.22;
  const min = margin;
  const max = size - margin;
  const cx = Math.max(min + radius, Math.min(x, max - radius));
  const cy = Math.max(min + radius, Math.min(y, max - radius));
  return Math.hypot(x - cx, y - cy) <= radius || (x >= min && x <= max && y >= min && y <= max);
}

function cStrokeAlpha(x, y, size) {
  const cx = size * 0.52;
  const cy = size * 0.55;
  const radius = size * 0.28;
  const stroke = size * 0.11;
  const distance = Math.abs(Math.hypot(x - cx, y - cy) - radius);
  const angle = Math.atan2(y - cy, x - cx);

  if (angle > -0.55 && angle < 0.72) {
    return 0;
  }

  return distance <= stroke ? 1 : 0;
}

function sparkleAlpha(x, y, size) {
  const vertical = Math.abs(x - size * 0.75) < size * 0.045 && Math.abs(y - size * 0.31) < size * 0.13;
  const horizontal = Math.abs(y - size * 0.31) < size * 0.045 && Math.abs(x - size * 0.75) < size * 0.13;
  return vertical || horizontal ? 1 : 0;
}

function blend(base, color, alpha) {
  const nextAlpha = alpha + base[3] * (1 - alpha);

  if (nextAlpha === 0) {
    return [0, 0, 0, 0];
  }

  return [
    (color[0] * alpha + base[0] * base[3] * (1 - alpha)) / nextAlpha,
    (color[1] * alpha + base[1] * base[3] * (1 - alpha)) / nextAlpha,
    (color[2] * alpha + base[2] * base[3] * (1 - alpha)) / nextAlpha,
    nextAlpha
  ];
}

function pixelColor(px, py, size) {
  const samples = 4;
  let color = [0, 0, 0, 0];

  for (let sy = 0; sy < samples; sy += 1) {
    for (let sx = 0; sx < samples; sx += 1) {
      const x = px + (sx + 0.5) / samples;
      const y = py + (sy + 0.5) / samples;
      let sample = [0, 0, 0, 0];

      if (insideRoundedRect(x, y, size)) {
        sample = blend(sample, [17, 24, 39], 1);
      }

      sample = blend(sample, [248, 250, 252], cStrokeAlpha(x, y, size));
      sample = blend(sample, [56, 189, 248], sparkleAlpha(x, y, size));
      color = blend(color, sample, sample[3] / (samples * samples));
    }
  }

  return color.map((channel, index) =>
    Math.max(0, Math.min(255, Math.round(index === 3 ? channel * 255 : channel)))
  );
}

function createPng(size) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  let offset = 0;

  for (let y = 0; y < size; y += 1) {
    raw[offset] = 0;
    offset += 1;

    for (let x = 0; x < size; x += 1) {
      const [r, g, b, a] = pixelColor(x, y, size);
      raw[offset] = r;
      raw[offset + 1] = g;
      raw[offset + 2] = b;
      raw[offset + 3] = a;
      offset += 4;
    }
  }

  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  return Buffer.concat([
    signature,
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", zlib.deflateSync(raw)),
    pngChunk("IEND")
  ]);
}

await mkdir(ICON_DIR, { recursive: true });

for (const size of SIZES) {
  await writeFile(path.join(ICON_DIR, `icon${size}.png`), createPng(size));
}

console.log(`Generated icons in ${ICON_DIR}`);
