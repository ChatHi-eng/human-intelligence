// Generates every Palam brand image referenced by app.json plus the Play Store
// listing pack. Re-run after changing the mark or palette:
//   node scripts/generate-brand-assets.mjs
import { Resvg } from '@resvg/resvg-js';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const GREEN = '#0F6E56';
const MINT = '#E1F5EE';
const WHITE = '#FFFFFF';

const MANROPE_DIR = join(root, 'node_modules', '@expo-google-fonts', 'manrope');
const FONT_FILES = [
  join(MANROPE_DIR, '800ExtraBold', 'Manrope_800ExtraBold.ttf'),
  join(MANROPE_DIR, '500Medium', 'Manrope_500Medium.ttf'),
];

// The mark: a geometric lowercase "p" built from a ring (bowl), a flat-topped
// stem, and a rounded descender tip. Local bounding box is 350 x 510.
const MARK_W = 350;
const MARK_H = 510;

function mark(color, scale, tx, ty) {
  return `<g transform="translate(${tx} ${ty}) scale(${scale})">
    <circle cx="175" cy="175" r="125" fill="none" stroke="${color}" stroke-width="100"/>
    <rect x="0" y="0" width="100" height="460" fill="${color}"/>
    <circle cx="50" cy="460" r="50" fill="${color}"/>
  </g>`;
}

// Places the mark centered in a canvas at the given mark height.
function centeredMark(color, canvasW, canvasH, markH) {
  const s = markH / MARK_H;
  const w = MARK_W * s;
  return mark(color, s, (canvasW - w) / 2, (canvasH - markH) / 2);
}

function svg(w, h, body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}">${body}</svg>`;
}

function render(relPath, svgText, width, height, { text = false } = {}) {
  const resvg = new Resvg(svgText, {
    fitTo: { mode: 'width', value: width },
    font: text
      ? { loadSystemFonts: false, fontFiles: FONT_FILES, defaultFontFamily: 'Manrope' }
      : { loadSystemFonts: false },
  });
  const png = resvg.render().asPng();

  // Assert the PNG header before writing: signature + IHDR dimensions.
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (!png.subarray(0, 8).equals(sig)) throw new Error(`${relPath}: not a PNG`);
  const gotW = png.readUInt32BE(16);
  const gotH = png.readUInt32BE(20);
  if (gotW !== width || gotH !== height) {
    throw new Error(`${relPath}: expected ${width}x${height}, got ${gotW}x${gotH}`);
  }

  const outPath = join(root, relPath);
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, png);
  console.log(`ok  ${relPath}  ${gotW}x${gotH}`);
}

// --- App icon: green mark on mint ------------------------------------------
const iconSvg = (size) =>
  svg(size, size, `<rect width="${size}" height="${size}" fill="${MINT}"/>` +
    centeredMark(GREEN, size, size, size * 0.5469));

render('assets/images/icon.png', iconSvg(1024), 1024, 1024);
render('store-assets/play-icon-512.png', iconSvg(512), 512, 512);

// --- Android adaptive icon layers -------------------------------------------
// Foreground mark must fit the safe zone: a centered circle, 66% of the canvas.
// Mark at height 510 has a 619px diagonal, inside the 676px safe circle.
render(
  'assets/images/android-icon-foreground.png',
  svg(1024, 1024, centeredMark(GREEN, 1024, 1024, 510)),
  1024, 1024,
);
render(
  'assets/images/android-icon-background.png',
  svg(1024, 1024, `<rect width="1024" height="1024" fill="${MINT}"/>`),
  1024, 1024,
);
render(
  'assets/images/android-icon-monochrome.png',
  svg(1024, 1024, centeredMark(WHITE, 1024, 1024, 510)),
  1024, 1024,
);

// --- Splash: mint mark on transparent (splash background is the deep green) --
render(
  'assets/images/splash-icon.png',
  svg(512, 736, centeredMark(MINT, 512, 736, 714)),
  512, 736,
);

// --- Favicon: green mark on a rounded mint square ----------------------------
render(
  'assets/images/favicon.png',
  svg(48, 48, `<rect width="48" height="48" rx="10" fill="${MINT}"/>` +
    centeredMark(GREEN, 48, 48, 30)),
  48, 48,
);

// --- Play Store feature graphic ----------------------------------------------
render(
  'store-assets/feature-graphic-1024x500.png',
  svg(1024, 500, `
    <rect width="1024" height="500" fill="${GREEN}"/>
    <text x="512" y="270" text-anchor="middle" font-family="Manrope" font-weight="800"
      font-size="150" letter-spacing="-3" fill="${WHITE}">palam</text>
    <text x="512" y="362" text-anchor="middle" font-family="Manrope" font-weight="500"
      font-size="36" fill="${MINT}">Talk to a human who knows.</text>
  `),
  1024, 500,
  { text: true },
);

console.log('All brand assets generated.');
