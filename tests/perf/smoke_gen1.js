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
  // v1.06 (owner: "the seed box back, and the random option"): the setup gate carries a seed input +
  // 🎲 button; typing a seed there must drive state.tect.seed on commit (asserted after the commit
  // below, which types 31337), and the dice must roll a new value into the box.
  R.setupSeed = await page.evaluate(() => {
    const sEl = document.getElementById('suSeedN'), dice = document.getElementById('suSeedRand');
    if (!sEl || !dice) return { present: false };
    sEl.value = '777'; dice.click();
    const diceChanged = String(sEl.value) !== '777' && String(sEl.value).trim() !== '';
    return { present: true, diceChanged };
  });
  // 1d. commit a default world (reset width→800 first so the committed world matches the rest of the suite)
  await page.evaluate(() => {
    const w = document.getElementById('suWidth'); w.value = 800; w.dispatchEvent(new Event('input'));
    document.querySelector('#suResSeg [data-w="512"]').click();   // small = fast commit
    const sEl = document.getElementById('suSeedN'); if (sEl) sEl.value = '31337';   // v1.06: typed seed must land in state.tect.seed
    document.getElementById('suGenCommit').click();
  });
  await page.waitForFunction(() => getComputedStyle(document.getElementById('onboard')).display === 'none', null, { timeout: 60000 });
  await page.waitForFunction(() => { for (let i = 0; i < field.length; i += 997) { if (field[i] !== 0) return true; } return false; }, null, { timeout: 60000 });   // world committed
  R.committed = true;
  R.setupSeedApplied = await page.evaluate(() => (typeof state !== 'undefined' && state.tect) ? state.tect.seed === 31337 : false);
  if (R.setupSeed && R.setupSeed.present === false) R.setupSeedApplied = 'vacuous';   // pre-v1.06 target file
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
  // sidebar Scale & calibration: units toggle present (v0.83: the map-width reference legend was retired
  // along with the width row itself — width lives only in the setup gate now).
  R.sidebarScale = await page.evaluate(() => ({
    unitSeg: document.querySelectorAll('#calUnitSeg button').length,
    noMapwLegend: !document.getElementById('calLegend')
  }));

  // ── v1.07 (borrow-list #1, after Azgaar's FMG per-culture namesbases): culture-flavored
  // settlement naming — a per-faction naming-culture picker, _civSettleName drawing from that
  // culture's own syllable/suffix pool, a manual re-roll button in the settlement editor, and
  // civFactionCulture round-tripping through the same state.civ sync used for faction names.
  R.cultureNaming = await page.evaluate(() => {
    if (typeof CIV_CULTURES === 'undefined' || typeof civFactionCulture === 'undefined') return { present: false };
    const pickerSelects = document.querySelectorAll('#civFactionPicker select').length;
    // give faction 1 an unmistakable culture and sample many generated names for its own suffixes
    const savedCulture1 = civFactionCulture[1];
    civFactionCulture[1] = 'imperial';
    const rng = _civRng(999);
    const sfx = CIV_CULTURES.find(c => c.key === 'imperial').sfx.filter(s => s);
    let hits = 0; const N = 200;
    for (let i = 0; i < N; i++) { const nm = _civSettleName(rng, 1); if (sfx.some(s => nm.endsWith(s))) hits++; }
    // manual re-roll button in the settlement editor draws from the settlement's own faction culture
    const savedPlaces = state.places, savedSel = _civSelectedPlace;
    const p = { x: 10, y: 10, name: 'PreRoll', kind: 'town', klass: 'town', category: 'settlement', faction: 1, pop: 500, traits: [] };
    state.places = [p]; _civSelectedPlace = p; _civRenderPlaceEditor();
    const rollBtn = document.getElementById('_civPeNameRoll');
    const before = p.name;
    if (rollBtn) rollBtn.click();
    const rerolled = !!rollBtn && p.name !== before && p.name.length > 0;
    // civFactionCulture persists through the same state.civ sync civFactionNames already uses
    civFactionCulture[2] = 'desert';
    _civSyncToState();
    const savedArr = state.civ.factionCulture.slice();
    civFactionCulture[2] = 'common';   // corrupt in-memory value on purpose
    _civSyncFromState();
    const restored = civFactionCulture[2] === 'desert';
    civFactionCulture[1] = savedCulture1;
    state.places = savedPlaces; _civSelectedPlace = savedSel; _civRenderPlaceEditor();
    return { present: true, pickerSelects, adherenceRate: hits / N, rollBtnExists: !!rollBtn, rerolled, restored, savedArrLen: savedArr.length };
  });

  // ── v1.08 (borrow-list #2, after Azgaar's FMG heightmap templates): setup-gate world-shape
  // presets. Reuses the existing ARCHETYPES/state.world_structure continentality system (already
  // exposed post-generate in Generate → World → World Structure) but surfaces it as one-click
  // buttons on the setup gate, before the first generate. Runs against the suite's already-
  // committed shared world (reopening the gate via _setupOpen('generate') without re-committing),
  // and restores world_structure/tect exactly afterward so later assertions see an untouched world.
  R.archetypePresets = await page.evaluate(() => {
    if (typeof ARCHETYPES === 'undefined' || typeof _suApplyArchetype !== 'function') return { present: false };
    const wsSnap = JSON.parse(JSON.stringify(state.world_structure));
    const tectSnap = { plates: state.tect.plates, vel: state.tect.vel, tectonicGraph: state.tect.tectonicGraph, foldIntensity: state.tect.foldIntensity, trenchDepth: state.tect.trenchDepth };
    _setupOpen('generate');
    const archSeg = document.getElementById('suArchSeg');
    const buttonCount = archSeg ? archSeg.children.length : 0;
    const classicOnByDefault = !!archSeg && archSeg.querySelector('[data-arc="classic"]').classList.contains('on');
    archSeg.querySelector('[data-arc="supercontinent"]').click();
    const afterPangaea = { enabled: state.world_structure.enabled, archetype: state.world_structure.archetype, continentality: state.world_structure.continentality, tectonicGraph: state.tect.tectonicGraph, buttonOn: archSeg.querySelector('[data-arc="supercontinent"]').classList.contains('on') };
    archSeg.querySelector('[data-arc="classic"]').click();
    const afterClassic = { enabled: state.world_structure.enabled, plates: state.tect.plates, tectonicGraph: state.tect.tectonicGraph, buttonOn: archSeg.querySelector('[data-arc="classic"]').classList.contains('on') };
    _setupOpen('hide');
    Object.assign(state.world_structure, wsSnap);
    Object.assign(state.tect, tectSnap);
    return { present: true, buttonCount, classicOnByDefault, afterPangaea, afterClassic };
  });

  // ── v1.09 (borrow-list #3, after Azgaar's FMG GeoJSON/JSON export): settlements, ways, rivers
  // and faction territory outlines as one GeoJSON FeatureCollection. Snapshots places/ways/
  // territory, builds a fresh populated+territory-painted world for the export, captures the
  // download via a temporary createElement('a') monkeypatch, then restores everything so later
  // assertions see the suite's original shared world untouched.
  R.geoExport = await page.evaluate(() => {
    if (typeof exportGeoJSON !== 'function') return { present: false };
    const placesSnap = state.places, waysSnap = civWays, terrSnap = civTerritory, terrGenSnap = _civTerrGen;
    state.places = []; civWays = [];
    _civAutoWorld();
    civTerritory = new Uint8Array(GW * GH);
    const cx = (GW / 2) | 0, cy = (GH / 2) | 0, R2 = 10;
    let paintedCount = 0;
    for (let dy = -R2; dy <= R2; dy++) for (let dx = -R2; dx <= R2; dx++) {
      if (dx * dx + dy * dy > R2 * R2) continue;
      const x = cx + dx, y = cy + dy; if (x < 0 || x >= GW || y < 0 || y >= GH) continue;
      civTerritory[y * GW + x] = 1; paintedCount++;
    }
    _civTerrGen++;
    let captured = null;
    const realCreateElement = document.createElement.bind(document);
    document.createElement = (tag) => {
      const el = realCreateElement(tag);
      if (tag === 'a') { el.click = () => { captured = { href: el.href, download: el.download }; }; }
      return el;
    };
    return exportGeoJSON().then(async () => {
      document.createElement = realCreateElement;
      const restore = () => { state.places = placesSnap; civWays = waysSnap; civTerritory = terrSnap; _civTerrGen = terrGenSnap + 1; };
      if (!captured) { restore(); return { present: true, ok: false }; }
      const resp = await fetch(captured.href);
      const fc = JSON.parse(await resp.text());
      restore();
      const byLayer = {};
      for (const f of fc.features) (byLayer[f.properties.layer] = byLayer[f.properties.layer] || []).push(f);
      const cellKm = state.mapWidthKm / GW, expectedAreaKm2 = paintedCount * cellKm * cellKm;
      const ringArea = (ring) => { let s = 0; for (let i = 0; i < ring.length - 1; i++) s += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1]; return Math.abs(s / 2); };
      let territoryAreaKm2 = 0; const terrFeat = (byLayer.territory || [])[0];
      if (terrFeat) for (const poly of terrFeat.geometry.coordinates) { territoryAreaKm2 += ringArea(poly[0]); for (let h = 1; h < poly.length; h++) territoryAreaKm2 -= ringArea(poly[h]); }
      return {
        present: true, ok: true, download: captured.download, isFC: fc.type === 'FeatureCollection', hasNote: !!(fc.properties && fc.properties.note),
        hasSettlements: (byLayer.settlement || []).length > 0, hasWays: (byLayer.way || []).length > 0, hasRivers: (byLayer.river || []).length > 0,
        territoryGeomType: terrFeat ? terrFeat.geometry.type : null, areaRatio: terrFeat ? territoryAreaKm2 / expectedAreaKm2 : null
      };
    }).catch(e => { document.createElement = realCreateElement; state.places = placesSnap; civWays = waysSnap; civTerritory = terrSnap; _civTerrGen = terrGenSnap + 1; return { present: true, ok: false, error: e.message }; });
  });

  // ── v1.10 (borrow-list #4, after FMG provinces — "a mid-tier region between faction and
  // settlement" — plus a scoped-down optional religions layer): auto-subdivides a faction's
  // territory into one province per city-tier+ settlement (falling back to a single province
  // seeded by the biggest settlement when there's no city+), renders a per-province tint
  // (opt-in), and gives each faction a simple categorical state religion (not a spatial spread
  // simulation — the research doc itself flags that half as optional). Builds two synthetic
  // faction territories (one with 2 city-tier seeds, one with only a village) so both the
  // subdivided and single-province-fallback paths are exercised, and checks GeoJSON province
  // export tiles the parent territory with no gaps/overlaps (combined province area == territory
  // area). Snapshots/restores places/ways/territory/province/religion so later assertions see
  // the suite's original shared world untouched.
  R.provinces = await page.evaluate(() => {
    if (typeof _civGenerateProvinces !== 'function' || typeof CIV_RELIGIONS === 'undefined') return { present: false };
    const placesSnap = state.places, waysSnap = civWays, terrSnap = civTerritory, terrGenSnap = _civTerrGen;
    const provSnap = civProvince, provListSnap = CIV_PROVINCES, provGenSnap = _civProvGen, religionSnap = civFactionReligion.slice();
    const stampDisc = (cx, cy, R2, fid) => { for (let dy = -R2; dy <= R2; dy++) for (let dx = -R2; dx <= R2; dx++) { if (dx * dx + dy * dy > R2 * R2) continue; const x = cx + dx, y = cy + dy; if (x < 0 || x >= GW || y < 0 || y >= GH) continue; civTerritory[y * GW + x] = fid; } };
    civTerritory = new Uint8Array(GW * GH);
    stampDisc((GW * 0.3) | 0, (GH * 0.5) | 0, 30, 1);
    stampDisc((GW * 0.75) | 0, (GH * 0.5) | 0, 15, 2);
    _civTerrGen++;
    state.places = []; civWays = [];
    const mk = (x, y, kind, faction, name) => ({ x, y, kind, klass: kind, category: 'settlement', faction, name, pop: 1000, traits: [] });
    state.places.push(mk((GW * 0.3 - 15) | 0, (GH * 0.5) | 0, 'city', 1, 'Alpha'));
    state.places.push(mk((GW * 0.3 + 15) | 0, (GH * 0.5 - 15) | 0, 'city', 1, 'Beta'));
    state.places.push(mk((GW * 0.75) | 0, (GH * 0.5) | 0, 'village', 2, 'Delta'));
    _civGenerateProvinces();
    const prov1 = CIV_PROVINCES.filter(p => p.faction === 1), prov2 = CIV_PROVINCES.filter(p => p.faction === 2);
    let crossFactionLeak = false;
    for (let i = 0; i < civProvince.length; i++) { const pv = civProvince[i]; if (!pv) continue; const prov = CIV_PROVINCES.find(p => p.id === pv); if (prov.faction !== civTerritory[i]) { crossFactionLeak = true; break; } }
    // rendering diff BEFORE the religion sync-restore below (which deliberately clears the
    // non-persisted province cache, same as loading a project)
    state.viz.provinces = false; renderNow();
    const before = civCtx.getImageData(0, 0, civCanvas.width, civCanvas.height).data.slice();
    state.viz.provinces = true; drawCivLayerAuto(); renderNow();
    const after = civCtx.getImageData(0, 0, civCanvas.width, civCanvas.height).data;
    let diffPx = 0; for (let i = 0; i < before.length; i += 4) if (before[i] !== after[i] || before[i + 1] !== after[i + 1] || before[i + 2] !== after[i + 2]) diffPx++;
    // GeoJSON province export tiles the parent territory (combined area == territory area)
    let captured = null;
    const realCreateElement = document.createElement.bind(document);
    document.createElement = (tag) => { const el = realCreateElement(tag); if (tag === 'a') { el.click = () => { captured = { href: el.href }; }; } return el; };
    return exportGeoJSON().then(async () => {
      document.createElement = realCreateElement;
      const resp = await fetch(captured.href);
      const fc = JSON.parse(await resp.text());
      const provFeats = fc.features.filter(f => f.properties.layer === 'province');
      const ringArea = (ring) => { let s = 0; for (let i = 0; i < ring.length - 1; i++) s += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1]; return Math.abs(s / 2); };
      let provAreaKm2 = 0; for (const f of provFeats) for (const poly of f.geometry.coordinates) { provAreaKm2 += ringArea(poly[0]); for (let h = 1; h < poly.length; h++) provAreaKm2 -= ringArea(poly[h]); }
      let paintedCells = 0; for (let i = 0; i < civTerritory.length; i++) if (civTerritory[i]) paintedCells++;
      const cellKm = state.mapWidthKm / GW, territoryAreaKm2 = paintedCells * cellKm * cellKm;
      // religion: picker DOM presence + persistence round-trip
      civFactionReligion[1] = 'sun_cult'; civFactionReligion[2] = 'sea_lords';
      _civBuildFactionPicker();
      const religionSelects = document.querySelectorAll('#civFactionPicker select[title="State religion"]').length;
      _civSyncToState();
      const savedReligionLen = state.civ.factionReligion.length;
      civFactionReligion[1] = 'none';
      _civSyncFromState();
      const religionRestored = civFactionReligion[1] === 'sun_cult' && civFactionReligion[2] === 'sea_lords';
      state.places = placesSnap; civWays = waysSnap; civTerritory = terrSnap; _civTerrGen = terrGenSnap + 1;
      civProvince = provSnap; CIV_PROVINCES = provListSnap; _civProvGen = provGenSnap + 1; civFactionReligion = religionSnap;
      _civBuildFactionPicker();
      return {
        present: true, ok: true, prov1Count: prov1.length, prov2Count: prov2.length, prov2Name: prov2[0] && prov2[0].name,
        crossFactionLeak, diffPx, provFeatCount: provFeats.length, provGeomTypes: [...new Set(provFeats.map(f => f.geometry.type))],
        areaRatio: provAreaKm2 / territoryAreaKm2, religionSelects, savedReligionLen, religionRestored
      };
    }).catch(e => {
      document.createElement = realCreateElement;
      state.places = placesSnap; civWays = waysSnap; civTerritory = terrSnap; _civTerrGen = terrGenSnap + 1;
      civProvince = provSnap; CIV_PROVINCES = provListSnap; _civProvGen = provGenSnap + 1; civFactionReligion = religionSnap;
      _civBuildFactionPicker();
      return { present: true, ok: false, error: e.message };
    });
  });

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
  // (b) map scale is a creation-time-only decision: v0.70 kept a disabled read-only #mapw copy in the
  //     sidebar; v0.83 removed that duplicate entirely (the width input now lives only in the setup gate,
  //     #suWidth/#suWidth2), and state.mapWidthKm still can't be changed from the sidebar (no live control
  //     writes it — a full generate() leaves it untouched).
  R.scaleLocked = await page.evaluate(() => {
    const beforeKm = state.mapWidthKm;
    const noSidebarInput = !document.getElementById('mapw');
    const gateInputsExist = !!document.getElementById('suWidth') && !!document.getElementById('suWidth2');
    generate();
    return noSidebarInput && gateInputsExist && state.mapWidthKm === beforeKm;
  });
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
  R.lodView = await page.evaluate(async () => {
    const lc = document.getElementById('lodChk'); lc.checked = true; lc.dispatchEvent(new Event('change'));
    _lodZoom = 4; renderNow();                       // overview render → caches an overview canvas
    const cachedAfterFirst = !!_lodOverviewPrev && !!_lodOverviewPrev.key;
    const t0 = performance.now(); renderNow();       // second draw at the same view: overview reuse path
    const secondMs = performance.now() - t0;
    await refineVisibleTiles(); renderNow();         // refine visible tiles (featureDetailPass runs inside) then draw → tile canvases cached
    const tileCacheN = _lodTileCanvasCache.size;
    lc.checked = false; lc.dispatchEvent(new Event('change'));
    return { cachedAfterFirst, secondMs: +secondMs.toFixed(1), tileCacheN, ok: true };
  });
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
  // v0.81: the regional-population readout is now AUTO-filled by auto-populate (no user button). Run a
  //        populate, confirm the readout shows a number, then restore clean civ state.
  R.popAuto = await page.evaluate(() => {
    const out = document.getElementById('civPopEstimateOut'); if (!out) return null;
    const noButton = !document.getElementById('civPopEstimateBtn');
    if (typeof _civAutoWorld === 'function') _civAutoWorld();
    const filled = /sustain|settle/i.test(out.textContent) && /\d/.test(out.textContent);
    // capacity-grounded, map-size-dependent per-settlement pops (all positive, tier hierarchy sane)
    const settles = state.places.filter(p => p && p.category === 'settlement');
    const allPos = settles.length > 0 && settles.every(p => p.pop > 0);
    state.places = []; if (typeof civWays !== 'undefined') civWays = []; if (typeof civJourneys !== 'undefined') civJourneys = [];
    if (typeof _civRenderSettlementList === 'function') _civRenderSettlementList();
    if (typeof _civRenderWayList === 'function') _civRenderWayList();
    if (typeof renderNow === 'function') renderNow();
    return { autoFilled: filled, noButton, allPos };
  });
  // v0.82: post-collapse recovery — Survival phase (I) scales population far below Stable and collapses
  //        over-large nuclei into fortified ruins. Deterministic test of the pure helper + the populate pass.
  R.recovery = await page.evaluate(() => {
    if (typeof _civApplyRecovery !== 'function' || typeof _civTierForPopulation !== 'function') return null;
    // pure helper: an 8000-pop city, scaled by Survival (~4–10%), demotes below the city floor and gains ruins
    const rng = () => 0.5;
    const city = { category: 'settlement', kind: 'city', klass: 'city', pop: 8000, traits: [] };
    const out = _civApplyRecovery([city], 1, rng, { dropThresh: 0 });
    const demoted = out[0] && out[0].kind !== 'city' && out[0].pop < 8000 && out[0].ruins === true;
    const tierFn = _civTierForPopulation(300) === 'village' && _civTierForPopulation(20000) === 'city';
    // integration: Survival total « Stable total on the committed world
    _civRecoveryPhase = 0; _civAutoWorld();
    const stable = state.places.filter(p => p.category === 'settlement').reduce((t, p) => t + p.pop, 0);
    _civRecoveryPhase = 1; _civAutoWorld();
    const survS = state.places.filter(p => p.category === 'settlement');
    const surv = survS.reduce((t, p) => t + p.pop, 0);
    const someRuins = survS.some(p => p.ruins);
    _civRecoveryPhase = 0;
    state.places = []; if (typeof civWays !== 'undefined') civWays = []; if (typeof civJourneys !== 'undefined') civJourneys = [];
    if (typeof _civRenderSettlementList === 'function') _civRenderSettlementList();
    if (typeof renderNow === 'function') renderNow();
    return { demoted, tierFn, collapses: surv < stable * 0.5, someRuins, stable, surv };
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
  // v0.78: transport transfer/handling overhead (§5c) — deterministic test of the pure helpers.
  R.transfer = await page.evaluate(() => {
    const T = (typeof _civTransshipments === 'function') ? _civTransshipments : null;
    const O = (typeof _civTransferOverhead === 'function') ? _civTransferOverhead : null;
    if (!T || !O) return null;
    return {
      landOnly: T([{ cat: 'land' }, { cat: 'land' }]),                                             // 0 mode-changes
      oneCross: T([{ cat: 'land' }, { cat: 'sea' }]),                                               // 1
      landSeaLand: T([{ cat: 'land' }, { cat: 'sea' }, { cat: 'land' }]),                           // 2
      multi: T([{ cat: 'land' }, { cat: 'sea' }, { cat: 'land' }, { cat: 'river' }, { cat: 'land' }]), // 4
      ov0: O(0),
      ovCompound: Math.abs(O(2) - (Math.pow(1.05, 2) - 1)) < 1e-9,
      ovMonotone: O(4) > O(2) && O(2) > O(1) && O(1) > O(0),
    };
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
  //        out of the collapsed Atlas cache accordion (v0.92: split out of the old single
  //        "Tiles & LOD" accordion). Checked while not finalized so the bake button is visible
  //        (applyFinalizedUI hides it once finalized).
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
  // v0.90: settlements/POIs moved out to the map pop-up (owner request); the sidebar empty-state hint
  // was reworded accordingly (no longer promises "select a settlement... to see it here").
  R.inspectorEmptyState = await page.$eval('#inspectorBody', el => el.textContent.includes('label or icon') && !el.textContent.includes('Select a settlement'));

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

  // v0.92 (owner report: "Clear places... leaves the routes" — ways carry no settlement-id
  // reference, so a route to a deleted place doesn't error, it just silently keeps drawing a road
  // to nowhere). Clear places & routes must wipe civWays/civJourneys along with state.places, same
  // click. If this run's random seed happens to yield zero auto-populated settlements (matches this
  // suite's existing no-retry convention for auto-populate elsewhere), hadWaysBefore is false and
  // the assertion below treats the case as vacuously satisfied. Re-seeds the single-test-place
  // fixture afterward (same shape the block above left behind) since the very next section relies
  // on state.places[0] existing.
  const before = await page.evaluate(() => {
    state.places = [];
    _civAutoWorld();
    if (typeof _civAutoRoutes === 'function') _civAutoRoutes();
    return { places: state.places.length, ways: civWays.length };
  });
  let clearAccepted = false;
  const hAccept = async d => { clearAccepted = true; await d.accept(); };
  page.on('dialog', hAccept);
  await page.evaluate(() => document.getElementById('civClearPlacesBtn').click());
  await page.waitForTimeout(150);
  page.off('dialog', hAccept);
  const after = await page.evaluate(() => ({ places: state.places.length, ways: civWays.length, journeys: civJourneys.length }));
  R.clearPlacesAlsoClearsRoutes = {
    hadWaysBefore: before.ways > 0,
    dialogAccepted: clearAccepted,
    placesCleared: after.places === 0,
    waysCleared: after.ways === 0,
    journeysCleared: after.journeys === 0,
  };
  await page.evaluate(() => { state.places.push({x:10,y:10,name:'Test',kind:'town',faction:0,pop:100,traits:[]}); });

  // v1.02 (owner: "sometimes ways don't connect — they stop just short of a location"): the land
  // network's corridor consolidation could start a road a routing-cell out at a downsampled cell
  // centre, offset from the pin. Regression guard: every visible land way endpoint that belongs to a
  // settlement (its aIdx/bIdx) lands EXACTLY on the pin — 0 "stops just short" endpoints, > 0 exact.
  R.waysReachSettlements = await page.evaluate(() => {
    state.places = [];
    _civAutoWorld();
    const settles = state.places.filter(p => p.kind && CIV_SETTLE_KEYS.has(p.kind));
    if (settles.length < 3) return { vacuous: true, short: 0, exact: 0 };
    let short = 0, exact = 0;
    for (const w of civWays) {
      if (w.sea || w.hidden || !w.pts || w.pts.length < 2 || w.aIdx == null || w.bIdx == null) continue;
      const A = settles[w.aIdx], B = settles[w.bIdx];
      for (const end of [w.pts[0], w.pts[w.pts.length - 1]]) {
        const ex = Array.isArray(end) ? end[0] : end.x, ey = Array.isArray(end) ? end[1] : end.y;
        let md2 = Infinity; for (const P of [A, B]) { if (!P) continue; const dd = (ex - P.x) * (ex - P.x) + (ey - P.y) * (ey - P.y); if (dd < md2) md2 = dd; }
        if (md2 <= 0.04) exact++; else if (md2 <= 25) short++;   // <=0.2 cell exact; 0.2–5 cells "short"
      }
    }
    return { vacuous: false, short, exact };
  });
  await page.evaluate(() => { state.places = [{x:10,y:10,name:'Test',kind:'town',category:'settlement',faction:0,pop:100,traits:[]}]; });

  // ---- v0.65 (§4.7, complete): pinned inspector hosts the label/icon edit form; single selection ----
  // v0.90 (owner request: "editing a settlement should open a pop-up in the viewscreen"): a selected
  // place now opens #placeEditPopup floating over the map instead of rendering into #inspectorBody —
  // labels/icons are unchanged (still the sidebar-pinned inspector).
  // v1.16: the sidebar settlement list was replaced by the virtualized Settlements-page table
  // (#stSpacer) — switch to that sub-page so the table is populated before checking it.
  await page.evaluate(() => {
    document.querySelector('#genSubBar [data-gsub="civ"]').click();
    document.querySelector('#civSubBar [data-civsub="settlements"]').click();
    _civSelectedPlace = state.places[0]; _civRenderPlaceEditor();
  });
  await page.waitForTimeout(100);
  R.editorInPopup = await page.$eval('#placeEditPopup', el => !!el.querySelector('#_civPeName') && el.style.display === 'block');
  R.editorNotInInspector = await page.$eval('#inspectorBody', el => !el.querySelector('#_civPeName'));
  R.popupOnScreen = await page.evaluate(() => { const r = document.getElementById('placeEditPopup').getBoundingClientRect(); return r.x >= 0 && r.x < window.innerWidth && r.y >= 0 && r.y < window.innerHeight; });
  R.noInlineEditorInList = await page.evaluate(() => document.getElementById('stSpacer').querySelector('#_civPeName') === null);
  await page.fill('#_civPeName', 'Renamed');
  await page.dispatchEvent('#_civPeName', 'input');
  await page.waitForTimeout(100);
  R.liveModelUpdate = await page.evaluate(() => state.places[0].name === 'Renamed');
  R.liveRowPatch = await page.evaluate(() => document.getElementById('stSpacer').textContent.includes('Renamed'));
  await page.evaluate(() => {
    state.labels.push({x:5,y:5,name:'ALabel'});
    _civSelectLabel(state.labels[0]);
  });
  await page.waitForTimeout(100);
  R.labelEditorSwapsIn = await page.$eval('#inspectorBody', el => !!el.querySelector('#_carLeName'));
  R.selectingLabelDeselectsPlace = await page.evaluate(() => _civSelectedPlace === null);
  R.selectingLabelClosesPlacePopup = await page.$eval('#placeEditPopup', el => el.style.display === 'none');
  await page.evaluate(() => { _civSelectedPlace = state.places[0]; _civRenderPlaceEditor(); });
  await page.waitForTimeout(100);
  R.selectingPlaceDeselectsLabel = await page.evaluate(() => _civSelectedLabel === null);
  // v0.90: the × close button deselects the place and hides the popup
  await page.click('#placeEditPopup .si-close');
  await page.waitForTimeout(100);
  R.popupCloseButtonWorks = await page.evaluate(() => _civSelectedPlace === null) && await page.$eval('#placeEditPopup', el => el.style.display === 'none');

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
  // v0.90: the place pop-up (and its #_civPeName field) was closed by the × button test above — reselect
  // to reopen it before using that field for the "typing doesn't trigger hotkeys" check below.
  await page.evaluate(() => { _civSelectedPlace = state.places[0]; _civRenderPlaceEditor(); });
  await page.waitForTimeout(100);
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
  await page.click('#fileMenuBtn');   // v0.87: Import+Export consolidated into one "File ▾" menu
  await page.waitForTimeout(150);
  R.fileMenuOpen = await page.$eval('#fileMenu', el => el.classList.contains('open'));
  // Export section (form) present + Import actions present in the same menu; ticking a form checkbox
  // keeps the menu open (only single-shot import/export buttons close it).
  R.fileMenuHasBoth = await page.evaluate(() => {
    const m = document.getElementById('fileMenu');
    const hasImport = !!m.querySelector('#loadZipBtn') && !!m.querySelector('#packBtn');
    const hasExport = !!m.querySelector('#exportBtn') && !!m.querySelector('#bakeRes');
    const cb = m.querySelector('#bakeTiles'); cb.click();   // toggling a form control must NOT close the menu
    const stillOpen = m.classList.contains('open'); cb.click();
    return { hasImport, hasExport, stillOpenAfterFormClick: stillOpen };
  });
  // v0.88 (owner report: "export/import take the atlas separately"): the standalone atlas-only round-trip
  // is retired — "Load project .zip…"/"Export .zip" are the sole 100% import/export actions now.
  R.atlasStandaloneGone = await page.evaluate(() => ({
    noImportBtnInFileMenu: !document.getElementById('fileMenu').querySelector('#atlasImportBtn'),
    noEmbedCheckbox: !document.getElementById('embedAtlasChk'),
    noExportBtnInSidebar: !document.getElementById('atlasExportBtn'),
    packStillInAssetsLibrary: !!document.getElementById('alImportPackBtn') && !!document.getElementById('alExportBtn')
  }));

  // v0.92 (save-export-architecture-audit.md §5A): exportZip() now (1) only includes layers/*.png when
  // the new opt-in checkbox is ticked (previously unconditional) and (2) skips the redundant map.png/
  // tiles bake for a FINALIZED world (whose Atlas pyramid already covers the whole map at every baked
  // level). Verified by capturing the real entries array zipStore() receives — monkey-patched around a
  // real exportZip() call, since trusting a browser download would need base64-roundtripping the whole
  // zip through page.evaluate for no extra confidence. Only one of the two calls below (the first) pays
  // for the real per-pixel map bake; the second is the finalized skip-bake fast path.
  R.exportTrim = await page.evaluate(async () => {
    const capture = async () => {
      let names = null;
      const orig = zipStore;
      zipStore = (entries) => { names = entries.map(e => e.name); return orig(entries); };
      try { await exportZip(); } finally { zipStore = orig; }
      return names;
    };
    document.getElementById('bakeRes').value = '2048';
    document.getElementById('bakeTiles').checked = false;
    const lp = document.getElementById('layersPreviewChk');
    lp.checked = false; setFinalized(false);
    const namesDefault = await capture();
    lp.checked = true; setFinalized(true);
    const namesFinalizedWithLayers = await capture();
    lp.checked = false; setFinalized(false);
    return {
      noLayersByDefault: !namesDefault.includes('layers/biome.png'),
      mapPngWhenNotFinalized: namesDefault.includes('map.png'),
      layersWhenChecked: ['layers/biome.png', 'layers/hillshade.png', 'layers/temperature.png', 'layers/rainfall.png'].every(n => namesFinalizedWithLayers.includes(n)),
      noMapPngWhenFinalized: !namesFinalizedWithLayers.includes('map.png') && !namesFinalizedWithLayers.some(n => n.startsWith('tiles/')),
    };
  });

  // v0.92 (save-export-architecture-audit.md §5B): the old single "Tiles & LOD" accordion (which
  // bundled the live zoom view, the Atlas bake cache, and the standalone region-export flow under one
  // label) is now three separately-labeled top-level sections. All element ids from the old accordion
  // must still resolve (no JS wiring changed) and none of the summaries should still read "Tiles & LOD".
  R.tilesLodSplit = await page.evaluate(() => {
    const summaries = [...document.querySelectorAll('#genWorld > .sec > details.cat-acc > summary, #genWorld details.cat-acc > summary')].map(s => s.textContent.trim());
    const idsPresent = ['lodChk', 'lodAutoChk', 'zoomDetailR', 'lodTileSeg', 'lodLevels', 'lodRefineBtn', 'lodBurnChk', 'lodMicroChk',
      'lodBakeBtn', 'lodClearAtlasBtn', 'atlasStat', 'lodDbgSeg',
      'refCols', 'refRows', 'refSize', 'refGzip', 'lodShowGrid', 'regionBtn', 'refineBtn'].every(id => !!document.getElementById(id));
    return {
      hasThreeLabels: summaries.includes('Tiled LOD view') && summaries.includes('Atlas cache') && summaries.includes('Region export'),
      noOldCombinedLabel: !summaries.includes('Tiles & LOD'),
      allIdsStillResolve: idsPresent,
    };
  });

  await page.click('#assetsHeaderBtn');
  await page.waitForTimeout(250);
  R.assetsCanvasHidden = await page.$eval('.canvas-wrap', el => getComputedStyle(el).display === 'none');
  R.assetsLibraryShown = await page.$eval('#assetLibrary', el => getComputedStyle(el).display !== 'none');
  await page.click('[data-tab="generate"]');
  await page.waitForTimeout(200);
  R.assetsExitedViaGenerate = await page.$eval('.canvas-wrap', el => getComputedStyle(el).display !== 'none');

  // ---- v0.85: collapse-timeline simulator (docs/research/collapse-timeline-dynamics.md) ----
  // Pure-function correctness on a small synthetic settlement graph, independent of the world's own
  // layout (mirrors the v0.75/v0.82 pattern above — deterministic local arrays, no state.places).
  R.collapseSim = await page.evaluate(() => {
    const synth = () => ([
      { tid: 1, x: 60, y: 60, pop: 20000, category: 'settlement', kind: 'city', klass: 'city', traits: [] },
      { tid: 2, x: 55, y: 60, pop: 3000, category: 'settlement', kind: 'town', klass: 'town', traits: [] },
      { tid: 3, x: 65, y: 60, pop: 3000, category: 'settlement', kind: 'town', klass: 'town', traits: [] },
      { tid: 4, x: 60, y: 55, pop: 800, category: 'settlement', kind: 'village', klass: 'village', traits: [] },
      { tid: 5, x: 60, y: 65, pop: 800, category: 'settlement', kind: 'village', klass: 'village', traits: [] },
      { tid: 6, x: 5, y: 5, pop: 200, category: 'settlement', kind: 'hamlet', klass: 'hamlet', traits: [] },
    ]);
    const cellKm = (state.mapWidthKm || 800) / GW;
    const places85 = synth();
    const adj85 = _civProximityAdjacency(places85, 4, cellKm * GW * 0.5, cellKm);
    const btw85 = _civBetweennessFromAdjacency(places85.length, adj85);
    const hubMaxBtw = btw85[0] === Math.max(...btw85) && btw85[0] > 0;

    const maxPop85 = Math.max(...places85.map(p => p.pop));
    const stressHamletConflict = _civSettlementStress(places85[5], 0.05, null, maxPop85, 'conflict');
    const stressCityConflict = _civSettlementStress(places85[0], 0.9, null, maxPop85, 'conflict');
    const conflictHitsUndefended = stressHamletConflict > stressCityConflict;

    const lo = _civMortalityMigrationRates(0.2, 0.3, 'mixed'), hi = _civMortalityMigrationRates(0.9, 0.9, 'mixed');
    const ratesMonotonic = hi.m > lo.m && hi.g > lo.g;
    const capped = _civMortalityMigrationRates(1, 1, 'conflict');
    const ratesCapped = capped.m <= _CIV_COLLAPSE_MAX_MORTALITY + 1e-9 && capped.g <= _CIV_COLLAPSE_MAX_MIGRATION * _CIV_COLLAPSE_MIGRATION_BIAS.conflict + 1e-9;

    const migPlaces = [{ x: 0, y: 0, pop: 0, kind: 'hamlet', traits: [] }, { x: 2, y: 0, pop: 0, kind: 'town', traits: [] }, { x: 20, y: 0, pop: 0, kind: 'town', traits: [] }];
    const pool85 = 1000, cap85 = [0, 5000, 5000];
    const gm = _civGravityMigrate(migPlaces, i => (i === 0 ? pool85 : 0), cap85, 1);
    const massConserved = Math.abs((gm.received[1] + gm.received[2] + gm.unplaced) - pool85) < 1e-6;
    const distanceDecay = gm.received[1] > gm.received[2];

    const stepA = _civCollapseStep(synth(), { character: 'conflict', severity: 0.95, stepYears: 10 });
    const stepB = _civCollapseStep(synth(), { character: 'conflict', severity: 0.95, stepYears: 10 });
    const deterministic = JSON.stringify(stepA.places) === JSON.stringify(stepB.places);
    const popBefore = synth().filter(p => p.category === 'settlement').reduce((s, p) => s + p.pop, 0);
    const popAfter = stepA.places.filter(p => p.category === 'settlement').reduce((s, p) => s + p.pop, 0);
    const collapseReducesPop = popAfter < popBefore;

    // Recovery ceiling is geography-derived (currentCarryingCapacity() at the place's real x,y), so a
    // fixed synthetic coordinate could legitimately sit on near-zero-capacity terrain depending on the
    // world's random seed. Use a REAL auto-populated settlement's coordinates instead (guaranteed valid,
    // food-producing land by construction of the placement algorithm), starting it at 10% of its own
    // (normB:0) local ceiling so growth toward that same ceiling is unambiguous.
    _civAutoWorld();
    const realSettlement = state.places.find(p => p && p.category === 'settlement');
    const K85 = currentCarryingCapacity();
    const recoverProbe = { ...realSettlement, pop: Math.max(1, Math.round(_civSettlementPopulation(realSettlement, K85, { normB: 0 }) * 0.1)) };
    const recoverOut = _civRecoveryGrowthStep([recoverProbe], { rate: 0.05, stepYears: 10 });
    const recoveryGrows = recoverOut.places[0].pop > recoverProbe.pop;

    const traj = _civSimulateTimeline(synth(), { mode: 'collapse', character: 'disease', severity: 0.9, steps: 5, stepYears: 10 });
    const popSeries = traj.map(s => s.places.filter(p => p.category === 'settlement').reduce((sum, p) => sum + (p.pop || 0), 0));
    let monotonic = true; for (let i = 1; i < popSeries.length; i++) if (popSeries[i] > popSeries[i - 1] + 1e-6) monotonic = false;

    // audit fix: rates are ANNUAL and compound over the step — a 10-year step must kill more than a
    // 1-year step at identical severity (previously both applied the rate exactly once)
    const step1y = _civCollapseStep(synth(), { character: 'conflict', severity: 0.95, stepYears: 1 });
    const compounding = stepA.stats.died > step1y.stats.died;
    // audit fix: the returned baseline map is keyed by tid over the INPUT settlements — every input tid
    // present (failed ones included) and the hub's normalised betweenness pinned at the 1.0 maximum
    // (previously the map was built by pairing the FILTERED output array against unfiltered normB indices)
    const synth7 = synth().concat([{ tid: 7, x: 40, y: 40, pop: 25, category: 'settlement', kind: 'hamlet', klass: 'hamlet', traits: [] }]);
    const step7 = _civCollapseStep(synth7, { character: 'conflict', severity: 0.95, stepYears: 10 });
    const baselineContract = step7.normBByTid.size === 7 && step7.normBByTid.has(7) && Math.abs(step7.normBByTid.get(1) - 1) < 1e-9;
    // audit fix (doc §5): overflow at a saturated destination re-flows to remaining open headroom;
    // unplaced counts only what exceeds the system's TOTAL remaining headroom
    const gmSat = _civGravityMigrate(migPlaces, i => (i === 0 ? pool85 : 0), [0, 300, 5000], 1);
    const overflowReflows = Math.abs(gmSat.received[1] - 300) < 1e-6 && gmSat.unplaced < 1
      && Math.abs((gmSat.received[1] + gmSat.received[2] + gmSat.unplaced) - pool85) < 1e-6;

    return { hubMaxBtw, conflictHitsUndefended, ratesMonotonic, ratesCapped, massConserved, distanceDecay, deterministic, collapseReducesPop, recoveryGrows, monotonicDecline: monotonic, trajLen: traj.length, compounding, baselineContract, overflowReflows };
  });

  // UI wiring: mode toggle swaps rows, slider updates its live label, and clicking Simulate writes
  // civTimeline entries WITHOUT touching state.places/civWays (the architectural invariant every other
  // timeline write already follows).
  await page.evaluate(() => document.querySelector('#genSubBar [data-gsub="civ"]').click());
  await page.waitForTimeout(150);
  R.collapseSimUI = await page.evaluate(() => {
    _civAutoWorld();
    // pre-assign tids so the equality check below isn't noise from civSnapshotSave's own
    // _civAssignTid pass (which civAddYear does too, on every place AND every way — pre-existing).
    for (const p of state.places) _civAssignTid(p);
    for (const w of civWays) _civAssignTid(w);
    civYear = 0; civTimeline.length = 0;
    const placesBefore = JSON.stringify(state.places), waysBefore = JSON.stringify(civWays);

    const modeSel = document.getElementById('civSimMode'), charRow = document.getElementById('civSimCharRow'), rateRow = document.getElementById('civSimRateRow');
    const collapseCharRowShown = getComputedStyle(charRow).display !== 'none';
    const collapseRateRowHidden = getComputedStyle(rateRow).display === 'none';
    modeSel.value = 'recovery'; modeSel.dispatchEvent(new Event('change'));
    const recoveryCharRowHidden = getComputedStyle(charRow).display === 'none';
    const recoveryRateRowShown = getComputedStyle(rateRow).display !== 'none';
    modeSel.value = 'collapse'; modeSel.dispatchEvent(new Event('change'));

    const sev = document.getElementById('civSimSeverity'), sevV = document.getElementById('civSimSeverityV');
    sev.value = 80; sev.dispatchEvent(new Event('input'));
    const severityLabelUpdates = sevV.textContent === '80%';

    document.getElementById('civSimStartYear').value = 0;
    document.getElementById('civSimDuration').value = 50;
    document.getElementById('civSimStepYears').value = 10;
    document.getElementById('civSimCharacter').value = 'conflict';

    document.getElementById('civSimulateBtn').click();

    const newEntries = civTimeline.filter(e => e.year > 0 && e.year <= 50);
    const timelineGotFiveSteps = newEntries.length === 5;
    const stepsHaveSettlements = newEntries.every(e => Array.isArray(e.places) && e.places.length > 0);
    const placesUntouched = JSON.stringify(state.places) === placesBefore;
    const waysUntouched = JSON.stringify(civWays) === waysBefore;
    const outHasStats = /died|migrated|failed/i.test(document.getElementById('civSimOut').textContent);

    // clean up: this is the last civ-state-dependent block in the suite, but restore anyway for hygiene
    civTimeline.length = 0; state.places = []; civWays = [];
    if (typeof _civRenderSettlementList === 'function') _civRenderSettlementList();
    if (typeof renderNow === 'function') renderNow();

    return { collapseCharRowShown, collapseRateRowHidden, recoveryCharRowHidden, recoveryRateRowShown, severityLabelUpdates, timelineGotFiveSteps, stepsHaveSettlements, placesUntouched, waysUntouched, outHasStats };
  });

  // audit fixes in the Simulate wiring: no phantom year-0 era on an empty timeline (civAddYear's v0.62
  // guard), and authored years inside the simulated span are confirm-guarded — Playwright auto-dismisses
  // the confirm(), which must abort the simulation and leave the existing entries untouched.
  R.collapseSimUI2 = await page.evaluate(() => {
    _civAutoWorld();
    civYear = 0; civTimeline.length = 0;
    document.getElementById('civSimMode').value = 'collapse';
    document.getElementById('civSimStartYear').value = 100;
    document.getElementById('civSimDuration').value = 30;
    document.getElementById('civSimStepYears').value = 10;
    document.getElementById('civSimulateBtn').click();
    const noPhantomZero = !civTimeline.some(e => e.year === 0)
      && !!civTimeline.find(e => e.year === 100) && !!civTimeline.find(e => e.year === 130);
    civTimeline.find(e => e.year === 110).places = [{ name: 'PROBE' }];   // sentinel an "authored" year
    document.getElementById('civSimulateBtn').click();                    // same span → confirm → dismissed → abort
    const e110 = civTimeline.find(e => e.year === 110);
    const overwriteGuarded = !!(e110 && e110.places.length === 1 && e110.places[0].name === 'PROBE');
    civTimeline.length = 0; state.places = []; civWays = [];
    if (typeof _civRenderSettlementList === 'function') _civRenderSettlementList();
    if (typeof renderNow === 'function') renderNow();
    return { noPhantomZero, overwriteGuarded };
  });

  // ---- v0.91 (owner request: "one home, real time-scale") ----
  // Authoring (Add year/pills), scrubbing (slider+playback) and the collapse/recovery simulator all
  // live in Explore → Timeline now — Civilization → Polity no longer has its own copy, and the old
  // index-based slider (min=0, max=snapshot-count-1) was replaced with a real year-value scale.
  R.timelineOneHome = await page.evaluate(() => {
    const singleHome = !document.getElementById('civTlSlider') && !document.getElementById('civTlSliderRow');
    const sec = document.getElementById('explTimelineSection');
    const controlsInExplore = !!(sec && sec.querySelector('#civTlYear') && sec.querySelector('#civTlAddYearBtn')
      && sec.querySelector('#civTimelinePanel') && sec.querySelector('#civSimulateBtn') && sec.querySelector('#explTimelineSlider'));
    // v1.16: Civilization → Polity was folded into Generation → Territories by the sub-page redesign
    // (#civSubGeneration); the invariant this guards — timeline/simulate controls never duplicated
    // inside Civilization — still holds, so check the whole #genCiv subtree rather than a section
    // literally named "Polity".
    const controlsNotInPolity = !document.querySelector('#genCiv #civTlYear') && !document.querySelector('#genCiv #civSimulateBtn');

    civTimeline.length = 0; civYear = 0;
    civAddYear(10);
    const sliderHiddenAt1 = getComputedStyle(document.getElementById('explTimelineSliderRow')).display === 'none';
    civAddYear(1000);
    const slider = document.getElementById('explTimelineSlider'), dlist = document.getElementById('explTimelineTicks');
    const sliderShownAt2 = getComputedStyle(document.getElementById('explTimelineSliderRow')).display !== 'none';
    const realScale = +slider.min === 10 && +slider.max === 1000;   // was min=0/max=1 (an index range)
    const ticksAtRealYears = [...dlist.querySelectorAll('option')].map(o => +o.value).sort((a, b) => a - b).join(',') === '10,1000';

    slider.value = 950; slider.dispatchEvent(new Event('input'));   // closer to 1000 than to 10
    const snappedNearest = +slider.value === 1000 && civYear === 1000;
    slider.value = 300; slider.dispatchEvent(new Event('input'));   // closer to 10 than to 1000
    const snappedToOther = +slider.value === 10 && civYear === 10;

    civTimeline.length = 0; state.places = []; civWays = [];
    if (typeof _civRenderSettlementList === 'function') _civRenderSettlementList();
    if (typeof renderNow === 'function') renderNow();
    return { singleHome, controlsInExplore, controlsNotInPolity, sliderHiddenAt1, sliderShownAt2, realScale, ticksAtRealYears, snappedNearest, snappedToOther };
  });

  // ---- v0.91 fix (owner report: "I dont see the timeline menu in explore") ----
  // The first cut of v0.91 buried Timeline inside the filter funnel's collapsed popover, which reads
  // as a filter control, not an editing surface, and is easy to miss entirely. Timeline is now a
  // plain always-visible Explore sidebar section (same footing as Info/Journeys) — reachable without
  // opening the funnel or expanding any <details>.
  await page.evaluate(() => document.querySelector('[data-tab="explore"]').click());
  await page.waitForTimeout(150);
  R.timelineDiscoverable = await page.evaluate(() => {
    const sec = document.getElementById('explTimelineSection');
    const fab = document.getElementById('explFilterFab');
    const notInFunnel = !!(sec && fab && !fab.contains(sec));
    const inExplorePanel = !!(sec && document.getElementById('explorePanel').contains(sec));
    const r = sec ? sec.getBoundingClientRect() : null;
    const visibleWithoutClicks = !!(r && r.width > 0 && r.height > 0 && getComputedStyle(sec).display !== 'none');
    const hasHeading = !!(sec && sec.querySelector('h2') && /timeline/i.test(sec.querySelector('h2').textContent));
    return { notInFunnel, inExplorePanel, visibleWithoutClicks, hasHeading };
  });

  // ---- v0.86: climate redraw, theme switch, credits modal, popover scroll containment ----
  const canvasHash86 = () => page.evaluate(() => { const c = document.getElementById('view');
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let h = 2166136261;
    for (let i = 0; i < d.length; i += 97) { h ^= d[i]; h = (h * 16777619) >>> 0; } return h; });
  // climate redraw: "Simulate weather" must visibly repaint (v0.86 fix — _climGen keys the bake cache).
  await page.evaluate(() => { state.debug = 'rain'; renderNow(); });
  const rainH0 = await canvasHash86();
  await page.evaluate(() => { state.climate.wIters = 2; document.getElementById('weatherBtn').click(); });
  await page.waitForTimeout(2500);   // withBusy chain + RAF
  const rainH1 = await canvasHash86();
  R.climateRedraw = { changed: rainH0 !== rainH1 };
  await page.evaluate(() => { state.debug = 'off'; renderNow(); });

  // theme switch: toggles :root[data-theme], persists to localStorage, flips button label.
  R.theme = await page.evaluate(() => {
    const btn = document.getElementById('themeToggleBtn');
    const start = document.documentElement.getAttribute('data-theme');
    btn.click();
    const afterAttr = document.documentElement.getAttribute('data-theme');
    const afterBg = getComputedStyle(document.body).backgroundColor;
    const stored = (() => { try { return localStorage.getItem('cartalith_theme'); } catch (_) { return null; } })();
    btn.click();
    const backAttr = document.documentElement.getAttribute('data-theme');
    return { startDark: start !== 'light', wentLight: afterAttr === 'light', bgLightened: afterBg, stored, backToDark: backAttr !== 'light' };
  });

  // credits modal: opens with the three principle sections + key citations, Escape closes.
  await page.evaluate(() => document.getElementById('creditsBtn').click());
  await page.waitForTimeout(80);
  R.credits = await page.evaluate(() => { const m = document.getElementById('creditsModal');
    return { open: m.classList.contains('open'), sections: m.querySelectorAll('h3').length,
             hasStrahler: /Strahler/.test(m.textContent), hasGravity: /Zipf|Ravenstein/.test(m.textContent),
             hasV1915: /V1\.915/.test(m.textContent) }; });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(80);
  R.creditsClosed = await page.evaluate(() => !document.getElementById('creditsModal').classList.contains('open'));

  // Layers popover wheel containment: a wheel event on the popover must NOT reach the canvas-wrap
  // zoom handler (v0.86 fix — the popover lives inside .canvas-wrap whose wheel handler zooms the map).
  R.popoverWheel = await page.evaluate(() => {
    document.getElementById('layersBtn').click();
    const pop = document.getElementById('layersPopover'), wrap = document.querySelector('.canvas-wrap');
    let reachedWrap = false; const spy = () => { reachedWrap = true; };
    wrap.addEventListener('wheel', spy, false);
    pop.dispatchEvent(new WheelEvent('wheel', { deltaY: 120, bubbles: true, cancelable: true }));
    wrap.removeEventListener('wheel', spy, false);
    document.getElementById('layersBtn').click();
    return { containedFromMap: !reachedWrap };
  });

  // Assets header button is a toggle: enter shows the library + relabels to "← Map"; click again returns.
  R.assetsToggle = await page.evaluate(() => {
    const btn = document.getElementById('assetsHeaderBtn');
    btn.click();
    const inAssets = getComputedStyle(document.getElementById('assetLibrary')).display !== 'none' && /Map/.test(btn.textContent);
    btn.click();
    const back = getComputedStyle(document.querySelector('.canvas-wrap')).display !== 'none' && /Assets/.test(btn.textContent);
    return { inAssets, back };
  });

  // v0.86: geological Resources layer is full-map (computed below sea too) and re-derives on a sea change
  // (owner report: it was cached-stale + masked to exposed land only).
  R.resources = await page.evaluate(() => {
    const keys = ['copper','tin','iron','gold','salt','timber'];
    const countBelowSea = () => { const rp = currentResourcePotentials(); let below = 0;
      for (let i = 0; i < field.length; i++){ let best=0; for(const k of keys) if(rp[k][i]>best) best=rp[k][i];
        if (best>0.01 && field[i]<state.seaLevel) below++; } return below; };
    const belowAtDefault = countBelowSea();          // > 0 ⇒ full-map (was 0 when masked to exposed land)
    const s = document.getElementById('sea'); const before = state.seaLevel;
    s.value = Math.round((before + 0.15) * 100); s.dispatchEvent(new Event('input'));
    const reDerivedAfterSeaMove = _resourcePots === null || state.seaLevel !== before;   // cache cleared on sea change
    const belowAfterRaise = countBelowSea();
    s.value = Math.round(before * 100); s.dispatchEvent(new Event('input'));   // restore
    return { fullMap: belowAtDefault > 0, reDerivedAfterSeaMove, persistsUnderRaisedSea: belowAfterRaise > 0 };
  });

  // every Layers-popover view has a non-empty, visible legend (v0.86: locked as a guarantee).
  R.allLegends = await page.evaluate(async () => {
    const keys = LAYER_GROUPS.flatMap(g => g[1].map(x => x[0]));
    let bad = 0;
    for (const k of keys) { const b = document.querySelector('#debugSeg button[data-d="' + k + '"]');
      if (!b) { bad++; continue; } b.click(); await new Promise(r => setTimeout(r, 40));
      const el = document.getElementById('legend'); const cs = getComputedStyle(el);
      if (cs.display === 'none' || (el.innerHTML || '').length < 5) bad++; }
    const st = document.querySelector('#debugSeg button[data-d="off"]'); if (st) st.click();
    return { total: keys.length, bad };
  });

  // v0.87: entering LOD/atlas mode fills the viewport instead of shrinking the canvas to its intrinsic
  // GW×GH size (owner report: "viewport restricts to the initial World px size instead of full screen").
  // v1.01 (fill mode): BOTH modes now letterbox-COVER the wrap — the map always uses the full display
  // area — so the contract is "the canvas covers the wrap's area in LOD mode, and exiting LOD clears
  // the inline size and returns to the (cover-clamped) CSS-transform path at a comparable on-screen
  // size", not "exit returns to a small intrinsic rect".
  R.lodViewport = await page.evaluate(() => {
    const view = document.getElementById('view'), wrap = document.querySelector('.canvas-wrap');
    const area = el => { const r = el.getBoundingClientRect(); return r.width * r.height; };
    const wrapA = area(wrap);
    const beforeA = area(view);                                     // non-LOD (cover-clamped since v1.01)
    const lc = document.getElementById('lodChk'); if (lc) lc.checked = true;
    _lodOn = true; _lodCx = GW / 2; _lodCy = GH / 2; applyView(); renderNow();
    const lodA = area(view);                                        // letterbox-cover ⇒ at least the wrap
    const filled = lodA >= wrapA * 0.95;                            // covers the viewport (crop allowed)
    _lodOn = false; if (lc) lc.checked = false; applyView(); renderNow();
    const restoredA = area(view);                                   // back to the CSS-transform (cover) path
    const restored = restoredA > wrapA * 0.5 && Math.abs(restoredA - beforeA) < Math.max(beforeA, 1) * 0.35;
    return { filled, restored, hadInlineCleared: view.style.width === '' };
  });

  // v0.88 (owner report: "highest zoom stops at 20km, I'd like to drop down to 5km"): the LOD zoom cap now
  // scales with the map's real-world width instead of a fixed ×64, and the scale bar shrinks its reading
  // as you zoom in (it used to read the full map width no matter how far in you went).
  R.lodZoomDeep = await page.evaluate(() => {
    const lc = document.getElementById('lodChk'); if (lc) lc.checked = true;
    state.mapWidthKm = 800;
    _lodOn = true; _lodCx = GW / 2; _lodCy = GH / 2;
    _lodZoom = 1; applyView(); renderNow(); updateScaleBar();
    const labelOut = document.getElementById('scaleBar').innerHTML;
    const spanOut = lodSpanKm();
    _lodZoom = lodMaxZoom(); applyView(); renderNow(); updateScaleBar();
    const labelIn = document.getElementById('scaleBar').innerHTML;
    const spanIn = lodSpanKm();
    const maxZoom = lodMaxZoom();
    _lodOn = false; if (lc) lc.checked = false; _lodZoom = 1; applyView(); renderNow();
    return { maxZoom, spanOut, spanIn, reachesFiveKm: spanIn <= 5, labelChanged: labelIn !== labelOut };
  });

  // v0.89 (owner report: "tiled LOD info-layers don't scale properly" — every debug/info view except
  // off/lith/soil/water fell through to a whole-map un-zoomed render while the canvas stayed sized/fitted
  // for the current zoom). Precise regression check: while LOD is on, renderNow() must NEVER reach the
  // full (non-tiled) pixel loop for ANY debug view — drawLODView() should early-return every time. Also
  // exercises the reprojected vector overlays (wind/ocean arrows, plate drift, boundary graph, river
  // splines, settle/wildlife markers) for canvas-API errors, and confirms a debug tile actually varies
  // (isn't a blank/solid stretch, the visual symptom of the old bug).
  R.lodInfoLayers = await page.evaluate(() => {
    const lc = document.getElementById('lodChk'); if (lc) lc.checked = true;
    _lodOn = true; _lodCx = GW / 2; _lodCy = GH / 2;
    const views = ['temp', 'rain', 'koppen', 'rsrc', 'wildlife', 'wind', 'ocean', 'btype', 'strahler', 'settle', 'plates', 'popdensity'];
    const before = PERF.counters.renderPixelLoop;
    const errors = [];
    let differsFromOverview = true;   // the old bug: zoomed-in render was IDENTICAL to the whole-map render (stretched, not zoomed)
    for (const dbg of views) {
      state.debug = dbg;
      _lodZoom = 1; try { applyView(); renderNow(); } catch (e) { errors.push(dbg + ' @1x: ' + e.message); }
      const wide = view.getContext('2d').getImageData(0, 0, view.width, view.height).data;
      _lodZoom = 8; try { applyView(); renderNow(); } catch (e) { errors.push(dbg + ' @8x: ' + e.message); }
      const zoomed = view.getContext('2d').getImageData(0, 0, view.width, view.height).data;
      let same = true; for (let i = 0; i < wide.length; i += 4 * 37) { if (wide[i] !== zoomed[i] || wide[i+1] !== zoomed[i+1] || wide[i+2] !== zoomed[i+2]) { same = false; break; } }
      if (same) differsFromOverview = false;   // whole-map and zoomed-in pixels identical ⇒ not actually tiling to the zoom
    }
    const after = PERF.counters.renderPixelLoop;
    state.debug = 'off'; _lodOn = false; if (lc) lc.checked = false; _lodZoom = 1; applyView(); renderNow();
    return { neverFullPixelLoop: after === before, errors, differsFromOverview };
  });

  // v0.91 fix (owner report: "layer views arent responding to opacity anymore"): v0.89's LOD
  // generalization made drawLODView() tile EVERY debug view, so renderNow()'s LOD early-return now
  // always fires before the opacity blend — the slider went silently inert whenever LOD was on.
  // Regression check: the same debug view, same zoom, opacity 100% vs 30%, must paint differently.
  R.lodOpacity = await page.evaluate(() => {
    _lodOn = true; _lodCx = GW / 2; _lodCy = GH / 2; _lodZoom = 4; state.debug = 'temp';
    state.debugOpacity = 1; applyView(); renderNow();
    const full = view.getContext('2d').getImageData(0, 0, view.width, view.height).data;
    state.debugOpacity = 0.3; applyView(); renderNow();
    const dim = view.getContext('2d').getImageData(0, 0, view.width, view.height).data;
    let same = true;
    for (let i = 0; i < full.length; i += 4 * 29) { if (full[i] !== dim[i] || full[i+1] !== dim[i+1] || full[i+2] !== dim[i+2]) { same = false; break; } }
    state.debugOpacity = 1; state.debug = 'off'; _lodOn = false; applyView(); renderNow();
    return { differsWithOpacity: !same };
  });

  // v0.91 fix (owner report: settle/wildlife "arent clickable for their information anymore" — a
  // pre-existing gap flagged as a known follow-up in the v0.89 CHANGELOG entry: evtToGrid() assumed
  // the canvas always shows the full GW×GH world, which is only true off LOD, so every click-to-info
  // hit-test was gated out entirely (`!_lodOn`) rather than reprojected. evtToGridLOD() (mirrors
  // _civPlaceScreenPos's forward math, inverted) fixes the mapping; the click handlers now run under
  // LOD instead of being blocked. Drives an actual mouse click at the marker's real LOD screen
  // position (via _civPlaceScreenPos) and checks the info popup opens — if auto-populate's random
  // seed happens to produce no settlements/wildlife regions this run, that half is vacuously true
  // (matches this suite's existing no-retry convention for auto-populate elsewhere in this file). */
  R.lodClickInfo = await page.evaluate(() => {
    _civAutoWorld();
    let settleOk = true, wildOk = true;
    state.debug = 'settle'; _lodOn = true; _lodZoom = 1; _lodCx = GW / 2; _lodCy = GH / 2;
    applyView(); renderNow();
    if (_settleSeeds && _settleSeeds.length) {
      const s = _settleSeeds[0];
      _lodZoom = 3; _lodCx = s.x; _lodCy = s.y; applyView(); renderNow();
      const [sx, sy] = _civPlaceScreenPos(s.x, s.y);
      hideSettleInfo();
      const ev = new MouseEvent('click', { clientX: sx, clientY: sy, bubbles: true });
      view.dispatchEvent(ev);
      settleOk = document.getElementById('settleInfo').style.display === 'block';
    }
    state.debug = 'wildlife'; _lodZoom = 1; _lodCx = GW / 2; _lodCy = GH / 2; applyView(); renderNow();
    const wild = (typeof currentWildlife === 'function') ? currentWildlife() : null;
    const rec = wild ? wild.regions.find(r => r.cells >= wild.markerMin) : null;
    if (rec) {
      _lodZoom = 3; _lodCx = rec.cx; _lodCy = rec.cy; applyView(); renderNow();
      const [wx, wy] = _civPlaceScreenPos(rec.cx, rec.cy);
      hideWildInfo();
      const ev = new MouseEvent('click', { clientX: wx, clientY: wy, bubbles: true });
      view.dispatchEvent(ev);
      wildOk = document.getElementById('wildInfo').style.display === 'block';
    }
    state.debug = 'off'; _lodOn = false; _lodZoom = 1; applyView(); renderNow();
    state.places = []; state.roads = null;
    if (typeof _civRenderSettlementList === 'function') _civRenderSettlementList();
    return { settleOk, wildOk, hadSettleSeed: !!(_settleSeeds && _settleSeeds.length), hadWildRegion: !!rec };
  });

  // v0.92 fix (owner report: "slow when zooming in even when tiles are baked" — profiling with
  // tests/perf found the bottleneck: drawLODView()'s "instant overview" backdrop was rebuilt at full
  // GW×GH resolution through the same expensive per-pixel colorization used for real tiles, on EVERY
  // zoom-level change (any frame that isn't an exact pan-reuse hit) -- ~940ms measured at a modest
  // 1024px world, unaffected by whether the Atlas had anything baked (the backdrop is built straight
  // from `field`, never consults the atlas). First fix downscaled it by a flat /4 ratio; a follow-up
  // owner report ("lakes are blocky/pixilated again", "aspect ratio goes weird") traced to that ratio
  // starving small water bodies of source samples (lakes get no coastSDF smoothing, unlike the ocean
  // edge) -- fixed by capping the overview to a fixed 512px target width instead of a ratio, which
  // bounds render cost independent of world resolution (measured ~100-130ms at both 1024px and 2048px)
  // while spending full resolution on worlds already <=512px wide.
  // Regression guard: an overview rebuild (new zoom level, atlas baked, tile canvases still warm so
  // ONLY the backdrop is being timed) must stay well under the old ~940-1200ms baseline.
  R.lodOverviewPerf = await page.evaluate(async () => {
    _lodOn = true; _lodCx = GW / 2; _lodCy = GH / 2; state.debug = 'off';
    _lodZoom = 6; applyView(); renderNow();   // settle at a starting zoom level
    const n = await bakeAllTiles(2, () => {});   // small pyramid so this stays fast to set up
    setFinalized(true);
    _lodZoom = 8; applyView(); renderNow();   // move to a new (now-baked) zoom level once, populate caches
    _lodOverviewPrev = null;   // invalidate ONLY the overview-reuse cache (simulates a tiny pan/zoom
                                // step) -- tile canvases and the atlas stay warm, isolating backdrop cost
    const t0 = performance.now();
    renderNow();
    const overviewRebuildMs = performance.now() - t0;
    // v0.92 follow-up: overview canvas should be capped to the 512px target width (not GW itself,
    // and not a naive GW/4) -- this is the direct behavioral guard for the blocky-lakes regression.
    const overviewW = _lodOverviewPrev && _lodOverviewPrev.canvas.width;
    const overviewH = _lodOverviewPrev && _lodOverviewPrev.canvas.height;
    state.debug = 'off'; _lodOn = false; setFinalized(false); _lodZoom = 1; applyView(); renderNow();
    return { overviewRebuildMs, chunksBaked: n, overviewW, overviewH, GW, GH };
  });

  // v0.93 optimization: a zoom step used to pay the full overview-rebuild cost (above) synchronously
  // on every step, even when a perfectly good previous overview exists to approximate the new view
  // from. Regression guard: with a `prev` overview in hand (unlike the invalidated-cache case above),
  // a zoom step's renderNow() call must return near-instantly (stretch + defer, not a full rebuild),
  // and the deferred rebuild must still land the CORRECT sharp result shortly after.
  R.lodProgressiveOverview = await page.evaluate(async () => {
    state.debug = 'off'; _lodOn = true; _lodCx = GW / 2; _lodCy = GH / 2; _lodZoom = 1;
    applyView(); renderNow();   // establishes a `prev` overview (first-ever build, synchronous by necessity)
    const hadPrevBeforeZoom = !!_lodOverviewPrev;

    _lodZoom = 5; applyView();
    const t0 = performance.now();
    renderNow();
    const zoomStepMs = performance.now() - t0;
    const scheduledRebuild = !!_lodOverviewRebuildPending;
    const expectedZ = lodViewRect().z;

    await new Promise(res => setTimeout(res, 300));   // let the deferred rebuild land
    const finalZ = _lodOverviewPrev.z;
    const stillPending = !!_lodOverviewRebuildPending;

    _lodOn = false; _lodZoom = 1; applyView(); renderNow();
    return { hadPrevBeforeZoom, zoomStepMs, scheduledRebuild, expectedZ, finalZ, stillPending };
  });

  // v0.93 hotfix (owner report: "lakes are blocky/pixilated again" + "tiles don't seem to be cached"):
  // a REAL continuous zoom gesture (many ticks with no pause between them -- a back-to-back synchronous
  // loop with no await/setTimeout reproduces this deterministically, since nothing yields to the event
  // loop for the deferred overview rebuild to run) used to let the stretch-placeholder staleness compound
  // without limit, because every tick's _lodScheduleOverviewRebuild call superseded the previous tick's
  // still-pending one before any of them could land -- confirmed visually (checkerboarded, heavily
  // blocky overview after 8 ticks). A hard ratio cap on any single stretch was tried and rejected -- it
  // also blocked the legitimate single-big-jump case (one wheel tick straight to a deep zoom) that opt #1
  // exists to keep fast. The actual fix bounds CONSECUTIVE un-landed stretches instead
  // (_lodOverviewStretchStreak / LOD_OV_STRETCH_STREAK_CAP): a lone big jump still takes the fast path
  // (streak 0->1), but a burst is forced into a synchronous resync once the streak gets too long.
  // Regression guard: after a rapid multi-tick zoom with no settle time, (a) the streak counter itself
  // never exceeds the cap (proving the forced-resync branch actually fired during the burst, not just
  // that the counter kept climbing unchecked), and (b) the overview actually got refreshed at least once
  // mid-burst (its captured view differs from the very first zoom-in step, proving it isn't just stuck
  // showing the original whole-map capture the entire time).
  R.lodOverviewStretchCap = await page.evaluate(async () => {
    state.debug = 'off'; _lodOn = true; _lodCx = GW / 2; _lodCy = GH / 2; _lodZoom = 1;
    applyView(); renderNow();   // establish an initial prev overview
    const steps = [2, 3, 5, 8, 12, 16, 20, 24];
    let firstStepSpan = null;
    for (const z of steps) {
      _lodZoom = z; applyView(); renderNow();   // no waits: back-to-back, like a fast continuous wheel-scroll
      if (firstStepSpan == null) firstStepSpan = _lodOverviewPrev.x1 - _lodOverviewPrev.x0;
    }
    const streakAfterBurst = _lodOverviewStretchStreak;
    const finalOverviewSpan = _lodOverviewPrev.x1 - _lodOverviewPrev.x0;
    const refreshedMidBurst = Math.abs(finalOverviewSpan - firstStepSpan) > 1e-9;
    _lodOn = false; _lodZoom = 1; applyView(); renderNow();
    return { streakAfterBurst, refreshedMidBurst };
  });

  // v0.93 optimization: refineVisibleTiles now dispatches pool-eligible batches to GENPOOL.runTiles
  // (task-parallel across cores) instead of computing every tile sequentially on the main thread.
  // Regression guard: the pool path must be measurably faster than the forced-sync path AND produce
  // byte-identical tile data (same pyramidTile output, just computed off the main thread).
  R.lodRefinePool = await page.evaluate(async () => {
    _lodOn = true; _lodCx = GW / 2; _lodCy = GH / 2; _lodZoom = 6; applyView(); renderNow();
    _atlasBaked.clear(); _atlasImg.clear();   // an earlier perf test baked z=0..2 to the atlas -- clear it so bakedCover() doesn't make `need` empty here (refineVisibleTiles has nothing to do if everything's already baked)
    const v0 = lodViewRect();
    const keyCount = visibleTileKeys(v0.z, v0.x0, v0.y0, v0.x1, v0.y1).length;

    lodCacheClear();
    const t0 = performance.now();
    await refineVisibleTiles();
    const withPoolMs = performance.now() - t0;
    const poolUsable = GENPOOL.usable;

    const v = lodViewRect();
    const poolSamples = [];
    for (const k of visibleTileKeys(v.z, v.x0, v.y0, v.x1, v.y1)) {
      const t = lodCacheGet(lodCacheKey(v.z, k.col, k.row, _lodTile));
      if (t) poolSamples.push({ col: k.col, row: k.row, w: t.w, h: t.h, sample: Array.from(t.data.slice(0, 3)) });
    }

    lodCacheClear();
    const origUsableForTiles = GENPOOL.usableForTiles;
    GENPOOL.usableForTiles = () => false;   // force the sync fallback for a fair A/B on this same view
    const t1 = performance.now();
    await refineVisibleTiles();
    const syncOnlyMs = performance.now() - t1;
    GENPOOL.usableForTiles = origUsableForTiles;

    let allMatch = poolSamples.length > 0;
    for (const pr of poolSamples) {
      const s = lodCacheGet(lodCacheKey(v.z, pr.col, pr.row, _lodTile));
      if (!s || s.w !== pr.w || s.h !== pr.h) { allMatch = false; break; }
      for (let i = 0; i < 3; i++) if (s.data[i] !== pr.sample[i]) { allMatch = false; break; }
    }

    _lodOn = false; _lodZoom = 1; applyView(); renderNow();
    return { keyCount, withPoolMs, syncOnlyMs, poolUsable, allMatch };
  });

  // v0.93 optimization: bakeAllTiles batches each pyramid level's pool-eligible tiles through
  // GENPOOL.runTiles before the (unchanged, still-sequential) PNG-encode/IndexedDB write loop,
  // instead of computing every tile on the main thread. Regression guard: a multi-level bake via
  // the pool finishes faster than the forced-sync fallback AND bakes the identical chunk set.
  R.bakeAllTilesPool = await page.evaluate(async () => {
    _lodOn = true;
    const allKeys = [];
    for (let z = 0; z <= 2; z++) { const side = 1 << z; for (let row = 0; row < side; row++) for (let col = 0; col < side; col++) allKeys.push(atlasChunkKey(z, col, row, _lodTile)); }

    _atlasBaked.clear(); _atlasImg.clear();
    const origUsableForTiles = GENPOOL.usableForTiles;
    GENPOOL.usableForTiles = () => false;   // forced-sync baseline runs first
    const t0 = performance.now();
    const nBakedSync = await bakeAllTiles(2, () => {});
    const syncOnlyMs = performance.now() - t0;
    GENPOOL.usableForTiles = origUsableForTiles;
    const syncBaked = allKeys.every(k => _atlasBaked.has(k));

    _atlasBaked.clear(); _atlasImg.clear();
    const t1 = performance.now();
    const nBaked = await bakeAllTiles(2, () => {});
    const withPoolMs = performance.now() - t1;
    const poolBaked = allKeys.every(k => _atlasBaked.has(k));

    _lodOn = false;
    return { syncOnlyMs, withPoolMs, nBakedSync, nBaked, syncBaked, poolBaked, poolUsable: GENPOOL.usable };
  });

  // v0.92 follow-up fix (owner report: "graphic fidelity seems to have degraded also"): every OTHER
  // way into LOD (wheel-zoom, pan release, zoom buttons, auto-enter-on-zoom) already scheduled a
  // refine so the sharp tile overlay replaces the coarse overview after a beat -- the `lodChk`
  // checkbox itself never did, so ticking it and just looking (no pan/zoom yet) left the user on the
  // coarse overview indefinitely. Regression guard: checking the box alone (a real click, not a
  // synthetic zoom/pan) must populate the visible tile's render cache without any further gesture.
  const errorsBeforeCheckbox = errors.length;
  R.lodCheckboxAutoRefine = await page.evaluate(async () => {
    _lodOn = false; _lodZoom = 1; _lodCx = GW / 2; _lodCy = GH / 2;   // clean, predictable whole-map state regardless of what earlier tests left behind
    const lc = document.getElementById('lodChk'); if (lc) lc.checked = false;
    lodCacheClear();
    _atlasBaked.clear(); _atlasImg.clear();   // the preceding perf test baked z=0..2 to the atlas -- clear it so this tests the real "nothing baked yet" scenario the fix targets (refineVisibleTiles() skips already-baked coverage by design)
    const acc = lc.closest('details'); if (acc) acc.open = true;
    lc.checked = true; lc.dispatchEvent(new Event('change'));
    await new Promise(res => setTimeout(res, 600));   // withBusy's ~20ms defer + the refine itself
    const v = lodViewRect();
    const keys = visibleTileKeys(v.z, v.x0, v.y0, v.x1, v.y1);
    const cachedAfterCheck = keys.length > 0 && keys.every(k => !!lodCacheGet(lodCacheKey(v.z, k.col, k.row, _lodTile)));
    lc.checked = false; lc.dispatchEvent(new Event('change'));
    await new Promise(res => setTimeout(res, 400));   // let any in-flight deferred refine settle before the Node-side errors check below
    _lodOn = false; applyView(); renderNow();
    return { cachedAfterCheck };
  });
  R.lodCheckboxAutoRefine.noNewErrors = errors.length === errorsBeforeCheckbox;

  // v0.94 (owner request: "draw rivers as ways, as in the legacy cartalith app"): a new default-on
  // vector overlay (state.viz.riverWays, drawRiverWays()) layers stroked river-network splines on top
  // of the existing raster water blend, on both the main canvas and under Tiled LOD (closing a
  // pre-existing gap where the default LOD Biome view never showed the river network's color at all).
  // Regression guard: the checkbox reflects/drives state.viz.riverWays, and toggling it produces a
  // real, visible pixel difference on BOTH the main canvas and a LOD view zoomed onto a real river.
  R.riverWays = await page.evaluate(async () => {
    state.debug = 'off'; state.mode = 'biome'; _lodOn = false; _lodZoom = 1; applyView();
    const chk = document.getElementById('riverWaysChk');
    const checkboxReflectsDefault = !!chk && chk.checked === true && state.viz.riverWays === true;

    if (!_riverNet) _riverNet = buildRiverNetwork(field, flowField, GW, GH, state.seaLevel, { world: state.world, riverDensity: (state.viz.riverDensity) || 1 });
    // find a river cell to center the LOD view on (order >= 2, away from the map edge)
    let spotX = GW / 2, spotY = GH / 2, found = false;
    for (let y = 4; y < GH - 4 && !found; y++) for (let x = 4; x < GW - 4 && !found; x++) {
      if (_riverNet.order[y * GW + x] >= 2) { spotX = x; spotY = y; found = true; }
    }

    renderNow();
    const mainOn = vctx.getImageData(0, 0, GW, GH).data.slice();
    state.viz.riverWays = false; chk.checked = false; renderNow();
    const mainOff = vctx.getImageData(0, 0, GW, GH).data.slice();
    state.viz.riverWays = true; chk.checked = true; renderNow();

    let mainDiffPx = 0;
    for (let i = 0; i < mainOn.length; i += 4) {
      if (Math.abs(mainOn[i] - mainOff[i]) + Math.abs(mainOn[i + 1] - mainOff[i + 1]) + Math.abs(mainOn[i + 2] - mainOff[i + 2]) > 6) mainDiffPx++;
    }

    _lodOn = true; _lodCx = spotX; _lodCy = spotY; _lodZoom = 16; applyView(); renderNow();
    await refineVisibleTiles(); renderNow();
    const cv = document.getElementById('view'), cctx = cv.getContext('2d');
    const lodOn = cctx.getImageData(0, 0, cv.width, cv.height).data.slice();
    state.viz.riverWays = false; renderNow();
    const lodOff = cctx.getImageData(0, 0, cv.width, cv.height).data.slice();
    state.viz.riverWays = true; renderNow();

    let lodDiffPx = 0;
    for (let i = 0; i < lodOn.length; i += 4) {
      if (Math.abs(lodOn[i] - lodOff[i]) + Math.abs(lodOn[i + 1] - lodOff[i + 1]) + Math.abs(lodOn[i + 2] - lodOff[i + 2]) > 6) lodDiffPx++;
    }

    // v1.14 (owner report: "a multitude of rivers... in close proximity, as if two different engines
    // are trying to achieve the very same thing... poor unnatural looking"): confirmed root cause —
    // surfaceColor's own per-pixel raster network blend and drawRiverWays' vector spline both traced
    // the SAME _riverNet and both rendered whenever riverWays was on (the v0.94 comment literally said
    // "both render"), and the vector path's Catmull-Rom smoothing + sinuosity jitter visibly diverges
    // from the raster's raw cell-centerline blend, reading as a second, parallel river. Fix: surfaceColor
    // now skips its raster blend whenever the vector overlay is about to draw the same network right
    // after it (state.viz.riverWays on) — direct regression guard: calling surfaceColor at an identical
    // river cell with riverWays on vs off must still differ (on ⇒ raw/no blend, off ⇒ blended), proving
    // the skip branch is live and doesn't quietly get short-circuited back to "always blend".
    let dedupDiffer = null;
    if (found) {
      const di = spotY * GW + spotX, vw = field[di];
      state.viz.riverWays = true; const onC = surfaceColor(spotX, spotY, di, vw);
      state.viz.riverWays = false; const offC = surfaceColor(spotX, spotY, di, vw);
      state.viz.riverWays = true;
      dedupDiffer = (Math.abs(onC[0] - offC[0]) + Math.abs(onC[1] - offC[1]) + Math.abs(onC[2] - offC[2])) > 3;
    }

    _lodOn = false; _lodZoom = 1; applyView(); renderNow();
    return { checkboxReflectsDefault, foundRiverSpot: found, mainDiffPx, lodDiffPx, dedupDiffer };
  });

  // v0.94 (owner report: "when using a very long route where a split or partial is possible by sea
  // or river... it opts to only use land based routes"). Root cause: _civMixedCostGrid's water cost
  // (1.5) was tuned ABOVE typical flat land (~1.0), backwards from the journey planner's own ~2.5x
  // sea-speed model, land cost ignored biome friction, and real rivers carried no cost at all. Fixed
  // by rebalancing water below land, adding real river costing, and sharing the biome-penalty model.
  // Regression guard: on a fixed seed/resolution (reproducible geography), a coastal point pair whose
  // land-only route requires a real detour around the coastline (found via an independent Playwright
  // probe against v0.93 vs this build: v0.93 committed a ~5-6% water route here, essentially
  // all-land; v0.94 committed 35-50% water on the SAME pairs) must show a materially higher water
  // fraction than the old behavior — asserted against a fixed threshold safely between the two
  // observed values, not a live A/B (the new cost constants are `const`, not toggleable at runtime).
  R.routingSeaShortcut = await page.evaluate(async () => {
    state.tect.seed = 424242; state.resW = 1024; GW = 1024; GH = gridH(GW); allocate();
    await generate();
    const pairs = [
      { x1: 810, y1: 530, x2: 754, y2: 602 },   // v0.93 waterFrac 0.051 -> v0.94 0.349 (independently measured)
      { x1: 798, y1: 494, x2: 758, y2: 606 },   // v0.93 waterFrac 0.061 -> v0.94 0.500
    ];
    const out = pairs.map(p => {
      const mixed = _civDijkstraPath(p.x1, p.y1, p.x2, p.y2, 'mixed');
      const land = _civDijkstraPath(p.x1, p.y1, p.x2, p.y2, 'land');
      if (!mixed || !mixed.pts) return { ok: false };
      return { ok: true, waterFrac: _civPathWaterFrac(mixed.pts), mixedKm: mixed.km, landKm: land ? land.km : null };
    });
    return { pairs: out };
  });

  // v0.95 (owner: refactor the urban-morphology PoC into Cartalith; at deep zoom a settlement's pin
  // fades into its own generated street layout, main roads locked to the region network, gated by a
  // map-wide opt-in toggle; settlement popup gains Age/Fortifications, inferred from population by
  // default). Regression guard: default-off toggle + wiring, a real pixel difference between the
  // toggle on/off states once the deep-zoom crossfade band + a generated model are both in effect (and
  // the pin fades — _umRevealedSet gates on the model actually being ready, not just the zoom band),
  // the popup's Age/Fortifications fields exist and editing either changes _umPlaceContext's cache key
  // (so the layout regenerates), and generation is deterministic for identical inputs.
  R.urbanMorph = await page.evaluate(async () => {
    try { _civAutoWorld(); } catch (e) {}
    // v1.00: a settlement sitting in open water (its town box is mostly water) legitimately renders
    // NO layout — just its pin (_umModelFor bails). So this crossfade/reveal assertion must target a
    // settlement that actually HAS a land town: pick the first whose model renders (via the synchronous
    // _umModelForNow, which also warms the cache), falling back to the first settlement on older builds.
    const settles = state.places.filter(p => p.kind && CIV_SETTLE_KEYS.has(p.kind));
    let settle = (typeof _umModelForNow === 'function') ? settles.find(p => _umModelForNow(p)) : null;
    if (!settle) settle = settles[0];
    if (!settle) return { ok: false, error: 'no settlement' };

    const chk = document.getElementById('civUrbanLayoutsChk');
    const defaultOff = (state.viz && state.viz.urbanLayouts) === false;
    const checkboxReflectsDefault = !!chk && chk.checked === false;

    const lc = document.getElementById('lodChk'); if (lc) { lc.checked = true; lc.dispatchEvent(new Event('change')); }
    _lodCx = settle.x; _lodCy = settle.y; _lodZoom = Math.max(4, (state.mapWidthKm || 800) / 6);
    state.viz.urbanLayouts = false; renderNow();
    const civOff = civCtx.getImageData(0, 0, civCanvas.width, civCanvas.height).data.slice();

    state.viz.urbanLayouts = true;
    let model = null;
    for (let i = 0; i < 50 && !model; i++) { renderNow(); model = _umModelFor(settle, false); if (!model) await new Promise(r => setTimeout(r, 20)); }
    renderNow();
    const civOn = civCtx.getImageData(0, 0, civCanvas.width, civCanvas.height).data.slice();
    let diffPx = 0;
    for (let i = 0; i < civOn.length; i += 4) {
      if (Math.abs(civOn[i] - civOff[i]) + Math.abs(civOn[i + 1] - civOff[i + 1]) + Math.abs(civOn[i + 2] - civOff[i + 2]) + Math.abs(civOn[i + 3] - civOff[i + 3]) > 6) diffPx++;
    }
    const revealedWithModel = !!model && _umRevealedSet.has(settle);

    _civSelectedPlace = settle; _civRenderPlaceEditor();
    const ageEl = document.getElementById('_civPeAge'), wallsEl = document.getElementById('_civPeWalls');
    const hasAgeEl = !!ageEl, hasWallsEl = !!wallsEl;
    const key0 = _umCacheKey(_umPlaceContext(settle));
    if (ageEl) { ageEl.value = '600'; ageEl.dispatchEvent(new Event('input')); }
    const key1 = _umCacheKey(_umPlaceContext(settle));
    const cacheInvalidatesOnAgeEdit = key0 !== key1;
    if (ageEl) { ageEl.value = ''; ageEl.dispatchEvent(new Event('input')); }
    const key2 = _umCacheKey(_umPlaceContext(settle));
    const ageBackToAuto = key2 === key0;

    const ctx = _umPlaceContext(settle);
    const mA = UME.cityGen(ctx.seed, ctx), mB = UME.cityGen(ctx.seed, ctx);
    const deterministic = UME.hashModel(mA) === UME.hashModel(mB);

    _lodOn = false; _lodZoom = 1; state.viz.urbanLayouts = false; applyView(); renderNow();
    return {
      ok: true, defaultOff, checkboxReflectsDefault, diffPx, revealedWithModel,
      hasAgeEl, hasWallsEl, cacheInvalidatesOnAgeEdit, ageBackToAuto, deterministic
    };
  });

  // v0.96 regression guard for the coordinate-based _umRouteEnds fix (the town's main roads lock to the
  // map's connected roads). Deterministic form: a road whose endpoint is snapped to the settlement must
  // yield a route end, while a way that only PASSES NEAR the settlement (endpoint not at it) must NOT —
  // the old aIdx/bIdx match couldn't tell those apart (several split runs of one edge share aIdx/bIdx,
  // so it pulled bearings from way-interior junctions). Bearing-vs-bearing angle matching is left to the
  // dedicated probes (chance-sensitive with many primaries; not a stable pass/fail in the smoke world).
  R.umRoadEnds = await page.evaluate(async () => {
    state.tect.seed = 424242; state.resW = 1024; GW = 1024; GH = gridH(GW); allocate();
    await generate();
    try { _civAutoWorld(); } catch (e) { return { ok: false, reason: 'autoworld: ' + e.message }; }
    const eps = Math.max(1.0, GW / 250);
    const settles = state.places.filter(p => p.kind && CIV_SETTLE_KEYS.has(p.kind));
    const cc = p => { let n = 0; for (const w of civWays) { if (w.sea || w.hidden || !w.pts || w.pts.length < 2) continue; const a = _umPt(w.pts[0]), b = _umPt(w.pts[w.pts.length - 1]); if (Math.hypot(a.x - p.x, a.y - p.y) < eps || Math.hypot(b.x - p.x, b.y - p.y) < eps) n++; } return n; };
    let best = null, bn = -1; for (const p of settles) { const c = cc(p); if (c > bn) { bn = c; best = p; } }
    if (!best || bn < 1) return { ok: false, reason: 'no connected settlement' };
    const re = _umRouteEnds(best, UME.SITE_WM, UME.SITE_HM, 0);
    // a placeholder far from any settlement endpoint must get no route ends (proves it's not matching by
    // proximity/aIdx alone) — find an empty spot
    let farP = null; for (let gy = 5; gy < GH - 5 && !farP; gy += 7) for (let gx = 5; gx < GW - 5; gx += 7) { let near = false; for (const w of civWays) { if (!w.pts) continue; const a = _umPt(w.pts[0]), b = _umPt(w.pts[w.pts.length - 1]); if (Math.hypot(a.x - gx, a.y - gy) < eps * 4 || Math.hypot(b.x - gx, b.y - gy) < eps * 4) { near = true; break; } } if (!near && field[gy * GW + gx] >= (state.seaLevel || 0.42)) { farP = { x: gx, y: gy }; break; } }
    const reFar = farP ? _umRouteEnds(farP, UME.SITE_WM, UME.SITE_HM, 0) : null;
    return { ok: true, conns: bn, connectedGetsEnds: !!re && re.length > 0, disconnectedGetsNone: !reFar };
  });

  // v0.97 regression guard: the town is built AROUND the real roads (primaryPaths) and still forms a
  // proper structure — a wall for a walled settlement + primaries reaching a real extent. The first cut
  // resampled the km-spaced civWay vertices too sparsely (2-3 pts), so injected primaries were 2-pt
  // stubs (~250 m), the built mass landed entirely on the far river bank, and the wall never formed;
  // the arc-length resample fixed it. Also checks the paths are dense (many points), not raw vertices.
  R.umBuildAround = await page.evaluate(async () => {
    state.tect.seed = 424242; state.resW = 512; GW = 512; GH = gridH(GW); allocate();
    await generate();
    try { _civAutoWorld(); } catch (e) { return { ok: false, reason: 'autoworld: ' + e.message }; }
    const eps = Math.max(1.0, GW / 250);
    const settles = state.places.filter(p => p.kind && CIV_SETTLE_KEYS.has(p.kind) && _umInferWalls(p));
    const cc = p => { let n = 0; for (const w of civWays) { if (w.sea || w.hidden || !w.pts || w.pts.length < 2) continue; const a = _umPt(w.pts[0]), b = _umPt(w.pts[w.pts.length - 1]); if (Math.hypot(a.x - p.x, a.y - p.y) < eps || Math.hypot(b.x - p.x, b.y - p.y) < eps) n++; } return n; };
    let best = null, bn = -1; for (const p of settles) { const c = cc(p); if (c > bn) { bn = c; best = p; } }
    if (!best || bn < 1) return { ok: false, reason: 'no connected walled settlement' };
    const ctx = _umPlaceContext(best);
    const usesPaths = !!ctx.primaryPaths && ctx.primaryPaths.length > 0;
    const dense = usesPaths && ctx.primaryPaths.every(pa => pa.length >= 8);   // resampled, not raw km-spaced vertices
    const m = UME.cityGen(ctx.seed, ctx);
    const anc = m.anchors.market, N = m.graph.nodes; let maxPrim = 0;
    for (const e of m.graph.edges) { if (e.cls !== 'primary') continue; for (const nid of [e.a, e.b]) { const nd = N[nid]; if (nd) maxPrim = Math.max(maxPrim, Math.hypot(nd.x - anc.x, nd.y - anc.y)); } }
    return { ok: true, conns: bn, usesPaths, dense, wallRing: !!(m.wall && m.wall.ring), maxPrim: Math.round(maxPrim) };
  });

  // ── v1.11 (borrow-list #5, after the research's "framing the existing amplification/LOD
  // machinery as an explicit 'carve this region into its own higher-resolution map' tool"):
  // Extract as new world. Builds its own fresh world (this is the LAST R-computation in the
  // suite — nothing downstream depends on the previous shared world, so no snapshot/restore is
  // needed, same as R.umBuildAround just above). Selects a quarter-map region, clicks "Extract
  // as new world" (auto-accepting its confirm() dialog), waits for the calibrate step it hands
  // off to, checks the amplified field/scale/civ-clearing, then commits calibrate (inferTectonics)
  // and checks the resulting world is a valid finite field.
  await page.evaluate(async () => {
    state.tect.seed = 777777; state.resW = 512; GW = 512; GH = gridH(GW); allocate();
    await generate();
  });
  const submapBefore = await page.evaluate(() => {
    _civAutoWorld();
    civTerritory = new Uint8Array(GW * GH); civTerritory[5] = 1; _civTerrGen++;
    regionSel = normRegion(Math.floor(GW * 0.25), Math.floor(GH * 0.25), Math.floor(GW * 0.75), Math.floor(GH * 0.75), GW, GH);
    const nb = document.getElementById('regionNewWorldBtn'); if (nb) nb.disabled = false;
    document.getElementById('refSize').value = '1024';
    return { GW, GH, mapWidthKm: state.mapWidthKm, placesCount: state.places.length, regionW: regionSel.w, regionH: regionSel.h };
  });
  let confirmSeen = false;
  const hSubmapConfirm = async d => { confirmSeen = true; await d.accept(); };
  page.on('dialog', hSubmapConfirm);
  await page.evaluate(() => document.getElementById('regionNewWorldBtn').click());
  await page.waitForFunction(() => {
    const el = document.getElementById('obStepCalibrate');
    return el && el.classList.contains('on') && getComputedStyle(document.getElementById('onboard')).display !== 'none';
  }, null, { timeout: 20000 });
  page.off('dialog', hSubmapConfirm);
  const afterExtract = await page.evaluate(() => ({
    GW, GH, mapWidthKm: state.mapWidthKm, placesCount: state.places.length,
    territoryNull: civTerritory === null, provinceNull: civProvince === null,
    calWidthValue: +document.getElementById('suWidth2').value,
    allFinite: (() => { for (let i = 0; i < field.length; i += 37) if (!Number.isFinite(field[i])) return false; return true; })(),
    fieldRangeOk: (() => { let mn = Infinity, mx = -Infinity; for (let i = 0; i < field.length; i++) { if (field[i] < mn) mn = field[i]; if (field[i] > mx) mx = field[i]; } return mn >= 0 && mx <= 1; })()
  }));
  await page.evaluate(() => document.getElementById('suCalCommit').click());
  await page.waitForFunction(() => getComputedStyle(document.getElementById('onboard')).display === 'none', null, { timeout: 60000 });
  await page.waitForTimeout(400);
  const afterInfer = await page.evaluate(() => ({
    plateCount: (typeof plates !== 'undefined' && plates) ? plates.length : -1,
    allFinite: (() => { for (let i = 0; i < field.length; i += 37) if (!Number.isFinite(field[i])) return false; return true; })()
  }));
  R.submap = {
    confirmSeen, before: submapBefore, afterExtract, afterInfer,
    expectedMapWidthKm: submapBefore.mapWidthKm * submapBefore.regionW / submapBefore.GW,
    resolutionIsRequested: afterExtract.GW === 1024
  };

  // ── v1.12 (borrow-list #6, after FMG's label engine + "restyle-everything panels" — "the
  // editor-maturity bar"): multi-candidate label placement + per-layer style opacity sliders.
  // This is now the LAST R-computation (after v1.11's world-replacing test above, which also
  // doesn't restore) — builds its own small fresh world, so no snapshot/restore needed either.
  // Five same-tier cities packed 8 grid units apart in a line (each city's own label is far wider
  // than that spacing) is a deliberately brutal collision case: on the pre-v1.12 single-position
  // system only the highest-priority label survives (shownCount 1); the multi-candidate fallback
  // rescues at least one more via an alternate side.
  await page.evaluate(async () => {
    state.tect.seed = 55555; state.resW = 512; GW = 512; GH = gridH(GW); allocate();
    await generate();
  });
  R.labelsAndStyle = await page.evaluate(() => {
    const cx = (GW / 2) | 0, cy = (GH / 2) | 0;
    state.places = [];
    const names = ['Alphaburgshire', 'Betaburgshire', 'Gammaburgshire', 'Deltaburgshire', 'Epsilonburgshire'];
    for (let i = 0; i < names.length; i++) state.places.push({ x: cx + (i - 2) * 8, y: cy, kind: 'city', klass: 'city', category: 'settlement', faction: 1, name: names[i], pop: 5000, traits: [] });
    civTerritory = null; civWays = [];
    const calls = [];
    const orig = _civDrawSettlementPin;
    _civDrawSettlementPin = function (ctx, px, py, place, selected, opts) { calls.push({ name: place.name, skipLabel: !!opts.skipLabel, labelPos: opts.labelPos }); return orig(ctx, px, py, place, selected, opts); };
    drawCivLayerAuto();
    _civDrawSettlementPin = orig;
    const shown = calls.filter(c => !c.skipLabel);

    civTerritory = new Uint8Array(GW * GH);
    const R2 = 20;
    for (let dy = -R2; dy <= R2; dy++) for (let dx = -R2; dx <= R2; dx++) { if (dx * dx + dy * dy > R2 * R2) continue; const x = cx + dx, y = cy + dy; if (x < 0 || x >= GW || y < 0 || y >= GH) continue; civTerritory[y * GW + x] = 1; }
    _civTerrGen++;
    state.viz.territoryOpacity = 130 / 255; drawCivLayerAuto(); renderNow();
    const tLow = civCtx.getImageData(0, 0, civCanvas.width, civCanvas.height).data.slice();
    state.viz.territoryOpacity = 1.0; drawCivLayerAuto(); renderNow();
    const tHigh = civCtx.getImageData(0, 0, civCanvas.width, civCanvas.height).data;
    let territoryDiffPx = 0; for (let i = 0; i < tLow.length; i += 4) if (tLow[i + 3] !== tHigh[i + 3]) territoryDiffPx++;
    state.viz.territoryOpacity = 130 / 255;

    civWays = [{ pts: [[cx - 30, cy + 30], [cx + 30, cy + 30]], km: 10, type: 'road', sea: false }];
    state.viz.wayOpacity = 1.0; drawCivLayerAuto(); renderNow();
    const wLow = civCtx.getImageData(0, 0, civCanvas.width, civCanvas.height).data.slice();
    state.viz.wayOpacity = 0.2; drawCivLayerAuto(); renderNow();
    const wHigh = civCtx.getImageData(0, 0, civCanvas.width, civCanvas.height).data;
    let wayDiffPx = 0; for (let i = 0; i < wLow.length; i += 4) if (Math.abs(wLow[i] - wHigh[i]) > 2 || Math.abs(wLow[i + 1] - wHigh[i + 1]) > 2 || Math.abs(wLow[i + 2] - wHigh[i + 2]) > 2) wayDiffPx++;
    state.viz.wayOpacity = 1.0;

    return {
      shownCount: shown.length, positions: [...new Set(shown.map(c => c.labelPos))],
      territoryDiffPx, wayDiffPx,
      territoryOpacitySliderExists: !!document.getElementById('territoryOpacityR'), wayOpacitySliderExists: !!document.getElementById('wayOpacityR')
    };
  });

  // ── v1.13: three owner-reported fixes — (1) region/area name labels stopped drawing, (2) zoom-out
  //    floored at COVER (map height fills, width overflows → forced L/R drag), (3) clickable info under
  //    deep zoom kept the un-zoomed coordinate mapping. Reuses the seed-55555 512px world from v1.12.
  R.v113 = await page.evaluate(async () => {
    const out = {};
    const cx = (GW / 2) | 0, cy = (GH / 2) | 0;

    // (1) Region labels are user cartography — they must ALWAYS draw, never be suppressed by an
    //     auto-placed settlement label crowding the shared occupancy grid. Reproduce the v1.12
    //     regression (settlement boxes packed on top of a region label → 0 region draws), then confirm
    //     v1.13 reserves the region label's box first so it still renders.
    state.places = [];
    const names = ['Alphaburgshire', 'Betaburgshire', 'Gammaburgshire', 'Deltaburgshire', 'Epsilonburgshire'];
    for (let i = 0; i < names.length; i++) state.places.push({ x: cx + (i - 2) * 6, y: cy, kind: 'city', klass: 'city', category: 'settlement', faction: 1, name: names[i], pop: 5000, traits: [] });
    state.labels = [{ x: cx, y: cy, name: 'REACHWOLD', size: 22, color: '#f0e4c8', font: 'Georgia, serif', angle: 0, arc: 0 }];
    civTerritory = null; civWays = []; _civSelectedLabel = null;
    let regionDraws = 0;
    const origArc = drawArcLabel;
    drawArcLabel = function (ctx, text) { if (text === 'REACHWOLD') regionDraws++; return origArc.apply(this, arguments); };
    drawCivLayerAuto();
    drawArcLabel = origArc;
    out.regionLabelDraws = regionDraws;

    // (2) Zoom-out FLOOR is now the FIT scale (whole map visible) rather than COVER. Establish the
    //     filled default, then zoom out hard and confirm the WHOLE map — width AND height — fits the
    //     viewport (letterbox on the overflow axis), instead of one axis overflowing (the reported drag).
    const measure = () => {
      const wrap = document.querySelector('.canvas-wrap'); const cs = getComputedStyle(wrap);
      const availW = wrap.clientWidth - parseFloat(cs.paddingLeft || 0) - parseFloat(cs.paddingRight || 0);
      const availH = wrap.clientHeight - parseFloat(cs.paddingTop || 0) - parseFloat(cs.paddingBottom || 0);
      const r = canvasStack.getBoundingClientRect();   // reflects the applied transform (scaled visual size)
      return { availW, availH, scaledW: r.width, scaledH: r.height };
    };
    _lodOn = false;
    _viewFill();                                  // the filled cover default
    out.coverScale = +_viewCoverScale().toFixed(4);
    out.fitScale = +_viewFitScale().toFixed(4);
    out.fitAtOrBelowCover = out.fitScale <= out.coverScale + 1e-4;
    const mCover = measure();                      // at cover, at least one axis overflows when aspects differ
    out.overflowsAtCover = mCover.scaledW > mCover.availW + 1.5 || mCover.scaledH > mCover.availH + 1.5;
    const [vcx, vcy] = viewCenter();
    for (let i = 0; i < 40; i++) zoomAt(vcx, vcy, 0.5);   // zoom out to the floor
    out.scaleAtFloor = +viewT.scale.toFixed(4);
    const mFloor = measure();
    out.widthFitsAtFloor = mFloor.scaledW <= mFloor.availW + 1.5;
    out.heightFitsAtFloor = mFloor.scaledH <= mFloor.availH + 1.5;
    _viewFill();                                   // restore the default filled view

    // (3) Under deep LOD zoom the LEFT-click tool handler must map through evtToGridLOD (LOD-aware),
    //     not the un-zoomed evtToGrid. Arm the Info tool, centre LOD on a settlement, dispatch a REAL
    //     pointerdown at its predicted on-screen pixel, and confirm _civInfoAt receives that
    //     settlement's grid cell — while the old plain mapping would have landed far away.
    _civAutoWorld();
    const p = state.places.find(pl => pl.kind === 'capital' || pl.kind === 'city') || state.places[0];
    _activeTab = 'explore'; _civTool = 'info';
    _lodOn = true; const lc = document.getElementById('lodChk'); if (lc) lc.checked = true;
    _lodCx = p.x; _lodCy = p.y; _lodZoom = 8; applyView(); renderNow();
    let infoGx = null, infoGy = null;
    const origInfo = _civInfoAt;
    _civInfoAt = function (gx, gy) { infoGx = gx; infoGy = gy; /* skip DOM work */ };
    const [sx, sy] = _civPlaceScreenPos(p.x, p.y);       // LOD-aware forward projection of the pin
    view.dispatchEvent(new MouseEvent('pointerdown', { clientX: sx, clientY: sy, button: 0, bubbles: true }));
    _civInfoAt = origInfo;
    out.lodClickHandlerErr = (infoGx == null) ? 999 : +Math.hypot(infoGx - p.x, infoGy - p.y).toFixed(2);
    const plain = evtToGrid({ clientX: sx, clientY: sy });   // what the pre-v1.13 handler would have used
    out.plainMappingErr = +Math.hypot(plain[0] - p.x, plain[1] - p.y).toFixed(2);
    _lodOn = false; if (lc) lc.checked = false; _lodZoom = 1; _activeTab = 'generate'; _civTool = 'inspect'; applyView(); renderNow();
    return out;
  });

  R.sculpt = await page.evaluate(async () => {
    const out = {};
    // (1) tab mechanics: the 4th Generate sub-tab shows its panel, hides World, and arms the editor
    document.querySelector('#genSubBar [data-gsub="sculpt"]').click();
    out.panelShown = getComputedStyle(document.getElementById('genSculpt')).display !== 'none';
    out.worldHidden = getComputedStyle(document.getElementById('genWorld')).display === 'none';
    out.featureButtons = document.querySelectorAll('#sculptFeatureSeg button').length;
    out.presetButtons = document.querySelectorAll('#sculptPresetSeg button').length;
    out.editorActive = _sculptEditorActive();

    // (2) paint → draft: neither `field` nor the rendered pixels change until commit (non-destructive)
    state.debug = 'off'; renderNow();
    const beforeField = field.slice(), beforePixels = img.data.slice();
    _sculptType = 'mountains'; _sculptSel = -1;
    const cx = GW / 2, cy = GH / 2;
    _sculptCapturing = true; _sculptPts = [{ x: cx - 30, y: cy }, { x: cx, y: cy }, { x: cx + 30, y: cy }];
    sculptFinishStroke();
    out.draftLeavesFieldUntouched = field.every((v, i) => v === beforeField[i]);
    out.draftLeavesRenderUntouched = img.data.every((v, i) => v === beforePixels[i]);
    out.stampCountAfterPaint = sculptStamps.length;

    // (3) commit: bakes the stack (field changes), a real renderNow ran (pixels change in the same
    //     pass — the currently-open view, here the default Biome map, updates immediately)
    const undoBefore = undoStack.length;
    sculptCommit();
    out.commitChangesField = !field.every((v, i) => v === beforeField[i]);
    out.commitChangesRender = !img.data.every((v, i) => v === beforePixels[i]);
    out.commitClearsStamps = sculptStamps.length === 0;
    out.commitPushedUndo = undoStack.length === undoBefore + 1;

    // (4) Ctrl+Z (field-level undo, since the draft above was already committed) reverts the bake
    const committedField = field.slice();
    undoLast();
    out.undoRevertsField = field.every((v, i) => v === beforeField[i]);
    out.undoDifferedFromCommitted = !field.every((v, i) => v === committedField[i]);

    // (5) LOD cursor/overlay: painting under Tiled LOD draws the stamp-footprint overlay without
    //     throwing (drawLODView's own tail calls this every frame while a stamp/stroke is live)
    const lc = document.getElementById('lodChk'); if (lc) lc.checked = true;
    _lodOn = true; _lodCx = GW / 2; _lodCy = GH / 2; _lodZoom = 4; applyView(); renderNow();
    _sculptType = 'hills'; _sculptSel = -1;
    _sculptCapturing = true; _sculptPts = [{ x: GW / 2 - 10, y: GH / 2 }, { x: GW / 2 + 10, y: GH / 2 }];
    sculptFinishStroke();
    let overlayThrew = false;
    try { sculptDrawLODOverlay(lodViewRect()); } catch (e) { overlayThrew = true; }
    out.lodOverlayDrawsWithoutError = !overlayThrew;
    sculptStamps = []; _sculptSel = -1; _sculptHistory = []; _sculptRedoStack = [];   // discard the LOD-mode draft directly (no confirm() dialog)
    _lodOn = false; if (lc) lc.checked = false; _lodZoom = 1; applyView(); renderNow();

    // (6) zoom-relative brush size: brushSize is stored in GRID CELLS, so its real-world (km)
    //     footprint is a pure function of state.mapWidthKm/GW — independent of view zoom — and the
    //     UI readout reflects that live as the slider (or the map's real-world width) changes.
    const brushEl = document.getElementById('sBrush'), kmEl = document.getElementById('sBrushKm');
    brushEl.value = 32; brushEl.dispatchEvent(new Event('input'));
    const kmAt32 = kmEl.textContent;
    out.kmReadoutAt32 = /≈ [\d.]+ km radius/.test(kmAt32);
    const numAt32 = parseFloat(kmAt32.replace('≈', '').trim());
    brushEl.value = 64; brushEl.dispatchEvent(new Event('input'));
    const numAt64 = parseFloat(kmEl.textContent.replace('≈', '').trim());
    out.kmReadoutDoublesWithBrushSize = Math.abs(numAt64 - 2 * numAt32) < 0.05;
    brushEl.value = 32; brushEl.dispatchEvent(new Event('input'));   // restore

    document.querySelector('#genSubBar [data-gsub="world"]').click();
    return out;
  });

  // ── v1.17: geography-driven settlement generation (audit S1–S7) ──
  R.v117 = await page.evaluate(async () => {
    const out = {};
    document.querySelector('#genSubBar [data-gsub="civ"]').click();
    document.getElementById('civAutoPopulateBtn').click();
    await new Promise(r => setTimeout(r, 150));
    const settlements = state.places.filter(p => p && p.category === 'settlement');
    out.nSettlements = settlements.length;
    out.allHaveSpecialisation = settlements.length > 0 && settlements.every(p => typeof p.specialisation === 'string');
    // S4 wall-spec ladder spot checks (pure function)
    const mk = (kind, pop, traits, extra) => Object.assign({ x: settlements[0].x, y: settlements[0].y, kind, pop, traits: traits || [], category: 'settlement' }, extra || {});
    out.fortressStone = _umWallSpec(mk('fortress', 300, [])) === 'stone';
    out.plainHamletNone = _umWallSpec(mk('hamlet', 80, [])) === 'none';
    out.overrideFalseWins = _umWallSpec(mk('capital', 15000, [], { umWalls: false })) === 'none';
    // S6: settlement function reaches the layout engine in-browser
    const c = _umPlaceContext(Object.assign({}, settlements[0], { specialisation: 'trade_hub' }));
    out.economyInCtx = !!(c.economy && c.economy.specialisation === 'trade_hub');
    const m = UME.cityGen(c.seed, c);
    out.warehouseTagged = !!m && m.parcels.some(par => par.district === 'warehouse');
    // S7: Site-profile raster view
    const btn = document.querySelector('#debugSeg button[data-d="siteprofile"]');
    out.siteprofileBtn = !!btn;
    if (btn) { btn.click(); await new Promise(r => setTimeout(r, 250)); }
    out.siteprofileState = state.debug;
    out.siteprofileLegend = (document.getElementById('legend') || { innerHTML: '' }).innerHTML.includes('buildable');
    document.querySelector('#debugSeg button[data-d="off"]').click();
    await new Promise(r => setTimeout(r, 120));
    // S7: settlement-diagnostics overlay draws on the civ canvas
    const ccv = document.getElementById('civCanvas');
    const snap = () => { const d = ccv.getContext('2d').getImageData(0, 0, ccv.width, ccv.height).data; let h = 2166136261 >>> 0; for (let i = 0; i < d.length; i += 97) { h ^= d[i]; h = Math.imul(h, 16777619) >>> 0; } return h; };
    const before = snap();
    const chk = document.getElementById('civDiagnosticsChk');
    out.diagChk = !!chk;
    if (chk) { chk.checked = true; chk.dispatchEvent(new Event('change')); await new Promise(r => setTimeout(r, 250)); }
    out.diagDraws = snap() !== before;
    if (chk) { chk.checked = false; chk.dispatchEvent(new Event('change')); await new Promise(r => setTimeout(r, 120)); }
    document.querySelector('#genSubBar [data-gsub="world"]').click();
    return out;
  });

  // ── v1.18: Interactive City Viewer (Explore mode) ──
  R.v118 = await page.evaluate(async () => {
    const out = {};
    const settlements = state.places.filter(p => p && p.category === 'settlement');
    let target = null;
    for (const p of settlements) { if (_umModelForNow(p)) { target = p; break; } }
    out.foundTarget = !!target;
    if (!target) return out;

    // regression guard: an empty-terrain click still fills the plain sidebar summary, modal stays shut.
    // Pick a corner cell provably far from EVERY settlement (not a hardcoded coord) — by this point
    // in the suite, many earlier phases have left small synthetic worlds/test settlements behind,
    // so a fixed low coordinate like (3,3) can coincide with a leftover pin and give a false failure.
    const cvSafeR2 = Math.max(100, (GW / 50) * (GW / 50));
    let emptyGx = 3, emptyGy = 3, triedCorner = false;
    for (const [cx, cy] of [[3, 3], [GW - 3, 3], [3, GH - 3], [GW - 3, GH - 3], [Math.floor(GW / 2), 3]]) {
      if (settlements.every(p => (p.x - cx) ** 2 + (p.y - cy) ** 2 > cvSafeR2)) { emptyGx = cx; emptyGy = cy; triedCorner = true; break; }
    }
    out.foundSafeEmptySpot = triedCorner;
    document.getElementById('civInfoPanel').innerHTML = '<div class="hint">reset</div>';
    _civInfoAt(emptyGx, emptyGy);
    out.emptyClickFillsPanel = document.getElementById('civInfoPanel').innerHTML !== '<div class="hint">reset</div>';
    out.emptyClickModalClosed = !document.getElementById('cityViewerModal').classList.contains('open');

    // a genuine settlement-pin click opens the viewer INSTEAD of the plain summary
    document.getElementById('civInfoPanel').innerHTML = '<div class="hint">reset2</div>';
    _civInfoAt(Math.round(target.x), Math.round(target.y));
    out.settlementClickOpensModal = document.getElementById('cityViewerModal').classList.contains('open');
    out.settlementClickSkipsPlainPanel = document.getElementById('civInfoPanel').innerHTML === '<div class="hint">reset2</div>';

    // info panel renders real sections, including the honest "not modeled" notes (never fabricated)
    const infoHtml = document.getElementById('cvInfoPanel').innerHTML;
    out.infoSectionsPresent = ['General', 'Economy', 'Infrastructure', 'Military', 'Religion', 'Demographics', 'History'].every(s => infoHtml.includes(s));
    out.infoHonestNotes = infoHtml.includes('not yet modeled') && infoHtml.includes('not modeled');

    // camera pan/zoom mutate state
    const cv = document.getElementById('cvCanvas');
    const s0 = _cvCam.scale;
    _cvZoomAt(cv.width / 2, cv.height / 2, 1.3);
    out.zoomChangesScale = _cvCam.scale !== s0;

    // LOD tiers reveal different pixels as the camera scale crosses a threshold
    const hashCanvas = () => { const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data; let h = 2166136261 >>> 0; for (let i = 0; i < d.length; i += 97) { h ^= d[i]; h = Math.imul(h, 16777619) >>> 0; } return h; };
    _cvCam = _cvFitCam(_cvModel, cv.width, cv.height); _cvCam.scale = 0.2; _cvRender();
    const hOverview = hashCanvas();
    _cvCam.scale = 3.5; _cvRender();
    out.lodTiersDiffer = hashCanvas() !== hOverview;

    // the Edit button routes to the EXISTING (untouched) Civilization-mode editor
    document.getElementById('cvEditBtn').click();
    await new Promise(r => setTimeout(r, 100));
    out.editOpensExistingPopup = document.getElementById('placeEditPopup').style.display !== 'none';
    _civClosePlacePopup();

    // close paths: × button and Escape both work; camera state clears
    document.getElementById('cvCloseBtn').click();
    out.closeButtonWorks = !document.getElementById('cityViewerModal').classList.contains('open') && _cvCam === null;
    _civOpenCityViewer(target);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    out.escapeWorks = !document.getElementById('cityViewerModal').classList.contains('open');

    // zero regression: the Civilization-mode settlement editor (_civOpenPlacePopup) still works,
    // completely independent of the new viewer
    _civSelectedPlace = target;
    _civOpenPlacePopup();
    out.civModeEditorUnaffected = document.getElementById('placeEditPopup').style.display !== 'none' && !!document.getElementById('placeEditPopupBody');
    _civClosePlacePopup(); _civSelectedPlace = null;

    return out;
  });

  // ── v1.19: Sculpt editor touch pan joystick (owner: "put a small graphic joystick in the
  // bottom right corner just as the cartalith v1.915 has" — on mobile, a single-finger drag over
  // the canvas is captured as a paint stroke, so there was no gesture left to pan with while
  // painting). Real touch-drag gestures aren't meaningfully simulable headlessly (the project's
  // own carve-out for canvas/touch interaction), so these assertions call the joystick's own pan
  // functions directly — exactly as a real pointerdown/pointermove would — and check the camera
  // state they drive, reusing the exact _lodOn on/off/reset convention already used throughout
  // this suite.
  R.v119 = await page.evaluate(async () => {
    const out = {};
    const pad = document.getElementById('sculptNavpad'), stick = document.getElementById('sculptNavStick'), knob = document.getElementById('sculptNavKnob');
    out.domPresent = !!(pad && stick && knob);

    // entering Sculpt on a non-touch (headless) browser never shows the joystick — isMobile is false
    document.querySelector('.tab[data-tab="generate"]').click();
    document.querySelector('#genSubBar [data-gsub="sculpt"]').click();
    await new Promise(r => setTimeout(r, 50));
    out.sculptActiveOnTab = _sculptEditorActive();
    out.hiddenOnDesktop = getComputedStyle(pad).display === 'none';

    // v1.22 (owner: "the joystick works in the opposite direction that we push"): pushing the knob
    // RIGHT makes the VIEW travel right — i.e. content scrolls left, so viewT.panX DECREASES (the
    // joystick moves the camera the way you push, not the drag-the-content convention the v1.19 port
    // wrongly used). At the default cover-fit scale there's no slack to pan into (_viewClampFill snaps
    // straight back), so zoom in first — exactly what a real user would do before nudging the stick.
    _lodOn = false;
    const vwr = view.getBoundingClientRect();
    zoomAt(vwr.left + vwr.width / 2, vwr.top + vwr.height / 2, 3);
    const px0 = viewT.panX;
    _sculptNavSetKnob(20, 0);                                     // push right
    await new Promise(r => setTimeout(r, 150));
    out.pushRightPansViewRight = viewT.panX < px0;                // v1.22: panX decreases ⇒ view travels right
    _sculptNavResetKnob();
    const pxStopped = viewT.panX;
    await new Promise(r => setTimeout(r, 150));
    out.resetActuallyStopsLoop = viewT.panX === pxStopped;

    // dead zone: a tiny push doesn't start panning at all
    const px1 = viewT.panX;
    _sculptNavSetKnob(1, 1);
    await new Promise(r => setTimeout(r, 100));
    out.deadZoneIgnoresTinyPush = viewT.panX === px1;
    _sculptNavResetKnob();
    zoomAt(vwr.left + vwr.width / 2, vwr.top + vwr.height / 2, 1 / 3);   // restore the default fit scale

    // knob deflection is clamped to MAX_OFFSET and recenters on release (parse the px values —
    // Chromium re-serializes .style.transform with its own comma/space convention, so compare the
    // numbers it wrote, not an exact literal string)
    const knobXY = () => { const m = /translate\(([-\d.]+)px,\s*([-\d.]+)px\)/.exec(knob.style.transform); return m ? [+m[1], +m[2]] : null; };
    _sculptNavSetKnob(999, 0);
    const kXY = knobXY();
    out.knobClampsOffset = !!kXY && Math.abs(kXY[0] - 24) < 0.01 && Math.abs(kXY[1]) < 0.01;
    _sculptNavResetKnob();
    const kXY2 = knobXY();
    out.knobResetsToCenter = !!kXY2 && kXY2[0] === 0 && kXY2[1] === 0;

    // under Tiled LOD, the SAME stick drives _lodCx/_lodCy instead (mirrors the existing _lodPan
    // handler) — and v1.22's corrected direction holds here too: push right ⇒ _lodCx INCREASES (camera
    // centre moves right ⇒ view travels right), the sign the `_lodCx -= _svx` branch produces once _svx
    // is negated.
    const lc = document.getElementById('lodChk'); if (lc) lc.checked = true;
    _lodOn = true; _lodCx = GW / 2; _lodCy = GH / 2; _lodZoom = 4; applyView(); renderNow();
    const cx0 = _lodCx;
    _sculptNavSetKnob(20, 0);                                     // push right
    await new Promise(r => setTimeout(r, 150));
    out.lodPanDrivesLodCx = _lodCx > cx0;                         // v1.22: push right ⇒ _lodCx increases ⇒ view travels right
    _sculptNavResetKnob();
    _lodOn = false; if (lc) lc.checked = false; _lodZoom = 1; applyView(); renderNow();

    // leaving Sculpt/Generate and coming back cycles _sculptNavSync with no throw
    document.querySelector('#genSubBar [data-gsub="world"]').click();
    document.querySelector('.tab[data-tab="explore"]').click();
    document.querySelector('.tab[data-tab="generate"]').click();
    await new Promise(r => setTimeout(r, 50));
    out.noThrowOnTabCycle = true;

    return out;
  });

  // ── v1.20: expanded natural-feature vocabulary (owner: "let's go up to 4/5 different possible
  // tree types (and for other landscape types and features) that can be placed at relatively
  // random") — trees grew from 2 to 5 biome-conditioned kinds, plus new shrub/cactus/boulder
  // ground scatter, all also manually placeable via the Icon tool's "Feature icons" family
  // exactly like the original 4. The auto-scatter placement logic itself (placeMapIcons) is
  // covered in depth by the headless engine suite (tests/test_tail.js); this block only proves
  // the manual-placement side (gallery/arm/place/draw) works end-to-end in the real UI.
  R.v120 = await page.evaluate(async () => {
    const out = {};
    document.querySelector('.tab[data-tab="generate"]').click();
    document.querySelector('#genSubBar [data-gsub="carto"]').click();
    await new Promise(r => setTimeout(r, 50));

    // the gallery is populated at load time with the default 'feature' family (v1.20.html:19671)
    const gal = document.getElementById('carIconGallery');
    const famSel = document.getElementById('carIconFam');
    famSel.value = 'feature'; famSel.dispatchEvent(new Event('change'));
    await new Promise(r => setTimeout(r, 50));
    out.featureTileCount = gal.querySelectorAll('figure.caropt:not(.none)').length;

    // arm one of the NEW kinds and place it — same {x,y,fam,slot,scale} shape the real
    // click-to-place handler constructs (v1.20.html ~7911-7914), just without simulating exact
    // canvas pointer coordinates
    const before = state.mapIcons.length;
    _carIconGalleryPick('feature', 'cactus');
    out.armedCactus = !!_carIconArmed && _carIconArmed.fam === 'feature' && _carIconArmed.slot === 'cactus';
    const gx = Math.floor(GW / 2), gy = Math.floor(GH / 2);
    state.mapIcons.push({ x: gx, y: gy, fam: _carIconArmed.fam, slot: _carIconArmed.slot, scale: 1 });
    renderNow();
    out.placedCactus = state.mapIcons.length === before + 1 && state.mapIcons[state.mapIcons.length - 1].slot === 'cactus';

    // it draws (pack sprite or the generic circle+glyph fallback) without throwing
    let threw = false;
    try { drawCivLayerAuto(); } catch (e) { threw = true; }
    out.drawsWithoutThrow = !threw;

    // every new feature-icon key has a real glyph fallback (no missing entries)
    out.allNewKeysHaveGlyphs = ['tree_rainforest', 'tree_savanna', 'tree_wetland', 'shrub', 'cactus', 'boulder']
      .every(k => CIV_FEATURE_ICON_TYPES.some(t => t.key === k && t.glyph));

    // the sample pack's 10 icon slots exactly match the engine's PACK_ICON_SLOTS vocabulary
    out.packIconSlotsCount = PACK_ICON_SLOTS.length;

    // clean up: remove the placed test icon and disarm so it doesn't leak into later assertions
    state.mapIcons.pop();
    _carIconGalleryPick(null);
    renderNow();

    return out;
  });

  // ── v1.21: sprite-sheet slicer zoom/pan (owner: "I'd like zoom and pan buttons and an option
  // for the viewer to zoom. That way it should be easier to work accurately with larger
  // resolution sheets.") — SpriteSheetImporter lives inside the Asset Library's own IIFE (block 3)
  // and is deliberately not exposed on window, so this block drives it purely through the DOM/real
  // input, the same way an actual user would, rather than reaching into module internals. Pan-drag
  // and click-to-select use real Playwright mouse events (not page.evaluate-dispatched synthetic
  // PointerEvents) because canvas.setPointerCapture requires a genuinely browser-tracked pointer.
  R.v121 = {};
  {
    const b64 = await page.evaluate(async () => {
      const cv = document.createElement('canvas'); cv.width = 4096; cv.height = 2731;
      const cx = cv.getContext('2d');
      for (let i = 0; i < 20; i++) { cx.fillStyle = `hsl(${i * 17},60%,50%)`; cx.fillRect((i % 5) * 800, Math.floor(i / 5) * 700, 780, 680); }
      const blob = await new Promise(res => cv.toBlob(res, 'image/png'));
      const buf = await blob.arrayBuffer();
      let binary = ''; const bytes = new Uint8Array(buf);
      for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
      return btoa(binary);
    });
    await page.evaluate(() => { if (!document.getElementById('assetsHeaderBtn').classList.contains('on')) document.getElementById('assetsHeaderBtn').click(); });
    await page.waitForTimeout(150);
    await page.evaluate(() => document.getElementById('alSlicerBtn').click());
    await page.waitForTimeout(100);
    await page.setInputFiles('#alSheetPicker', { name: 'v121_big_sheet.png', mimeType: 'image/png', buffer: Buffer.from(b64, 'base64') });
    await page.waitForTimeout(200);

    R.v121.scaffold = await page.evaluate(() => ({
      zoomToolbarShown: getComputedStyle(document.getElementById('alSlZoom')).display !== 'none',
      hasPanBtn: !!document.querySelector('#alSlMode [data-m="pan"]'),
      cvW0: document.getElementById('alSlCv').width, pct0: document.getElementById('alSlZoomPct').textContent,
    }));

    R.v121.zoomButtons = await page.evaluate(() => {
      const before = document.getElementById('alSlCv').width;
      document.getElementById('alSlZoomIn').click(); document.getElementById('alSlZoomIn').click(); document.getElementById('alSlZoomIn').click();
      const afterIn = { w: document.getElementById('alSlCv').width, pct: document.getElementById('alSlZoomPct').textContent, scrollable: document.getElementById('alSlWrap').scrollWidth > document.getElementById('alSlWrap').clientWidth };
      document.getElementById('alSlZoomFit').click();
      const afterFit = { w: document.getElementById('alSlCv').width, pct: document.getElementById('alSlZoomPct').textContent, scrollLeft: document.getElementById('alSlWrap').scrollLeft };
      return { before, afterIn, afterFit };
    });

    // real-mouse Pan-mode drag
    await page.evaluate(() => {
      document.getElementById('alSlZoomIn').click(); document.getElementById('alSlZoomIn').click();
      document.getElementById('alSlZoomIn').click(); document.getElementById('alSlZoomIn').click();
      document.querySelector('#alSlMode [data-m="pan"]').click();
      document.getElementById('alSlWrap').scrollLeft = 200; document.getElementById('alSlWrap').scrollTop = 150;
    });
    await page.waitForTimeout(50);
    let r = await page.evaluate(() => { const b = document.getElementById('alSlCv').getBoundingClientRect(); return { x: b.left, y: b.top }; });
    const panBefore = await page.evaluate(() => ({ l: document.getElementById('alSlWrap').scrollLeft, t: document.getElementById('alSlWrap').scrollTop }));
    await page.mouse.move(r.x + 300, r.y + 300);
    await page.mouse.down();
    await page.mouse.move(r.x + 240, r.y + 230, { steps: 5 });
    const panCursor = await page.evaluate(() => document.getElementById('alSlCv').className);
    await page.mouse.up();
    const panAfter = await page.evaluate(() => ({ l: document.getElementById('alSlWrap').scrollLeft, t: document.getElementById('alSlWrap').scrollTop, cls: document.getElementById('alSlCv').className }));
    R.v121.pan = { before: panBefore, duringCursor: panCursor, after: panAfter,
      movedCorrectly: (panBefore.l - (r.x + 240 - (r.x + 300))) === panAfter.l && (panBefore.t - (r.y + 230 - (r.y + 300))) === panAfter.t };

    // cell-select still hits the right cell at a non-fit zoom (the real regression risk — proves
    // evToSrc needed no changes for the new camera)
    await page.evaluate(() => {
      document.querySelector('#alSlMode [data-m="select"]').click();
      document.getElementById('alSlZoomFit').click();
      document.getElementById('alSlCols').value = 4; document.getElementById('alSlCols').dispatchEvent(new Event('input'));
      document.getElementById('alSlRows').value = 4; document.getElementById('alSlRows').dispatchEvent(new Event('input'));
      document.getElementById('alSlZoomIn').click(); document.getElementById('alSlZoomIn').click();
      document.getElementById('alSlWrap').scrollLeft = 0; document.getElementById('alSlWrap').scrollTop = 0;
    });
    await page.waitForTimeout(80);
    r = await page.evaluate(() => { const b = document.getElementById('alSlCv').getBoundingClientRect(); return { x: b.left, y: b.top }; });
    const selBefore = await page.evaluate(() => document.getElementById('alSlCount').textContent);
    await page.mouse.click(r.x + 40, r.y + 40);
    const selAfter = await page.evaluate(() => document.getElementById('alSlCount').textContent);
    R.v121.selectAtZoom = { selBefore, selAfter, pct: await page.evaluate(() => document.getElementById('alSlZoomPct').textContent) };

    // wheel-zoom-to-cursor
    await page.evaluate(() => document.getElementById('alSlZoomFit').click());
    await page.waitForTimeout(50);
    const pctBefore = await page.evaluate(() => document.getElementById('alSlZoomPct').textContent);
    r = await page.evaluate(() => { const b = document.getElementById('alSlCv').getBoundingClientRect(); return { x: b.left + 150, y: b.top + 100 }; });
    await page.mouse.move(r.x, r.y);
    await page.mouse.wheel(0, -400);
    await page.waitForTimeout(80);
    R.v121.wheelZoom = { pctBefore, pctAfter: await page.evaluate(() => document.getElementById('alSlZoomPct').textContent) };

    await page.evaluate(() => document.getElementById('alSlClose').click());
    await page.evaluate(() => { const b = document.getElementById('assetsHeaderBtn'); if (b && b.classList.contains('on')) b.click(); });
  }

  // ── v1.23: Journey Planner travel fixes + settlement pick-radius zoom scaling (block 2) ──
  // BUG 1 (owner: "Coastal Waters faster than Open Sea — historically backwards"): the sea water-type
  // modifier (JP_TERRAIN.sea) must rank Open Sea above Coastal Waters (wind/current is a SEPARATE axis
  // in JP_ROUTE.sea). BUG 2 (owner: "autoselect assigns a vessel to a leg it isn't fit for, only caught
  // downstream"): the selector (_jpVesselFits) and validator (_jpVesselWaterBlock, which jpCalcWater now
  // calls) share ONE source of truth, so an autoselected vessel can never be flagged invalid. All pure
  // JP data/functions — no world/DOM needed beyond GW being defined (generated earlier in this run).
  R.v123 = await page.evaluate(() => {
    const out = {};
    out.sea = { sheltered: JP_TERRAIN.sea['Sheltered Bay'], coastal: JP_TERRAIN.sea['Coastal Waters'],
                open: JP_TERRAIN.sea['Open Sea'], rough: JP_TERRAIN.sea['Rough Open Sea'] };
    out.openFasterThanCoastal = JP_TERRAIN.sea['Open Sea'] > JP_TERRAIN.sea['Coastal Waters'];
    out.shelteredNotFastest = JP_TERRAIN.sea['Sheltered Bay'] < JP_TERRAIN.sea['Open Sea'];

    const seaT = Object.keys(JP_TERRAIN.sea), rivT = Object.keys(JP_TERRAIN.river);
    const stages = [...seaT.map(t => ({ cat: 'sea', terrain: t })), ...rivT.map(t => ({ cat: 'river', terrain: t }))];
    let mismatches = 0, autoInvalid = 0, autoPicks = 0, checks = 0;
    for (const st of stages) {
      const pick = JP_VESSEL_PREFERENCE.find(n => _jpVesselFits(n, [st]));
      if (pick) { autoPicks++; if (_jpVesselWaterBlock(JP_SHIPS[pick], st.cat, st.terrain, pick)) autoInvalid++; }
      for (const n of Object.keys(JP_SHIPS)) {
        checks++;
        const fits = _jpVesselFits(n, [st]);
        const blocked = !!_jpVesselWaterBlock(JP_SHIPS[n], st.cat, st.terrain, n);
        if (fits === blocked) mismatches++;   // fits must be the exact negation of blocked
      }
    }
    out.selValidatorMismatches = mismatches; out.autoInvalid = autoInvalid; out.autoPicks = autoPicks; out.checks = checks;

    // end-to-end through the REAL validator: autoselect a vessel for an Open Sea leg, run jpCalcWater,
    // confirm it is NOT blocked (proves jpCalcWater consumes the shared compat rule, not a stale copy)
    const mkStage = (cat, terrain) => ({ km: 60, cat, terrain, routeCond: 'Neutral', infra: 'auto', biome: 'Temperate Forest' });
    const mkPlan = (vessel) => ({ vessel, pace: 'Standard Pace', season: 'Summer', groupSize: 4, cargoKg: 0, hours: 10, carryFood: false });
    const openStage = mkStage('sea', 'Open Sea');
    const autoOpen = JP_VESSEL_PREFERENCE.find(n => _jpVesselFits(n, [openStage]));
    out.autoOpenPick = autoOpen;
    out.autoOpenNotBlocked = autoOpen ? !jpCalcWater(openStage, mkPlan(autoOpen)).blocked : false;
    // the validator STILL fires for a genuinely infeasible manual pick (river-only barge on open sea)
    out.manualInfeasibleStillBlocked = !!jpCalcWater(openStage, mkPlan('River Barge')).blocked;
    // dhow spot-check: openSea-capable (historically correct — monsoon ocean trader), sea not river
    out.dhow = { openSea: JP_SHIPS['Dhow'].openSea, fitsOpenSea: _jpVesselFits('Dhow', [openStage]),
                 fitsCoastal: _jpVesselFits('Dhow', [mkStage('sea', 'Coastal Waters')]),
                 fitsRiver: _jpVesselFits('Dhow', [mkStage('river', 'Calm River')]) };

    // settlement pick radius must SHRINK as you zoom in (constant on-screen), off-LOD and under LOD
    const sLod = _lodOn, sZoom = (typeof _lodZoom !== 'undefined' ? _lodZoom : 1), sScale = (viewT ? viewT.scale : 1);
    _lodOn = false; if (viewT) viewT.scale = 1; const r1 = _civZoomPickR(20);
    if (viewT) viewT.scale = 4; const r4 = _civZoomPickR(20);
    _lodOn = true; _lodZoom = 8; const rLod = _civZoomPickR(20);
    _lodOn = sLod; if (typeof _lodZoom !== 'undefined') _lodZoom = sZoom; if (viewT) viewT.scale = sScale;
    out.pickR = { atZoom1: r1, atZoom4: r4, atLod8: rLod };
    out.pickShrinksOnZoomIn = (r4 < r1) && (rLod < r1) && (Math.abs(r1 - 20) < 1e-9);
    return out;
  });

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
  A('sidebar Scale & calibration keeps the units toggle; v0.83 dropped the map-width reference legend', R.sidebarScale.unitSeg === 2 && R.sidebarScale.noMapwLegend);
  A('v0.70 sea level moves the coastline in the base view', R.seaMovesCoast === true);
  A('v0.83 map width has no sidebar control (setup-gate-only, unchanged by generate())', R.scaleLocked === true);
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
  A('v0.81 regional population auto-fills the readout on populate (no manual button)', R.popAuto && R.popAuto.autoFilled && R.popAuto.noButton);
  A('v0.81 capacity-grounded settlement populations are all positive', R.popAuto && R.popAuto.allPos);
  A('v0.82 recovery: a city collapses into a fortified ruin under Survival + tier-from-population is sane', R.recovery && R.recovery.demoted && R.recovery.tierFn);
  A('v0.82 recovery: Survival phase drops total population far below Stable, with ruins', R.recovery && R.recovery.collapses && R.recovery.someRuins);
  A('v0.77 wetland mask agrees exactly with buildCartBiome Wetlands class (two pipelines unified)', R.wetland && R.wetland.agree);
  A('v0.77 wetland residual lowers carrying capacity on wetland cells under biomeK (or no wetlands on this world)', R.wetland && R.wetland.kEffect === true);
  A('v0.78 transshipments: counts land↔water mode-changes (0/1/2/4)', R.transfer && R.transfer.landOnly === 0 && R.transfer.oneCross === 1 && R.transfer.landSeaLand === 2 && R.transfer.multi === 4);
  A('v0.78 transfer overhead: compounding (1.05^n − 1), monotone, 0 at n=0', R.transfer && R.transfer.ov0 === 0 && R.transfer.ovCompound && R.transfer.ovMonotone);
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
  A('Generate sub-tab bar has world/civ/carto/sculpt (v1.15 adds the Sculpt editor)', JSON.stringify(R.subTabs) === JSON.stringify(['world','civ','carto','sculpt']));
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
  A('v0.92: Clear places & routes also wipes ways/journeys, not just settlements', !R.clearPlacesAlsoClearsRoutes.hadWaysBefore ||
    (R.clearPlacesAlsoClearsRoutes.dialogAccepted && R.clearPlacesAlsoClearsRoutes.placesCleared && R.clearPlacesAlsoClearsRoutes.waysCleared && R.clearPlacesAlsoClearsRoutes.journeysCleared));
  A('dismissing the confirm preserves the place', R.placesSurviveDismiss === true);
  A('v0.90: selecting a place opens the editor in the map pop-up (not the sidebar)', R.editorInPopup === true && R.editorNotInInspector === true);
  A('v0.90: the place pop-up is positioned on-screen', R.popupOnScreen === true);
  A('settlement list no longer has an inline editor', R.noInlineEditorInList === true);
  A('editing the pop-up name field updates the model', R.liveModelUpdate === true);
  A('the row summary patches live from the pop-up edit', R.liveRowPatch === true);
  A('selecting a label swaps the inspector to the label editor', R.labelEditorSwapsIn === true);
  A('selecting a label deselects the place (single selection)', R.selectingLabelDeselectsPlace === true);
  A('v0.90: selecting a label closes the place pop-up', R.selectingLabelClosesPlacePopup === true);
  A('selecting the place again deselects the label', R.selectingPlaceDeselectsLabel === true);
  A('v0.90: the pop-up × button closes it and deselects the place', R.popupCloseButtonWorks === true);
  A('Layers popover shows hotkey badges (>=6)', R.keyBadges.length >= 6);
  A('pressing B sets the Biomes layer', R.debugAfterB === 'bclass');
  A('pressing F sets the Flow layer', R.debugAfterF === 'flow');
  A('typing "B" in a text field does not trigger the hotkey', R.debugUnchangedWhileTyping === true);
  A('tab bar is a genuine 2-position phase switch', R.tabCount === 2 && R.tabsOnly2 === true);
  A('v0.87: consolidated File ▾ dropdown opens with both Import and Export sections', R.fileMenuOpen === true && R.fileMenuHasBoth.hasImport && R.fileMenuHasBoth.hasExport);
  A('v0.87: ticking an Export-form control keeps the File menu open', R.fileMenuHasBoth.stillOpenAfterFormClick === true);
  A('v0.88: standalone atlas import/export retired; File → Export .zip is the sole 100% round-trip', R.atlasStandaloneGone.noImportBtnInFileMenu && R.atlasStandaloneGone.noEmbedCheckbox && R.atlasStandaloneGone.noExportBtnInSidebar);
  A('v0.88: dedicated asset-pack import/export stays in the Assets Library menu', R.atlasStandaloneGone.packStillInAssetsLibrary === true);
  A('v0.92: layers/*.png previews are opt-in (off by default), not unconditional', R.exportTrim.noLayersByDefault);
  A('v0.92: layers/*.png previews appear when the new checkbox is ticked', R.exportTrim.layersWhenChecked);
  A('v0.92: map.png still bakes for a non-finalized export (unchanged default behavior)', R.exportTrim.mapPngWhenNotFinalized);
  A('v0.92: map.png/tiles skipped for a finalized export (Atlas pyramid already covers the map)', R.exportTrim.noMapPngWhenFinalized);
  A('v0.92: "Tiles & LOD" split into three labeled sections (Tiled LOD view / Atlas cache / Region export)', R.tilesLodSplit.hasThreeLabels && R.tilesLodSplit.noOldCombinedLabel);
  A('v0.92: every id from the old combined accordion still resolves after the split', R.tilesLodSplit.allIdsStillResolve);
  A('v0.88: LOD zoom cap reaches a ≤5km view span at the default 800km map width', R.lodZoomDeep.reachesFiveKm === true && R.lodZoomDeep.maxZoom >= 160);
  A('v0.88: scale bar reading shrinks as LOD zoom deepens (was frozen at the full map width)', R.lodZoomDeep.labelChanged === true && R.lodZoomDeep.spanIn < R.lodZoomDeep.spanOut);
  A('v0.89: every info-layer stays tiled while LOD is on (renderNow never falls through to the full un-zoomed pixel loop)', R.lodInfoLayers.neverFullPixelLoop === true);
  A('v0.89: LOD-zoomed info layers + their reprojected overlays render without errors', R.lodInfoLayers.errors.length === 0);
  A('v0.89: LOD-zoomed info-layer tiles genuinely differ from the whole-map render (not a stretched copy)', R.lodInfoLayers.differsFromOverview === true);
  A('v0.91 fix: the opacity slider still affects the map while Tiled LOD is on', R.lodOpacity.differsWithOpacity === true);
  A('v0.91 fix: settlement click-to-info works under Tiled LOD', R.lodClickInfo.settleOk === true);
  A('v0.91 fix: wildlife click-to-info works under Tiled LOD', R.lodClickInfo.wildOk === true);
  A('v0.92 fix: LOD overview rebuild stays fast on a zoom step (was ~940-1200ms, now capped to a 512px target width)', R.lodOverviewPerf.overviewRebuildMs < 400);
  A('v0.92 follow-up fix: overview canvas is capped at 512px wide, not a flat GW/4 (was 256px at this 1024px world → blocky lakes)', R.lodOverviewPerf.overviewW === 512);
  A('v0.92 follow-up fix: overview canvas keeps GW/GH aspect ratio', Math.abs(R.lodOverviewPerf.overviewW / R.lodOverviewPerf.overviewH - R.lodOverviewPerf.GW / R.lodOverviewPerf.GH) < 0.01);
  A('v0.93 optimization: a zoom step with a previous overview in hand returns near-instantly (stretch + defer, not a full rebuild)', R.lodProgressiveOverview.hadPrevBeforeZoom === true && R.lodProgressiveOverview.zoomStepMs < 30);
  A('v0.93 optimization: the zoom step schedules a background rebuild instead of skipping it', R.lodProgressiveOverview.scheduledRebuild === true);
  A('v0.93 optimization: the deferred rebuild lands the correct (not stale) zoom level shortly after', R.lodProgressiveOverview.finalZ === R.lodProgressiveOverview.expectedZ && R.lodProgressiveOverview.stillPending === false);
  A('v0.93 hotfix: a rapid multi-tick zoom gesture bounds the consecutive-stretch streak (was unbounded — "lakes blocky again")', R.lodOverviewStretchCap.streakAfterBurst <= 4);
  A('v0.93 hotfix: the overview actually resyncs at least once during a rapid multi-tick burst (not stuck on the original capture)', R.lodOverviewStretchCap.refreshedMidBurst === true);
  A('v0.93 optimization: GENPOOL is usable in a real browser (Worker support present)', R.lodRefinePool.poolUsable === true);
  A('v0.93 optimization: refineVisibleTiles via the pool is faster than the forced-sync fallback', R.lodRefinePool.withPoolMs < R.lodRefinePool.syncOnlyMs);
  A('v0.93 optimization: pooled tile refinement produces the same data as the sync fallback', R.lodRefinePool.allMatch === true);
  A('v0.93 optimization: GENPOOL is usable for the bakeAllTiles pool path', R.bakeAllTilesPool.poolUsable === true);
  A('v0.93 optimization: bakeAllTiles via the pool bakes the same chunk set as the forced-sync fallback', R.bakeAllTilesPool.nBaked === R.bakeAllTilesPool.nBakedSync && R.bakeAllTilesPool.syncBaked && R.bakeAllTilesPool.poolBaked);
  A('v0.93 optimization: bakeAllTiles via the pool is faster than the forced-sync fallback for a multi-level bake', R.bakeAllTilesPool.withPoolMs < R.bakeAllTilesPool.syncOnlyMs);
  A('v0.92 follow-up fix: checking "Tiled LOD view" alone (no pan/zoom) auto-refines the visible tile', R.lodCheckboxAutoRefine.cachedAfterCheck === true);
  A('v0.92 follow-up fix: unchecking the box before the deferred refine settles throws no errors', R.lodCheckboxAutoRefine.noNewErrors === true);
  A('v0.94: "Draw rivers as ways" checkbox reflects the new default-on state', R.riverWays.checkboxReflectsDefault === true);
  A('v0.94: a real river cell is found on the fixed-seed world (test precondition)', R.riverWays.foundRiverSpot === true);
  A('v0.94: river ways toggle produces a real pixel difference on the main canvas', R.riverWays.mainDiffPx > 0);
  A('v0.94: river ways toggle produces a real pixel difference under Tiled LOD (closes the old "LOD shows no river color" gap)', R.riverWays.lodDiffPx > 0);
  A('v1.14: surfaceColor skips its own raster river blend when the vector overlay (riverWays) is on — no more double-rendering the same network (the "two engines... in close proximity" report)', R.riverWays.dedupDiffer === true);
  A('v0.94 routing fix: both fixed-seed coastal detour pairs resolve to a valid mixed route', R.routingSeaShortcut.pairs.every(p => p.ok));
  A('v0.94 routing fix: a coastal route with a land detour now uses a real sea shortcut (was ~5-6% water, now materially more)', R.routingSeaShortcut.pairs.every(p => p.waterFrac >= 0.2));
  A('v0.87: LOD/atlas mode fills the viewport (was stuck at intrinsic world px) and restores on exit', R.lodViewport.filled && R.lodViewport.restored && R.lodViewport.hadInlineCleared);
  A('Assets header button enters full-viewport Asset Library mode', R.assetsCanvasHidden === true && R.assetsLibraryShown === true);
  A('clicking Generate exits Assets mode', R.assetsExitedViaGenerate === true);
  A('v0.85 collapse: proximity graph + betweenness identify the hub as most central', R.collapseSim.hubMaxBtw);
  A('v0.85 collapse: conflict character stresses an undefended hamlet more than a fortified/exchange city', R.collapseSim.conflictHitsUndefended);
  A('v0.85 collapse: mortality/migration rates rise monotonically with stress×severity, capped at doc ceilings', R.collapseSim.ratesMonotonic && R.collapseSim.ratesCapped);
  A('v0.85 collapse: gravity migration conserves mass and prefers the nearer destination', R.collapseSim.massConserved && R.collapseSim.distanceDecay);
  A('v0.85 collapse: one step is deterministic and reduces total population under high severity', R.collapseSim.deterministic && R.collapseSim.collapseReducesPop);
  A('v0.85 recovery: logistic regrowth increases total population', R.collapseSim.recoveryGrows);
  A('v0.85 collapse: a 5-step trajectory returns 5 snapshots with non-increasing population', R.collapseSim.trajLen === 5 && R.collapseSim.monotonicDecline);
  A('v0.85 UI: mode toggle shows/hides Character+Severity vs. Regrowth-rate rows', R.collapseSimUI.collapseCharRowShown && R.collapseSimUI.collapseRateRowHidden && R.collapseSimUI.recoveryCharRowHidden && R.collapseSimUI.recoveryRateRowShown);
  A('v0.85 UI: severity slider updates its live label', R.collapseSimUI.severityLabelUpdates);
  A('v0.85 UI: Simulate writes one civTimeline entry per step, each carrying settlements', R.collapseSimUI.timelineGotFiveSteps && R.collapseSimUI.stepsHaveSettlements);
  A('v0.85 UI: simulating never touches state.places/civWays (writes history, not the live world)', R.collapseSimUI.placesUntouched && R.collapseSimUI.waysUntouched);
  A('v0.85 UI: result summary reports mortality/migration/failure stats', R.collapseSimUI.outHasStats);
  A('v0.85 fix: annual rates compound over stepYears (10-yr step kills more than 1-yr)', R.collapseSim.compounding);
  A('v0.85 fix: baseline centrality map keyed by tid over ALL input settlements', R.collapseSim.baselineContract);
  A('v0.85 fix: saturated-destination overflow re-flows while system headroom remains (doc §5)', R.collapseSim.overflowReflows);
  A('v0.85 fix: empty-timeline simulation conjures no phantom year-0 era', R.collapseSimUI2.noPhantomZero);
  A('v0.85 fix: overwriting authored timeline years is confirm-guarded (dismiss aborts)', R.collapseSimUI2.overwriteGuarded);
  A('v0.91: the old Polity-section slider is gone — one slider now, in Explore', R.timelineOneHome.singleHome);
  A('v0.91: Add year / pills / Simulate all live inside Explore → Timeline', R.timelineOneHome.controlsInExplore);
  A('v0.91: Civilization → Polity no longer duplicates the timeline/simulate controls', R.timelineOneHome.controlsNotInPolity);
  A('v0.91: the slider+playback row is hidden with <2 recorded years, shown with >=2', R.timelineOneHome.sliderHiddenAt1 && R.timelineOneHome.sliderShownAt2);
  A('v0.91: slider min/max are the real recorded years, not a 0..count-1 index', R.timelineOneHome.realScale);
  A('v0.91: tick marks (datalist) sit at the real recorded years', R.timelineOneHome.ticksAtRealYears);
  A('v0.91: dragging the slider snaps to the nearest recorded year on both sides', R.timelineOneHome.snappedNearest && R.timelineOneHome.snappedToOther);
  A('v0.91 fix: Timeline is not hidden inside the filter funnel popover', R.timelineDiscoverable.notInFunnel && R.timelineDiscoverable.inExplorePanel);
  A('v0.91 fix: Timeline is visible in Explore with no clicks (not behind a closed funnel/details)', R.timelineDiscoverable.visibleWithoutClicks);
  A('v0.91 fix: Timeline section has its own heading, like Info/Journeys', R.timelineDiscoverable.hasHeading);
  A('v0.86: "Simulate weather" repaints the map (climate bake-cache keyed on _climGen)', R.climateRedraw.changed);
  A('v0.86: theme switch flips :root[data-theme]=light, persists, and toggles back to dark', R.theme.wentLight && R.theme.stored === 'light' && R.theme.backToDark && R.theme.startDark);
  A('v0.86: credits modal opens (3 principle sections + Strahler/gravity/V1.915 citations)', R.credits.open && R.credits.sections === 3 && R.credits.hasStrahler && R.credits.hasGravity && R.credits.hasV1915);
  A('v0.86: credits modal closes on Escape', R.creditsClosed);
  A('v0.86: Layers-popover wheel does not reach the canvas-wrap map-zoom handler', R.popoverWheel.containedFromMap);
  A('v0.86: Assets header button toggles into the library ("← Map") and back to the canvas', R.assetsToggle.inAssets && R.assetsToggle.back);
  A('v0.86: every Layers-popover view has a visible, non-empty legend', R.allLegends.total > 25 && R.allLegends.bad === 0);
  A('v0.86: geological Resources layer is full-map (present below sea) and re-derives on a sea-level change', R.resources.fullMap && R.resources.reDerivedAfterSeaMove && R.resources.persistsUnderRaisedSea);

  // ── v0.95: urban morphology (deep-zoom settlement layouts) ──
  A('v0.95: settlement found on the auto-populated world (test precondition)', R.urbanMorph.ok === true);
  A('v0.95: "Generate settlement layouts" toggle defaults off (state + checkbox)', R.urbanMorph.defaultOff === true && R.urbanMorph.checkboxReflectsDefault === true);
  A('v0.95: enabling the toggle at deep zoom produces a real pixel difference on the civ canvas', R.urbanMorph.diffPx > 0);
  A('v0.95: a settlement whose model is ready is marked revealed (pin fades complementary to the layout)', R.urbanMorph.revealedWithModel === true);
  A('v0.95: settlement popup gains Age (years) and Fortifications fields', R.urbanMorph.hasAgeEl === true && R.urbanMorph.hasWallsEl === true);
  A('v0.95: editing Age invalidates the cached layout (cache key changes)', R.urbanMorph.cacheInvalidatesOnAgeEdit === true);
  A('v0.95: clearing Age back to blank restores the auto-inferred cache key', R.urbanMorph.ageBackToAuto === true);
  A('v0.95: layout generation is deterministic for identical inputs (hashModel matches)', R.urbanMorph.deterministic === true);
  // ── v0.96: urban-morphology fixes ──
  A('v0.96: a connected settlement yields route ends from its real roads (road-lock precondition)', R.umRoadEnds.ok === true && R.umRoadEnds.connectedGetsEnds === true);
  A('v0.96: a spot with no road endpoint at it yields no route ends (coordinate match, not aIdx/proximity)', R.umRoadEnds.ok !== true || R.umRoadEnds.disconnectedGetsNone === true);
  // ── v0.97: town built around the real roads ──
  A('v0.97: a connected walled settlement feeds dense resampled road paths into the generator', R.umBuildAround.ok === true && R.umBuildAround.usesPaths === true && R.umBuildAround.dense === true);
  A('v0.97: the town built around real roads still forms a wall and full-extent primaries (not stubs)', R.umBuildAround.ok !== true || (R.umBuildAround.wallRing === true && R.umBuildAround.maxPrim > 400));
  A('v1.02: every land way reaches its own settlement exactly (no "stops just short" endpoints)', R.waysReachSettlements.vacuous || (R.waysReachSettlements.short === 0 && R.waysReachSettlements.exact > 0));
  A('v1.06: setup-gate seed box exists, 🎲 rolls a new value, and the typed seed drives state.tect.seed', R.setupSeedApplied === 'vacuous' || (R.setupSeed.present && R.setupSeed.diceChanged && R.setupSeedApplied === true));
  // ── v1.07: culture-flavored naming (borrow-list #1) ──
  A('v1.07: every non-Unclaimed faction gets a naming-culture picker in the faction pill row', R.cultureNaming.present && R.cultureNaming.pickerSelects >= 6);
  A('v1.07: a faction pinned to a distinctive culture names its settlements from that culture\'s own suffix pool', R.cultureNaming.adherenceRate > 0.9);
  A('v1.07: the settlement editor\'s 🎲 re-rolls a name from the settlement\'s own faction culture', R.cultureNaming.rollBtnExists && R.cultureNaming.rerolled);
  A('v1.07: civFactionCulture round-trips through the same state.civ sync as faction names', R.cultureNaming.savedArrLen > 0 && R.cultureNaming.restored);
  // ── v1.08: setup-gate world archetype presets (borrow-list #2) ──
  A('v1.08: setup gate has a World-shape preset row (Classic + 5 archetypes), Classic selected by default', R.archetypePresets.present && R.archetypePresets.buttonCount === 6 && R.archetypePresets.classicOnByDefault);
  A('v1.08: picking Pangaea enables world_structure with the supercontinent bundle and derives orogeny before commit', R.archetypePresets.afterPangaea.enabled === true && R.archetypePresets.afterPangaea.archetype === 'supercontinent' && R.archetypePresets.afterPangaea.continentality === 0.6 && R.archetypePresets.afterPangaea.tectonicGraph === true && R.archetypePresets.afterPangaea.buttonOn);
  A('v1.08: picking Classic after an archetype restores true defaults (14 plates, tectonicGraph off)', R.archetypePresets.afterClassic.enabled === false && R.archetypePresets.afterClassic.plates === 14 && R.archetypePresets.afterClassic.tectonicGraph === false && R.archetypePresets.afterClassic.buttonOn);
  // ── v1.09: GeoJSON/GIS export (borrow-list #3) ──
  A('v1.09: exportGeoJSON downloads a valid FeatureCollection with settlements, ways and rivers', R.geoExport.present && R.geoExport.ok && R.geoExport.isFC && R.geoExport.hasNote && R.geoExport.hasSettlements && R.geoExport.hasWays && R.geoExport.hasRivers && /\.geojson$/.test(R.geoExport.download));
  A('v1.09: territory outline is a MultiPolygon whose shoelace area matches the painted cell area', R.geoExport.territoryGeomType === 'MultiPolygon' && Math.abs(R.geoExport.areaRatio - 1) < 0.001);
  // ── v1.10: province tier + optional religions layer (borrow-list #4) ──
  A('v1.10: one province per city-tier+ settlement, falling back to a single province with no city+', R.provinces.present && R.provinces.prov1Count === 2 && R.provinces.prov2Count === 1 && R.provinces.prov2Name === 'Delta Province');
  A('v1.10: a province never crosses its own faction\'s territory boundary', R.provinces.crossFactionLeak === false);
  A('v1.10: enabling the provinces tint produces a real pixel difference on the civ canvas', R.provinces.diffPx > 0);
  A('v1.10: exported province MultiPolygons exactly tile the parent territory (combined area == territory area)', R.provinces.provFeatCount === 3 && R.provinces.provGeomTypes.length === 1 && R.provinces.provGeomTypes[0] === 'MultiPolygon' && Math.abs(R.provinces.areaRatio - 1) < 0.001);
  A('v1.10: every non-Unclaimed faction gets a state-religion picker, and civFactionReligion round-trips through sync', R.provinces.religionSelects >= 6 && R.provinces.savedReligionLen > 0 && R.provinces.religionRestored);
  // ── v1.11: submap/resample UX (borrow-list #5) ──
  A('v1.11: "Extract as new world" shows a confirm() and hands off to the calibrate step at the requested resolution', R.submap.confirmSeen === true && R.submap.resolutionIsRequested === true);
  A('v1.11: the extracted region preserves real-world scale (new mapWidthKm == parent width × region-fraction, both in the state and the prefilled calibrate field)', Math.abs(R.submap.afterExtract.mapWidthKm - R.submap.expectedMapWidthKm) < 0.01 && Math.abs(R.submap.afterExtract.calWidthValue - R.submap.expectedMapWidthKm) < 1);
  A('v1.11: the amplified field is real elevation data, not renormalized (finite, still within [0,1])', R.submap.afterExtract.allFinite === true && R.submap.afterExtract.fieldRangeOk === true);
  A('v1.11: civilization data (settlements/territory/provinces) is cleared on extraction', R.submap.afterExtract.placesCount === 0 && R.submap.afterExtract.territoryNull === true && R.submap.afterExtract.provinceNull === true);
  A('v1.11: committing the calibrate step infers a valid tectonic substrate on the new world (finite field, real plates)', R.submap.afterInfer.allFinite === true && R.submap.afterInfer.plateCount > 0);
  // ── v1.12: label placement + per-layer style editors (borrow-list #6) ──
  A('v1.12: a settlement label that would collide at its usual spot gets rescued via an alternate side instead of silently dropping (pre-v1.12 this exact packed layout showed only 1 of 5)', R.labelsAndStyle.shownCount >= 2 && R.labelsAndStyle.positions.length >= 2 && R.labelsAndStyle.positions.includes('above'));
  A('v1.12: territory-opacity and way-opacity sliders exist and each produces a real pixel difference on the civ canvas', R.labelsAndStyle.territoryOpacitySliderExists && R.labelsAndStyle.wayOpacitySliderExists && R.labelsAndStyle.territoryDiffPx > 0 && R.labelsAndStyle.wayDiffPx > 0);
  // ── v1.13: label regression + zoom-out-to-fit + LOD click mapping (three owner fixes) ──
  A('v1.13 #1: a region/area name label still draws even when settlement auto-labels crowd its cell (pre-v1.13 the occupancy grid could suppress it entirely)', R.v113.regionLabelDraws >= 1);
  A('v1.13 #2: zoom-out floors at the FIT scale so the whole map — width AND height — fits the viewport (was cover: one axis overflowed, forcing L/R drag)', R.v113.fitAtOrBelowCover === true && R.v113.overflowsAtCover === true && R.v113.widthFitsAtFloor === true && R.v113.heightFitsAtFloor === true);
  A('v1.13 #3: under deep LOD zoom a left-click reaches _civInfoAt with the correct settlement cell (LOD-aware evtToGridLOD); the old un-zoomed mapping would have been far off', R.v113.lodClickHandlerErr < 3 && R.v113.plainMappingErr > 10);

  // ── v1.15: Sculpt editor (stamp-based non-destructive terrain sculpting, replaces Manual Terrain) ──
  A('v1.15 Sculpt tab: clicking the sub-tab shows the panel, hides World, and lists the 13-feature palette + 8 presets', R.sculpt.panelShown && R.sculpt.worldHidden && R.sculpt.featureButtons === 13 && R.sculpt.presetButtons === 8);
  A('v1.15 Sculpt tab: _sculptEditorActive() is true while the tab is open on an un-finalized world', R.sculpt.editorActive === true);
  A('v1.15 draft is non-destructive: painting a stroke touches neither `field` nor the rendered pixels until commit', R.sculpt.draftLeavesFieldUntouched && R.sculpt.draftLeavesRenderUntouched && R.sculpt.stampCountAfterPaint === 1);
  A('v1.15 commit bakes the draft into `field`, runs a real renderNow (pixels update in the same pass), clears the stack, and pushes exactly one undo snapshot', R.sculpt.commitChangesField && R.sculpt.commitChangesRender && R.sculpt.commitClearsStamps && R.sculpt.commitPushedUndo);
  A('v1.15 Ctrl+Z (field-level undo, post-commit) reverts the bake', R.sculpt.undoRevertsField && R.sculpt.undoDifferedFromCommitted);
  A('v1.15 LOD-mode painting draws the stamp overlay (drawLODView tail) without throwing', R.sculpt.lodOverlayDrawsWithoutError === true);
  A('v1.15 brush size is real-world/zoom-relative: the km-radius readout tracks brushSize (grid cells), doubling brushSize doubles the reported km', R.sculpt.kmReadoutAt32 && R.sculpt.kmReadoutDoublesWithBrushSize);

  // ── v1.17: geography-driven settlement generation (audit S1–S7) ──
  A('v1.17 S2: auto-populate assigns a specialisation to every settlement', R.v117.nSettlements > 0 && R.v117.allHaveSpecialisation === true);
  A('v1.17 S4: wall-spec ladder — fortress stone, plain hamlet none, umWalls:false override wins', R.v117.fortressStone && R.v117.plainHamletNone && R.v117.overrideFalseWins);
  A('v1.17 S6: settlement function reaches the layout engine (economy in ctx → warehouse district in the model)', R.v117.economyInCtx && R.v117.warehouseTagged);
  A('v1.17 S7: Site-profile debug view wired (button + state.debug + legend)', R.v117.siteprofileBtn && R.v117.siteprofileState === 'siteprofile' && R.v117.siteprofileLegend);
  A('v1.17 S7: settlement-diagnostics overlay toggle draws on the civ canvas', R.v117.diagChk && R.v117.diagDraws);

  // ── v1.18: Interactive City Viewer (Explore mode) ──
  A('v1.18: an empty-terrain Explore-mode click still fills the plain sidebar summary and leaves the viewer closed (zero regression)', R.v118.emptyClickFillsPanel && R.v118.emptyClickModalClosed);
  A('v1.18: a genuine settlement-pin click in Explore mode opens the City Viewer instead of the plain summary', R.v118.settlementClickOpensModal && R.v118.settlementClickSkipsPlainPanel);
  A('v1.18: the City Information Panel renders all 7 sections with real data, including honest "not modeled" notes for undeveloped religion/history simulation (never fabricated)', R.v118.infoSectionsPresent && R.v118.infoHonestNotes);
  A('v1.18: the viewer camera zooms (state mutates) and its LOD tiers reveal different content as scale crosses a threshold', R.v118.zoomChangesScale && R.v118.lodTiersDiffer);
  A('v1.18: the info panel\'s Edit button routes to the existing, untouched Civilization-mode settlement editor', R.v118.editOpensExistingPopup);
  A('v1.18: both close paths (× button, Escape) work and clear camera state', R.v118.closeButtonWorks && R.v118.escapeWorks);
  A('v1.18: the Civilization-mode settlement editor (_civOpenPlacePopup) is completely unaffected by the new viewer', R.v118.civModeEditorUnaffected);
  A('v1.19: the sculpt nav joystick DOM (pad/stick/knob) is present', R.v119.domPresent);
  A('v1.19: entering Generate → Sculpt on a non-touch browser leaves the joystick hidden (isMobile gate)', R.v119.sculptActiveOnTab && R.v119.hiddenOnDesktop);
  A('v1.22: off-LOD, pushing the knob RIGHT pans the VIEW right (viewT.panX decreases) — corrected joystick direction', R.v119.pushRightPansViewRight);
  A('v1.19: releasing the knob stops the continuous pan loop', R.v119.resetActuallyStopsLoop);
  A('v1.19: a sub-dead-zone nudge does not start panning', R.v119.deadZoneIgnoresTinyPush);
  A('v1.19: knob travel is clamped to MAX_OFFSET and recenters on release', R.v119.knobClampsOffset && R.v119.knobResetsToCenter);
  A('v1.22: under Tiled LOD, pushing right drives _lodCx right too (view travels right)', R.v119.lodPanDrivesLodCx);
  A('v1.19: cycling Sculpt/Generate tabs re-syncs joystick visibility without throwing', R.v119.noThrowOnTabCycle);
  A('v1.20: the Icon tool\'s "Feature icons" gallery lists all 10 slots (was 4)', R.v120.featureTileCount === 10);
  A('v1.20: a new kind (cactus) arms and places via the Icon tool exactly like the original 4', R.v120.armedCactus && R.v120.placedCactus);
  A('v1.20: the manually-placed icon draws without throwing (pack sprite or generic glyph fallback)', R.v120.drawsWithoutThrow);
  A('v1.20: every new feature-icon key has a real glyph fallback', R.v120.allNewKeysHaveGlyphs);
  A('v1.20: PACK_ICON_SLOTS grew from 4 to 10', R.v120.packIconSlotsCount === 10);
  A('v1.21: the zoom toolbar and Pan mode button exist once a sheet is loaded', R.v121.scaffold.zoomToolbarShown && R.v121.scaffold.hasPanBtn);
  A('v1.21: a sheet loads at a sane fit-to-view scale (not 100%, not 0)', R.v121.scaffold.cvW0 > 0 && R.v121.scaffold.pct0 !== '100%');
  A('v1.21: Zoom In grows the canvas past the wrap (native scroll now applies)', R.v121.zoomButtons.afterIn.w > R.v121.zoomButtons.before && R.v121.zoomButtons.afterIn.scrollable);
  A('v1.21: Fit restores the original scale and resets scroll to 0,0', R.v121.zoomButtons.afterFit.w === R.v121.zoomButtons.before && R.v121.zoomButtons.afterFit.scrollLeft === 0);
  A('v1.21: dragging in Pan mode moves the wrap\'s scroll offset by the drag delta', R.v121.pan.duringCursor.includes('panning') && R.v121.pan.movedCorrectly);
  A('v1.21: cell click-to-select still hits the right cell at a non-fit zoom (evToSrc needed no changes)', R.v121.selectAtZoom.selBefore === '0 selected' && R.v121.selectAtZoom.selAfter === '1 selected' && R.v121.selectAtZoom.pct !== '100%');
  A('v1.21: wheel-zoom actually zooms in', parseInt(R.v121.wheelZoom.pctAfter) > parseInt(R.v121.wheelZoom.pctBefore));

  A('v1.23 BUG1: Open Sea base speed > Coastal Waters (systemic sea ordering fixed)', R.v123.openFasterThanCoastal);
  A('v1.23 BUG1: Sheltered Bay is not the fastest sea terrain (no residual pair-ordering bug)', R.v123.shelteredNotFastest);
  A('v1.23 BUG2: selector and validator agree for every vessel × water terrain (single source of truth)', R.v123.selValidatorMismatches === 0 && R.v123.checks > 0);
  A('v1.23 BUG2: autoselect never picks a vessel the compat rule flags invalid', R.v123.autoInvalid === 0 && R.v123.autoPicks > 0);
  A('v1.23 BUG2: an autoselected Open Sea vessel passes the real jpCalcWater validator (not blocked)', !!R.v123.autoOpenPick && R.v123.autoOpenNotBlocked);
  A('v1.23 BUG2: jpCalcWater still blocks a genuinely infeasible manual pick (river barge on open sea)', R.v123.manualInfeasibleStillBlocked);
  A('v1.23 BUG2: dhow is rated open-sea capable (sea, not river) — historically correct', R.v123.dhow.openSea && R.v123.dhow.fitsOpenSea && R.v123.dhow.fitsCoastal && !R.v123.dhow.fitsRiver);
  A('v1.23: settlement pick radius shrinks as you zoom in (constant on-screen), off-LOD and under LOD', R.v123.pickShrinksOnZoomIn);

  console.log('\n' + ok + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
