// PIP HAS A VOICE NOW, AND IT HAS TO ACTUALLY PLAY.
//
// Dad, 2026-09-08: "I won't be recording a voice for pip so look into other
// options available to you to produce a less robotic voice for her."
//
// Every line in js/narration.js is rendered once, offline, by a local neural
// TTS and shipped as an ogg (tools/tts-narration.py). That moves the failure
// modes somewhere a suite can see them, which is the point of doing it this
// way rather than fighting the device's speech engine:
//
//   1. A LINE WITH NO CLIP. Add a line, forget to re-render, and it silently
//      falls back to the robot voice — which is exactly the bug this whole
//      change exists to fix, arriving one line at a time.
//   2. A CLIP WITH NO LINE. Rename a line id and the old clip is 30 kB of
//      download a child pays for and never hears.
//   3. A CLIP THAT IS NOT PRECACHED. Offline, an un-precached clip throws
//      "offline and not cached" and the line goes silent.
//   4. IT NEVER PLAYS. The wiring is fire-and-fall-back on purpose, so a
//      broken clip path is invisible: the old voice covers for it.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { launchBrowser } from './launch.mjs';

const errors = [];
const check = (n, ok, d) => {
  console.log((ok ? '✓ ' : '✗ ') + n, d !== undefined ? JSON.stringify(d) : '');
  if (!ok) errors.push(n);
};

// ---------------------------------------------------------------------------
console.log('\n── 1 · every line has a clip, and every clip a line ──');
globalThis.window = { addEventListener() {}, removeEventListener() {} };
globalThis.document = { getElementById: () => null,
  createElement: () => ({ style: {}, classList: { add() {}, remove() {} }, addEventListener() {} }) };
const { LINES } = await import('../js/narration.js');
const ids = Object.keys(LINES);
const dir = new URL('../assets/audio/vo/', import.meta.url).pathname;
const clips = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.ogg')) : [];
const have = new Set(clips.map((f) => f.replace(/\.ogg$/, '')));
const missing = ids.filter((id) => !have.has(id));
const orphan = [...have].filter((id) => !LINES[id]);
check(`all ${ids.length} narration lines are rendered`, missing.length === 0, missing);
check('...and no clip is left over from a renamed line', orphan.length === 0, orphan);

// ---------------------------------------------------------------------------
console.log('\n── 2 · every clip is precached ───────────────────────');
const sw = readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
const notCached = clips.filter((f) => !sw.includes(`./assets/audio/vo/${f}`));
check('every clip is in the service worker precache', notCached.length === 0, notCached);

// ---------------------------------------------------------------------------
console.log('\n── 3 · none of them is silence ───────────────────────');
// A clip that decodes to nothing is worse than no clip at all: the fallback
// never fires, so the line simply does not happen.
const b = await launchBrowser();
const page = await (await b.newContext({ viewport: { width: 400, height: 300 } })).newPage();
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
await page.goto('http://localhost:8901/index.html', { waitUntil: 'load' });
const stats = await page.evaluate(async (list) => {
  const ctx = new (window.OfflineAudioContext)(1, 44100, 44100);
  const out = [];
  for (const id of list) {
    try {
      const buf = await ctx.decodeAudioData(
        await (await fetch(`./assets/audio/vo/${id}.ogg`)).arrayBuffer());
      const ch = buf.getChannelData(0);
      let s = 0;
      for (let i = 0; i < ch.length; i++) s += ch[i] * ch[i];
      out.push({ id, secs: +(ch.length / buf.sampleRate).toFixed(2),
        rms: +Math.sqrt(s / ch.length).toFixed(3) });
    } catch (e) { out.push({ id, error: String(e).slice(0, 60) }); }
  }
  return out;
}, ids);
const broken = stats.filter((s) => s.error);
const silent = stats.filter((s) => !s.error && s.rms < 0.01);
const tooShort = stats.filter((s) => !s.error && s.secs < 0.4);
check('every clip decodes', broken.length === 0, broken.slice(0, 5));
check('...and none of them is silence', silent.length === 0, silent.slice(0, 5));
check('...and none is a clipped half-word', tooShort.length === 0, tooShort.slice(0, 5));
const secs = stats.filter((s) => !s.error).reduce((a, s) => a + s.secs, 0);
console.log(`  ${stats.length} clips, ${(secs / 60).toFixed(1)} minutes of speech in total`);

// ---------------------------------------------------------------------------
console.log('\n── 4 · it is the CLIP that plays, not the robot ──────');
// The wiring is fire-and-fall-back on purpose, which means a broken clip path
// is invisible in play — the device voice covers for it. So this asks the
// audio system directly whether the clip started.
await page.waitForSelector('#title', { state: 'visible', timeout: 20000 });
await page.locator('.profile-btn.new').dispatchEvent('pointerdown');
await page.fill('#t-name', 'VOICE');
await page.locator('#t-start').dispatchEvent('pointerdown');
await page.waitForFunction(() => window.__game && window.__game.world, null, { timeout: 90000 });
const played = await page.evaluate(async () => {
  const g = window.__game;
  g.state.settings.voice = true;
  const out = {};
  for (const id of ['intro_arrival', 'tam_intro', 'grimm_taunt_1']) {
    out[id] = await g.audio.speakLine(id, () => {});
    g.audio.stopLine();
  }
  // ...and a line that does NOT exist must resolve false rather than throw,
  // because that is the path a newly-added line takes until it is rendered.
  out.__absent = await g.audio.speakLine('no_such_line_at_all', () => {});
  return out;
});
check('a real line plays its rendered clip',
  played.intro_arrival && played.tam_intro && played.grimm_taunt_1, played);
check('...and a line with no clip falls back instead of throwing',
  played.__absent === false, played);

console.log('\n' + (errors.length ? `✗ ${errors.length} FAILED\n` + errors.join('\n')
  : '✓ every line in the game is spoken by a real voice'));
await b.close();
process.exit(errors.length ? 1 : 0);
