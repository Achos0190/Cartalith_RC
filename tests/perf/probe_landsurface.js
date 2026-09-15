/* v2.34 land-surface probe.
 *
 * v2.33 unified three land cost models into `_civTravelHours` and moved slope onto the edge as a
 * Tobler curve, and honestly reported that it made routes no quicker: p50 grade on the routing
 * grid is 1.20%, where Tobler charges x1.001. Slope was never the binding term for either formula.
 *
 * The binding term was `_civBiomeFriction` -- an invented 1.0-1.6 ladder over CLIMATE biomes --
 * and measurement condemned it: averaged over the routing grid at seed 4242 it charged Open Plains
 * 1.418 and Rocky Terrain 1.373, i.e. it was INVERTED on the largest distinction the map has,
 * because it keys on vegetation and a bare rocky mountain has none.
 *
 * v2.34 replaces it with JP_TERRAIN.land -- the Journey Planner's own travel-speeds.md-grounded
 * table -- read through buildCartTerrain()'s classification, which is the exact classifier
 * _jpDeriveStages runs over a drawn route. So the router minimises literally the quantity the
 * Planner reports.
 *
 * Usage: node tests/perf/probe_landsurface.js "Cartalith v2.34 DCC test.html"
 */
const path = require('path');
const { chromium } = require(process.env.PLAYWRIGHT_DIR || '/opt/node22/lib/node_modules/playwright');
const CHROME_BIN = process.env.CHROME_BIN || '/opt/pw-browsers/chromium';
const SEEDS = [12345, 31337, 4242];

let pass = 0, fail = 0;
const ok = (msg, cond, note) => { if (cond) { pass++; console.log('ok   ' + msg + (note ? '   [' + note + ']' : '')); }
  else { fail++; console.log('FAIL ' + msg + (note ? '   [' + note + ']' : '')); } };

(async () => {
  const file = process.argv[2];
  const browser = await chromium.launch({ executablePath: CHROME_BIN, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  page.on('dialog', d => d.dismiss());
  const errs = []; page.on('pageerror', e => errs.push(String(e).slice(0, 300)));
  await page.goto('file://' + path.resolve(file), { waitUntil: 'load', timeout: 180000 });
  await page.waitForTimeout(400);

  const R = await page.evaluate(async (seeds) => {
    const out = { fn: typeof _civSurfaceSpeed === 'function', seeds: [], unit: null, fric: typeof _civBiomeFriction };
    if (!out.fn) return out;

    /* the table IS the source: every CART_TERRAINS name must resolve to its JP_TERRAIN.land entry */
    out.tableAligned = CART_TERRAINS.every((n, k) => _civSurfaceSpeed(k + 1) === JP_TERRAIN.land[n]);
    out.missingKeys = CART_TERRAINS.filter(n => !(JP_TERRAIN.land[n] > 0));
    /* an unpainted / out-of-range class falls back to Open Plains, matching _jpDeriveStages */
    out.fallback = _civSurfaceSpeed(0) === JP_TERRAIN.land['Open Plains']
                && _civSurfaceSpeed(99) === JP_TERRAIN.land['Open Plains'];
    /* forest is min(), never a product: the slowest surface binds */
    const rockyIdx = CART_TERRAINS.indexOf('Rocky Terrain') + 1;
    const plainIdx = CART_TERRAINS.indexOf('Open Plains') + 1;
    const hillIdx = CART_TERRAINS.indexOf('Hills') + 1;
    out.forestOnPlain = _civSurfaceSpeed(plainIdx, 'conifer') === JP_TERRAIN.land['Forest Path'];
    out.forestOnRocky = _civSurfaceSpeed(rockyIdx, 'conifer') === JP_TERRAIN.land['Rocky Terrain'];
    out.forestOnHill = _civSurfaceSpeed(hillIdx, 'tempForest') === JP_TERRAIN.land['Hills'];
    out.grassNoForest = _civSurfaceSpeed(plainIdx, 'grass') === JP_TERRAIN.land['Open Plains']
                     && _civSurfaceSpeed(plainIdx, 'savanna') === JP_TERRAIN.land['Open Plains'];

    for (const seed of seeds) {
      state.tect.seed = seed; state.resW = 512; GW = 512; GH = gridH(GW); allocate();
      await generate();
      const ob = document.getElementById('onboard'); if (ob) ob.style.display = 'none';
      const G = _civRoutingGrid();
      const F = _civTravelHours(G.dfld, G.RW, G.RH, state.seaLevel, null, {});
      const ctr = currentCartTerrain(), scX = GW / G.RW, scY = GH / G.RH;
      const flatHours = F.cellKm / TOBLER_FLAT_KMH;

      /* the per-cell hour really is flatHours / the class's own tabled speed */
      let matched = 0, checked = 0, land = 0;
      const per = {};
      for (let y = 0; y < G.RH; y++) for (let x = 0; x < G.RW; x++) {
        const i = y * G.RW + x; if (!(F.cost[i] < Infinity)) continue;
        land++;
        const fi = Math.min(GH - 1, Math.round(y * scY)) * GW + Math.min(GW - 1, Math.round(x * scX));
        const name = ctr[fi] > 0 ? CART_TERRAINS[ctr[fi] - 1] : 'Open Plains';
        (per[name] = per[name] || { n: 0, h: 0 }).n++; per[name].h += F.cost[i];
        /* away from rivers/roads no other term applies, so the identity must hold exactly */
        if (!flowField || flowField[fi] <= riverFlowThresh(GW, GH)) {
          checked++;
          const want = flatHours / _civSurfaceSpeed(ctr[fi], classifyBiome(tempField[fi], rainField[fi]));
          if (Math.abs(F.cost[i] - want) < 1e-6) matched++;
        }
      }
      const rows = Object.keys(per).filter(k => per[k].n / land > 0.005)
        .map(k => ({ cls: k, pct: +(100 * per[k].n / land).toFixed(1), meanH: per[k].h / per[k].n }));
      /* the spread the router can actually steer on */
      const hs = rows.map(r => r.meanH);
      out.seeds.push({
        seed, land, checked, matched,
        spread: hs.length ? +(Math.max(...hs) / Math.min(...hs)).toFixed(2) : 0,
        rows: rows.sort((a, b) => b.pct - a.pct).map(r => r.cls + ' ' + r.pct + '%'),
        /* Rocky must now cost strictly more than Open Plains -- the inversion v2.33 shipped with */
        rockyOverPlain: (() => { const a = per['Rocky Terrain'], b = per['Open Plains'];
          return (a && b) ? +(a.h / a.n / (b.h / b.n)).toFixed(3) : null; })()
      });
    }
    return out;
  }, SEEDS);

  ok('_civSurfaceSpeed exists', R.fn);
  ok('_civBiomeFriction is gone — one function, one question', R.fric === 'undefined', R.fric);
  ok('every CART_TERRAINS class resolves to its own JP_TERRAIN.land speed', R.tableAligned);
  ok('no CART_TERRAINS class is missing from JP_TERRAIN.land', R.missingKeys && R.missingKeys.length === 0,
     (R.missingKeys || []).join(',') || 'none');
  ok('an unpainted or unknown class falls back to Open Plains, as _jpDeriveStages does', R.fallback);
  ok('forest on flat ground IS the binding surface', R.forestOnPlain);
  ok('forest on rock is NOT — the slowest surface binds, never a product', R.forestOnRocky);
  ok('forest on a hill is still a hill', R.forestOnHill);
  ok('grass and savanna are not forest', R.grassNoForest);

  for (const s of R.seeds) {
    ok('seed ' + s.seed + ': every off-river land cell is exactly flatHours / its tabled speed',
       s.checked > 500 && s.matched === s.checked, s.matched + '/' + s.checked);
    ok('seed ' + s.seed + ': the surface multiplier spreads wide enough to steer on',
       s.spread >= 1.8, 'spread ' + s.spread + '  ' + s.rows.join(' · '));
    ok('seed ' + s.seed + ': Rocky Terrain costs MORE than Open Plains (v2.33 had it inverted)',
       s.rockyOverPlain > 1.3, 'x' + s.rockyOverPlain);
  }
  ok('no page errors', errs.length === 0, errs.slice(0, 2).join(' | '));

  console.log('\n' + (fail ? fail + ' FAILED, ' : '') + pass + ' passed');
  await browser.close();
  process.exitCode = fail ? 1 : 0;
})();
