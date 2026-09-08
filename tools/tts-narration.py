#!/usr/bin/env python3
"""PIP STOPS SOUNDING LIKE A ROBOT.

Dad, 2026-09-08: "I won't be recording a voice for pip so look into other
options available to you to produce a less robotic voice for her."

WHAT WAS ALREADY TRIED, so this does not repeat it. js/narration.js speaks
through the Web Speech API and its voice PICK is already careful: it prefers
network/natural engines over local ones (the local Android voices are the old
eSpeak-style ones, and preferring them was the original bug), scores names
against a list of the good modern engines, and lets a child override by ear in
Settings. That is as far as choosing a device voice can go, and dad has raised
the voice twice since.

So the voice stops being the device's problem. Every line in LINES is rendered
ONCE, here, offline, by Piper (a small local neural TTS) and shipped as an ogg
beside the music. At runtime narration.js plays the clip if it has one and
falls back to Web Speech if it does not, so:

  * nothing regresses on a device with no clip cached,
  * a line added tomorrow still speaks, in the old voice, until this is re-run,
  * and there is no model, no WASM and no inference on the child's tablet —
    just an audio file, which is the cheapest thing a browser can do.

It is also what design/VOICE-RECORDING-SCRIPT.md was always shaped for: "one
file per line id, and the wiring is already shaped for it."

THREE MODELS, FOURTEEN CHARACTERS. Piper has no pitch control, so each game
voice is a (model, speed, pitch) triple and the pitch is a resample — the same
trick js/narration.js's VOICES table already plays with Web Speech's `pitch`,
done properly and once. The speed is pre-compensated so the resample lands on
the duration the character is supposed to have.

  pip install piper-tts soundfile
  node tools/dump-lines.mjs > /tmp/lines.json      (LINES, as data)
  python3 tools/tts-narration.py /tmp/lines.json assets/audio/vo
"""
import json
import math
import sys
from pathlib import Path

import numpy as np
import soundfile as sf
from piper import PiperVoice, SynthesisConfig

MODELS = Path('asset-raw/piper')

# WHICH REAL VOICE EACH CHARACTER IS BUILT FROM, and why these three.
# LICENCES, checked before download and recorded in assets/LICENSES:
#   jenny_dioco  — commercial use permitted; attribution explicitly NOT required
#                  when distributing the generated clips, which is all this ships
#   alba         — CC BY 4.0 (Edinburgh datashare)
#   northern_english_male — CC-BY-SA 4.0 (openslr 83)
# A fourth (ryan) was downloaded and dropped: CC BY-NC-SA, and this game should
# not carry a NonCommercial term for one voice.
VOICE_FILES = {
    'jenny': 'vits-piper-en_GB-jenny_dioco-medium/en_GB-jenny_dioco-medium.onnx',
    'alba': 'vits-piper-en_GB-alba-medium/en_GB-alba-medium.onnx',
    'nem': 'vits-piper-en_GB-northern_english_male-medium/en_GB-northern_english_male-medium.onnx',
}

# The same table js/narration.js's VOICES holds, expressed against real models.
# `rate` is Piper's length_scale (BIGGER IS SLOWER — the opposite of the Web
# Speech `rate` next to it in narration.js, which is why they are not shared).
# `pitch` is the resample, as a multiplier on playback rate.
CAST = {
    'pip':    ('jenny', 0.95, 1.06),   # the companion: quick, bright, a child's friend
    'luna':   ('alba',  1.05, 1.02),   # the moon, and the voice in the dreams
    'cinder': ('nem',   1.15, 0.96),   # fire spirit, older than the Hollow
    'grimm':  ('nem',   1.15, 0.88),   # the shadow: the lowest voice in the game
    'petra':  ('alba',  1.18, 0.96),   # stone, unhurried
    'bram':   ('nem',   1.12, 0.92),   # the old prospector
    'wren':   ('jenny', 1.00, 1.00),   # the rogue who walks every road
    'rook':   ('nem',   1.05, 1.00),   # the ranger
    'sylva':  ('alba',  1.05, 1.04),   # the forest's own wolf
    'boreal': ('alba',  1.25, 0.92),   # slow, vast, wintry
    'aria':   ('jenny', 0.88, 1.10),   # quick, high, never still
    'meri':   ('alba',  1.30, 0.94),   # slow and low, like deep water
    'kael':   ('nem',   1.00, 1.04),   # he speaks once, at the end
    'tam':    ('nem',   1.10, 0.98),   # unhurried; he walks everywhere
}


def resample(x: np.ndarray, ratio: float) -> np.ndarray:
    """Play the clip `ratio` times faster — which is also `ratio` higher.

    Linear interpolation is plenty at the +-12% this table uses; anything
    stronger would want a real pitch shifter, and anything that needs one is a
    character who should have their own model instead.
    """
    if abs(ratio - 1.0) < 1e-6:
        return x
    n = int(len(x) / ratio)
    idx = np.arange(n) * ratio
    lo = np.floor(idx).astype(np.int64)
    hi = np.minimum(lo + 1, len(x) - 1)
    frac = idx - lo
    return x[lo] * (1 - frac) + x[hi] * frac


def main() -> int:
    lines_path, out_dir = sys.argv[1], Path(sys.argv[2])
    lines = json.loads(Path(lines_path).read_text(encoding='utf-8'))
    out_dir.mkdir(parents=True, exist_ok=True)

    loaded = {}
    for key, rel in VOICE_FILES.items():
        p = MODELS / rel
        if not p.exists():
            print(f'missing model: {p}', file=sys.stderr)
            return 1
        loaded[key] = PiperVoice.load(p)

    only = set(sys.argv[3].split(',')) if len(sys.argv) > 3 else None
    written = 0
    total_bytes = 0
    for line_id, line in lines.items():
        if only and line_id not in only:
            continue
        voice_key = line.get('voice') or 'pip'
        model_key, rate, pitch = CAST.get(voice_key, CAST['pip'])
        voice = loaded[model_key]
        # pre-compensate: the resample below will speed the clip up by `pitch`,
        # so ask Piper for a clip that much slower to land on the real rate
        cfg = SynthesisConfig(length_scale=rate * pitch, normalize_audio=True)
        chunks = list(voice.synthesize(line['text'], syn_config=cfg))
        if not chunks:
            print(f'  {line_id}: piper produced nothing', file=sys.stderr)
            continue
        sr = chunks[0].sample_rate
        audio = np.concatenate([
            np.frombuffer(c.audio_int16_bytes, dtype=np.int16).astype(np.float32) / 32768.0
            for c in chunks
        ])
        audio = resample(audio, pitch)
        # trim the silence Piper leaves at both ends: a caption that waits half a
        # second for a voice to start reads as a stutter to a five-year-old
        loud = np.abs(audio) > 0.006
        if loud.any():
            first, last = int(np.argmax(loud)), len(loud) - int(np.argmax(loud[::-1]))
            pad = int(sr * 0.03)
            audio = audio[max(0, first - pad):min(len(audio), last + pad)]
        peak = float(np.max(np.abs(audio))) or 1.0
        audio = audio * (0.89 / peak)          # one loudness for every character
        path = out_dir / f'{line_id}.ogg'
        sf.write(path, audio, sr, format='OGG', subtype='VORBIS')
        total_bytes += path.stat().st_size
        written += 1
        if written % 25 == 0:
            print(f'  ... {written} lines, {total_bytes / 1e6:.1f} MB', flush=True)
    secs = 0.0
    print(f'{written} clips, {total_bytes / 1e6:.2f} MB total, '
          f'{total_bytes / max(1, written) / 1e3:.1f} kB each'
          + (f', {secs:.0f}s' if secs else ''))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
