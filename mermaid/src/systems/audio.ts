import Phaser from 'phaser';
import { STORAGE_KEYS } from '../config';

// Audio is the main feedback channel — every action makes a sound.
// iOS: Phaser unlocks the WebAudio context on the first user gesture.

let lastTap = 0;

export function sfx(
  scene: Phaser.Scene,
  key: string,
  opts?: Phaser.Types.Sound.SoundConfig,
) {
  if (isMuted()) return;
  if (key === 'tap') {
    // throttle the touch blip so drags don't machine-gun it
    const now = scene.time.now;
    if (now - lastTap < 180) return;
    lastTap = now;
  }
  scene.sound.play(key, opts);
}

// Flipped on by the asset build when audio-source/music.mp3 exists. Keeping
// it a constant means the loader never 404s looking for a track we don't have.
export const MUSIC_PRESENT = __MUSIC_PRESENT__;

export function startAmbient(scene: Phaser.Scene) {
  const existing = scene.sound.get('ambient');
  if (!existing?.isPlaying) {
    scene.sound.play('ambient', { loop: true, volume: isMuted() ? 0 : 0.55 });
  }
  if (MUSIC_PRESENT) {
    const music = scene.sound.get('music');
    if (!music?.isPlaying) {
      scene.sound.play('music', { loop: true, volume: isMuted() ? 0 : 0.4 });
    }
  }
}

export function isMuted(): boolean {
  return localStorage.getItem(STORAGE_KEYS.muted) === '1';
}

export function setMuted(scene: Phaser.Scene, muted: boolean) {
  localStorage.setItem(STORAGE_KEYS.muted, muted ? '1' : '0');
  const set = (key: string, vol: number) => {
    const s = scene.sound.get(key);
    if (s && 'setVolume' in s) (s as Phaser.Sound.WebAudioSound).setVolume(muted ? 0 : vol);
  };
  set('ambient', 0.55);
  if (MUSIC_PRESENT) set('music', 0.4);
}
