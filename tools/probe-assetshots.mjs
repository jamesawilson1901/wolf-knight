// LOOK AT THE MODEL BEFORE YOU BELIEVE THE NUMBERS.
//
// Triangle counts and clip names say whether a model CAN go in the game; they
// say nothing about whether it sits unremarked next to wolf.gltf, which is the
// actual house rule (CLAUDE.md). So this renders each candidate at a fixed
// three-quarter angle, on a neutral ground, normalised to the same height as
// Kael — the comparison the eye has to make — and writes a PNG per model.
import { launch } from './wk-drive.mjs';
import { mkdirSync, writeFileSync } from 'fs';

const OUT = process.env.WK_SHOT_DIR || 'asset-raw/new-2026-09-03/shots';
mkdirSync(OUT, { recursive: true });
const FILES = process.argv.slice(2);
const wk = await launch({ timescale: 1 });
await wk.newGame('SHOTS');

for (const url of FILES) {
  const name = url.split('/').slice(-2).join('_').replace(/\.(glb|gltf)$/, '');
  const ok = await wk.page.evaluate(async (u) => {
    const THREE = await import('three');
    const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
    const g = window.__game;
    if (!window.__shotScene) {
      const s = new THREE.Scene();
      s.background = new THREE.Color(0x2a2f36);
      s.add(new THREE.HemisphereLight(0xffffff, 0x445566, 2.0));
      const k = new THREE.DirectionalLight(0xfff2dd, 2.2); k.position.set(4, 8, 5); s.add(k);
      const f = new THREE.Mesh(new THREE.PlaneGeometry(20, 20),
        new THREE.MeshStandardMaterial({ color: 0x556070, roughness: 1 }));
      f.rotation.x = -Math.PI / 2; s.add(f);
      window.__shotScene = s;
      window.__shotCam = new THREE.PerspectiveCamera(35, 740 / 360, 0.1, 100);
    }
    const s = window.__shotScene;
    if (window.__shotSubject) s.remove(window.__shotSubject);
    let gl;
    try { gl = await new GLTFLoader().loadAsync('/' + u); } catch { return false; }
    const m = gl.scene;
    m.updateWorldMatrix(true, true);
    let bb = new THREE.Box3().setFromObject(m);
    const size = bb.getSize(new THREE.Vector3());
    // normalise to Kael's 1.265u so every shot is the same comparison
    const k = 1.265 / Math.max(0.001, size.y);
    const holder = new THREE.Group();
    m.scale.setScalar(k);
    m.updateWorldMatrix(true, true);
    bb = new THREE.Box3().setFromObject(m);
    m.position.set(-(bb.min.x + bb.max.x) / 2, -bb.min.y, -(bb.min.z + bb.max.z) / 2);
    holder.add(m);
    s.add(holder);
    window.__shotSubject = holder;
    if (gl.animations && gl.animations.length) {
      const mx = new THREE.AnimationMixer(m);
      mx.clipAction(gl.animations[0]).play();
      mx.update(0.4);   // off the bind pose, into the first clip
    }
    const cam = window.__shotCam;
    cam.position.set(2.2, 1.5, 2.6);
    cam.lookAt(0, 0.6, 0);
    // READ THE PIXELS IN THE SAME FRAME. The renderer runs without
    // preserveDrawingBuffer, so the drawing buffer is cleared the moment the
    // game's own loop takes its next turn — a toDataURL() from a later
    // evaluate() comes back blank white, which is a render failure that looks
    // like a model failure.
    g.renderer.render(s, cam);
    return g.renderer.domElement.toDataURL('image/png');
  }, url);
  if (!ok) { console.log('FAILED', url); continue; }
  const png = ok;
  writeFileSync(`${OUT}/${name}.png`, Buffer.from(png.split(',')[1], 'base64'));
  console.log('shot', `${OUT}/${name}.png`);
}
await wk.b.close();
