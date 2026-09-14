/* v2.29 river-carve probe.
 *
 * Two claims, both of which are measurements, not opinions:
 *   (1) "Draw rivers as ways" defaults OFF, because it is an EITHER/OR with the terrain-blended
 *       raster river (the `!state.viz.riverWays` gate in the per-pixel loop) — on means the stroked
 *       line is the ONLY river renderer, which is the "only drawn lines, nothing rendered into
 *       terrain" the owner reported.
 *   (2) carveRiverValleys() incises hard enough to show. CARVE_STRENGTH_K was calibrated against
 *       elevation_foundation v0.015's own stream-power carve, which measures 3.16x the
 *       high-frequency relief energy of its un-carved surface; v2.28 managed 1.17x.
 *
 * The metric is a discrete-Laplacian mean |4h - Σneighbours| — the same high-frequency-energy proxy
 * v2.05/v2.25 used for LOD detail. It is compared against THIS build's own carve-off surface, so it
 * needs no golden number and cannot drift with an unrelated terrain change.
 *
 * Usage: node tests/perf/probe_carve.js "Cartalith v2.29 DCC test.html"
 */
const path = require('path');
const { chromium } = require(process.env.PLAYWRIGHT_DIR || '/opt/node22/lib/node_modules/playwright');

let pass = 0, fail = 0;
const ok = (name, cond, extra) => { if (cond) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra ? '  [' + extra + ']' : '')); } };

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_BIN || '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
  page.on('dialog', d => d.dismiss());
  page.on('pageerror', e => console.log('  PAGEERROR ' + e.message));
  await page.goto('file://' + path.resolve(process.argv[2]), { waitUntil: 'load', timeout: 180000 });
  await page.waitForTimeout(800);

  const r = await page.evaluate(async () => {
    const lap = (f, W, H) => { let s = 0, n = 0;
      for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) { const i = y * W + x;
        s += Math.abs(4 * f[i] - f[i - 1] - f[i + 1] - f[i - W] - f[i + W]); n++; } return s / n; };
    const fnv = a => { let h = 2166136261 >>> 0; const v = new Uint8Array(a.buffer || a);
      for (let i = 0; i < v.length; i++) { h ^= v[i]; h = Math.imul(h, 16777619) >>> 0; } return h >>> 0; };
    const setup = () => { state.tect.seed = 12345; state.resW = 512; state.world = false;
      GW = state.resW; GH = gridH(GW); allocate(); };
    const net = () => { const n = buildRiverNetwork(field, flowField, GW, GH, state.seaLevel,
        { world: !!state.world, riverDensity: 1 });
      return traceRiverPolylines(n.order, n.recv, GW, GH, 1).length; };

    const out = { defaults: { riverWays: !!(state.viz && state.viz.riverWays) } };
    const chk = document.getElementById('riverWaysChk');
    out.defaults.checkboxChecked = !!(chk && chk.checked);

    setup(); state.mode = 'biome'; state.debug = 'off';
    state.carveRivers = false; await generate();
    out.noCarve = { lap: lap(field, GW, GH), polys: net() };
    const ref = Float32Array.from(field);

    setup(); state.carveRivers = true; await generate();
    out.carved = { lap: lap(field, GW, GH), polys: net() };
    let drop = 0, maxDrop = 0;
    for (let i = 0; i < field.length; i++) { const d = ref[i] - field[i];
      if (d > 0) { drop += d; if (d > maxDrop) maxDrop = d; } }
    out.carved.meanDrop = drop / field.length; out.carved.maxDrop = maxDrop;

    /* the terrain-blended raster river must actually paint something the stroked line does not */
    const cv = document.getElementById('view'), cx = cv.getContext('2d');
    state.viz.riverWays = false; renderNow();
    const rgbaTerrain = fnv(cx.getImageData(0, 0, cv.width, cv.height).data);
    state.viz.riverWays = true; renderNow();
    const rgbaWays = fnv(cx.getImageData(0, 0, cv.width, cv.height).data);
    state.viz.riverWays = false; renderNow();
    out.render = { rgbaTerrain, rgbaWays };
    return out;
  });

  console.log('\n=== defaults ===');
  ok('state.viz.riverWays defaults OFF', r.defaults.riverWays === false, String(r.defaults.riverWays));
  ok('the checkbox ships unchecked, matching state', r.defaults.checkboxChecked === false);

  console.log('\n=== carve strength (vs this build\'s own un-carved surface) ===');
  const ratio = r.carved.lap / r.noCarve.lap;
  console.log('  lap ' + r.noCarve.lap.toFixed(6) + ' -> ' + r.carved.lap.toFixed(6) +
    '  (x' + ratio.toFixed(2) + ');  meanDrop ' + r.carved.meanDrop.toFixed(6) +
    ', maxDrop ' + r.carved.maxDrop.toFixed(5));
  ok('the carve raises relief energy at least 2.5x (v2.28 managed 1.17x)', ratio >= 2.5, 'x' + ratio.toFixed(2));
  ok('...and does not overshoot v0.015\'s own 3.16x by more than half again', ratio <= 4.8, 'x' + ratio.toFixed(2));
  ok('it genuinely erodes', r.carved.meanDrop > 0.0015 && r.carved.maxDrop > 0.08,
    r.carved.meanDrop.toFixed(6) + '/' + r.carved.maxDrop.toFixed(5));
  const lost = 1 - r.carved.polys / r.noCarve.polys;
  console.log('  polylines ' + r.noCarve.polys + ' -> ' + r.carved.polys + '  (' + (lost * 100).toFixed(1) + '% thinned)');
  ok('deeper incision costs under 10% of the traced network', lost < 0.10, (lost * 100).toFixed(1) + '%');

  console.log('\n=== the two river renderers are genuinely different pictures ===');
  ok('ways ON and ways OFF render differently', r.render.rgbaTerrain !== r.render.rgbaWays);

  console.log('\n' + (pass + fail) + ' assertions: ' + pass + ' passed, ' + fail + ' failed');
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
