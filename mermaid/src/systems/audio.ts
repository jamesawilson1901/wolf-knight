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

export function startAmbient(scene: Phaser.Scene) {
  const existing = scene.sound.get('ambient');
  if (existing?.isPlaying) return;
  scene.sound.play('ambient', { loop: true, volume: isMuted() ? 0 : 0.55 });
}

export function isMuted(): boolean {
  return localStorage.getItem(STORAGE_KEYS.muted) === '1';
}

export function setMuted(scene: Phaser.Scene, muted: boolean) {
  localStorage.setItem(STORAGE_KEYS.muted, muted ? '1' : '0');
  const ambient = scene.sound.get('ambient');
  if (ambient && 'setVolume' in ambient) {
    (ambient as Phaser.Sound.WebAudioSound).setVolume(muted ? 0 : 0.55);
  }
}
