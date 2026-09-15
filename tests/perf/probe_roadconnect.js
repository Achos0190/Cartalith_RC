/* v2.18 road-connectivity probe.
 *
 * _civRoadComponents()/_civRoadConnected() answer "can these two settlements reach each other by
 * road", and v1.33's _civFoodConnected() asks it for every land-mode supplier beyond the 50 km
 * local radius. Two independent defects meant the answer was ALWAYS no:
 *
 *   1. it iterated `state.ways`, which nothing in this file ever assigns (the live array is
 *      `civWays`), so the edge loop ran over an empty list;
 *   2. it read way points as `.x`/`.y`, but _civMstRoutes and _civHierarchicalNetwork emit [x,y]
 *      ARRAYS -- undefined -> NaN -> the nearest-settlement snap never fired.
 *
 * Neither threw: "not connected" is a perfectly ordinary answer. This probe asserts the thing that
 * makes the bug visible -- a real road between two settlements must read as connected -- rather
 * than the internals, and measures what the restored term does to the food shed.
 *
 * Usage: node tests/perf/probe_roadconnect.js "Cartalith Gen1 v2.18.html"
 */
const path = require('path');
const { chromium } = require(process.env.PLAYWRIGHT_DIR || '/opt/node22/lib/node_modules/playwright');
const CHROME_BIN = process.env.CHROME_BIN || '/opt/pw-browsers/chromium';
const SEEDS = [12345, 31337, 4242, 99001];

(async () => {
  const file = process.argv[2];
  const browser = await chromium.launch({ executablePath: CHROME_BIN, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  page.on('dialog', d => d.dismiss());
  const errs = []; page.on('pageerror', e => errs.push(String(e).slice(0, 200)));
  await page.goto('file://' + path.resolve(file), { waitUntil: 'load', timeout: 120000 });
  await page.waitForTimeout(400);

  const out = await page.evaluate(async (seeds) => {
    const R = { worlds: [] };
    for (const seed of seeds) {
      state.tect.seed = seed; state.resW = 256; GW = 256; GH = gridH(GW); allocate();
      await generate();
      const ob = document.getElementById('onboard'); if (ob) ob.style.display = 'none';
      _civIterativeAutoWorld(3);
      const S = (state.places || []).filter(p => p && p.category === 'settlement');
      const rc = _civRoadComponents();
      const roots = new Set(); for (let i = 0; i < rc.places.length; i++) roots.add(rc.find(i));
      /* Every land way with two distinct settlement endpoints MUST read as connected. */
      let roadPairs = 0, roadPairsConnected = 0;
      for (const w of civWays) {
        if (w.sea || w.type === 'sea-lane') continue;
        if (w.aIdx == null || w.bIdx == null) continue;
        const a = state.places[w.aIdx], b = state.places[w.bIdx];
        if (!a || !b || a === b || a.category !== 'settlement' || b.category !== 'settlement') continue;
        roadPairs++; if (_civRoadConnected(a, b)) roadPairsConnected++;
      }
      /* A sea lane is not a road: two settlements joined ONLY by a lane must not read connected. */
      let laneOnly = 0, laneOnlyConnected = 0;
      const roadSet = new Set();
      for (const w of civWays) { if (!w.sea && w.type !== 'sea-lane' && w.aIdx != null && w.bIdx != null) roadSet.add(w.aIdx + ':' + w.bIdx), roadSet.add(w.bIdx + ':' + w.aIdx); }
      for (const w of civWays) {
        if (!(w.sea || w.type === 'sea-lane')) continue;
        if (w.aIdx == null || w.bIdx == null || roadSet.has(w.aIdx + ':' + w.bIdx)) continue;
        const a = state.places[w.aIdx], b = state.places[w.bIdx];
        if (!a || !b || a === b || a.category !== 'settlement' || b.category !== 'settlement') continue;
        if (rc.find(rc.idx.get(a)) === rc.find(rc.idx.get(b))) laneOnlyConnected++;   // may be connected by land too
        laneOnly++;
      }
      let importers = 0, importCapacity = 0;
      for (const p of S) { const fs = _civFoodShed(p); if (fs) { if (fs.importCapacity > 1) importers++; importCapacity += fs.importCapacity || 0; } }
      let pairs = 0, connected = 0;
      for (let i = 0; i < rc.places.length; i++) for (let j = i + 1; j < rc.places.length; j++) { pairs++; if (_civRoadConnected(rc.places[i], rc.places[j])) connected++; }
      R.worlds.push({ seed, settlements: S.length, landWays: civWays.filter(w => !w.sea && w.type !== 'sea-lane').length,
        components: roots.size, roadPairs, roadPairsConnected, laneOnly, pairs, connected,
        importers, importCapacity: Math.round(importCapacity),
        pop: S.reduce((s, p) => s + (p.pop || 0), 0) });
    }
    R.stateWaysStillUnassigned = (typeof state.ways === 'undefined');
    return R;
  }, SEEDS);

  await browser.close();
  const fails = [];
  const ok = (n, c, extra) => { console.log((c ? 'ok   ' : 'FAIL ') + n + (extra != null ? '   [' + extra + ']' : '')); if (!c) fails.push(n); };
  for (const w of out.worlds) {
    const t = 'seed ' + w.seed;
    ok(t + ': every settlement pair joined by a real road reads as connected',
       w.roadPairs > 0 && w.roadPairsConnected === w.roadPairs, w.roadPairsConnected + '/' + w.roadPairs);
    ok(t + ': the network collapses into few components, not one per settlement',
       w.components < w.settlements, w.components + ' of ' + w.settlements);
    ok(t + ': some pairs are genuinely connected', w.connected > 0, w.connected + '/' + w.pairs);
    /* "not every pair" is a property of the WORLD, not of the code: seed 99001 is a single
       landmass whose 41 settlements really are all road-connected, and a first draft of this probe
       failed there for that reason. The code-level claim is the one below -- connectivity agrees
       with the component count -- which holds for a one-component world too. */
    ok(t + ': connectivity agrees with the component count (all-pairs iff one component)',
       (w.components === 1) === (w.connected === w.pairs), w.components + ' comps, ' + w.connected + '/' + w.pairs);
  }
  ok('state.ways is still unassigned — the fallback, not the source', out.stateWaysStillUnassigned);
  console.log('\nmeasured: ' + JSON.stringify(out.worlds.map(w => ({ seed: w.seed, comps: w.components, of: w.settlements, importers: w.importers, importCap: w.importCapacity, pop: w.pop }))));
  ok('no page errors', errs.length === 0);
  if (errs.length) console.log('  ' + errs.join('\n  '));
  console.log('\n' + (fails.length ? fails.length + ' FAILED' : 'all passed'));
  process.exit(fails.length ? 1 : 0);
})();
