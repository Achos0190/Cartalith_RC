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
    /* Network EXTENT, not segment count: a carve that joins two runs into one changes the polyline
       count without losing any river, so the count alone is the wrong thing to hold a budget against. */
    const net = () => { const n = buildRiverNetwork(field, flowField, GW, GH, state.seaLevel,
        { world: !!state.world, riverDensity: 1 });
      const pl = traceRiverPolylines(n.order, n.recv, GW, GH, 1);
      let km = 0; for (const q of pl) for (let k = 1; k < q.length; k++)
        km += Math.hypot(q[k].x - q[k - 1].x, q[k].y - q[k - 1].y);
      let cells = 0, water = 0;
      for (let i = 0; i < n.order.length; i++) { if (n.order[i] > 0) cells++;
        if (field[i] < state.seaLevel) water++; }
      return { polys: pl.length, km, cells, waterFrac: water / field.length, order: n.order }; };
    /* Does the drainage the engine ends up with actually have a trench under it, and is the trench
       still on the water? 3x3 rather than exact-cell because a bank cell is a legitimate neighbour. */
    const cover = (a, b) => { let hit = 0, n = 0;
      for (let i = 0; i < a.length; i++) { if (!a[i]) continue; n++;
        const x = i % GW, y = (i / GW) | 0;
        for (let dy = -1; dy <= 1 && true; dy++) { let done = false;
          for (let dx = -1; dx <= 1; dx++) { const xx = x + dx, yy = y + dy;
            if (xx < 0 || yy < 0 || xx >= GW || yy >= GH) continue;
            if (b[yy * GW + xx]) { hit++; done = true; break; } }
          if (done) break; } }
      return n ? hit / n : 0; };

    const out = { defaults: { riverWays: !!(state.viz && state.viz.riverWays) } };
    const chk = document.getElementById('riverWaysChk');
    out.defaults.checkboxChecked = !!(chk && chk.checked);

    setup(); state.mode = 'biome'; state.debug = 'off';
    state.carveRivers = false; await generate();
    out.noCarve = Object.assign({ lap: lap(field, GW, GH) }, net());
    const ref = Float32Array.from(field);

    setup(); state.carveRivers = true; await generate();
    out.carved = Object.assign({ lap: lap(field, GW, GH) }, net());
    out.cover = { chanHasTrench: cover(out.carved.order, riverMask),
                  trenchOnChannel: cover(riverMask, out.carved.order) };
    delete out.noCarve.order; delete out.carved.order;
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
  /* A carve flattens the valley floor it cuts, and channelThreshold() demands MORE drainage area on
     gentle ground, so some marginal headwaters legitimately drop out of the detected network. That is a
     real, understood cost — the budget bounds it, it does not pretend it is zero. */
  const lostKm = 1 - r.carved.km / r.noCarve.km;
  console.log('  traced network ' + r.noCarve.km.toFixed(0) + ' -> ' + r.carved.km.toFixed(0) +
    ' cells  (' + (lostKm * 100).toFixed(1) + '% thinned);  polylines ' +
    r.noCarve.polys + ' -> ' + r.carved.polys);
  ok('deeper incision costs under a third of the traced network', lostKm < 0.33, (lostKm * 100).toFixed(1) + '%');

  console.log('\n=== v2.30: the trench and the drainage are the same line ===');
  console.log('  drainage with a trench under it  ' + (r.cover.chanHasTrench * 100).toFixed(1) + '%');
  console.log('  trench still on a drainage line  ' + (r.cover.trenchOnChannel * 100).toFixed(1) + '%');
  /* v2.29 measured 64.3% here: halfW=0.8 at order 1 keeps only d<=0.8, i.e. the centre cell alone, so a
     diagonal step in the receiver chain left a gap and the trench came out dotted. Resampling the path
     finer than the channel is what closes it. */
  ok('almost every channel has a carved trench under it (v2.29: 64.3%)',
    r.cover.chanHasTrench >= 0.90, (r.cover.chanHasTrench * 100).toFixed(1) + '%');
  /* The other direction is the ceiling on CARVE_SINU_K: the meander displaces the trench off the line
     the water actually takes, and at 20x this fell to 73.4%. */
  ok('...and the meander has not walked the trench off the water',
    r.cover.trenchOnChannel >= 0.75, (r.cover.trenchOnChannel * 100).toFixed(1) + '%');
  /* Directional on purpose. Incising a channel REMOVES a little standing water (the pre-existing carve
     moves this by -0.15 points on its own, measured on v2.29), and that is fine; what would not be fine
     is a trench deep or wide enough to flood ground that was dry. Only the gain is budgeted. */
  const gained = r.carved.waterFrac - r.noCarve.waterFrac;
  ok('the carve floods nothing new', gained < 0.002,
    (r.noCarve.waterFrac * 100).toFixed(2) + '% -> ' + (r.carved.waterFrac * 100).toFixed(2) +
    '% (' + (gained >= 0 ? '+' : '') + (gained * 100).toFixed(2) + ' pts)');

  console.log('\n=== the two river renderers are genuinely different pictures ===');
  ok('ways ON and ways OFF render differently', r.render.rgbaTerrain !== r.render.rgbaWays);

  console.log('\n' + (pass + fail) + ' assertions: ' + pass + ' passed, ' + fail + ' failed');
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
