/**
 * One-shot, re-runnable asset build: reads assets-source/, writes public/assets/.
 *
 * - Renames the three Cyrillic-С chest files to ASCII, kebab-cases everything.
 * - Composites every mermaid/creature frame onto a per-animation-set common
 *   canvas, aligned on the alpha centroid, so animation swaps never jump.
 * - Downscales at build time (phone screen, 20 MB offline budget).
 * - Packs frames into texture atlases (Phaser JSON hash format).
 * - Checks background layer tileability; wrap-blends layers that don't tile.
 * - Generates the PWA icon set from the kit's app icon.
 */
import { mkdirSync, readdirSync, writeFileSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'assets-source', 'kit');
const OUT = join(ROOT, 'public', 'assets');
const ICONS_OUT = join(ROOT, 'public', 'icons');

const MERMAID_SCALE = 0.21; // ~215 px tall (Idle) in 1080p design space
const ATLAS_PAD = 2;

interface Frame {
  name: string;
  data: Buffer; // png
  w: number;
  h: number;
}
type AtlasJson = {
  frames: Record<string, unknown>;
  meta: { image: string; size: { w: number; h: number }; scale: string };
};

function findDir(base: string, needle: string): string {
  const hit = readdirSync(base).find((d) => d.toLowerCase().includes(needle));
  if (!hit) throw new Error(`not found under ${base}: ${needle}`);
  return join(base, hit);
}

async function alphaCentroid(png: string | Buffer): Promise<{ cx: number; cy: number }> {
  const { data, info } = await sharp(png)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  let sum = 0;
  let sx = 0;
  let sy = 0;
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      const a = data[(y * info.width + x) * 4 + 3];
      if (a > 8) {
        sum += a;
        sx += x * a;
        sy += y * a;
      }
    }
  }
  if (sum === 0) return { cx: info.width / 2, cy: info.height / 2 };
  return { cx: sx / sum, cy: sy / sum };
}

/**
 * Composite a set of animations onto one shared canvas, aligned so each
 * animation's frame-0 alpha centroid lands on the same anchor. Returns scaled
 * PNG frames of identical dimensions.
 */
async function alignAnimationSet(
  anims: { name: string; files: string[] }[],
  scale: number,
): Promise<Frame[]> {
  const metas = [];
  for (const anim of anims) {
    const m = await sharp(anim.files[0]).metadata();
    const { cx, cy } = await alphaCentroid(anim.files[0]);
    metas.push({ anim, w: m.width!, h: m.height!, cx, cy });
  }
  const L = Math.ceil(Math.max(...metas.map((m) => m.cx)));
  const R = Math.ceil(Math.max(...metas.map((m) => m.w - m.cx)));
  const T = Math.ceil(Math.max(...metas.map((m) => m.cy)));
  const B = Math.ceil(Math.max(...metas.map((m) => m.h - m.cy)));
  const W = L + R;
  const H = T + B;

  const frames: Frame[] = [];
  for (const m of metas) {
    const left = Math.round(L - m.cx);
    const top = Math.round(T - m.cy);
    for (let i = 0; i < m.anim.files.length; i++) {
      const buf = await sharp({
        create: { width: W, height: H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
      })
        .composite([{ input: m.anim.files[i], left, top }])
        .png()
        .toBuffer();
      const scaled = await sharp(buf)
        .resize(Math.round(W * scale), Math.round(H * scale))
        .png()
        .toBuffer();
      const meta = await sharp(scaled).metadata();
      frames.push({
        name: `${m.anim.name}_${String(i).padStart(3, '0')}`,
        data: scaled,
        w: meta.width!,
        h: meta.height!,
      });
    }
  }
  return frames;
}

/** Simple shelf packer -> atlas webp + Phaser JSON hash. */
async function packAtlas(key: string, frames: Frame[], maxW = 2048): Promise<void> {
  const sorted = [...frames].sort((a, b) => b.h - a.h);
  let x = 0;
  let y = 0;
  let shelfH = 0;
  let atlasW = 0;
  const placed: { f: Frame; x: number; y: number }[] = [];
  for (const f of sorted) {
    if (x + f.w + ATLAS_PAD > maxW) {
      x = 0;
      y += shelfH + ATLAS_PAD;
      shelfH = 0;
    }
    placed.push({ f, x, y });
    x += f.w + ATLAS_PAD;
    shelfH = Math.max(shelfH, f.h);
    atlasW = Math.max(atlasW, x);
  }
  const atlasH = y + shelfH;

  const composite = placed.map((p) => ({ input: p.f.data, left: p.x, top: p.y }));
  const img = sharp({
    create: { width: atlasW, height: atlasH, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  }).composite(composite);
  await img.webp({ quality: 88, alphaQuality: 90 }).toFile(join(OUT, `${key}.webp`));

  const json: AtlasJson = {
    frames: {},
    meta: { image: `${key}.webp`, size: { w: atlasW, h: atlasH }, scale: '1' },
  };
  for (const p of placed) {
    json.frames[p.f.name] = {
      frame: { x: p.x, y: p.y, w: p.f.w, h: p.f.h },
      rotated: false,
      trimmed: false,
      spriteSourceSize: { x: 0, y: 0, w: p.f.w, h: p.f.h },
      sourceSize: { w: p.f.w, h: p.f.h },
    };
  }
  writeFileSync(join(OUT, `${key}.json`), JSON.stringify(json));
  console.log(`atlas ${key}: ${atlasW}x${atlasH}, ${frames.length} frames`);
}

function animFiles(dir: string, prefix: string): string[] {
  const files = readdirSync(dir)
    .filter((f) => f.startsWith(prefix) && f.endsWith('.png'))
    .sort();
  if (files.length !== 10) throw new Error(`${dir}/${prefix}*: expected 10 frames, got ${files.length}`);
  return files.map((f) => join(dir, f));
}

async function buildMermaid() {
  const dir = join(SRC, 'Mermaid', 'PNG', 'Mermaid_1');
  // Only Idle, Move, Acceleration, Joy. Attack/Hurt/Die are out of scope by design.
  const anims = ['Idle', 'Move', 'Joy', 'Acceleration'].map((a) => ({
    name: a.toLowerCase(),
    files: animFiles(dir, a + '_'),
  }));
  const frames = await alignAnimationSet(anims, MERMAID_SCALE);
  await packAtlas('mermaid', frames);

  // Debug strip: frame 0 of each animation with anchor crosshair, for eyeballing.
  const w = frames[0].w;
  const h = frames[0].h;
  const cross = Buffer.from(
    `<svg width="${w}" height="${h}"><line x1="0" y1="${h / 2}" x2="${w}" y2="${h / 2}" stroke="red"/><line x1="${w / 2}" y1="0" x2="${w / 2}" y2="${h}" stroke="red"/></svg>`,
  );
  const picks = [0, 10, 20, 30].map((i) => frames[i]);
  await sharp({
    create: { width: w * 4, height: h, channels: 4, background: { r: 40, g: 60, b: 80, alpha: 255 } },
  })
    .composite(
      picks.flatMap((f, i) => [
        { input: f.data, left: i * w, top: 0 },
        { input: cross, left: i * w, top: 0 },
      ]),
    )
    .png()
    .toFile(join(ROOT, 'scripts', 'debug-mermaid-align.png'));
}

async function buildCreatures() {
  const base = findDir(SRC, 'fish');
  const png = join(base, 'PNG');
  const sets: { key: string; dir: string; prefix: string; scale: number }[] = [
    { key: 'fish-1', dir: 'Fish_1', prefix: 'Fish_move_1_', scale: 0.55 },
    { key: 'fish-2', dir: 'Fish_2', prefix: 'Fish_move_2_', scale: 0.56 },
    { key: 'fish-3', dir: 'Fish_3', prefix: 'Fish_move_3_', scale: 0.62 },
    { key: 'fish-4', dir: 'Fish_4', prefix: 'Fish_move_4_', scale: 0.32 },
    { key: 'jellyfish-1', dir: 'Jellyfish_1', prefix: 'Jellyfish_move_1_', scale: 1 },
    { key: 'jellyfish-2', dir: 'Jellyfish_2', prefix: 'Jellyfish_move_2_', scale: 0.8 },
    { key: 'jellyfish-3', dir: 'Jellyfish_3', prefix: 'Jellyfish_move_3_', scale: 0.62 },
  ];
  const all: Frame[] = [];
  for (const s of sets) {
    const frames = await alignAnimationSet(
      [{ name: `${s.key}-move`, files: animFiles(join(png, s.dir), s.prefix) }],
      s.scale,
    );
    all.push(...frames);
  }
  await packAtlas('creatures', all);
}

async function singleFrame(name: string, file: string, scale: number): Promise<Frame> {
  let img = sharp(file);
  const m = await img.metadata();
  if (scale !== 1) img = img.resize(Math.round(m.width! * scale));
  const data = await img.png().toBuffer();
  const meta = await sharp(data).metadata();
  return { name, data, w: meta.width!, h: meta.height! };
}

function svgFrame(name: string, svg: string, w: number, h: number): Promise<Frame> {
  return sharp(Buffer.from(svg)).png().toBuffer().then((data) => ({ name, data, w, h }));
}

async function buildItems() {
  const items = join(SRC, 'Game items', 'PNG');
  const ui = join(SRC, 'Underwater world Game UI', 'PNG');
  const neutral = join(items, 'Neutral');
  // Three chest files start with Cyrillic С (U+0421) — mangled to the
  // replacement char by some unzippers. Match on the ASCII tail instead.
  const chestFile = (state: string) => {
    const hit = readdirSync(neutral).find((f) => f.endsWith(`hest_${state}.png`));
    if (!hit) throw new Error(`chest_${state} not found`);
    return join(neutral, hit);
  };

  const frames: Frame[] = [];
  frames.push(await singleFrame('pearl', join(items, 'Bonus', 'Pearl.png'), 0.5));
  frames.push(await singleFrame('coin', join(items, 'Bonus', 'Coin.png'), 0.5));
  frames.push(await singleFrame('chest-closed', chestFile('closed'), 0.85));
  frames.push(await singleFrame('chest-ajar', chestFile('ajar'), 0.85));
  frames.push(await singleFrame('chest-open', chestFile('open'), 0.85));
  for (let i = 1; i <= 3; i++) {
    frames.push(await singleFrame(`bubble-${i}`, join(neutral, `Bubble_${i}.png`), 0.6));
  }
  for (let d = 0; d <= 9; d++) {
    frames.push(await singleFrame(`digit-${d}`, join(ui, 'number', `${d}.png`), 1));
  }
  frames.push(await singleFrame('btn-play', join(ui, 'btn', 'play.png'), 1));
  frames.push(await singleFrame('btn-restart', join(ui, 'btn', 'restart.png'), 1));
  frames.push(await singleFrame('btn-sound', join(ui, 'btn', 'sound.png'), 1.4));
  frames.push(await singleFrame('btn-sound-off', join(ui, 'btn', 'sound_off.png'), 1.4));

  // Generated effect textures (kept out of the art pack: tiny, procedural)
  frames.push(
    await svgFrame(
      'sparkle',
      `<svg width="64" height="64" xmlns="http://www.w3.org/2000/svg">
        <path d="M32 2 L38 26 L62 32 L38 38 L32 62 L26 38 L2 32 L26 26 Z" fill="white"/>
      </svg>`,
      64,
      64,
    ),
  );
  frames.push(
    await svgFrame(
      'glow',
      `<svg width="192" height="192" xmlns="http://www.w3.org/2000/svg">
        <defs><radialGradient id="g"><stop offset="0%" stop-color="white" stop-opacity="1"/><stop offset="100%" stop-color="white" stop-opacity="0"/></radialGradient></defs>
        <circle cx="96" cy="96" r="96" fill="url(#g)"/>
      </svg>`,
      192,
      192,
    ),
  );
  await packAtlas('items', frames, 1024);
}

/** Wrap-blend so column W-1 continues into column 0 (crop W by F, fade first F cols). */
function makeTileable(data: Buffer, w: number, h: number, ch: number, F: number): { data: Buffer; w: number } {
  const W2 = w - F;
  const out = Buffer.alloc(W2 * h * ch);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < W2; x++) {
      const t = x < F ? 1 - x / F : 0;
      for (let c = 0; c < ch; c++) {
        const a = data[(y * w + x) * ch + c];
        const b = data[(y * w + Math.min(w - 1, x + W2)) * ch + c];
        out[(y * W2 + x) * ch + c] = Math.round(a * (1 - t) + b * t);
      }
    }
  }
  return { data: out, w: W2 };
}

async function buildBackgrounds() {
  const dir = join(SRC, 'Game Backgrounds', 'Backgrounds_1', 'PNG', '1_game_background', 'layers');
  mkdirSync(join(OUT, 'bg'), { recursive: true });
  for (let i = 1; i <= 6; i++) {
    const file = join(dir, `${i}.png`);
    const { data, info } = await sharp(file).raw().toBuffer({ resolveWithObject: true });
    const { width: w, height: h, channels: ch } = info;

    // Tileability: compare the wrap seam (last col vs first col) against the
    // typical adjacent-column difference inside the image.
    let wrap = 0;
    let base = 0;
    for (let y = 0; y < h; y += 3) {
      for (let c = 0; c < Math.min(ch, 3); c++) {
        wrap += Math.abs(data[(y * w + w - 1) * ch + c] - data[(y * w) * ch + c]);
        base += Math.abs(data[(y * w + (w >> 1)) * ch + c] - data[(y * w + (w >> 1) + 1) * ch + c]);
      }
    }
    const seamless = wrap <= Math.max(base * 4, h);
    let outData = data;
    let outW = w;
    if (!seamless) {
      const fixed = makeTileable(data, w, h, ch, 220);
      outData = fixed.data;
      outW = fixed.w;
    }
    const img = sharp(outData, { raw: { width: outW, height: h, channels: ch } });
    if (ch === 3) {
      await img.webp({ quality: 72 }).toFile(join(OUT, 'bg', `layer-${i}.webp`));
    } else {
      await img.webp({ quality: 80, alphaQuality: 85 }).toFile(join(OUT, 'bg', `layer-${i}.webp`));
    }
    console.log(`bg layer ${i}: ${seamless ? 'tiles cleanly' : 'wrap-blended'} (wrap=${wrap}, base=${base}) -> ${outW}x${h}`);
  }
}

async function buildIcons() {
  mkdirSync(ICONS_OUT, { recursive: true });
  const src = join(SRC, 'App Icons', 'Underwater world_1024x1024_1.png');
  const bg = { r: 7, g: 37, b: 61, alpha: 1 };
  await sharp(src).resize(512).png({ palette: true }).toFile(join(ICONS_OUT, 'icon-512.png'));
  await sharp(src).resize(192).png({ palette: true }).toFile(join(ICONS_OUT, 'icon-192.png'));
  // iOS home-screen icon: opaque, no transparency.
  await sharp(src).resize(180).flatten({ background: bg }).png({ palette: true }).toFile(join(ICONS_OUT, 'apple-touch-icon.png'));
  // Maskable: art shrunk into the 80% safe zone on an ocean background.
  const inner = await sharp(src).resize(410).png().toBuffer();
  await sharp({ create: { width: 512, height: 512, channels: 4, background: { r: 13, g: 60, b: 95, alpha: 1 } } })
    .composite([{ input: inner, left: 51, top: 51 }])
    .png({ palette: true })
    .toFile(join(ICONS_OUT, 'icon-maskable-512.png'));
  console.log('icons written');
}

function reportSizes() {
  let total = 0;
  const walk = (d: string) => {
    for (const f of readdirSync(d)) {
      const p = join(d, f);
      const st = statSync(p);
      if (st.isDirectory()) walk(p);
      else total += st.size;
    }
  };
  walk(OUT);
  walk(ICONS_OUT);
  console.log(`total public assets: ${(total / 1024 / 1024).toFixed(2)} MB (budget 20 MB incl. code+audio)`);
}

mkdirSync(OUT, { recursive: true });
await buildMermaid();
await buildCreatures();
await buildItems();
await buildBackgrounds();
await buildIcons();
reportSizes();
