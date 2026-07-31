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
  kiln: './assets/audio/music/kiln.mp3',
  'ember-calm': './assets/audio/music/ember-calm.ogg',
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
    if (this._musicName === name && opts.loop !== false) return;
    const url = MUSIC_FILES[name];
    if (!url) return;
    let buf, introBuf = null;
    try {
      buf = await this._buffer(url);
      if (opts.intro) introBuf = await this._buffer(MUSIC_FILES[opts.intro]);
    } catch (e) { return; }
    if (this._wantMusic.name !== name) return; // superseded while decoding

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
    fade.gain.linearRampToValueAtTime(1, t + 0.8);

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

    if (opts.loop === false && opts.then) {
      src.onended = () => {
        if (this._musicName === name) this.playMusic(opts.then);
      };
    }
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
