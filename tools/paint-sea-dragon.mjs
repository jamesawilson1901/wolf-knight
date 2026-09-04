// PAINT THE SEA DRAGON FROM ITS OWN ANATOMY.
//
// Jenosuke's Sea-Dragon ships one material with a flat 0.8 grey and no image
// at all, so in game it is a white plastic snake. It DOES ship clean UVs —
// 3,178 vertices, u 0.005-0.999, v 0.001-1.002, no degenerate (0,0) pile —
// but the atlas is scattered into a dozen islands, which means a texture
// cannot sensibly be painted by hand in UV space.
//
// So it is painted in MODEL space and baked into UV space. Every vertex is
// assigned a body part by asking which bone actually drives it (the same
// measured bone map js/seaclips.js animates against, imported from there so
// the two can never disagree), and every TRIANGLE takes one flat colour from
// its part plus which way it faces. Flat per triangle, not interpolated per
// vertex: faceted bands of solid colour is the Quaternius register this game
// is built in, and a gradient would read as the wrong game.
//
// Islands are bled by stroking each triangle in its own colour as well as
// filling it, which grows every island by ~1.5px in every direction. Without
// that, bilinear sampling at an island edge pulls in the background and the
// seams show as bright hairlines — the same failure that made a 256 bake of
// the cave-biped smear where 512 was clean.
import { chromium } from 'playwright';
import { writeFileSync } from 'fs';

const OUT = process.argv[2] || 'assets/chars/monsters/sea-dragon-paint.png';
const SIZE = 512;

const b = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium', headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await b.newPage();
page.on('console', (m) => console.log('  page:', m.text()));
page.on('pageerror', (e) => console.error('  ERR', e.message));
await page.goto('http://localhost:8901/index.html', { waitUntil: 'domcontentloaded' });

const res = await page.evaluate(async (SIZE) => {
  const THREE = await import('three');
  const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
  const { SEA_DRAGON_BONES } = await import('/js/seaclips.js');
  const { SPINE, NECK, SKULL, JAW, FIN_L, FIN_R } = SEA_DRAGON_BONES;

  const gltf = await new GLTFLoader().loadAsync('/assets/chars/monsters/sea-dragon.glb');
  gltf.scene.updateMatrixWorld(true);
  let mesh = null;
  gltf.scene.traverse((o) => { if (o.isSkinnedMesh && !mesh) mesh = o; });

  // --- the frame. Confirm we are in the same model space seaclips measured
  // in (tail z -2.42, skull z +1.07, neck y 2.07) before trusting any of it.
  const bones = new Map(mesh.skeleton.bones.map((x) => [x.name, x]));
  const wp = (n) => bones.get(n).getWorldPosition(new THREE.Vector3());
  const frame = { tail: wp(SPINE[0]).toArray().map((v) => +v.toFixed(2)),
    skull: wp(SKULL).toArray().map((v) => +v.toFixed(2)),
    neck: wp(NECK).toArray().map((v) => +v.toFixed(2)) };

  // --- joint index -> part
  const idxOf = new Map(mesh.skeleton.bones.map((x, i) => [x.name, i]));
  const part = new Array(mesh.skeleton.bones.length).fill('flank');
  SPINE.forEach((n, i) => { part[idxOf.get(n)] = i < SPINE.length - 5 ? 'tail' : 'body'; });
  part[idxOf.get(NECK)] = 'neck';
  part[idxOf.get(SKULL)] = 'skull';
  part[idxOf.get(JAW)] = 'jaw';
  [...FIN_L, ...FIN_R].forEach((n, i) => { part[idxOf.get(n)] = (i % 3) === 2 ? 'finTip' : 'fin'; });

  const g = mesh.geometry;
  const pos = g.attributes.position;
  const uv = g.attributes.uv, si = g.attributes.skinIndex, sw = g.attributes.skinWeight;
  const index = g.index;
  const n = pos.count;

  // dominant joint per vertex
  const vpart = new Array(n);
  for (let i = 0; i < n; i++) {
    let best = -1, bw = -1;
    for (let k = 0; k < 4; k++) {
      const w = sw.getComponent(i, k);
      if (w > bw) { bw = w; best = si.getComponent(i, k); }
    }
    vpart[i] = part[best] || 'flank';
  }

  // REST POSITIONS, THE ONLY WAY THAT IS ACTUALLY TRUE FOR A SKINNED MESH.
  //
  // The obvious line — position x mesh.matrixWorld — is wrong here and says so
  // loudly: it puts the body's y range at [-275, 274] while the bones it is
  // skinned to live between y -0.21 and 2.27. A skinned mesh's vertices are in
  // the skin's BIND space and reach the world through the bone matrices and
  // the bind matrix, not through the node's own transform (glTF even says a
  // skinned mesh node's transform is to be ignored). applyBoneTransform is
  // three's own implementation of that chain, and at bind pose it is exactly
  // the rest pose.
  const P = [];
  const v3 = new THREE.Vector3();
  let minY = Infinity, maxY = -Infinity;
  for (let i = 0; i < n; i++) {
    mesh.applyBoneTransform(i, v3.fromBufferAttribute(pos, i));
    v3.applyMatrix4(mesh.matrixWorld);
    P.push(v3.clone());
    minY = Math.min(minY, v3.y); maxY = Math.max(maxY, v3.y);
  }

  // --- THE PALETTE. A storm-sea serpent for the Stormreach cliffs: slate
  // blues for the animal, one pale stormlight for the fins, so the flare
  // that telegraphs its lunge is the brightest thing on the body.
  // THE CAMERA IS 3/4 TOP-DOWN, SO THE TOP IS THE WHOLE PICTURE. The first
  // bake put its contrast on the belly, which is the one surface a child
  // never sees; from above it was a uniform blue-grey worm. So the value
  // range is spent along the BACK instead: a narrow stormlight ridge down a
  // deep navy animal, which reads at the size a boss is actually seen at.
  const C = {
    crest:  [0xf2, 0xe0, 0x9e],   // the lit ridge — Aria's own gold
    dorsal: [0x1d, 0x2a, 0x40],   // deep storm navy, the back
    flank:  [0x40, 0x59, 0x7e],   // the sides
    belly:  [0xcb, 0xd7, 0xe6],   // pale grey-blue underside
    tailDk: [0x15, 0x1f, 0x30],   // the coil below sits in its own shadow
    skull:  [0x2c, 0x3d, 0x5e],
    jaw:    [0x9a, 0x6f, 0x62],   // a dull clay mouth, not a red one
    fin:    [0x62, 0x7c, 0xa4],
    finTip: [0xf2, 0xe0, 0x9e],   // stormlight — the flare that tells the lunge
  };

  // --- rasterise
  const c = document.createElement('canvas');
  c.width = SIZE; c.height = SIZE;
  const ctx = c.getContext('2d');
  ctx.fillStyle = 'rgb(61,81,116)';            // ground = flank, so any gap reads as body
  ctx.fillRect(0, 0, SIZE, SIZE);
  ctx.lineJoin = 'round';

  const tri = index ? index.count / 3 : n / 3;
  const face = new THREE.Vector3();
  const e2 = new THREE.Vector3();
  const counts = {};
  for (let t = 0; t < tri; t++) {
    const a = index ? index.getX(t * 3) : t * 3;
    const bb = index ? index.getX(t * 3 + 1) : t * 3 + 1;
    const cc = index ? index.getX(t * 3 + 2) : t * 3 + 2;

    // the face's part: majority of its three corners, ties go to the first
    const ps = [vpart[a], vpart[bb], vpart[cc]];
    let p = ps[0];
    if (ps[1] === ps[2]) p = ps[1];

    // the face normal from the rest positions themselves — no normal matrix
    // to get wrong, and flat per-face is what is being painted anyway
    // (glTF winds counter-clockwise front-facing)
    face.copy(P[bb]).sub(P[a]).cross(e2.copy(P[cc]).sub(P[a])).normalize();
    const y = (P[a].y + P[bb].y + P[cc].y) / 3;
    const high = (y - minY) / Math.max(0.001, maxY - minY);

    let col, bucket;
    if (p === 'finTip') { col = C.finTip; bucket = 'finTip'; }
    else if (p === 'fin') { col = C.fin; bucket = 'fin'; }
    else if (p === 'jaw') { col = C.jaw; bucket = 'jaw'; }
    else if (face.y < -0.30) { col = C.belly; bucket = 'belly'; }
    else if (face.y > 0.62) { col = C.crest; bucket = 'crest'; }
    else if (face.y > 0.22) {
      col = p === 'skull' || p === 'neck' ? C.skull : C.dorsal;
      bucket = 'dorsal';
    } else if (p === 'tail' && high < 0.30) { col = C.tailDk; bucket = 'tailDk'; }
    else if (p === 'skull' || p === 'neck') { col = C.skull; bucket = 'skull'; }
    else { col = C.flank; bucket = 'flank'; }
    counts[bucket] = (counts[bucket] || 0) + 1;

    const s = `rgb(${col[0]},${col[1]},${col[2]})`;
    ctx.fillStyle = s; ctx.strokeStyle = s; ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(uv.getX(a) * SIZE, (1 - uv.getY(a)) * SIZE);
    ctx.lineTo(uv.getX(bb) * SIZE, (1 - uv.getY(bb)) * SIZE);
    ctx.lineTo(uv.getX(cc) * SIZE, (1 - uv.getY(cc)) * SIZE);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
  }
  return { url: c.toDataURL('image/png'), frame, tri, counts,
    yRange: [+minY.toFixed(2), +maxY.toFixed(2)] };
}, SIZE);

console.log('frame check (seaclips measured tail z -2.42, skull z 1.07, neck y 2.07):',
  JSON.stringify(res.frame));
console.log('triangles', res.tri, 'by part', JSON.stringify(res.counts), 'y', JSON.stringify(res.yRange));
const png = Buffer.from(res.url.split(',')[1], 'base64');
writeFileSync(OUT, png);
console.log('wrote', OUT, Math.round(png.length / 1024) + 'KB');
await b.close();
