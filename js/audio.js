// Audio: WebAudio SFX + looped music with crossfades and narration ducking.
// All files are local CC0 (Kenney SFX; music per design/ASSETS.md). The
// context unlocks on the first user gesture (browser autoplay policy).

import { state } from './state.js';

const SFX_FILES = {
  'sword-swing': './assets/audio/sfx/sword-swing.ogg',
  'sword-swing2': './assets/audio/sfx/sword-swing2.ogg',
  hit: './assets/audio/sfx/hit.ogg',
  puff: './assets/audio/sfx/puff.ogg',
  hurt: './assets/audio/sfx/hurt.ogg',
  'form-switch': './assets/audio/sfx/form-switch.ogg',
  geyser: './assets/audio/sfx/geyser.ogg',
  'pup-chime': './assets/audio/sfx/pup-chime.ogg',
  checkpoint: './assets/audio/sfx/checkpoint.ogg',
  'ui-click': './assets/audio/sfx/ui-click.ogg',
  slam: './assets/audio/sfx/slam.ogg',
  burn: './assets/audio/sfx/burn.ogg',
  'tendril-slam': './assets/audio/sfx/tendril-slam.ogg',
  'moon-impact': './assets/audio/sfx/moon-impact.ogg',
  throw: './assets/audio/sfx/throw.ogg',
  parry: './assets/audio/sfx/parry.ogg',
  potion: './assets/audio/sfx/potion.ogg',
  bones: './assets/audio/sfx/bones.ogg',
  // A HEAVY STONE MAKES A NOISE WHEN IT MOVES. The push-block puzzles were
  // completely silent — a child leans on a boulder the size of a cart and it
  // slides across bare rock without a sound, which reads as a bug even to
  // someone who could not say why. Kenney Foley (staged 2026-08-31), two drag
  // takes so consecutive shoves do not sound looped, and a settle for the
  // moment it stops or locks onto a plate.
  'stone-drag': './assets/audio/sfx/stone-drag.ogg',
  'stone-drag2': './assets/audio/sfx/stone-drag2.ogg',
  'stone-settle': './assets/audio/sfx/stone-settle.ogg',
  // v3.21.3: `bite` used to be a second copy of hit.ogg (a chop), so a wolf's
  // jaws and a sword landing made the identical sound. It now has its own —
  // Kenney impactSoft_medium_001, measured as the darkest and most front-loaded
  // candidate available (brightness 0.1 vs the chop's 3.5, half its energy in
  // the first 7ms): a snap, not a blade.
  bite: './assets/audio/sfx/bite.ogg',
  // GROWL is the chop pitched right down (rate 0.42-0.6 at every call site) —
  // that IS how the game has always made its growls, and there is no animal
  // sound in any pack on disk. One file, two names, and the PITCH does the
  // differentiating, which is the honest kind of alias: `hit` never plays below
  // 0.75, `growl` never plays above 0.6, so they never sound alike.
  // Before v3.21.3 the growls rode on `bite`, which is why `bite` could not be
  // given a real bite sound without breaking them.
  growl: './assets/audio/sfx/hit.ogg',
  'step-stone-0': './assets/audio/sfx/step-stone-0.ogg',
  'step-stone-1': './assets/audio/sfx/step-stone-1.ogg',
  'step-stone-2': './assets/audio/sfx/step-stone-2.ogg',
  'step-grass-0': './assets/audio/sfx/step-grass-0.ogg',
  'step-grass-1': './assets/audio/sfx/step-grass-1.ogg',
  'step-grass-2': './assets/audio/sfx/step-grass-2.ogg',
  'chest-open': './assets/audio/sfx/chest-open.ogg',
  coin: './assets/audio/sfx/coin.ogg',
  // The moment a chest throws its money into the air. coin.ogg is already
  // handleCoins.ogg from the same pack (checked by hash — the shipped file IS
  // that file), so the burst is its sibling handleCoins2: a different handful,
  // not the same chink played louder.
  'coin-burst': './assets/audio/sfx/coin-burst.ogg',
  'gate-creak': './assets/audio/sfx/gate-creak.ogg',
  // v3.21.3: whoosh was a second copy of puff.ogg. It now has its own —
  // Kenney cloth1: longer (0.68s vs 0.50), brighter and louder, so a dive or a
  // vine-lash moves real air while `puff` stays the small dust sound.
  whoosh: './assets/audio/sfx/whoosh.ogg',
};

const MUSIC_FILES = {
  'region-ember': './assets/audio/music/region-ember.ogg',
  causeway: './assets/audio/music/causeway.mp3',
  den: './assets/audio/music/den.ogg',
  'boss-intro': './assets/audio/music/boss-intro.ogg',
  'boss-loop': './assets/audio/music/boss-loop.ogg',
  victory: './assets/audio/music/victory.ogg',
  'region-stone': './assets/audio/music/region-stone.ogg',
  'stone-deep': './assets/audio/music/stone-deep.ogg',
  // ALIASES (v3.21.2). kiln.mp3 was byte-identical to causeway.mp3, and
  // ember-calm.ogg to den.ogg — 6.6 MB of the game's download was the same two
  // tracks shipped twice, which every kid's phone paid for on a slow
  // connection. Two names, one file each.
  kiln: './assets/audio/music/causeway.mp3',
  'ember-calm': './assets/audio/music/den.ogg',
  // SIX REGIONS GET THEIR OWN SOUND (2026-08-30). Five loops had been
  // stretched across nine regions since the rebuilds; these six are the
  // Superpowers Medieval Fantasy themes (CC0, licence file on disk — the
  // first formally-licensed music in the game; see assets/LICENSES/).
  // The theme→region casting was chosen by decoded-audio character and dad
  // has final cut: any of these can be re-pointed at another theme file
  // without touching code.
  frostpeak: './assets/audio/music/frostpeak.ogg',
  stormreach: './assets/audio/music/stormreach.ogg',
  sunkenvale: './assets/audio/music/sunkenvale.ogg',
  shadowcourt: './assets/audio/music/shadowcourt.ogg',
  'village-dark': './assets/audio/music/village-dark.ogg',
  spire: './assets/audio/music/spire.ogg',
  // THE TITLE SCREEN HAD NO MUSIC AT ALL — a campfire diorama turning in
  // silence while a child picked a profile. This is HydroGene's "long journey"
  // (same 16-bit RPG pack the rest of the game's music comes from, licence
  // already on disk), chosen against the others by decoded-audio character the
  // way the six region themes were: at 0.31 onsets/sec and dyn 0.13 it is the
  // CALMEST and steadiest thing in the pack, and its rms 0.119 / zcr 3.59 sit
  // in the same warm band as the Den's own theme (0.114 / 3.38) — so it sounds
  // like this game rather than like a track borrowed from another one. Kenney's
  // Music Loops were checked first and are cartoon polka/comedy: wrong genre.
  // Re-point this one line at any other file to change it; nothing else knows.
  title: './assets/audio/music/title.ogg',
};

// PER-TRACK TRIM. The vendored themes were not mastered against each other:
// decoded RMS puts sunkenvale's theme near -34 dB while spire's sits near
// -10 dB — walk from the Vale to the Spire and the music would jump to
// nine times the loudness. A linear gain per track, applied on top of the
// fade (1 = leave it alone). Numbers from tools-side decoded-audio
// measurement; dad's ear outranks them.
const MUSIC_TRIM = {
  sunkenvale: 3.2,     // very quiet master, high headroom (dyn 0.59)
  'village-dark': 1.15,
  spire: 0.8,          // hottest master of the six, pull it back a touch
};

class AudioSystem {
  constructor() {
    this.ctx = null;
    this.buffers = new Map();
    this.musicGain = null;
    this.sfxGain = null;
    this.duckGain = null;
    this._musicSource = null;
    this._musicName = null;
    this._musicUrl = null;
    this._wantMusic = null;
    this._unlocked = false;

    const unlock = () => {
      if (this._unlocked) return;
      this._unlocked = true;
      this._init();
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
  }

  _init() {
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.duckGain = this.ctx.createGain();      // narration ducking
    this.musicGain = this.ctx.createGain();     // music volume setting
    this.sfxGain = this.ctx.createGain();       // sfx volume setting
    this.musicGain.connect(this.duckGain);
    this.duckGain.connect(this.ctx.destination);
    this.sfxGain.connect(this.ctx.destination);
    this.applyVolumes();
    this._preloadSfx();
    this._startAmbient();
    if (this._wantMusic) this.playMusic(this._wantMusic.name, this._wantMusic.opts);
  }

  // A quiet volcanic rumble under everything: generated brown noise through
  // a deep low-pass (no asset needed, costs nothing offline).
  _startAmbient() {
    const seconds = 3;
    const rate = this.ctx.sampleRate;
    const buf = this.ctx.createBuffer(1, rate * seconds, rate);
    const data = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < data.length; i++) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.02 * white) / 1.02; // brown noise walk
      data[i] = last * 3.5;
    }
    // seamless loop: crossfade the tail into the head
    const fade = Math.floor(rate * 0.25);
    for (let i = 0; i < fade; i++) {
      const f = i / fade;
      data[i] = data[i] * f + data[data.length - fade + i] * (1 - f);
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 110;
    this.ambientGain = this.ctx.createGain();
    this.ambientGain.gain.value = 0;
    src.connect(filter);
    filter.connect(this.ambientGain);
    this.ambientGain.connect(this.musicGain); // follows the music slider
    src.start();
    this.setAmbient(this._wantAmbient !== undefined ? this._wantAmbient : 0.5);
  }

  // 0..1 rumble level (rooms with more lava rumble louder)
  setAmbient(level) {
    this._wantAmbient = level;
    if (!this.ambientGain) return;
    const t = this.ctx.currentTime;
    this.ambientGain.gain.cancelScheduledValues(t);
    this.ambientGain.gain.linearRampToValueAtTime(level * 0.4, t + 1.2);
  }

  applyVolumes() {
    if (!this.ctx) return;
    this.musicGain.gain.value = state.settings.musicVol;
    this.sfxGain.gain.value = state.settings.sfxVol;
  }

  duck(on) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.duckGain.gain.cancelScheduledValues(t);
    this.duckGain.gain.linearRampToValueAtTime(on ? 0.3 : 1, t + 0.25);
  }

  async _buffer(url) {
    if (!this.buffers.has(url)) {
      this.buffers.set(url, (async () => {
        const res = await fetch(url);
        const raw = await res.arrayBuffer();
        return this.ctx.decodeAudioData(raw);
      })());
    }
    return this.buffers.get(url);
  }

  // Decode every SFX right after the audio context unlocks, so the FIRST
  // sword hit of a session already has its buffer ready (no decode hiccup).
  _preloadSfx() {
    for (const url of Object.values(SFX_FILES)) this._buffer(url).catch(() => {});
  }

  // vary: ± fraction of random pitch drift (0.08 = ±8%) — stops repeated
  // hits sounding like the same sample stamped over and over.
  async play(name, { volume = 1, rate = 1, vary = 0 } = {}) {
    if (!this.ctx || state.settings.sfxVol <= 0) return;
    const url = SFX_FILES[name];
    if (!url) return;
    try {
      const buf = await this._buffer(url);
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      src.playbackRate.value = rate * (vary ? 1 + (Math.random() * 2 - 1) * vary : 1);
      const g = this.ctx.createGain();
      g.gain.value = volume;
      src.connect(g);
      g.connect(this.sfxGain);
      src.start();
    } catch (e) { /* decode/fetch failure is non-fatal */ }
  }

  // Loops `name`; pass {loop:false, then:'other'} for a one-shot sting, or
  // {intro:'track'} to play an intro once and glide seamlessly into the loop.
  async playMusic(name, opts = {}) {
    this._wantMusic = { name, opts };
    if (!this.ctx) return;
    const url = MUSIC_FILES[name];
    if (!url) return;
    // Compare the resolved FILE, not the name: two names can share one track
    // (kiln/causeway, ember-calm/den). Without this, walking from the Den into
    // the healed Hollow would fade out a track and fade the identical track
    // back in — an audible stutter for no reason. The name is still recorded
    // so `then:` chaining reasons about what was actually asked for.
    if (this._musicUrl === url && opts.loop !== false) { this._musicName = name; return; }
    let buf, introBuf = null;
    try {
      buf = await this._buffer(url);
      if (opts.intro) introBuf = await this._buffer(MUSIC_FILES[opts.intro]);
    } catch (e) { return; }
    // SUPERSEDED — OR STOPPED. `stopMusic()` sets _wantMusic to null, so a
    // decode still in flight when the music is stopped used to dereference it
    // and throw. Latent since this function was written; the title-screen
    // lobby track is simply the first path that reliably plays and then stops
    // inside the few seconds a decode takes, and window.__errors (added
    // yesterday) caught it as an unhandled rejection the first time it ran.
    if (!this._wantMusic || this._wantMusic.name !== name) return;

    // fade the old track out
    const t = this.ctx.currentTime;
    if (this._musicSource) {
      const old = this._musicSource;
      const oldIntro = this._musicIntroSource;
      const og = this._musicFade;
      og.gain.cancelScheduledValues(t);
      og.gain.linearRampToValueAtTime(0, t + 0.7);
      setTimeout(() => {
        try { old.stop(); } catch (e) {}
        try { oldIntro && oldIntro.stop(); } catch (e) {}
      }, 800);
    }

    const fade = this.ctx.createGain();
    fade.gain.value = 0;
    fade.connect(this.musicGain);
    fade.gain.linearRampToValueAtTime(MUSIC_TRIM[name] || 1, t + 0.8);

    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.loop = opts.loop !== false;
    src.connect(fade);

    if (introBuf) {
      // intro plays once; the loop starts sample-accurately as it ends
      const intro = this.ctx.createBufferSource();
      intro.buffer = introBuf;
      intro.connect(fade);
      intro.start(t);
      src.start(t + introBuf.duration);
      this._musicIntroSource = intro;
    } else {
      src.start();
      this._musicIntroSource = null;
    }
    this._musicSource = src;
    this._musicFade = fade;
    this._musicName = name;
    this._musicUrl = url;

    if (opts.loop === false && opts.then) {
      src.onended = () => {
        if (this._musicName === name) this.playMusic(opts.then);
      };
    }
  }

  // A stylized wolf HOWL, synthesized (no CC0 howl exists in our packs):
  // two detuned voices glide up, hold with vibrato, and fall away through a
  // low-pass — reads as a low-poly howl, matches the art. rate < 1 = bigger
  // wolf (the boss), rate > 1 = Kael's wolves.
  howl({ volume = 0.8, rate = 1 } = {}) {
    if (!this.ctx || state.settings.sfxVol <= 0) return;
    const t0 = this.ctx.currentTime;
    const dur = 2.2 / rate;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(volume * 0.5, t0 + 0.25 / rate);
    g.gain.setValueAtTime(volume * 0.5, t0 + dur * 0.62);
    g.gain.linearRampToValueAtTime(0, t0 + dur);
    g.connect(this.sfxGain);
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1100 * rate;
    lp.connect(g);
    for (const det of [0, 5]) {
      const o = this.ctx.createOscillator();
      o.type = 'sawtooth'; // breathy through the low-pass
      const f0 = 210 * rate + det;
      o.frequency.setValueAtTime(f0, t0);
      o.frequency.linearRampToValueAtTime(f0 * 2.1, t0 + 0.5 / rate);
      o.frequency.setValueAtTime(f0 * 2.1, t0 + dur * 0.6);
      o.frequency.linearRampToValueAtTime(f0 * 1.2, t0 + dur);
      const v = this.ctx.createOscillator();
      v.frequency.value = 5.5;
      const vg = this.ctx.createGain();
      vg.gain.value = 7;
      v.connect(vg);
      vg.connect(o.frequency);
      v.start(t0); v.stop(t0 + dur);
      o.connect(lp);
      o.start(t0); o.stop(t0 + dur);
    }
  }

  // Four rising notes — the level-up fanfare (synthesized; our CC0 packs
  // have no fanfare and the moment deserves more than a chime).
  fanfare({ volume = 0.7 } = {}) {
    if (!this.ctx || state.settings.sfxVol <= 0) return;
    const notes = [523.25, 659.25, 783.99, 1046.5]; // C E G C
    const t0 = this.ctx.currentTime;
    notes.forEach((f, i) => {
      const o = this.ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.value = f;
      const g = this.ctx.createGain();
      const ts = t0 + i * 0.11;
      g.gain.setValueAtTime(0, ts);
      g.gain.linearRampToValueAtTime(volume * (i === 3 ? 0.5 : 0.35), ts + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, ts + (i === 3 ? 0.7 : 0.25));
      o.connect(g);
      g.connect(this.sfxGain);
      o.start(ts);
      o.stop(ts + 0.8);
    });
  }

  stopMusic() {
    this._wantMusic = null;
    this._musicName = null;
    if (this._musicSource) {
      try { this._musicSource.stop(); } catch (e) {}
      this._musicSource = null;
    }
  }
}

export const audio = new AudioSystem();
