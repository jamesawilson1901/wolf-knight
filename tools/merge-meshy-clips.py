# NINE FILES, ONE ANIMAL.
#
# Meshy exports one GLB per animation, each carrying a full copy of the mesh,
# the skin and a 3.9MB texture — 106MB for nine clips of the same creature.
# All nine were checked first and share an identical node list in identical
# order, so the merge is an append with no retargeting: take one file as the
# body, and copy the other eight animations into it.
import json, struct, sys, os

def read_glb(p):
    with open(p, 'rb') as f:
        magic, ver, total = struct.unpack('<III', f.read(12))
        assert magic == 0x46546C67
        js = bin_ = None
        while f.tell() < total:
            ln, ty = struct.unpack('<II', f.read(8))
            data = f.read(ln)
            if ty == 0x4E4F534A: js = json.loads(data)
            elif ty == 0x004E4942: bin_ = bytearray(data)
        return js, bin_

def write_glb(p, js, bin_):
    jb = json.dumps(js, separators=(',', ':')).encode()
    jb += b' ' * ((4 - len(jb) % 4) % 4)
    bb = bytes(bin_) + b'\0' * ((4 - len(bin_) % 4) % 4)
    total = 12 + 8 + len(jb) + 8 + len(bb)
    with open(p, 'wb') as f:
        f.write(struct.pack('<III', 0x46546C67, 2, total))
        f.write(struct.pack('<II', len(jb), 0x4E4F534A)); f.write(jb)
        f.write(struct.pack('<II', len(bb), 0x004E4942)); f.write(bb)

def copy_accessor(src_js, src_bin, ai, dst_js, dst_bin):
    """Copy one accessor (and the bytes it reads) into the destination."""
    a = dict(src_js['accessors'][ai])
    bv = src_js['bufferViews'][a['bufferView']]
    off = bv.get('byteOffset', 0)
    chunk = bytes(src_bin[off:off + bv['byteLength']])
    while len(dst_bin) % 4: dst_bin.append(0)
    new_bv = {'buffer': 0, 'byteOffset': len(dst_bin), 'byteLength': len(chunk)}
    if 'byteStride' in bv: new_bv['byteStride'] = bv['byteStride']
    dst_bin.extend(chunk)
    dst_js['bufferViews'].append(new_bv)
    a['bufferView'] = len(dst_js['bufferViews']) - 1
    a.pop('byteOffset', None)          # the slice starts at its own view now
    if 'byteOffset' in src_js['accessors'][ai]:
        a['byteOffset'] = src_js['accessors'][ai]['byteOffset']
    dst_js['accessors'].append(a)
    return len(dst_js['accessors']) - 1

SIMP, OUT = sys.argv[1], sys.argv[2]
# The order the game reads them in; the label is what the clip is called after.
WANTED = [('Arise', 'Arise'), ('Walking', 'Walk'), ('Slow_Orc_Walk', 'Stalk'),
          ('Unsteady_Walk', 'Stagger'), ('Running', 'Run'),
          ('Triple_Combo_Attack', 'Attack'), ('Skill_03', 'Skill'),
          ('BeHit_FlyUp', 'Hurt'), ('Dead', 'Death')]

base_file, base_label = WANTED[0][0], WANTED[0][1]
js, bin_ = read_glb(os.path.join(SIMP, base_file + '.glb'))
js['animations'][0]['name'] = base_label
print(f'body from {base_file}: {len(js["nodes"])} nodes, '
      f'{len(js["skins"][0]["joints"])} joints')

base_nodes = [n.get('name') for n in js['nodes']]
for src_name, label in WANTED[1:]:
    sjs, sbin = read_glb(os.path.join(SIMP, src_name + '.glb'))
    assert [n.get('name') for n in sjs['nodes']] == base_nodes, \
        f'{src_name} has a different node list — cannot append blind'
    anim = sjs['animations'][0]
    samplers = []
    for s in anim['samplers']:
        samplers.append({
            'input': copy_accessor(sjs, sbin, s['input'], js, bin_),
            'output': copy_accessor(sjs, sbin, s['output'], js, bin_),
            'interpolation': s.get('interpolation', 'LINEAR'),
        })
    channels = [{'sampler': c['sampler'], 'target': dict(c['target'])}
                for c in anim['channels']]
    js['animations'].append({'name': label, 'samplers': samplers, 'channels': channels})
    print(f'  + {label:<9} {len(channels)} channels')

# THE MATERIAL. Two ways to finish, and the flag chooses.
#
# Either way the EMISSIVE goes. Meshy wires the same image in twice — once as
# baseColour and once as emissive with a factor of 1 — which makes the creature
# self-lit, so it ignores the room's light entirely and looks like a sticker.
# Dropping the emissive is what lets the game's own lighting land on it.
KEEP_TEXTURE = '--keep-texture' in sys.argv
for m in js.get('materials', []):
    m.pop('emissiveTexture', None)
    m.pop('emissiveFactor', None)
    m.pop('extensions', None)            # specular x2 and an ior it does not need
    pbr = m.setdefault('pbrMetallicRoughness', {})
    pbr['metallicFactor'] = 0.0
    pbr['roughnessFactor'] = 0.85
    m['doubleSided'] = False             # a closed body needs one side drawn
    if not KEEP_TEXTURE:
        pbr.pop('baseColorTexture', None)
        pbr['baseColorFactor'] = [0.72, 0.74, 0.70, 1.0]
js['buffers'] = [{'byteLength': len(bin_)}]
write_glb(OUT, js, bin_)
print(f'\n{OUT}: {os.path.getsize(OUT)/1024:.0f}KB, {len(js["animations"])} clips')
