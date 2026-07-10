/* Gen1 UI smoke test — real headless Chromium (Playwright). Verifies the UI/UX chrome added in
   v0.63 (onboarding card, Layers popover proxying to #debugSeg, style presets, progressive-
   disclosure <details>, phase signal on finalize), v0.64 (retired Edit tab, header Undo,
   confirm-gated Clear buttons, Label/Icon folded into _civTool), v0.65 (the pinned inspector
   hosts the FULL settlement/POI/label/icon edit form with single selection across all three
   groups; per-layer hotkeys on the Layers popover; Assets/Export promoted to header utilities,
   leaving the tab bar a genuine 2-position Forge/Atlas phase switch), and v0.66 (the corrected
   IA: the Generate sub-tab bar is RESTORED — World | Civilization | Cartography as Generate's
   categorical branches, with the tool palette split per branch and the pinned inspector shared
   by Civ+Carto; Explore is the planning phase: Info/Route tools, journeys, planner). Not a
   pixel test — DOM + behavior.
   Usage: node tests/perf/smoke_gen1.js "Cartalith Gen1 v0.66.html"
   Env overrides: PLAYWRIGHT_DIR, CHROME_BIN. */
const path = require('path');
const PW = process.env.PLAYWRIGHT_DIR || '/opt/node22/lib/node_modules/playwright';
const CHROME = process.env.CHROME_BIN || '/opt/pw-browsers/chromium';
const { chromium } = require(PW);
const FILE = 'file://' + path.resolve(process.argv[2] || 'Cartalith Gen1 v0.68.html');

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox','--use-gl=swiftshader'] });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });
  await page.goto(FILE, { waitUntil: 'load' });
  await page.waitForTimeout(2500);   // let wiring settle (v0.67: NO auto-generate in browser — hard gate)

  const R = {};
  // ── v0.67: the hard setup gate ──────────────────────────────────────────────
  // 1a. gate is shown on load, intro step active, 3 action buttons, NO Skip, and nothing generated yet
  R.gate = await page.evaluate(() => ({
    shown: getComputedStyle(document.getElementById('onboard')).display !== 'none',
    introOn: document.getElementById('obStepIntro').classList.contains('on'),
    actionBtns: document.querySelectorAll('#obStepIntro .ob-btns button').length,
    noSkip: !document.getElementById('obDismiss'),
    sidebarLocked: document.body.classList.contains('setup-gated') && getComputedStyle(document.querySelector('aside')).pointerEvents === 'none'   // v0.68: sidebar inert while gated
  }));
  // no auto-generate: the field should still be all-zero (empty world) behind the modal
  R.noAutoGen = await page.evaluate(() => { let s = 0; for (let i = 0; i < field.length; i += 997) s += field[i]; return s === 0; });
  // 1b. suggestPeakM curve: 800km→4000m (default-preserving), saturates near Everest at planetary scale
  R.peakCurve = await page.evaluate(() => ({ at800: suggestPeakM(800), at40000: suggestPeakM(40000), at100: suggestPeakM(100) }));
  // 1c. Generate → setup form: resolution/extent segs, units toggle, legend rows, peak auto-fill
  await page.evaluate(() => document.getElementById('obGenerate').click());
  await page.waitForTimeout(150);
  R.setupForm = await page.evaluate(() => ({
    generateStepOn: document.getElementById('obStepGenerate').classList.contains('on'),
    resButtons: document.querySelectorAll('#suResSeg button').length,
    extentButtons: document.querySelectorAll('#suExtentSeg button').length,
    unitButtons: document.querySelectorAll('#suUnitSeg button').length,
    legendRows: document.querySelectorAll('#suLegend .lg-row').length,
    hasCenter: !!document.getElementById('suCenter')
  }));
  // peak auto-fills from width: type a whole-world width → peak jumps toward Everest
  R.peakAutofill = await page.evaluate(() => {
    const w = document.getElementById('suWidth'), p = document.getElementById('suPeak');
    w.value = 40000; w.dispatchEvent(new Event('input'));
    return +p.value;   // ~8849 (km/m units)
  });
  // units toggle: km → mi rewrites the width value + pill
  R.unitToggle = await page.evaluate(() => {
    document.querySelector('#suUnitSeg [data-unit="mi"]').click();
    const w = document.getElementById('suWidth'), pill = document.getElementById('suWidthPill');
    return { pill: pill.textContent, widthIsMiles: Math.abs(+w.value - 40000 / 1.609344) < 2 };
  });
  await page.evaluate(() => document.querySelector('#suUnitSeg [data-unit="km"]').click());   // back to km for the rest
  // 1d. commit a default world (reset width→800 first so the committed world matches the rest of the suite)
  await page.evaluate(() => {
    const w = document.getElementById('suWidth'); w.value = 800; w.dispatchEvent(new Event('input'));
    document.querySelector('#suResSeg [data-w="512"]').click();   // small = fast commit
    document.getElementById('suGenCommit').click();
  });
  await page.waitForFunction(() => getComputedStyle(document.getElementById('onboard')).display === 'none', null, { timeout: 60000 });
  await page.waitForFunction(() => { for (let i = 0; i < field.length; i += 997) { if (field[i] !== 0) return true; } return false; }, null, { timeout: 60000 });   // world committed
  R.committed = true;
  R.gateHidden = await page.evaluate(() => getComputedStyle(document.getElementById('onboard')).display === 'none');
  R.sidebarUnlocked = await page.evaluate(() => !document.body.classList.contains('setup-gated') && getComputedStyle(document.querySelector('aside')).pointerEvents !== 'none');   // v0.68: sidebar live after commit
  // 1e. import-calibration step exists and auto-infers on commit (drive it directly; a real file picker
  //     can't be scripted). withBusy→showBusy sets #busyLabel synchronously, so the "inferring tectonics…"
  //     label right after the click proves the infer path fired.
  R.calStep = await page.evaluate(() => {
    _setupOpen('calibrate');
    const on = document.getElementById('obStepCalibrate').classList.contains('on');
    const legend = document.querySelectorAll('#suLegend2 .lg-row').length;
    document.getElementById('suCalCommit').click();
    const busyLabel = (document.getElementById('busyLabel').textContent || '');
    return { on, legend, infersOnCommit: /infer/i.test(busyLabel), hidden: getComputedStyle(document.getElementById('onboard')).display === 'none' };
  });
  await page.waitForTimeout(400);   // let the inferTectonics withBusy op finish before the rest of the suite
  // sidebar Scale & calibration parity: units toggle + legend present
  R.sidebarScale = await page.evaluate(() => ({
    unitSeg: document.querySelectorAll('#calUnitSeg button').length,
    legendRows: document.querySelectorAll('#calLegend .lg-row').length
  }));

  // ── v0.70: bug-fix batch ──
  // (a) sea level moves the coastline in the base biome view (was cached by _civBakeKey without seaLevel)
  R.seaMovesCoast = await page.evaluate(() => {
    state.debug = 'off'; state.mode = 'biome';
    const s = document.getElementById('sea'); s.value = 42; s.dispatchEvent(new Event('input')); renderNow();
    const wpx = () => { const d = img.data; let w = 0; for (let i = 0; i < d.length; i += 4 * 91) if (d[i] < 90 && d[i + 2] > 100) w++; return w; };
    const lo = wpx();
    s.value = 72; s.dispatchEvent(new Event('input')); renderNow();
    const hi = wpx();
    s.value = 42; s.dispatchEvent(new Event('input')); renderNow();
    return hi > lo + 20;   // much more water at sea 0.72
  });
  // (b) map scale locked at creation (sidebar #mapw disabled; legend reference-only)
  R.scaleLocked = await page.evaluate(() => document.getElementById('mapw').disabled === true);
  // (c) roadDijkstra terminates on a fully-uniform cost grid (the imported-world crash: 2^32 heap overflow)
  R.dijkstraUniform = await page.evaluate(() => {
    const W = 120, H = 120, cost = new Float32Array(W * H).fill(1.0003);   // uniform, like an imported heightmap
    const r = roadDijkstra(cost, W, H, 0, 0, false);
    let reached = 0; for (let i = 0; i < r.dist.length; i++) if (r.dist[i] < Infinity) reached++;
    return { reached, ok: reached === W * H && r.dist[W * H - 1] < Infinity };
  });
  // (d) auto-populate completes on this world without throwing
  R.autoPopulate = await page.evaluate(() => {
    try { _civAutoWorld(); return { ok: true, places: (state.places || []).length }; }
    catch (e) { return { ok: false, error: e.message }; }
  });
  await page.evaluate(() => { state.places = []; if (typeof _civRenderSettlementList === 'function') _civRenderSettlementList(); });

  // ── v0.71: persistent feature registry + zoom-dependent LOD rendering ──
  R.features = await page.evaluate(() => {
    const s = featureSummary();
    const near = s.rivers ? featuresNear(currentFeatures().rivers[0].mouth.x, currentFeatures().rivers[0].mouth.y, 6) : [];
    return { summary: s, hasRivers: s.rivers > 0, hasPeaks: s.peaks > 0, queryWorks: !s.rivers || near.length > 0 };
  });
  R.lodView = await page.evaluate(() => new Promise(res => {
    const lc = document.getElementById('lodChk'); lc.checked = true; lc.dispatchEvent(new Event('change'));
    _lodZoom = 4; renderNow();                       // overview render → caches an overview canvas
    const cachedAfterFirst = !!_lodOverviewPrev && !!_lodOverviewPrev.key;
    const t0 = performance.now(); renderNow();       // second draw at the same view: overview reuse path
    const secondMs = performance.now() - t0;
    refineVisibleTiles(); renderNow();               // refine visible tiles (featureDetailPass runs inside) then draw → tile canvases cached
    const tileCacheN = _lodTileCanvasCache.size;
    lc.checked = false; lc.dispatchEvent(new Event('change'));
    res({ cachedAfterFirst, secondMs: +secondMs.toFixed(1), tileCacheN, ok: true });
  }));
  // ── v0.72: deep-zoom (z≥8) tributary + local-incision morphology on a live tile ──
  R.tribs = await page.evaluate(() => {
    const bc = document.getElementById('lodBurnChk'); if (bc) { bc.checked = true; bc.dispatchEvent(new Event('change')); }
    const o = (typeof lodTileOpts === 'function') ? lodTileOpts() : {};
    const hasOrder = !!o.coarseOrder;                       // burn-rivers threads the persistent Strahler grid into refinement
    // SAME z=8 tile extent, feature morphology ON vs OFF (opts stripped) — deterministic regardless of the
    // world seed (the old z8-vs-z7 compare used two different extents, so it flaked). featureDetailPass only
    // carves, so ON must never sit above OFF: sum(ON) ≤ sum(OFF).
    const oOff = Object.assign({}, o); delete oOff.coarseOrder; delete oOff.fjordM; delete oOff.canyonM;
    const tOn = pyramidTile(field, GW, GH, 8, 0, 0, _lodTile, o);
    const tOff = pyramidTile(field, GW, GH, 8, 0, 0, _lodTile, oOff);
    let finite = true, sOn = 0, sOff = 0;
    for (let i = 0; i < tOn.data.length; i++) { if (!Number.isFinite(tOn.data[i])) { finite = false; break; } sOn += tOn.data[i]; sOff += tOff.data[i]; }
    if (bc) { bc.checked = false; bc.dispatchEvent(new Event('change')); }
    return { hasOrder, finite, carvesMore: sOn <= sOff + 1e-6 };   // morphology never raises terrain
  });
  R.popDensity = await page.evaluate(() => {
    _debugBtn('popdensity').click();                       // proxy through the same seg the popover uses
    const set = state.debug === 'popdensity';
    const d = currentPopulationDensity();
    let mx = 0; for (let i = 0; i < d.length; i += 97) if (d[i] > mx) mx = d[i];   // some land cell has real persons/km²
    _debugBtn('off').click();
    return { set, hasSignal: mx > 1 };
  });
  R.biomeK = await page.evaluate(() => {
    const before = _biomeK;
    const K0 = currentCarryingCapacity().slice(0);
    const chk = document.getElementById('civBiomeKChk'); chk.checked = true; chk.dispatchEvent(new Event('change'));
    const on = _biomeK === 1;
    const K1 = currentCarryingCapacity();
    let changed = false; for (let i = 0; i < K1.length; i += 97) if (Math.abs(K1[i] - K0[i]) > 1e-6) { changed = true; break; }
    chk.checked = false; chk.dispatchEvent(new Event('change'));   // restore
    return { startsOff: before === 0, togglesOn: on, changesK: changed, restored: _biomeK === 0 };
  });
  // ── v0.73: economic land/sea routing + settlement-waypoint pathfinding ──
  R.routing = await page.evaluate(() => {
    if (typeof _civAutoWorld === 'function') _civAutoWorld();       // settlements + ways to route among
    const settles = state.places.filter(p => p && p.kind && CIV_SETTLE_KEYS.has(p.kind));
    const out = { nSettles: settles.length, injTested: 0, threaded: 0, detourBust: 0, stopsWork: false, sea: null };
    // (a) gravity — DETERMINISTIC injection test (independent of the unseeded world's layout): take a real
    // route, offset a NEW settlement a few cells off the path onto land, and confirm the path now bends
    // toward it (closest approach shrinks) without a large detour. Restores state.places afterward.
    const sea = state.seaLevel, wb = (typeof currentWaterBodies === 'function') ? currentWaterBodies() : null;
    const onLand = (x, y) => { x = Math.round(x); y = Math.round(y); if (x < 0 || x >= GW || y < 0 || y >= GH) return false; const fi = y * GW + x; return field[fi] >= sea && (!wb || wb[fi] === 0); };
    const approach = (pts, mx, my) => { let m = 1e9; for (const p of pts) { let ax = Math.abs(p[0] - mx); if (state.world) ax = Math.min(ax, GW - ax); const d = Math.hypot(ax, p[1] - my); if (d < m) m = d; } return m; };
    for (let ai = 0; ai < settles.length && out.injTested < 6; ai++) for (let ci = ai + 1; ci < settles.length && out.injTested < 6; ci++) {
      const A = settles[ai], C = settles[ci], dx = C.x - A.x, dy = C.y - A.y, L = Math.hypot(dx, dy); if (L < 40) continue;
      const base = _civDijkstraPath(A.x, A.y, C.x, C.y, 'mixed'); if (!base.pts || base.pts.length < 5) continue;
      const mid = base.pts[Math.floor(base.pts.length / 2)]; const nx = -dy / L, ny = dx / L;   // unit normal to A→C
      let M = null; for (const off of [3, -3, 4, -4, 5, -5]) { const mx = mid[0] + nx * off, my = mid[1] + ny * off; if (onLand(mx, my)) { M = [Math.round(mx), Math.round(my)]; break; } }
      if (!M) continue;
      const before = approach(base.pts, M[0], M[1]); if (before < 1.5) continue;   // already on the path — no test
      state.places.push({ x: M[0], y: M[1], kind: 'town', klass: 'town', category: 'settlement', name: '__gravityProbe', faction: 1, pop: 500, traits: [] });
      const withB = _civDijkstraPath(A.x, A.y, C.x, C.y, 'mixed');
      state.places.pop();
      const after = approach(withB.pts, M[0], M[1]);
      out.injTested++;
      if (after < before - 0.75) { out.threaded++; if (withB.km > base.km * 1.6) out.detourBust++; }
      if (_civPassedSettlements(withB.pts).length >= 1) out.stopsWork = true;
    }
    // (b) economic sea: two ports separated by water → the mixed path actually crosses water
    const ports = settles.filter(p => p.traits && p.traits.includes('port'));
    for (let i = 0; i < ports.length && !out.sea; i++) for (let j = i + 1; j < ports.length; j++) {
      const A = ports[i], B = ports[j], dsl = Math.hypot(A.x - B.x, A.y - B.y); if (dsl < 25 || dsl > GW * 0.4) continue;
      const seg = _civDijkstraPath(A.x, A.y, B.x, B.y, 'mixed'); const wf = _civPathWaterFrac(seg.pts);
      if (wf > 0.2) { out.sea = { waterFrac: +wf.toFixed(2), crosses: true }; break; }
    }
    return out;
  });
  // restore clean civ state so later place/way tests see an empty world (mirrors the line-122 cleanup)
  await page.evaluate(() => {
    state.places = []; if (typeof civWays !== 'undefined') civWays = []; if (typeof civJourneys !== 'undefined') civJourneys = [];
    if (state.roads) state.roads = null;
    if (typeof _civRenderSettlementList === 'function') _civRenderSettlementList();
    if (typeof _civRenderWayList === 'function') _civRenderWayList();
    if (typeof renderNow === 'function') renderNow();
  });
  // v0.75: imperial-seat (metropolis) tier — DETERMINISTIC test of the pure selection helper
  //        (independent of the unseeded world's layout) + class/toggle wiring. Uses only synthetic
  //        local arrays, so it doesn't touch state.places.
  R.metro = await page.evaluate(() => {
    const cls = CIV_SETTLEMENT_CLASSES.find(c => c.key === 'metropolis');
    const mk = (kind, faction, x, y) => ({ kind, klass: kind, category: 'settlement', faction, x, y, traits: [] });
    // faction 1 is a large polity (7 settlements, two capitals); faction 2 is tiny (2).
    const places = [
      mk('capital', 1, 10, 10),   // dominant hub of a large polity → SHOULD be promoted
      mk('capital', 1, 20, 20),   // large polity but low betweenness → NOT promoted
      mk('city', 1, 30, 30), mk('town', 1, 40, 40), mk('village', 1, 50, 50),
      mk('hamlet', 1, 60, 60), mk('hamlet', 1, 70, 70),
      mk('capital', 2, 100, 100), mk('city', 2, 110, 110),   // small polity: high-betweenness capital still rejected
    ];
    const btw = new Map();
    btw.set(places[0], { betweenness: 1.0 });
    btw.set(places[1], { betweenness: 0.1 });
    btw.set(places[7], { betweenness: 1.0 });
    const chosen = _civSelectMetropolises(places, btw, 1.0, {});
    // per-faction cap: a second qualifying capital in faction 1 must not add a second metropolis
    const places2 = places.concat([mk('capital', 1, 15, 15)]);
    const btw2 = new Map(btw); btw2.set(places2[places2.length - 1], { betweenness: 0.95 });
    const chosen2 = _civSelectMetropolises(places2, btw2, 1.0, {});
    let perFac1 = 0; for (const p of chosen2) if (p.faction === 1) perFac1++;
    return {
      classRank: cls ? cls.rank : -1, classGlyph: cls ? cls.glyph : '',
      bigChosen: chosen.has(places[0]), lowNotChosen: !chosen.has(places[1]),
      smallFactionNotChosen: !chosen.has(places[7]), chosenCount: chosen.size, perFac1,
      defaultOff: (typeof _civMetropolis !== 'undefined') && _civMetropolis === false,
    };
  });
  R.metroToggle = await page.evaluate(() => {
    const cb = document.getElementById('civMetropolisChk'); if (!cb) return null;
    const was = _civMetropolis;
    cb.checked = true; cb.dispatchEvent(new Event('change')); const on = _civMetropolis;
    cb.checked = false; cb.dispatchEvent(new Event('change')); const off = _civMetropolis;
    _civMetropolis = was; return { on, off };
  });
  // v0.76: dense village-grid placement mode + regional-population estimate. Auto-populates twice
  //        (default vs dense) on the committed world, then restores clean civ state.
  R.village = await page.evaluate(() => {
    _civVillageDensity = false; _civMetropolis = false;
    _civAutoWorld(); const nDefault = state.places.length;
    _civVillageDensity = true;
    _civAutoWorld(); const nDense = state.places.length;
    _civVillageDensity = false;
    const pop = (typeof _civRegionalPopulation === 'function') ? _civRegionalPopulation() : null;
    // restore clean civ state so later place/way tests see an empty world
    state.places = []; if (typeof civWays !== 'undefined') civWays = []; if (typeof civJourneys !== 'undefined') civJourneys = [];
    if (typeof _civRenderSettlementList === 'function') _civRenderSettlementList();
    if (typeof _civRenderWayList === 'function') _civRenderWayList();
    if (typeof renderNow === 'function') renderNow();
    return {
      nDefault, nDense, denser: nDense > nDefault, capBounded: nDense <= 200,
      defaultOff: _civVillageDensity === false,
      popTotal: pop ? pop.total : -1, popLand: pop ? pop.landKm2 : -1,
    };
  });
  R.villageToggle = await page.evaluate(() => {
    const cb = document.getElementById('civVillageDensityChk'); if (!cb) return null;
    cb.checked = true; cb.dispatchEvent(new Event('change')); const on = _civVillageDensity;
    cb.checked = false; cb.dispatchEvent(new Event('change')); const off = _civVillageDensity;
    return { on, off };
  });
  R.popBtn = await page.evaluate(() => {
    const btn = document.getElementById('civPopEstimateBtn'), out = document.getElementById('civPopEstimateOut');
    if (!btn || !out) return null;
    btn.click();
    return { hasNumber: /population/i.test(out.textContent) && /\d/.test(out.textContent) };
  });
  // v0.77: wetland/marsh carrying capacity — the KEY integration check is that buildWetlandMask agrees
  //        exactly with buildCartBiome's Wetlands/Marshes class (index 4), i.e. the two pipelines finally
  //        share one definition. Plus: the wetland residual actually bites under biomeK. Restores _biomeK.
  R.wetland = await page.evaluate(() => {
    if (typeof buildWetlandMask !== 'function' || typeof currentCartBiome !== 'function') return null;
    const mask = buildWetlandMask(), cart = currentCartBiome();
    let wetCount = 0, agree = mask.length === GW * GH;
    for (let i = 0; agree && i < mask.length; i++) {
      if (mask[i] !== 0 && mask[i] !== 1) { agree = false; break; }
      if ((mask[i] === 1) !== (cart[i] === 4)) { agree = false; break; }
      if (mask[i] === 1) wetCount++;
    }
    let kEffect = true;
    if (agree && wetCount > 0) {
      _biomeK = 0; _carryCapField = null; _settleSuitField = null; _popDensityField = null; _wetlandMask = null;
      const kOff = currentCarryingCapacity().slice();
      _biomeK = 1; _carryCapField = null; _settleSuitField = null; _popDensityField = null; _wetlandMask = null;
      const kOn = currentCarryingCapacity();
      let idx = -1; for (let i = 0; i < mask.length; i++) if (mask[i] === 1 && kOff[i] > 1e-6) { idx = i; break; }
      kEffect = idx < 0 ? true : (kOn[idx] < kOff[idx] - 1e-9);   // residual 0.70 < 1 ⇒ K drops on a wetland cell
      _biomeK = 0; _carryCapField = null; _settleSuitField = null; _popDensityField = null; _wetlandMask = null;
      if (typeof renderNow === 'function') renderNow();
    }
    return { agree, wetCount, kEffect };
  });
  // 2. Layers FAB → open popover → grouped list builds from #debugSeg
  R.debugSegHidden = await page.$eval('#debugOverlaySec', el => getComputedStyle(el).display === 'none');
  await page.click('#layersBtn');
  await page.waitForTimeout(150);
  R.layers = await page.$eval('#layersList', el => ({ groups: el.querySelectorAll('.lp-grp').length, items: el.querySelectorAll('.lp-item').length }));
  // 2b. clicking a layer item proxies to #debugSeg → state.debug changes
  await page.evaluate(() => document.querySelector('#layersList [data-ld="bclass"]').click());
  R.debugAfterClick = await page.evaluate(() => state.debug);
  await page.evaluate(() => document.querySelector('#layersList [data-ld="off"]').click());
  // 3. style presets: apply Antique → state.viz keys; "Custom" flips on manual edit
  R.vizBefore = await page.evaluate(() => ({ parchment: state.viz.parchment, sepia: state.viz.sepia, icons: state.viz.icons }));
  await page.evaluate(() => document.querySelector('#stylePresetSeg [data-preset="antique"]').click());
  R.vizAntique = await page.evaluate(() => ({ parchment: state.viz.parchment, sepia: state.viz.sepia, icons: state.viz.icons }));
  R.antiqueSegOn = await page.$eval('#stylePresetSeg [data-preset="antique"]', b => b.classList.contains('on'));
  await page.evaluate(() => document.querySelector('#stylePresetSeg [data-preset="default"]').click());
  R.vizDefault = await page.evaluate(() => ({ parchment: state.viz.parchment, sepia: state.viz.sepia, icons: state.viz.icons }));
  // 4. progressive-disclosure details exist and are collapsed by default
  R.advDetails = await page.$$eval('details.adv', els => ({ count: els.length, anyOpen: els.some(e => e.open) }));
  // 5. phase signal: set finalized → body gets phase-explore + chip visible
  await page.evaluate(() => { state.finalized = true; applyFinalizedUI(); });
  R.phaseOn = await page.evaluate(() => ({ body: document.body.classList.contains('phase-explore'), chip: getComputedStyle(document.getElementById('phaseChip')).display !== 'none', genBtnDisabled: document.getElementById('genBtn').disabled, unfinalizeEnabled: !document.getElementById('unfinalizeBtn').disabled }));
  await page.evaluate(() => { state.finalized = false; applyFinalizedUI(); });
  R.phaseOff = await page.evaluate(() => document.body.classList.contains('phase-explore'));
  // v0.74: finalize control promoted to the FIRST block of Generate → World (id=finalizeSec),
  //        out of the collapsed Tiles & LOD → Atlas accordion. Checked while not finalized so the
  //        bake button is visible (applyFinalizedUI hides it once finalized).
  R.finalizeTop = await page.evaluate(() => {
    const gw = document.getElementById('genWorld');
    const bab = document.getElementById('bakeAllBtn');
    const sec = document.getElementById('finalizeSec');
    return {
      inFinalizeSec: !!(bab && sec && sec.contains(bab)),
      notInDetails: !!(sec && !sec.closest('details')),          // always visible, not behind a disclosure
      isFirstButton: !!(gw && gw.querySelector('button') === bab), // the first <button> in Generate → World
      depthInSec: !!(sec && sec.querySelector('#bakeAllDepth'))    // the bake-depth picker travelled with it
    };
  });

  // ---- v0.66: corrected IA — Generate branches restored (World | Civilization | Cartography);
  //      Explore is the planning phase ----
  R.undoInHeader = await page.$eval('header #undoBtn', el => !!el);
  R.subTabs = await page.$$eval('#genSubBar .subtab', els => els.map(e => e.dataset.gsub));
  R.worldDefault = await page.evaluate(() => ({
    world: getComputedStyle(document.getElementById('genWorld')).display !== 'none',
    civ: getComputedStyle(document.getElementById('genCiv')).display === 'none',
    carto: getComputedStyle(document.getElementById('genCarto')).display === 'none',
    inspectorHidden: getComputedStyle(document.getElementById('inspector')).display === 'none'
  }));
  R.factionPickerInGenCiv = await page.evaluate(() => !!document.getElementById('genCiv').querySelector('#civFactionPicker'));
  R.mapStyleInGenCarto = await page.evaluate(() => !!document.getElementById('genCarto').querySelector('#stylePresetSeg'));
  await page.evaluate(() => document.querySelector('#genSubBar [data-gsub="civ"]').click());
  await page.waitForTimeout(150);
  R.civBranch = await page.evaluate(() => ({
    civShown: getComputedStyle(document.getElementById('genCiv')).display !== 'none',
    worldHidden: getComputedStyle(document.getElementById('genWorld')).display === 'none',
    inspectorShown: getComputedStyle(document.getElementById('inspector')).display !== 'none'
  }));

  // ---- v0.66: the unified _civTool state machine, palette split per branch ----
  R.civPalette = await page.$$eval('#civToolPalette [data-civtool]', els => els.map(e => e.dataset.civtool));
  R.cartoPalette = await page.$$eval('#cartoToolPalette [data-civtool]', els => els.map(e => e.dataset.civtool));
  R.explPalette = await page.$$eval('#explToolPalette [data-civtool]', els => els.map(e => e.dataset.civtool));
  R.duplicateToolButtons = await page.evaluate(() => {
    const seen = {};
    document.querySelectorAll('[data-civtool]').forEach(b => { seen[b.dataset.civtool] = (seen[b.dataset.civtool]||0)+1; });
    return Object.entries(seen).filter(([,v]) => v > 1).map(([k]) => k);
  });
  await page.evaluate(() => document.querySelector('#genSubBar [data-gsub="carto"]').click());
  await page.waitForTimeout(150);
  await page.evaluate(() => document.querySelector('#cartoToolPalette [data-civtool="icon"]').click());
  await page.waitForTimeout(150);
  R.iconCtxVisible = await page.$eval('#carIconContextSec', el => getComputedStyle(el).display !== 'none');
  await page.evaluate(() => document.querySelector('#cartoToolPalette [data-civtool="label"]').click());
  await page.waitForTimeout(150);
  R.labelMode = await page.evaluate(() => _labelMode === true);
  R.iconCtxHiddenAfterLabel = await page.$eval('#carIconContextSec', el => getComputedStyle(el).display === 'none');
  await page.evaluate(() => document.querySelector('#cartoToolPalette [data-civtool="label"]').click());   // toggle back off
  await page.waitForTimeout(100);

  // ---- v0.66: paint arms on the Cartography branch and disarms on leaving it ----
  await page.evaluate(() => { const pc = document.getElementById('carPaintChk'); pc.checked = true; pc.dispatchEvent(new Event('change')); });
  await page.waitForTimeout(100);
  R.paintArmsOnCarto = await page.evaluate(() => _paintMode === true);
  await page.evaluate(() => document.querySelector('#genSubBar [data-gsub="world"]').click());
  await page.waitForTimeout(100);
  R.paintDisarmsLeavingCarto = await page.evaluate(() => _paintMode === false && document.getElementById('carPaintChk').checked === false);
  await page.evaluate(() => document.querySelector('#genSubBar [data-gsub="civ"]').click());
  await page.waitForTimeout(100);

  // ---- v0.64 (§4.7): pinned selection inspector (shared by the Civ + Carto branches) ----
  R.inspectorEmptyState = await page.$eval('#inspectorBody', el => el.textContent.includes('Select a settlement'));

  // ---- v0.64 (§4.8): header Undo + confirm-gated destructive Clear buttons ----
  R.undoDisabledInitially = await page.$eval('#undoBtn', el => el.disabled === true);
  R.dangerButtons = await page.$$eval('.al-danger', els => els.map(e => e.id));
  let dialogFired = false;
  const hEmpty = async d => { dialogFired = true; await d.dismiss(); };
  page.on('dialog', hEmpty);
  await page.evaluate(() => document.getElementById('civClearPlacesBtn').click());
  await page.waitForTimeout(150);
  page.off('dialog', hEmpty);
  R.noConfirmWhenEmpty = !dialogFired;
  await page.evaluate(() => { state.places.push({x:10,y:10,name:'Test',kind:'town',faction:0,pop:100,traits:[]}); });
  let dialogMsg = null;
  const hNonEmpty = async d => { dialogMsg = d.message(); await d.dismiss(); };
  page.on('dialog', hNonEmpty);
  await page.evaluate(() => document.getElementById('civClearPlacesBtn').click());
  await page.waitForTimeout(150);
  page.off('dialog', hNonEmpty);
  R.confirmedWhenNonEmpty = dialogMsg !== null;
  R.placesSurviveDismiss = await page.evaluate(() => state.places.length === 1);

  // ---- v0.65 (§4.7, complete): pinned inspector hosts the FULL edit form; single selection ----
  await page.evaluate(() => { _civSelectedPlace = state.places[0]; _civRenderPlaceEditor(); });
  await page.waitForTimeout(100);
  R.editorInInspector = await page.$eval('#inspectorBody', el => !!el.querySelector('#_civPeName'));
  R.noInlineEditorInList = await page.evaluate(() => document.getElementById('civSettlementList').querySelector('#_civPeName') === null);
  await page.fill('#_civPeName', 'Renamed');
  await page.dispatchEvent('#_civPeName', 'input');
  await page.waitForTimeout(100);
  R.liveModelUpdate = await page.evaluate(() => state.places[0].name === 'Renamed');
  R.liveRowPatch = await page.evaluate(() => document.getElementById('civSettlementList').textContent.includes('Renamed'));
  await page.evaluate(() => {
    state.labels.push({x:5,y:5,name:'ALabel'});
    _civSelectLabel(state.labels[0]);
  });
  await page.waitForTimeout(100);
  R.labelEditorSwapsIn = await page.$eval('#inspectorBody', el => !!el.querySelector('#_carLeName'));
  R.selectingLabelDeselectsPlace = await page.evaluate(() => _civSelectedPlace === null);
  await page.evaluate(() => { _civSelectedPlace = state.places[0]; _civRenderPlaceEditor(); });
  await page.waitForTimeout(100);
  R.selectingPlaceDeselectsLabel = await page.evaluate(() => _civSelectedLabel === null);

  // ---- v0.65 (§4.10): per-layer hotkeys ----
  await page.click('#layersBtn');
  await page.waitForTimeout(100);
  R.keyBadges = await page.$$eval('#layersList .lp-key', els => els.map(e => e.textContent));
  await page.keyboard.press('KeyB');
  await page.waitForTimeout(100);
  R.debugAfterB = await page.evaluate(() => state.debug);
  await page.keyboard.press('KeyF');
  await page.waitForTimeout(100);
  R.debugAfterF = await page.evaluate(() => state.debug);
  await page.click('#_civPeName');
  await page.keyboard.type('B');   // typing "B" while focused in a text input must not trigger the hotkey
  await page.waitForTimeout(100);
  R.debugUnchangedWhileTyping = await page.evaluate(() => state.debug) === 'flow';

  // ---- v0.66: Explore = the planning/reading phase (Info/Route, journeys, planner) ----
  await page.click('[data-tab="explore"]');
  await page.waitForTimeout(150);
  R.exploreShape = await page.evaluate(() => ({
    journeys: !!document.getElementById('explorePanel').querySelector('#civJourneyList'),
    planner: !!document.getElementById('explorePanel').querySelector('#civPlannerSec'),
    infoToolAuto: _civTool === 'info',
    infoSecShown: getComputedStyle(document.getElementById('civInfoSec')).display !== 'none',
    noCivSectionsInExplore: !document.getElementById('explorePanel').querySelector('#civFactionPicker') && !document.getElementById('explorePanel').querySelector('#stylePresetSeg')
  }));

  // ---- v0.65 (§Stage 2 follow-up): Assets/Export moved to header utilities; tab bar is a genuine
  //      2-position phase switch ----
  R.tabCount = await page.$$eval('.tab', els => els.length);
  R.tabsOnly2 = await page.$$eval('.tab', els => JSON.stringify(els.map(e => e.dataset.tab)) === JSON.stringify(['generate','explore']));
  await page.click('#exportMenuBtn');
  await page.waitForTimeout(150);
  R.exportMenuOpen = await page.$eval('#exportMenu', el => el.classList.contains('open'));
  await page.click('#assetsHeaderBtn');
  await page.waitForTimeout(250);
  R.assetsCanvasHidden = await page.$eval('.canvas-wrap', el => getComputedStyle(el).display === 'none');
  R.assetsLibraryShown = await page.$eval('#assetLibrary', el => getComputedStyle(el).display !== 'none');
  await page.click('[data-tab="generate"]');
  await page.waitForTimeout(200);
  R.assetsExitedViaGenerate = await page.$eval('.canvas-wrap', el => getComputedStyle(el).display !== 'none');

  await browser.close();

  // ---- assertions ----
  let ok = 0, fail = 0;
  const A = (name, cond) => { if (cond) { ok++; console.log('ok   - ' + name); } else { fail++; console.log('FAIL - ' + name); } };
  A('no page/console errors on load', errors.length === 0);
  if (errors.length) errors.forEach(e => console.log('      ' + e));
  // ── v0.67: hard setup gate + scale/height calibration ──
  A('setup gate shows on load: intro step, 3 actions, no Skip', R.gate.shown && R.gate.introOn && R.gate.actionBtns === 3 && R.gate.noSkip);
  A('sidebar is locked (inert) while the gate is open', R.gate.sidebarLocked === true);
  A('sidebar unlocks after committing a world', R.sidebarUnlocked === true);
  A('nothing is simulated until commit (empty field behind the gate)', R.noAutoGen === true);
  A('suggestPeakM saturates: 800→4000, 40000→~8849, 100 small', R.peakCurve.at800 === 4000 && Math.abs(R.peakCurve.at40000 - 8849) < 5 && R.peakCurve.at100 < 1000);
  A('Generate opens the setup form (res/extent/units/center + legend)', R.setupForm.generateStepOn && R.setupForm.resButtons === 5 && R.setupForm.extentButtons === 2 && R.setupForm.unitButtons === 2 && R.setupForm.legendRows === 7 && R.setupForm.hasCenter);
  A('peak auto-fills from map width (40000km → ~8849m)', Math.abs(R.peakAutofill - 8849) < 5);
  A('km→mi toggle rewrites width value + pill', R.unitToggle.pill === 'mi' && R.unitToggle.widthIsMiles);
  A('committing the setup builds a world and hides the gate', R.committed && R.gateHidden);
  A('import calibration step + auto-infer on commit', R.calStep.on && R.calStep.legend === 7 && R.calStep.infersOnCommit && R.calStep.hidden);
  A('sidebar Scale & calibration gains units toggle + legend', R.sidebarScale.unitSeg === 2 && R.sidebarScale.legendRows === 7);
  A('v0.70 sea level moves the coastline in the base view', R.seaMovesCoast === true);
  A('v0.70 map scale (#mapw) is locked at creation', R.scaleLocked === true);
  A('v0.70 roadDijkstra terminates on a uniform cost grid (no 2^32 overflow)', R.dijkstraUniform.ok === true);
  A('v0.70 auto-populate completes without throwing', R.autoPopulate.ok === true);
  A('v0.71 feature registry on a real world (rivers + peaks + query)', R.features.hasRivers && R.features.hasPeaks && R.features.queryWorks);
  A('v0.71 LOD renderer caches: overview cached + tiles cached after refine', R.lodView.cachedAfterFirst && R.lodView.tileCacheN > 0);
  A('v0.72 z8 tributaries+incision: order grid threaded, tiles finite, z8 carves ≥ z7', R.tribs.hasOrder && R.tribs.finite && R.tribs.carvesMore);
  A('v0.73 routing: auto-world seeded settlements to route among', R.routing.nSettles >= 2);
  A('v0.73 routing: gravity bends the path toward an injected roadside settlement (' + R.routing.threaded + '/' + R.routing.injTested + '), detour capped', R.routing.threaded >= 1 && R.routing.detourBust === 0 && R.routing.stopsWork);
  A('v0.73 routing: economic sea crossing taken when shorter (if a water-separated port pair exists)', !R.routing.sea || R.routing.sea.crosses);
  A('v0.75 metropolis: class present (rank 5, ★)', R.metro.classRank === 5 && R.metro.classGlyph === '★');
  A('v0.75 metropolis: promotes the dominant capital of a large polity, rejects low-betweenness + small-polity capitals', R.metro.bigChosen && R.metro.lowNotChosen && R.metro.smallFactionNotChosen && R.metro.chosenCount === 1 && R.metro.perFac1 <= 1);
  A('v0.75 metropolis: off by default, checkbox toggles the flag', R.metro.defaultOff && R.metroToggle && R.metroToggle.on === true && R.metroToggle.off === false);
  A('v0.76 village mode: dense grid places more settlements than the default, bounded at the 200-pin cap', R.village.denser && R.village.capBounded && R.village.nDefault >= 2);
  A('v0.76 village mode: off by default, checkbox toggles the flag', R.village.defaultOff && R.villageToggle && R.villageToggle.on === true && R.villageToggle.off === false);
  A('v0.76 regional population: integrates a positive total over a positive land area', R.village.popTotal > 0 && R.village.popLand > 0);
  A('v0.76 population estimate button fills the readout with a number', R.popBtn && R.popBtn.hasNumber);
  A('v0.77 wetland mask agrees exactly with buildCartBiome Wetlands class (two pipelines unified)', R.wetland && R.wetland.agree);
  A('v0.77 wetland residual lowers carrying capacity on wetland cells under biomeK (or no wetlands on this world)', R.wetland && R.wetland.kEffect === true);
  A('v0.69 Pop-density debug view sets state.debug + has real persons/km²', R.popDensity.set && R.popDensity.hasSignal);
  A('v0.69 biome-K toggle: off by default, flips on, changes K, restores', R.biomeK.startsOff && R.biomeK.togglesOn && R.biomeK.changesK && R.biomeK.restored);
  A('sidebar debug picker hidden (re-housed)', R.debugSegHidden === true);
  A('Layers popover builds grouped list (>=5 groups, >=25 items)', R.layers.groups >= 5 && R.layers.items >= 25);
  A('Layers item click proxies to #debugSeg (state.debug=bclass)', R.debugAfterClick === 'bclass');
  A('Antique preset sets parchment/sepia/icons', R.vizAntique.parchment === 0.6 && R.vizAntique.sepia === 0.35 && R.vizAntique.icons === true);
  A('Antique preset marks its seg button active', R.antiqueSegOn === true);
  A('Default preset resets look to base (all off)', R.vizDefault.parchment === 0 && R.vizDefault.sepia === 0 && R.vizDefault.icons === false);
  A('progressive-disclosure <details.adv> present + collapsed', R.advDetails.count >= 3 && R.advDetails.anyOpen === false);
  A('finalize → phase tint + chip + genBtn locked + Un-finalize stays clickable', R.phaseOn.body && R.phaseOn.chip && R.phaseOn.genBtnDisabled && R.phaseOn.unfinalizeEnabled);
  A('un-finalize clears phase-explore', R.phaseOff === false);
  A('v0.74 finalize button is the first button in Generate → World, not behind a disclosure', R.finalizeTop.inFinalizeSec && R.finalizeTop.notInDetails && R.finalizeTop.isFirstButton && R.finalizeTop.depthInSec);
  A('Undo button lives in header', R.undoInHeader === true);
  A('Generate sub-tab bar restored (world/civ/carto)', JSON.stringify(R.subTabs) === JSON.stringify(['world','civ','carto']));
  A('World is the default branch; Civ/Carto/inspector hidden', R.worldDefault.world && R.worldDefault.civ && R.worldDefault.carto && R.worldDefault.inspectorHidden);
  A('faction picker lives in Generate → Civilization', R.factionPickerInGenCiv === true);
  A('Map style lives in Generate → Cartography', R.mapStyleInGenCarto === true);
  A('Civilization branch shows genCiv + pinned inspector', R.civBranch.civShown && R.civBranch.worldHidden && R.civBranch.inspectorShown);
  A('Civ palette = Inspect/Settlement/POI/Territory/Way', JSON.stringify(R.civPalette) === JSON.stringify(['inspect','place','place_poi','territory','draw_way']));
  A('Carto palette = Inspect/Label/Icon', JSON.stringify(R.cartoPalette) === JSON.stringify(['inspect','label','icon']));
  A('Explore palette = Info/Route', JSON.stringify(R.explPalette) === JSON.stringify(['info','route']));
  A('only Inspect appears in two palettes (shared select tool)', JSON.stringify(R.duplicateToolButtons) === JSON.stringify(['inspect']));
  A('Icon tool reveals its contextual gallery section', R.iconCtxVisible === true);
  A('Label tool sets _labelMode', R.labelMode === true);
  A('switching to Label hides the Icon gallery again', R.iconCtxHiddenAfterLabel === true);
  A('paint arms on the Cartography branch', R.paintArmsOnCarto === true);
  A('paint disarms on leaving Cartography', R.paintDisarmsLeavingCarto === true);
  A('Explore keeps Journeys + planner, no civ/carto sections', R.exploreShape.journeys && R.exploreShape.planner && R.exploreShape.noCivSectionsInExplore);
  A('entering Explore auto-arms the Info tool + its readout', R.exploreShape.infoToolAuto && R.exploreShape.infoSecShown);
  A('pinned inspector shows the empty state initially', R.inspectorEmptyState === true);
  A('header Undo starts disabled', R.undoDisabledInitially === true);
  A('destructive buttons carry .al-danger (>=8)', R.dangerButtons.length >= 8);
  A('Clear places does not prompt when empty', R.noConfirmWhenEmpty === true);
  A('Clear places prompts when non-empty', R.confirmedWhenNonEmpty === true);
  A('dismissing the confirm preserves the place', R.placesSurviveDismiss === true);
  A('pinned inspector hosts the FULL place editor', R.editorInInspector === true);
  A('settlement list no longer has an inline editor', R.noInlineEditorInList === true);
  A('editing the inspector name field updates the model', R.liveModelUpdate === true);
  A('the row summary patches live from the inspector edit', R.liveRowPatch === true);
  A('selecting a label swaps the inspector to the label editor', R.labelEditorSwapsIn === true);
  A('selecting a label deselects the place (single selection)', R.selectingLabelDeselectsPlace === true);
  A('selecting the place again deselects the label', R.selectingPlaceDeselectsLabel === true);
  A('Layers popover shows hotkey badges (>=6)', R.keyBadges.length >= 6);
  A('pressing B sets the Biomes layer', R.debugAfterB === 'bclass');
  A('pressing F sets the Flow layer', R.debugAfterF === 'flow');
  A('typing "B" in a text field does not trigger the hotkey', R.debugUnchangedWhileTyping === true);
  A('tab bar is a genuine 2-position phase switch', R.tabCount === 2 && R.tabsOnly2 === true);
  A('Export ▾ header dropdown opens', R.exportMenuOpen === true);
  A('Assets header button enters full-viewport Asset Library mode', R.assetsCanvasHidden === true && R.assetsLibraryShown === true);
  A('clicking Generate exits Assets mode', R.assetsExitedViaGenerate === true);

  console.log('\n' + ok + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
