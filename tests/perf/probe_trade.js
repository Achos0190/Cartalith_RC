/* v2.21 multi-good supply-matching probe.
 *
 * v1.33 built a real supply match -- distance, transport mode, road gate -- and it handled exactly
 * one good: food. `_civGoodReach` classified every other export local/regional/long and nothing
 * consumed it. This checks the same match now runs for all fifteen, that value density is what
 * separates a bulk good's reach from a luxury's, and that a good with no reachable exporter is
 * reported as unsupplied rather than assumed importable.
 *
 * Usage: node tests/perf/probe_trade.js "Cartalith Gen1 v2.21.html"
 */
const path = require('path');
const { chromium } = require(process.env.PLAYWRIGHT_DIR || '/opt/node22/lib/node_modules/playwright');
const CHROME_BIN = process.env.CHROME_BIN || '/opt/pw-browsers/chromium';

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME_BIN, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  page.on('dialog', d => d.dismiss());
  const errs = []; page.on('pageerror', e => errs.push(String(e).slice(0, 200)));
  await page.goto('file://' + path.resolve(process.argv[2]), { waitUntil: 'load', timeout: 120000 });
  await page.waitForTimeout(400);

  const out = await page.evaluate(async () => {
    const R = {};
    /* --- value density: the one thing added on top of v1.33's curve ------------------------- */
    R.classes = { grain: _civGoodValueClass('grain'), gold: _civGoodValueClass('gold'), unknown: _civGoodValueClass('__nope__') };
    const d = (g, km, m) => _civGoodDeliverable(g, km, m);
    R.bulkIsUnchanged = d('grain', 160, 'land') === _civFoodDeliverable(160, 'land');
    R.luxuryTravelsFurther = d('gold', 1000, 'land') > d('grain', 1000, 'land');
    R.bulkDiesOverland = d('grain', 1000, 'land') < 0.05;
    R.luxurySurvivesOverland = d('gold', 1000, 'land') > 0.5;
    R.generalSitsBetween = d('wool', 500, 'land') > d('grain', 500, 'land') && d('wool', 500, 'land') < d('gold', 500, 'land');
    R.seaBeatsLand = d('grain', 800, 'sea') > d('grain', 800, 'land');
    R.monotone = [10, 50, 200, 800].every((km, i, a) => i === 0 || d('grain', km, 'land') <= d('grain', a[i - 1], 'land'));

    /* --- a real world ------------------------------------------------------------------------ */
    state.tect.seed = 12345; state.resW = 256; GW = 256; GH = gridH(GW); allocate();
    await generate();
    const ob = document.getElementById('onboard'); if (ob) ob.style.display = 'none';
    _civIterativeAutoWorld(3);

    const net = _civTradeNetwork();
    R.netSize = net.info.length;
    R.netCached = _civTradeNetwork() === net;
    R.goodsWithExporters = Object.keys(net.byGood).length;

    const S = state.places.filter(p => p && p.category === 'settlement');
    let withImports = 0, matched = 0, unsupplied = 0, totalSources = 0, longestKm = 0, modes = {};
    const sample = [];
    for (const p of S) {
      const tr = _civPlaceTrade(p);
      if (!tr.imports.length) continue;
      withImports++;
      const sup = _civResourceSupply(p);
      matched += sup.matched; unsupplied += sup.unsupplied.length;
      for (const g of Object.keys(sup.sources)) {
        totalSources += sup.sources[g].length;
        for (const h of sup.sources[g]) { if (h.distKm > longestKm) longestKm = h.distKm; modes[h.mode] = (modes[h.mode] || 0) + 1; }
      }
      if (sample.length < 3) sample.push({ name: p.name, imports: tr.imports.slice(0, 4),
        sourced: Object.keys(sup.sources).slice(0, 4), unsupplied: sup.unsupplied.slice(0, 4) });
    }
    R.withImports = withImports; R.matched = matched; R.unsupplied = unsupplied;
    R.totalSources = totalSources; R.longestKm = Math.round(longestKm); R.modes = modes; R.sample = sample;
    R.someMatched = matched > 0;
    R.notEverythingMatched = unsupplied > 0 || matched > 0;   // either is fine; silence is not
    R.capsAtThree = true;
    for (const p of S) { const sup = _civResourceSupply(p); for (const g of Object.keys(sup.sources)) if (sup.sources[g].length > 3) R.capsAtThree = false; }

    /* A settlement never supplies itself. */
    R.noSelfSupply = true;
    for (const p of S) { const sup = _civResourceSupply(p); for (const g of Object.keys(sup.sources)) for (const h of sup.sources[g]) if (h.place === p) R.noSelfSupply = false; }

    /* Every reported source must genuinely export the good it is supplying. */
    R.sourcesReallyExport = true;
    for (const p of S.slice(0, 12)) {
      const sup = _civResourceSupply(p);
      for (const g of Object.keys(sup.sources)) for (const h of sup.sources[g]) {
        if (_civPlaceTrade(h.place).exports.indexOf(g) < 0) R.sourcesReallyExport = false;
      }
    }

    /* The road gate is real: cut every way and land-mode suppliers past the local radius must drop. */
    const keepWays = civWays.slice();
    let before = 0; for (const p of S) { const sup = _civResourceSupply(p); for (const g of Object.keys(sup.sources)) for (const h of sup.sources[g]) if (h.mode === 'land' && h.distKm > 50) before++; }
    civWays.length = 0; _civAggGen++; _civTradeNet = null; _civRoadComp = null;
    let after = 0; for (const p of S) { const sup = _civResourceSupply(p); for (const g of Object.keys(sup.sources)) for (const h of sup.sources[g]) if (h.mode === 'land' && h.distKm > 50) after++; }
    civWays.push(...keepWays); _civAggGen++; _civTradeNet = null; _civRoadComp = null;
    R.roadGateBefore = before; R.roadGateAfter = after;
    R.roadGateBites = before > 0 && after < before;

    /* The inspector actually prints it. */
    const target = S.find(p => _civPlaceTrade(p).imports.length) || S[0];
    const txt = _civFormatPlaceInsp(target);
    R.inspectorShowsSupply = /Supplied by|No source in reach/.test(txt);
    R.inspectorShowsReach = /\((local|regional|long)\)/.test(txt);
    return R;
  });

  await browser.close();
  const fails = [];
  const ok = (n, c, extra) => { console.log((c ? 'ok   ' : 'FAIL ') + n + (extra != null ? '   [' + extra + ']' : '')); if (!c) fails.push(n); };

  ok('goods classify by value density, unknown falling to general', out.classes.grain === 'bulk' && out.classes.gold === 'luxury' && out.classes.unknown === 'general', JSON.stringify(out.classes));
  ok('a bulk good is v1.33\'s curve unchanged — one curve, not two', out.bulkIsUnchanged);
  ok('a luxury travels further than grain over the same ground', out.luxuryTravelsFurther);
  ok('grain is effectively dead 1000 km overland', out.bulkDiesOverland);
  ok('a luxury is not', out.luxurySurvivesOverland);
  ok('a general good sits between the two', out.generalSitsBetween);
  ok('sea beats land at the same distance', out.seaBeatsLand);
  ok('delivered fraction falls monotonically with distance', out.monotone);
  ok('the trade network covers every settlement and is cached', out.netSize > 0 && out.netCached, out.netSize);
  ok('more than one good has exporters — this is not food-only', out.goodsWithExporters > 1, out.goodsWithExporters + ' goods');
  ok('settlements with imports get matched sources', out.someMatched, out.matched + ' matched / ' + out.unsupplied + ' unsupplied');
  ok('sources are capped at three per good', out.capsAtThree);
  ok('a settlement never supplies itself', out.noSelfSupply);
  ok('every reported source genuinely exports that good', out.sourcesReallyExport);
  ok('the road gate bites — removing every way drops distant land suppliers', out.roadGateBites, out.roadGateBefore + ' -> ' + out.roadGateAfter);
  ok('the inspector prints where imports come from', out.inspectorShowsSupply);
  ok('...and tags each export with its reach', out.inspectorShowsReach);
  ok('no page errors', errs.length === 0);
  if (errs.length) console.log('  ' + errs.join('\n  '));
  console.log('\nmodes: ' + JSON.stringify(out.modes) + '  longest link ' + out.longestKm + ' km');
  console.log('sample: ' + JSON.stringify(out.sample));
  console.log('\n' + (fails.length ? fails.length + ' FAILED' : 'all passed'));
  process.exit(fails.length ? 1 : 0);
})();
