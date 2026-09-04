#!/usr/bin/env python3
"""Put a baked image into a GLB as one material's baseColorTexture.

Written by hand for the same reason tools/merge-meshy-clips.py was: there is
no exporter in this repo and no build step to add one, and glTF's container is
simple enough that hand-editing it is safer than adding a toolchain.

PNG, not JPEG, on purpose: the bake is flat bands of solid colour and JPEG
rings at every hard edge between two of them, which would put a halo around
every band on the animal.
"""
import json, struct, sys, os

def read_glb(path):
    b = open(path, 'rb').read()
    magic, ver, total = struct.unpack_from('<III', b, 0)
    assert magic == 0x46546C67, 'not a GLB'
    off, js, bin_ = 12, None, b''
    while off < total:
        clen, ctype = struct.unpack_from('<II', b, off)
        data = b[off + 8: off + 8 + clen]
        if ctype == 0x4E4F534A: js = json.loads(data.decode('utf-8'))
        elif ctype == 0x004E4942: bin_ = data
        off += 8 + clen
    return js, bytearray(bin_)

def write_glb(path, js, bin_):
    jb = json.dumps(js, separators=(',', ':')).encode('utf-8')
    jb += b' ' * ((4 - len(jb) % 4) % 4)
    bb = bytes(bin_) + b'\x00' * ((4 - len(bin_) % 4) % 4)
    total = 12 + 8 + len(jb) + 8 + len(bb)
    with open(path, 'wb') as f:
        f.write(struct.pack('<III', 0x46546C67, 2, total))
        f.write(struct.pack('<II', len(jb), 0x4E4F534A)); f.write(jb)
        f.write(struct.pack('<II', len(bb), 0x004E4942)); f.write(bb)
    return total

def main(glb, png, mat_name, out):
    js, bin_ = read_glb(glb)
    img = open(png, 'rb').read()
    mime = 'image/png' if png.endswith('.png') else 'image/jpeg'

    pad = (4 - len(bin_) % 4) % 4          # bufferViews must start 4-aligned
    bin_ += b'\x00' * pad
    offset = len(bin_)
    bin_ += img
    js.setdefault('bufferViews', []).append({'buffer': 0, 'byteOffset': offset,
                                             'byteLength': len(img)})
    bv = len(js['bufferViews']) - 1
    js.setdefault('images', []).append({'bufferView': bv, 'mimeType': mime,
                                        'name': os.path.basename(png)})
    im = len(js['images']) - 1
    # LINEAR/LINEAR_MIPMAP_LINEAR, REPEAT — the defaults every other textured
    # body in this game ships with
    js.setdefault('samplers', []).append({'magFilter': 9729, 'minFilter': 9987,
                                          'wrapS': 10497, 'wrapT': 10497})
    sm = len(js['samplers']) - 1
    js.setdefault('textures', []).append({'sampler': sm, 'source': im})
    tx = len(js['textures']) - 1

    hit = [m for m in js['materials'] if m.get('name') == mat_name]
    assert hit, 'no material named %r — have %r' % (
        mat_name, [m.get('name') for m in js['materials']])
    for m in hit:
        p = m.setdefault('pbrMetallicRoughness', {})
        p['baseColorTexture'] = {'index': tx}
        # the factor MULTIPLIES the texture, so anything but white tints the
        # bake; this material shipped a flat 0.8 grey that would grey it out
        p['baseColorFactor'] = [1, 1, 1, 1]

    js['buffers'][0]['byteLength'] = len(bin_) + ((4 - len(bin_) % 4) % 4)
    total = write_glb(out, js, bin_)
    print('%s -> %s  (%d KB, image %d KB, material %r)'
          % (glb, out, total // 1024, len(img) // 1024, mat_name))

if __name__ == '__main__':
    main(*sys.argv[1:5])
