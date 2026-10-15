/**
 * Generates the brand + PWA icon set from the real NexVote logo.
 *
 * iOS requires PNG Home Screen / touch icons (an SVG apple-touch-icon is
 * ignored), and Chromium's installability check wants 192px/512px PNG
 * entries — SVG-only manifests degrade "Add to Home Screen", which is exactly
 * the path iOS users need for Web Push.
 *
 * Source of truth: `public/nexvote_logo.jpeg` (1254×1254 lock-up: ballot-box
 * badge + wordmark on the brand gradient). Everything else under `public/`
 * that carries the brand is derived from it:
 *
 *   icon-192.png / icon-512.png  — manifest + browser tab icons (full artwork)
 *   icon-maskable-512.png        — Android maskable icon; full-bleed so the
 *                                  gradient covers the canvas while the
 *                                  artwork's content stays inside the 80%
 *                                  maskable safe circle
 *   apple-touch-icon.png (180)   — iOS Home Screen icon, opaque PNG
 *   logo-mark.png (512)          — square crop of just the ballot-box badge,
 *                                  for tight UI spots next to the product name
 *   icon.svg / icon-maskable.svg / logo.svg — the same artwork embedded as a
 *                                  data URI, so every existing reference (PWA
 *                                  manifest, page metadata, push notification
 *                                  icons) shows the real logo too
 *
 * Run with: node scripts/generate-pwa-icons.mjs
 * Re-run only when `public/nexvote_logo.jpeg` changes; the outputs are
 * committed. Uses `sharp`, which Next.js installs for image optimization.
 */
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import sharp from "sharp";

const here = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.resolve(here, "..", "public");
const source = path.join(publicDir, "nexvote_logo.jpeg");

/** Crop of the ballot-box badge inside the 1254×1254 lock-up (even 35px margin). */
const MARK_CROP = { left: 350, top: 223, width: 550, height: 550 };

/**
 * @param {string} name output file name inside `public/`
 * @param {number} size square edge length in px
 * @param {{ mark?: boolean }} [options] crop to the badge first when `mark`
 */
async function writePng(name, size, options = {}) {
  let pipeline = sharp(source);
  if (options.mark) pipeline = pipeline.extract(MARK_CROP);
  const { data, info } = await pipeline
    .resize(size, size, { fit: "fill" })
    .png()
    .toBuffer({ resolveWithObject: true });
  await writeFile(path.join(publicDir, name), data);
  console.log(`wrote public/${name} (${info.width}x${info.height}, ${data.length} bytes)`);
}

/**
 * Self-contained SVG: the logo JPEG embedded as a data URI, so plain `.svg`
 * references keep resolving to the real artwork.
 * @param {string} name output file name inside `public/`
 */
async function writeSvg(name) {
  const embedded = await sharp(source)
    .resize(512, 512, { fit: "fill" })
    .jpeg({ quality: 85 })
    .toBuffer();
  const href = `data:image/jpeg;base64,${embedded.toString("base64")}`;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512" role="img" aria-label="NexVote">` +
    `<image width="512" height="512" href="${href}"/>` +
    `</svg>`;
  await writeFile(path.join(publicDir, name), svg, "utf8");
  console.log(`wrote public/${name} (${svg.length} bytes)`);
}

await writePng("icon-192.png", 192);
await writePng("icon-512.png", 512);
await writePng("icon-maskable-512.png", 512);
// iOS Home Screen icon must be an opaque PNG (iOS applies its own rounding).
await writePng("apple-touch-icon.png", 180);
await writePng("logo-mark.png", 512, { mark: true });
await writeSvg("icon.svg");
await writeSvg("icon-maskable.svg");
await writeSvg("logo.svg");