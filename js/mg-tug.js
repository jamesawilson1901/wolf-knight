// PUP TUG — a Tier 3 game on the shared harness (js/minigame.js).
//
// design/DEN-MINIGAMES.md §4's RIVER TUG: *"a meter tug-of-war. Hold to pull,
// release before the rope frays. Mash-and-release rhythm, forgiving fail
// state (rope slips, reset, keep going)."*
//
// MOVED TO DRY LAND. The Den has no river and the game has no splash sound;
// it does have pups who love a rope. So the tug is with a pup: Kael holds one
// end, the pup the other, and the rope between them is the meter.
//
//   HOLD (anywhere) — Kael hauls: the pup comes toward him, and the rope's
//     STRAIN climbs: green, then amber, then red.
//   LET GO — the strain falls away fast; the pup only creeps back a little.
//   STRAIN HITS THE TOP — the rope slips: the pup scrabbles back a few steps
//     and the strain resets. Nothing is lost but ground (§2: no fail state).
//
// Pull him all the way over the line and he tumbles, delighted: +3, and +1
// more if the rope never slipped. The next pup is a little stronger. A child
// who just holds and lets go in a steady rhythm wins; a child who holds
// forever slips, laughs and goes again.
//
// The pup is the pen's own wolf.gltf (Main part only, one draw). The rope is
// a tube — a piece of rope, like Fetch's stick a piece of wood; the
// no-code-built-creatures law is about creatures.

import * as THREE from 'three';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { prepareCharacter } from './assets.js';
import { audio } from './audio.js';
import { juice } from './juice.js';

const COATS = [0xe8dcc4, 0x6e6a74, 0xc9a06a, 0x9fc0bc, 0xb08a5a];   // light first: grass and mud are mid-brown
const FAR = 3.6;          // how far out the pup starts
const NEAR = 1.0;         // pulled to here: over the line

export function makePupTug(wolfGltf) {
  return {
    id: 'tug',
    icon: '🪢',
    seconds: 45,
    rewards: [],
    make(ctx) { return new PupTug(ctx, wolfGltf); },
  };
}

class PupTug {
  constructor(ctx, gltf) {
    this.ctx = ctx;
    this.gltf = gltf;
    this.group = new THREE.Group();
    this.holding = false;
    this.strain = 0;        // 0..1
    this.pos = FAR;         // pup's distance from Kael
    this.pupN = 0;
    this.slipped = false;
    this._pending = 0;
  }

  init({ world, area, bands, player }) {
    this.world = world;
    this.bands = bands;
    this.kael = { x: area.x, z: area.z };
    // SIDE-ON, the pup to Kael's east. Out in front (north) the camera saw
    // the pup end-on — a thin tan stick on mud, the one thing the game is
    // about the hardest thing on screen to see (the first screenshot). Across
    // the screen, a pup leaning back on a rope reads at a glance.
    this.dir = { x: 1, z: 0 };
    if (player && player.root) player.root.rotation.y = Math.PI / 2;   // facing him

    // the rope: a tube redrawn each frame between his hands and the pup's jaws
    this.ropeMat = new THREE.MeshStandardMaterial({ color: 0xc9a46a, roughness: 1 });
    this.rope = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 1, 6), this.ropeMat);
    this.group.add(this.rope);
    // the line on the ground: pull him over it
    this.line = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.12),
      new THREE.MeshBasicMaterial({ color: 0xffd76a, transparent: true, opacity: 0.8, depthWrite: false }));
    this.line.rotation.x = -Math.PI / 2;
    this.line.rotation.z = Math.PI / 2;     // across the pull, at the line
    this.line.position.set(this.kael.x + NEAR, 0.04, this.kael.z);
    this.group.add(this.line);

    this._newPup();
    world.add(this.group);
    world.keepLoose(this.group);

    // the strain meter: one bar, green to amber to red, no numbers
    this.meter = document.createElement('div');
    this.meter.id = 'mgt-meter';
    this.meter.innerHTML = '<div id="mgt-fill"></div>';
    document.body.appendChild(this.meter);
    this.fill = this.meter.firstChild;

    this._up = () => { this.holding = false; };
    window.addEventListener('pointerup', this._up);
    window.addEventListener('pointercancel', this._up);
  }

  _newPup() {
    if (this.pup) { this.pup.mixer.stopAllAction(); this.group.remove(this.pup.model); }
    const model = prepareCharacter(SkeletonUtils.clone(this.gltf.scene));
    model.scale.setScalar(0.3);
    model.traverse((m) => {
      if (!m.isMesh) return;
      m.castShadow = false;
      if (m.material.name !== 'Main') { m.visible = false; return; }
      m.material = m.material.clone();
      m.material.color.setHex(COATS[this.pupN % COATS.length]);
    });
    this.group.add(model);
    const mixer = new THREE.AnimationMixer(model);
    const clip = (n) => this.gltf.animations.find((a) => a.name === n);
    const walk = mixer.clipAction(clip('Walk'));
    walk.play();
    this.pup = { model, mixer, walk };
    this.pupN++;
    this.pos = FAR;
    this.strain = 0;
    this.slipped = false;
    // each pup a little stronger: he pulls back harder while you rest
    this.back = (0.28 + 0.06 * Math.min(4, this.pupN - 1)) * this.bands.speed;
  }

  // the round starts fresh, whatever the demo did with the first pup
  start() { this._won = 0; this.holding = false; this.pupN = 0; this._newPup(); }

  // the harness's tap layer: a press starts the haul (the release is ours)
  tap() { this.holding = true; return 0; }

  update(dt) {
    const pull = 1.1 * this.bands.speed;          // how fast a haul brings him in
    const rise = 0.55 * this.bands.speed;         // strain per second while hauling
    if (this.holding) {
      this.pos = Math.max(NEAR - 0.05, this.pos - pull * dt);
      this.strain = Math.min(1, this.strain + rise * dt);
    } else {
      this.pos = Math.min(FAR, this.pos + this.back * dt);
      this.strain = Math.max(0, this.strain - 1.4 * dt);
    }
    // THE ROPE SLIPS — the forgiving fail state: back a few steps, go again
    if (this.strain >= 1) {
      this.strain = 0;
      this.slipped = true;
      this.holding = false;
      this.pos = Math.min(FAR, this.pos + 1.0);
      audio.play('puff', { volume: 0.6, rate: 0.8 });
      this.meter.classList.add('slip');
      setTimeout(() => this.meter && this.meter.classList.remove('slip'), 350);
    }
    // OVER THE LINE
    if (this.pos <= NEAR && !this._won) {
      this._won = 0.9;
      this._pending += 3 + (this.slipped ? 0 : 1);
      juice.burst(this.kael.x + NEAR, 0.6, this.kael.z, 0xffd76a, 14);
      audio.play('pup-chime', { volume: 0.9, rate: 1.1 });
      audio.play('chest-open', { volume: 0.6, rate: 1.25 });
      this.holding = false;
    }
    if (this._won) {
      this._won -= dt;
      this.pup.model.position.y = Math.max(0, Math.sin((0.9 - this._won) / 0.9 * Math.PI * 2) * 0.4);
      if (this._won <= 0) { this._won = 0; this._newPup(); }
    }

    // the pup, the rope, the meter
    const px = this.kael.x + this.dir.x * this.pos, pz = this.kael.z + this.dir.z * this.pos;
    const m = this.pup.model;
    m.position.x = px; m.position.z = pz;
    m.rotation.y = -Math.PI / 2;                    // facing Kael (west)
    m.rotation.z = this.holding ? -0.18 : -0.08;    // leaning back on the rope
    this.pup.walk.timeScale = this.holding ? -1.2 : 0.7;   // dragged: feet scrabbling backwards
    this.pup.mixer.update(dt);
    const hx = this.kael.x + 0.35, hz = this.kael.z, hy = 0.75;
    const jx = px - 0.3, jz = pz, jy = 0.35;
    const len = Math.hypot(jx - hx, jy - hy, jz - hz);
    this.rope.position.set((hx + jx) / 2, (hy + jy) / 2 - (this.holding ? 0 : 0.08), (hz + jz) / 2);
    this.rope.scale.set(1, len, 1);
    this.rope.lookAt(jx, jy, jz);
    this.rope.rotateX(Math.PI / 2);
    const s = this.strain;
    this.fill.style.width = `${Math.round(s * 100)}%`;
    this.fill.style.background = s < 0.55 ? '#7ccf6a' : s < 0.82 ? '#ffc44a' : '#ff6a4a';
    this.ropeMat.color.setHex(s < 0.82 ? 0xc9a46a : 0xd8785a);   // red-hot when about to go

    const got = this._pending;
    this._pending = 0;
    return got;
  }

  // §3.2's demo: a haul, a rest, a haul — the rhythm, shown once
  demo(dt, t, elapsed) {
    this.holding = (elapsed % 1.6) < 1.0;
    this.update(dt);
    this._pending = 0;
  }

  end() { return { score: undefined }; }

  teardown() {
    window.removeEventListener('pointerup', this._up);
    window.removeEventListener('pointercancel', this._up);
    if (this.meter) { this.meter.remove(); this.meter = null; }
    if (this.pup) this.pup.mixer.stopAllAction();
    this.rope.geometry.dispose(); this.ropeMat.dispose();
    this.line.geometry.dispose(); this.line.material.dispose();
    this.group.traverse((n) => { if (n.isMesh && n.material && n.material !== this.ropeMat && n.material !== this.line.material) n.material.dispose(); });
    if (this.group.parent) this.group.parent.remove(this.group);
    const loose = this.world && this.world._keepLoose;
    if (loose) {
      const i = loose.indexOf(this.group);
      if (i >= 0) loose.splice(i, 1);
    }
    this.group = null;
  }
}
