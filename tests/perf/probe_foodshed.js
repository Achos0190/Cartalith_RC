/* Food-shed / urbanisation probe (v1.34).
 *
 * The smoke suite runs its v1.34 assertions against a world that ~340 earlier assertions have already
 * resampled, extracted and mutated, so it is not a clean sample to measure urbanisation against. This
 * probe generates a FRESH world and checks the historically grounded outcome end to end:
 *
 *   - settled population sits in the observed pre-industrial urbanisation band (~5-20%);
 *   - median soil reproduces the attested 9-farmers-per-urbanite baseline exactly;
 *   - marginal soil contributes NO surplus and rich soil is capped;
 *   - every settlement ends within its food shed.
 *
 * Usage: node tests/perf/probe_foodshed.js "Cartalith Gen1 v1.34.html" [more.html ...]
 */
const path = require('path');
const PW = process.env.PLAYWRIGHT_DIR || '/opt/node22/lib/node_modules/playwright';
const { chromium } = require(PW);
const CHROME_BIN = process.env.CHROME_BIN || '/opt/pw-browsers/chromium';

const SEED = 12345, RES = 256;

async function run(file) {
  const browser = await chromium.launch({ executablePath: CHROME_BIN, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  page.on('dialog', d => d.dismiss());
  const errs = []; page.on('pageerror', e => errs.push(String(e).slice(0, 160)));
  await page.goto('file://' + path.resolve(file), { waitUntil: 'load', timeout: 120000 });
  await page.waitForTimeout(400);
  const r = await page.evaluate(async ({ seed, res }) => {
    try {
      state.tect.seed = seed; state.resW = res; GW = res; GH = gridH(GW); allocate();
      await generate();
      const ob = document.getElementById('onboard'); if (ob) ob.style.display = 'none';
      if (typeof _civIterativeAutoWorld === 'function') _civIterativeAutoWorld(3);
      await new Promise(r2 => setTimeout(r2, 1500));
      const places = (state.places || []).filter(p => p && p.category === 'settlement');
      const o = { n: places.length };
      o.totalPop = places.reduce((s, p) => s + (p.pop || 0), 0);
      o.maxPop = Math.max(0, ...places.map(p => p.pop || 0));
      o.tiers = {}; for (const p of places) o.tiers[p.kind] = (o.tiers[p.kind] || 0) + 1;
      const rp = typeof _civRegionalPopulation === 'function' ? _civRegionalPopulation() : null;
      o.regionalCapacity = rp ? Math.round(rp.total) : null;
      o.urbanShare = rp && rp.total ? o.totalPop / rp.total : null;
      const ref = currentSoilReference();
      o.soilRef = ref;
      o.surplus = { poor: foodSurplusRatio(0, ref), median: foodSurplusRatio(ref, ref), rich: foodSurplusRatio(1, ref) };
      o.allSustainable = places.every(p => {
        const fs = _civFoodShed(p); return fs.sustainable || (p.pop || 0) <= FOOD_SHED_MIN_POP;
      });
      o.big = places.slice().sort((a, b) => (b.pop || 0) - (a.pop || 0)).slice(0, 3).map(p => {
        const fs = _civFoodShed(p);
        return { kind: p.kind, pop: p.pop, supported: Math.round(fs.supported),
                 local: Math.round(fs.localCapacity), hinterland: Math.round(fs.hinterlandCapacity),
                 imported: Math.round(fs.importCapacity), mode: fs.bestMode };
      });
      return o;
    } catch (e) { return { ERR: String(e && e.message || e) }; }
  }, { seed: SEED, res: RES });
  await browser.close();
  return { r, errs };
}

(async () => {
  let failures = 0;
  const check = (name, ok, detail) => {
    console.log((ok ? 'ok   - ' : 'FAIL - ') + name + (detail ? '  (' + detail + ')' : ''));
    if (!ok) failures++;
  };
  for (const f of process.argv.slice(2)) {
    console.log('\n=== ' + path.basename(f) + ' (seed ' + SEED + ', ' + RES + 'px) ===');
    const { r, errs } = await run(f);
    if (r.ERR) { console.log('ERROR: ' + r.ERR); failures++; continue; }
    console.log('  settlements ' + r.n + '  settled ' + r.totalPop.toLocaleString() +
                '  largest ' + r.maxPop.toLocaleString() +
                '  regional capacity ' + (r.regionalCapacity || 0).toLocaleString());
    console.log('  tiers ' + JSON.stringify(r.tiers));
    console.log('  soil reference ' + r.soilRef.toFixed(4) + '  surplus poor/median/rich ' +
                r.surplus.poor.toFixed(3) + ' / ' + r.surplus.median.toFixed(3) + ' / ' + r.surplus.rich.toFixed(3));
    for (const b of r.big) console.log('    ' + b.kind + ' pop ' + b.pop.toLocaleString() +
      ' vs shed ' + b.supported.toLocaleString() + ' (local ' + b.local.toLocaleString() +
      ' + hinterland ' + b.hinterland.toLocaleString() + ' + import ' + b.imported.toLocaleString() + ', ' + b.mode + ')');

    check('urbanisation is in the pre-industrial band (5-20%)',
      r.urbanShare != null && r.urbanShare > 0.05 && r.urbanShare < 0.20,
      (r.urbanShare * 100).toFixed(2) + '%');
    check('median soil reproduces the 9:1 farmers-per-urbanite baseline',
      Math.abs(r.surplus.median - 1 / 9) < 1e-9);
    check('marginal soil contributes no surplus at all', r.surplus.poor === 0);
    check('rich soil is capped below the plausible maximum', r.surplus.rich <= 0.35 + 1e-9);
    check('every settlement ends within its food shed', r.allSustainable === true);
    if (errs.length) { console.log('  page errors: ' + JSON.stringify(errs.slice(0, 2))); failures++; }
  }
  console.log('\n' + (failures ? failures + ' check(s) FAILED' : 'all checks passed'));
  process.exit(failures ? 1 : 0);
})();
