// Renders the Otto icon set from one SVG. Run: npm run icons
import sharp from "sharp";
import { mkdirSync } from "node:fs";

const out = new URL("../public/icons/", import.meta.url);
mkdirSync(out, { recursive: true });

// A bold lowercase o whose ring opens at the top right, with a needle pointing into the gap like a gauge.
function svg({ bg, fg, scale = 1, rounded = false }) {
  const s = 512;
  const c = 256;
  const r = 128 * scale;
  const w = 66 * scale;
  const gapStart = -84; // degrees, 0 = 3 o'clock, negative is up
  const gapEnd = -8;
  const rad = (d) => (d * Math.PI) / 180;
  const p = (d, rr) => [c + rr * Math.cos(rad(d)), c + 14 * scale + rr * Math.sin(rad(d))];
  const [x1, y1] = p(gapEnd, r);
  const [x2, y2] = p(gapStart + 360, r);
  const needleEnd = p(-46, r - 4 * scale);
  const cy = c + 14 * scale;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 ${s} ${s}">
  <rect width="${s}" height="${s}" rx="${rounded ? 112 : 0}" fill="${bg}"/>
  <path d="M ${x1} ${y1} A ${r} ${r} 0 1 1 ${x2} ${y2}" fill="none" stroke="${fg}" stroke-width="${w}" stroke-linecap="round"/>
  <line x1="${c}" y1="${cy}" x2="${needleEnd[0]}" y2="${needleEnd[1]}" stroke="${fg}" stroke-width="${26 * scale}" stroke-linecap="round"/>
  <circle cx="${c}" cy="${cy}" r="${22 * scale}" fill="${fg}"/>
</svg>`;
}

const light = { bg: "#f5f4ec", fg: "#2f7d5b" };
const dark = { bg: "#0f1e19", fg: "#9fe3bd" };

const jobs = [
  ["icon-192.png", 192, svg({ ...light, rounded: true })],
  ["icon-512.png", 512, svg({ ...light, rounded: true })],
  ["apple-touch-icon.png", 180, svg(light)],
  ["icon-maskable-512.png", 512, svg({ ...light, scale: 0.78 })],
  ["icon-dark-512.png", 512, svg({ ...dark, rounded: true })],
  ["icon-dark-192.png", 192, svg({ ...dark, rounded: true })],
  ["badge-96.png", 96, svg({ bg: "transparent", fg: "#ffffff" })],
];

for (const [name, size, markup] of jobs) {
  await sharp(Buffer.from(markup)).resize(size, size).png().toFile(new URL(name, out).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
}
await sharp(Buffer.from(svg({ ...light, rounded: true }))).resize(48, 48).png().toFile(new URL("../src/app/icon.png", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
console.log("icons written");
