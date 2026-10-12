// PIP'S HIDE AND SEEK — a Tier 1 game on the shared harness (js/minigame.js).
//
// design/DEN-MINIGAMES.md §4: *"Pip hides behind existing den props. His tail
// flicks into view for one second every few seconds. Tap him to win. Costs
// almost nothing to build."*
//
// HIDDEN MEANS HIDDEN. A hiding place is chosen by casting a ray from the
// camera to where Pip would sit: only a spot the ray cannot reach without
// hitting the prop first counts. And a PEEK is a spot beside it that the ray
// does reach — so "his tail flicks into view" is a fact about the screen,
// measured, not a hope about the layout. Picked once per round, from the
// camera the harness has settled (the world is still for the whole round).
//
// Tapping where he is scores whether he is peeking or not: a child who
// remembers which bush he went behind is playing the game too, and is paid
// double for it. Mashing finds him eventually (§2); a tap on nothing costs
// nothing. The round always ends on the clock.
//
// He is Pip's own model (fox.gltf at Pip's scale), and the real Pip steps out
// of the scene for the round so there are never two of him.

import * as THREE from 'three';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { prepareCharacter } from './assets.js';
import { audio } from './audio.js';
import { juice } from './juice.js';

const TAP_PX = 70;
const PIP_SCALE = 0.22;   // js/pip.js's own

export function makeHideAndSeek(foxGltf) {
  return {
    id: 'hide',
    icon: '🦊',
    seconds: 40,
    rewards: [],
    make(ctx) { return new HideAndSeek(ctx, foxGltf); },
  };
}

class HideAndSeek {
  constructor(ctx, gltf) {
    this.ctx = ctx;
    this.gltf = gltf;
    this.group = new THREE.Group();
    this.spots = [];
    this.at = -1;
    this.t = 0;
    this.found = 0;
  }

  init({ world, area, bands, camera }) {
    this.world = world;
    this.camera = camera;
    this.peekEvery = 2.8 / bands.speed;    // Cub waits longer between peeks
    this.peekFor = 1.0;
    this.spots = this._findSpots(area);

    const model = prepareCharacter(SkeletonUtils.clone(this.gltf.scene));
    model.scale.setScalar(PIP_SCALE);
    this.model = model;
    this.group.add(model);
    this.mixer = new THREE.AnimationMixer(model);
    const clip = (n) => this.gltf.animations.find((a) => a.name === n);
    this.idle = this.mixer.clipAction(clip('Idle'));
    this.run = this.mixer.clipAction(clip('Gallop') || clip('Walk'));
    this.idle.play();
    world.add(this.group);
    world.keepLoose(this.group);

    // the real Pip steps out for the round (put back in teardown)
    const pip = typeof window !== 'undefined' && window.__game && window.__game.pip;
    this.realPip = pip && pip.root && pip.root.visible ? pip.root : null;
    if (this.realPip) this.realPip.visible = false;

    this._hideAt(0);
  }

  // EVERY PROP ON SCREEN TALL ENOUGH TO HIDE A FOX, and for each one the spot
  // behind it the camera cannot see and the spot beside it the camera can.
  _findSpots(area) {
    const w = this.world, cam = this.camera;
    cam.updateMatrixWorld();
    const ray = new THREE.Raycaster();
    const solids = w.root.children.filter((c) => c !== this.group && c.name !== 'ground'
      && c.name !== 'thresholdGlow' && !c.isLight);
    const seen = (x, z, y = 0.3) => {
      const p = new THREE.Vector3(x, y, z);
      const dir = p.clone().sub(cam.position);
      const dist = dir.length();
      ray.set(cam.position, dir.normalize());
      ray.far = dist;
      const hit = ray.intersectObjects(solids, true).find((h) => {
        const m = h.object.material;
        return !(m && m.transparent && m.opacity < 0.95) && h.object.visible;
      });
      return !hit || hit.distance > dist - 0.25;
    };
    const onScreen = (x, z) => {
      const v = new THREE.Vector3(x, 0.35, z).project(cam);
      const sx = (v.x + 1) / 2, sy = (1 - v.y) / 2;
      // clear of the HUD band, the exit (top right) and the action buttons
      // (bottom right): the right-hand side is open in its middle third
      if (sy < 0.17 || sy > 0.9 || sx < 0.06) return false;
      if (sx > 0.94) return false;
      if (sx > 0.72 && (sy > 0.55 || sy < 0.3)) return false;
      return true;
    };
    const floor = (x, z) => {
      const s = w.resolveCircle(x, z, 0.3);
      return Math.hypot(s.x - x, s.z - z) < 0.01 && !(w.pitAt && w.pitAt(x, z));
    };
    const out = [];
    const props = w.propFootprints ? w.propFootprints() : [];
    const why = (this._why = {});
    const no = (k) => { why[k] = (why[k] || 0) + 1; };
    // furniture, never the room's own walls: a fox crouched in the strip
    // inside the palisade and popping up over it is not hiding behind
    // anything a child would point at (the first look, 2026-10-12)
    const HW = w.halfW || 12, HD = w.halfD || 9;
    const shell = w.boxColliders.filter((b) => b.minX <= -HW + 0.6 || b.maxX >= HW - 0.6
      || b.minZ <= -HD + 0.6 || b.maxZ >= HD - 0.6);    // the room's own edge, not a tent's box
    const inWall = (q) => shell.some((b) => q.x > b.minX - 0.6 && q.x < b.maxX + 0.6
      && q.z > b.minZ - 0.6 && q.z < b.maxZ + 0.6);
    for (const q of props) {
      if (q.h < 0.85 || q.hx > 2.2 || q.hz > 2.2) { no('size'); continue; }
      if (inWall(q)) { no('wall'); continue; }
      if (Math.hypot(q.x - area.x, q.z - area.z) > 10) { no('far'); continue; }
      // behind it, as the camera looks — a few places round the back of it,
      // the first that is floor and out of the camera's sight
      let hide = null, sawOff = false, sawFloor = false;
      for (const [dx, dz] of [[0, 0.35], [0, 0.6], [-0.4, 0.4], [0.4, 0.4], [0, 0.9]]) {
        const hx = q.x + dx, hz = q.z - q.hz - dz;
        if (!onScreen(hx, hz)) { sawOff = true; continue; }
        if (!floor(hx, hz)) { sawFloor = true; continue; }
        if (seen(hx, hz)) continue;
        hide = { x: hx, z: hz };
        break;
      }
      if (!hide) { no(sawOff ? 'offscreen' : sawFloor ? 'floor' : 'seen'); continue; }
      // the peek: out to one side (or a step toward the camera), wherever the
      // camera can see him
      let peek = null;
      for (const side of [1, -1]) {
        for (const [d, dz] of [[q.hx + 0.45, 0], [q.hx + 0.8, 0], [q.hx + 0.45, 0.4], [q.hx + 1.1, 0.2]]) {
          const px = q.x + side * d, pz = hide.z + dz;
          if (onScreen(px, pz) && floor(px, pz) && seen(px, pz)) { peek = { x: px, z: pz }; break; }
        }
        if (peek) break;
      }
      // ...or UP: a hop that puts his head over the top of it, if the camera
      // can see him at the top of the hop
      const up = Math.min(1.6, q.h + 0.1);
      if (!peek && seen(hide.x, hide.z, up + 0.3)) peek = { x: hide.x, z: hide.z, y: up };
      if (!peek) { no('nopeek'); continue; }
      if (out.some((o) => Math.hypot(o.x - hide.x, o.z - hide.z) < 1.6)) { no('dup'); continue; }
      out.push({ x: hide.x, z: hide.z, peek });
    }
    return out;
  }

  _hideAt(i) {
    this.at = i;
    const s = this.spots[i];
    if (!s) { this.model.visible = false; return; }
    this.model.visible = true;
    this.model.position.set(s.x, 0, s.z);
    this.model.rotation.y = Math.atan2(s.peek.x - s.x, s.peek.z - s.z);   // facing the way he will peek
    this.phase = 'hidden';
    this.t = 0;
  }

  start() { this._hideAt(this.at >= 0 ? this.at : 0); }

  // where he is right now, on screen
  _screen() {
    const v = new THREE.Vector3(this.model.position.x, this.model.position.y + 0.3, this.model.position.z).project(this.camera);
    return { x: (v.x + 1) / 2 * window.innerWidth, y: (1 - v.y) / 2 * window.innerHeight };
  }

  tap(e) {
    if (!e || this.phase === 'found' || this.phase === 'dash' || !this.spots.length) return 0;
    const p = this._screen();
    if (Math.hypot(p.x - e.clientX, p.y - e.clientY) > TAP_PX) return 0;
    return this._found();
  }

  _found() {
    // seen him peek: one; remembered which prop he went behind: two
    const pts = this.phase === 'peek' ? 1 : 2;
    this.found++;
    this.phase = 'found';
    this.t = 0;
    juice.burst(this.model.position.x, 0.5, this.model.position.z, 0xffd76a, 12);
    audio.play('pup-chime', { volume: 0.85, rate: pts === 2 ? 1.25 : 1.0 });
    return pts;
  }

  update(dt) {
    this.mixer.update(dt);
    if (!this.spots.length) return 0;
    this.t += dt;
    const s = this.spots[this.at], m = this.model;
    if (this.phase === 'hidden') {
      if (this.t >= this.peekEvery) { this.phase = 'peek'; this.t = 0; audio.play('ui-click', { volume: 0.3, rate: 1.6 }); }
    } else if (this.phase === 'peek') {
      // slide out beside the prop, hold, slide back
      const k = this.t < 0.15 ? this.t / 0.15 : this.t > this.peekFor - 0.15 ? (this.peekFor - this.t) / 0.15 : 1;
      const kk = Math.max(0, Math.min(1, k));
      m.position.x = s.x + (s.peek.x - s.x) * kk;
      m.position.z = s.z + (s.peek.z - s.z) * kk;
      // up over the top is a JUMP — an arc, never a hover in mid-air
      m.position.y = s.peek.y ? s.peek.y * Math.sin(Math.min(1, this.t / this.peekFor) * Math.PI) : 0;
      if (this.t >= this.peekFor) { this.phase = 'hidden'; this.t = 0; m.position.set(s.x, 0, s.z); }
    } else if (this.phase === 'found') {
      // a happy hop where he was found
      m.position.y = Math.sin(Math.min(1, this.t / 0.5) * Math.PI) * 0.5;
      if (this.t >= 0.7) {
        m.position.y = 0;
        this.phase = 'dash';
        this.t = 0;
        this.from = { x: m.position.x, z: m.position.z };
        // the next hiding place: never the same one twice running
        const r = this.ctx.rand;
        let n = this.at;
        if (this.spots.length > 1) while (n === this.at) n = Math.floor(r() * this.spots.length) % this.spots.length;
        this.next = n;
        this.idle.stop(); this.run.play();
        audio.play('whoosh', { volume: 0.4, rate: 1.3 });
      }
    } else if (this.phase === 'dash') {
      // a quick dash — faster than a child can follow at Wolf and Alpha, and
      // a puff of dust where he vanishes, so the seek is a seek
      const to = this.spots[this.next], k = Math.min(1, this.t / 0.45);
      m.position.x = this.from.x + (to.x - this.from.x) * k;
      m.position.z = this.from.z + (to.z - this.from.z) * k;
      m.rotation.y = Math.atan2(to.x - this.from.x, to.z - this.from.z);
      if (k >= 1) {
        juice.smoke(to.x, 0.3, to.z, 0xd8cfc0);
        this.run.stop(); this.idle.play();
        this._hideAt(this.next);
      }
    }
    return 0;
  }

  demo(dt, t, elapsed) {
    this.update(dt);
    if (this.phase === 'hidden' && elapsed > 0.6 && !this._demoPeeked) { this._demoPeeked = true; this.phase = 'peek'; this.t = 0; }
    if (this.phase === 'peek' && this.t > 0.5 && !this._demoFound) { this._demoFound = true; this._found(); }
  }

  end() { return { score: undefined }; }

  teardown() {
    if (this.realPip) this.realPip.visible = true;
    this.mixer.stopAllAction();
    if (this.group.parent) this.group.parent.remove(this.group);
    const loose = this.world && this.world._keepLoose;
    if (loose) {
      const i = loose.indexOf(this.group);
      if (i >= 0) loose.splice(i, 1);
    }
    this.group = null; this.model = null;
  }
}
