/**
 * Writes the three PNG icons that public/manifest.webmanifest and public/sw.js
 * reference.
 *
 * Usage: npm run icons:generate
 *
 * They are generated rather than committed because a binary in a repository is a
 * thing nobody can review or adjust: the only way to change the accent colour
 * would be to open a paint program and hope. Here the mark is defined by the
 * same two colours the product uses everywhere else, and re-running this after
 * changing them keeps the home screen and the notification shade in step with
 * the application.
 *
 * The encoder is written out by hand because the alternative is a native image
 * dependency in the tree for the sake of three files that never change.
 */

import { deflateSync } from "node:zlib";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ACCENT = [0x4f, 0x46, 0xe5];
const MARK = [0xff, 0xff, 0xff];

/**
 * The unfilled remainder of the dial. Light enough to read as "not yet" against
 * the accent, dark enough to survive the contrast crush of a small icon.
 */
const TRACK_OPACITY = 0.3;

/** Two thirds of a day elapsed, drawn clockwise from twelve o'clock. */
const SWEEP = (2 / 3) * 2 * Math.PI;

/**
 * Each pixel is sampled on a 4x4 grid. Circles drawn without it look visibly
 * stepped at 192 pixels, which is the size that ends up on a home screen.
 */
const SAMPLES_PER_AXIS = 4;

/**
 * Proportions of the canvas, so one description covers every size.
 *
 * The maskable variant is drawn smaller. Android crops it to whatever shape the
 * launcher uses, and only the central 80% is guaranteed to survive, so the dial
 * has to sit inside that circle rather than inside the square.
 */
const LAYOUTS = {
  any: { radius: 0.3, stroke: 0.098, hub: 0.05, corner: 0.22 },
  maskable: { radius: 0.25, stroke: 0.082, hub: 0.042, corner: null },
};

const CRC_TABLE = Uint32Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);

  const body = Buffer.concat([Buffer.from(type, "latin1"), data]);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(body));

  return Buffer.concat([length, body, checksum]);
}

/** 8-bit RGBA, no interlacing. Alpha is needed for the rounded corners. */
function encodePng(size, pixels) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = 6;

  // Filter byte 0 on every scanline. Adaptive filtering would compress a
  // photograph better; on flat colour it saves nothing worth the code.
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y += 1) {
    const from = y * size * 4;
    raw[y * (size * 4 + 1)] = 0;
    pixels.copy(raw, y * (size * 4 + 1) + 1, from, from + size * 4);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/**
 * Signed distance to a rounded square centred on the canvas. Negative inside.
 * Returning null means the tile fills the canvas, for the maskable icon whose
 * corners the launcher will cut off anyway.
 */
function roundedSquareDistance(x, y, size, corner) {
  if (corner === null) return -1;

  const half = size / 2;
  const radius = corner * size;
  const qx = Math.abs(x - half) - (half - radius);
  const qy = Math.abs(y - half) - (half - radius);

  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) - radius;
}

/** Opacity of the mark at one point: the dial, its unfilled track, and the hub. */
function markOpacity(dx, dy, radius, stroke, hub) {
  const distance = Math.hypot(dx, dy);

  if (distance <= hub) return 1;
  if (Math.abs(distance - radius) > stroke / 2) return 0;

  // Zero at twelve o'clock, increasing clockwise, so the sweep reads the way a
  // clock face does.
  const angle = Math.atan2(dx, -dy);
  const clockwise = angle < 0 ? angle + 2 * Math.PI : angle;

  return clockwise <= SWEEP ? 1 : TRACK_OPACITY;
}

function render(size, layout) {
  const pixels = Buffer.alloc(size * size * 4);
  const centre = size / 2;
  const radius = layout.radius * size;
  const stroke = layout.stroke * size;
  const hub = layout.hub * size;
  const step = 1 / SAMPLES_PER_AXIS;
  const total = SAMPLES_PER_AXIS * SAMPLES_PER_AXIS;

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let covered = 0;
      const sum = [0, 0, 0];

      for (let sy = 0; sy < SAMPLES_PER_AXIS; sy += 1) {
        for (let sx = 0; sx < SAMPLES_PER_AXIS; sx += 1) {
          const px = x + (sx + 0.5) * step;
          const py = y + (sy + 0.5) * step;

          if (roundedSquareDistance(px, py, size, layout.corner) > 0) continue;

          const opacity = markOpacity(px - centre, py - centre, radius, stroke, hub);

          covered += 1;
          for (let c = 0; c < 3; c += 1) {
            sum[c] += ACCENT[c] + (MARK[c] - ACCENT[c]) * opacity;
          }
        }
      }

      const at = (y * size + x) * 4;
      if (covered === 0) continue;

      // Averaged over the covered subsamples only. Folding the transparent ones
      // in would darken the rounded edge towards black.
      for (let c = 0; c < 3; c += 1) pixels[at + c] = Math.round(sum[c] / covered);
      pixels[at + 3] = Math.round((covered / total) * 255);
    }
  }

  return encodePng(size, pixels);
}

const outputDirectory = join(
  dirname(dirname(fileURLToPath(import.meta.url))),
  "public",
  "icons",
);

await mkdir(outputDirectory, { recursive: true });

const icons = [
  { file: "icon-192.png", size: 192, layout: LAYOUTS.any },
  { file: "icon-512.png", size: 512, layout: LAYOUTS.any },
  { file: "icon-maskable-512.png", size: 512, layout: LAYOUTS.maskable },
];

for (const icon of icons) {
  const png = render(icon.size, icon.layout);
  await writeFile(join(outputDirectory, icon.file), png);
  process.stdout.write(
    `${icon.file.padEnd(24)} ${icon.size}x${icon.size}  ${(png.length / 1024).toFixed(1)} kB\n`,
  );
}
