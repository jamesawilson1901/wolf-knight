// PUP TAG — the third game on the shared harness (js/minigame.js).
//
// design/DEN-MINIGAMES.md §4, Tier 2: *"pups scatter across the den using the
// existing enemy patrol behaviour with the aggression stripped out. Catch
// them all before the timer. Cheapest game in the list."*
//
// ONE CHANGE TO FIT THE HARNESS. The spec imagines Kael running the pups down,
// but a round on this harness holds the world still (js/main.js: "nothing can
// hurt a child mid-round") and every game is played by TAPPING. So a pup is
// caught by tapping IT: the pups scamper about the meadow in front of Kael,
// and a finger on one catches it — a hop, a sparkle, the pup-chime. Catch the
// whole litter and a new one tumbles in for a bonus. That is still "movement
// and prediction" (§4's skill column): a pup is running, and a child learns to
// tap where it is going rather than where it was.
//
// EVERY GAME IS WINNABLE BY MASHING (§2): the tap target is generous (70px
// round each pup, well over the 44px floor) and the pups are slow at Cub. A
// tap on empty grass costs nothing. There is no fail state and the round
// always ends on the clock.
//
// The pups are the pen's own (js/restoration.js spawnPupPen): wolf.gltf at pup
// scale, Main part only — one draw call each — in the pen's coat colours. No
// new asset, no code-built creature.

import * as THREE from 'three';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { prepareCharacter } from './assets.js';
import { audio } from './audio.js';
import { juice } from './juice.js';

const COATS = [0xb08a5a, 0xd9c8a8, 0x6e6a74, 0xc9a06a, 0x8fb0ac, 0xe0d6c4];
const TAP_PX = 70;            // a pup is caught by a tap this close, on screen
const BONUS_LITTER = 3;       // catching the whole litter

export function makePupTag(wolfGltf) {
  return {
    id: 'tag',
    icon: '🐾',
    seconds: 40,
    rewards: [],              // §6: dad's cosmetic pools; the bonus path pays meanwhile
    make(ctx) { return new PupTag(ctx, wolfGltf); },
  };
}

class PupTag {
  constructor(ctx, gltf) {
    this.ctx = ctx;
    this.gltf = gltf;
    this.group = new THREE.Group();
    this.pups = [];
    this.litters = 0;
  }

  init({ world, area, bands, camera }) {
    this.world = world;
    this.camera = camera;
    this.speed = 1.3 * bands.speed;
    this.count = bands.length < 0.9 ? 3 : bands.length > 1.2 ? 5 : 4;
    // WHERE A PUP MAY RUN: the meadow in front of Kael, measured, not assumed.
    // Every candidate a body would be pushed off (a tent, a barrel, a hut) is
    // dropped, so a pup never runs through the furniture or hides behind it.
    // ...and clear of what is DRAWN, not only what is solid: a barrel's
    // collider is smaller than the barrel, and a pup running through the edge
    // of one is exactly the "things going through each other" dad will not
    // have (2026-10-10). propFootprints is the same ruler verify-placement uses.
    const drawn = world.propFootprints ? world.propFootprints() : [];
    this.field = [];
    for (let x = area.x - 4.4; x <= area.x + 4.41; x += 0.8) {
      for (let z = area.z - 6; z <= area.z - 1.2; z += 0.8) {
        if (Math.abs(x) > (world.halfW || 12) - 1.2 || Math.abs(z) > (world.halfD || 9) - 1.2) continue;
        const s = world.resolveCircle(x, z, 0.45);
        if (Math.hypot(s.x - x, s.z - z) > 0.01) continue;
        if (world.pitAt && world.pitAt(x, z)) continue;
        if (!this._onScreen(x, z)) continue;
        if (drawn.some((q) => Math.hypot(q.x - x, q.z - z) < q.r + 0.75)) continue;
        this.field.push({ x, z });
      }
    }
    if (!this.field.length) this.field.push({ x: area.x, z: area.z - 2.5 });
    // A GOLD RING UNDER EVERY PUP STILL TO CATCH — this game's "act here"
    // colour, the same grammar as every ring in the Den — so the targets read
    // apart from the Den's own pups and wolves wandering the same grass. One
    // instanced mesh for the lot: one draw call.
    this.rings = new THREE.InstancedMesh(new THREE.RingGeometry(0.42, 0.56, 24),
      new THREE.MeshBasicMaterial({ color: 0xffd76a, transparent: true, opacity: 0.85,
        side: THREE.DoubleSide, depthWrite: false }), 5);
    this.rings.frustumCulled = false;
    this.group.add(this.rings);
    world.add(this.group);
    world.keepLoose(this.group);
    this._litter();
  }

  // ON SCREEN, CLEAR OF THE HUD. The first cut ran the pups in a fixed box
  // round the ring, and on a phone-shaped screen a third of it was past the
  // right-hand edge: pups no child could ever tap (verify-mg-tag caught one
  // at x 848 of 740). The world is held still during a round, so the camera
  // is where it will stay; anywhere it cannot see is not part of the field.
  _onScreen(x, z) {
    if (!this.camera) return true;
    this.camera.updateMatrixWorld();
    const v = new THREE.Vector3(x, 0.35, z).project(this.camera);
    const sx = (v.x + 1) / 2, sy = (1 - v.y) / 2;
    return sx > 0.1 && sx < 0.72 && sy > 0.24 && sy < 0.86;   // right edge: the action buttons
  }

  // a fresh litter, each pup at its own spot in the field
  _litter() {
    for (const p of this.pups) this._dispose(p);
    this.pups = [];
    const r = this.ctx.rand;
    for (let i = 0; i < this.count; i++) {
      const at = this.field[Math.floor(r() * this.field.length) % this.field.length];
      const model = prepareCharacter(SkeletonUtils.clone(this.gltf.scene));
      model.scale.setScalar(0.3);   // a target, not a pen pup: the 0.18 first cut was a speck on screen
      model.position.set(at.x, 0, at.z);
      model.traverse((m) => {
        if (!m.isMesh) return;
        m.castShadow = false;
        // the pen's rule: Main only, one draw call a pup (js/restoration.js)
        if (m.material.name !== 'Main') { m.visible = false; return; }
        m.material = m.material.clone();
        m.material.color.setHex(COATS[(i + this.litters) % COATS.length]);
      });
      this.group.add(model);
      const mixer = new THREE.AnimationMixer(model);
      const clip = (n) => this.gltf.animations.find((a) => a.name === n);
      const run = mixer.clipAction(clip('Gallop') || clip('Walk'));
      run.play();
      run.time = r() * 0.5;
      this.pups.push({ model, mixer, run, x: at.x, z: at.z, goal: null, caught: 0, hop: 0, id: i });
    }
    this.litters++;
  }

  _goal(p) {
    const r = this.ctx.rand;
    // a few tries for somewhere that is a real run, not a shuffle on the spot
    for (let k = 0; k < 6; k++) {
      const g = this.field[Math.floor(r() * this.field.length) % this.field.length];
      if (Math.hypot(g.x - p.x, g.z - p.z) > 1.6) return g;
    }
    return this.field[Math.floor(r() * this.field.length) % this.field.length];
  }

  start() {
    // the demo caught one for the child; the round starts on a whole litter
    if (this.pups.some((p) => p.caught)) this._litter();
    for (const p of this.pups) p.goal = this._goal(p);
  }

  // THE TAP. The harness hands over the pointer event; the nearest free pup
  // on screen within TAP_PX is caught.
  tap(e) {
    if (!e || !this.camera) return 0;
    const v = new THREE.Vector3();
    const w = window.innerWidth, h = window.innerHeight;
    let best = null, bestD = TAP_PX;
    for (const p of this.pups) {
      if (p.caught) continue;
      v.set(p.x, 0.35, p.z).project(this.camera);
      const sx = (v.x + 1) / 2 * w, sy = (1 - v.y) / 2 * h;
      const d = Math.hypot(sx - e.clientX, sy - e.clientY);
      if (d < bestD) { bestD = d; best = p; }
    }
    if (!best) return 0;
    return this._catch(best);
  }

  _catch(p) {
    p.caught = 1;
    p.hop = 0;
    juice.burst(p.x, 0.5, p.z, 0xffd76a, 10);
    audio.play('pup-chime', { volume: 0.8, rate: 1 + 0.08 * (this.pups.filter((q) => q.caught).length) });
    let pts = 1;
    if (this.pups.every((q) => q.caught)) {
      // THE WHOLE LITTER — a bigger chime, a bonus, and a new litter
      pts += BONUS_LITTER;
      this._newLitterIn = 0.9;
      audio.play('chest-open', { volume: 0.7, rate: 1.2 });
    }
    return pts;
  }

  update(dt) {
    for (const p of this.pups) {
      p.mixer.update(dt);
      if (p.caught) {
        // a happy hop on the spot, then it sits, done
        p.hop += dt;
        p.model.position.y = Math.max(0, Math.sin(Math.min(1, p.hop / 0.45) * Math.PI) * 0.55);
        p.run.timeScale = p.hop < 0.45 ? 1.4 : 0.2;
        continue;
      }
      if (!p.goal) p.goal = this._goal(p);
      const dx = p.goal.x - p.x, dz = p.goal.z - p.z, d = Math.hypot(dx, dz);
      if (d < 0.2) { p.goal = this._goal(p); continue; }
      const step = Math.min(d, this.speed * dt);
      const s = this.world.resolveCircle(p.x + dx / d * step, p.z + dz / d * step, 0.3);
      p.x = s.x; p.z = s.z;
      p.model.position.set(p.x, 0, p.z);
      p.model.rotation.y = Math.atan2(dx, dz);
      p.run.timeScale = 0.8 + this.speed * 0.4;
    }
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
    this._t = (this._t || 0) + dt;
    let n = 0;
    for (const p of this.pups) {
      if (p.caught) continue;
      const sc = 1 + 0.12 * Math.sin(this._t * 6 + p.id);
      this.rings.setMatrixAt(n++, m4.compose(new THREE.Vector3(p.x, 0.05, p.z), q, new THREE.Vector3(sc, sc, sc)));
    }
    this.rings.count = n;
    this.rings.instanceMatrix.needsUpdate = true;
    if (this._newLitterIn !== undefined) {
      this._newLitterIn -= dt;
      if (this._newLitterIn <= 0) { this._newLitterIn = undefined; this._litter(); this.start(); }
    }
    return 0;   // points come from tap(); nothing scores on its own
  }

  // §3.2's demo: the real game, running before the clock, catching one pup
  // for the child so they see what a catch looks like
  demo(dt, t, elapsed) {
    if (elapsed < 0.05 && !this.pups.some((p) => p.goal)) this.start();
    this.update(dt);
    if (elapsed > 1.6 && !this._demoCaught) {
      this._demoCaught = true;
      const p = this.pups.find((q) => !q.caught);
      if (p) this._catch(p);
    }
  }

  end() { return { score: undefined }; }

  _dispose(p) {
    p.mixer.stopAllAction();
    p.model.traverse((n) => { if (n.isMesh && n.material) n.material.dispose(); });
    if (p.model.parent) p.model.parent.remove(p.model);
  }

  // §3.4 — zero residue
  teardown() {
    for (const p of this.pups) this._dispose(p);
    if (this.rings) { this.rings.geometry.dispose(); this.rings.material.dispose(); this.rings = null; }
    this.pups = [];
    if (this.group.parent) this.group.parent.remove(this.group);
    const loose = this.world && this.world._keepLoose;
    if (loose) {
      const i = loose.indexOf(this.group);
      if (i >= 0) loose.splice(i, 1);
    }
    this.group = null;
  }
}
