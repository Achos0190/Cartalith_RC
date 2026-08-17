#!/usr/bin/env python3
"""Generate assets/sample_pack.zip — a reference CC0 asset pack for the elevation foundation's
in-app importer (docs/ASSET_PACK_FORMAT.md). Stdlib only; deterministic.

Emits 7 tileable 256px ground textures + 21 alpha icon sprites (v1.20: 10 icon slots — mountain,
hill, and 8 vegetation/scatter kinds — each with 2-3 deterministic variants) + pack.json + pack.csv
+ CREDITS.md, zipped with ZIP_STORED so the app's `unzipStore` (and the headless test suite) read
it without inflate.

Run:  python3 assets/make_sample_pack.py
"""
import struct, zlib, zipfile, math, os

# ----------------------------------------------------------------------------- PNG encoder
def png_encode(w, h, rgba):
    """rgba: bytes/bytearray length w*h*4 (RGBA8). Returns PNG bytes."""
    def chunk(tag, data):
        return (struct.pack('>I', len(data)) + tag + data +
                struct.pack('>I', zlib.crc32(tag + data) & 0xffffffff))
    raw = bytearray()
    for y in range(h):
        raw.append(0)                                  # filter type 0 (None)
        raw += rgba[y*w*4:(y+1)*w*4]
    sig = b'\x89PNG\r\n\x1a\n'
    ihdr = struct.pack('>IIBBBBB', w, h, 8, 6, 0, 0, 0)   # 8-bit, RGBA
    idat = zlib.compress(bytes(raw), 9)
    return sig + chunk(b'IHDR', ihdr) + chunk(b'IDAT', idat) + chunk(b'IEND', b'')

# ----------------------------------------------------------------------------- tileable value noise
def _hash(ix, iy, s):
    h = (ix * 374761393 + iy * 668265263 + s * 362437) & 0xffffffff
    h = ((h ^ (h >> 13)) * 1274126177) & 0xffffffff
    return ((h ^ (h >> 16)) & 0xffffffff) / 0xffffffff

def _smooth(t):
    return t * t * (3 - 2 * t)

def vnoise(x, y, s, period):
    """Value noise on a lattice wrapped at `period` → exactly tileable over `period`."""
    x0, y0 = math.floor(x), math.floor(y)
    fx, fy = x - x0, y - y0
    def lat(ix, iy):
        return _hash(ix % period, iy % period, s)
    a = lat(x0, y0);   b = lat(x0+1, y0)
    c = lat(x0, y0+1); d = lat(x0+1, y0+1)
    u, v = _smooth(fx), _smooth(fy)
    return (a*(1-u)+b*u)*(1-v) + (c*(1-u)+d*u)*v

def fbm(x, y, s, period, octaves=4):
    """Tileable fbm: period doubles per octave to stay lattice-aligned."""
    total, amp, norm, p = 0.0, 1.0, 0.0, period
    for o in range(octaves):
        total += amp * vnoise(x*(p/period), y*(p/period), s+o*17, p)
        norm += amp; amp *= 0.5; p *= 2
    return total / norm

def clampi(v):
    return 0 if v < 0 else (255 if v > 255 else int(v))

def make_texture(slot, size=256):
    """One 256px tileable RGBA ground texture per material slot."""
    out = bytearray(size*size*4)
    base = {
        'grass':     (88, 116, 64),
        'rock':      (140, 134, 124),
        'sand':      (210, 184, 130),
        'snow':      (236, 240, 244),
        'wetland':   (74, 86, 60),
        'canopy':    (46, 78, 48),
        'parchment': (228, 214, 184),
    }[slot]
    P = 16            # base lattice period (cells across the 256px tile)
    for y in range(size):
        for x in range(size):
            fx, fy = x / size * P, y / size * P
            n = fbm(fx, fy, 7, P)
            if slot == 'rock':
                n = 1 - abs(2*n - 1)                # ridged → cracked rock
                amp = 70
            elif slot == 'snow':
                amp = 18
            elif slot == 'sand':
                amp = 26
            elif slot == 'parchment':
                amp = 22
            elif slot == 'canopy':
                n = (n - 0.5)
                amp = 60
            elif slot == 'wetland':
                amp = 44
            else:                                    # grass
                amp = 50
            d = (n - 0.5) * amp if slot not in ('rock',) else (n - 0.5) * amp
            # a faint second tint channel for variation
            t2 = (fbm(fx+3.1, fy+5.7, 23, P) - 0.5)
            i = (y*size + x) * 4
            out[i]   = clampi(base[0] + d + t2*10)
            out[i+1] = clampi(base[1] + d + t2*8)
            out[i+2] = clampi(base[2] + d - t2*6)
            out[i+3] = 255
    return png_encode(size, size, out)

# ----------------------------------------------------------------------------- icon rasterization (alpha)
def raster(w, h, shade_fn, ss=2):
    """Supersample ss× then box-downsample. shade_fn(u,v)->(r,g,b,a) in 0..255, u,v in [0,1]."""
    W, H = w*ss, h*ss
    big = [[(0,0,0,0)]*W for _ in range(H)]
    for yy in range(H):
        for xx in range(W):
            big[yy][xx] = shade_fn((xx+0.5)/W, (yy+0.5)/H)
    out = bytearray(w*h*4)
    for y in range(h):
        for x in range(w):
            r=g=b=a=0
            for dy in range(ss):
                for dx in range(ss):
                    pr,pg,pb,pa = big[y*ss+dy][x*ss+dx]
                    # premultiply for correct edge AA
                    r += pr*pa; g += pg*pa; b += pb*pa; a += pa
            n = ss*ss
            A = a / n
            i = (y*w + x)*4
            if a > 0:
                out[i]   = clampi(r / a)
                out[i+1] = clampi(g / a)
                out[i+2] = clampi(b / a)
            out[i+3] = clampi(A)
    return png_encode(w, h, out)

def mountain(variant):
    skew = (-0.18, 0.0, 0.16)[variant]
    wdt  = (0.78, 0.92, 0.84)[variant]
    def fn(u, v):
        x = (u - 0.5) * 2
        peak = 0.5 + skew*0.5
        # silhouette: height of mountain at horizontal position x (u-space)
        base_y = 1.0
        # two-sided slope to the peak
        d = abs(u - peak)
        top = 0.06 + (1-d/ (wdt*0.5+1e-6))*0.86 if d < wdt*0.5 else -1
        inside = v >= (1 - top)
        if not inside:
            return (0,0,0,0)
        # snow cap near the top, rock below; east (right) flank shaded
        local = (v - (1 - top))
        snow = local < 0.22*top
        east = u > peak
        if snow:
            c = (236, 238, 242)
        else:
            c = (150, 132, 110) if not east else (104, 90, 74)
        return (c[0], c[1], c[2], 255)
    return raster(160, 160, fn)

def hill(variant):
    wdt = (0.9, 0.7)[variant]
    def fn(u, v):
        x = (u - 0.5) / (wdt*0.5)
        if abs(x) > 1: return (0,0,0,0)
        top = math.sqrt(max(0, 1 - x*x))             # semicircle mound
        if v < 1 - top*0.8: return (0,0,0,0)
        east = u > 0.5
        c = (120, 104, 70) if not east else (96, 82, 54)
        return (c[0], c[1], c[2], 255)
    return raster(128, 96, fn)

def conifer(variant):
    tiers = (3, 4)[variant]
    def fn(u, v):
        # trunk
        if v > 0.82 and abs(u-0.5) < 0.05:
            return (74, 54, 36, 255)
        for k in range(tiers):
            cy = 0.12 + k*(0.7/tiers)
            half = 0.12 + k*(0.34/tiers)
            if cy <= v <= cy + 0.7/tiers + 0.04:
                wv = half * (1 - (v-cy)/(0.7/tiers+0.04))
                if abs(u-0.5) < wv:
                    shade = 0 if u < 0.5 else -16
                    return (clampi(44+shade), clampi(86+shade), clampi(52+shade), 255)
        return (0,0,0,0)
    return raster(96, 144, fn)

def broadleaf(variant):
    rx = (0.34, 0.4)[variant]
    def fn(u, v):
        if v > 0.8 and abs(u-0.5) < 0.045:
            return (78, 56, 38, 255)
        cx, cy = 0.5, 0.42
        dx, dy = (u-cx)/rx, (v-cy)/0.4
        r = dx*dx + dy*dy
        lobe = 0.85 + 0.15*math.sin(math.atan2(dy, dx)*5)   # bumpy crown
        if r < lobe:
            shade = 0 if u < 0.5 else -14
            return (clampi(54+shade), clampi(104+shade), clampi(56+shade), 255)
        return (0,0,0,0)
    return raster(112, 128, fn)

# --------------------------------------------------------------------- v1.20: expanded vegetation/scatter

def rainforest(variant):
    """Broad two-lobed jungle canopy — denser/wider than broadleaf."""
    off = (-0.16, 0.16)[variant]
    def fn(u, v):
        if v > 0.82 and abs(u-0.5) < 0.05:
            return (60, 42, 30, 255)
        for cx, cy, rx in ((0.5+off*0.6, 0.36, 0.34), (0.5-off*0.9, 0.44, 0.30)):
            dx, dy = (u-cx)/rx, (v-cy)/0.36
            if dx*dx + dy*dy < 1.0:
                shade = 0 if u < 0.5 else -14
                return (clampi(26+shade), clampi(84+shade), clampi(44+shade), 255)
        return (0,0,0,0)
    return raster(120, 132, fn)

def savanna_tree(variant):
    """Flat-topped acacia silhouette: thin trunk + wide flat umbrella canopy."""
    wdt = (0.86, 0.72)[variant]
    def fn(u, v):
        if v > 0.62 and abs(u-0.5) < 0.028:
            return (86, 64, 40, 255)
        cy = 0.42
        x = (u-0.5) / (wdt*0.5)
        if abs(x) > 1 or v < cy-0.10 or v > cy+0.09:
            return (0,0,0,0)
        top = math.sqrt(max(0, 1 - x*x))
        if v > cy - 0.10*top:
            shade = 0 if u < 0.5 else -14
            return (clampi(118+shade), clampi(122+shade), clampi(64+shade), 255)
        return (0,0,0,0)
    return raster(128, 112, fn)

def wetland_tree(variant):
    """Cluster of narrow trunks under a low ragged canopy — mangrove/cypress-ish."""
    n_trunks = (3, 4)[variant]
    def fn(u, v):
        for k in range(n_trunks):
            tx = 0.5 + (k - (n_trunks-1)/2) * 0.16
            if v > 0.55 and abs(u-tx) < 0.02:
                return (58, 62, 40, 255)
        cx, cy = 0.5, 0.44
        dx, dy = (u-cx)/0.42, (v-cy)/0.34
        r = dx*dx + dy*dy
        ragged = 0.9 + 0.1*math.sin(math.atan2(dy, dx)*7)
        if r < ragged:
            shade = 0 if u < 0.5 else -12
            return (clampi(46+shade), clampi(78+shade), clampi(56+shade), 255)
        return (0,0,0,0)
    return raster(116, 120, fn)

def shrub(variant):
    """Small squat rounded bush blob — no trunk."""
    rx = (0.42, 0.36)[variant]
    def fn(u, v):
        cx, cy = 0.5, 0.58
        dx, dy = (u-cx)/rx, (v-cy)/0.34
        r = dx*dx + dy*dy
        bump = 0.88 + 0.12*math.sin(math.atan2(dy, dx)*6)
        if r < bump:
            shade = 0 if u < 0.5 else -12
            return (clampi(88+shade), clampi(102+shade), clampi(54+shade), 255)
        return (0,0,0,0)
    return raster(96, 72, fn)

def cactus(variant):
    """Columnar saguaro silhouette with 1-2 side arms."""
    arms = (1, 2)[variant]
    def fn(u, v):
        w = 0.11
        if abs(u-0.5) < w and v > 0.08:
            shade = 0 if u < 0.5 else -14
            return (clampi(66+shade), clampi(108+shade), clampi(70+shade), 255)
        if arms >= 1 and abs(u-0.28) < w*0.8 and 0.28 < v < 0.62:
            return (60, 100, 64, 255)
        if arms >= 2 and abs(u-0.72) < w*0.8 and 0.18 < v < 0.5:
            return (60, 100, 64, 255)
        return (0,0,0,0)
    return raster(96, 160, fn)

def boulder(variant):
    """Two-lobe overlapping rock cluster."""
    off = (0.22, 0.30)[variant]
    def fn(u, v):
        for cx, cy, rx, ry in ((0.5-off, 0.66, 0.34, 0.26), (0.5+off*0.9, 0.7, 0.28, 0.22)):
            dx, dy = (u-cx)/rx, (v-cy)/ry
            if dx*dx + dy*dy < 1.0:
                shade = 0 if u < 0.5 else -16
                return (clampi(118+shade), clampi(114+shade), clampi(106+shade), 255)
        return (0,0,0,0)
    return raster(120, 88, fn)

# ----------------------------------------------------------------------------- assemble pack
def build():
    here = os.path.dirname(os.path.abspath(__file__))
    files = {}
    for slot in ['grass','rock','sand','snow','wetland','canopy','parchment']:
        files['textures/%s.png' % slot] = make_texture(slot)
    icons = {
        'mountain':        [mountain(0), mountain(1), mountain(2)],
        'hill':            [hill(0), hill(1)],
        'tree_conifer':    [conifer(0), conifer(1)],
        'tree_broadleaf':  [broadleaf(0), broadleaf(1)],
        'tree_rainforest': [rainforest(0), rainforest(1)],
        'tree_savanna':    [savanna_tree(0), savanna_tree(1)],
        'tree_wetland':    [wetland_tree(0), wetland_tree(1)],
        'shrub':           [shrub(0), shrub(1)],
        'cactus':          [cactus(0), cactus(1)],
        'boulder':         [boulder(0), boulder(1)],
    }
    manifest_icons = {}
    for slot, arr in icons.items():
        manifest_icons[slot] = []
        for i, png in enumerate(arr, 1):
            name = 'icons/%s_%02d.png' % (slot, i)
            files[name] = png
            manifest_icons[slot].append(name)

    import json
    pack_json = {
        'schema': 1,
        'name': 'Cartalith Sample Pack',
        'author': 'Cartalith (procedural)',
        'license': 'CC0',
        'textures': {s: 'textures/%s.png' % s for s in
                     ['grass','rock','sand','snow','wetland','canopy','parchment']},
        'icons': manifest_icons,
    }
    files['pack.json'] = json.dumps(pack_json, indent=2).encode()

    csv = ['type,slot,file,variant']
    for s in ['grass','rock','sand','snow','wetland','canopy','parchment']:
        csv.append('texture,%s,textures/%s.png,' % (s, s))
    for slot, arr in manifest_icons.items():
        for i, name in enumerate(arr, 1):
            csv.append('icon,%s,%s,%d' % (slot, name, i))
    files['pack.csv'] = ('\n'.join(csv) + '\n').encode()

    files['CREDITS.md'] = (
        '# Cartalith Sample Pack — CREDITS\n\n'
        'All art in this pack is **procedurally generated** by `assets/make_sample_pack.py` and is\n'
        'released into the public domain under **CC0 1.0**. No attribution required.\n\n'
        'It exists as a reference/smoke-test pack for the in-app asset importer\n'
        '(`docs/ASSET_PACK_FORMAT.md`). Swap in real CC0 art (see `docs/research/asset-candidates.md`)\n'
        'by replacing the PNGs and keeping the same `pack.json` / `pack.csv` slot names.\n'
    ).encode()

    out = os.path.join(here, 'sample_pack.zip')
    with zipfile.ZipFile(out, 'w', compression=zipfile.ZIP_STORED) as z:
        for name in sorted(files):
            z.writestr(name, files[name])
    print('wrote %s (%d entries, %d bytes)' % (out, len(files), os.path.getsize(out)))

if __name__ == '__main__':
    build()
