// THE LOADING KNIGHT — Kael, real model, real rig-library clips, doing a
// short show-off routine above the loading bar so a long wait reads as
// "still working" instead of "frozen" (dad's own photo of the blank splash
// screen is what asked for this). No clip in either rig library is named
// anything like "dance" — the honest options are combat and movement — so
// the routine is a little fight-and-jump performance built from the real
// ones, not an invented one.
//
// Its OWN WebGLRenderer and its OWN GLTFLoader, never assets.js's shared
// loadGLB/gltfCache. That cache hands out the SAME Texture/Material objects
// to every caller, and a Texture uploaded to one WebGL context is not
// visible in another — js/titlescene.js's own comment names the bug this
// caused for real: the knight's shared texture uploaded fine to the game's
// context and came up blank in a second one, on a real phone. A private
// loader means a private set of GPU resources, uploaded once, to the one
// context that will ever render them — a handful of files already sitting
// in the HTTP/service-worker cache reparsed, not re-fetched over the wire.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { prepareCharacter } from './assets.js';

const FILES = [
  './assets/chars/knight.glb',
  './assets/chars/sword_1handed.gltf',
  './assets/chars/shield_badge.gltf',
  './assets/anims/rig-medium-movement-basic.glb',
  './assets/anims/rig-medium-general.glb',
  './assets/anims/rig-medium-combat-melee.glb',
];

// THE ROUTINE. `fade` is the crossfade INTO this beat; `hold` is only for
// beats that loop forever (Idle has no natural end) — everything else
// plays for its own real clip length, read off the loaded AnimationClip
// once it exists, so nothing is ever cut mid-swing or frozen waiting for a
// clip that already finished.
const ROUTINE = [
  { clip: 'Idle_A', hold: 1.3, fade: 0.35 },
  { clip: 'Melee_1H_Attack_Slice_Diagonal', fade: 0.12 },
  { clip: 'Melee_1H_Attack_Stab', fade: 0.12 },
  { clip: 'Melee_2H_Attack_Spinning', fade: 0.18 },   // the whirlwind — same
  { clip: 'Jump_Full_Short', fade: 0.18 },             // clip live combat uses
  { clip: 'Idle_A', hold: 0.9, fade: 0.25 },
];

// THREE TRIES, WITH A TIMEOUT — the same resilience assets.js's own
// loadWithRetries gives every other model in the game, and not optional
// here: this preview exists FOR a slow/flaky connection, so a transient
// blip on one of its six small files (measured live: a real ERR_ABORTED
// under contention, not a hypothetical) is exactly the failure it most
// needs to survive, not fold on. A one-shot loader would silently drop
// the whole hero — no error the player sees, just an empty canvas — over
// precisely the kind of hiccup its whole job is to read as "still working"
// through.
function loadOne(loader, url, attempt = 1) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`loading-hero: timed out: ${url}`)), 15000);
    loader.load(url,
      (g) => { clearTimeout(timer); resolve(g); },
      undefined,
      (e) => { clearTimeout(timer); reject(e); });
  }).catch((e) => {
    if (attempt >= 3) throw e;
    return new Promise((r) => setTimeout(r, 300 * attempt)).then(() => loadOne(loader, url, attempt + 1));
  });
}

// Resolves once the little cast is loaded and posed; `stop()` tears down
// this context's renderer and every resource it owns — nothing here should
// outlive the loading screen it was built for.
export async function createLoadingHero(canvas) {
  const loader = new GLTFLoader();
  const [body, sword, shield, movement, general, combat] =
    await Promise.all(FILES.map((u) => loadOne(loader, u)));

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));

  const scene = new THREE.Scene();
  const cam = new THREE.PerspectiveCamera(30, 1, 0.1, 20);
  cam.position.set(1.7, 1.55, 3.1);
  cam.lookAt(0, 0.95, 0);

  scene.add(new THREE.HemisphereLight(0x9a8ab8, 0x4a3a2a, 1.7));
  const key = new THREE.DirectionalLight(0xffd2a0, 2.0);
  key.position.set(2.2, 4, 3);
  scene.add(key);

  const knight = prepareCharacter(SkeletonUtils.clone(body.scene));
  knight.visible = true; // belt-and-braces: never inherit a hidden cache state
  knight.scale.setScalar(0.95);
  scene.add(knight);

  // Same hand-bone convention player.js's equipGear() uses — the classic
  // starting sword + shield, always, regardless of what any save has
  // equipped: this is a decorative loading-screen Kael, not a save's own.
  let handR = null, handL = null;
  knight.traverse((n) => {
    if (n.name === 'handslotr') handR = n;
    if (n.name === 'handslotl') handL = n;
  });
  if (handR) handR.add(prepareCharacter(sword.scene.clone()));
  if (handL) handL.add(prepareCharacter(shield.scene.clone()));

  const animations = [...movement.animations, ...general.animations, ...combat.animations];
  const clipFor = (name) => animations.find((c) => c.name === name);
  const mixer = new THREE.AnimationMixer(knight);
  let current = null;

  const playClip = (name, fade) => {
    const clip = clipFor(name);
    if (!clip) return null;
    const action = mixer.clipAction(clip);
    action.reset();
    const looping = name.startsWith('Idle');
    action.setLoop(looping ? THREE.LoopRepeat : THREE.LoopOnce, looping ? Infinity : 1);
    action.clampWhenFinished = !looping;
    action.fadeIn(fade).play();
    if (current && current !== action) current.fadeOut(fade);
    current = action;
    return clip;
  };

  let step = -1;
  let stepT = 0;
  let stepDur = 0;
  const advance = () => {
    step = (step + 1) % ROUTINE.length;
    const beat = ROUTINE[step];
    const clip = playClip(beat.clip, beat.fade);
    // a routine clip missing from the rig (should never happen — every name
    // above came straight off the loaded files) just gets skipped forward
    // rather than freezing the loop on a beat that can never finish
    stepDur = beat.hold !== undefined ? beat.hold : (clip ? Math.max(0.2, clip.duration - 0.04) : 0);
    stepT = 0;
  };
  advance();

  let raf = null;
  const clock = new THREE.Clock();
  function frame() {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(clock.getDelta(), 0.05);
    mixer.update(dt);
    stepT += dt;
    if (stepT >= stepDur) advance();
    const w = canvas.clientWidth || 1, h = canvas.clientHeight || 1;
    if (canvas.width !== Math.round(w * renderer.getPixelRatio())
        || canvas.height !== Math.round(h * renderer.getPixelRatio())) {
      renderer.setSize(w, h, false);
      cam.aspect = w / h;
      cam.updateProjectionMatrix();
    }
    renderer.render(scene, cam);
  }
  frame();

  return {
    stop() {
      if (raf) cancelAnimationFrame(raf);
      raf = null;
      scene.traverse((n) => {
        if (n.geometry) n.geometry.dispose();
        const mats = Array.isArray(n.material) ? n.material : (n.material ? [n.material] : []);
        for (const m of mats) {
          for (const k of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap', 'aoMap']) {
            if (m[k]) m[k].dispose();
          }
          m.dispose();
        }
      });
      renderer.dispose();
    },
  };
}
