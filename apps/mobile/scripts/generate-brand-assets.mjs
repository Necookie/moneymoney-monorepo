/**
 * One-off generator for the app icon, adaptive icon layers, splash and notification icon:
 * the "mm." wordmark drawn from geometric primitives (signed distance fields), 4×4 supersampled,
 * encoded as PNG with node:zlib only (no dependencies).
 *
 *   node apps/mobile/scripts/generate-brand-assets.mjs
 *
 * The generated PNGs are committed; re-run only when the brand mark changes.
 */
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets');
const INK = [0x0c, 0x0a, 0x08];
const ACCENT = [0xe4, 0xf2, 0x22];
const WHITE = [0xff, 0xff, 0xff];

// ── PNG encoding ────────────────────────────────────────────────────────────────────────────
const CRC_TABLE = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function encodePng(width, height, rgba) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0;
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ── Wordmark geometry (units: x-height = 1) ─────────────────────────────────────────────────
const S = 0.26; // stroke
const R = 0.5; // arch outer radius
const H = 1; // x-height
const DOT = 0.2; // period radius
const GAP = 0.16; // letter spacing
const M_W = 4 * R - S; // width of one "m"
const TOTAL_W = M_W * 2 + GAP * 2 + DOT * 2;

function archInside(px, py, cx, cy) {
  if (py > cy) return false;
  const d = Math.hypot(px - cx, py - cy);
  return d <= R && d >= R - S;
}
function mInside(px, py, x0) {
  // y grows downward; top of x-height at y=0, baseline at y=H.
  if (py < 0 || py > H) return false;
  const stems = [x0, x0 + 2 * R - S, x0 + 4 * R - 2 * S];
  for (const sx of stems) if (px >= sx && px <= sx + S && py >= R) return true;
  if (px >= x0 && px <= x0 + S) return true; // left stem runs full height
  return archInside(px, py, x0 + R, R) || archInside(px, py, x0 + 3 * R - S, R);
}
function glyphInside(px, py) {
  if (mInside(px, py, 0)) return true;
  if (mInside(px, py, M_W + GAP)) return true;
  const dx = M_W * 2 + GAP * 2 + DOT;
  return Math.hypot(px - dx, py - (H - DOT)) <= DOT;
}

/**
 * Render the mark centred, `scale` = mark width as a fraction of the canvas width.
 * `bg` null = transparent.
 */
function render(size, { bg, fg, scale }) {
  const rgba = Buffer.alloc(size * size * 4);
  const unit = (size * scale) / TOTAL_W;
  const ox = (size - TOTAL_W * unit) / 2;
  const oy = (size - H * unit) / 2;
  const SS = 4;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let hits = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const gx = (x + (sx + 0.5) / SS - ox) / unit;
          const gy = (y + (sy + 0.5) / SS - oy) / unit;
          if (glyphInside(gx, gy)) hits++;
        }
      }
      const a = hits / (SS * SS);
      const i = (y * size + x) * 4;
      if (bg) {
        for (let c = 0; c < 3; c++) rgba[i + c] = Math.round(bg[c] * (1 - a) + fg[c] * a);
        rgba[i + 3] = 255;
      } else {
        rgba[i] = fg[0];
        rgba[i + 1] = fg[1];
        rgba[i + 2] = fg[2];
        rgba[i + 3] = Math.round(a * 255);
      }
    }
  }
  return encodePng(size, size, rgba);
}

function solid(size, color) {
  const rgba = Buffer.alloc(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    rgba[i * 4] = color[0];
    rgba[i * 4 + 1] = color[1];
    rgba[i * 4 + 2] = color[2];
    rgba[i * 4 + 3] = 255;
  }
  return encodePng(size, size, rgba);
}

const files = {
  'icon.png': render(1024, { bg: INK, fg: ACCENT, scale: 0.62 }),
  // Adaptive icon: the launcher masks to ~66% of the canvas, so keep the mark inside it.
  'android-icon-foreground.png': render(1024, { bg: null, fg: ACCENT, scale: 0.42 }),
  'android-icon-background.png': solid(1024, INK),
  'android-icon-monochrome.png': render(1024, { bg: null, fg: WHITE, scale: 0.42 }),
  'splash-icon.png': render(1024, { bg: null, fg: ACCENT, scale: 0.9 }),
  // Android status-bar icon: white on transparent.
  'notification-icon.png': render(96, { bg: null, fg: WHITE, scale: 0.82 }),
};
for (const [name, png] of Object.entries(files)) {
  writeFileSync(join(OUT, name), png);
  console.log(`wrote assets/${name} (${png.length} bytes)`);
}
