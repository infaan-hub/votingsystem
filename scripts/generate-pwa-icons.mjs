/**
 * Generates the raster PWA icons. iOS requires PNG Home Screen / touch icons
 * (an SVG apple-touch-icon is ignored), and Chromium's installability check
 * wants 192px/512px PNG entries — SVG-only manifests degrade "Add to Home
 * Screen", which is exactly the path iOS users need for Web Push.
 *
 * Run with: node scripts/generate-pwa-icons.mjs
 * Re-run only when the brand mark changes; the PNGs are committed.
 */
import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const BRAND = [0xbb, 0x18, 0x2e]; // #BB182E
const WHITE = [255, 255, 255];

/* ---------------- minimal PNG encoder (8-bit RGBA) ---------------- */
const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const typeAndData = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeAndData));
  return Buffer.concat([length, typeAndData, crc]);
}

function encodePng(width, height, pixelFn) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  let offset = 0;
  for (let y = 0; y < height; y += 1) {
    raw[offset] = 0; // filter: none
    offset += 1;
    for (let x = 0; x < width; x += 1) {
      const [r, g, b, a] = pixelFn(x / width, y / height, width);
      raw[offset] = r;
      raw[offset + 1] = g;
      raw[offset + 2] = b;
      raw[offset + 3] = a;
      offset += 4;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/* ---------------- the mark: ballot check ---------------- */
function distToSegment(px, py, ax, ay, bx, by) {
  const vx = bx - ax;
  const vy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / (vx * vx + vy * vy)));
  const dx = px - (ax + t * vx);
  const dy = py - (ay + t * vy);
  return Math.hypot(dx, dy);
}

function drawIcon(px, py, /** @type {number} */ size, /** @type {boolean} */ maskableSafeZone) {
  // Maskable icons keep the mark inside the ~80% safe circle.
  const inset = maskableSafeZone ? 0.2 : 0.06;
  const x = (px - inset) / (1 - inset * 2);
  const y = (py - inset) / (1 - inset * 2);
  if (x < 0 || x > 1 || y < 0 || y > 1) return [0, 0, 0, 0];

  const brand = BRAND;
  // Rounded frame.
  const frame = x <= 0.05 || x >= 0.95 || y <= 0.05 || y >= 0.95;
  if (frame && !maskableSafeZone) return [...brand, 255];

  // Check mark: two segments, thickness relative to size.
  const thickness = 0.085;
  const d1 = distToSegment(x, y, 0.28, 0.53, 0.44, 0.68);
  const d2 = distToSegment(x, y, 0.44, 0.68, 0.74, 0.33);
  if (d1 <= thickness || d2 <= thickness) return [...WHITE, 255];

  return [...brand, 255];
}

const here = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.resolve(here, "..", "public");

/** @param {"any" | "maskable"} purpose @param {number} size */
function writeIconFile(name, purpose, size) {
  const png = encodePng(size, size, (px, py) => drawIcon(px, py, size, purpose === "maskable"));
  writeFileSync(path.join(publicDir, name), png);
  console.log(`wrote public/${name} (${size}x${size}, ${png.length} bytes)`);
}

writeIconFile("icon-192.png", "any", 192);
writeIconFile("icon-512.png", "any", 512);
writeIconFile("icon-maskable-512.png", "maskable", 512);
// iOS Home Screen icon must be an opaque PNG (iOS applies its own rounding).
writeIconFile("apple-touch-icon.png", "any", 180);
