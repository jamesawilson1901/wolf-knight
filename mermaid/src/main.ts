import Phaser from 'phaser';
import { computeGameWidth, DESIGN_HEIGHT } from './config';
import { ControlTestScene } from './scenes/ControlTestScene';
import { PreloadScene } from './scenes/PreloadScene';
import { StartScene } from './scenes/StartScene';
import { GameScene } from './scenes/GameScene';
import { VictoryScene } from './scenes/VictoryScene';

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'app',
  width: computeGameWidth(),
  height: DESIGN_HEIGHT,
  backgroundColor: '#0a2f4d',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  input: {
    activePointers: 3,
  },
});

// dev handle for automated smoke tests, and a build stamp so "is this the
// new version?" is answerable: check window.__build or the console line.
(window as unknown as { __game: Phaser.Game }).__game = game;
(window as unknown as { __build: string }).__build = __BUILD_ID__;
console.log('Mermaid Reef build', __BUILD_ID__);

/**
 * Staying up to date.
 *
 * Relying on the service worker's own update() is not enough — measured, it
 * can decline to pick up a genuinely new worker, and even when it does the
 * already-running page keeps the code it downloaded, so a new build only
 * shows up on the *second* launch. An installed app on a child's phone then
 * quietly runs an old build for weeks, which is exactly what happened here.
 *
 * So the app asks directly: fetch the never-cached version.json and compare
 * it with the build baked into this bundle. If they differ, drop the caches,
 * unregister the worker and reload once. Offline the fetch simply fails and
 * everything carries on from cache, which is the whole point of the PWA.
 */
async function ensureLatestBuild() {
  if (!navigator.onLine) return;
  try {
    const res = await fetch(`./version.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) return;
    const { build } = (await res.json()) as { build?: string };
    if (!build || build === __BUILD_ID__) return;
    // guard against a reload loop if a deploy is ever half-published
    const tried = sessionStorage.getItem('mermaid-reef.updating');
    if (tried === build) return;
    sessionStorage.setItem('mermaid-reef.updating', build);
    console.log(`Mermaid Reef updating ${__BUILD_ID__} -> ${build}`);
    if ('caches' in window) {
      for (const key of await caches.keys()) await caches.delete(key);
    }
    if ('serviceWorker' in navigator) {
      for (const reg of await navigator.serviceWorker.getRegistrations()) await reg.unregister();
    }
    location.reload();
  } catch {
    /* offline, or no version.json — keep playing what we have */
  }
}

ensureLatestBuild();
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) ensureLatestBuild();
});

const test = new URLSearchParams(location.search).get('test');
if (test === 'controls') {
  game.scene.add('controls', ControlTestScene, true);
} else {
  game.scene.add('preload', PreloadScene, true);
  game.scene.add('start', StartScene, false);
  game.scene.add('game', GameScene, false);
  game.scene.add('victory', VictoryScene, false);
}

// Portrait: the CSS overlay (index.html) shows a rotate hint; pause the game
// and all audio underneath, resume cleanly when she turns the phone back.
const portrait = window.matchMedia('(orientation: portrait)');
let pausedScenes: Phaser.Scene[] = [];
function onOrientation() {
  if (portrait.matches) {
    pausedScenes = game.scene.getScenes(true);
    pausedScenes.forEach((s) => s.scene.pause());
    game.sound.pauseAll();
  } else {
    pausedScenes.forEach((s) => s.scene.resume());
    pausedScenes = [];
    game.sound.resumeAll();
  }
}
portrait.addEventListener('change', onOrientation);
onOrientation();
