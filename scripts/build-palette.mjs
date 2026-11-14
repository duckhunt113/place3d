// Generates palette.png and a labelled preview from palette.json.
// palette.json is the single source of truth; never edit palette.png by hand.
// Usage: pnpm palette          (validate + write palette.png and the preview)
//        pnpm palette:check    (validate + check both files are up to date; writes nothing)
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { deflateSync, inflateSync } from "node:zlib";

const PALETTE_JSON = "apps/web/public/assets/palette.json";
const PALETTE_PNG = "apps/web/public/assets/palette.png";
const PREVIEW_HTML = "docs/palette-preview.html";

const palette = JSON.parse(readFileSync(PALETTE_JSON, "utf8"));
const { cols, rows, cellPx } = palette.grid;

const errors = validate(palette);
if (errors.length > 0) {
  console.error(`palette.json has ${errors.length} problem(s):`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}

if (process.argv.includes("--check")) {
  const stale = [];
  if (!pngMatches(PALETTE_PNG, buildRaw(palette))) stale.push(PALETTE_PNG);
  if (!existsSync(PREVIEW_HTML) || readFileSync(PREVIEW_HTML, "utf8") !== buildPreview(palette)) {
    stale.push(PREVIEW_HTML);
  }
  if (stale.length > 0) {
    console.error(`out of date: ${stale.join(", ")}. Run: pnpm palette`);
    process.exit(1);
  }
  console.log(`palette v${palette.version} OK: files are up to date`);
  process.exit(0);
}

writeFileSync(PALETTE_PNG, buildPng(palette));
writeFileSync(PREVIEW_HTML, buildPreview(palette));
const count = Object.keys(palette.colors).length;
console.log(`palette v${palette.version}: ${count} colours, ${cols * rows - count} free slots`);
console.log(`wrote ${PALETTE_PNG} (${cols * cellPx}x${rows * cellPx}) and ${PREVIEW_HTML}`);

function validate(p) {
  const problems = [];
  if (!Number.isInteger(p.version) || p.version < 1) {
    problems.push("version must be a positive integer");
  }
  const used = new Map();
  for (const [name, color] of Object.entries(p.colors)) {
    if (!/^[a-z][a-z0-9]*(\.[a-z0-9]+)*$/.test(name)) {
      problems.push(`"${name}": names are lowercase words joined by dots`);
    }
    if (!/^#[0-9A-Fa-f]{6}$/.test(color.hex)) {
      problems.push(`"${name}": hex must look like #A1B2C3, got ${color.hex}`);
    }
    const [x, y] = color.cell;
    const inside = Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0;
    if (!inside || x >= cols || y >= rows) {
      problems.push(`"${name}": cell [${x}, ${y}] is outside the ${cols}x${rows} grid`);
    }
    const key = `${x},${y}`;
    if (used.has(key)) {
      problems.push(`"${name}": cell [${x}, ${y}] is already used by "${used.get(key)}"`);
    }
    used.set(key, name);
  }
  return problems;
}

// Compares decoded pixels, not file bytes: PNG compression can differ between machines.
function pngMatches(path, expectedRaw) {
  if (!existsSync(path)) return false;
  const data = readFileSync(path);
  const idat = [];
  let width = 0;
  let height = 0;
  for (let i = 8; i < data.length; ) {
    const length = data.readUInt32BE(i);
    const type = data.toString("ascii", i + 4, i + 8);
    if (type === "IHDR") {
      width = data.readUInt32BE(i + 8);
      height = data.readUInt32BE(i + 12);
    }
    if (type === "IDAT") idat.push(data.subarray(i + 8, i + 8 + length));
    i += 12 + length;
  }
  if (width !== cols * cellPx || height !== rows * cellPx) return false;
  return inflateSync(Buffer.concat(idat)).equals(expectedRaw);
}

function buildPng(p) {
  const width = cols * cellPx;
  const height = rows * cellPx;
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // colour type: RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(buildRaw(p), { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// Raw scanlines: 1 filter byte (0) per row, then RGBA pixels. Empty slots stay transparent.
function buildRaw(p) {
  const width = cols * cellPx;
  const height = rows * cellPx;
  const stride = width * 4 + 1; // 1 filter byte per row, RGBA pixels
  const raw = Buffer.alloc(stride * height);
  for (const { hex, cell } of Object.values(p.colors)) {
    const [r, g, b] = [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16));
    for (let py = cell[1] * cellPx; py < (cell[1] + 1) * cellPx; py++) {
      for (let px = cell[0] * cellPx; px < (cell[0] + 1) * cellPx; px++) {
        const o = py * stride + 1 + px * 4;
        raw[o] = r;
        raw[o + 1] = g;
        raw[o + 2] = b;
        raw[o + 3] = 255;
      }
    }
  }
  return raw;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([length, body, crc]);
}

function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) {
    c ^= byte;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  return (c ^ 0xffffffff) >>> 0;
}

function buildPreview(p) {
  const size = 72;
  const cells = Object.entries(p.colors)
    .map(([name, { hex, cell }]) => {
      const [r, g, b] = [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16));
      const text = 0.299 * r + 0.587 * g + 0.114 * b > 150 ? "#222" : "#fff";
      const pos = `left:${cell[0] * size}px;top:${cell[1] * size}px`;
      return `<div class="c" style="${pos};background:${hex};color:${text}">${name}<br>${hex}</div>`;
    })
    .join("\n");
  const usedRows = Math.max(...Object.values(p.colors).map((c) => c.cell[1])) + 1;
  return `<!doctype html>
<!-- Generated by scripts/build-palette.mjs from palette.json. Do not edit. -->
<html lang="en"><head><meta charset="utf-8"><title>Palette v${p.version}</title>
<style>
body { font-family: system-ui, sans-serif; margin: 24px; }
.grid { position: relative; width: ${cols * size}px; height: ${usedRows * size}px;
  background: repeating-conic-gradient(#eee 0 25%, #fff 0 50%) 0 0 / 16px 16px; }
.c { position: absolute; width: ${size}px; height: ${size}px; box-sizing: border-box;
  padding: 4px; font-size: 10px; line-height: 1.3; overflow: hidden; word-break: break-all; }
</style></head><body>
<h1>Palette v${p.version}</h1>
<p>${Object.keys(p.colors).length} colours on a ${cols}x${rows} grid (${cellPx}px cells). Only used rows shown; checkered = free slot.</p>
<div class="grid">
${cells}
</div>
</body></html>
`;
}
