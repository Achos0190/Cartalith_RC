/* Water-constraint softening probe (v1.56).
 *
 * Owner report: the Journey Planner's water-supply warning fires too readily — historically parties
 * drank from streams/springs/small stops along a route, not just mapped rivers. `_jpStageDryKm`
 * (the function measuring "how far can a party go with no freshwater in reach") tested
 * `flowField[i] > flowThresh`, the SAME `GW*GH*0.0004` threshold `buildRiverNetwork` uses to decide
 * whether a cell is even a channel at all (order ≥ 1) — at the default river-density=1, that
 * threshold IS the engine's own order-1 channel-initiation bar, so a genuine (if minor) headwater
 * stream that doesn't clear it reads as "no water" to the planner even though a real travelling
 * party could have refilled from it.
 *
 * This probe samples straight-line "routes" between random pairs of land cells on a real generated
 * world and measures, for a range of flow-threshold divisors, what fraction of routes register a
 * "dry" stretch (dryKm > 0) and how long that stretch is on average — the same measurement the v1.55
 * session used to ground JP_DRINKING_FLOW_DIVISOR=16 (Horton's laws: bifurcation ratio Rb≈3-5, two
 * Strahler orders down ≈ Rb² ≈ 9-36 — see docs/research/water-access-travel.md).
 *
 * Usage: node tests/perf/probe_water_gap.js "Cartalith Gen1 v1.56.html" [baseline.html ...]
 */
const path = require('path');
const { chromium } = require(process.env.PLAYWRIGHT_DIR || '/opt/node22/lib/node_modules/playwright');
const CHROME_BIN = process.env.CHROME_BIN || '/opt/pw-browsers/chromium';
const SEED = 12345, RES = 256;
const DIVISORS = [1, 4, 9, 12, 16, 25, 30, 36];
const N_TRANSECTS = 60;

async function run(file) {
  const browser = await chromium.launch({ executablePath: CHROME_BIN, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  page.on('dialog', d => d.dismiss());
  const errs = []; page.on('pageerror', e => errs.push(String(e).slice(0, 200)));
  await page.goto('file://' + path.resolve(file), { waitUntil: 'load', timeout: 120000 });
  await page.waitForTimeout(400);
  const r = await page.evaluate(async ({ seed, res, divisors, nTransects }) => {
    state.tect.seed = seed; state.resW = res; GW = res; GH = gridH(GW); allocate();
    await generate();
    const ob = document.getElementById('onboard'); if (ob) ob.style.display = 'none';
    const sea = state.seaLevel, cellKm = (state.mapWidthKm || 12000) / GW;
    const flowThresh = GW * GH * 0.0004;
    let wb = null; try { wb = (typeof currentWaterBodies === 'function') ? currentWaterBodies() : null; } catch (e) { wb = null; }
    const isLand = (x, y) => x >= 0 && y >= 0 && x < GW && y < GH && field[y * GW + x] >= sea;
    // deterministic PRNG so the same transect set is used across divisors/files
    let s = seed >>> 0;
    const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    const transects = [];
    let tries = 0;
    while (transects.length < nTransects && tries < nTransects * 200) {
      tries++;
      const ax = (rnd() * GW) | 0, ay = (rnd() * GH) | 0;
      if (!isLand(ax, ay)) continue;
      const ang = rnd() * Math.PI * 2, len = GW * (0.15 + rnd() * 0.25);
      const bx = Math.round(ax + Math.cos(ang) * len), by = Math.round(ay + Math.sin(ang) * len);
      if (!isLand(bx, by)) continue;
      const dist = Math.hypot(bx - ax, by - ay);
      const steps = Math.max(2, Math.round(dist));
      const pts = [];
      for (let k = 0; k <= steps; k++) pts.push([ax + (bx - ax) * k / steps, ay + (by - ay) * k / steps]);
      transects.push(pts);
    }
    const results = {};
    for (const div of divisors) {
      const thresh = flowThresh / div;
      let dryCount = 0, drySum = 0;
      for (const pts of transects) {
        const km = _jpStageDryKm(pts, 0, pts.length - 1, cellKm, wb, thresh);
        if (km > 0) { dryCount++; drySum += km; }
      }
      results[div] = { n: transects.length, dryCount, meanDryKm: dryCount ? drySum / dryCount : 0 };
    }
    return { results, nBuilt: transects.length, cellKm };
  }, { seed: SEED, res: RES, divisors: DIVISORS, nTransects: N_TRANSECTS });
  await browser.close();
  console.log(`\n== ${file} == (${r.nBuilt} transects, cellKm=${r.cellKm.toFixed(2)})`);
  if (errs.length) console.log('  page errors:', errs.slice(0, 5));
  console.log('  divisor | dry/N | mean dry km (among dry)');
  for (const div of DIVISORS) {
    const x = r.results[div];
    console.log(`  ${String(div).padStart(7)} | ${String(x.dryCount).padStart(2)}/${x.n} | ${x.meanDryKm.toFixed(1)}`);
  }
  return r;
}

(async () => {
  const files = process.argv.slice(2);
  if (!files.length) { console.error('usage: node probe_water_gap.js <file.html> [more.html ...]'); process.exit(1); }
  for (const f of files) await run(f);
})();
