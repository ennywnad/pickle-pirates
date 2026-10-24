#!/usr/bin/env python3
"""Pickle Pirates sound pack generator.

Builds every sound procedurally (modal synthesis, filtered noise, formant voices) and encodes MP3s into assets/sfx/:
paddle pops, deck bounces, the net, dock pilings, the ball cannon, the referee parrot, the ship's bell, a harbor
ambience bed, the dockside crowd, and the shanty band's music cues. Seeded, so the output is reproducible.

    python3 tools/gen_sfx.py              # everything (needs numpy, scipy and ffmpeg)
    python3 tools/gen_sfx.py --sfx        # sound effects only
    python3 tools/gen_sfx.py --band       # music only
    python3 tools/gen_sfx.py paddle bell  # just these
"""
import os, subprocess, tempfile
import numpy as np
from scipy import signal
from scipy.io import wavfile

SR = 44100
OUT = os.path.join(os.path.dirname(__file__), '..', 'assets', 'sfx')
rng = np.random.default_rng(1977)


# ------------------------------------------------------------------ building blocks
def T(dur):
    return np.arange(int(dur * SR)) / SR

def noise(dur):
    return rng.standard_normal(int(dur * SR))

def sos(kind, f, order=2):
    if kind == 'bp':
        return signal.butter(order, [f[0] / (SR / 2), f[1] / (SR / 2)], 'bandpass', output='sos')
    return signal.butter(order, f / (SR / 2), {'lp': 'lowpass', 'hp': 'highpass'}[kind], output='sos')

def filt(x, kind, f, order=2):
    return signal.sosfilt(sos(kind, f, order), x)

def sweep_bp(x, f0, f1, q=1.2, blocks=64):
    """Band-pass with a centre frequency that glides exponentially from f0 to f1."""
    out = np.zeros_like(x); n = len(x); edges = np.linspace(0, n, blocks + 1).astype(int)
    zi = None
    for i in range(blocks):
        fc = f0 * (f1 / f0) ** (i / max(1, blocks - 1)); bw = fc / q
        s = sos('bp', (max(30, fc - bw / 2), min(SR / 2 - 100, fc + bw / 2)))
        if zi is None: zi = np.zeros((s.shape[0], 2))
        out[edges[i]:edges[i + 1]], zi = signal.sosfilt(s, x[edges[i]:edges[i + 1]], zi=zi)
    return out

def env_exp(dur, tau, attack=0.002):
    t = T(dur); e = np.exp(-t / tau)
    a = int(attack * SR)
    if a > 1: e[:a] *= np.linspace(0, 1, a)
    return e

def env_adsr(dur, a, d, s, r):
    n = int(dur * SR); e = np.zeros(n); A, D, R = int(a * SR), int(d * SR), int(r * SR)
    S = max(0, n - A - D - R)
    e[:A] = np.linspace(0, 1, A, endpoint=False)
    e[A:A + D] = np.linspace(1, s, D, endpoint=False)
    e[A + D:A + D + S] = s
    e[A + D + S:] = np.linspace(s, 0, n - (A + D + S))
    return e

def modal(dur, modes):
    """modes: (freq, decay seconds, amp). Damped sines with random phase."""
    t = T(dur); y = np.zeros_like(t)
    for f, tau, a in modes:
        y += a * np.exp(-t / tau) * np.sin(2 * np.pi * f * t + rng.uniform(0, 6.28))
    n = min(len(y), int(0.08 * SR)); y[-n:] *= np.linspace(1, 0, n) ** 2      # never cut a ringing mode off hard
    return y

def click(dur=0.006, hp=1500):
    return filt(noise(dur) * env_exp(dur, dur / 4, 0.0003), 'hp', hp)

def pad_to(x, dur):
    n = int(dur * SR)
    return np.pad(x, (0, max(0, n - len(x))))[:n]

def mix(*parts, dur=None):
    n = max(len(p) for p in parts) if dur is None else int(dur * SR)
    out = np.zeros(n)
    for p in parts: out[:min(n, len(p))] += p[:n]
    return out

def at(x, t0, dur):
    """Place x starting at t0 inside a buffer of length dur."""
    out = np.zeros(int(dur * SR)); i = int(t0 * SR); j = min(len(out), i + len(x))
    if i < len(out): out[i:j] += x[:j - i]
    return out

def sat(x, drive=1.5):
    return np.tanh(x * drive) / np.tanh(drive)

# arena reverb: decorrelated exponentially decaying noise, darker as it decays
def arena_ir(rt60=1.9, seed=0):
    r = np.random.default_rng(seed); dur = rt60 * 1.1; t = T(dur)
    base = r.standard_normal(len(t)) * np.exp(-6.9 * t / rt60)
    early = np.zeros(len(t))
    for _ in range(14):
        early[int(r.uniform(0.008, 0.07) * SR)] += r.uniform(-0.8, 0.8)
    ir = signal.sosfilt(sos('lp', 6500), base) * 0.6 + signal.sosfilt(sos('lp', 1800), base) * 0.6 + early
    ir[0] = 0
    return ir / np.sqrt(np.sum(ir ** 2))

IR_L, IR_R = arena_ir(seed=1), arena_ir(seed=2)
IR_SHORT = arena_ir(rt60=0.5, seed=3)

def verb(x, wet=0.25, stereo=False, short=False, tail=1.0):
    x = np.pad(x, (0, int(tail * SR)))
    if short:
        w = signal.fftconvolve(x, IR_SHORT)[:len(x)]
        return x * (1 - wet * 0.5) + w * wet
    l = signal.fftconvolve(x, IR_L)[:len(x)]
    if not stereo:
        return x * (1 - wet * 0.5) + l * wet
    r = signal.fftconvolve(x, IR_R)[:len(x)]
    return np.stack([x * (1 - wet * 0.5) + l * wet, x * (1 - wet * 0.5) + r * wet], 1)

def finish(x, peak_db=-1.0, fade=0.03, loop=False):
    x = np.asarray(x, dtype=np.float64)
    if loop:   # loops keep their exact length: no trim, no fade
        x = x - x.mean(axis=0); return x / (np.abs(x).max() + 1e-9) * 10 ** (peak_db / 20)
    # trim trailing near-silence
    mono = np.abs(x).max(axis=1) if x.ndim == 2 else np.abs(x)
    thr = mono.max() * 10 ** (-60 / 20); idx = np.nonzero(mono > thr)[0]
    if len(idx): x = x[:min(len(x), idx[-1] + int(0.02 * SR))]
    n = int(fade * SR)
    if n and len(x) > n:
        ramp = np.linspace(1, 0, n)
        x[-n:] = (x[-n:].T * ramp).T
    # remove DC, normalise
    x = x - x.mean(axis=0)
    return x / (np.abs(x).max() + 1e-9) * 10 ** (peak_db / 20)

def write(name, x, br='96k', loop=False):
    os.makedirs(OUT, exist_ok=True)
    x = finish(x, loop=loop)
    with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as f:
        wavfile.write(f.name, SR, (x * 32767).astype(np.int16))
        tmp = f.name
    dst = os.path.join(OUT, name + '.mp3')
    subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-i', tmp, '-codec:a', 'libmp3lame', '-b:a', br, dst], check=True)
    os.unlink(tmp)
    print(f'{name:12s} {len(x)/SR:5.2f}s  {"stereo" if x.ndim == 2 else "mono"}  {os.path.getsize(dst)//1024} KB')

j = lambda a, b: rng.uniform(a, b)



# ------------------------------------------------------------------ pickleball sounds
# A pickleball 'pock' is the hollow polymer ball ringing against a stiff composite face: a sharp click, shell modes
# around 1-2.6 kHz that die in a few hundredths of a second, and a little paddle body underneath.
def pock(f=1.0, hard=1.0, soft=0.0, d=0.22):
    shell = modal(d, [(1180 * f, 0.016 + 0.006 * soft, 1.0), (1930 * f, 0.010, 0.55 * hard), (2650 * f, 0.007, 0.35 * hard), (3700 * f, 0.004, 0.18 * hard)])
    face = modal(d, [(410 * f, 0.025, 0.2), (640 * f, 0.018, 0.16), (980 * f, 0.014, 0.12)])
    tick = click(0.003, 2200 if hard > 0.8 else 1400) * (0.9 * hard)
    x = filt(mix(tick, shell, face * (0.6 + 0.8 * soft)), 'hp', 280)
    if soft: x = filt(x, 'lp', 5200 - 2000 * soft)
    return x

def paddle_dink():      # touch shots: dinks, drops, lobs
    return verb(pock(j(0.92, 1.06), hard=0.55, soft=0.6) * 0.8, wet=0.12, short=True, tail=0.2)

def paddle_drive():     # drives and serves: a harder, brighter pop and a short swish after
    d = 0.4; x = pock(j(0.95, 1.08), hard=1.25)
    swish = sweep_bp(noise(0.12), 5200, 2400, q=1.4) * env_adsr(0.12, 0.01, 0.03, 0.5, 0.06) * 0.1
    return verb(mix(sat(x * 1.4, 1.3), at(swish, 0.01, d)), wet=0.15, short=True, tail=0.3)

def paddle_smash():     # an overhead: crack, body thump, a longer whoosh
    d = 0.6; f = j(0.94, 1.04)
    x = pock(f, hard=1.5) * 1.6
    thump = np.sin(2 * np.pi * 120 * T(0.1)) * env_exp(0.1, 0.025) * 0.5
    whoosh = sweep_bp(noise(0.25), 6000, 1800, q=1.2) * env_adsr(0.25, 0.02, 0.05, 0.6, 0.15) * 0.18
    return verb(sat(mix(x, thump, at(whoosh, 0.01, d)), 1.5), wet=0.2, tail=0.5)

def deck_bounce():      # ball on the dock planks: a hollow tock with the planks thumping under it
    d = 0.3; f = j(0.9, 1.1)
    shell = modal(d, [(950 * f, 0.013, 1.0), (1520 * f, 0.008, 0.5), (2300 * f, 0.005, 0.25)])
    plank = modal(d, [(165 * j(0.9, 1.1), 0.04, 0.35), (290 * j(0.9, 1.1), 0.03, 0.25), (520 * f, 0.02, 0.2)])
    return verb(mix(click(0.003, 900) * 0.4, shell * 0.8, plank), wet=0.14, short=True, tail=0.2)

def net_catch():        # into the mesh: a rustle, the cord thumps, the mesh sways
    d = 0.6; t = T(d)
    rustle = filt(noise(d) * env_exp(d, 0.09, 0.006), 'bp', (900, 4200)) * 0.6 * (1 + 0.3 * np.sin(2 * np.pi * 23 * t))
    thump = modal(0.3, [(110, 0.07, 0.8), (230, 0.04, 0.4)])
    tock = pock(0.85, hard=0.4, soft=0.8) * 0.4
    return verb(mix(tock, rustle, thump), wet=0.15, short=True, tail=0.25)

def tape_tick():        # clipped the cord on the way over: a tick and a little twang
    d = 0.4
    twang = modal(d, [(196, 0.12, 0.35), (392, 0.07, 0.2), (588, 0.04, 0.1)])
    return verb(mix(click(0.002, 3000) * 0.8, pock(1.05, hard=0.5, soft=0.4) * 0.5, twang), wet=0.15, short=True, tail=0.2)

def post_knock():       # a dock piling: a hollow wooden clonk
    d = 0.6; f = j(0.92, 1.08)
    wood = modal(d, [(245 * f, 0.09, 1.0), (610 * f, 0.06, 0.6), (1130 * f, 0.03, 0.35), (1900 * f, 0.015, 0.2)])
    return verb(mix(click(0.004, 1500) * 0.7, wood, pock(1.0, hard=0.6) * 0.4), wet=0.2, tail=0.4)

def cannon_feed():      # the practice ball cannon: a padded pneumatic thoomp, not a broadside
    d = 0.9; t = T(d)
    thoomp = np.sin(2 * np.pi * np.cumsum(70 * np.exp(-t / 0.12) + 42) / SR) * env_exp(d, 0.12, 0.004) * 1.2
    puff = filt(noise(0.25) * env_exp(0.25, 0.05, 0.003), 'bp', (250, 1800)) * 0.7
    rattle = filt(noise(0.12) * env_exp(0.12, 0.03), 'bp', (1500, 4000)) * 0.15
    return verb(sat(mix(thoomp, puff, at(rattle, 0.02, d)), 1.4), wet=0.25, tail=0.5)

def ship_bell():        # side out and new games: two bells, bronze partials (hum, prime, tierce, quint, nominal)
    d = 3.0
    def strike(f):
        parts = [(0.5, 1.2, 0.3), (1.0, 0.9, 1.0), (1.19, 0.6, 0.5), (1.5, 0.5, 0.35), (2.0, 0.45, 0.45), (2.52, 0.3, 0.25), (3.0, 0.2, 0.18), (4.1, 0.12, 0.1)]
        return mix(click(0.003, 2000) * 0.3, modal(2.4, [(f * r, tau, a) for r, tau, a in parts]))
    f = 880
    x = mix(at(strike(f), 0, d), at(strike(f) * 0.85, 0.32, d))
    return verb(x, wet=0.18, stereo=True, tail=0.6)

def gull(f0=None, n=None):
    """A herring gull's 'kyow': a buzzy downward glide, a few in a row."""
    f0 = f0 or j(1500, 2100); n = n or int(rng.integers(1, 4)); out = []
    for k in range(n):
        d = j(0.22, 0.38); t = T(d)
        fr = f0 * (1.1 - 0.35 * (t / d) ** 0.7) * (1 + 0.02 * np.sin(2 * np.pi * 34 * t))
        ph = 2 * np.pi * np.cumsum(fr) / SR
        y = sum(np.sin(h * ph) * (0.8 ** h) for h in range(1, 7)) * env_adsr(d, 0.02, 0.06, 0.6, 0.1)
        y = filt(y, 'bp', (900, 5000)) * (1 + 0.3 * np.sign(np.sin(2 * np.pi * 90 * t)))
        out.append(np.pad(y, (0, int(j(0.05, 0.12) * SR))))
    return np.concatenate(out)

def parrot(kind=0):
    """The referee parrot. 0: one sharp 'rraak!' (a call)  1: two quick squawks (a fault)  2: a rising whistle (a good shot)."""
    def squawk(d, f0, f1, rough=1.0):
        t = T(d); fr = f0 * (f1 / f0) ** (t / d)
        mod = np.sin(2 * np.pi * fr * 0.5 * t) * 1.8 * rough                 # sub-harmonic FM: the grit in a parrot's voice
        ph = 2 * np.pi * np.cumsum(fr) / SR + mod
        y = sum(np.sin(h * ph) / h ** 0.6 for h in range(1, 9))
        y = filt(y, 'bp', (900, 4800)) + 0.4 * filt(noise(d), 'bp', (2000, 6000)) * rough
        return y * env_adsr(d, 0.012, 0.05, 0.7, 0.06) * (1 + 0.5 * np.sign(np.sin(2 * np.pi * j(60, 90) * t)) * rough)
    if kind == 0:
        x = squawk(j(0.26, 0.34), j(1400, 1700), j(1100, 1300))
    elif kind == 1:
        x = np.concatenate([squawk(0.14, 1650, 1900), np.zeros(int(0.05 * SR)), squawk(0.2, 1800, 1300)])
    else:
        d = 0.5; t = T(d); fr = 1500 * (2.1) ** (t / d)
        x = np.sin(2 * np.pi * np.cumsum(fr) / SR) * env_adsr(d, 0.03, 0.1, 0.8, 0.12) * 0.8
        x = mix(x, at(squawk(0.12, 1700, 1500, rough=0.5) * 0.6, 0.38, 0.6))
    return verb(x, wet=0.12, short=True, tail=0.2)

def harbor_loop():
    """12 s seamless stereo bed: water lapping at the pilings, planks creaking, distant gulls, a small dockside crowd."""
    dur, xf = 12.0, 1.5; tot = dur + xf; t = T(tot)
    def lap(seed):
        r = np.random.default_rng(seed); x = filt(r.standard_normal(len(t)), 'lp', 650)
        am = filt(r.standard_normal(len(t)), 'lp', 0.7); am = np.clip(0.5 + am / (np.abs(am).max() + 1e-9), 0, None) ** 2
        slaps = np.zeros(len(t))
        for _ in range(16):
            i = int(r.uniform(0, tot - 0.5) * SR); n = int(0.35 * SR)
            slaps[i:i + n] += filt(r.standard_normal(n), 'bp', (300, 1600)) * np.exp(-np.arange(n) / (0.07 * SR)) * r.uniform(0.2, 0.6)
        return x * am * 0.9 + slaps
    L, R = lap(11), lap(12)
    creak = np.zeros(len(t))
    for _ in range(5):
        cd = j(0.5, 1.1); ct = T(cd); f = j(180, 320) * (1 + 0.25 * np.sin(2 * np.pi * j(0.8, 1.6) * ct))
        c = signal.sawtooth(2 * np.pi * np.cumsum(f) / SR) * env_adsr(cd, 0.15, 0.1, 0.7, 0.3) * (0.5 + 0.5 * np.sign(np.sin(2 * np.pi * j(25, 40) * ct)))
        creak += at(filt(c, 'bp', (300, 1500)) * 0.05, j(0, tot - cd), tot)
    gulls = np.zeros((len(t), 2))
    for _ in range(4):
        g = gull() * j(0.05, 0.1); g = filt(g, 'lp', 3500); p = j(0, 1); t0 = j(0, tot - len(g) / SR)
        gulls[:, 0] += at(g, t0, tot) * np.cos(p * np.pi / 2); gulls[:, 1] += at(g, t0, tot) * np.sin(p * np.pi / 2)
    crowd = crowd_bed(tot, voices=45, gain=0.55)
    raw = np.stack([L, R], 1) * 0.55 + crowd + gulls + creak[:, None]
    n, m = int(dur * SR), int(xf * SR)
    loop = raw[:n].copy(); fade = np.linspace(0, 1, m)[:, None]
    loop[:m] = raw[:m] * fade + raw[n:n + m] * (1 - fade)
    return loop

def arr():
    """One crew member's 'Arrr!' or 'Hey!' (formant voice with a rolled r)."""
    d = j(0.35, 0.6); f0 = j(110, 190); t = T(d)
    hey = rng.random() < 0.4
    src = signal.sawtooth(2 * np.pi * np.cumsum(f0 * (1 + 0.12 * np.exp(-t / 0.1)) * (1 + (0.04 * np.sign(np.sin(2 * np.pi * 26 * t)) if not hey else 0))) / SR)
    src = src * 0.7 + rng.standard_normal(len(t)) * 0.3
    if hey: F = [(500, 1700), (480, 1900)]
    else: F = [(720, 1150), (520, 1300)]
    k = np.clip(t / d * 1.6, 0, 1)[:, None]
    v = filt(src, 'bp', (F[0][0] * 0.8, F[0][0] * 1.2)) * (1 - k[:, 0]) + filt(src, 'bp', (F[1][0] * 0.8, F[1][0] * 1.2)) * k[:, 0]
    v += 0.6 * filt(src, 'bp', (F[0][1] * 0.85, F[1][1] * 1.15))
    return v * env_adsr(d, 0.03, 0.08, 0.7, 0.15)

def dock_cheer():       # a dockside crowd: claps, whistles and shouts of 'Arrr!'
    d = 4.0; bed = crowd_bed(d, voices=90, gain=1.1)
    t = T(d); swell = env_adsr(d, 0.15, 0.5, 0.7, 2.2)
    claps = np.zeros((len(t), 2))
    for _ in range(170):
        i = int(j(0.2, 3.2) * SR); n = 220; c = filt(rng.standard_normal(n), 'bp', (800, 3500)) * np.exp(-np.arange(n) / 40) * j(0.2, 0.6); p = j(0, 1)
        claps[i:i + n, 0] += c * np.cos(p * np.pi / 2); claps[i:i + n, 1] += c * np.sin(p * np.pi / 2)
    shouts = np.zeros((len(t), 2))
    for _ in range(9):
        s = arr() * j(0.25, 0.5); p = j(0.1, 0.9); t0 = j(0.05, 1.4)
        shouts[:, 0] += at(s, t0, d) * np.cos(p * np.pi / 2); shouts[:, 1] += at(s, t0, d) * np.sin(p * np.pi / 2)
    whistles = np.zeros(len(t))
    for _ in range(3):
        wd = j(0.4, 0.8); f = j(1800, 2800); wt = T(wd)
        whistles += at(np.sin(2 * np.pi * np.cumsum(f * (1 + 0.07 * np.sin(2 * np.pi * 2 * wt))) / SR) * env_adsr(wd, 0.05, 0.1, 0.8, 0.2) * 0.1, j(0.2, 1.8), d)
    x = (bed + claps + whistles[:, None]) * swell[:, None] + shouts
    return np.stack([verb(x[:, 0], 0.25, tail=0.8), verb(x[:, 1], 0.25, tail=0.8)], 1)

# ------------------------------------------------------------------ water
def splash():
    d = 1.4; t = T(d)
    hit = filt(noise(0.4) * env_exp(0.4, 0.09, 0.004), 'bp', (700, 5200)) * 1.4
    body = filt(noise(0.6) * env_exp(0.6, 0.18), 'lp', 900) * 0.8
    bubbles = np.zeros(len(t))
    for _ in range(34):
        t0 = j(0.04, 1.0); f = j(380, 1500); bd = j(0.02, 0.06); bt = T(bd)
        b = np.sin(2 * np.pi * np.cumsum(f * (1 + 0.9 * bt / bd)) / SR) * np.exp(-bt / (bd / 3)) * j(0.15, 0.5) * np.exp(-t0 / 0.6)
        bubbles += at(b, t0, d)
    return verb(mix(hit, body, bubbles), wet=0.28, tail=0.8)

def vent_blow():         # a steam vent: a low rumble under the deck, then a hiss of steam that dies away
    d = 1.6; t = T(d)
    rumble = filt(noise(d), 'lp', 90, 4) * env_adsr(d, 0.25, 0.3, 0.6, 0.6) * 2.2 * (1 + 0.4 * np.sin(2 * np.pi * 7 * t))
    hiss = filt(noise(d), 'bp', (2500, 9000)) * env_adsr(d, 0.45, 0.2, 0.55, 0.7) * 0.55
    hiss *= np.clip((t - 0.35) / 0.1, 0, 1)
    whoomp = filt(noise(0.5) * env_exp(0.5, 0.12, 0.01), 'lp', 400) * 0.9
    return verb(mix(rumble, hiss, at(whoomp, 0.35, d)), wet=0.18, tail=0.6)

def gull_call():        # Brine Bay: a gull swooping in on a high ball, close by
    return verb(gull(j(1700, 1900), 2) * 0.9, wet=0.2, tail=0.6)

def tentacle():         # Kraken's Reach: a tentacle bursting up through the court, wet and heavy
    d = 1.3; t = T(d)
    thud = filt(noise(0.5) * env_exp(0.5, 0.1, 0.01), 'lp', 220) * 1.6
    squelch = sweep_bp(noise(0.7), 300, 1400, q=3) * env_adsr(0.7, 0.03, 0.15, 0.5, 0.35) * 0.9
    drip = np.zeros(len(t))
    for _ in range(14):
        t0 = j(0.25, 1.1); f = j(500, 1300); bd = j(0.02, 0.05); bt = T(bd)
        drip += at(np.sin(2 * np.pi * np.cumsum(f * (1 + 1.4 * bt / bd)) / SR) * np.exp(-bt / (bd / 3)) * j(0.1, 0.3), t0, d)
    return verb(mix(thud, at(squelch, 0.04, d), drip), wet=0.22, tail=0.7)

def whoosh():           # Davy's Locker: the manta ray gliding over, a soft rushing sweep
    d = 1.1
    x = sweep_bp(noise(d), 250, 1100, q=1.5) * env_adsr(d, 0.35, 0.2, 0.6, 0.45) * 1.2
    return verb(x, wet=0.35, tail=0.8)

def anchor_drop():      # Davy's Locker: an anchor landing on the seabed, a muffled iron clank and a cloud of bubbles
    d = 1.4
    clank = filt(modal(0.6, [(310, 0.25, 1.0), (845, 0.14, 0.55), (1510, 0.08, 0.3), (2380, 0.05, 0.15)]), 'lp', 1800)
    thud = filt(noise(0.4) * env_exp(0.4, 0.09, 0.005), 'lp', 160) * 1.8
    bub = np.zeros(int(d * SR))
    for _ in range(30):
        t0 = j(0.05, 1.0); f = j(400, 1500); bd = j(0.02, 0.05); bt = T(bd)
        bub += at(np.sin(2 * np.pi * np.cumsum(f * (1 + 1.2 * bt / bd)) / SR) * np.exp(-bt / (bd / 3)) * j(0.1, 0.3), t0, d)
    return verb(mix(clank, thud, bub * 0.8, dur=d), wet=0.35, tail=0.9)

def bubbles():          # a column of bubbles rushing up out of a vent on the sea floor
    d = 1.4; t = T(d)
    out = filt(noise(d), 'lp', 300) * env_adsr(d, 0.15, 0.2, 0.5, 0.6) * 0.6
    for _ in range(60):
        t0 = j(0.0, 1.1); f = j(500, 1900); bd = j(0.015, 0.05); bt = T(bd)
        b = np.sin(2 * np.pi * np.cumsum(f * (1 + 1.2 * bt / bd)) / SR) * np.exp(-bt / (bd / 3)) * j(0.12, 0.4)
        out += at(b, t0, d)
    return verb(out, wet=0.3, tail=0.8)

# ------------------------------------------------------------------ game / UI
def bell(f, d=0.7, amp=1.0):
    return modal(d, [(f, 0.28, 1.0 * amp), (f * 2.0, 0.16, 0.45 * amp), (f * 3.01, 0.09, 0.25 * amp), (f * 4.2, 0.05, 0.12 * amp)])

def pickup():
    d = 0.9
    x = mix(*[at(bell(f, 0.6), i * 0.06, d) for i, f in enumerate((1047, 1319, 1568, 2093))])
    return verb(x, wet=0.3, stereo=True, tail=0.8)

def ko():
    d = 1.1; t = T(d)
    bonk = modal(0.3, [(420, 0.07, 1.0), (1130, 0.04, 0.6), (2050, 0.02, 0.3)])
    slide = np.sin(2 * np.pi * np.cumsum(np.geomspace(1500, 260, int(0.7 * SR)) * (1 + 0.03 * np.sin(2 * np.pi * 9 * T(0.7)))) / SR) * env_adsr(0.7, 0.02, 0.1, 0.7, 0.2) * 0.35
    return verb(mix(click(0.005, 600), bonk, at(slide, 0.08, d)), wet=0.3, tail=0.8)

def brass(f, d, amp=1.0):
    t = T(d); ph = 2 * np.pi * np.cumsum(f * (1 + 0.004 * np.sin(2 * np.pi * 5.5 * t))) / SR
    y = sum(np.sin(n * ph) / n ** 1.3 for n in range(1, 12))
    bright = env_adsr(d, 0.04, 0.08, 0.7, 0.1)
    return filt(y, 'lp', 2400) * bright * amp

def level():
    d = 1.6
    notes = [(523.3, 0.0, 0.16), (659.3, 0.12, 0.16), (784.0, 0.24, 0.16), (1046.5, 0.36, 0.7)]
    x = mix(*[at(brass(f, dd), t0, d) for f, t0, dd in notes], at(brass(659.3, 0.7, 0.6), 0.36, d), at(brass(784.0, 0.7, 0.6), 0.36, d))
    return verb(x, wet=0.35, stereo=True, tail=1.0)


# ------------------------------------------------------------------ crowd (stereo)
VOWELS = [(730, 1090), (530, 1840), (270, 2290), (570, 840), (300, 870), (660, 1720), (490, 1350)]

def voice(dur, f0=None, vowel=None, syl=None):
    t = T(dur)
    f0 = f0 or j(95, 240); F1, F2 = vowel or VOWELS[rng.integers(len(VOWELS))]
    src = signal.sawtooth(2 * np.pi * np.cumsum(f0 * (1 + 0.04 * filt(rng.standard_normal(len(t)), 'lp', 3) * 10)) / SR)
    src = src * 0.6 + rng.standard_normal(len(t)) * 0.4
    v = filt(src, 'bp', (F1 * 0.8, F1 * 1.25)) + 0.6 * filt(src, 'bp', (F2 * 0.85, F2 * 1.18))
    syl = syl or j(2.5, 5.5)
    am = np.clip(np.sin(2 * np.pi * syl * t + j(0, 6.28)) + j(-0.2, 0.5), 0, None)
    return v * am

def crowd_bed(dur, voices=70, gain=1.0):
    L = np.zeros(int(dur * SR)); R = np.zeros_like(L)
    for _ in range(voices):
        vd = j(0.6, 2.2); t0 = j(-0.5, dur); v = voice(vd) * env_adsr(vd, 0.15, 0.1, 0.8, 0.35) * j(0.05, 0.25)
        pan = j(0, 1); L += at(v, max(0, t0), dur) * np.cos(pan * np.pi / 2); R += at(v, max(0, t0), dur) * np.sin(pan * np.pi / 2)
    bed = filt(noise(dur), 'bp', (200, 2200)) * 0.12
    bed2 = filt(noise(dur), 'bp', (200, 2200)) * 0.12
    return np.stack([L + bed, R + bed2], 1) * gain

def crowd_loop():
    dur, xf = 10.0, 1.5
    raw = crowd_bed(dur + xf, voices=110)
    n, m = int(dur * SR), int(xf * SR)
    loop = raw[:n].copy(); fade = np.linspace(0, 1, m)[:, None]
    loop[:m] = raw[:m] * fade + raw[n:n + m] * (1 - fade)       # seamless loop point
    wet = np.stack([signal.fftconvolve(loop[:, 0], IR_L)[:n], signal.fftconvolve(loop[:, 1], IR_R)[:n]], 1)
    return loop * 0.6 + wet * 0.5

def cheer():
    d = 5.0; bed = crowd_bed(d, voices=180, gain=1.6)
    t = T(d); swell = env_adsr(d, 0.25, 0.6, 0.75, 2.6)
    roar = np.stack([filt(noise(d), 'bp', (300, 3000)), filt(noise(d), 'bp', (300, 3000))], 1) * 0.5
    claps = np.zeros((len(t), 2))
    for _ in range(260):
        i = int(j(0.3, 4.2) * SR); n = 220; c = filt(rng.standard_normal(n), 'bp', (800, 3500)) * np.exp(-np.arange(n) / 40) * j(0.2, 0.6); p = j(0, 1)
        claps[i:i + n, 0] += c * np.cos(p * np.pi / 2); claps[i:i + n, 1] += c * np.sin(p * np.pi / 2)
    whistles = np.zeros(len(t))
    for _ in range(5):
        wd = j(0.4, 0.9); f = j(1800, 2900); wt = T(wd)
        whistles += at(np.sin(2 * np.pi * np.cumsum(f * (1 + 0.06 * np.sin(2 * np.pi * 2 * wt))) / SR) * env_adsr(wd, 0.05, 0.1, 0.8, 0.2) * 0.12, j(0.3, 2.5), d)
    x = (bed + roar + claps + whistles[:, None]) * swell[:, None]
    return np.stack([verb(x[:, 0], 0.4, tail=1.0), verb(x[:, 1], 0.4, tail=1.0)], 1)

def aww():
    d = 3.0; t = T(d)
    L = np.zeros(len(t)); R = np.zeros(len(t))
    for _ in range(90):
        f0 = j(100, 220); vd = j(1.4, 2.4)
        v = voice(vd, f0=f0, vowel=(570, 840), syl=0.4) * env_adsr(vd, 0.25, 0.3, 0.7, 0.8) * j(0.06, 0.2)
        vt = T(vd); v = v * (1 - 0.25 * vt / vd)
        p = j(0, 1); t0 = j(0, 0.4)
        L += at(v, t0, d) * np.cos(p * np.pi / 2); R += at(v, t0, d) * np.sin(p * np.pi / 2)
    x = np.stack([L, R], 1)
    return np.stack([verb(x[:, 0], 0.45, tail=1.0), verb(x[:, 1], 0.45, tail=1.0)], 1)



# ------------------------------------------------------------------ the shanty band (the game's music)
# Squeezebox (two free reeds a few cents apart, bellows swell), fiddle (bowed saw with delayed vibrato and a wooden
# body), plucked bass, foot stomps on the deck and a tambourine, with the odd crew 'Hey!'. Every tune is original,
# in the modes shanties use (D Dorian, D major / Mixolydian). Scores are lists of (beat, length in beats, notes).
BRNG = np.random.default_rng(1720)
mtof = lambda m: 440.0 * 2 ** ((m - 69) / 12)

def harmonics(ph, n, tilt, odd=1.0):
    y = np.zeros_like(ph)
    for h in range(1, n + 1):
        y += np.sin(h * ph) * (1 / h ** tilt) * (odd if h % 2 else 1.0)
    return y

def squeeze(f, dur, vel=1.0):
    """One accordion note: two reeds (dry tuning, about +-4 cents), bright and reedy, with a bellows swell."""
    t = T(dur + 0.08); n = max(4, min(18, int(9000 / f)))
    y = np.zeros_like(t)
    for cents in (-4, 4):
        fr = f * 2 ** (cents / 1200); y += harmonics(2 * np.pi * fr * t + BRNG.uniform(0, 6.28), n, 0.85, odd=1.25)
    swell = 1 + 0.06 * np.sin(2 * np.pi * 0.9 * t + BRNG.uniform(0, 6.28))
    e = env_adsr(dur + 0.08, 0.022, 0.06, 0.85, 0.07)
    return filt(y * e * swell, 'lp', 3600) * vel

def fiddle(f, dur, vel=1.0):
    """One fiddle note: a bowed saw, vibrato that comes in after the attack, a little bow hiss, a wooden body."""
    t = T(dur + 0.1); n = max(6, min(30, int(12000 / f)))
    vib = 1 + 0.0055 * np.sin(2 * np.pi * 5.7 * t) * np.clip((t - 0.12) / 0.15, 0, 1)
    ph = 2 * np.pi * np.cumsum(f * vib) / SR
    y = harmonics(ph, n, 1.0)
    body = filt(y, 'bp', (250, 330)) * 0.9 + filt(y, 'bp', (420, 560)) * 0.8 + filt(y, 'bp', (2400, 3300)) * 0.7 + filt(y, 'lp', 1500) * 0.6
    hiss = filt(BRNG.standard_normal(len(t)), 'bp', (2500, 7000)) * 0.03
    e = env_adsr(dur + 0.1, 0.035, 0.05, 0.9, 0.09)
    return (body + hiss) * e * vel

def bass(f, dur, vel=1.0):
    """A plucked bass: harmonics that die faster the higher they are, and a thumb thump."""
    d = max(dur, 0.25) + 0.3; t = T(d); y = np.zeros_like(t)
    for h in range(1, 9):
        y += np.sin(2 * np.pi * f * h * t + BRNG.uniform(0, 6.28)) * (1 / h ** 1.1) * np.exp(-t / (0.9 / h ** 0.7))
    cut = np.ones_like(t); k = int(min(d, dur + 0.05) * SR); r = int(0.06 * SR)
    cut[k:] = 0; cut[max(0, k - r):k] = np.linspace(1, 0, k - max(0, k - r))
    thump = filt(BRNG.standard_normal(int(0.02 * SR)), 'lp', 400) * np.exp(-np.arange(int(0.02 * SR)) / 150) * 0.3
    return mix(thump, filt(y * cut, 'lp', 1400)) * vel

def stomp(vel=1.0):
    d = 0.3
    return mix(modal(d, [(72, 0.08, 1.0), (140, 0.05, 0.5), (360, 0.025, 0.35)]), filt(noise(0.05) * env_exp(0.05, 0.01), 'lp', 900) * 0.6) * vel

def tamb(vel=1.0):
    d = 0.25; t = T(d)
    jingle = sum(np.sin(2 * np.pi * f * t + BRNG.uniform(0, 6.28)) * np.exp(-t / 0.07) for f in (5800, 7300, 8900, 10400)) * 0.15
    shake = filt(noise(d) * env_exp(d, 0.05), 'hp', 6000) * 0.5
    return (jingle + shake) * vel

def hey(n=5):
    d = 0.6; out = np.zeros(int(d * SR))
    for _ in range(n):
        f0 = j(120, 210); vd = j(0.25, 0.35); t = T(vd)
        src = signal.sawtooth(2 * np.pi * np.cumsum(f0 * (1 + 0.15 * np.exp(-t / 0.05))) / SR) * 0.7 + BRNG.standard_normal(len(t)) * 0.3
        v = filt(src, 'bp', (420, 640)) + 0.7 * filt(src, 'bp', (1600, 2100))
        out += at(v * env_adsr(vd, 0.01, 0.05, 0.6, 0.12) * j(0.15, 0.3), j(0, 0.03), d)
    return out

def chord(root, kind='min', inv=0):
    iv = {'maj':[0,4,7], 'min':[0,3,7], 'dom7':[0,4,7,10], 'sus':[0,5,7], 'pow':[0,7,12]}[kind]
    n = [root + i for i in iv]
    for _ in range(inv): n = n[1:] + [n[0] + 12]
    return n

def band_render(parts, bpm, total_beats, tail=1.6, wet=0.22):
    """parts: dict of instrument -> list of (beat, length, note(s), vel). Returns stereo with a small open-air reverb."""
    spb = 60 / bpm; dur = total_beats * spb + 0.4
    L = np.zeros(int(dur * SR)); R = np.zeros_like(L)
    PAN = {'acc': 0.38, 'lh': 0.45, 'fid': 0.68, 'bass': 0.5, 'stomp': 0.5, 'tamb': 0.75, 'hey': 0.5}
    GAIN = {'acc': 0.15, 'lh': 0.07, 'fid': 0.19, 'bass': 0.5, 'stomp': 0.38, 'tamb': 0.2, 'hey': 0.9}
    for inst, events in parts.items():
        for ev in events:
            beat, length, notes = ev[0], ev[1], ev[2]; vel = ev[3] if len(ev) > 3 else 1.0
            for m in (notes if isinstance(notes, (list, tuple)) else [notes]):
                L_ = length * spb
                if inst == 'acc' or inst == 'lh': v = squeeze(mtof(m), L_ * 0.92, vel)
                elif inst == 'fid': v = fiddle(mtof(m), L_ * 0.95, vel)
                elif inst == 'bass': v = bass(mtof(m), L_ * 0.9, vel)
                elif inst == 'stomp': v = stomp(vel)
                elif inst == 'tamb': v = tamb(vel)
                else: v = hey()
                swing = 0.03 * spb if (beat * 2) % 2 == 1 else 0          # a little swing on the off-beats
                i = int((beat * spb + swing) * SR); k = min(len(L), i + len(v)); p = PAN[inst]; g = GAIN[inst]
                L[i:k] += v[:k - i] * g * np.cos(p * np.pi / 2); R[i:k] += v[:k - i] * g * np.sin(p * np.pi / 2)
    L, R = sat(L, 1.2), sat(R, 1.2)
    return np.stack([verb(L, wet, tail=tail), verb(R, wet, tail=tail)], 1)

def oompah(prog, beats_per_chord=4, start=0, vel=1.0):
    """The squeezebox left hand and the bass: root on 1, fifth on 3, chord buttons on 2 and 4."""
    lh, bs = [], []
    for k, (root, kind) in enumerate(prog):
        b0 = start + k * beats_per_chord
        for q in range(0, beats_per_chord, 2):
            note = root - 24 if (q // 2) % 2 == 0 else root - 17
            bs.append((b0 + q, 0.9, note, vel))
            lh.append((b0 + q + 1, 0.45, chord(root - 12, kind), 0.8 * vel))
    return lh, bs

def beat_kit(beats, start=0, stomps=(0, 2), tambs=(1, 3), per=4, vel=1.0):
    st, tb = [], []
    for b in range(start, start + beats, per):
        st += [(b + s, 0.2, 0, vel) for s in stomps]
        tb += [(b + s, 0.2, 0, 0.8 * vel) for s in tambs] + [(b + s + 0.5, 0.2, 0, 0.35 * vel) for s in tambs]
    return st, tb

# D Dorian / D major note names (midi): D4 62 E 64 F 65 F# 66 G 67 A 69 B 71 C5 72 C#5 73 D5 74 E 76 F 77 F# 78 G 79 A 81
def mus_loop():         # the menu loop: 16 bars of an original capstan shanty in D Dorian, AABB, loops seamlessly
    bpm, bars = 116, 16
    A = [(0,1,69),(1,1,74),(2,.5,74),(2.5,.5,74),(3,.5,72),(3.5,.5,69), (4,1.5,74),(5.5,.5,76),(6,1,77),(7,1,74),
         (8,1,72),(9,1,67),(10,.5,67),(10.5,.5,67),(11,.5,69),(11.5,.5,72), (12,1.5,72),(13.5,.5,74),(14,1,76),(15,1,72),
         (16,1,69),(17,1,74),(18,.5,74),(18.5,.5,74),(19,.5,72),(19.5,.5,69), (20,1,74),(21,1,77),(22,1,81),(23,1,77),
         (24,1,76),(25,1,72),(26,1,76),(27,1,69), (28,3,74),(31,1,72)]
    B = [(32,1,77),(33,.5,77),(33.5,.5,76),(34,1,77),(35,1,81), (36,1,79),(37,.5,76),(37.5,.5,72),(38,2,76),
         (40,1,74),(41,.5,74),(41.5,.5,76),(42,1,77),(43,1,74), (44,1,72),(45,1,69),(46,2,76),
         (48,1,77),(49,.5,77),(49.5,.5,76),(50,1,77),(51,1,81), (52,1,79),(53,.5,81),(53.5,.5,79),(54,1,76),(55,1,72),
         (56,1,74),(57,1,77),(58,1,76),(59,1,72), (60,3,74),(63,1,72)]
    prog = [(62,'min'),(62,'min'),(60,'maj'),(60,'maj'),(62,'min'),(62,'min'),(60,'maj'),(62,'min'),
            (65,'maj'),(60,'maj'),(62,'min'),(57,'min'),(65,'maj'),(60,'maj'),(62,'min'),(62,'min')]
    lh, bs = oompah(prog)
    st, tb = beat_kit(bars * 4)
    acc = [(b, l, n, 0.9) for b, l, n in A + B]
    fid = [(b, l, n + 12, 0.75) for b, l, n in B] + [(b, 4, [62 if k % 2 == 0 else 69], 0.35) for k, b in enumerate(range(0, 32, 4))]   # drone in A, melody up an octave in B
    x = band_render({'acc': acc, 'lh': lh, 'bass': bs, 'fid': fid, 'stomp': st, 'tamb': tb}, bpm, bars * 4, tail=1.6)
    n = int(bars * 4 * 60 / bpm * SR)
    loop = x[:n].copy(); tail = x[n:]
    loop[:len(tail)] += tail[:n]
    return loop

def mus_intro():        # match start: stomp-stomp, a fiddle run up the mode, the whole band on one chord, HEY
    bpm = 132
    fid = [(i * .5, .5, n, 0.9) for i, n in enumerate([62, 64, 65, 67, 69, 71, 72, 74])] + [(4, 2.5, [74, 81], 1.0), (6.5, .5, [73, 81]), (7, 3, [74, 81], 1.0)]
    acc = [(4, 2.4, chord(62, 'min') + [74], 1.0), (6.5, .45, chord(57, 'maj') + [73]), (7, 3, chord(62, 'min') + [74], 1.0)]
    bs = [(4, 2, 38), (6.5, .5, 45), (7, 3, 38)]
    st = [(0, .2, 0), (1, .2, 0), (2, .2, 0), (3, .2, 0), (4, .2, 0, 1.2), (7, .2, 0, 1.2)]
    return band_render({'fid': fid, 'acc': acc, 'bass': bs, 'stomp': st, 'tamb': [(4, .2, 0), (7, .2, 0)], 'hey': [(4, 1, 0)]}, bpm, 10, tail=1.8)

def mus_rally():        # a long rally: the band picks up, a rising sequence over the dominant, stomps doubling up
    bpm = 150
    acc = []
    for k, root in enumerate([57, 59, 61, 62]):
        for q, s in enumerate([0, 4, 7, 4]): acc.append((k * 2 + q * .5, .45, root + 12 + s, 0.9))
    acc += [(8, .45, chord(69, 'dom7')), (8.5, .45, chord(69, 'dom7')), (9, .9, chord(69, 'dom7')), (10, 2.5, chord(74, 'min') + [86], 1.0)]
    fid = [(k * .5, .5, 81 + (k % 4), 0.6) for k in range(16)] + [(10, 2.5, [86], 0.9)]
    st = [(b, .2, 0) for b in range(0, 4)] + [(4 + b * .5, .2, 0, 0.9) for b in range(12)] + [(10, .2, 0, 1.3)]
    return band_render({'acc': acc, 'fid': fid, 'bass': [(0, 4, 45), (4, 4, 45), (8, 2, 45), (10, 2.5, 38)], 'stomp': st, 'hey': [(10, 1, 0)]}, bpm, 12.5)

def mus_won():          # point won: a quick original jig in D major, 6/8 (one beat = one eighth note)
    bpm = 345
    mel = [66,69,74, 78,74,69, 67,71,74, 79,74,71, 66,69,74, 78,76,74, 76,73,69, 74]
    acc = [(i, .95, n, 0.95) for i, n in enumerate(mel[:-1])] + [(21, 6, chord(62, 'maj') + [74], 1.0)]
    fid = [(i, .95, n + 12, 0.7) for i, n in enumerate(mel[:-1])] + [(21, 6, [86, 90], 0.9)]
    prog = [62, 67, 62, 57]
    bs = [(k * 6, 2.8, r - 24) for k, r in enumerate(prog)] + [(k * 6 + 3, 2.8, r - 17) for k, r in enumerate(prog)] + [(24, 4, 38)]
    lh = [(k * 6 + s, 1.4, chord(r - 12, 'maj'), 0.8) for k, r in enumerate(prog) for s in (2, 5)]
    st = [(b, .2, 0) for b in range(0, 24, 3)] + [(21, .2, 0, 1.3)]
    return band_render({'acc': acc, 'fid': fid, 'bass': bs, 'lh': lh, 'stomp': st, 'tamb': [(b + 1.5, .2, 0, 0.7) for b in range(0, 24, 3)], 'hey': [(21, 1, 0)]}, bpm, 30)

def mus_lost():         # the other crew scored: the squeezebox sags, bellows shaking
    bpm = 100
    acc = [(0, .9, [69, 57]), (1, .9, [68, 56]), (2, .9, [67, 55]), (3, 2.6, [66, 54, 62])]
    x = band_render({'acc': acc, 'bass': [(3, 2.6, 38)], 'stomp': [(3, .2, 0, 0.6)]}, bpm, 6, tail=1.2)
    t = np.arange(len(x)) / SR; return x * (1 + 0.3 * np.sin(2 * np.pi * 6.0 * t))[:, None]

def mus_noodle(k):      # between points (three originals)
    if k == 0:   # a sea waltz in 3/4
        bpm = 150
        mel = [(0, 1, 74), (1, 1, 77), (2, 1, 76), (3, 2, 74), (5, 1, 72), (6, 1, 69), (7, 1, 72), (8, 1, 74), (9, 3, 74)]
        bs = [(b, .9, r) for b, r in [(0, 38), (3, 38), (6, 36), (9, 38)]]
        lh = [(b + s, .9, chord(r, 'min' if r % 12 == 2 else 'maj'), 0.7) for b, r in [(0, 50), (3, 50), (6, 48), (9, 50)] for s in (1, 2)]
        return band_render({'acc': [(b, l, n, 0.9) for b, l, n in mel], 'lh': lh, 'bass': bs}, bpm, 12)
    if k == 1:   # a fiddle hornpipe snippet
        bpm = 140
        mel = [74, 76, 78, 74, 79, 78, 76, 74, 73, 76, 69, 73, 74, 78, 81, 78]
        fid = [(i * .5, .5, n, 0.85) for i, n in enumerate(mel)] + [(8, 2, [74, 86], 0.9)]
        return band_render({'fid': fid, 'bass': [(0, 2, 38), (2, 2, 45), (4, 2, 38), (6, 2, 45), (8, 2, 38)], 'stomp': [(b, .2, 0) for b in range(0, 9, 2)]}, bpm, 10.5)
    bpm = 120    # heave and ho: a two-chord call and answer
    acc = [(0, 1.5, chord(62, 'min') + [74]), (1.5, .5, [72]), (2, 2, chord(60, 'maj') + [72]), (4, 1.5, chord(62, 'min') + [74]), (5.5, .5, [76]), (6, 2, chord(62, 'min') + [74])]
    return band_render({'acc': acc, 'bass': [(0, 2, 38), (2, 2, 36), (4, 2, 38), (6, 2, 38)], 'stomp': [(0, .2, 0), (2, .2, 0), (4, .2, 0), (6, .2, 0, 1.2)], 'hey': [(6, 1, 0)]}, bpm, 9)

def mus_end():          # you won the game: a fiddle trill, Dorian turns to D major for the last chord
    bpm = 120
    trill = [(i * .125, .125, 74 + (2 if i % 2 else 0), 0.8) for i in range(12)]
    fid = trill + [(1.5, .5, 78), (2, .5, 81), (2.5, .5, 83), (3, 4, [86, 90], 1.0)]
    acc = [(1.5, .5, chord(57, 'maj')), (2, .9, chord(55, 'maj')), (3, 4, chord(62, 'maj') + [74, 78], 1.0)]
    st = [(1.5, .2, 0), (2, .2, 0), (3, .2, 0, 1.3)]
    return band_render({'fid': fid, 'acc': acc, 'bass': [(2, 1, 43), (3, 4, 38)], 'stomp': st, 'tamb': [(3, .2, 0)], 'hey': [(3, 1, 0)]}, bpm, 7.5, tail=2.0)

BAND = {'mus_intro': mus_intro, 'mus_rally': mus_rally, 'mus_won': mus_won, 'mus_lost': mus_lost, 'mus_end': mus_end,
        'mus_noodle_0': lambda: mus_noodle(0), 'mus_noodle_1': lambda: mus_noodle(1), 'mus_noodle_2': lambda: mus_noodle(2)}
LOOP_BPM, LOOP_BARS = 116, 16


# ------------------------------------------------------------------ render the pack
SFX = {   # name: (builder, variants)
    'paddle': (paddle_dink, 4), 'drive': (paddle_drive, 3), 'smash': (paddle_smash, 2), 'bounce': (deck_bounce, 4),
    'net': (net_catch, 2), 'tape': (tape_tick, 1), 'post': (post_knock, 2), 'cannon': (cannon_feed, 1), 'splash': (splash, 1),
    'bell': (ship_bell, 1), 'pickup': (pickup, 1), 'level': (level, 1), 'cheer': (dock_cheer, 1), 'aww': (aww, 1),
    'vent': (vent_blow, 1), 'bubbles': (bubbles, 1), 'gull': (gull_call, 1), 'tentacle': (tentacle, 1), 'whoosh': (whoosh, 1), 'anchor': (anchor_drop, 1),
}
if __name__ == '__main__':
    import sys
    only = [a for a in sys.argv[1:] if not a.startswith('--')]
    if '--band' not in sys.argv:
        for name, (fn, n) in SFX.items():
            if only and name not in only: continue
            for i in range(n): write(f'{name}_{i}', fn(), br='112k' if name == 'cheer' else '96k')
        if not only or 'parrot' in only:
            for i in range(3): write(f'parrot_{i}', parrot(i))
        if not only or 'crowd' in only: write('crowd_0', harbor_loop(), br='80k', loop=True)
    if '--sfx' not in sys.argv and (not only or 'band' in only):
        for name, fn in BAND.items(): write(name, fn(), br='128k')
        write('mus_loop', mus_loop(), br='112k', loop=True)
