#!/usr/bin/env python3
"""THE BLOOD MOON GETS ITS OWN VOICE.

Dad: "The blood moon animation was meant to change because the current one is
too low quality. The audio for it was meant to change as well."

Until this, the whole Blood Moon ceremony -- the biggest moment a child can
make happen in the game -- sounded like one 11 KB Kenney thump
(moon-impact.ogg), played slow at the trigger and a bit less slow at the
crash. That same thump is ALSO the Dark Wolf's ordinary crescent-shot shimmer,
so the ultimate and a basic ranged attack were the same noise. The crescent
keeps it; the moon gets three sounds of its own, timed to the ceremony clock
in js/effects.js surgeCeremony (RISE 2.2s, HOLD 0.8s, DIVE 0.5s):

  moon-rise.ogg   ~3.1s  plays at the trigger. A low drone that climbs, a
                         dark minor pad swelling in, a rumble opening up and
                         a REVERSED chime that sucks upward into the moment
                         the moon arrives at the top (2.2s), marked by a soft
                         low boom. It thins out as the dive begins (3.0s).
  moon-dive.ogg   ~0.6s  plays as the moon starts to fall. A roar of air
                         whose pitch climbs as it gets closer, and a falling
                         whistle -- the cartoon "something big is coming
                         down" a five-year-old already knows.
  moon-crash.ogg  ~2.3s  plays on impact. A real explosion pitched down for
                         weight, a sub-bass drop, a front transient, a patter
                         of falling debris and a faint magic glitter tail so
                         it is a MOON landing, not a barrel going off. Built
                         with enough 100-400 Hz harmonic content that it
                         still thumps on a phone speaker, which reproduces
                         almost nothing below ~150 Hz.

Sources -- sparklinlabs/superpowers-asset-packs, CC0 1.0 (the repository's
own LICENSE.txt, already on disk as assets/LICENSES/superpowers-medieval-
fantasy.txt and stated there to cover every pack in the repo; each pack's
README defers to it):
  western-fps-2d/sounds/explosion-3.ogg   the crash's body
  western-fps-2d/sounds/impact-1.ogg      the crash's front transient
  western-fps-2d/sounds/woosh-3.ogg       the dive's air
  ninja-adventure/sounds/magic-1.ogg      the rise's reversed swell and the
                                          crash's glitter tail
Everything else (drones, pad, rumble, sub, debris, whistle, reverb) is
synthesised here with numpy. Deterministic: a fixed seed, so re-running it
produces the same files.

  pip install numpy soundfile       (libsndfile >= 1.0.29 for Vorbis)
  python3 tools/make-moon-sfx.py [/path/to/superpowers-asset-packs]
"""
import os
import sys

import numpy as np
import soundfile as sf

SP = sys.argv[1] if len(sys.argv) > 1 else '/home/user/sparklinlabs/superpowers-asset-packs'
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'assets', 'audio', 'sfx')
SR = 44100
rng = np.random.default_rng(1901)


def load(rel, rate=1.0):
    """Mono float at SR, pitched by `rate` (rate < 1 = lower and longer)."""
    d, sr = sf.read(os.path.join(SP, rel), always_2d=True)
    m = d.mean(axis=1)
    step = sr / SR * rate
    idx = np.arange(0, len(m) - 1, step)
    return np.interp(idx, np.arange(len(m)), m)


def t_axis(sec):
    return np.arange(int(sec * SR)) / SR


def place(buf, clip, at, gain=1.0):
    i = int(at * SR)
    if i < 0:
        clip, i = clip[-i:], 0
    n = min(len(clip), len(buf) - i)
    if n > 0:
        buf[i:i + n] += clip[:n] * gain


def smooth(x, a, b):
    """0..1 smoothstep of x between a and b."""
    u = np.clip((x - a) / (b - a), 0, 1)
    return u * u * (3 - 2 * u)


def onepole_lp(x, cutoff):
    """One-pole low-pass with a per-sample (array) or fixed cutoff in Hz."""
    c = np.broadcast_to(np.asarray(cutoff, dtype=float), x.shape)
    a = 1 - np.exp(-2 * np.pi * c / SR)
    y = np.empty_like(x)
    s = 0.0
    for i in range(len(x)):
        s += a[i] * (x[i] - s)
        y[i] = s
    return y


def bandpass(x, centre, q=1.4):
    """State-variable band-pass; `centre` may sweep per sample."""
    c = np.broadcast_to(np.asarray(centre, dtype=float), x.shape)
    f = 2 * np.sin(np.pi * np.minimum(c, SR / 6) / SR)
    damp = 1 / q
    lo = bp = 0.0
    y = np.empty_like(x)
    for i in range(len(x)):
        hi = x[i] - lo - damp * bp
        bp += f[i] * hi
        lo += f[i] * bp
        y[i] = bp
    return y


def brown(n):
    w = rng.standard_normal(n)
    b = np.cumsum(w)
    b -= onepole_lp(b, 8.0)  # remove the drift so it stays centred
    return b / (np.abs(b).max() + 1e-9)


def sine_sweep(t, f0, f1, curve='exp'):
    dur = t[-1] if len(t) > 1 else 1
    if curve == 'exp':
        f = f0 * (f1 / f0) ** (t / dur)
    else:
        f = f0 + (f1 - f0) * (t / dur)
    return np.sin(2 * np.pi * np.cumsum(f) / SR)


def reverb(x, tail=1.2, mix=0.25, bright=2500):
    """Convolve with a decaying-noise impulse (a big dark cave)."""
    n = int(tail * SR)
    t = np.arange(n) / SR
    ir = rng.standard_normal(n) * np.exp(-t / (tail / 5))
    ir = onepole_lp(ir, bright)
    ir /= np.sqrt((ir ** 2).sum())
    size = 1 << int(np.ceil(np.log2(len(x) + n)))
    wet = np.fft.irfft(np.fft.rfft(x, size) * np.fft.rfft(ir, size), size)[:len(x)]
    return x * (1 - mix) + wet * mix * 3


def finish(x, name, peak=0.9, fade_out=0.05):
    k = int(fade_out * SR)
    x = x.copy()
    x[-k:] *= np.linspace(1, 0, k)
    x[:64] *= np.linspace(0, 1, 64)
    x = x / (np.abs(x).max() + 1e-9) * peak
    path = os.path.join(OUT, name)
    sf.write(path, x.astype(np.float32), SR, format='OGG', subtype='VORBIS', compression_level=0.55)
    print(f'{name}: {len(x) / SR:.2f}s, {os.path.getsize(path) / 1024:.1f} KB')


# ---- moon-rise: the sky answers -------------------------------------------
def make_rise():
    dur = 3.15
    t = t_axis(dur)
    out = np.zeros_like(t)
    swell = smooth(t, 0.0, 2.2) ** 1.4
    hold = 1 - smooth(t, 2.85, 3.15)
    env = np.maximum(swell, smooth(t, 2.0, 2.2)) * hold

    # the strike: a deep gong the instant the button is pressed, so a child's
    # tap is answered NOW and the swell grows out of its ring
    tg = t_axis(2.6)
    gong = np.zeros_like(tg)
    for ratio, g, tau in ((1.0, 1.0, 1.1), (1.48, 0.6, 0.8), (1.97, 0.5, 0.6),
                          (2.53, 0.35, 0.45), (3.1, 0.25, 0.3), (4.2, 0.15, 0.2)):
        gong += g * np.sin(2 * np.pi * 110 * ratio * tg * (1 - 0.012 * tg)) * np.exp(-tg / tau)
    gong *= smooth(tg, 0, 0.004)
    gong += bandpass(rng.standard_normal(len(tg)), 900, q=0.8) * np.exp(-tg / 0.03) * 0.6
    place(out, np.tanh(1.4 * gong), 0.0, gain=0.5)

    # the drone: a low root climbing a whole tone, driven for phone-audible
    # harmonics, with a fifth and a beating octave on top
    f = 49 * (55 / 49) ** smooth(t, 0, 2.2)
    ph = 2 * np.pi * np.cumsum(f) / SR
    drone = np.sin(ph) + 0.6 * np.sin(1.5 * ph) + 0.45 * np.sin(2.006 * ph)
    drone = np.tanh(3.5 * drone)
    out += 0.4 * drone * env

    # the pad: A-minor, soft saws, slow vibrato -- ominous, not scary
    vib = 1 + 0.004 * np.sin(2 * np.pi * 4.6 * t)
    pad = np.zeros_like(t)
    for base, g in ((220.0, 1.0), (261.63, 0.8), (329.63, 0.7), (110.0, 0.9)):
        php = 2 * np.pi * np.cumsum(base * vib) / SR
        for h in range(1, 9):
            pad += g * np.sin(h * php) / h ** 1.4
    pad = onepole_lp(pad, 400 + 1400 * smooth(t, 0.3, 2.4))
    out += 0.42 * pad * (smooth(t, 0.2, 2.3) ** 1.1) * hold

    # the rumble opening up as it climbs
    rum = brown(len(t))
    rum = onepole_lp(rum, 140 + 900 * smooth(t, 0, 2.3))
    out += 0.5 * rum * (0.25 + 0.75 * swell) * hold

    # the reversed chime: sucks upward into the arrival at 2.2s
    rev = load('ninja-adventure/sounds/magic-1.ogg', rate=0.72)[::-1]
    rev = rev[-int(2.2 * SR):]
    place(out, rev * np.linspace(0.2, 1, len(rev)) ** 2, 2.2 - len(rev) / SR, gain=3.2)

    # the arrival: a soft low boom when the moon reaches the top
    tb = t_axis(0.9)
    boom = np.tanh(2.5 * sine_sweep(tb, 95, 38)) * np.exp(-tb / 0.28)
    place(out, boom, 2.18, gain=0.55)

    finish(reverb(out, tail=1.4, mix=0.3), 'moon-rise.ogg', peak=0.85, fade_out=0.08)


# ---- moon-dive: the sky falls ----------------------------------------------
def make_dive():
    dur = 0.62
    t = t_axis(dur)
    out = np.zeros_like(t)
    cres = smooth(t, 0.0, 0.5) ** 1.6 * (1 - smooth(t, 0.52, 0.62))

    air = bandpass(rng.standard_normal(len(t)), 450 * (3200 / 450) ** smooth(t, 0, 0.5), q=1.8)
    out += 0.9 * air * cres

    roar = onepole_lp(brown(len(t)), 260 + 500 * t / dur)
    out += 1.2 * roar * cres

    whistle = sine_sweep(t, 1700, 620) * smooth(t, 0.02, 0.2) * (1 - smooth(t, 0.4, 0.55))
    out += 0.16 * whistle

    place(out, load('western-fps-2d/sounds/woosh-3.ogg', rate=0.62), 0.12, gain=0.8)
    finish(reverb(out, tail=0.6, mix=0.18), 'moon-dive.ogg', peak=0.8, fade_out=0.03)


# ---- moon-crash: the moon lands --------------------------------------------
def make_crash():
    dur = 2.3
    t = t_axis(dur)
    out = np.zeros_like(t)

    body = load('western-fps-2d/sounds/explosion-3.ogg', rate=0.74)
    place(out, body, 0.0, gain=0.9)
    place(out, load('western-fps-2d/sounds/impact-1.ogg', rate=0.78), 0.0, gain=0.9)

    # sub drop, driven so a phone speaker hears its harmonics
    ts = t_axis(1.3)
    sub = np.tanh(3.0 * sine_sweep(ts, 78, 30)) * np.exp(-ts / 0.42)
    place(out, sub, 0.0, gain=0.75)

    # debris: small grains of grit and a few stone knocks raining back down
    for _ in range(70):
        at = 0.12 + rng.exponential(0.42)
        if at > 1.9:
            continue
        n = int(rng.uniform(0.008, 0.03) * SR)
        g = bandpass(rng.standard_normal(n), rng.uniform(1400, 5200), q=3) * np.hanning(n)
        place(out, g, at, gain=rng.uniform(0.05, 0.18) * np.exp(-at / 0.9))
    for _ in range(9):
        at = 0.2 + rng.exponential(0.35)
        if at > 1.6:
            continue
        tk = t_axis(0.07)
        knock = np.sin(2 * np.pi * rng.uniform(140, 260) * tk) * np.exp(-tk / 0.018)
        place(out, knock, at, gain=rng.uniform(0.08, 0.16))

    # glitter tail: it was a MOON
    glit = load('ninja-adventure/sounds/magic-1.ogg', rate=0.6)
    place(out, glit * np.exp(-np.arange(len(glit)) / SR / 0.9), 0.1, gain=0.55)

    finish(reverb(out, tail=1.5, mix=0.28, bright=1800), 'moon-crash.ogg', peak=0.95, fade_out=0.25)


if __name__ == '__main__':
    make_rise()
    make_dive()
    make_crash()
