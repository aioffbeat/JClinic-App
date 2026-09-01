#!/usr/bin/env node
/**
 * Generate the app icon, adaptive icon and splash mark.
 *
 * Written rather than hand-drawn because the only brand asset that exists is a 176×68 wordmark —
 * upscaling that 6× for a 1024px icon would ship something visibly soft. These are drawn from the
 * brand tokens at full resolution instead, so every density is sharp.
 *
 * PNGs are encoded here directly (zlib is in Node) to avoid adding an image dependency for three
 * files that only need to be produced once.
 *
 *   node scripts/make-icons.mjs
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets');

// ---- brand -------------------------------------------------------------------------------------
const TEAL_BRIGHT = [0x16, 0xb5, 0xae];
const BLUE = [0x2d, 0x6c, 0xdf];
const NAVY = [0x1b, 0x3a, 0x8f];
const MIST = [0xf2, 0xf7, 0xf6];
const PETROL = [0x10, 0x33, 0x3a];
const LIME = [0xbf, 0xd2, 0x3f];
const GREEN = [0x3f, 0xa3, 0x4d];
const TEAL = [0x11, 0x9d, 0xa4];

const lerp = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));

/** The hero's three-stop gradient, sampled corner to corner. */
function heroAt(t) {
  return t < 0.55 ? lerp(TEAL_BRIGHT, BLUE, t / 0.55) : lerp(BLUE, NAVY, (t - 0.55) / 0.45);
}

/**
 * One lotus petal.
 *
 * The petal is an ellipse whose CENTRE is swung around a pivot below the mark, so the petals fan
 * upward from a common point like a real lotus. Rotating each ellipse about its own centre — the
 * first attempt — produces a symmetric rosette instead, which reads as a flower stamp, not a lotus.
 *
 * The soft edge is measured in PIXELS, not in normalised distance. A fixed normalised band is a
 * different physical width for every ellipse size, and at icon scale it turned a crisp petal into
 * a 20px glow.
 */
function petalCoverage(x, y, pivotX, pivotY, dist, rx, ry, deg, aaPx) {
  const rad = (deg * Math.PI) / 180;
  // Where this petal's centre sits once swung around the pivot.
  const cx = pivotX + Math.sin(rad) * dist;
  const cy = pivotY - Math.cos(rad) * dist;

  // Into petal-local space: undo the swing so the ellipse is axis-aligned.
  const dx = x - cx;
  const dy = y - cy;
  const px = dx * Math.cos(-rad) - dy * Math.sin(-rad);
  const py = dx * Math.sin(-rad) + dy * Math.cos(-rad);

  const d = Math.sqrt((px / rx) ** 2 + (py / ry) ** 2);
  // Convert the normalised distance back to pixels so the feather is a constant visual width.
  const edgePx = (d - 1) * Math.min(rx, ry);
  if (edgePx <= -aaPx) return 1;
  if (edgePx >= aaPx) return 0;
  return (aaPx - edgePx) / (2 * aaPx);
}

function blend(px, i, fill, a) {
  px[i] = Math.round(px[i] * (1 - a) + fill[0] * a);
  px[i + 1] = Math.round(px[i + 1] * (1 - a) + fill[1] * a);
  px[i + 2] = Math.round(px[i + 2] * (1 - a) + fill[2] * a);
}

/**
 * Draw the lotus.
 *
 * `onDark` decides whether petals are white on the gradient (the launcher icon, which has to stay
 * legible at 48px) or the full palette on a light ground (the splash, where there is room for it).
 */
function drawLotus(px, size, cx, cy, scale, onDark) {
  const petals = [
    { deg: -58, fill: onDark ? [255, 255, 255] : BLUE, alpha: 0.75 },
    { deg: -29, fill: onDark ? [255, 255, 255] : TEAL_BRIGHT, alpha: 0.85 },
    { deg: 0, fill: onDark ? [255, 255, 255] : GREEN, alpha: 1 },
    { deg: 29, fill: onDark ? [255, 255, 255] : TEAL_BRIGHT, alpha: 0.85 },
    { deg: 58, fill: onDark ? [255, 255, 255] : LIME, alpha: 0.75 },
  ];

  const rx = 0.062 * size * scale;
  const ry = 0.145 * size * scale;
  // Pivot sits below the mark; petal centres swing around it at `dist`.
  const pivotY = cy + 0.16 * size * scale;
  const dist = 0.15 * size * scale;
  const aaPx = Math.max(1, size / 900); // ~1px at 1024, still smooth at 48

  // Outer petals first so the centre one reads on top, as it does in the drawn mark.
  for (const p of [...petals].sort((a, b) => Math.abs(b.deg) - Math.abs(a.deg))) {
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const c = petalCoverage(x, y, cx, pivotY, dist, rx, ry, p.deg, aaPx);
        if (c <= 0) continue;
        const i = (y * size + x) * 4;
        blend(px, i, p.fill, c * p.alpha);
      }
    }
  }

  // The seat: a shallow crescent the petals rise out of, anchored AT the pivot rather than
  // floating below it.
  const seatRx = 0.135 * size * scale;
  const seatRy = 0.038 * size * scale;
  // On the light ground a petrol seat reads as a heavy black blob under the flower. Teal keeps it
  // as a base the petals sit in rather than a shadow they float above.
  const seatFill = onDark ? [255, 255, 255] : TEAL;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = Math.sqrt(((x - cx) / seatRx) ** 2 + ((y - pivotY) / seatRy) ** 2);
      const edgePx = (d - 1) * Math.min(seatRx, seatRy);
      if (edgePx >= aaPx) continue;
      const a = edgePx <= -aaPx ? 1 : (aaPx - edgePx) / (2 * aaPx);
      blend(px, (y * size + x) * 4, seatFill, a * (onDark ? 0.95 : 0.8));
    }
  }
}

function makeIcon(size, { background, onDark, scale, padded }) {
  const px = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const rgb = background === 'gradient' ? heroAt((x / size) * 0.45 + (y / size) * 0.55) : MIST;
      px[i] = rgb[0];
      px[i + 1] = rgb[1];
      px[i + 2] = rgb[2];
      px[i + 3] = 255;
    }
  }
  // Adaptive icons are masked hard by the launcher; keeping the mark well inside the safe zone
  // stops Android cropping the petals off.
  drawLotus(px, size, size / 2, size * 0.45, scale * (padded ? 0.72 : 1), onDark);
  return encodePng(size, size, px);
}

// ---- PNG encoding ------------------------------------------------------------------------------
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body) >>> 0);
  return Buffer.concat([len, body, crc]);
}

let CRC_TABLE = null;
function crc32(buf) {
  if (!CRC_TABLE) {
    CRC_TABLE = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      CRC_TABLE[n] = c;
    }
  }
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return c ^ -1;
}

function encodePng(w, h, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  // Each scanline is prefixed with its filter byte; 0 = none, which deflate handles well enough
  // for flat gradients and costs nothing to produce.
  const raw = Buffer.alloc(h * (w * 4 + 1));
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---- write -------------------------------------------------------------------------------------
mkdirSync(OUT, { recursive: true });
/** A wide canvas (Play's 1024x500 feature graphic) with the lotus set off-centre. */
function makeWide(w, h) {
  const px = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const rgb = heroAt((x / w) * 0.6 + (y / h) * 0.4);
      px[i] = rgb[0]; px[i + 1] = rgb[1]; px[i + 2] = rgb[2]; px[i + 3] = 255;
    }
  }
  // Lotus on the right third; drawLotus takes a square size, so pass the height and offset x by
  // drawing into a temporary square then compositing would be heavier than just calling it with
  // the min dimension and shifting the centre.
  drawLotusAt(px, w, h, w * 0.78, h * 0.42, h * 1.05, true);
  return encodePng(w, h, px);
}

/** drawLotus generalised to a non-square canvas. */
function drawLotusAt(px, w, h, cx, cy, size, onDark) {
  const square = { get(i) { return px[i]; } };
  void square;
  const petals = [
    { deg: -58, alpha: 0.75 }, { deg: -29, alpha: 0.85 }, { deg: 0, alpha: 1 },
    { deg: 29, alpha: 0.85 }, { deg: 58, alpha: 0.75 },
  ];
  const scale = 1.5;
  const rx = 0.062 * size * scale;
  const ry = 0.145 * size * scale;
  const pivotY = cy + 0.16 * size * scale;
  const dist = 0.15 * size * scale;
  const aaPx = Math.max(1, size / 900);
  const fill = [255, 255, 255];
  for (const p of [...petals].sort((a, b) => Math.abs(b.deg) - Math.abs(a.deg))) {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const c = petalCoverage(x, y, cx, pivotY, dist, rx, ry, p.deg, aaPx);
        if (c <= 0) continue;
        blend(px, (y * w + x) * 4, fill, c * p.alpha * (onDark ? 0.9 : 1));
      }
    }
  }
  const seatRx = 0.135 * size * scale;
  const seatRy = 0.038 * size * scale;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const d = Math.sqrt(((x - cx) / seatRx) ** 2 + ((y - pivotY) / seatRy) ** 2);
      const edgePx = (d - 1) * Math.min(seatRx, seatRy);
      if (edgePx >= aaPx) continue;
      const a = edgePx <= -aaPx ? 1 : (aaPx - edgePx) / (2 * aaPx);
      blend(px, (y * w + x) * 4, fill, a * 0.95);
    }
  }
}

const files = [
  ['icon.png', makeIcon(1024, { background: 'gradient', onDark: true, scale: 1.6, padded: false })],
  // Play Console store listing wants exactly 512x512 and a 1024x500 feature graphic.
  ['play-icon-512.png', makeIcon(512, { background: 'gradient', onDark: true, scale: 1.6, padded: false })],
  ['play-feature-1024x500.png', makeWide(1024, 500)],
  ['adaptive-icon.png', makeIcon(1024, { background: 'gradient', onDark: true, scale: 1.6, padded: true })],
  ['splash.png', makeIcon(1024, { background: 'mist', onDark: false, scale: 1.5, padded: false })],
  ['favicon.png', makeIcon(48, { background: 'gradient', onDark: true, scale: 1.6, padded: false })],
];
for (const [name, buf] of files) {
  writeFileSync(join(OUT, name), buf);
  console.log(`  ${name.padEnd(20)} ${(buf.length / 1024).toFixed(1)} KB`);
}
console.log('\nRegenerate any time with: node scripts/make-icons.mjs');
