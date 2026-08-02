/**
 * Builds the game's audio to public/assets/audio/*.wav.
 *
 * Preferred source: real recordings in audio-source/<slot>.mp3 (Pixabay /
 * CC0) — decoded, mixed to mono, trimmed, normalised, and (for ambient)
 * loop-crossfaded. Slots without a recording fall back to the synthesized
 * versions below (bell/harp tones with proper envelopes — not beeps), which
 * shipped originally because the build sandbox's network blocked the CC0
 * sources.
 *
 * Slots: ambient, tap, pearl, coin, joy, chest, complete.
 *
 * WAV (PCM16) on purpose: seamless ambient looping (no MP3 encoder gap) and
 * universal decode support incl. iOS Safari.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MPEGDecoder } from 'mpg123-decoder';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'public', 'assets', 'audio');
const REC = join(ROOT, 'audio-source'); // real CC0/Pixabay recordings, preferred
mkdirSync(OUT, { recursive: true });

/** True if a real recording exists for this slot (audio-source/<slot>.mp3). */
function hasRecording(slot: string): boolean {
  return existsSync(join(REC, `${slot}.mp3`));
}

async function decodeMp3(slot: string): Promise<{ pcm: Float32Array; rate: number }> {
  const decoder = new MPEGDecoder();
  await decoder.ready;
  const { channelData, sampleRate } = decoder.decode(new Uint8Array(readFileSync(join(REC, `${slot}.mp3`))));
  decoder.free();
  // mixdown to mono — it's a phone speaker
  const n = channelData[0].length;
  const pcm = new Float32Array(n);
  for (const ch of channelData) for (let i = 0; i < n; i++) pcm[i] += ch[i] / channelData.length;
  return { pcm, rate: sampleRate };
}

function trim(pcm: Float32Array, rate: number, opts: { maxDur?: number; fadeOut?: number } = {}): Float32Array {
  let start = 0;
  while (start < pcm.length && Math.abs(pcm[start]) < 0.012) start++;
  start = Math.max(0, start - Math.floor(rate * 0.015));
  let end = pcm.length - 1;
  while (end > start && Math.abs(pcm[end]) < 0.006) end--;
  end = Math.min(pcm.length - 1, end + Math.floor(rate * 0.05));
  if (opts.maxDur) end = Math.min(end, start + Math.floor(rate * opts.maxDur));
  const out = pcm.slice(start, end + 1);
  const fade = Math.min(out.length, Math.floor(rate * (opts.fadeOut ?? 0.03)));
  for (let i = 0; i < fade; i++) out[out.length - 1 - i] *= i / fade;
  return out;
}

/** Crossfade the tail into the head so the loop wraps seamlessly. */
function loopify(pcm: Float32Array, rate: number, overlapS: number): Float32Array {
  const overlap = Math.floor(rate * overlapS);
  const loopN = pcm.length - overlap;
  const out = new Float32Array(loopN);
  out.set(pcm.subarray(0, loopN));
  for (let i = 0; i < overlap; i++) {
    const t = i / overlap;
    out[i] = out[i] * t + pcm[loopN + i] * (1 - t);
  }
  return out;
}

// ---- real recordings (preferred when present) ----------------------------
if (hasRecording('ambient')) {
  const { pcm, rate } = await decodeMp3('ambient');
  // cap at ~32 s to keep the precache lean, then make the loop seamless
  const capped = pcm.subarray(0, Math.min(pcm.length, Math.floor(rate * 32)));
  writeWav('ambient.wav', loopify(capped, rate, 1.6), rate);
}
if (hasRecording('tap')) {
  const { pcm, rate } = await decodeMp3('tap');
  writeWav('tap.wav', trim(pcm, rate, { maxDur: 1.2, fadeOut: 0.12 }), rate);
}
if (hasRecording('chest')) {
  const { pcm, rate } = await decodeMp3('chest');
  writeWav('chest.wav', trim(pcm, rate, { maxDur: 2.6, fadeOut: 0.2 }), rate);
}
if (hasRecording('pearl')) {
  const { pcm, rate } = await decodeMp3('pearl');
  writeWav('pearl.wav', trim(pcm, rate, { maxDur: 0.8, fadeOut: 0.06 }), rate);
}
if (hasRecording('coin')) {
  const { pcm, rate } = await decodeMp3('coin');
  writeWav('coin.wav', trim(pcm, rate, { maxDur: 0.9, fadeOut: 0.06 }), rate);
}
if (hasRecording('joy')) {
  const { pcm, rate } = await decodeMp3('joy');
  writeWav('joy.wav', trim(pcm, rate, { maxDur: 1.6, fadeOut: 0.15 }), rate);
}
if (hasRecording('complete')) {
  const { pcm, rate } = await decodeMp3('complete');
  writeWav('complete.wav', trim(pcm, rate, { maxDur: 3.2, fadeOut: 0.25 }), rate);
}

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function writeWav(name: string, samples: Float32Array, rate: number) {
  // normalise to -1.5 dBFS if needed
  let peak = 0;
  for (const s of samples) peak = Math.max(peak, Math.abs(s));
  const gain = peak > 0 ? Math.min(1, 0.84 / peak) : 1;
  const buf = Buffer.alloc(44 + samples.length * 2);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + samples.length * 2, 4);
  buf.write('WAVEfmt ', 8);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(1, 22); // mono
  buf.writeUInt32LE(rate, 24);
  buf.writeUInt32LE(rate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(samples.length * 2, 40);
  for (let i = 0; i < samples.length; i++) {
    buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, samples[i] * gain)) * 32767), 44 + i * 2);
  }
  writeFileSync(join(OUT, name), buf);
  console.log(`${name}: ${(buf.length / 1024).toFixed(0)} KB`);
}

const mix = (target: Float32Array, src: Float32Array, at: number, gain = 1) => {
  const start = Math.floor(at);
  for (let i = 0; i < src.length && start + i < target.length; i++) target[start + i] += src[i] * gain;
};

/** Bell-like tone: a few inharmonic partials with exponential decay. */
function bell(rate: number, freq: number, dur: number, bright = 1): Float32Array {
  const n = Math.floor(rate * dur);
  const out = new Float32Array(n);
  const partials = [
    { r: 1, a: 1, d: 3.2 },
    { r: 2.0, a: 0.42 * bright, d: 5 },
    { r: 2.98, a: 0.22 * bright, d: 7 },
    { r: 4.2, a: 0.12 * bright, d: 9 },
  ];
  for (const p of partials) {
    const w = (2 * Math.PI * freq * p.r) / rate;
    for (let i = 0; i < n; i++) {
      const t = i / rate;
      const attack = Math.min(1, i / (rate * 0.004));
      out[i] += Math.sin(w * i) * p.a * attack * Math.exp(-t * p.d);
    }
  }
  return out;
}

/** Soft plucked-harp tone: fundamental + 2nd harmonic, quick decay. */
function harp(rate: number, freq: number, dur: number): Float32Array {
  const n = Math.floor(rate * dur);
  const out = new Float32Array(n);
  const w = (2 * Math.PI * freq) / rate;
  for (let i = 0; i < n; i++) {
    const t = i / rate;
    const attack = Math.min(1, i / (rate * 0.003));
    out[i] =
      (Math.sin(w * i) + 0.35 * Math.sin(2 * w * i) + 0.1 * Math.sin(3 * w * i)) *
      attack *
      Math.exp(-t * 4.5) *
      0.6;
  }
  return out;
}

function onePole(samples: Float32Array, rate: number, cutoff: number) {
  const k = 1 - Math.exp((-2 * Math.PI * cutoff) / rate);
  let y = 0;
  for (let i = 0; i < samples.length; i++) {
    y += (samples[i] - y) * k;
    samples[i] = y;
  }
}

// ---- tap: soft waterdrop blip -------------------------------------------
if (!hasRecording('tap')) {
  const rate = 44100;
  const dur = 0.16;
  const n = Math.floor(rate * dur);
  const out = new Float32Array(n);
  let phase = 0;
  for (let i = 0; i < n; i++) {
    const t = i / rate;
    const f = 560 * Math.exp(-t * 9) + 190; // falling pitch = droplet
    phase += (2 * Math.PI * f) / rate;
    out[i] = Math.sin(phase) * Math.min(1, i / (rate * 0.003)) * Math.exp(-t * 22);
  }
  writeWav('tap.wav', out, rate);
}

// ---- pearl: glassy ascending ding ---------------------------------------
if (!hasRecording('pearl')) {
  const rate = 44100;
  const out = new Float32Array(Math.floor(rate * 0.55));
  mix(out, bell(rate, 1046.5, 0.55), 0, 0.9); // C6
  mix(out, bell(rate, 1568, 0.4, 1.2), rate * 0.05, 0.35); // G6 shimmer
  writeWav('pearl.wav', out, rate);
}

// ---- coin: brighter two-note chime --------------------------------------
if (!hasRecording('coin')) {
  const rate = 44100;
  const out = new Float32Array(Math.floor(rate * 0.5));
  mix(out, bell(rate, 1318.5, 0.3, 1.3), 0, 0.8); // E6
  mix(out, bell(rate, 1975.5, 0.38, 1.3), rate * 0.085, 0.7); // B6
  writeWav('coin.wav', out, rate);
}

// ---- joy: quick harp flourish -------------------------------------------
if (!hasRecording('joy')) {
  const rate = 44100;
  const out = new Float32Array(Math.floor(rate * 0.8));
  const notes = [783.99, 1046.5]; // G5 C6
  notes.forEach((f, i) => mix(out, harp(rate, f, 0.6), rate * 0.07 * i, 0.8));
  writeWav('joy.wav', out, rate);
}

// ---- chest: rising harp gliss + warm swell ------------------------------
if (!hasRecording('chest')) {
  const rate = 44100;
  const out = new Float32Array(Math.floor(rate * 1.9));
  const gliss = [523.25, 659.26, 783.99, 1046.5, 1318.5, 1568]; // C5 E5 G5 C6 E6 G6
  gliss.forEach((f, i) => mix(out, harp(rate, f, 0.9), rate * 0.09 * i, 0.75));
  // low warm swell underneath
  for (let i = 0; i < out.length; i++) {
    const t = i / rate;
    const env = Math.min(1, t / 0.5) * Math.exp(-Math.max(0, t - 0.7) * 2.2);
    out[i] += (Math.sin(2 * Math.PI * 130.8 * t) + 0.6 * Math.sin(2 * Math.PI * 196 * t)) * env * 0.13;
  }
  writeWav('chest.wav', out, rate);
}

// ---- complete: gentle pentatonic fanfare --------------------------------
if (!hasRecording('complete')) {
  const rate = 44100;
  const out = new Float32Array(Math.floor(rate * 2.4));
  const notes = [523.25, 659.26, 783.99, 1046.5]; // C5 E5 G5 C6
  notes.forEach((f, i) => mix(out, bell(rate, f, 1.1), rate * 0.14 * i, 0.65));
  // closing chord
  [523.25, 659.26, 783.99, 1046.5].forEach((f) =>
    mix(out, bell(rate, f, 1.5, 0.7), rate * 0.62, 0.4),
  );
  writeWav('complete.wav', out, rate);
}

// ---- ambient: 24 s seamless underwater loop ------------------------------
if (!hasRecording('ambient')) {
  const rate = 22050;
  const durRender = 27; // render long, wrap-blend the tail into the head
  const loop = 24;
  const n = Math.floor(rate * durRender);
  const out = new Float32Array(n);
  const rand = mulberry32(20260802);

  // deep water rumble: filtered brown noise with a slow swell LFO
  let brown = 0;
  const noise = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    brown += (rand() * 2 - 1) * 0.02;
    brown *= 0.997;
    noise[i] = brown;
  }
  onePole(noise, rate, 320);
  onePole(noise, rate, 320);
  for (let i = 0; i < n; i++) {
    const t = i / rate;
    const lfo = 0.75 + 0.25 * Math.sin(2 * Math.PI * t / 11.7);
    out[i] += noise[i] * lfo * 5.2;
  }

  // soft detuned pad (C2 G2 C3 E3), each partial breathing on its own cycle
  const pad = [
    { f: 65.4, p: 13.1 },
    { f: 98.0, p: 17.3 },
    { f: 130.8, p: 9.4 },
    { f: 164.8, p: 21.2 },
  ];
  for (const v of pad) {
    for (let i = 0; i < n; i++) {
      const t = i / rate;
      const breathe = 0.5 + 0.5 * Math.sin((2 * Math.PI * t) / v.p + v.f);
      out[i] +=
        (Math.sin(2 * Math.PI * v.f * t) + Math.sin(2 * Math.PI * (v.f * 1.003) * t)) *
        breathe *
        0.028;
    }
  }

  // occasional little bubble runs, quiet and randomised (seeded)
  let at = 1.5;
  while (at < durRender - 1.5) {
    const count = 3 + Math.floor(rand() * 5);
    for (let b = 0; b < count; b++) {
      const start = (at + b * (0.09 + rand() * 0.07)) * rate;
      const f0 = 380 + rand() * 420;
      const len = Math.floor(rate * 0.09);
      const blip = new Float32Array(len);
      for (let i = 0; i < len; i++) {
        const t = i / rate;
        blip[i] = Math.sin(2 * Math.PI * (f0 + 900 * t) * t) * Math.exp(-t * 40) * (0.5 + b / count);
      }
      mix(out, blip, start, 0.05);
    }
    at += 2.8 + rand() * 3.4;
  }

  // wrap-blend: fade the samples past the loop point into the start
  const loopN = Math.floor(rate * loop);
  const tail = n - loopN;
  const looped = new Float32Array(loopN);
  looped.set(out.subarray(0, loopN));
  for (let i = 0; i < tail; i++) {
    const t = i / tail;
    looped[i] = looped[i] * t + out[loopN + i] * (1 - t);
  }
  writeWav('ambient.wav', looped, rate);
}
