// THE ARMOURY — a living equipment screen.
//
// Dad, 2026-08-31: "I'd like the backpack changed and the whole equipping
// thing changed, it feels too kindergarten. it should feel adventure game.
// even have it come up like split screen and have the character on one side
// slowly rotating or something and when you equip a piece of armour or sword
// it change in front of you." And, in the same breath, the rule that makes it
// worth doing: "if you pick up a red axe, it has to be a red axe in the
// player's hand when equipped."
//
// The hand-mounting half of that rule was already true and measured
// (scratchpad/gearid.mjs, 2026-08-31: every weapon mounts its own file, every
// tint lands, all six armours recolour the plate). What was NOT true was the
// SCREEN: the backpack drew each item as an EMOJI, so the Cinder Axe — a real
// red axe in the world and in your hand — was a 🔥 in the bag. This module is
// the fix for that half: real models, rendered, everywhere gear is shown.
//
// Two renderers' worth of work, deliberately split by cost:
//
//   * itemThumb() renders ONE frame of a model to a PNG data URL using the
//     game's OWN renderer (the render-to-texture trick js/titlescene.js
//     already uses for profile portraits) and caches it forever. Item art for
//     a list of thirty things must not cost thirty live scenes.
//   * EquipPreview owns a SECOND, small WebGL context for the one thing that
//     has to actually move: the knight himself, turning on the spot, changing
//     as you equip. It is created once, lazily, on first open and then reused
//     — never per-open, because churning contexts is how a browser runs out of
//     them. If creation fails at all, callers fall back to a still thumbnail;
//     a menu must never be the thing that breaks the game.

import * as THREE from 'three';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { loadGLB, prepareCharacter } from './assets.js';
import { state } from './state.js';
import { WEAPONS, SHIELDS, ARMOURS, weaponDef, shieldDef, armourDef } from './items.js';

// ---------------------------------------------------------------------------
// Item art: one still render per (file, tint), cached by that pair.
// ---------------------------------------------------------------------------

const THUMBS = new Map();          // 'file|tint' -> PNG data URL
const THUMB_SIZE = 128;
let thumbRT = null, thumbCanvas = null, thumbCtx = null, thumbBuf = null;

// A tint is applied here exactly the way js/player.js does it for a held
// weapon — colour multiplied onto a clone, never onto the shared cache — so
// the axe in the bag is the same red as the axe in your hand.
function tintClone(model, tint) {
  if (!tint) return model;
  model.traverse((n) => {
    if (!n.isMesh || !n.material) return;
    const mats = Array.isArray(n.material) ? n.material : [n.material];
    const cloned = mats.map((m) => { const c = m.clone(); if (c.color) c.color.setHex(tint); return c; });
    n.material = Array.isArray(n.material) ? cloned : cloned[0];
  });
  return model;
}

// Render `def` (anything with .file and optional .tint) to a PNG data URL.
// Returns null if the model cannot be loaded — callers keep their placeholder
// rather than showing a broken image.
export async function itemThumb(renderer, def) {
  if (!def || !def.file) return null;
  const key = `${def.file}|${def.tint || 0}`;
  if (THUMBS.has(key)) return THUMBS.get(key);

  let gltf;
  try { gltf = await loadGLB(def.file); }
  catch (e) { console.warn('[equip] no model for thumb:', def.file, e); return null; }

  if (!thumbRT) {
    thumbRT = new THREE.WebGLRenderTarget(THUMB_SIZE, THUMB_SIZE);
    thumbCanvas = document.createElement('canvas');
    thumbCanvas.width = thumbCanvas.height = THUMB_SIZE;
    thumbCtx = thumbCanvas.getContext('2d');
    thumbBuf = new Uint8Array(THUMB_SIZE * THUMB_SIZE * 4);
  }

  const scene = new THREE.Scene();
  scene.add(new THREE.AmbientLight(0xffffff, 1.5));
  const key1 = new THREE.DirectionalLight(0xffe6c0, 2.4);
  key1.position.set(2, 3, 3);
  scene.add(key1);
  const rim = new THREE.DirectionalLight(0x9fb8ff, 1.2);
  rim.position.set(-2, 1, -2);
  scene.add(rim);

  const model = tintClone(prepareCharacter(SkeletonUtils.clone(gltf.scene)), def.tint);
  model.visible = true;
  model.traverse((n) => { if (n.isMesh) n.visible = true; });
  scene.add(model);

  // Frame the model on its own bounds and show it at a three-quarter angle,
  // tipped so a long weapon reads as a diagonal rather than a vertical line.
  const box = new THREE.Box3().setFromObject(model);
  const c = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const d = Math.max(size.x, size.y, size.z) || 1;
  model.rotation.z = Math.PI * 0.18;
  const cam = new THREE.PerspectiveCamera(38, 1, 0.05, 100);
  cam.position.set(c.x + d * 0.9, c.y + d * 0.5, c.z + d * 1.5);
  cam.lookAt(c.x, c.y, c.z);

  const prevRT = renderer.getRenderTarget();
  const prevColor = new THREE.Color();
  renderer.getClearColor(prevColor);
  const prevAlpha = renderer.getClearAlpha();
  renderer.setRenderTarget(thumbRT);
  renderer.setClearColor(0x000000, 0);
  renderer.clear();
  renderer.render(scene, cam);
  renderer.readRenderTargetPixels(thumbRT, 0, 0, THUMB_SIZE, THUMB_SIZE, thumbBuf);
  renderer.setRenderTarget(prevRT);
  renderer.setClearColor(prevColor, prevAlpha);

  // GL reads bottom-up; flip into the 2D canvas.
  const img = thumbCtx.createImageData(THUMB_SIZE, THUMB_SIZE);
  for (let y = 0; y < THUMB_SIZE; y++) {
    img.data.set(
      thumbBuf.subarray((THUMB_SIZE - 1 - y) * THUMB_SIZE * 4, (THUMB_SIZE - y) * THUMB_SIZE * 4),
      y * THUMB_SIZE * 4);
  }
  thumbCtx.putImageData(img, 0, 0);
  const url = thumbCanvas.toDataURL('image/png');
  THUMBS.set(key, url);
  return url;
}

// Warm the cache for every weapon and shield in one pass, so the armoury opens
// with art already in place instead of popping in item by item.
export async function preloadItemThumbs(renderer) {
  for (const def of [...Object.values(WEAPONS), ...Object.values(SHIELDS)]) {
    try { await itemThumb(renderer, def); } catch { /* one bad model never stops the rest */ }
  }
}

// ---------------------------------------------------------------------------
// The live knight: the half of dad's ask that has to actually move.
// ---------------------------------------------------------------------------

const SPIN = 0.45;                 // radians/sec — "slowly rotating"
const REDUCED_SPIN = 0.0;          // reduce-motion: he stands still and faces you

export class EquipPreview {
  constructor(canvas) {
    this.canvas = canvas;
    this.ok = false;
    this.model = null;
    this.mixer = null;
    this._handR = null;
    this._handL = null;
    this._plateOrig = null;
    this._spin = 0;
    try {
      this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
      this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
      this.renderer.outputColorSpace = THREE.SRGBColorSpace;
      this.ok = true;
    } catch (e) {
      // Out of WebGL contexts, or a device that will not give us a second one.
      // Not fatal: the screen falls back to a still portrait.
      console.warn('[equip] no preview context; falling back to a still', e);
      return;
    }
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(32, 1, 0.05, 100);
    this.scene.add(new THREE.AmbientLight(0xffffff, 1.35));
    const key = new THREE.DirectionalLight(0xffe0b8, 2.6);
    key.position.set(2.5, 4, 3);
    this.scene.add(key);
    const rim = new THREE.PointLight(0x9a7bff, 6, 12, 1.8);
    rim.position.set(-2.4, 2.2, -2);
    this.scene.add(rim);
    // A plinth, so he is standing somewhere rather than floating in a void.
    const plinth = new THREE.Mesh(
      new THREE.CylinderGeometry(0.62, 0.72, 0.12, 24),
      new THREE.MeshStandardMaterial({ color: 0x3a2f4a, roughness: 0.9 })
    );
    plinth.position.y = -0.06;
    this.scene.add(plinth);
    this.rig = new THREE.Group();
    this.scene.add(this.rig);
  }

  async load() {
    if (!this.ok || this.model) return;
    const [knight, general] = await Promise.all([
      loadGLB('./assets/chars/knight.glb'),
      loadGLB('./assets/anims/rig-medium-general.glb'),
    ]);
    const model = prepareCharacter(SkeletonUtils.clone(knight.scene));
    // The loader cache may hand back a knight the player's form machine has
    // hidden; the armoury's copy is always visible.
    model.visible = true;
    model.traverse((n) => { if (n.isMesh) n.visible = true; });
    model.traverse((n) => {
      if (n.name === 'handslotr') this._handR = n;
      if (n.name === 'handslotl') this._handL = n;
    });
    this.rig.add(model);
    this.model = model;
    const idle = general.animations.find((c) => c.name === 'Idle_A');
    if (idle) {
      this.mixer = new THREE.AnimationMixer(model);
      this.mixer.clipAction(idle).play();
      this.mixer.update(0.4);            // settle out of the bind pose
    }
    // Frame him head to toe once the real body exists — close enough that the
    // gear in his hands is legible, which is the entire reason he is on screen.
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    const h = size.y || 1.8;
    this.camera.position.set(0, h * 0.58, h * 1.62);
    this.camera.lookAt(0, h * 0.5, 0);
    await this.refresh();
  }

  // Put the CURRENTLY equipped gear on him. Mirrors js/player.js equipGear()
  // and equipArmour() deliberately: the same bones, the same clone-then-tint
  // rule, the same lerp for plate — if the two ever disagree, the armoury is
  // lying about what you are about to walk out wearing.
  async refresh() {
    if (!this.ok || !this.model) return;
    const w = weaponDef(), s = shieldDef();
    try {
      const [wg, sg] = await Promise.all([loadGLB(w.file), loadGLB(s.file)]);
      if (this._handR) {
        this._handR.clear();
        this._handR.add(tintClone(prepareCharacter(SkeletonUtils.clone(wg.scene)), w.tint));
      }
      if (this._handL) {
        this._handL.clear();
        this._handL.add(tintClone(prepareCharacter(SkeletonUtils.clone(sg.scene)), s.tint));
      }
    } catch (e) {
      console.warn('[equip] preview could not mount gear', e);
    }
    this._applyArmour();
  }

  _applyArmour() {
    const def = armourDef();
    if (!this._plateOrig) {
      this._plateOrig = [];
      this.model.traverse((n) => {
        if (!n.isMesh || !n.material) return;
        this._plateOrig.push({ node: n, material: n.material });
      });
    }
    for (const rec of this._plateOrig) {
      if (!def.tint) { rec.node.material = rec.material; continue; }
      const mats = Array.isArray(rec.material) ? rec.material : [rec.material];
      const cloned = mats.map((m) => {
        const c = m.clone();
        // MULTIPLY, do not replace — the same reasoning as player.equipArmour:
        // flattening plate, tabard and skin to one hex turns him into a
        // silhouette instead of the same boy in different armour.
        if (c.color) {
          const t = new THREE.Color(def.tint);
          c.color.set(rec.material.color || c.color).lerp(t, 0.72);
        }
        return c;
      });
      rec.node.material = Array.isArray(rec.material) ? cloned : cloned[0];
    }
  }

  // Called from the main loop while the armoury is open.
  render(dt) {
    if (!this.ok || !this.model) return;
    const w = this.canvas.clientWidth || 260, h = this.canvas.clientHeight || 320;
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.renderer.setSize(w, h, false);
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
    }
    const rate = state.settings && state.settings.reduceMotion ? REDUCED_SPIN : SPIN;
    this._spin += rate * dt;
    this.rig.rotation.y = this._spin;
    if (this.mixer) this.mixer.update(dt);
    this.renderer.render(this.scene, this.camera);
  }
}
