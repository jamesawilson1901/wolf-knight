// ONE ATLAS, NOT TWENTY-ONE COPIES OF IT.
//
// The RG Poly Small Props Pack ships every prop as a self-contained GLB with
// the pack's shared 541KB texture atlas embedded in each one. Twenty-one props
// is twenty-one downloads of the SAME image: 13MB for 13,000 triangles. The
// geometry was never the problem — Cart_1_A is 2828 tris, right next to this
// project's own campfire.glb at 264 — the problem is that a PWA precaches
// every byte it ships, on the cheap tablets this game is built for.
//
// So: pull the atlas out once, write it beside the props, and repoint each
// GLB's images[0] at it by URI. That is exactly how the KayKit gear is already
// vendored (assets/gear/*.gltf all name weapons_bits_texture.png), so it is
// the pattern this repo already uses rather than a new one.
//
// It also fixes a rendering cost, not just a download one: twenty-one embedded
// copies are twenty-one distinct THREE.Texture objects and therefore
// twenty-one materials, so flattenStatic could never batch two props together.
// Sharing the URI means sharing the texture, one material, one draw call for a
// whole village's worth of clutter.
//
// Usage: node tools/deduct-atlas.mjs <dir> <atlas-name.png>
import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { join } from 'path';

const dir = process.argv[2];
const atlasName = process.argv[3];
if (!dir || !atlasName) { console.error('usage: deduct-atlas.mjs <dir> <atlas.png>'); process.exit(2); }

function readChunks(buf) {
  let off = 12; const out = {};
  while (off < buf.length) {
    const len = buf.readUInt32LE(off), type = buf.readUInt32LE(off + 4);
    out[type === 0x4E4F534A ? 'json' : 'bin'] = { start: off + 8, len };
    off += 8 + len;
  }
  return out;
}
function pad4(n) { return (4 - (n % 4)) % 4; }

let atlas = null, done = 0, skipped = 0, before = 0, after = 0;
for (const f of readdirSync(dir).filter((n) => n.endsWith('.glb'))) {
  const path = join(dir, f);
  const buf = readFileSync(path);
  if (buf.slice(0, 4).toString() !== 'glTF') { skipped++; continue; }
  before += buf.length;
  const c = readChunks(buf);
  const js = JSON.parse(buf.slice(c.json.start, c.json.start + c.json.len).toString());
  const imgs = js.images || [];
  if (!imgs.length || imgs[0].bufferView === undefined) { skipped++; after += buf.length; continue; }

  // lift the image bytes out (once — they are byte-identical across the pack)
  const bv = js.bufferViews[imgs[0].bufferView];
  const s = c.bin.start + (bv.byteOffset || 0);
  const png = buf.slice(s, s + bv.byteLength);
  if (!atlas) { atlas = png; writeFileSync(join(dir, atlasName), png); }

  // REBUILD THE BIN CHUNK WITHOUT THE IMAGE, and shift every bufferView that
  // sat after it. Dropping the view without re-basing the others would leave
  // every mesh reading its vertices from the wrong offset — geometry soup.
  const cut = { start: bv.byteOffset || 0, len: bv.byteLength };
  const oldBin = buf.slice(c.bin.start, c.bin.start + c.bin.len);
  const newBin = Buffer.concat([oldBin.slice(0, cut.start), oldBin.slice(cut.start + cut.len)]);
  js.bufferViews.splice(imgs[0].bufferView, 1);
  for (const v of js.bufferViews) {
    if ((v.byteOffset || 0) > cut.start) v.byteOffset = (v.byteOffset || 0) - cut.len;
  }
  // every accessor/image index above the removed view slides down by one
  for (const a of js.accessors || []) if (a.bufferView !== undefined && a.bufferView > imgs[0].bufferView) a.bufferView--;
  for (const i of js.images) if (i.bufferView !== undefined && i.bufferView > imgs[0].bufferView) i.bufferView--;
  delete imgs[0].bufferView;
  delete imgs[0].mimeType;
  imgs[0].uri = atlasName;
  js.buffers[0].byteLength = newBin.length;

  const jsonStr = JSON.stringify(js);
  const jsonBuf = Buffer.concat([Buffer.from(jsonStr), Buffer.alloc(pad4(jsonStr.length), 0x20)]);
  const binBuf = Buffer.concat([newBin, Buffer.alloc(pad4(newBin.length), 0)]);
  const header = Buffer.alloc(12);
  header.write('glTF', 0); header.writeUInt32LE(2, 4);
  header.writeUInt32LE(12 + 8 + jsonBuf.length + 8 + binBuf.length, 8);
  const jc = Buffer.alloc(8); jc.writeUInt32LE(jsonBuf.length, 0); jc.writeUInt32LE(0x4E4F534A, 4);
  const bc = Buffer.alloc(8); bc.writeUInt32LE(binBuf.length, 0); bc.writeUInt32LE(0x004E4942, 4);
  const out = Buffer.concat([header, jc, jsonBuf, bc, binBuf]);
  writeFileSync(path, out);
  after += out.length;
  done++;
}
const atlasKB = atlas ? Math.round(atlas.length / 1024) : 0;
console.log(`${done} rewritten, ${skipped} skipped`);
console.log(`before ${Math.round(before / 1024)}KB  ->  after ${Math.round(after / 1024)}KB + one ${atlasKB}KB atlas`
  + `  =  ${Math.round((after + (atlas ? atlas.length : 0)) / 1024)}KB total`);
