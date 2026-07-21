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
};

const MUSIC_FILES = {
  'region-ember': './assets/audio/music/region-ember.ogg',
  boss: './assets/audio/music/boss.wav',
  victory: './assets/audio/music/victory.ogg',
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
    if (this._wantMusic) this.playMusic(this._wantMusic.name, this._wantMusic.opts);
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

  async play(name, { volume = 1, rate = 1 } = {}) {
    if (!this.ctx || state.settings.sfxVol <= 0) return;
    const url = SFX_FILES[name];
    if (!url) return;
    try {
      const buf = await this._buffer(url);
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      src.playbackRate.value = rate;
      const g = this.ctx.createGain();
      g.gain.value = volume;
      src.connect(g);
      g.connect(this.sfxGain);
      src.start();
    } catch (e) { /* decode/fetch failure is non-fatal */ }
  }

  // Loops `name`; pass {loop:false, then:'other'} for a one-shot sting.
  async playMusic(name, opts = {}) {
    this._wantMusic = { name, opts };
    if (!this.ctx) return;
    if (this._musicName === name && opts.loop !== false) return;
    const url = MUSIC_FILES[name];
    if (!url) return;
    let buf;
    try { buf = await this._buffer(url); } catch (e) { return; }
    if (this._wantMusic.name !== name) return; // superseded while decoding

    // fade the old track out
    if (this._musicSource) {
      const old = this._musicSource;
      const og = this._musicFade;
      const t = this.ctx.currentTime;
      og.gain.cancelScheduledValues(t);
      og.gain.linearRampToValueAtTime(0, t + 0.7);
      setTimeout(() => { try { old.stop(); } catch (e) {} }, 800);
    }

    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.loop = opts.loop !== false;
    const fade = this.ctx.createGain();
    fade.gain.value = 0;
    src.connect(fade);
    fade.connect(this.musicGain);
    src.start();
    const t = this.ctx.currentTime;
    fade.gain.linearRampToValueAtTime(1, t + 0.8);
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
