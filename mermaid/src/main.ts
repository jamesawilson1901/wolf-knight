import Phaser from 'phaser';
import { computeGameWidth, DESIGN_HEIGHT } from './config';
import { ControlTestScene } from './scenes/ControlTestScene';
import { PreloadScene } from './scenes/PreloadScene';
import { StartScene } from './scenes/StartScene';
import { GameScene } from './scenes/GameScene';

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

// dev handle for automated smoke tests
(window as unknown as { __game: Phaser.Game }).__game = game;

const test = new URLSearchParams(location.search).get('test');
if (test === 'controls') {
  game.scene.add('controls', ControlTestScene, true);
} else {
  game.scene.add('preload', PreloadScene, true);
  game.scene.add('start', StartScene, false);
  game.scene.add('game', GameScene, false);
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
