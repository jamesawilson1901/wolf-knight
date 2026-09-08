// WHAT DOES THIS TRACK SOUND LIKE, IN NUMBERS?
//
// The six region themes and the title track were each cast by "decoded-audio
// character" rather than by listening once and guessing — rms for how loud it
// sits, zcr for how bright, onsets/sec for how busy, dyn for how much it moves.
// This is the instrument that produces those numbers, extracted so the next
// casting call does not start from nothing.
//
// It decodes in the BROWSER because that is the only ogg decoder in this
// toolchain (no ffmpeg, no numpy) — and because it is the same decoder the
// game will use, so what it measures is what a child hears.
//
//   WK_TRACKS='/asset-raw/music-cand/theme-1.ogg,/assets/audio/music/den.ogg' \
//     node tools/probe-music-character.mjs
import { launchBrowser } from './launch.mjs';

const TRACKS = (process.env.WK_TRACKS || '').split(',').map((s) => s.trim()).filter(Boolean);
if (!TRACKS.length) { console.log('set WK_TRACKS'); process.exit(1); }

const b = await launchBrowser();
const page = await (await b.newContext({ viewport: { width: 400, height: 300 } })).newPage();
page.on('pageerror', (e) => console.error('ERR', e.message));
await page.goto('http://localhost:8901/index.html', { waitUntil: 'load' });

const rows = [];
for (const url of TRACKS) {
  const r = await page.evaluate(async (u) => {
    const ctx = new (window.OfflineAudioContext || window.webkitOfflineAudioContext)(1, 44100, 44100);
    const buf = await ctx.decodeAudioData(await (await fetch(u)).arrayBuffer());
    const ch = buf.getChannelData(0);
    const n = ch.length, sr = buf.sampleRate;
    // rms and zero-crossing rate (kHz) over the whole track
    let sum = 0, zc = 0;
    for (let i = 1; i < n; i++) {
      sum += ch[i] * ch[i];
      if ((ch[i - 1] < 0) !== (ch[i] < 0)) zc++;
    }
    const rms = Math.sqrt(sum / n);
    const zcr = (zc / (n / sr)) / 1000;
    // envelope in 46ms frames -> onsets (a frame louder than 1.6x the last)
    // and dyn (spread of the envelope), which is what separates a calm loop
    // from a busy one far better than loudness does.
    const HOP = Math.round(sr * 0.046);
    const env = [];
    for (let i = 0; i + HOP < n; i += HOP) {
      let s = 0;
      for (let j = i; j < i + HOP; j++) s += ch[j] * ch[j];
      env.push(Math.sqrt(s / HOP));
    }
    let onsets = 0;
    for (let i = 1; i < env.length; i++) if (env[i] > env[i - 1] * 1.6 + 0.004) onsets++;
    const mean = env.reduce((a, x) => a + x, 0) / env.length;
    const dyn = Math.sqrt(env.reduce((a, x) => a + (x - mean) ** 2, 0) / env.length);
    return { secs: +(n / sr).toFixed(1), rms: +rms.toFixed(3), zcr: +zcr.toFixed(2),
      onsets: +(onsets / (n / sr)).toFixed(2), dyn: +dyn.toFixed(3) };
  }, url).catch((e) => ({ error: String(e).slice(0, 90) }));
  rows.push({ url, ...r });
  console.log(url.split('/').pop().padEnd(22), JSON.stringify(r));
}
await b.close();
