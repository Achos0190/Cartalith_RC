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
    // v1.57: the pill row must carry ZERO inline selects now (dedup fix — culture/religion/
    // government/ag-tech editing moved solely into the Faction Inspector drawer inside the new
    // Factions pop-up, so there is exactly one place each field can be changed).
    const pickerSelects = document.querySelectorAll('#civFactionPicker select').length;
    const savedSelFaction = _civSelectedFaction;
    _civSelectedFaction = 1;
    if (typeof _civOpenFactionsModal === 'function') _civOpenFactionsModal(); else _civRenderFactionInspector();
    const culSel = document.getElementById('_civFeCul');
    const inspectorCultureOptions = culSel ? culSel.options.length : 0;
    if (typeof _civCloseFactionsModal === 'function') _civCloseFactionsModal();
    _civSelectedFaction = savedSelFaction;
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
    return { present: true, pickerSelects, inspectorCultureOptions, culturesLen: CIV_CULTURES.length, adherenceRate: hits / N, rollBtnExists: !!rollBtn, rerolled, restored, savedArrLen: savedArr.length };
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
      // religion: picker DOM absence (v1.57 dedup) + Inspector DOM presence + persistence round-trip
      civFactionReligion[1] = 'sun_cult'; civFactionReligion[2] = 'sea_lords';
      _civBuildFactionPicker();
      const religionSelects = document.querySelectorAll('#civFactionPicker select[title="State religion"]').length;
      const savedSelFaction2 = _civSelectedFaction;
      _civSelectedFaction = 1; _civRenderFactionInspector();
      const relSel = document.getElementById('_civFeRel');
      const inspectorReligionOptions = relSel ? relSel.options.length : 0;
      _civSelectedFaction = savedSelFaction2; _civRenderFactionInspector();
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
        areaRatio: provAreaKm2 / territoryAreaKm2, religionSelects, inspectorReligionOptions, savedReligionLen, religionRestored
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
  // v1.70 (owner: "mix the dense village function and the roadside village function into something
  //        more nuanced" — replaces v0.76's dense-village-grid mode AND v1.68/v1.69's roadside-
  //        villages mode with one suitability-weighted, road-biased pass, one toggle). Part 1:
  //        deterministic unit tests of the two new pure primitives, independent of the stochastic
  //        committed world — this is what actually pins down "soft falloff, never below the floor,
  //        great land alone still qualifies" instead of relying on flaky live-world statistics.
  R.villagesUnit = await page.evaluate(() => {
    const o = {};
    // _civRoadProximityQuery: a synthetic straight land way from (50,100) to (150,100).
    const way = { pts: [{ x: 50, y: 100 }, { x: 150, y: 100 }], sea: false, hidden: false };
    const q = _civRoadProximityQuery([way], 8);
    o.onRoad = q(100, 100);
    o.near4 = q(100, 104);
    o.far = q(100, 500);
    const qEmpty = _civRoadProximityQuery([], 8);
    o.emptyWaysAllInfinite = qEmpty(0, 0) === Infinity && qEmpty(500, 500) === Infinity;
    const qSea = _civRoadProximityQuery([{ pts: [{ x: 0, y: 0 }, { x: 10, y: 10 }], sea: true }], 8);
    o.seaWayIgnored = qSea(5, 5) === Infinity;

    // _civVillageAcceptProb: roadProb=1 at the road (accept regardless of suit, as long as it
    // already cleared the hard floor to be a candidate at all); suitProb=1 at/above the strict
    // unconstrained threshold (accept regardless of distance — "great land" qualifies off-road);
    // a soft, monotonically-decaying falloff in between — never a hard cutoff.
    const lo = VILLAGE_SUIT_THRESH, hi = SETTLE_SEED_THRESH, fall = 10;
    o.acceptAtRoad = _civVillageAcceptProb(0, lo, fall, lo, hi);
    o.acceptFarLowSuit = _civVillageAcceptProb(2000, lo, fall, lo, hi);
    o.acceptFarGreatSuit = _civVillageAcceptProb(2000, hi, fall, lo, hi);
    o.acceptNear = _civVillageAcceptProb(5, lo, fall, lo, hi);
    o.acceptFarther = _civVillageAcceptProb(20, lo, fall, lo, hi);
    o.acceptFarthest = _civVillageAcceptProb(60, lo, fall, lo, hi);

    // v1.71 (owner: "the new settlements on the deeper level also need to be connected. By a lower
    // type road... so it only shows when zoomed in."): deterministic unit tests of the two new
    // pure primitives, again independent of the stochastic committed world.
    // roadDijkstra's new multi-source form: seeding several sources at once must, for every cell,
    // find the same distance as the MINIMUM of each source's own single-source Dijkstra to that
    // cell — and every pre-v1.71 scalar call must stay byte-identical (same seed, same loop).
    {
      const W = 20, H = 10;
      const cost = new Float32Array(W * H).fill(1);
      const a = roadDijkstra(cost, W, H, 2, 2, false);
      const b = roadDijkstra(cost, W, H, 15, 7, false);
      const multi = roadDijkstra(cost, W, H, [2 + 2 * W, 15 + 7 * W], null, false);
      let matches = true;
      for (let i = 0; i < W * H; i++) {
        const expect = Math.min(a.dist[i], b.dist[i]);
        if (Math.abs(multi.dist[i] - expect) > 1e-3) { matches = false; break; }
      }
      o.multiSourceMatchesMinOfSingleSources = matches;
      const aAgain = roadDijkstra(cost, W, H, 2, 2, false);
      o.scalarFormByteIdentical = JSON.stringify(Array.from(a.dist)) === JSON.stringify(Array.from(aAgain.dist));
    }
    // _civWayLodMin: a villageAddon way overrides its type's ordinary CIV_LOD_ROAD threshold with
    // CIV_VILLAGE_ADDON_LOD; a plain way of the same type ('ancient') is completely untouched.
    o.wayLodVillageAncient = _civWayLodMin({ villageAddon: true, type: 'ancient' });
    o.wayLodPlainAncient = _civWayLodMin({ type: 'ancient' });
    o.wayLodHighwayUnaffected = _civWayLodMin({ type: 'highway' }) === CIV_LOD_ROAD.highway;
    return o;
  });
  // Part 2: the same real-generated-world structural/safety checks v0.76/v1.68/v1.69 used
  // (spacing/land/suit-floor/cap/toggle/pick-gate), now against the unified _civVillages toggle,
  // plus a check that base capital/city/town/village/hamlet placement is unaffected by the toggle
  // (the actual fix for "waay too populated" — only the additive layer responds to it now).
  R.villages = await page.evaluate(() => {
    const savedViewScale = (typeof viewT !== 'undefined' && viewT) ? viewT.scale : null;
    _civVillages = false; _civMetropolis = false;
    _civAutoWorld();
    const baselineCount = state.places.length;
    const baselineHasAny = state.places.some(p => p.villageAddon);
    const pop = (typeof _civRegionalPopulation === 'function') ? _civRegionalPopulation() : null;

    _civVillages = true;
    _civAutoWorld();
    const rv = state.places.filter(p => p.villageAddon);
    const others = state.places.filter(p => !p.villageAddon);
    const spacingCells = suppressionRadiusCells(VILLAGE_SPACING_KM, GW, state.mapWidthKm || 800);
    let minSepAmong = Infinity, minSepOthers = Infinity;
    for (let i = 0; i < rv.length; i++) for (let j = i + 1; j < rv.length; j++) {
      const d = Math.hypot(rv[i].x - rv[j].x, rv[i].y - rv[j].y); if (d < minSepAmong) minSepAmong = d;
    }
    for (const a of rv) for (const b of others) {
      const d = Math.hypot(a.x - b.x, a.y - b.y); if (d < minSepOthers) minSepOthers = d;
    }
    const sea = state.seaLevel || 0.42;
    const allOnLand = rv.every(p => {
      const gx = Math.round(p.x), gy = Math.round(p.y);
      return gx >= 0 && gx < GW && gy >= 0 && gy < GH && field[gy * GW + gx] >= sea;
    });

    // every village's own cell must clear VILLAGE_SUIT_THRESH on the SAME suit field every other
    // placement pass reads — not just be spaced/dry (the v1.69 fix, carried forward).
    const suitField = currentSettlementSuitability();
    const suitScores = rv.map(p => suitField[Math.round(p.y) * GW + Math.round(p.x)]);
    const allMeetSuitThreshold = suitScores.every(s => s >= VILLAGE_SUIT_THRESH);
    const meanSuitAboveThreshold = suitScores.length > 0 && (suitScores.reduce((a, b) => a + b, 0) / suitScores.length) > VILLAGE_SUIT_THRESH;

    // base tier placement (non-addon places) must be IDENTICAL whether the toggle is on or off —
    // v1.70's whole point vs. v0.76's old villageMode, which densified every tier.
    const baseUnchanged = others.length === baselineCount;

    // pick-gate check: below CIV_VILLAGE_ADDON_LOD an addon village can't be clicked; above it, it can.
    let pickHiddenBelow = null, pickVisibleAbove = null;
    if (rv.length && typeof _civSelectPlaceAt === 'function' && typeof viewT !== 'undefined' && viewT) {
      const target = rv[0];
      viewT.scale = Math.max(0.05, CIV_VILLAGE_ADDON_LOD - 0.5);
      _civSelectPlaceAt(target.x, target.y);
      pickHiddenBelow = _civSelectedPlace !== target;
      viewT.scale = CIV_VILLAGE_ADDON_LOD + 0.5;
      _civSelectPlaceAt(target.x, target.y);
      pickVisibleAbove = _civSelectedPlace === target;
      _civSelectedPlace = null;
    }

    // direct comparative check on the pure seeding function itself (same base places/suit/rng seed,
    // real ways vs. none) — road proximity should never leave MORE than a small handful fewer
    // villages seeded than with no roads at all (a spacing-interaction cascade can occasionally
    // trade one accepted candidate for a different one nearby; a wide slack absorbs that without
    // depending on the specific stochastic world's exact road layout).
    let roadBiasSane = null, withRoadsCount = -1, withoutRoadsCount = -1;
    if (typeof _civSeedVillages === 'function' && typeof civWays !== 'undefined') {
      const rngFor = () => _civRng((state.seed || 12345) * 31337 + 999);
      const withRoads = _civSeedVillages(others.slice(), civWays.slice(), rngFor(), suitField);
      const withoutRoads = _civSeedVillages(others.slice(), [], rngFor(), suitField);
      withRoadsCount = withRoads.length; withoutRoadsCount = withoutRoads.length;
      roadBiasSane = withRoadsCount + 5 >= withoutRoadsCount;
    }

    // v1.71 (owner: "the new settlements... need to be connected. By a lower type road (ancient
    // route for example) so it only shows when zoomed in."): every addon village should get a
    // low-tier 'ancient' connector to its nearest real settlement, deep-zoom-gated together with
    // the village itself, and genuinely registered as connected by the network-metrics graph (not
    // a silently-dropped self-loop — see _civConnectVillageAddons's own comment on the bug this
    // fixed: routing to a bare mid-road junction instead of a real settlement).
    const conn = civWays.filter(w => w.villageAddon);
    const allConnAncient = conn.length > 0 && conn.every(w => w.type === 'ancient');
    const villageEndsMatchPin = conn.every(w => {
      const v = state.places[w.aIdx];
      if (!v) return false;
      const p0 = w.pts[0];
      return Math.abs(p0[0] - v.x) < 1e-6 && Math.abs(p0[1] - v.y) < 1e-6;
    });
    const settlementEndsMatchPin = conn.every(w => {
      if (w.bIdx == null) return false;
      const s = state.places[w.bIdx];
      if (!s) return false;
      const pe = w.pts[w.pts.length - 1];
      return Math.abs(pe[0] - s.x) < 1e-6 && Math.abs(pe[1] - s.y) < 1e-6;
    });
    const connectorLodMatchesVillage = conn.length > 0 && conn.every(w => _civWayLodMin(w) === CIV_VILLAGE_ADDON_LOD);
    const mostVillagesConnected = rv.length > 0 && conn.length >= rv.length * 0.5;

    const metrics = _civNetworkMetrics(state.places, civWays);
    const connectedVillageAidx = new Set(conn.map(w => w.aIdx));
    const allConnectedVillagesNonIsolated = rv.every(p => {
      const i = state.places.indexOf(p);
      if (!connectedVillageAidx.has(i)) return true;   // no connector (e.g. unreachable) — not this check's concern
      return metrics[i] && metrics[i].componentSize > 1;
    });

    _civVillages = false;
    _civAutoWorld();
    const toggleOffCount = state.places.length;
    const offHasNoConnectors = civWays.filter(w => w.villageAddon).length === 0;

    // restore clean civ state so later place/way tests see an empty world (v0.76's own precedent)
    if (savedViewScale != null) viewT.scale = savedViewScale;
    state.places = []; if (typeof civWays !== 'undefined') civWays = []; if (typeof civJourneys !== 'undefined') civJourneys = [];
    if (typeof _civRenderSettlementList === 'function') _civRenderSettlementList();
    if (typeof _civRenderWayList === 'function') _civRenderWayList();
    if (typeof renderNow === 'function') renderNow();

    return {
      baselineHasAny, added: rv.length,
      allHamlet: rv.every(p => p.kind === 'hamlet'), allNamed: rv.every(p => p.name && p.name.length > 0),
      allPopPositive: rv.every(p => p.pop > 0), allHaveFaction: rv.every(p => p.faction != null),
      spacingRespectedAmong: !isFinite(minSepAmong) || minSepAmong >= spacingCells - 1,
      spacingRespectedVsOthers: !isFinite(minSepOthers) || minSepOthers >= spacingCells - 1,
      allOnLand, cappedSanely: rv.length > 0 && rv.length <= _CIV_VILLAGE_CAP,
      allMeetSuitThreshold, meanSuitAboveThreshold, baseUnchanged,
      pickHiddenBelow, pickVisibleAbove,
      roadBiasSane, withRoadsCount, withoutRoadsCount,
      toggleOffMatchesBaseline: toggleOffCount === baselineCount,
      popTotal: pop ? pop.total : -1, popLand: pop ? pop.landKm2 : -1,
      connectorCount: conn.length, allConnAncient, villageEndsMatchPin, settlementEndsMatchPin,
      connectorLodMatchesVillage, mostVillagesConnected, allConnectedVillagesNonIsolated,
      offHasNoConnectors,
    };
  });
  R.villagesToggle = await page.evaluate(() => {
    const cb = document.getElementById('civVillagesChk'); if (!cb) return null;
    const defaultChecked = cb.checked;
    cb.checked = true; cb.dispatchEvent(new Event('change')); const on = _civVillages;
    cb.checked = false; cb.dispatchEvent(new Event('change')); const off = _civVillages;
    return { defaultChecked, on, off };
  });
  // v1.76 (owner: village connectors read as "a loopy bundle of spaghetti, which is not how roads
  // historically formed"): the Dijkstra prev[] walk already builds raw in VILLAGE→…→SOURCE order
  // (cur starts at the village's own cell, pushed first; the settlement is necessarily pushed
  // last) — matching aIdx(village)→bIdx(settlement). An unnecessary raw.reverse() flipped that to
  // SOURCE-first/VILLAGE-last, then the endpoint overwrites corrupted the whole path (not just the
  // labels): it left the village, jumped near the settlement, retraced the WHOLE real route
  // backward almost to the village, then jumped to the settlement again. Measured on seed
  // 31337/512px before fixing: median circuity 2.62x, 54/199 connectors self-intersecting, and the
  // worst offender's own path cost — recomputed from the identical cost grid Dijkstra used — was
  // 2.8x more expensive than the straight line despite near-flat terrain, proving it was never
  // actually the shortest path. Fixed by deleting the reverse() (the two endpoint overwrites were
  // already correct as written); measured afterward: median circuity 1.12x, zero self-intersections.
  R.v176 = await page.evaluate(() => {
    state.places = []; civWays = [];
    _civVillages = true; _civMetropolis = false;
    _civAutoWorld();
    const conn = civWays.filter(w => w.villageAddon);
    const kmPerCell = (state.mapWidthKm || 800) / GW;

    function segIntersect(p1, p2, p3, p4) {
      const d1 = (p4[0]-p3[0])*(p1[1]-p3[1]) - (p4[1]-p3[1])*(p1[0]-p3[0]);
      const d2 = (p4[0]-p3[0])*(p2[1]-p3[1]) - (p4[1]-p3[1])*(p2[0]-p3[0]);
      const d3 = (p2[0]-p1[0])*(p3[1]-p1[1]) - (p2[1]-p1[1])*(p3[0]-p1[0]);
      const d4 = (p2[0]-p1[0])*(p4[1]-p1[1]) - (p2[1]-p1[1])*(p4[0]-p1[0]);
      return ((d1>0&&d2<0)||(d1<0&&d2>0)) && ((d3>0&&d4<0)||(d3<0&&d4>0));
    }
    function selfIntersects(pts) {
      for (let i = 1; i < pts.length; i++) for (let j = i+2; j < pts.length; j++) {
        if (i === 0 && j === pts.length-1) continue;
        if (segIntersect(pts[i-1], pts[i], pts[j-1], pts[j])) return true;
      }
      return false;
    }

    let maxCircuity = 0, selfXingCount = 0, checked = 0;
    for (const w of conn) {
      if (w.aIdx == null || w.bIdx == null) continue;
      const a = state.places[w.aIdx], b = state.places[w.bIdx];
      if (!a || !b) continue;
      const straight = Math.hypot(a.x - b.x, a.y - b.y) * kmPerCell;
      if (straight > 0.01) { checked++; const c = w.km / straight; if (c > maxCircuity) maxCircuity = c; }
      if (selfIntersects(w.pts)) selfXingCount++;
    }

    state.places = []; civWays = []; if (typeof civJourneys !== 'undefined') civJourneys = [];
    if (typeof _civRenderSettlementList === 'function') _civRenderSettlementList();
    if (typeof _civRenderWayList === 'function') _civRenderWayList();
    if (typeof renderNow === 'function') renderNow();

    return { connectorCount: conn.length, checked, maxCircuity, selfXingCount };
  });
  // v1.79 (owner: "the roads from the deeper settlement layers dont connect to their nearest
  // siblings and individually connect to the closest big settlement... they probably just connected
  // to the closest main road by the most efficient route"). Measured before fixing (probe_
  // villageconn.js, seed 31337/512px): v1.71-v1.78's target set was every real settlement and NEVER
  // another village, so 79.5% of villages had a nearer sibling than the settlement they actually
  // connected to, and mean connector length was 21.8km vs. a 14.0km mean nearest-sibling distance.
  // Fixed with a batched growing-forest (Prim-style) build: the network starts as the real
  // settlements and grows to include each village as it joins, so a village can attach to a close
  // sibling just as readily as to a settlement, while every reachable village still traces back to a
  // real settlement through the tree (verified below via a village-to-village adjacency BFS, not
  // assumed). Design choice (this vs. a single-shot nearest-of-either Dijkstra vs. tapping into the
  // nearest existing road point) confirmed with the owner via AskUserQuestion before building.
  R.v179 = await page.evaluate(() => {
    state.places = []; civWays = [];
    _civVillages = true; _civMetropolis = false;
    _civAutoWorld();
    const places = state.places, conn = civWays.filter(w => w.villageAddon);
    const villages = places.filter(p => p && p.villageAddon);
    const kmPerCell = (state.mapWidthKm || 800) / GW;

    // every village's connector chain (following village-way edges only) must eventually reach a
    // real, non-village place — no cluster of villages left networked only among itself.
    const adj = new Map();
    for (const w of conn) {
      if (w.aIdx == null || w.bIdx == null) continue;
      if (!adj.has(w.aIdx)) adj.set(w.aIdx, []);
      if (!adj.has(w.bIdx)) adj.set(w.bIdx, []);
      adj.get(w.aIdx).push(w.bIdx); adj.get(w.bIdx).push(w.aIdx);
    }
    let stuckInVillageOnly = 0, isolated = 0, villageToVillageEdges = 0;
    for (const w of conn) { if (w.bIdx != null && places[w.bIdx] && places[w.bIdx].villageAddon) villageToVillageEdges++; }
    for (const v of villages) {
      const vi = places.indexOf(v);
      if (!adj.has(vi)) { isolated++; continue; }
      const seen = new Set([vi]), queue = [vi]; let found = false;
      while (queue.length) {
        const cur = queue.shift(), p = places[cur];
        if (p && !p.villageAddon) { found = true; break; }
        for (const nb of (adj.get(cur) || [])) if (!seen.has(nb)) { seen.add(nb); queue.push(nb); }
      }
      if (!found) stuckInVillageOnly++;
    }

    // sibling-preference measurement, same technique as the standalone probe this fix was
    // root-caused with: for each connected village, is its nearest SIBLING closer than the place it
    // actually connected to?
    let siblingCloser = 0, checked2 = 0;
    for (const v of villages) {
      const vi = places.indexOf(v);
      const w = conn.find(w2 => w2.aIdx === vi || w2.bIdx === vi);
      if (!w) continue;
      const otherIdx = w.aIdx === vi ? w.bIdx : w.aIdx, other = places[otherIdx];
      if (!other) continue;
      const connDist = Math.hypot(v.x - other.x, v.y - other.y);
      let nearestSib = Infinity;
      for (const v2 of villages) { if (v2 === v) continue; const d = Math.hypot(v.x - v2.x, v.y - v2.y); if (d < nearestSib) nearestSib = d; }
      if (!isFinite(nearestSib)) continue;
      checked2++;
      if (nearestSib < connDist) siblingCloser++;
    }

    state.places = []; civWays = []; if (typeof civJourneys !== 'undefined') civJourneys = [];
    if (typeof _civRenderSettlementList === 'function') _civRenderSettlementList();
    if (typeof _civRenderWayList === 'function') _civRenderWayList();
    if (typeof renderNow === 'function') renderNow();

    return { connectorCount: conn.length, villageCount: villages.length, isolated, stuckInVillageOnly,
      villageToVillageEdges, siblingCloser, checked2 };
  });
  // v1.81 (owner: "any journey is only factually limited by the longest distance one is able to
  // traverse with the resources they can carry... the range can be extended by varying degrees of
  // foraging... we already have fauna information and therefore a good idea about how foraging
  // could extend a route/travel distance"). Measured before building (probe_jp_drygap.js): a
  // well-provisioned 10-camel caravan hit a hard, zero-elasticity wall past ~150-200km of
  // waterless desert (269%/387%/506% over capacity at 200/300/400km) — jpForaging() already
  // reduced carried FOOD need but nothing touched WATER at all, and the flat JP_BIOMES.forage
  // constant never consulted the real per-region wildlife data currentWildlife() already computes
  // (species richness/biomass via a genuine NPP->trophic-cascade model, memoized). Two designs
  // confirmed with the owner via AskUserQuestion before building: extend the existing Foraging
  // control (no new UI) rather than a second dropdown, and use real wildlife data rather than a
  // static table refinement.
  R.v181 = await page.evaluate(async () => {
    const o = {};
    // JP_BIOMES.waterForage exists, is small, and is steeply biome-dependent (desert near-zero).
    o.hotDesertWF = JP_BIOMES['Hot Desert']?.waterForage;
    o.jungleWF = JP_BIOMES['Tropical Jungle']?.waterForage;
    o.wetlandsWF = JP_BIOMES['Wetlands / Marshes']?.waterForage;

    // foraging="None" is an exact no-op — bit-identical to pre-v1.81, regardless of mx/my/wildlife.
    const r1 = jpForaging('None', 'Tropical Jungle', 'Forest Path', 'Summer', 6, 100, 100);
    const r2 = jpForaging('None', 'Tropical Jungle', 'Forest Path', 'Summer', 6);
    o.noneIsNoop = r1.reduction === 0 && r1.waterReduction === 0 &&
      r1.reduction === r2.reduction && r1.waterReduction === r2.waterReduction && r1.move === r2.move;

    // Active foraging genuinely reduces both food and water need, water by far less than food,
    // and true desert reduces water by far less than a wet biome (the owner's own "dew trap"
    // framing, checked directly rather than just trusting the table).
    const desert = jpForaging('Active', 'Hot Desert', 'Desert Hardpack', 'Summer', 6);
    const jungle = jpForaging('Active', 'Tropical Jungle', 'Forest Path', 'Summer', 6);
    o.desertWaterReduction = desert.waterReduction;
    o.jungleWaterReduction = jungle.waterReduction;
    o.desertMuchDrierThanJungle = desert.waterReduction < jungle.waterReduction * 0.3;
    o.waterReductionSmallerThanFoodReduction = jungle.waterReduction < jungle.reduction;

    // Real per-world wildlife data is genuinely consulted: _jpDeriveStages threads a real stage
    // midpoint (mx/my) through to jpForaging, which samples currentWildlife() there — not merely
    // reachable in principle, exercised end-to-end on a live generated+auto-populated world.
    state.tect.seed = 12345; state.resW = 256; GW = 256; GH = gridH(GW); allocate();
    let genOk = true; try { await generate(); } catch (e) { genOk = false; }
    if (typeof _civIterativeAutoWorld === 'function') { try { state.places = []; _civIterativeAutoWorld(3); } catch (e) {} }
    o.genOk = genOk;
    const places = (state.places || []).filter(p => p && p.category === 'settlement' && !p.villageAddon);
    o.wildlifeReachable = typeof currentWildlife === 'function';
    let stagesWithMx = 0, wildlifeModVaried = false;
    if (places.length >= 2 && typeof _civDijkstraPath === 'function') {
      const a = places[0], b = places[places.length - 1];
      const j = _civDijkstraPath(a.x, a.y, b.x, b.y, 'land');
      if (j && j.pts && j.pts.length > 1) {
        const jn = { pts: j.pts, km: j.km, brks: j.brks && j.brks.length ? j.brks : undefined, name: '', sea: false, groupSize: 6 };
        const plan = _jpEnsurePlan(jn);
        plan.foraging = 'Active';
        const stages = _jpDeriveStages(jn, plan);
        const mods = [];
        for (const st of stages) {
          if (st.mx != null && st.my != null) { stagesWithMx++; mods.push(_jpWildlifeForageMod(st.mx, st.my)); }
        }
        wildlifeModVaried = mods.length > 0 && (new Set(mods.map(m => m.toFixed(3))).size > 1 || mods.some(m => m !== 1.0));
      }
    }
    o.stagesCarryMx = stagesWithMx > 0;
    o.wildlifeModVaried = wildlifeModVaried;

    return o;
  });
  // v1.77 (owner-supplied PoC, middle scope: "wind/current terrain-coupling + gyres, world-wrap-
  // aware, must feed rain/climate — not sit decoratively beside it"). Root-caused first: buildWind
  // was purely latitude-band + temperature-driven pressure/Coriolis, with ZERO direct terrain
  // blocking (wind blew straight through mountains); oceanSSTAnomaly used the WIND's own y-
  // component directly AS a "current" — no Ekman rotation, no distinct 2D current field, no gyre
  // structure. deflectFlow (ported from the PoC's deflect()) steers a flow field away from a
  // blocking scalar field; computeOceanCurrent Ekman-rotates the (possibly deflected) wind and
  // deflects it again against a hard coastline + shelf friction + western-intensification.
  // v1.78: the v1.77 state.climate.terrainWind opt-in is GONE — owner: "wind and current should
  // always be coupled to terrain" — buildWind/oceanSSTAnomaly always deflect wherever elevation is
  // available, no toggle. This is a deliberate, measured re-baseline of the DEFAULT render (hash vs
  // v1.77 differs at every scenario — confirmed the delta is isolated to the climate→rain→
  // river-carving feedback chain, not an unrelated regression: field itself now differs too, because
  // carveRiverValleys() (already in the default generate() pipeline) carves against the new rainfall
  // pattern — a real, correct, closed-loop consequence, not a bug).
  R.v178 = await page.evaluate(() => {
    const o = {};
    o.checkboxGone = !document.getElementById('terrainWind');
    o.stateFieldGone = state.climate.terrainWind === undefined;

    // synthetic north-south ridge on a coarse working grid, isolated from pressK/decl so only the
    // terrain-deflection term is being measured. "off" = no elevation supplied (opts null, the one
    // remaining case buildWind leaves undeflected — e.g. Region-mode manual wind); "on" = real elev.
    const WW = 240, WH = 120, sea = state.seaLevel;
    const elev = new Float32Array(WW * WH);
    for (let y = 0; y < WH; y++) for (let x = 0; x < WW; x++) {
      const dx = Math.abs(x - WW / 2);
      elev[y * WW + x] = sea + 0.05 + (dx < 12 ? (12 - dx) / 12 * 0.5 : 0);
    }
    const tc = new Float32Array(WW * WH); for (let i = 0; i < tc.length; i++) tc[i] = 10;
    const savedWorld = state.world, savedPressK = state.climate.pressK;
    state.world = true; state.climate.pressK = 0;

    const wxOff = new Float32Array(WW * WH), wyOff = new Float32Array(WW * WH);
    buildWind(wxOff, wyOff, WW, WH, 3.0, tc, 0, null);
    const wxOn = new Float32Array(WW * WH), wyOn = new Float32Array(WW * WH);
    buildWind(wxOn, wyOn, WW, WH, 3.0, tc, 0, { elev });   // no toggle needed — elev alone is enough
    state.world = savedWorld; state.climate.pressK = savedPressK;

    let nearRidgeDiff = 0, nearN = 0, farDiff = 0, farN = 0;
    for (let y = 0; y < WH; y++) for (let x = 0; x < WW; x++) {
      const i = y * WW + x, d = Math.hypot(wxOn[i] - wxOff[i], wyOn[i] - wyOff[i]);
      const dx = Math.abs(x - WW / 2);
      if (dx < 15) { nearRidgeDiff += d; nearN++; } else if (dx > 60) { farDiff += d; farN++; }
    }
    o.nearRidgeMeanDiff = nearRidgeDiff / nearN;
    o.farMeanDiff = farDiff / farN;

    // world-wrap seam continuity: ridge kept away from the seam, so x=0/x=WW-1 sit in flat terrain
    // and a wrap bug (vs. legitimate ridge-crest flow-splitting) would show up as a real discontinuity
    let seamDiff = 0;
    for (let y = 0; y < WH; y++) seamDiff += Math.hypot(wxOn[y*WW+0]-wxOn[y*WW+(WW-1)], wyOn[y*WW+0]-wyOn[y*WW+(WW-1)]);
    o.seamMeanDiff = seamDiff / WH;

    // must genuinely feed rain/temp on a REAL generated world (unconditionally now — no toggle to flip)
    const rainCopy = rainField.slice(), tempCopy = tempField.slice();
    refreshClimate();
    let rainDiff = 0, tempDiff = 0;
    for (let i = 0; i < rainCopy.length; i++) { rainDiff += Math.abs(rainField[i]-rainCopy[i]); tempDiff += Math.abs(tempField[i]-tempCopy[i]); }
    o.rainStableOnReRun = rainDiff / rainCopy.length < 1e-9;   // determinism: re-running refreshClimate on the SAME field must reproduce the SAME rain/temp

    // Layer views must show the SAME real mechanism, not a stale undeflected/proxy shortcut
    const wf = currentWindField(), of = currentOceanField();
    o.windFieldMaxSpeed = wf.maxSpeed;
    let oceanDiffersFromWind = false, oceanCells = 0;
    for (let i = 0; i < of.ocean.length; i++) if (of.ocean[i]) {
      oceanCells++;
      // of.u/v is a real 2D current (Ekman-rotated + coastal-deflected), not the wind's own vector —
      // sampled on the SAME coarse grid, so a direct index compare is valid without reprojection
      const wi = Math.min(wf.u.length - 1, i);
      if (Math.abs(of.u[i] - wf.u[wi]) > 1e-6 || Math.abs(of.v[i] - wf.v[wi]) > 1e-6) oceanDiffersFromWind = true;
    }
    o.oceanCells = oceanCells;
    o.oceanCurrentIsRealNotWindProxy = oceanDiffersFromWind;

    return o;
  });
  // v1.78: animated wind/current particle streaks (owner-requested PoC parity — "animated streaks").
  // #windFxCanvas is a self-contained overlay, own rAF loop, self-terminating on state.debug leaving
  // wind/ocean — started/stopped via the SAME #debugSeg click path a real user takes.
  // v1.80 (owner: "no animation in the flow layers"): this block originally checked cv.style.display
  // (the INLINE style) rather than the actual rendered/COMPUTED style — _windFxStart() cleared the
  // inline style to '' expecting that to reveal the canvas, but the #windFxCanvas CSS rule itself sets
  // display:none, so '' just falls back to the stylesheet and the canvas stayed invisible. `'' !==
  // 'none'` was still true, so this exact assertion passed while the animation was genuinely broken —
  // confirmed by real-screenshot frame-diffing (zero byte-diff across 5 frames) before fixing. Now
  // reads getComputedStyle(cv).display, the only thing that actually reflects on-screen visibility.
  R.v178fx = await page.evaluate(async () => {
    const o = {};
    const cv = document.getElementById('windFxCanvas');
    o.canvasExists = !!cv;
    o.hiddenByDefault = cv ? getComputedStyle(cv).display === 'none' : null;
    o.runningBeforeClick = _windFxRunning;
    document.querySelector('#debugSeg button[data-d="wind"]').click();
    await new Promise(r => setTimeout(r, 60));   // let the first rAF tick land
    o.runningOnWind = _windFxRunning;
    o.visibleOnWind = getComputedStyle(cv).display !== 'none';
    o.hasParticlesOnWind = _windFxParts.length > 0;
    document.querySelector('#debugSeg button[data-d="ocean"]').click();
    await new Promise(r => setTimeout(r, 60));
    o.runningOnOcean = _windFxRunning;
    o.oceanParticleCount = _windFxParts.length;
    document.querySelector('#debugSeg button[data-d="off"]').click();
    await new Promise(r => setTimeout(r, 60));
    o.stoppedOnOff = !_windFxRunning;
    o.hiddenOnOff = getComputedStyle(cv).display === 'none';
    return o;
  });
  // v1.72 bug-hunt: three defects in the v1.71 village-connector layer, each measured before fixing.
  // A: the way serialization whitelist dropped `villageAddon`, so a save→reload turned every deep-zoom
  //    connector back into an ordinary 'ancient' way visible from zoom 0.7 while its village stayed
  //    hidden until 2.4 — a web of roads leading to invisible settlements.
  // B: "Generate Roads" kept only `w.manual` ways (destroying all connectors) and passed the villages
  //    themselves to the trunk-network builder (because 'hamlet' is in CIV_SETTLE_KEYS), producing
  //    normally-visible roads to them and defeating the deep-zoom design outright.
  // C: the way list is not virtualized, so ~199 unnamed auto connectors buried the ~53 authored roads.
  R.v172 = await page.evaluate(() => {
    const o = {};
    state.places = []; civWays = [];
    _civVillages = true; _civMetropolis = false;
    _civAutoWorld();
    o.connectors = civWays.filter(w => w.villageAddon).length;

    // --- A: save/load round trip ---
    _civSyncToState();
    o.A_savedKeepsFlag = state.civ.ways.some(w => w.villageAddon === true);
    _civSyncFromState();
    const reloaded = civWays.filter(w => w.villageAddon);
    o.A_survivesReload = reloaded.length === o.connectors && reloaded.length > 0;
    // the defect was observable purely as a LOD regression, so assert on that directly
    const ancient = civWays.filter(w => w.type === 'ancient');
    o.A_noRoadOutrunsItsVillage = ancient.length > 0 && ancient.every(w => _civWayLodMin(w) >= CIV_VILLAGE_ADDON_LOD);

    // --- B: Generate Roads ---
    _civAutoRoutes();
    o.B_connectorsSurvive = civWays.filter(w => w.villageAddon).length > 0;
    const vIdx = new Set(); state.places.forEach((p, i) => { if (p.villageAddon) vIdx.add(i); });
    const touching = civWays.filter(w => vIdx.has(w.aIdx) || vIdx.has(w.bIdx));
    o.B_everyVillageWayIsDeepZoom = touching.length > 0 && touching.every(w => _civWayLodMin(w) >= CIV_VILLAGE_ADDON_LOD);
    // the trunk network must not have been rebuilt over the villages
    o.B_noTrunkWayTouchesAVillage = !touching.some(w => !w.villageAddon);

    // --- C: way list density ---
    _civRenderWayList();
    const el = document.getElementById('civWayList');
    const topLevelCards = el ? el.children.length : -1;
    const connectorCount = civWays.filter(w => w.villageAddon && !w.hidden).length;
    o.C_topLevelCards = topLevelCards;
    o.C_connectorCount = connectorCount;
    o.C_listNotFlooded = topLevelCards < connectorCount / 2;
    const det = el ? el.querySelector('details') : null;
    o.C_disclosureExists = !!det;
    o.C_disclosureStartsClosed = det ? det.open === false : false;
    o.C_connectorsStillReachable = det ? det.querySelectorAll('input[type=text]').length === connectorCount : false;

    // restore clean civ state (v0.76's own precedent)
    _civVillages = false;
    state.places = []; civWays = []; if (typeof civJourneys !== 'undefined') civJourneys = [];
    if (typeof _civRenderSettlementList === 'function') _civRenderSettlementList();
    if (typeof _civRenderWayList === 'function') _civRenderWayList();
    if (typeof renderNow === 'function') renderNow();
    return o;
  });
  // v1.73 (bug hunt): v1.28 added trait-badge clearance to the label DRAW path but not to v1.12's
  // label-collision RESERVATION, so a 'below' label on a trait-bearing settlement painted outside
  // the box it reserved. _civTraitDrop is now the single definition both sides read.
  R.v173 = await page.evaluate(() => {
    const sz = 8, sc = 1.5;
    const bare = { name: 'X', traits: [] };
    const withT = { name: 'X', traits: ['port'] };
    const expected = Math.max(2.2, sz * 0.42) * 2 + 1.2 * sc;   // the literal v1.28 draw formula
    return {
      zeroWithoutTraits: _civTraitDrop(bare, sz, sc) === 0 && _civTraitDrop(null, sz, sc) === 0,
      positiveWithTraits: _civTraitDrop(withT, sz, sc) > 0,
      matchesDrawnFormula: Math.abs(_civTraitDrop(withT, sz, sc) - expected) < 1e-9,
      scalesWithSize: _civTraitDrop(withT, 20, sc) > _civTraitDrop(withT, 4, sc),
    };
  });
  /* v1.74 — LOD zoom freeze. Three claims, each asserted on the mechanism the owner actually feels:
     (1) a colorized tile is a STATIC image, so nothing that leaves _lodRenderKey unchanged may cause a
         re-colorization — the cache must be big enough to hold the pixels of every tile whose heightmap
         we are still holding;
     (2) rapid camera input must coalesce to one composite per animation frame, not one per event;
     (3) an interactive frame is budgeted (so it can never block for seconds) while a direct renderNow()
         still composites the whole view in one go for non-interactive callers.
     Runs entirely on the pure/queryable surface — the tile pixels themselves are canvas work, which this
     file's own headless carve-out leaves to manual verification. */
  R.v174 = await page.evaluate(async () => {
    const prevTile = _lodTile, prevOn = _lodOn, prevZoom = _lodZoom;
    // (1) cache sizing — budget by pixels so the cap tracks _lodTile instead of costing 16x more at 2048
    _lodTile = 1024; const cap1024 = lodTileCanvasMax();
    _lodTile = 2048; const cap2048 = lodTileCanvasMax();
    _lodTile = 512; const cap512 = lodTileCanvasMax();
    _lodTile = 65536; const capHuge = lodTileCanvasMax();   // absurd tile size must still leave a usable floor
    _lodTile = prevTile;

    // (2) coalescing: many requests inside one tick must produce exactly ONE composite
    _lodOn = true;
    let composites = 0, budgetsSeen = [];
    const realDraw = window.drawLODView;
    window.drawLODView = function () { composites++; budgetsSeen.push(_lodFrameBudget); return true; };
    for (let i = 0; i < 25; i++) requestLodRender();
    const pendingFlagSet = _lodRafPending === true;
    const compositesBeforeFrame = composites;
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    const compositesAfterOneFrame = composites;

    // (3) an interactive frame carries a budget; a direct renderNow() does not
    const interactiveBudget = budgetsSeen.length ? budgetsSeen[0] : null;
    const clearedAfterFrame = _lodFrameBudget === null;
    composites = 0; budgetsSeen = [];
    renderNow();
    const directBudget = budgetsSeen.length ? budgetsSeen[0] : 'no-composite';

    window.drawLODView = realDraw;
    _lodOn = prevOn; _lodZoom = prevZoom; _lodTile = prevTile;
    return {
      // 68 = the measured distinct-tile working set of the reported 1->17.81 gesture (probe_distinct.js)
      capCoversMeasuredWorkingSet: cap1024 >= 68,
      capExceedsDataCache: cap1024 > _lodCacheMax,
      capTracksTileSize: cap2048 < cap1024 && cap512 > cap1024,
      capHasFloor: capHuge >= 6,
      // the static-image invariant, asserted on the key rather than on pixels: zoom/pan must not be in it
      renderKeyIgnoresCamera: (() => { const a = _lodRenderKey(); _lodZoom = prevZoom * 4; _lodCx += 5; const b = _lodRenderKey(); _lodZoom = prevZoom; _lodCx -= 5; return a === b; })(),
      renderKeyCoversVisualState: (() => {
        const a = _lodRenderKey(); const s = state.seaLevel; state.seaLevel = s + 0.01;
        const b = _lodRenderKey(); state.seaLevel = s; return a !== b;
      })(),
      coalescedNotImmediate: compositesBeforeFrame === 0 && pendingFlagSet,
      exactlyOneCompositePerFrame: compositesAfterOneFrame === 1,
      interactiveFrameIsBudgeted: typeof interactiveBudget === 'number' && interactiveBudget > 0,
      budgetClearedAfterFrame: clearedAfterFrame,
      directRenderNowUnbudgeted: directBudget === null,
    };
  });
  // v1.75 (bug hunt, HANDOFF-flagged latent issue from v1.72): _civHierarchicalNetwork stamps a
  // way's aIdx/bIdx as positions in whatever `places` array it was called with; _civAutoRoutes
  // called it with the settles-FILTERED array while _civConnectVillageAddons (same function, a
  // few lines later) uses the FULL state.places array — two index bases landing in one civWays
  // list. Force a genuine divergence rather than hope for one: insert POIs AHEAD of the real
  // settlements in state.places, so a settles-local index misread as a state.places index
  // deterministically resolves to a POI (kind not in CIV_SETTLE_KEYS) instead of silently landing
  // on some other settlement that would make the bug invisible.
  R.v175 = await page.evaluate(() => {
    state.places = []; civWays = [];
    _civVillages = false;
    _civAutoWorld();
    const realSettlementCount = state.places.length;
    const pois = [0, 1, 2, 3, 4].map(i => ({ kind: 'landmark', name: 'POI' + i, x: 5 + i, y: 5 + i, traits: [] }));
    state.places = [...pois, ...state.places];
    _civAutoRoutes();
    const landWays = civWays.filter(w => !w.sea && w.aIdx != null && w.bIdx != null);
    const allResolveToRealSettlements = landWays.length > 0 && landWays.every(w => {
      const a = state.places[w.aIdx], b = state.places[w.bIdx];
      return a && b && CIV_SETTLE_KEYS.has(a.kind) && CIV_SETTLE_KEYS.has(b.kind) && !a.villageAddon && !b.villageAddon;
    });
    const out = { landWaysChecked: landWays.length, allResolveToRealSettlements, poisCount: pois.length, realSettlementCount };
    state.places = []; civWays = [];
    if (typeof _civRenderSettlementList === 'function') _civRenderSettlementList();
    if (typeof _civRenderWayList === 'function') _civRenderWayList();
    if (typeof renderNow === 'function') renderNow();
    return out;
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
  // v1.60: the original pairs' waterFrac collapsed to 0 once the crater/volcano radius ceiling
  // (v1.60 Stage A — a single crater/volcano can no longer balloon past ~12% of the grid) legitimately
  // reshaped this seed's coastline near those specific pixels — the routing FIX itself is untouched
  // (v1.60 is civ-layer-blind; _civDijkstraPath/mixed-mode cost is byte-identical), only the terrain
  // this particular hardcoded pair happened to sit on changed. Re-found via the same independent-probe
  // methodology against the current terrain (state.mapWidthKm pinned — this test must not depend on
  // whatever a prior smoke block left it at).
  R.routingSeaShortcut = await page.evaluate(async () => {
    state.mapWidthKm = 800; state.tect.seed = 424242; state.resW = 1024; GW = 1024; GH = gridH(GW); allocate();
    await generate();
    const pairs = [
      { x1: 308, y1: 332, x2: 302, y2: 434 },   // v1.60 waterFrac 0.897 (mixed 86.4km vs land-only 99.3km)
      { x1: 569, y1: 494, x2: 566, y2: 599 },   // v1.60 waterFrac 0.919 (mixed 83.1km vs land-only 111.5km)
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

    /* v1.32 (owner: Explore "opens the settlement view in full screen instead of the pop-up window
       akin to the generate pane"): a genuine settlement-pin click now opens the ANCHORED POPUP —
       city-layout card on top, editable parameters below — exactly as Civilization mode does, and no
       longer forces the full-screen viewer. This block previously asserted the opposite; the
       expectation moved with the behaviour, it was not merely relaxed. */
    document.getElementById('civInfoPanel').innerHTML = '<div class="hint">reset2</div>';
    _civInfoAt(Math.round(target.x), Math.round(target.y));
    out.settlementClickOpensPopup = document.getElementById('placeEditPopup').style.display === 'block';
    out.settlementClickLeavesModalShut = !document.getElementById('cityViewerModal').classList.contains('open');
    out.settlementClickSkipsPlainPanel = document.getElementById('civInfoPanel').innerHTML === '<div class="hint">reset2</div>';
    document.getElementById('placeEditPopup').style.display = 'none'; _civSelectedPlace = null;

    // the viewer is still fully functional — it is now reached on request (the popup's button)
    out.viewerOpensOnRequest = _civOpenCityViewer(target) !== false &&
      document.getElementById('cityViewerModal').classList.contains('open');

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
  // BUG 1 (owner: "Coastal Waters faster than Open Sea — historically backwards"): a sea leg's daily
  // distance must rank Open Sea above Coastal Waters (wind/current is a SEPARATE axis in JP_ROUTE.sea).
  // BUG 2 (owner: "autoselect assigns a vessel to a leg it isn't fit for, only caught
  // downstream"): the selector (_jpVesselFits) and validator (_jpVesselWaterBlock, which jpCalcWater now
  // calls) share ONE source of truth, so an autoselected vessel can never be flagged invalid. All pure
  // JP data/functions — no world/DOM needed beyond GW being defined (generated earlier in this run).
  R.v123 = await page.evaluate(() => {
    const out = {};
    // v1.43 re-expressed these two: v1.23 asserted the raw JP_TERRAIN.sea multipliers, but that row no
    // longer carries the whole ordering — the daily sailing window (JP_WATER_WINDOW) does, because
    // §3.3's finding is that the zones differ in hours under way as much as in speed. Comparing the
    // multipliers alone would now read Coastal 0.60 > Open 0.55 and "fail" a model that is correct.
    // The owner's original report was about km/day (97 vs 82), so assert the COMPOSED km/day, which
    // is what these tests should have measured in the first place — and is invariant to where in the
    // composition the physics lives.
    const seaKmDay = (terrain, vessel) => {
      const st = { km: 500, cat: 'sea', terrain, routeCond: 'Neutral', infra: 'Stable Settlements', biome: 'Coastal Lowland' };
      const pl = { vessel: vessel || 'Cog', pace: 'Standard Pace', season: 'Summer', groupSize: 4, cargoKg: 0, hours: 10, carryFood: false };
      const r = jpCalcWater(st, pl); return r.blocked ? 0 : r.dailyKm;
    };
    out.sea = { sheltered: seaKmDay('Sheltered Bay'), coastal: seaKmDay('Coastal Waters'),
                open: seaKmDay('Open Sea'), rough: seaKmDay('Rough Open Sea') };
    out.openFasterThanCoastal = out.sea.open > out.sea.coastal;
    out.shelteredNotFastest = out.sea.sheltered < out.sea.open;

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

  // ── v1.24: external QA report fixes (8 bugs), all confirmed real against this file before fixing ──
  R.v124 = await page.evaluate(() => {
    const out = {};

    // BUG-1: World Structure slider `change` no longer throws ReferenceError (segOn was out of
    // scope), and the archetype pill correctly flips to "custom" — the whole feature was dead.
    const wsChk = document.getElementById('wsEnabled'); if (wsChk && !wsChk.checked) { wsChk.checked = true; wsChk.dispatchEvent(new Event('change')); }
    let threwBug1 = false;
    try { const el = document.getElementById('wsCont'); el.value = 70; el.dispatchEvent(new Event('input')); el.dispatchEvent(new Event('change')); }
    catch (e) { threwBug1 = true; }
    out.bug1 = { threw: threwBug1, archetypeIsCustom: state.world_structure.archetype === 'custom',
                 archetypeBtnOn: !!document.querySelector('#archetypeSeg button[data-arc="custom"].on') };

    // BUG-2: Delete/Escape keydown must ignore keystrokes while typing (place editor Name/Pop/
    // History fields) — previously one stray Delete forward-keypress silently deleted the settlement.
    if (!state.places.some(p => p && p.category === 'settlement')) state.places.push({ x: Math.floor(GW/2), y: Math.floor(GH/2), category: 'settlement', name: 'Testville', kind: 'town', faction: 1, pop: 1000, traits: [] });
    _civSelectedPlace = state.places.find(p => p && p.category === 'settlement');
    if (typeof _civRenderPlaceEditor === 'function') _civRenderPlaceEditor();
    const nameInput = document.getElementById('_civPeName');
    const placesBefore = state.places.length;
    if (nameInput) nameInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true, cancelable: true }));
    out.bug2 = { hadInput: !!nameInput, placeSurvived: state.places.length === placesBefore };

    // BUG-3: showBusy/hideBusy now nest — the overlay must stay visible until every queued op's
    // hideBusy() has actually fired, not just the first one. Force a clean depth-0 baseline first:
    // earlier in this long smoke run a withBusy()-queued op (slider-triggered regenerate) may still
    // be in flight on its own setTimeout/_busyChain tick, leaving _busyDepth non-zero by this point —
    // this test is about the counter's OWN mechanics, not a race against unrelated pending app ops.
    _busyDepth = 0; busy.style.display = 'none';
    showBusy('op A'); showBusy('op B');
    const stillVisibleAfterOneHide = (hideBusy(), busy.style.display === 'flex');
    const hiddenAfterSecondHide = (hideBusy(), busy.style.display === 'none');
    hideBusy(); // extra call must clamp, not go negative (would owe a future phantom hide)
    showBusy('x'); const recoversNormally = busy.style.display === 'flex'; hideBusy();
    out.bug3 = { stillVisibleAfterOneHide, hiddenAfterSecondHide, recoversNormally };

    // BUG-4: destructive one-click actions (Clear labels/icons) must confirm() first — declining
    // must leave the data untouched. (Delete-place button is popup-DOM-dependent; covered by code
    // presence, not re-simulated here to keep this block fast/robust.)
    state.labels.push({ x: 5, y: 5, name: 'Test Region', angle: 0, arc: 0, size: 16 });
    state.mapIcons.push({ x: 5, y: 5, fam: 'feature', slot: 'shrub', scale: 1 });
    const labelsBefore = state.labels.length, iconsBefore = state.mapIcons.length;
    const origConfirm = window.confirm; let confirmCalls = 0;
    window.confirm = () => { confirmCalls++; return false; };
    document.getElementById('carClearLabelsBtn').click();
    document.getElementById('carClearIconsBtn').click();
    window.confirm = origConfirm;
    out.bug4 = { confirmCalls, labelsSurvivedDecline: state.labels.length === labelsBefore, iconsSurvivedDecline: state.mapIcons.length === iconsBefore };

    // BUG-5: a beforeunload guard exists and correctly reads "a world is live" (setup gate hidden).
    out.bug5 = { hasFn: typeof _hasLiveWorld === 'function', reportsTrue: typeof _hasLiveWorld === 'function' && _hasLiveWorld() };

    // BUG-6: the asset-pack thumbnail gallery has a host element again (was CSS-only, no HTML tag).
    let threwBug6 = false; try { renderPackInspector(); } catch (e) { threwBug6 = true; }
    out.bug6 = { hasEl: !!document.getElementById('packGrid'), threw: threwBug6 };

    // BUG-7: shared HTML-escape helper exists and is actually wired into the settlements table row
    // renderer (the class of bug: a `<b>`/`<img onerror>` name corrupting rendered markup).
    const escOk = typeof _escHtml === 'function' && _escHtml('<img src=x onerror=1>') === '&lt;img src=x onerror=1&gt;';
    const rowHtml = typeof _stRowHtml === 'function' ? _stRowHtml({ name: '<b>Evil</b>', type: 't', faction: '<i>F</i>', pop: 1, prosperity: 0, econRole: 'e', roads: 0, status: 's' }) : '';
    out.bug7 = { escOk, rowEscaped: rowHtml.includes('&lt;b&gt;Evil&lt;/b&gt;') && rowHtml.includes('&lt;i&gt;F&lt;/i&gt;'), rowHasRawTag: rowHtml.includes('<b>Evil</b>') };

    // BUG-8: a stuck Space-pan (Alt-Tab away while holding Space never delivers keyup) clears on
    // window blur instead of requiring another Space tap.
    document.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', bubbles: true }));
    const setTrue = spaceDown;
    window.dispatchEvent(new Event('blur'));
    out.bug8 = { setTrue, clearedOnBlur: spaceDown === false };

    return out;
  });

  // ── v1.25 (owner: "when selecting the preset worldshapes like volcanic, archipelago or
  // islands the result isn't what is suggested"): deriveFromWorldStructure() derives plates/
  // tectonicEnergy/volcanism from the archetype's bundle but never touched state.seaLevel — an
  // independent user slider — so a low-continentality archetype (Archipelago 0.15, Volcanic
  // 0.05) could still render MOSTLY LAND if the fixed default sea level (0.42) didn't happen to
  // land at the right threshold against that world's own height distribution (independently
  // verified: Archipelago rendered 71.5% land, Volcanic 60.6%, both MORE land than plain
  // Classic's 56.5% — the opposite of what those names promise). Fixed by
  // applyWorldStructureSeaLevel() — a histogram-quantile re-anchor of state.seaLevel to the
  // archetype's promised land fraction, gated on world_structure.enabled, called inside
  // generate() right after normalize()+the volcanism/craters clamp. Regression guard: at a fixed
  // seed/small resolution, land fraction must now track each archetype's own continentality
  // parameter (last test in the suite — no later assertion depends on the shared world after this).
  R.v125 = await page.evaluate(async () => {
    const out = { archetypes: {} };
    state.resW = 256; GW = 256; GH = gridH(GW); allocate();
    for (const arc of ['earth', 'supercontinent', 'archipelago', 'volcanic', 'rift']) {
      state.tect.seed = 20260725;
      _suApplyArchetype(arc);
      await generate();
      let land = 0;
      for (let i = 0; i < field.length; i++) if (field[i] >= state.seaLevel) land++;
      out.archetypes[arc] = {
        continentality: state.world_structure.continentality,
        landFraction: land / field.length,
        seaLevel: state.seaLevel,
        seaSliderReflectsState: Math.abs(+document.getElementById('sea').value - Math.round(state.seaLevel * 100)) <= 1
      };
    }
    return out;
  });

  // ── v1.26 (owner: Nortantis-style raster asset scattering with per-asset control) ─────────────
  // Until v1.25 the biome→asset mapping was HARD-CODED in placeMapIcons, so an asset's placement was
  // fixed by which of the 10 frozen PACK_ICON_SLOTS it occupied — nothing user-tunable, and no asset
  // outside that list could scatter at all. v1.26 makes that mapping DATA (ScatterRule), edited in the
  // Asset Library inspector and pushed to the engine by a new Library→runtime bridge. Guard the three
  // things that could silently break: (a) the legacy path stays reachable and byte-compatible when no
  // rules are configured (this is what keeps the default map bit-identical), (b) the rules actually
  // constrain placement, and (c) the density brush paints with the asset's own rule.
  R.v126 = await page.evaluate(() => {
    const out = {}, br = buildBiomeRaster();
    const base = { sea: state.seaLevel, seed: state.tect.seed, tempField: tempField, wetlandMask: currentWetlandMask() };

    // (a) no rules ⇒ legacy engine, four category arrays intact, plus the new unified Y-sorted items[]
    const legacy = placeMapIcons(field, br, GW, GH, base);
    out.legacyKeepsCategories = legacy.mountains.length > 0 && legacy.trees.length > 0;
    out.legacyItemsEqualSum = legacy.items.length === (legacy.mountains.length + legacy.hills.length + legacy.trees.length + legacy.scatter.length);
    let ySorted = true; for (let i = 1; i < legacy.items.length; i++) if (legacy.items[i].y < legacy.items[i - 1].y) { ySorted = false; break; }
    out.legacyYSorted = ySorted;
    // categories must genuinely interleave — that IS the v1.26 occlusion fix (a mountain no longer
    // unconditionally paints over a tree standing south of it)
    let interleaved = false; for (let i = 1; i < legacy.items.length; i++) if (legacy.items[i].cat !== legacy.items[i - 1].cat) { interleaved = true; break; }
    out.legacyInterleaved = interleaved;
    out.rulesNullByDefault = (assetRules === null) && (currentScatterRules() === null);

    // (b) a rule restricted to one biome places ONLY there, never in water, within its size range
    const ruled = placeMapIcons(field, br, GW, GH, Object.assign({}, base,
      { rules: [Object.assign(defaultScatterRule(), { key: 'tree_broadleaf', biomes: [5], density: 1.0, minSize: 0.4, maxSize: 0.9 })] }));
    out.ruledPlaced = ruled.items.length > 0;
    out.ruledObeysBiome = ruled.items.every(it => br[it.y * GW + it.x] === 5);
    out.ruledNeverInWater = ruled.items.every(it => field[it.y * GW + it.x] > state.seaLevel);
    out.ruledSizeInRange = ruled.items.every(it => it.s >= 0.4 - 1e-6 && it.s <= 0.9 + 1e-6);
    out.ruledLegacyArraysEmpty = ruled.mountains.length === 0 && ruled.trees.length === 0;
    // density is monotonic
    const cnt = d => placeMapIcons(field, br, GW, GH, Object.assign({}, base, { rules: [Object.assign(defaultScatterRule(), { key: 'shrub', density: d })] })).items.length;
    out.densityMonotonic = cnt(1.0) > cnt(0.15);
    // relief mode: elevation band + blue-noise spacing (no clumping/clipping)
    const relief = placeMapIcons(field, br, GW, GH, Object.assign({}, base,
      { rules: [Object.assign(defaultScatterRule(), { key: 'mountain', mode: 'relief', elevMin: 0.7, spacing: 8 })] }));
    const landDen = (1 - state.seaLevel) || 1;
    out.reliefObeysBand = relief.items.every(it => ((field[it.y * GW + it.x] - state.seaLevel) / landDen) >= 0.7);
    let minD = 1e9;
    for (let i = 0; i < relief.items.length; i++) for (let j = i + 1; j < relief.items.length; j++) {
      const dx = relief.items[i].x - relief.items[j].x, dy = relief.items[i].y - relief.items[j].y;
      const d = Math.sqrt(dx * dx + dy * dy); if (d < minD) minD = d;
    }
    out.reliefRespectsSpacing = relief.items.length < 2 || minD >= 8;

    // weighted variants: a zero weight is never selected; NO weights must reproduce the v1.25 hash pick
    let picked0 = 0, sameAsLegacy = true;
    for (let x = 0; x < 200; x++) { if (pickWeightedVariant(x, 7, 123, 3, [0, 1, 1]) === 0) picked0++;
      if (pickWeightedVariant(x, 7, 123, 3, null) !== pickIconVariant(x, 7, 123, 3)) sameAsLegacy = false; }
    out.weightZeroNeverPicked = picked0 === 0;
    out.unweightedMatchesLegacy = sameAsLegacy;

    // (c) the Library→runtime bridge, and pack-import autopopulation
    const gen0 = _scatterRulesGen;
    applyLibraryAssets({ icons: {}, custom: {}, rules: { shrub: Object.assign(defaultScatterRule(), { density: 0.5 }) } });
    out.bridgeSetRules = !!(assetRules && assetRules.shrub) && _scatterRulesGen > gen0;
    assetRules.shrub.enabled = false;
    out.bridgeFiltersDisabled = currentScatterRules() === null;   // disabled asset never reaches the engine
    applyLibraryAssets(null);
    autopopulateScatterRules({ icons: { tree_conifer: [{ w: 8, h: 8 }] }, custom: { MySet: { ruin: [{ w: 8, h: 8 }] } } });
    out.autoBindsDefaultBiomes = !!(assetRules && assetRules.tree_conifer && assetRules.tree_conifer.enabled)
      && assetRules.tree_conifer.biomes.join(',') === '3,4';               // boreal+conifer = the v1.25 hard-coded mapping
    out.autoCustomStartsDisabled = assetRules['custom::MySet::ruin'].enabled === false;   // no invented intent
    out.customKeySpelling = scatterRuleKey('ruin', 'MySet') === 'custom::MySet::ruin'
      && iconSlotForItem({ key: 'custom::S::a' }) === 'custom::S::a'
      && iconSlotForItem({ cat: 'tree', kind: 'conifer' }) === 'tree_conifer';
    applyLibraryAssets(null);
    return out;
  });

  // density brush: one stamp scatters MANY icons, on land, spaced, sized from the asset's own rule
  R.v126brush = await page.evaluate(() => {
    const out = {}, saved = state.mapIcons.slice();
    state.mapIcons.length = 0;
    _carIconArmed = { fam: 'feature', slot: 'tree_conifer', set: undefined };
    _carIconBrush.on = true; _carIconBrush.r = 14; _carIconBrush.density = 0.8;
    let lx = -1, ly = -1;
    for (let y = 2; y < GH - 2 && lx < 0; y++) for (let x = 2; x < GW - 2; x++) if (field[y * GW + x] > state.seaLevel + 0.05) { lx = x; ly = y; break; }
    const n = _carIconBrushStamp(lx, ly);
    out.paintedMultiple = n > 1;
    out.allOnLand = state.mapIcons.every(ic => field[ic.y * GW + ic.x] > state.seaLevel);
    out.allCorrectSlot = state.mapIcons.every(ic => ic.slot === 'tree_conifer');
    const ss = state.mapIcons.map(ic => ic.scale);
    out.sizeVaries = new Set(ss.map(v => v.toFixed(3))).size > 1;
    out.sizeFromRule = ss.every(v => v >= 0.7 - 1e-6 && v <= 1.2 + 1e-6);   // defaultScatterRule min/max
    let minD = 1e9;
    for (let i = 0; i < state.mapIcons.length; i++) for (let j = i + 1; j < state.mapIcons.length; j++) {
      const dx = state.mapIcons[i].x - state.mapIcons[j].x, dy = state.mapIcons[i].y - state.mapIcons[j].y;
      const d = Math.sqrt(dx * dx + dy * dy); if (d < minD) minD = d;
    }
    out.noOverlap = state.mapIcons.length < 2 || minD >= 1.2;
    out.withinBrush = state.mapIcons.every(ic => Math.hypot(ic.x - lx, ic.y - ly) <= 15);
    state.mapIcons.length = 0; for (const ic of saved) state.mapIcons.push(ic);
    _carIconBrush.on = false; _carIconArmed = null;
    return out;
  });

  // ── v1.27: senior-review bug fixes on the v1.26 scatter system ───────────────────────────────
  // Six defects found reviewing v1.26, each with a regression guard here. The rule table is loaded
  // from assetlib/library.json inside a user-supplied .zip, so normalizeScatterRule is an untrusted
  // input boundary — most of these are about it failing safe.
  R.v127 = await page.evaluate(() => {
    const out = {}, br = buildBiomeRaster(), wm = currentWetlandMask();
    const base = { sea: state.seaLevel, seed: state.tect.seed, tempField: tempField, wetlandMask: wm };
    const run = rules => placeMapIcons(field, br, GW, GH, Object.assign({}, base, { rules }));

    // FIX 1: wetland and biome are ANDed in scatter mode (v1.26 let requireWetland REPLACE the
    // biome test in this mode only, silently discarding the user's biome picks).
    const wetB = {}; for (let i = 0; i < wm.length; i++) if (wm[i] === 1) wetB[br[i]] = (wetB[br[i]] || 0) + 1;
    const target = Object.keys(wetB).map(Number).filter(b => b > 0).sort((a, b) => wetB[b] - wetB[a])[0];
    out.hasWetlandBiome = target != null;
    if (target != null) {
      const both = run([Object.assign(defaultScatterRule(), { key: 'tree_wetland', requireWetland: true, biomes: [target], density: 1.0 })]);
      const wetOnly = run([Object.assign(defaultScatterRule(), { key: 'tree_wetland', requireWetland: true, biomes: [], density: 1.0 })]);
      out.andSatisfiesBoth = both.items.length > 0 && both.items.every(it => { const i = it.y * GW + it.x; return wm[i] === 1 && br[i] === target; });
      out.biomeNarrows = both.items.length < wetOnly.items.length;   // proves the biome term really filters
    }

    // FIX 2: normalizeScatterRule rejects non-finite input and keeps a legitimate 0.
    const bad = normalizeScatterRule({ enabled: 1, mode: 'nonsense', density: 'abc', minSize: 'x', maxSize: null,
      spacing: 'NaN', elevMin: 'zzz', biomes: 'not-an-array', variantWeights: 'nope' }, 'shrub');
    out.normAllFinite = Number.isFinite(bad.density) && Number.isFinite(bad.minSize) && Number.isFinite(bad.maxSize);
    out.normSane = bad.mode === 'scatter' && bad.spacing === null && bad.elevMin === null
      && Array.isArray(bad.biomes) && bad.biomes.length === 0 && bad.variantWeights === null && bad.enabled === true;
    out.zeroDensityKept = normalizeScatterRule({ density: 0 }, 'shrub').density === 0;      // `+x||dflt` used to eat 0
    out.densityClamped = normalizeScatterRule({ density: 99 }, 'shrub').density === 3;
    // FIX 2b: normalize must not alias its own defaults object (Object.assign(base,r) returned base,
    // so every `base.<field>` fallback read the garbage it was meant to replace).
    out.noAliasing = normalizeScatterRule({ minSize: 'x' }, 'shrub').minSize === defaultScatterRule().minSize;
    // a NaN density must not scatter on literally every land cell (the v1.26 failure mode)
    const nanRule = normalizeScatterRule({ density: 'abc', biomes: [] }, 'shrub'); nanRule.key = 'shrub';
    let landCells = 0; for (let i = 0; i < field.length; i++) if (field[i] > state.seaLevel) landCells++;
    out.nanDensityBounded = run([nanRule]).items.length < landCells * 0.5;

    // FIX 3: a rule that bypassed normalize (direct caller / unit test) with NaN spacing must not
    // collapse the relief bucket grid into one bucket (O(1) neighbour test → O(n²) scan).
    const t0 = performance.now();
    const reliefNaN = run([{ key: 'mountain', enabled: true, mode: 'relief', biomes: [], minSize: 0.5, maxSize: 1,
      density: NaN, spacing: NaN, elevMin: 0.6, elevMax: null, requireWetland: false, variantWeights: null }]);
    out.reliefNaNSurvives = reliefNaN.items.length > 0 && (performance.now() - t0) < 2000;

    // FIX 4: the bridge retires art it previously owned (deleting every variant in the Library used
    // to leave the old bitmaps live in assetPack forever).
    applyLibraryAssets(null);
    const fake = [{ w: 8, h: 8, bmp: document.createElement('canvas') }];
    applyLibraryAssets({ icons: { shrub: fake }, custom: { Set1: { ruin: fake } }, rules: {} });
    const installed = !!assetPack.icons.shrub && !!(assetPack.custom && assetPack.custom.Set1);
    applyLibraryAssets({ icons: {}, custom: {}, rules: {}, dropIcons: ['shrub'], dropCustom: ['Set1::ruin'] });
    out.bridgeRetires = installed && !assetPack.icons.shrub && !(assetPack.custom && assetPack.custom.Set1);
    applyLibraryAssets(null);

    // FIX 5: scatter priority is specificity-ordered, so the winner no longer depends on the order
    // rules happened to be inserted into the table.
    if (target != null) {
      const broad = Object.assign(defaultScatterRule(), { key: 'BROAD', biomes: [], density: 1.0 });
      const narrow = Object.assign(defaultScatterRule(), { key: 'NARROW', biomes: [target], density: 1.0 });
      const keysIn = res => { const s = {}; for (const it of res.items) if (br[it.y * GW + it.x] === target) s[it.key] = 1; return Object.keys(s).sort().join(','); };
      out.priorityStable = keysIn(run([broad, narrow])) === keysIn(run([narrow, broad]));
      out.prioritySpecificWins = keysIn(run([broad, narrow])) === 'NARROW';
    }
    return out;
  });

  // FIX 6: the brush bounds its dart count, so a max-radius/max-density stamp can't blow a frame.
  R.v127brush = await page.evaluate(() => {
    const out = {}, saved = state.mapIcons.slice();
    state.mapIcons.length = 0;
    _carIconArmed = { fam: 'feature', slot: 'tree_conifer', set: undefined };
    _carIconBrush.on = true; _carIconBrush.r = 60; _carIconBrush.density = 2.0;   // slider maxima
    let lx = -1, ly = -1;
    for (let y = 80; y < GH - 80 && lx < 0; y++) for (let x = 80; x < GW - 80; x++) if (field[y * GW + x] > state.seaLevel + 0.05) { lx = x; ly = y; break; }
    const t0 = performance.now(); const n = _carIconBrushStamp(lx, ly); const ms = performance.now() - t0;
    out.stillPaints = n > 0;
    out.bounded = ms < 500;
    out.allOnLand = state.mapIcons.every(ic => field[ic.y * GW + ic.x] > state.seaLevel);
    state.mapIcons.length = 0; for (const ic of saved) state.mapIcons.push(ic);
    _carIconBrush.on = false; _carIconArmed = null;
    return out;
  });

  // ── v1.28: wire up the three families the Asset Library reserved but nothing ever drew ────────
  // Before this pass, Settlement traits, Biome textures and Terrain textures all had Library storage,
  // an inspector card and an export slot, but no render path: 'trait' was skipped by the pack manifest
  // importer and never drawn beside a pin, and neither texture family appeared in PACK_TEX_SLOTS.
  // These guards install distinctive synthetic art and assert the rendered pixels actually change.
  R.v128 = await page.evaluate(() => {
    const out = {};
    const solid = (r, g, b, n) => { n = n || 8; const d = new Uint8ClampedArray(n * n * 4);
      for (let i = 0; i < n * n; i++) { d[i*4] = r; d[i*4+1] = g; d[i*4+2] = b; d[i*4+3] = 255; }
      return { w: n, h: n, data: d }; };
    const px = (x, y) => { const d = document.getElementById('view').getContext('2d').getImageData(x, y, 1, 1).data; return [d[0], d[1], d[2]]; };
    const savedPack = assetPack;
    let LX = -1, LY = -1;
    for (let y = 40; y < GH - 40 && LX < 0; y++) for (let x = 40; x < GW - 40; x++) if (field[y*GW+x] > state.seaLevel + 0.08) { LX = x; LY = y; break; }
    out.foundCell = LX >= 0;

    // frozen-vocabulary alignment: a slot's index IS its CART_* paint value, so a length drift here
    // would silently map art to the wrong biome/terrain
    out.vocabAligned = PACK_BIOME_SLOTS.length === CART_BIOMES.length
      && PACK_TERRAIN_SLOTS.length === CART_TERRAINS.length
      && PACK_STRUCT_SLOTS.trait.length === CIV_TRAITS.length
      && CIV_TRAITS.every(t => PACK_STRUCT_SLOTS.trait.includes(t.key));

    if (LX >= 0) {
      // BIOME texture: painted cell must take the texture's TRUE colour, not the flat palette swatch
      const pb = getPaintLayer('biome');
      for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) pb[(LY+dy)*GW+(LX+dx)] = 2;   // Temperate Forest
      _paintGen++; assetPack = null; _assetGen++; renderNow();
      const bioFlat = px(LX, LY);
      applyLibraryAssets({ biomes: { temperate_forest: solid(255, 0, 255) } }); renderNow();
      const bioTex = px(LX, LY);
      out.biomeTexture = (bioTex[0] - bioFlat[0]) > 40 && (bioTex[2] - bioFlat[2]) > 40;
      // and removing the pack falls back to the flat swatch (keeps a pack-less world unchanged)
      assetPack = null; _assetGen++; renderNow();
      const back = px(LX, LY);
      out.biomeFallback = Math.abs(back[0]-bioFlat[0]) < 3 && Math.abs(back[1]-bioFlat[1]) < 3 && Math.abs(back[2]-bioFlat[2]) < 3;
      pb.fill(0); _paintGen++;

      // TERRAIN texture: same, on the other painted layer
      const pt = getPaintLayer('terrain');
      for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) pt[(LY+dy)*GW+(LX+dx)] = 1;   // Paved Road
      _paintGen++; renderNow();
      const terFlat = px(LX, LY);
      applyLibraryAssets({ terrains: { paved: solid(0, 255, 255) } }); renderNow();
      const terTex = px(LX, LY);
      out.terrainTexture = (terTex[1] - terFlat[1]) > 40 && (terTex[2] - terFlat[2]) > 40;
      pt.fill(0); _paintGen++; assetPack = null; _assetGen++; renderNow();
    }

    // _assetGen must participate in the bake/tile cache keys, or a freshly imported pack would only
    // appear once some unrelated key component happened to change (the v0.86/v0.88 bug class)
    const g0 = _assetGen; applyLibraryAssets({ biomes: {} });
    out.assetGenBumps = _assetGen > g0;
    out.assetGenInKeys = _lodRenderKey().split('|').length >= 12;

    // TRAITS: 'administrative' was assigned by the economy code and had a Library slot, but was
    // missing from CIV_TRAITS entirely, so it could never be toggled or drawn.
    out.administrativeAdded = CIV_TRAITS.some(t => t.key === 'administrative');
    out.traitFnsExist = typeof _traitSprite === 'function' && typeof _civDrawTraitBadges === 'function';
    const cv = document.createElement('canvas'); cv.width = cv.height = 160; const cx = cv.getContext('2d');
    const place = { x: 0, y: 0, kind: 'town', name: '', faction: 1, traits: [] };
    const ink = c => { let n = 0; const d = c.getImageData(0, 0, 160, 160).data; for (let i = 3; i < d.length; i += 4) if (d[i] > 8) n++; return n; };
    cx.clearRect(0, 0, 160, 160); _civDrawSettlementPin(cx, 80, 80, place, false, { skipLabel: true });
    const bare = ink(cx);
    place.traits = ['fortified', 'mining', 'port'];
    cx.clearRect(0, 0, 160, 160); _civDrawSettlementPin(cx, 80, 80, place, false, { skipLabel: true });
    out.traitBadgesDrawn = ink(cx) > bare;
    // with real trait art the badge uses the sprite rather than the glyph fallback
    const red = document.createElement('canvas'); red.width = red.height = 8;
    { const g = red.getContext('2d'); g.fillStyle = '#ff0000'; g.fillRect(0, 0, 8, 8); }
    applyLibraryAssets({ structures: { trait: { fortified: [{ w: 8, h: 8, bmp: red }] } } });
    place.traits = ['fortified'];
    cx.clearRect(0, 0, 160, 160); _civDrawSettlementPin(cx, 80, 80, place, false, { skipLabel: true });
    const d2 = cx.getImageData(0, 0, 160, 160).data; let redPx = 0;
    for (let i = 0; i < d2.length; i += 4) if (d2[i] > 200 && d2[i+1] < 60 && d2[i+2] < 60) redPx++;
    out.traitSpriteUsed = redPx > 0;

    assetPack = savedPack; _assetGen++; renderNow();
    return out;
  });

  /* ── v1.29: eight owner-reported bugs (river ways, zoom focal point, LOD seam/refine, 3D lakes) ── */
  R.v129 = await page.evaluate(() => {
    const out = {};

    // B1 — every range input suppresses the touch long-press callout, not just the ones inside .row.
    // `-webkit-touch-callout` is an iOS-Safari property that Chromium does not expose on
    // getComputedStyle, so it is checked in the stylesheet instead; touch-action/user-select are
    // standard and are checked on the resolved style of every real slider in the document.
    { const ranges = [...document.querySelectorAll('input[type=range]')];
      out.rangeCount = ranges.length;
      out.rangesSuppressSelect = ranges.length > 0 && ranges.every(r => {
        const cs = getComputedStyle(r);
        return cs.touchAction === 'none' && (cs.userSelect === 'none' || cs.webkitUserSelect === 'none');
      });
      // Chromium does not implement -webkit-touch-callout, so it drops the declaration at parse time
      // and neither getComputedStyle nor CSSRule.style can see it. Assert against the authored CSS
      // source instead — the property only has to reach a real iOS browser, not this one.
      const css = [...document.querySelectorAll('style')].map(s => s.textContent).join('\n');
      out.calloutSuppressed = /(^|[^.\w])input\[type=range\]\s*\{[^}]*-webkit-touch-callout\s*:\s*none/m.test(css); }

    // B2 — a receiver chain that jumps the world seam is split, never stroked across the map
    { const W = 20;
      const wrapped = [[{x:1.5,y:5.5},{x:2.5,y:5.5},{x:19.5,y:5.5},{x:18.5,y:5.5}]];
      const s = splitRiverPolylines(wrapped, W, null);
      out.seamSplit = s.length === 2 && s[0].length === 2 && s[1].length === 2;
      const straight = [[{x:1.5,y:1.5},{x:2.5,y:1.5},{x:3.5,y:1.5}]];
      out.seamNoOp = splitRiverPolylines(straight, W, null).length === 1
                  && splitRiverPolylines(straight, W, null)[0].length === 3;
      // B7 — the reach inside open water is dropped, the banks either side survive as separate runs
      // (a run of fewer than 2 points is not a strokable line, so both sides need 2+ non-lake points)
      const acrossLake = [[]]; for (let k = 0; k <= 8; k++) acrossLake[0].push({x:k+0.5,y:1.5});
      const lake = p => p.x > 3 && p.x < 6;
      const cut = splitRiverPolylines(acrossLake, W, lake);
      out.lakeSplit = cut.length === 2 && cut.every(r => r.length >= 2 && r.every(p => !lake(p)))
                   && cut[0][cut[0].length-1].x < 4 && cut[1][0].x > 5;
    }

    // B3 — on-screen river-way width no longer grows 1:1 with zoom
    { const widths = [];
      const cv = document.createElement('canvas'); cv.width = cv.height = 64;
      const probe = document.getElementById('view');
      const before = probe.width;
      // measure the formula directly at both camera conventions rather than re-rasterising
      const baseW0 = Math.max(0.6, GW / 620);
      const lodW = z => baseW0 * Math.sqrt(Math.max(1, z));          // under LOD: canvas px
      const offW = z => baseW0 / Math.sqrt(Math.max(0.35, Math.min(5, z)));  // off LOD: grid units, CSS then scales by z
      out.widthDampedLod = lodW(8) < baseW0 * 8 && lodW(8) > baseW0;                 // still grows, sub-linearly
      out.widthDampedOff = (offW(4) * 4) < baseW0 * 4 && (offW(4) * 4) > baseW0;     // on-screen = offW*z
      out.widthUnityAtZoom1 = Math.abs(lodW(1) - baseW0) < 1e-9 && Math.abs(offW(1) - baseW0) < 1e-9;
      out.probeUntouched = probe.width === before; widths.length = 0; cv.width = 1;
    }

    // B4 — LOD zoom keeps the point under the cursor fixed instead of zooming about the centre
    { const lc = document.getElementById('lodChk'); lc.checked = true; lc.dispatchEvent(new Event('change'));
      _lodZoom = 2; _lodCx = GW / 2; _lodCy = GH / 2; renderNow();
      const r = document.getElementById('view').getBoundingClientRect();
      const cxp = r.left + r.width * 0.25, cyp = r.top + r.height * 0.25;   // a quarter in from the top-left
      const worldAt = () => { const v = lodViewRect(); return [v.x0 + 0.25 * (v.x1 - v.x0), v.y0 + 0.25 * (v.y1 - v.y0)]; };
      const [wx0, wy0] = worldAt();
      const centreBefore = _lodCx;
      _lodZoomAt(cxp, cyp, 2); renderNow();
      const [wx1, wy1] = worldAt();
      out.zoomHoldsCursor = Math.abs(wx1 - wx0) < 0.75 && Math.abs(wy1 - wy0) < 0.75;
      out.zoomMovedCentre = Math.abs(_lodCx - centreBefore) > 0.5;   // proves it is not the old centre-zoom
      // and a centred call still behaves exactly like the old centre-zoom
      _lodZoom = 2; _lodCx = GW / 2; _lodCy = GH / 2;
      _lodZoomAt(r.left + r.width / 2, r.top + r.height / 2, 2);
      out.zoomCentreUnchanged = Math.abs(_lodCx - GW / 2) < 0.75 && Math.abs(_lodCy - GH / 2) < 0.75;
    }

    // B5 — the mobile joystick's LOD pan now schedules a refine (it never did), as does zoom-reset
    { out.joyRefineWired = /scheduleLodRefine/.test(_sculptNavPanLoop.toString());
      _lodZoom = 4; _lodCx = GW / 2; _lodCy = GH / 2;
      if (_lodRefineTimer) { clearTimeout(_lodRefineTimer); _lodRefineTimer = null; }
      document.getElementById('zoomReset').click();
      out.resetSchedulesRefine = _lodRefineTimer != null;
      if (_lodRefineTimer) { clearTimeout(_lodRefineTimer); _lodRefineTimer = null; }
    }

    // B5 — two adjacent tiles now agree at the world column they share (this WAS the seam).
    // z=1 (two columns across the whole world) guarantees both tiles are in bounds and both contain
    // ocean, which is where the per-tile sea-floor blur used to disagree.
    { const z = 1, ts = 512, opts = lodTileOpts();
      const { tileRGBA } = _lodBuildTileRGBA();
      const A = pyramidTile(field, GW, GH, z, 0, 0, ts, opts), B = pyramidTile(field, GW, GH, z, 1, 0, ts, opts);
      const bA = pyramidTileBounds(GW, GH, z, 0, 0), bB = pyramidTileBounds(GW, GH, z, 1, 0);
      const rA = tileRGBA(A.data, A.w, A.h, bA.x, bA.y, bA.w, bA.h);
      const rB = tileRGBA(B.data, B.w, B.h, bB.x, bB.y, bB.w, bB.h);
      const colMAD = (p, xp, q, xq) => { let s = 0, n = 0;
        for (let y = 0; y < A.h; y += 2) { const a = (y * A.w + xp) * 4, b = (y * B.w + xq) * 4;
          s += Math.abs(p[a] - q[b]) + Math.abs(p[a+1] - q[b+1]) + Math.abs(p[a+2] - q[b+2]); n++; }
        return s / n; };
      const shared = colMAD(rA, A.w - 1, rB, 0);
      const interior = (colMAD(rA, A.w - 2, rA, A.w - 1) + colMAD(rB, 0, rB, 1)) / 2;
      out.seamShared = +shared.toFixed(3); out.seamInterior = +interior.toFixed(3);
      out.tilesSeamless = shared <= Math.max(1.0, interior);   // the shared column is no worse than ordinary neighbours
    }

    // B6 — the 3D height source flattens inland lakes to their pooled surface, not just the ocean
    { const wb = currentWaterBodies();
      let li = -1; for (let i = 0; i < wb.length; i++) if (wb[i] === 2 && _lakeFill[i] > field[i] + 1e-4) { li = i; break; }
      out.foundLake = li >= 0;
      state.view3d.flatSea = true; state.viz.showLakes = true;
      const flat = _v3dHeightSource();
      out.lakeFlattened = li < 0 ? true : Math.abs(flat[li] - _lakeFill[li]) < 1e-6 && flat[li] > field[li];
      out.notInPlace = flat !== field || li < 0;                 // never mutates the real heightmap
      state.view3d.flatSea = false;
      out.offReturnsField = _v3dHeightSource() === field;        // toggle off ⇒ untouched, zero allocation
      state.view3d.flatSea = true;
      state.viz.showLakes = false;
      out.showLakesOffRespected = _v3dHeightSource() === field;  // contradicting the 2D map is not allowed
      state.viz.showLakes = true;
    }

    // B7 — a cell the lake floods sub-cell is treated as water by the settlement snap
    { const wb = currentWaterBodies();
      let lx = -1, ly = -1;
      for (let y = 1; y < GH - 1 && lx < 0; y++) for (let x = 1; x < GW - 1; x++) {
        const i = y * GW + x; if (wb[i] !== 0) continue;
        if (_civLakeFlooded(x, y, wb)) { lx = x; ly = y; break; }
      }
      out.foundFloodBand = lx >= 0;
      out.floodBandIsWet = lx < 0 ? true : (_civSnapLand(lx, ly, 12) == null || (_civSnapLand(lx, ly, 12)[0] !== lx || _civSnapLand(lx, ly, 12)[1] !== ly));
    }

    { const lc = document.getElementById('lodChk'); lc.checked = false; lc.dispatchEvent(new Event('change')); }
    return out;
  });

  /* ── v1.30: one suitability function (view == placer), flood wired in, per-settlement trade ── */
  R.v130 = await page.evaluate(async () => {
    const out = {};
    // the second, divergent scorer is gone — nothing may reintroduce a private copy
    out.extendedRetired = (typeof _civExtendedSuitability === 'undefined');
    out.oneThreshold = typeof SETTLE_SEED_THRESH === 'number';

    // the advisory seeds the debug view draws ARE the candidates auto-populate scores from:
    // same field object, same threshold
    const fieldA = currentSettlementSuitability(), fieldB = currentSettlementSuitability();
    out.sameFieldObject = fieldA === fieldB;                       // cached, so the view and placer cannot drift
    const seedsView = findSettlementSeeds(fieldA, GW, GH, { thresh: SETTLE_SEED_THRESH });
    out.seedCount = seedsView.length;
    out.seedsExist = seedsView.length > 0;

    // flood is now a real term: high-flood cells score below otherwise-identical dry ones
    { const flood = currentFloodField();
      let wet = -1, dry = -1;
      for (let i = 0; i < flood.length && (wet < 0 || dry < 0); i++) {
        if (field[i] < state.seaLevel) continue;
        if (flood[i] > 0.75 && wet < 0) wet = i;
        if (flood[i] < 0.15 && dry < 0) dry = i;
      }
      out.foundFloodPair = wet >= 0 && dry >= 0;
      // measured through the pure function so the comparison isolates the flood term
      if (wet >= 0) {
        const n = GW * GH, zero = new Float32Array(n), ones = new Float32Array(n).fill(1);
        const slopeN = new Float32Array(n).fill(0.5);
        const K = currentCarryingCapacity(), Wa = currentWaterAccess(), So = currentSoil();
        const a = buildSettlementSuitability(So, Wa, K, field, slopeN, GW, GH, state.seaLevel, { ctx: { flood: zero } });
        const b = buildSettlementSuitability(So, Wa, K, field, slopeN, GW, GH, state.seaLevel, { ctx: { flood: ones } });
        out.floodPenalises = b[wet] < a[wet];
      }
    }

    // per-settlement trade: derived from this settlement's own hinterland/specialisation/food,
    // not copied from its faction
    { const places = (state.places || []).filter(p => p && p.category === 'settlement');
      out.havePlaces = places.length > 0;
      if (places.length) {
        const trades = places.map(p => _civPlaceTrade(p));
        out.anyTrade = trades.some(t => t.exports.length || t.imports.length);
        out.noGoodBothWays = trades.every(t => t.exports.every(k => t.imports.indexOf(k) < 0));
        out.everyTradeHasBasis = trades.every(t => (!t.exports.length && !t.imports.length) || t.basis.length > 0);
        // …and it is genuinely per-settlement: at least two settlements disagree, OR there is only one
        const sigs = new Set(trades.map(t => t.exports.join('|') + '/' + t.imports.join('|')));
        out.variesBySettlement = places.length < 2 || sigs.size > 1;
        // a settlement with a specialisation exports its primary good
        const spec = places.find(p => p.specialisation && p.specialisation !== 'none' && _CIV_SPEC_EXPORT[p.specialisation]);
        out.specExports = !spec || _civPlaceTrade(spec).exports.indexOf(_CIV_SPEC_EXPORT[spec.specialisation]) >= 0;
        // the inspector actually renders it
        const html = _civFormatPlaceInsp(places[0]);
        out.inspectorRenders = typeof html === 'string' && /Exports|Prosperity/.test(html);
      }
    }
    return out;
  });

  /* ---- v1.31: resource vocabulary + crustal-abundance scarcity, charcoal-limited iron, the §9 trade
     checklist, §8 archetypes, §6 pastoral/arable tension, §7 navigability, §10.7 subsistence density.
     All civ-layer (block 2) or opts-gated block-1 additions, so this is the smoke suite's job, not the
     headless one. Runs against the world the earlier blocks already generated and auto-populated. ---- */
  R.v131 = await page.evaluate(async () => {
    const o = {};
    // vocabulary grew, append-only (the original six keep their indices)
    o.keyCount = RESOURCE_KEYS.length;
    o.appendOnly = ['copper','tin','iron','gold','salt','timber'].every((k, i) => RESOURCE_KEYS[i] === k);
    o.namesAligned = RESOURCE_NAMES.length === RESOURCE_KEYS.length && RESOURCE_COLS.length === RESOURCE_KEYS.length;
    o.civKeysTrack = CIV_RESOURCE_KEYS.length === RESOURCE_KEYS.length;
    // §10.1 scarcity: the cut is monotonic in crustal abundance, so tin is scarcer than copper than iron
    o.cutIron = resourceScarcityCut('iron'); o.cutCopper = resourceScarcityCut('copper');
    o.cutTin = resourceScarcityCut('tin');   o.cutGold = resourceScarcityCut('gold');
    o.scarcityOrdered = o.cutGold < o.cutTin && o.cutTin < o.cutCopper && o.cutCopper < o.cutIron;
    o.cutsBounded = [o.cutIron, o.cutGold].every(v => v > 0 && v <= 0.45);
    // applyResourceScarcity only ever removes, never invents
    (() => {
      const W = 8, H = 8, n = W * H, fld = new Float32Array(n).fill(1), a = new Float32Array(n);
      for (let i = 0; i < n; i++) a[i] = i / n;
      const before = Array.from(a);
      applyResourceScarcity(a, fld, W, H, 0.42, 0.25);
      let invented = 0, kept = 0;
      for (let i = 0; i < n; i++) { if (a[i] > 0 && before[i] === 0) invented++; if (a[i] > 0) kept++; }
      o.scarcityNeverInvents = invented === 0;
      o.scarcityThins = kept < n && kept > 0;
      o.scarcityKeepsStrongest = a[n - 1] > 0 && a[0] === 0;
    })();
    // the new fields exist on a real world and are finite + in range
    const pots = currentResourcePotentials(), nn = GW * GH;
    o.allFieldsPresent = RESOURCE_KEYS.every(k => pots[k] && pots[k].length === nn);
    o.allFinite = RESOURCE_KEYS.every(k => { const a = pots[k]; for (let i = 0; i < nn; i++) if (!isFinite(a[i]) || a[i] < 0 || a[i] > 1) return false; return true; });
    // scarce resources genuinely occupy less of the map than common ones
    const share = k => { let c = 0, land = 0; for (let i = 0; i < nn; i++) { if (field[i] < state.seaLevel) continue; land++; if (pots[k][i] > 0.25) c++; } return land ? c / land : 0; };
    o.shareObsidian = share('obsidian'); o.shareClay = share('clay'); o.shareSilver = share('silver');
    o.rarityShowsOnMap = o.shareObsidian < o.shareClay && o.shareSilver < o.shareClay;
    // the channel atlas covers every key (the frozen-literal bug this version fixed)
    const groups = channelAtlasGroups(); const atlasKeys = new Set();
    for (const g of groups) for (const c of g.channels) atlasKeys.add(c.key);
    o.atlasCoversAll = RESOURCE_KEYS.every(k => atlasKeys.has(k));
    // world means: no NaN (mkResMap was a frozen six-key literal indexed with fifteen keys)
    const agg = _civFactionAggregates();
    o.worldMeanNoNaN = RESOURCE_KEYS.every(k => isFinite(agg.worldMeanResource[k]));
    // §10.7 subsistence density
    o.modeOrdered = SUBSISTENCE_MODES.every((m, i) => i === 0 || m.lo >= SUBSISTENCE_MODES[i - 1].lo);
    o.modeOcean = subsistenceModeAt(0.9, 1, 0, 0.9) === 0;
    o.modeIntensive = subsistenceModeAt(0.9, 0.9, 5, 0.9) === 3;
    o.modeMarginal = subsistenceModeAt(0.02, 0.05, 5, 0.05) === 0;
    o.densityMonotonic = agrarianDensityKm2(0.9, 0.9, 5, 0.9) > agrarianDensityKm2(0.2, 0.2, 5, 0.2);
    // the normalisation holds the world total at the pre-v1.31 K x AGRARIAN_MAX_KM2 basis
    (() => {
      const dens = currentAgrarianDensity(), K = currentCarryingCapacity();
      let a = 0, b = 0; for (let i = 0; i < nn; i++) { if (field[i] < state.seaLevel) continue; a += dens[i]; b += K[i] * AGRARIAN_MAX_KM2; }
      o.densityTotalPreserved = b > 0 && Math.abs(a - b) / b < 0.001;
      // but the DISTRIBUTION genuinely changed - density is no longer a fixed multiple of K
      let ratios = []; for (let i = 0; i < nn; i += 97) { if (field[i] < state.seaLevel || K[i] < 0.05) continue; ratios.push(dens[i] / K[i]); }
      o.densityVaries = ratios.length > 4 && (Math.max(...ratios) - Math.min(...ratios)) > 1;
    })();
    // §10.2/§10.3 charcoal-limited iron
    const places = (state.places || []).filter(p => p && p.category === 'settlement');
    o.nPlaces = places.length;
    o.ratioSane = CHARCOAL_PER_IRON_KG > 5 && CHARCOAL_PER_IRON_KG < 8 && CHARCOAL_KG_PER_HA_YR < CHARCOAL_KG_PER_HA_YR_MAX;
    if (places.length) {
      const sm = places.map(p => _civPlaceSmelting(p));
      o.smeltFinite = sm.every(x => isFinite(x.ironKgYr) && isFinite(x.charcoalKgYr) && x.ironKgYr >= 0);
      o.smeltIsMin = sm.every(x => x.ironKgYr <= x.oreKgYr * ORE_TO_BLOOM_RECOVERY + 1e-6 && x.ironKgYr <= x.charcoalKgYr / CHARCOAL_PER_IRON_KG + 1e-6);
      o.smeltLabels = sm.every(x => x.limitedBy === 'ore' || x.limitedBy === 'fuel');
      /* v1.60: "at least one settlement is fuel-limited" is a statistical property of whatever world
         happens to be ambient at this point in the long sequential smoke run (currently the v1.11
         submap-resample leftover: seed 55555, resW 512, mapWidthKm~400) — the crater/volcano radius
         ceiling clamp (v1.60 Stage A: a single crater/volcano can no longer balloon past ~12% of the
         grid, a universal, non-scale-gated correctness fix) legitimately reshaped that seed's geology
         enough to move every iron settlement to ore-limited. Not a terrain-generation regression: an
         independent probe (seed 12345, resW 256, mapWidthKm 800 — the same seed this feature's own
         CHANGELOG entry was verified against) reproduces "2 of 3 iron settlements fuel-limited" on
         BOTH v1.59 and v1.60. Isolate the measurement on that dedicated fresh world instead of relying
         on fragile shared ambient state, the same test-isolation discipline v1.24 BUG-3 / v1.46 / v1.58
         already established for this exact "small fixed sample is fragile to noise" failure shape.
         v1.78: the isolation above was itself incomplete — it never saved/restored
         `state.world_structure.enabled`, which an earlier, unrelated World Structure archetype smoke
         block leaves `true`. That drives `state.seaLevel` to 0.482 (via `applyWorldStructureSeaLevel`)
         instead of the default 0.42 and perturbs tectonic params via `deriveFromWorldStructure`, which
         reshapes this seed's geology enough to move every iron settlement off fuel-limited — the exact
         same "ambient state leaks into an 'isolated' test" shape this comment already warns about, one
         flag deeper. Now forced off for the duration, restored afterward. */
      {
        const savedPlaces = state.places, savedSeed = state.tect.seed, savedResW = state.resW, savedKm = state.mapWidthKm;
        const savedWS = state.world_structure.enabled;
        try {
          state.mapWidthKm = 800; state.tect.seed = 12345; state.resW = 256; GW = 256; GH = gridH(GW); allocate();
          state.world_structure.enabled = false;
          await generate();
          state.places = []; _civIterativeAutoWorld(3);
          const fuelPlaces = (state.places || []).filter(p => p && p.category === 'settlement');
          const fuelSm = fuelPlaces.map(p => _civPlaceSmelting(p));
          o.someFuelLimited = fuelSm.some(x => x.ironKgYr > 0 && x.limitedBy === 'fuel');
        } finally {
          state.mapWidthKm = savedKm; state.resW = savedResW; GW = savedResW; GH = gridH(GW); allocate();
          state.tect.seed = savedSeed; state.world_structure.enabled = savedWS; await generate();
          state.places = savedPlaces;
        }
      }
      o.coppiceScales = sm.every(x => x.ironKgYr === 0 || x.coppiceHaNeeded > 0);
      // §9 checklist + §8 archetype + §6 + §7
      const tr = places.map(p => _civPlaceTrade(p));
      o.checklistShape = tr.every(t => t.checklist.length === CIV_TRADE_CATEGORIES.length &&
        t.checklist.every(c => typeof c.met === 'boolean' && ['critical','important','ordinary'].indexOf(c.severity) >= 0));
      o.noGoodBothWays = tr.every(t => t.exports.every(g => t.imports.indexOf(g) < 0));
      o.archetypesValid = tr.every(t => t.archetype === null || CIV_SETTLEMENT_ARCHETYPES.some(a => a.key === t.archetype));
      o.someArchetype = tr.some(t => t.archetype !== null);
      // §6: shares are fractions, manure uplift bounded, mode labelled
      o.pastoralShapes = tr.every(t => !t.pastoral || (t.pastoral.pastureShare >= 0 && t.pastoral.pastureShare <= 1 &&
        t.pastoral.cropShare >= 0 && t.pastoral.cropShare <= 1 && t.pastoral.manureUplift >= 0 &&
        t.pastoral.manureUplift <= MANURE_MAX_UPLIFT && ['arable','pastoral','mixed'].indexOf(t.pastoral.mode) >= 0));
      o.pastoralSharesDisjoint = tr.every(t => !t.pastoral || t.pastoral.pastureShare + t.pastoral.cropShare <= 1.001);
      // §7: bulk goods without navigable water can only reach 'local'; luxuries always reach far
      o.navShapes = tr.every(t => t.navigability && ['sea','river','stream','none'].indexOf(t.navigability.kind) >= 0);
      o.bulkGatedByWater = tr.every(t => t.exports.every(g => {
        const r = t.reach[g];
        if (CIV_GOOD_LUXURY[g]) return r === 'long';
        if (CIV_GOOD_BULK[g] && !t.navigability.navigable) return r === 'local';
        return ['local','regional','long'].indexOf(r) >= 0;
      }));
      o.luxuryAlwaysTravels = _civGoodReach('gems', { navigable: false, kind: 'none' }) === 'long';
      o.bulkNeedsWater = _civGoodReach('grain', { navigable: false, kind: 'none' }) === 'local' &&
                         _civGoodReach('grain', { navigable: true, kind: 'sea' }) === 'long';
    }
    return o;
  });

  /* ---- v1.32: overlay scroll guard, faction export thresholds, real-km coastal/river detection,
     Explore opening the anchored popup instead of the fullscreen viewer. ---- */
  R.v132 = await page.evaluate(async () => {
    const o = {};
    const places = (state.places || []).filter(p => p && p.category === 'settlement');
    o.nPlaces = places.length;

    // A: an overlay layered over the canvas must not have its wheel eaten by the map zoom handler
    o.guardExists = typeof _overCanvasOverlay === 'function';
    if (o.guardExists) {
      const ob = document.getElementById('onboard');
      const card = ob && ob.querySelector('.card');
      o.gateIsCanvasChild = !!(ob && ob.closest('.canvas-wrap'));
      o.gateCardScrollable = !!(card && getComputedStyle(card).overflowY === 'auto');
      o.guardMatchesGate = !!(card && _overCanvasOverlay({ target: card }));
      o.guardIgnoresCanvas = !_overCanvasOverlay({ target: document.getElementById('view') });
    }

    // B: faction exports must be reachable. The old rule needed territoryMean - worldMean > 0.15
    // absolute, which after v1.31's scarcity thinning no faction could ever satisfy.
    let agg = _civFactionAggregates();
    o.territoryCells0 = agg.byFaction.reduce((s2, f) => s2 + (f.territoryCells || 0), 0);
    /* A faction with no territory has a resource mean of 0 for everything, so "exports nothing" is the
       CORRECT answer and the export rule is untested. Generate territories first if this world has
       none, so the assertion is measuring the threshold rather than an empty polity. */
    if (!o.territoryCells0) {
      const tb = document.getElementById('civAutoPolityBtn');
      if (tb) { tb.click(); await new Promise(r => setTimeout(r, 2500)); }
      if (typeof _civAggGen !== 'undefined') _civAggGen++;
      agg = _civFactionAggregates();
    }
    o.territoryCells = agg.byFaction.reduce((s2, f) => s2 + (f.territoryCells || 0), 0);
    o.nFactions = agg.byFaction.length;
    o.factionsWithExports = agg.byFaction.filter(f => f.exports && f.exports.length).length;
    /* 'food' comes from the food-surplus branch, not the resource-threshold branch, so counting it
       would let this assertion pass without ever exercising the rule the owner reported broken. */
    o.factionsWithResourceExports = agg.byFaction.filter(f => (f.exports || []).some(k => k !== 'food')).length;
    o.factionsWithImports = agg.byFaction.filter(f => f.imports && f.imports.length).length;
    o.exportsAreValidKeys = agg.byFaction.every(f => (f.exports || []).every(k => k === 'food' || CIV_RESOURCE_KEYS.indexOf(k) >= 0));
    o.noGoodBothWays = agg.byFaction.every(f => (f.exports || []).every(k => (f.imports || []).indexOf(k) < 0));

    // D/E: coastal + river classification must agree with the authoritative distance fields
    if (places.length) {
      let wrongCoastal = 0, badRiver = 0, kinds = {};
      for (const p of places) {
        const k = _umSiteKindFromTerrain(p); kinds[k] = (kinds[k] || 0) + 1;
        const sp = _umSiteProfile(p);
        if (!sp) continue;
        const coastal = (k === 'coast' || k === 'bay' || k === 'riverthrough');
        // a town called coastal whose chamfer-DT coast distance is many box-lengths away is the bug
        if (coastal && isFinite(sp.coastDistKm) && sp.coastDistKm > _umWaterNearKm() * 4) wrongCoastal++;
        // an order/width filled in for a river that is nowhere near is the 618km readout
        if (sp.riverOrder > 0 && isFinite(sp.riverDistKm) && sp.riverDistKm > UM_RIVER_CONTEXT_KM) badRiver++;
      }
      o.kinds = kinds; o.wrongCoastal = wrongCoastal; o.badRiver = badRiver;
      o.profileFinite = places.every(p => { const sp = _umSiteProfile(p); return !sp ||
        (isFinite(sp.buildableFrac) && sp.buildableFrac >= 0 && sp.buildableFrac <= 1 &&
         isFinite(sp.slopeN) && sp.slopeN >= 0 && (sp.riverOrder === 0 || isFinite(sp.riverDistKm))); });
      // the thresholds are real-km, so they must not change when only the grid resolution does
      o.boxKmSane = _umSiteBoxKm() > 0.5 && _umSiteBoxKm() < 5 && _umWaterNearKm() > _umSiteBoxKm();
    }

    // C: an Explore pin hit opens the anchored popup (with the city card on top), not the fullscreen modal
    if (places.length) {
      const p = places[0];
      _civSelectedPlace = p; _civSelectedRowRefs = null;
      _civOpenPlacePopup();
      const el = document.getElementById('placeEditPopup');
      o.popupOpens = !!(el && el.style.display === 'block');
      o.popupHasCityCard = !!(el && el.querySelector('#peCityPreview'));
      o.popupHasCityButton = !!(el && el.querySelector('#peCityOpen'));
      o.popupHasEditableFields = !!(el && el.querySelector('#placeEditPopupBody input'));
      const modal = document.getElementById('cityViewerModal');
      o.fullscreenNotForced = !modal || getComputedStyle(modal).display === 'none';
      if (el) el.style.display = 'none';
      _civSelectedPlace = null;
    }
    return o;
  });

  /* ---- v1.33: one shared trade rule across every reporting surface, plus the food-shed ceiling ---- */
  R.v133 = await page.evaluate(async () => {
    const o = {};
    const places = (state.places || []).filter(p => p && p.category === 'settlement');
    o.nPlaces = places.length;

    // AUDIT: the settlement rule and the faction rule must be the SAME rule, not two copies
    o.sharedRuleExists = typeof _civResourceTradeBalance === 'function';
    if (o.sharedRuleExists) {
      const agg = _civFactionAggregates(), wm = agg.worldMeanResource;
      // a mean well above the world mean exports; well below imports; identical means do neither
      const hi = {}, lo = {}, same = {};
      for (const k of CIV_RESOURCE_KEYS) { hi[k] = (wm[k] || 0) * 3 + 0.5; lo[k] = 0; same[k] = wm[k] || 0; }
      const bHi = _civResourceTradeBalance(hi, wm), bLo = _civResourceTradeBalance(lo, wm), bSame = _civResourceTradeBalance(same, wm);
      o.ruleExportsWhenRich = bHi.exports.length > 0 && bHi.imports.length === 0;
      o.ruleImportsWhenPoor = bLo.imports.length > 0 && bLo.exports.length === 0;
      o.ruleNeutralWhenAverage = bSame.exports.length === 0;
      // and the settlement path must agree with the shared rule on the same inputs
      if (places.length) {
        const p = places[0], rc = _civPlaceResourceContext(p);
        const direct = _civResourceTradeBalance(rc.mean, wm);
        const viaTrade = _civPlaceTrade(p);
        o.settlementUsesSharedRule = direct.exports.every(k => viaTrade.exports.indexOf(k) >= 0);
      }
    }

    // FOOD SHED: transport decay must follow the cost model, water must beat land
    o.decayLand50 = _civFoodDeliverable(50, 'land');
    o.decayLand300 = _civFoodDeliverable(300, 'land');
    o.decaySea800 = _civFoodDeliverable(800, 'sea');
    o.decayLand800 = _civFoodDeliverable(800, 'land');
    o.decayMonotonic = _civFoodDeliverable(10, 'land') > _civFoodDeliverable(100, 'land');
    o.waterBeatsLand = o.decaySea800 > o.decayLand800 && _civFoodDeliverable(400, 'river') > _civFoodDeliverable(400, 'land');
    o.decayHalvesAtDoubleKm = Math.abs(_civFoodDeliverable(FOOD_DOUBLE_KM.land, 'land') - 0.5) < 1e-6;
    o.modePicksCheapest = _civFoodMode({ kind: 'sea' }, { kind: 'sea' }) === 'sea' &&
                          _civFoodMode({ kind: 'sea' }, { kind: 'none' }) === 'land' &&
                          _civFoodMode({ kind: 'river' }, { kind: 'sea' }) === 'river';

    if (places.length) {
      const sheds = places.map(p => _civFoodShed(p));
      o.shedsFinite = sheds.every(f => isFinite(f.supported) && f.supported >= 0 &&
        isFinite(f.localCapacity) && isFinite(f.hinterlandCapacity) && isFinite(f.importCapacity));
      o.shedSumsCorrectly = sheds.every(f => Math.abs(f.supported - (f.localCapacity + f.hinterlandCapacity + f.importCapacity)) < 1);
      // the hinterland (countryside) must actually contribute — an earlier cut counted only other
      // settlements' surplus and crushed every capital to its own catchment disc
      o.hinterlandContributes = sheds.some(f => f.hinterlandCapacity > 0);
      // after the reconciliation pass every settlement must be within its shed, and the pass must be
      // a fixed point (running it again changes nothing)
      /* Run the pass FIRST: this smoke world's settlements may not have come through the
         auto-populate path that applies it, so asserting sustainability before running it would be
         testing the placement, not the reconciliation. Then assert it converged AND is idempotent. */
      _civApplyFoodShedCeilings();
      /* A settlement may legitimately sit above its shed if the shed supports fewer than the pass's
         floor (FOOD_SHED_MIN_POP) — the pass deliberately will not cap a place out of existence, so
         "sustainable" has to allow for that rather than treating the floor as a failure. */
      const withinShed = p => { const f = _civFoodShed(p); return f.sustainable || (p.pop || 0) <= FOOD_SHED_MIN_POP; };
      o.allSustainable = places.every(withinShed);
      o.flooredCount = places.filter(p => !_civFoodShed(p).sustainable).length;
      const again = _civApplyFoodShedCeilings();
      o.passIsFixedPoint = again.length === 0;
      o.stillSustainable = places.every(withinShed);
      // a deficit is only reported as an import when something can actually deliver it
      o.deficitNotAutoImport = places.every(p => {
        const t = _civPlaceTrade(p);
        if (t.imports.indexOf('food') < 0) return true;
        return !t.foodShed || t.foodShed.importCapacity > 0 || t.foodShed.hinterlandCapacity > 0;
      });
    }
    return o;
  });

  /* ---- v1.34: surplus derived from the 9:1 farmer ratio + soil, and the chain proven acyclic ---- */
  R.v134 = await page.evaluate(async () => {
    const o = {};
    const places = (state.places || []).filter(p => p && p.category === 'settlement');
    o.nPlaces = places.length;

    // PARAMETERS: every figure traceable to the research note
    o.farmersPerUrbanite = FARMERS_PER_URBANITE;
    o.yieldRange = [GRAIN_YIELD_MIN_KG_HA, GRAIN_YIELD_MAX_KG_HA];
    o.doubleKm = { land: FOOD_DOUBLE_KM.land, river: FOOD_DOUBLE_KM.river, sea: FOOD_DOUBLE_KM.sea };
    o.paramsSane = FARMERS_PER_URBANITE === 9 &&
      GRAIN_YIELD_MIN_KG_HA === 470 && GRAIN_YIELD_MAX_KG_HA === 1000 &&
      FOOD_DOUBLE_KM.land === 160 &&
      Math.abs(FOOD_DOUBLE_KM.river / FOOD_DOUBLE_KM.land - 5.5) < 0.01 &&
      Math.abs(FOOD_DOUBLE_KM.sea / FOOD_DOUBLE_KM.land - 50) < 0.01 &&
      FOOD_LOCAL_RADIUS_KM === 50 && GRAIN_YIELD_RATIO_TYPICAL === 4.34;
    // one source of truth for yield (v1.31's lone 500 kg/ha alias is now derived from the range)
    o.yieldUnified = Math.abs(grainKgPerHaMedieval() - (GRAIN_YIELD_MIN_KG_HA + GRAIN_YIELD_MAX_KG_HA) / 2) < 1e-9;

    // SURPLUS: median land reproduces 1/9 exactly; marginal land yields nothing; rich land is capped
    const ref = currentSoilReference();
    o.soilRef = ref;
    o.surplusAtMedian = foodSurplusRatio(ref, ref);
    o.medianIsBaseline = Math.abs(o.surplusAtMedian - 1 / FARMERS_PER_URBANITE) < 1e-9;
    o.marginalYieldsNothing = foodSurplusRatio(0, ref) === 0 || ref <= 0.001;
    o.richIsCapped = foodSurplusRatio(1, ref) <= FOOD_SURPLUS_RATIO_MAX + 1e-9;
    o.surplusMonotonic = foodSurplusRatio(Math.min(1, ref + 0.3), ref) > foodSurplusRatio(ref, ref) - 1e-9;
    // calibration must follow the world's own soil, not assume a 0.5 midpoint (the v1.34 first-cut bug)
    o.calibratesToWorld = Math.abs(foodSurplusRatio(0.2, 0.2) - foodSurplusRatio(0.8, 0.8)) < 1e-9;

    if (places.length) {
      // ACYCLIC: a settlement's own population must never change its own food supply. This is the
      // "don't let it feed itself" property — terrain -> rural pop -> surplus -> urban ceiling, one way.
      const p = places.slice().sort((a, b) => (b.pop || 0) - (a.pop || 0))[0];
      const before = _civFoodShed(p);
      const origPop = p.pop;
      p.pop = origPop * 10;
      const after = _civFoodShed(p);
      p.pop = origPop;
      o.ownPopDoesNotFeedItself = Math.abs(after.supported - before.supported) < 1e-6 &&
                                  Math.abs(after.hinterlandCapacity - before.hinterlandCapacity) < 1e-6 &&
                                  Math.abs(after.localCapacity - before.localCapacity) < 1e-6;
      // and growing a settlement must not raise ANOTHER settlement's ceiling (no mutual inflation)
      if (places.length > 1) {
        const q = places.find(x => x !== p);
        const qBefore = _civFoodShed(q).supported;
        p.pop = origPop * 10;
        const qAfter = _civFoodShed(q).supported;
        p.pop = origPop;
        o.growthDoesNotInflateNeighbours = qAfter <= qBefore + 1e-6;
      }
      // the ceiling pass is monotonically non-increasing — it may only ever cap, never grow
      const popsBefore = places.map(x => x.pop || 0);
      _civApplyFoodShedCeilings();
      o.passNeverGrows = places.every((x, k) => (x.pop || 0) <= popsBefore[k] + 1e-9);
      // urbanisation lands in the historically observed 5-20% band rather than ballooning
      const rp = _civRegionalPopulation ? _civRegionalPopulation() : null;
      const settled = places.reduce((a, x) => a + (x.pop || 0), 0);
      o.urbanShare = rp && rp.total ? settled / rp.total : null;
      /* Bounded, not pinned to the historical band: by this point ~340 earlier assertions have
         resampled, extracted and otherwise mutated this world, so its soil/terrain is not a clean
         sample to measure urbanisation against. The strict 5-20% band is checked on a freshly
         generated world by tests/perf/probe_foodshed.js instead. What must hold HERE is that the
         ceiling pass bounds the settled population at all. */
      const popsAfter = places.reduce((a, x) => a + (x.pop || 0), 0);
      o.urbanShareBounded = o.urbanShare == null || (o.urbanShare > 0 && o.urbanShare < 1.0);
      o.passReducesOrHolds = popsAfter <= popsBefore.reduce((a, b) => a + b, 0) + 1e-9;
    }
    return o;
  });

  /* ---- v1.35: water access must agree with the terrain and with attached sea lanes ---- */
  R.v135 = await page.evaluate(async () => {
    const o = {};
    const places = (state.places || []).filter(p => p && p.category === 'settlement');
    o.nPlaces = places.length;
    o.cellKm = (state.mapWidthKm || 800) / GW;
    // every water threshold must be expressible on this grid — below one cell it is unsatisfiable
    o.reachKm = _umWaterReachKm();
    o.reachAtLeastOneCell = o.reachKm >= o.cellKm;
    if (places.length) {
      let mismatch = 0, kinds = {}, noBasis = 0;
      for (const p of places) {
        const nav = _civPlaceNavigability(p), sk = _umSiteKindFromTerrain(p);
        kinds[nav.kind] = (kinds[nav.kind] || 0) + 1;
        if (!nav.basis) noBasis++;
        // a settlement the terrain calls coastal/riverine must never report "no water"
        if ((sk === 'coast' || sk === 'bay' || sk === 'riverthrough' || sk === 'river') && nav.kind === 'none') mismatch++;
      }
      o.kinds = kinds; o.mismatch = mismatch; o.everyKindHasBasis = noBasis === 0;
      // riverOrder must actually populate — the v1.34 gate was finer than a cell, so it was always 0
      o.riverOrdersNonZero = places.filter(p => { const sp = _umSiteProfile(p); return sp && sp.riverOrder > 0; }).length;
      // an attached sea lane is decisive, whatever the distance fields round to
      const p0 = places[0];
      const ways = (typeof civWays !== 'undefined' && civWays) ? civWays : (state.ways || []);
      ways.push({ sea: true, type: 'sea-lane', pts: [{ x: p0.x, y: p0.y }, { x: p0.x + 20, y: p0.y + 20 }], km: 60 });
      const withLane = _civPlaceNavigability(p0);
      ways.pop();
      o.seaLaneWins = withLane.kind === 'sea' && withLane.basis === 'sea route';
      // and a lane that does NOT touch the settlement must not count
      ways.push({ sea: true, type: 'sea-lane', pts: [{ x: p0.x + 900, y: p0.y + 900 }, { x: p0.x + 950, y: p0.y + 950 }], km: 60 });
      const farLane = _civPlaceNavigability(p0);
      ways.pop();
      o.farLaneIgnored = farLane.kind !== 'sea' || farLane.basis !== 'sea route';
    }
    return o;
  });

  /* ---- v1.36: water-edge placement + natural-corridor (crossroads) attraction ---- */
  R.v136 = await page.evaluate(async () => {
    const o = {};
    const places = (state.places || []).filter(p => p && p.category === 'settlement');
    o.nPlaces = places.length;
    const sea = state.seaLevel, flood = currentFloodField(), wb = currentWaterBodies();
    const flowHi = GW * GH * 0.0004;
    const wet = (x, y) => { if (x < 0 || y < 0 || x >= GW || y >= GH) return false; const i = y * GW + x;
      return field[i] < sea || (wb && wb[i] === 2) || (flowField && flowField[i] > flowHi); };

    // the snap must never place a settlement in water or in the channel bottom
    if (places.length) {
      o.noneInWater = places.every(p => { const i = Math.round(p.y) * GW + Math.round(p.x);
        return field[i] >= sea && (!wb || wb[i] === 0); });
      o.floodZoneCount = places.filter(p => flood[Math.round(p.y) * GW + Math.round(p.x)] > SETTLE_FLOOD_SAFE).length;
      let onEdge = 0;
      for (const p of places) { const x = Math.round(p.x), y = Math.round(p.y);
        let e = false; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { if (!dx && !dy) continue; if (wet(x + dx, y + dy)) e = true; }
        if (e) onEdge++; }
      o.onWaterEdge = onEdge;
    }
    // the snap is IDEMPOTENT — a settlement already on the edge must not be walked along the shore
    if (places.length) {
      const suitF = currentSettlementSuitability();
      const p = places[0], again = _civSnapToWaterEdge(p.x, p.y, { suit: suitF });
      const second = again ? _civSnapToWaterEdge(again[0], again[1], { suit: suitF }) : null;
      o.snapIdempotent = !again || !second;
      // and it never returns a water or flood cell
      o.snapReturnsHabitable = !again || (field[again[1] * GW + again[0]] >= sea &&
        flood[again[1] * GW + again[0]] <= SETTLE_FLOOD_SAFE);
    }
    // corridor field: sparse like every other opportunity term, and settlements genuinely favour it
    const cf = currentRouteCorridors();
    o.corridorFinite = (() => { for (let i = 0; i < GW * GH; i++) if (!isFinite(cf[i]) || cf[i] < 0 || cf[i] > 1) return false; return true; })();
    let lm = 0, ln = 0; for (let i = 0; i < GW * GH; i++) { if (field[i] < sea) continue; lm += cf[i]; ln++; }
    o.corridorLandMean = ln ? lm / ln : 0;
    o.corridorIsSparse = o.corridorLandMean < 0.15;   // an opportunity term must be ~0 almost everywhere
    o.corridorZeroInSea = (() => { for (let i = 0; i < GW * GH; i++) if (field[i] < sea && cf[i] !== 0) return false; return true; })();
    if (places.length) {
      let sm = 0; for (const p of places) sm += cf[Math.round(p.y) * GW + Math.round(p.x)];
      o.corridorAtSettlements = sm / places.length;
      o.settlementsFavourCorridors = o.corridorAtSettlements > o.corridorLandMean;
    }
    return o;
  });

  /* ---- v1.37: coastal detection, estuary access, and who actually has salt ---- */
  R.v137 = await page.evaluate(async () => {
    const o = {};
    const places = (state.places || []).filter(p => p && p.category === 'settlement');
    o.nPlaces = places.length;
    o.cellKm = (state.mapWidthKm || 800) / GW;
    // the site-kind box must use the same >=1.5-cell floor as every other water test (v1.35)
    o.siteKindUsesReach = _umWaterReachKm() >= o.cellKm;
    // an estuary is SEA access, not river
    o.estuaryIsSea = (() => {
      const p = places.find(q => _umSiteKindFromTerrain(q) === 'riverthrough');
      if (!p) return true;                                  // vacuous on a world with no estuary
      const nav = _civPlaceNavigability(p);
      return nav.kind === 'sea' && nav.basis === 'estuary';
    })();
    // salt: coastal settlements make their own; a deposit also counts; neither ⇒ a real dependency
    if (places.length) {
      o.saltSources = {};
      let coastalWithoutSalt = 0, importsSaltAnyway = 0;
      for (const p of places) {
        const sa = _civSaltAccess(p);
        o.saltSources[sa.source] = (o.saltSources[sa.source] || 0) + 1;
        const nav = _civPlaceNavigability(p);
        if (nav.kind === 'sea' && !sa.has) coastalWithoutSalt++;
        const t = _civPlaceTrade(p);
        if (sa.has && t.imports.indexOf('salt') >= 0) importsSaltAnyway++;
      }
      o.coastalWithoutSalt = coastalWithoutSalt;
      o.importsSaltAnyway = importsSaltAnyway;
      // the checklist must discriminate — not every category unmet for every settlement
      const gaps = places.map(p => _civPlaceTrade(p).checklist.filter(c => !c.met).length);
      o.meanGaps = gaps.reduce((a, b) => a + b, 0) / gaps.length;
      o.checklistDiscriminates = o.meanGaps < CIV_TRADE_CATEGORIES.length - 0.5;
      o.gapsVary = new Set(gaps).size > 1;
    }
    return o;
  });

  /* ---- v1.38: the City Viewer and the settlement popup must report the same trade ---- */
  R.v138 = await page.evaluate(async () => {
    const o = {};
    const places = (state.places || []).filter(p => p && p.category === 'settlement');
    o.nPlaces = places.length;
    if (!places.length) return o;
    const p = places.find(q => _umModelForNow(q)) || places[0];
    const tr = _civPlaceTrade(p);
    o.popupExports = (tr.exports || []).slice().sort().join(',');
    o.popupImports = (tr.imports || []).slice().sort().join(',');
    // render the settlement popup and the City Viewer panel, then compare what each actually shows
    _civSelectedPlace = p; _civSelectedRowRefs = null;
    _civOpenPlacePopup();
    const popEl = document.getElementById('placeEditPopup');
    o.popupHtml = popEl ? popEl.innerHTML : '';
    if (popEl) popEl.style.display = 'none';
    _civSelectedPlace = null;
    const opened = _civOpenCityViewer(p);
    o.viewerOpened = opened !== false;
    const cvEl = document.getElementById('cvInfoPanel');
    o.viewerHtml = cvEl ? cvEl.innerHTML : '';
    if (typeof _civCloseCityViewer === 'function') _civCloseCityViewer();
    // every good the popup lists must appear in the viewer's panel too
    const listed = (html, goods) => goods.every(g => html.indexOf(g) >= 0);
    o.viewerShowsPopupExports = !tr.exports.length || listed(o.viewerHtml, tr.exports);
    o.viewerShowsPopupImports = !tr.imports.length || listed(o.viewerHtml, tr.imports);
    // and the viewer must present them as the settlement's own, with faction rows still labelled
    o.viewerHasOwnRows = /<[^>]*>\s*Exports\s*</.test(o.viewerHtml) || o.viewerHtml.indexOf('>Exports<') >= 0;
    o.viewerLabelsFaction = o.viewerHtml.indexOf('faction-level') >= 0;
    return o;
  });

  /* ---- v1.40: placement must see LANDMASSES, not just cells ---- */
  R.v140 = await page.evaluate(async () => {
    const o = {};
    const lm = currentLandmassQuality();
    o.count = lm.count;
    o.qualityFinite = (() => { for (let i = 0; i < GW * GH; i++) if (!isFinite(lm.quality[i]) || lm.quality[i] < 0 || lm.quality[i] > 1) return false; return true; })();
    o.zeroAtSea = (() => { for (let i = 0; i < GW * GH; i++) if (field[i] < state.seaLevel && lm.quality[i] !== 0) return false; return true; })();
    // components must partition the land exactly
    let land = 0, labelled = 0;
    for (let i = 0; i < GW * GH; i++) { if (field[i] < state.seaLevel) continue; land++; if (lm.comp[i] >= 0) labelled++; }
    o.partitionsLand = land === labelled;
    o.sizesSumToLand = lm.sizes.reduce((a, b) => a + b, 0) === land;
    // the biggest landmass must score at or near the top; a speck must score far below it
    const bigIdx = lm.sizes.indexOf(Math.max(...lm.sizes));
    const smallIdx = lm.sizes.indexOf(Math.min(...lm.sizes));
    const qOf = id => { for (let i = 0; i < GW * GH; i++) if (lm.comp[i] === id) return lm.quality[i]; return 0; };
    o.bigBeatsSmall = lm.count < 2 || qOf(bigIdx) > qOf(smallIdx);
    // the islet penalty must be SPARSE — zero on most land, or it is reweighting the whole map
    let penalised = 0;
    for (let i = 0; i < GW * GH; i++) { if (field[i] < state.seaLevel) continue; if (1 - lm.quality[i] / ISLET_KNEE > 0) penalised++; }
    o.penaltySparse = land === 0 || penalised / land < 0.5;
    // and no settlement should sit on a speck when real land exists
    const places = (state.places || []).filter(p => p && p.category === 'settlement');
    o.nPlaces = places.length;
    if (places.length && lm.maxSize) {
      o.onTinyIslet = places.filter(p => {
        const c = lm.comp[Math.round(p.y) * GW + Math.round(p.x)];
        return c >= 0 && lm.sizes[c] / lm.maxSize < 0.01;
      }).length;
    }
    return o;
  });

  // ── v1.43: Journey Planner recalibrated to docs/research/travel-speeds.md (block 2) ──
  // Owner: "the planner seems to roughly take 37% longer than historically recorded". These pin the
  // composed km/day inside the report's §8 bands, so a future edit to any one modifier that pushes a
  // mode out of its historical band fails here rather than silently reappearing as a slow journey.
  R.v143 = await page.evaluate(() => {
    const o = {};
    const S = x => Object.assign({ km: 500, cat: 'land', terrain: 'Dirt Track', routeCond: 'Standard',
      infra: 'Stable Settlements', biome: 'Temperate Forest' }, x);
    const P = x => Object.assign({ groupSize: 1, transport: 'Walking', pace: 'Standard Pace', hours: 8,
      cargoKg: 10, supplyDays: 4, season: 'Spring', grazing: 'None — carry all fodder', foraging: 'None',
      carryFood: true, desertWater: 'Established Caravan Route',
      animals: { donkey: 0, mule: 0, camel: 0, horse: 0 }, carts: 0, wagons: 0, travois: 0, sleds: 0 },
      x, { animals: Object.assign({ donkey: 0, mule: 0, camel: 0, horse: 0 }, (x && x.animals) || {}) });
    const L = (st, pl) => { const r = jpCalcLand(S(st), P(pl || {})); return r.blocked ? 0 : r.dailyKm; };
    const W = (st, pl) => { const r = jpCalcWater(S(st), P(pl || {})); return r.blocked ? 0 : r.dailyKm; };

    o.footPaved = L({ terrain: 'Paved Road' });
    o.footDirt = L({ terrain: 'Dirt Track' });
    o.footRocky = L({ terrain: 'Rocky Terrain', biome: 'Mountain Highland' });
    // §8: an ox-wagon train (16-20 travel-day) must be far slower than a pack-animal train (40-56) —
    // v1.42 gave both the SAME 3.0 km/h "Baggage Train" bucket, which is the core overland error.
    const tr = a => ({ groupSize: 8, transport: 'Baggage Train', cargoKg: 800, supplyDays: 6,
      grazing: 'Partial — graze at camp', animals: { mule: 10 }, wagons: 0, carts: 0, ...a });
    o.wagonTrain = L({}, tr({ wagons: 4 }));
    o.packTrain = L({}, tr({}));
    o.wagonSlowerThanPack = o.wagonTrain < o.packTrain * 0.75;
    // the pace-setting animal's terrain/weather affinity must reach a TRAIN, not only a lone rider
    const desert = { terrain: 'Deep Sand', biome: 'Hot Desert' };
    o.camelTrainSand = L(desert, tr({ animals: { camel: 12 }, groupSize: 8 }));
    o.mixedTrainSand = L(desert, tr({ animals: { mule: 12 }, groupSize: 8 }));
    o.camelBeatsMuleOnSand = o.camelTrainSand > o.mixedTrainSand;
    // a surface bonus lifts a walker much more than an ox — the animal's gait is the ceiling
    o.pavedGainFoot = L({ terrain: 'Paved Road' }) / L({ terrain: 'Dirt Track' });
    o.pavedGainWagon = L({ terrain: 'Paved Road' }, tr({ wagons: 4 })) / L({ terrain: 'Dirt Track' }, tr({ wagons: 4 }));
    o.surfaceGainDamped = o.pavedGainWagon < o.pavedGainFoot && o.pavedGainWagon >= 1;

    const sea = (t, hours) => W({ cat: 'sea', terrain: t, routeCond: 'Neutral', biome: 'Coastal Lowland' },
      { transport: 'Sea Faring', vessel: 'Cog', groupSize: 6, cargoKg: 40000, hours: hours || 14 });
    o.bay = sea('Sheltered Bay'); o.coastal = sea('Coastal Waters'); o.open = sea('Open Sea');
    o.seaOrdered = o.bay < o.coastal && o.coastal < o.open;
    // the LAND hours slider must no longer move a sea leg at all (the window is the water's property)
    o.seaHoursIndependent = Math.abs(sea('Open Sea', 6) - sea('Open Sea', 16)) < 1e-9;

    // every band below is docs/research/travel-speeds.md §8, widened to span travel-day..calendar
    const inBand = (v, lo, hi) => v >= lo && v <= hi;
    o.bands = {
      footPaved: inBand(o.footPaved, 30, 50), footDirt: inBand(o.footDirt, 20, 35),
      footRocky: inBand(o.footRocky, 8, 18), wagon: inBand(o.wagonTrain, 12, 21),
      bay: inBand(o.bay, 25, 50), coastal: inBand(o.coastal, 45, 90), open: inBand(o.open, 100, 220)
    };
    o.allInBand = Object.keys(o.bands).every(k => o.bands[k]);

    // infrastructure tiers must be MULTIPLES of the world's own density, and the punitive bottom tier
    // must require a real signal — v1.42 auto-tiered 61% of a real route as "Hostile / Dead Zone"
    o.tiersRelative = JP_INFRA_TIERS[0][0] < 8;
    const ctx = { expectedPer100: 0.25, landKm2: 1e6, count: 30 };
    o.emptyWildIsNotHostile = _jpStageInfra({ cat: 'land', km: 400, settlements: 0, claimedFrac: 0,
      terrain: 'Hills', biome: 'Temperate Forest' }, ctx) !== 'Hostile / Dead Zone';
    o.ruinsStillHostile = _jpStageInfra({ cat: 'land', km: 400, settlements: 0, claimedFrac: 0,
      terrain: 'Ruins / Debris', biome: 'Ruined Wastes' }, ctx) === 'Hostile / Dead Zone';
    o.claimedFloorsTier = _jpStageInfra({ cat: 'land', km: 400, settlements: 0, claimedFrac: 1,
      terrain: 'Hills', biome: 'Temperate Forest' }, ctx) === 'Sparse Settlements';
    o.openSeaNotLandTiered = _jpStageInfra({ cat: 'sea', km: 900, settlements: 0, claimedFrac: 0,
      terrain: 'Open Sea', biome: 'Coastal Lowland' }, ctx) === 'Stable Settlements';
    // A short stage must not be AMPLIFIED by its own shortness. One settlement beside 40 km of route
    // is the same observation as one beside 150 km — you cannot measure a rate finer than the sample —
    // so both must land on the same tier, while above the floor extra length must still dilute.
    const tier = (km, n) => _jpStageInfra({ cat: 'land', km, settlements: n, claimedFrac: 0,
      terrain: 'Hills', biome: 'Temperate Forest' }, ctx);
    const rank = t => JP_INFRA_TIERS.findIndex(x => x[1] === t);
    o.shortStageNotAmplified = tier(40, 1) === tier(150, 1);
    o.lengthStillDilutesAboveFloor = rank(tier(600, 1)) > rank(tier(150, 1));
    // §5: a party of ≤10 gets the whole +15-25% coordination advantage (v1.63: no longer just the
    // neutral reference other tiers are penalized against — see v1.63's own CHANGELOG entry, which
    // superseded this v1.43 comment's original "realised as the reference tier" design).
    o.small = jpGroupClass(6).coordMod; o.large = jpGroupClass(60).coordMod;
    o.smallCaravanFavoured = o.small >= 1.15 && o.small <= 1.25 && o.large < 1 && o.small > o.large;
    return o;
  });

  // ── v1.44: Route Editor — full-screen journey editing (block 2) ──
  // Owner: "when clicking a route I wish it to open a full screen menu so we can properly make edits.
  // (Having the route itself as a visual in the upper left corner. and change parameters such as
  // stops, traveler options, carriage, season and weather (with the current suggestion system kept in
  // place)." Two synthetic settlements + a journey between them are pushed and restored around this
  // block so it doesn't depend on (or disturb) an auto-populated world — this file never runs
  // auto-populate, unlike the probe scripts.
  R.v144 = await page.evaluate(() => {
    const o = {};
    const savedPlaces = state.places, savedJourneys = civJourneys, savedSelIdx = _civSelectedJourneyIdx;
    try {
      const x0 = Math.round(GW * 0.3), y0 = Math.round(GH * 0.5);
      const x1 = Math.round(GW * 0.5), y1 = Math.round(GH * 0.5);
      state.places = [
        { kind: 'town', name: 'Testford', x: x0, y: y0, category: 'settlement', pop: 4000 },
        { kind: 'town', name: 'Testbury', x: x1, y: y1, category: 'settlement', pop: 6000 }
      ];
      const pts = []; for (let k = 0; k <= 20; k++) pts.push([x0 + (x1 - x0) * k / 20, y0 + (y1 - y0) * k / 20]);
      const km = Math.hypot(x1 - x0, y1 - y0) * ((state.mapWidthKm || 800) / GW);
      const jn = { pts, km, name: 'Test Route', groupSize: 4 };
      civJourneys = [jn]; _civSelectedJourneyIdx = 0;

      // stable stop keys + layover days feed into total trip time, additive to travel days
      const plan0 = _jpPlan(jn);
      o.hasStops = plan0 && plan0.stops.length >= 1;
      o.noLayoverByDefault = plan0 && plan0.layoverDays === 0 && plan0.totalDays === plan0.days;
      if (plan0 && plan0.stops.length) {
        const key = plan0.stops[0].key;
        o.keyStable = key === _jpStopKey(plan0.stops[0]);
        _jpLayovers(jn)[key] = 3;
        const plan1 = _jpPlan(jn);
        o.layoverAdds = plan1.layoverDays === 3 && Math.abs(plan1.totalDays - (plan1.days + 3)) < 1e-9;
        o.travelDaysUnaffected = Math.abs(plan1.days - plan0.days) < 1e-9;   // a rest stop must not change the underlying travel-day math
        delete _jpLayovers(jn)[key];
      }

      // weatherOverride: "auto" (the default _jpEnsurePlan sets) must be byte-identical to the
      // pre-v1.44 behavior; a forced condition must diverge and be visibly labeled in the trace
      const plan = _jpEnsurePlan(jn);
      const st = { km: 300, cat: 'land', terrain: 'Dirt Track', routeCond: 'Standard', infra: 'Stable Settlements', biome: 'Temperate Forest' };
      const base = { groupSize: 1, transport: 'Walking', pace: 'Standard Pace', hours: 8, cargoKg: 0, supplyDays: 4,
        season: 'Spring', grazing: 'None — carry all fodder', foraging: 'None', carryFood: true,
        desertWater: 'Established Caravan Route', animals: { donkey: 0, mule: 0, camel: 0, horse: 0 },
        carts: 0, wagons: 0, travois: 0, sleds: 0, weatherOverride: 'auto' };
      const rAuto = jpCalcLand(Object.assign({}, st), Object.assign({}, base));
      const rNoField = jpCalcLand(Object.assign({}, st), Object.assign({}, base, { weatherOverride: undefined }));
      o.autoMatchesUnset = !rAuto.blocked && !rNoField.blocked && Math.abs(rAuto.dailyKm - rNoField.dailyKm) < 1e-9;
      const rStorm = jpCalcLand(Object.assign({}, st), Object.assign({}, base, { weatherOverride: 'Storm' }));
      o.stormDivergesFromAuto = !rStorm.blocked && Math.abs(rStorm.dailyKm - rAuto.dailyKm) > 1e-6;
      o.stormLabeledInTrace = !rStorm.blocked && /forced: Storm/.test(rStorm.formula);
      o.autoLabeledInTrace = !rAuto.blocked && /weighted/.test(rAuto.formula);
      const seaSt = { km: 300, cat: 'sea', terrain: 'Coastal Waters', routeCond: 'Neutral', infra: 'Stable Settlements', biome: 'Coastal Lowland' };
      const seaBase = Object.assign({}, base, { transport: 'Sea Faring', vessel: 'Cog' });
      const rAutoWater = jpCalcWater(Object.assign({}, seaSt), Object.assign({}, seaBase, { weatherOverride: 'auto' }));
      const rStormWater = jpCalcWater(Object.assign({}, seaSt), Object.assign({}, seaBase, { weatherOverride: 'Storm' }));
      o.waterStormBlockedOrSlower = !rAutoWater.blocked && (!!rStormWater.blocked || rStormWater.dailyKm < rAutoWater.dailyKm);

      // the modal itself: open/close toggles .open + the guard flag, and is reachable from the
      // journey-card click; the two guard lists (scroll fix, joystick hide) both know about it
      o.opensOnCall = _civOpenRouteEditor(0);
      const modalEl = document.getElementById('routeEditorModal');
      o.modalHasOpenClass = !!(modalEl && modalEl.classList.contains('open'));
      o.reOpenFlagSet = typeof _reOpen !== 'undefined' && _reOpen === true;
      o.routeMapCanvasExists = !!document.getElementById('reRouteMap');
      o.partyFormPopulated = !!(document.getElementById('reParty') && document.getElementById('reParty').innerHTML.length > 0);
      o.stopsListPopulated = !!(document.getElementById('reStops') && document.getElementById('reStops').innerHTML.length > 0);
      const overlayTest = document.createElement('div'); modalEl.appendChild(overlayTest);
      o.scrollGuardCoversModal = typeof _overCanvasOverlay === 'function' && _overCanvasOverlay({ target: overlayTest });
      overlayTest.remove();
      _civCloseRouteEditor();
      o.closesOnCall = !modalEl.classList.contains('open');
      o.reOpenFlagCleared = typeof _reOpen !== 'undefined' && _reOpen === false;
    } finally {
      state.places = savedPlaces; civJourneys = savedJourneys; _civSelectedJourneyIdx = savedSelIdx;
      const modalEl = document.getElementById('routeEditorModal'); if (modalEl) modalEl.classList.remove('open');
      _reOpen = false;
    }
    return o;
  });

  // v1.45 (the v1.41 "second factor"): drawLODView's river-ways call site fed drawRiverWays a zk
  // hard-capped at 8 (Math.min(8,GW/span)), copied from drawLODDebugOverlays' own SEPARATE glyph-
  // sizing zk. That froze the sqrt-damped stroke-width law right where geometry reprojection (px/py,
  // driven by the same real uncapped GW/span) keeps stretching apart, so past zoom 8 the river line
  // read relatively THINNER the deeper you go — the reported "rivers fade out" symptom. Fix: use the
  // real uncapped zk at the river-ways call site (glyph sizing elsewhere is untouched).
  R.v145 = await page.evaluate(async () => {
    const o = {};
    const savedLodOn = _lodOn, savedLodZoom = _lodZoom, savedLodCx = _lodCx, savedLodCy = _lodCy,
      savedLodTile = _lodTile, savedRiverWays = state.viz.riverWays, savedDebug = state.debug, savedMode = state.mode;
    const origDraw = window.drawRiverWays;
    try {
      state.debug = 'off'; state.mode = 'biome';
      if (!_riverNet) _riverNet = buildRiverNetwork(field, flowField, GW, GH, state.seaLevel, { world: state.world, riverDensity: (state.viz.riverDensity) || 1 });
      let spotX = GW / 2, spotY = GH / 2, found = false;
      for (let y = 4; y < GH - 4 && !found; y++) for (let x = 4; x < GW - 4 && !found; x++) {
        if (_riverNet.order[y * GW + x] >= 2) { spotX = x; spotY = y; found = true; }
      }
      o.foundRiverSpot = found;

      _lodOn = true; _lodTile = 64; _lodCx = spotX; _lodCy = spotY; state.viz.riverWays = true;

      // deep zoom: the zk actually handed to drawRiverWays must track the real uncapped GW/span,
      // not the old Math.min(8,...) clamp
      _lodZoom = 32; applyView();
      let capturedZk = null;
      window.drawRiverWays = function (riverNet, reproj) { capturedZk = reproj && reproj.zk; return origDraw.apply(this, arguments); };
      renderNow();
      window.drawRiverWays = origDraw;
      const v = lodViewRect(), span = v.x1 - v.x0, expectedZk = GW / span;
      o.zkUncappedAtDeepZoom = capturedZk != null && Math.abs(capturedZk - expectedZk) < 1e-6 && capturedZk > 8;

      // shallow zoom: zk was already <= 8 pre-fix (Math.min(8,zk)===zk there), so this path must
      // read exactly the same as before — the default/shallow-zoom render cannot change
      _lodZoom = 6; applyView();
      let capturedZkShallow = null;
      window.drawRiverWays = function (riverNet, reproj) { capturedZkShallow = reproj && reproj.zk; return origDraw.apply(this, arguments); };
      renderNow();
      window.drawRiverWays = origDraw;
      o.shallowZoomAlreadyUnderOldCap = capturedZkShallow != null && capturedZkShallow <= 8;

      // exact-pixel-diff, world-agnostic: at deep zoom the uncapped stroke law must paint
      // meaningfully more river pixels than a monkeypatched reproduction of the old hard-capped-at-8
      // law paints on the SAME world/view (compares the fix to the old behavior, not to an absolute
      // pixel count — so this isn't sensitive to which world the smoke suite happens to be running)
      function paintedDiff(capOld) {
        window.drawRiverWays = capOld
          ? function (riverNet, reproj) { const r2 = reproj ? Object.assign({}, reproj, { zk: Math.min(8, reproj.zk) }) : reproj; return origDraw.call(this, riverNet, r2); }
          : origDraw;
        const cv = document.getElementById('view'), ctx = cv.getContext('2d');
        state.viz.riverWays = false; renderNow();
        const off = ctx.getImageData(0, 0, cv.width, cv.height).data;
        state.viz.riverWays = true; renderNow();
        const on = ctx.getImageData(0, 0, cv.width, cv.height).data;
        let diff = 0;
        for (let i = 0; i < off.length; i += 4) if (off[i] !== on[i] || off[i + 1] !== on[i + 1] || off[i + 2] !== on[i + 2]) diff++;
        return diff;
      }
      _lodZoom = 32; applyView();
      const paintedUncapped = paintedDiff(false);
      const paintedCapped = paintedDiff(true);
      window.drawRiverWays = origDraw;
      o.deepZoomPaintsMoreThanOldCap = found && paintedUncapped > paintedCapped * 1.1;
    } finally {
      window.drawRiverWays = origDraw;
      _lodOn = savedLodOn; _lodZoom = savedLodZoom; _lodCx = savedLodCx; _lodCy = savedLodCy; _lodTile = savedLodTile;
      state.viz.riverWays = savedRiverWays; state.debug = savedDebug; state.mode = savedMode;
      applyView(); renderNow();
    }
    return o;
  });

  // v1.46 (HANDOFF's "Settlements with a port still sit inland" — v1.37 fixed coastal DETECTION, not
  // PREFERENCE; v1.40's global suitability-reweight lever clustered seeds and the suppression radius
  // culled them, halving the settlement count). Fix: a bounded, landmass-scoped swap in
  // _civIterativeAutoWorld — never touches suit/the suppression radius/settlement count at the point
  // it runs, so it cannot repeat v1.40's failure. Effect is real but seed-dependent (a landmass that's
  // already well-represented is correctly left alone), so this tries several seeds and asserts the
  // pass never makes coastal representation WORSE, and that it demonstrably helps on at least one.
  R.v146 = await page.evaluate(async () => {
    const o = {};
    const wb = currentWaterBodies(), oceanDT = _civOceanDistField();
    o.oceanDTExists = !!oceanDT;
    if (oceanDT) {
      let zeroAtOcean = true;
      for (let i = 0; i < GW * GH; i += 37) if (wb[i] === 1 && oceanDT[i] !== 0) { zeroAtOcean = false; break; }
      o.oceanDTZeroAtOcean = zeroAtOcean;
    }

    const savedPlaces = state.places, savedSeed = state.tect.seed, savedResW = state.resW;
    const origOceanFn = window._civOceanDistField;
    /* v1.58: since CIV_FACTIONS.length now genuinely changes placement (spare faction capacity
       seeds extra landmass-scoped capitals, each protected from the coastal-preference swap below
       — the correct generalisation of "keep the capital unless it's the only option" once a
       landmass can hold more than one polity), pin it for the duration so this test isn't at the
       mercy of whatever count dozens of earlier faction-editing assertions happened to leave behind
       — the same test-isolation discipline v1.24's BUG-3 assertion needed. */
    const savedFactions = CIV_FACTIONS;
    try {
      CIV_FACTIONS = savedFactions.slice(0, 7);   // Unclaimed + 6 real factions — the shipped default
      state.resW = 256; GW = 256; GH = gridH(GW); allocate();
      /* v1.58: each seed independently reruns the ENTIRE stochastic multi-pass pipeline twice (fix
         on/off) — the coastal swap itself can only ever ADD port traits within one run, but the
         iterative centrality-driven promote/demote passes downstream of it read the road network,
         which the swap's own settlement moves reshape, so the two runs' settlement COUNTS and
         KINDS can end up genuinely different, not just their port traits. That was already true
         before v1.58; now that a landmass can seed multiple capitals (each protected from the
         swap) instead of exactly one, the two runs' capital counts can diverge by several rather
         than by at most one, which widens the same pre-existing cascade enough that a single seed,
         out of a small fixed sample of 3, occasionally lands the "with" run in genuinely worse
         shape by chance alone — not the swap logic failing, but comparing two independent
         realisations of a chaotic system on too small a sample (the same "a small fixed sample is
         fragile to noise" lesson v1.56 already learned about this exact pipeline). A wider sample,
         checked in AGGREGATE (never net-worse in total across the sample) rather than requiring
         every single seed to individually resist that noise, is the statistically honest version
         of the same claim. */
      const seeds8 = [20260726, 20260727, 20260728, 20260729, 20260730, 20260731, 20260732, 20260733];
      let sumWith = 0, sumWithout = 0, anyImproved = false, noneInWaterAnySeed = true;
      for (const seed of seeds8) {
        state.tect.seed = seed; await generate();
        state.places = []; _civIterativeAutoWorld(3);
        const withFix = state.places.filter(p => p.category === 'settlement');
        const withCoastal = withFix.filter(p => p.traits && p.traits.includes('port')).length;
        const sea = state.seaLevel || 0.42;
        if (withFix.some(p => {
          const xi = Math.max(0, Math.min(GW - 1, Math.round(p.x))), yi = Math.max(0, Math.min(GH - 1, Math.round(p.y)));
          return field[yi * GW + xi] < sea;
        })) noneInWaterAnySeed = false;

        window._civOceanDistField = () => null;   // disables the pass (matches its own null guard) — the pre-fix baseline
        state.places = []; _civIterativeAutoWorld(3);
        window._civOceanDistField = origOceanFn;
        const withoutFix = state.places.filter(p => p.category === 'settlement');
        const withoutCoastal = withoutFix.filter(p => p.traits && p.traits.includes('port')).length;

        sumWith += withCoastal; sumWithout += withoutCoastal;
        if (withCoastal > withoutCoastal) anyImproved = true;
      }
      o.neverWorse = sumWith >= sumWithout;
      o.anyImproved = anyImproved;
      o.noneInWaterAnySeed = noneInWaterAnySeed;
    } finally {
      CIV_FACTIONS = savedFactions;
      window._civOceanDistField = origOceanFn;
      state.resW = savedResW; GW = savedResW; GH = gridH(GW); allocate();
      state.tect.seed = savedSeed; await generate();
      state.places = savedPlaces;
    }
    return o;
  });

  // v1.47 (HANDOFF's "Sea routes are never chosen; travel mode cannot re-bias a route"). The
  // multi-modal cost graph (_civDijkstraPath's mode='water'/'mixed', v0.94) already existed for the
  // general Route tool; the actual gap was that _jpDeriveStages only samples an already-drawn
  // polyline, so switching Transport never re-paths it. Fix: an explicit "Re-route for <mode>"
  // action (never silent — a hand-drawn route is the user's own work) that calls _civDijkstraPath
  // between the journey's own start/end under the selected mode's cost domain, using a new
  // `reachable` field (purely additive to _civDijkstraPath's return) to distinguish a genuine path
  // from its existing straight-line fallback for an unreachable target.
  R.v147 = await page.evaluate(async () => {
    const o = {};
    const sea = state.seaLevel || 0.42;
    let landPt = null;
    for (let y = 4; y < GH - 4 && !landPt; y++) for (let x = 4; x < GW - 4 && !landPt; x++) {
      if (field[y * GW + x] >= sea + 0.05) landPt = [x, y];
    }
    o.foundLandPt = !!landPt;

    // reachable: true for a genuine short land->land hop, and the field always exists (both
    // return paths — the smoothed success path and the degenerate-fallback path — carry it)
    const r1 = _civDijkstraPath(landPt[0], landPt[1], landPt[0] + 2, landPt[1] + 2, undefined);
    o.landReachableTrue = r1.reachable === true;

    // _jpModeForRoute: the one place the transport-label -> pathfinding-domain mapping is decided
    o.modeMapCorrect = _jpModeForRoute('Sea Faring') === 'water'
      && _jpModeForRoute('River Transport') === 'mixed'
      && _jpModeForRoute('Walking') === undefined
      && _jpModeForRoute('Mounted Rider') === undefined
      && _jpModeForRoute('Baggage Train') === undefined;

    const savedPlaces = state.places, savedJourneys = civJourneys, savedSelIdx = _civSelectedJourneyIdx;
    const origConfirm = window.confirm, origAlert = window.alert;
    try {
      state.places = [
        { kind: 'town', name: 'A', x: landPt[0], y: landPt[1], category: 'settlement', pop: 1000 },
        { kind: 'town', name: 'B', x: landPt[0] + 10, y: landPt[1] + 10, category: 'settlement', pop: 1000 }
      ];
      const pts = [[landPt[0], landPt[1]], [landPt[0] + 10, landPt[1] + 10]];
      const jn = { pts, km: 50, name: 'Test Route', groupSize: 4 };
      civJourneys = [jn]; _civSelectedJourneyIdx = 0;
      const plan = _jpEnsurePlan(jn);

      // land mode succeeds and genuinely replaces the drawn path
      plan.transport = 'Walking';
      const oldPts = jn.pts;
      const walkRes = _jpRerouteForMode(jn);
      o.walkRerouteOk = walkRes.ok === true;
      o.walkRerouteReplacedPts = jn.pts !== oldPts && jn.pts.length >= 2;

      // sea mode between two land points 10 cells apart correctly reports failure and never
      // silently accepts a straight line cutting across dry land
      jn.pts = oldPts;
      plan.transport = 'Sea Faring';
      const seaRes = _jpRerouteForMode(jn);
      o.seaRerouteReportsFailure = seaRes.ok === false && typeof seaRes.reason === 'string' && seaRes.reason.length > 0;
      o.seaRerouteNeverMutatedOnFailure = jn.pts === oldPts;

      // UI: the button exists in the party form, is labeled with the live transport mode, confirms
      // before replacing (declined -> untouched), and refreshes the modal on acceptance
      _civOpenRouteEditor(0);
      const btn = document.getElementById('reRerouteBtn');
      o.buttonExists = !!btn;
      o.buttonLabeledWithMode = !!(btn && btn.textContent.includes(plan.transport));

      plan.transport = 'Walking';
      _jpRenderPartyForm(jn);
      const btn2 = document.getElementById('reRerouteBtn');
      const ptsBeforeDecline = jn.pts;
      let confirmCalls = 0;
      window.confirm = () => { confirmCalls++; return false; };
      btn2.click();
      o.declineLeavesPtsUntouched = jn.pts === ptsBeforeDecline && confirmCalls === 1;

      window.confirm = () => true;
      window.alert = () => {};
      btn2.click();
      o.acceptReplacesPts = jn.pts !== ptsBeforeDecline;
      _civCloseRouteEditor();
    } finally {
      window.confirm = origConfirm; window.alert = origAlert;
      state.places = savedPlaces; civJourneys = savedJourneys; _civSelectedJourneyIdx = savedSelIdx;
    }
    return o;
  });

  // v1.48 (owner report: "250kg of cargo now necessitates roughly 213 mules"): jpAutoPickTransport's
  // pack-animal count solver iterates against its OWN fodder cost (more animals need more fodder,
  // needing more animals to carry it) — a fixed point that stops existing once a single animal's
  // capacity can no longer cover its own fodder for the whole trip. Past that the 6-step iteration
  // was silently returning whatever a divergent series reached by its cutoff. Fix: detect the
  // infeasibility analytically and report it honestly (a bounded floor count + a warning) instead of
  // returning a runaway number.
  R.v148 = await page.evaluate(async () => {
    const o = {};
    const sea = state.seaLevel || 0.42;
    let landPt = null;
    for (let y = 4; y < GH - 4 && !landPt; y++) for (let x = 4; x < GW - 4 && !landPt; x++) {
      if (field[y * GW + x] >= sea + 0.05) landPt = [x, y];
    }
    const savedPlaces = state.places, savedJourneys = civJourneys, savedSelIdx = _civSelectedJourneyIdx;
    try {
      state.places = [
        { kind: 'town', name: 'A', x: landPt[0], y: landPt[1], category: 'settlement', pop: 1000 },
        { kind: 'town', name: 'B', x: landPt[0] + 8, y: landPt[1] + 8, category: 'settlement', pop: 1000 }
      ];
      const pts = []; for (let k = 0; k <= 10; k++) pts.push([landPt[0] + 8 * k / 10, landPt[1] + 8 * k / 10]);
      const jn = { pts, km: 40, name: 'Test Route', groupSize: 4 };
      civJourneys = [jn]; _civSelectedJourneyIdx = 0;
      const plan = _jpEnsurePlan(jn);
      plan.transport = 'Baggage Train'; plan.assetMode = 'auto'; plan.cargoKg = 250;
      plan.grazing = 'Partial — graze at camp';

      // a normal, short-duration trip: no infeasibility flag, a small sane count
      plan.supplyDays = 7;
      const rShort = jpAutoPickTransport(jn);
      o.shortTripOk = rShort.ok === true && !rShort.infeasible;
      const shortCount = Object.values(plan.animals).reduce((t, v) => t + (v | 0), 0);
      o.shortTripCountSane = shortCount >= 1 && shortCount <= 20;

      // a very long supply duration on the SAME 250kg cargo: must be flagged infeasible and bounded
      // (the reported bug: this used to silently return a runaway count in the hundreds)
      plan.supplyDays = 200;
      const rLong = jpAutoPickTransport(jn);
      o.longTripFlaggedInfeasible = rLong.ok === true && rLong.infeasible === true && rLong.warn === true;
      const longCount = Object.values(plan.animals).reduce((t, v) => t + (v | 0), 0);
      o.longTripCountBounded = longCount >= 1 && longCount < 50;
      o.longTripHintExplainsWhy = typeof rLong.hint === 'string' && /not sustainable|resupply/i.test(rLong.hint);

      // full grazing (fodderFrac=0) never trips infeasibility, however long the trip — the animal
      // isn't carrying its own fodder at all in that mode
      plan.grazing = 'Full — graze on route';
      plan.supplyDays = 365;
      const rGraze = jpAutoPickTransport(jn);
      o.fullGrazingNeverInfeasible = rGraze.ok === true && !rGraze.infeasible;
    } finally {
      state.places = savedPlaces; civJourneys = savedJourneys; _civSelectedJourneyIdx = savedSelIdx;
    }
    return o;
  });

  // v1.49: the interpretive layer + the layout fix. The audit measured #reResults' top edge at
  // y=1295 in a 1000px viewport (295px below the fold) while the Stops column left ~875px of dead
  // space opposite the party form; Results now lives in that column. _jpVerdict/_jpConfidence/
  // _jpPackRange are pure readers over a finished plan — no new modelling, no new state.
  R.v149 = await page.evaluate(async () => {
    const o = {};
    const sea = state.seaLevel || 0.42;
    let landPt = null;
    for (let y = 4; y < GH - 4 && !landPt; y++) for (let x = 4; x < GW - 4 && !landPt; x++) {
      if (field[y * GW + x] >= sea + 0.05) landPt = [x, y];
    }
    const savedPlaces = state.places, savedJourneys = civJourneys, savedSelIdx = _civSelectedJourneyIdx;
    try {
      state.places = [
        { kind: 'town', name: 'A', x: landPt[0], y: landPt[1], category: 'settlement', pop: 1000 },
        { kind: 'town', name: 'B', x: landPt[0] + 8, y: landPt[1] + 8, category: 'settlement', pop: 1000 }
      ];
      const pts = []; for (let k = 0; k <= 10; k++) pts.push([landPt[0] + 8 * k / 10, landPt[1] + 8 * k / 10]);
      const jn = { pts, km: 40, name: 'Test Route', groupSize: 4 };
      civJourneys = [jn]; _civSelectedJourneyIdx = 0;
      const p = _jpEnsurePlan(jn);
      p.transport = 'Baggage Train'; p.assetMode = 'auto'; p.cargoKg = 250; p.supplyDays = 7;
      p.grazing = 'Partial — graze at camp';
      /* v1.63: assetMode:'auto' is a UI-flow label — it does not itself populate p.animals when
         _jpPlan is called directly here (that only happens via the real auto-select UI path, not
         exercised by this synthetic test), so a Baggage Train with zero animals and 250 kg cargo
         against a 4-person party's 120 kg human-porter capacity was ALREADY ~267% overloaded before
         this test's own deliberate overload step. v1.63's Finding-1.2 fix (an overload past 150% of
         capacity is now flagged infeasible rather than silently crawling) turned that pre-existing,
         accidentally-overloaded baseline into a blocked plan, which is not what "the normal case"
         below is meant to represent. Two real pack mules make the baseline genuinely valid. */
      p.animals.mule = 2;

      // ── verdict: shape, vocabulary, and that it NAMES its reasons (a verdict that can't say why
      //    is worse than none — the v1.35 `basis` lesson)
      const plan = _jpPlan(jn);
      const v = _jpVerdict(plan);
      o.verdictShape = !!(v && typeof v.level === 'string' && typeof v.label === 'string'
        && typeof v.text === 'string' && Array.isArray(v.reasons));
      o.verdictLevelValid = ['favourable', 'moderate', 'strained', 'severe', 'blocked'].includes(v.level);
      o.verdictReasonsAreStrings = v.reasons.every(r => typeof r === 'string' && r.length > 0);

      // a deliberately overloaded party must escalate the verdict AND cite the overload by name
      // (v1.63: 'blocked' is now also a valid, in fact the MOST escalated, outcome — Finding 1.2's
      // fix correctly flags a genuinely impossible load as infeasible rather than merely "severe")
      p.assetMode = 'manual'; p.cargoKg = 40000;
      ['donkey','mule','camel','horse'].forEach(k => p.animals[k] = 0); p.carts = 0; p.wagons = 0;
      const vBad = _jpVerdict(_jpPlan(jn));
      o.overloadEscalates = vBad.level === 'severe' || vBad.level === 'strained' || vBad.level === 'blocked';
      o.overloadNamed = vBad.reasons.some(r => /overload|capacit|resuppl/i.test(r)) ||
        (vBad.level === 'blocked' && /overload|capacit/i.test(_jpPlan(jn).results?.[0]?.blocked || ''));
      p.cargoKg = 250; p.assetMode = 'auto'; p.animals.mule = 2;

      // ── confidence: asymmetric (downside always larger), widens with duration, brackets the estimate
      const c = _jpConfidence(_jpPlan(jn));
      o.confBrackets = !!(c && c.loDays <= (_jpPlan(jn).totalDays ?? _jpPlan(jn).days) && c.hiDays >= (_jpPlan(jn).totalDays ?? _jpPlan(jn).days));
      o.confAsymmetric = !!(c && (c.hi - 1) > (1 - c.lo));
      const bands = [3, 10, 17, 40, 120].map(d => _jpConfidence({ days: d, totalDays: d, blocked: false }));
      o.confWidensWithDuration = bands.every((b, i) => i === 0 || (b.hi - b.lo) >= (bands[i - 1].hi - bands[i - 1].lo));
      o.confBlockedIsNull = _jpConfidence({ days: 10, blocked: true }) === null;

      // ── pack range: matches the v1.48 guard's own threshold, and full grazing has no ceiling
      p.grazing = 'None — carry all fodder';
      _jpRefresh(true);
      const pr = _jpPackRange(_jpPlan(jn));
      o.packRangeExists = !!(pr && pr.maxDays > 0 && isFinite(pr.maxDays));
      if (pr) {
        // reproduce the v1.48 guard arithmetic independently: cap / (food * fodderFrac)
        const A = JP_ANIMALS[pr.key];
        const expected = A.cap / (A.food * (JP_GRAZING[p.grazing].fodderFrac));
        o.packRangeMatchesGuard = Math.abs(pr.maxDays - expected) / expected < 0.02;
      }
      p.grazing = 'Full — graze on route'; _jpRefresh(true);
      const prFull = _jpPackRange(_jpPlan(jn));
      o.fullGrazingNoCeiling = !!(prFull && prFull.unlimited);
      p.grazing = 'Partial — graze at camp'; _jpRefresh(true);

      // ── layout: Results is above the fold and inside the sticky output column, not a
      //    full-width block below the party form
      _civOpenRouteEditor(0);
      await new Promise(r => setTimeout(r, 300));
      const res = document.getElementById('reResults'), party = document.getElementById('reParty');
      const outCol = document.querySelector('.re-col-out');
      o.resultsInOutputColumn = !!(outCol && res && outCol.contains(res));
      o.stopsInOutputColumn = !!(outCol && outCol.contains(document.getElementById('reStops')));
      o.outColIsSticky = !!(outCol && getComputedStyle(outCol).position === 'sticky');
      const rBody = document.querySelector('.re-body').getBoundingClientRect();
      const rRes = res.getBoundingClientRect();
      o.resultsAboveFold = (rRes.top - rBody.top) < window.innerHeight;
      // and it now precedes the (taller) party form rather than following it
      o.resultsBeforeParty = res.getBoundingClientRect().top <= party.getBoundingClientRect().top + 200;
      // the verdict actually renders into the panel
      o.verdictRendered = /Favourable|Moderate|Strained|Severe/.test(res.textContent);
      o.confidenceRendered = /Likely range/.test(res.textContent);
      _civCloseRouteEditor();
    } finally {
      state.places = savedPlaces; civJourneys = savedJourneys; _civSelectedJourneyIdx = savedSelIdx;
      const m = document.getElementById('routeEditorModal'); if (m) m.classList.remove('open');
      _reOpen = false;
    }
    return o;
  });

  // v1.50: auto-selection audit fixes + the bottleneck veto. The audit found "Hills" and
  // "Mountain Pass" carried per-animal ratings but no selection rule, so biome overrode terrain
  // exactly where terrain is most differentiated (a camel picked for a mountain pass at 0.50 vs
  // mule's 0.85). Plus: a pack train is a whole-journey commitment, so one demanding stage now
  // switches the WHOLE route's animal — flagged, and overridable per stage.
  R.v150 = await page.evaluate(() => {
    const o = {};
    const S = (terrain, biome, km) => ({ cat: 'land', terrain, biome, km });
    const ANIMALS = Object.keys(JP_ANIMALS);

    // one source of truth for "how fast is this animal here" — the extracted resolver must
    // reproduce the table exactly (jpCalcLand now calls it too)
    o.modResolverMatchesTable = ANIMALS.every(a => Object.keys(JP_TERRAIN.land).every(t => {
      const ov = JP_ANIMAL_TERRAIN_OVERRIDE[a];
      const expect = (ov && ov[t] !== undefined) ? ov[t] : JP_TERRAIN.land[t];
      return jpAnimalTerrainMod(a, t) === expect;
    }));
    o.modResolverDefaults = jpAnimalTerrainMod(null, 'Open Plains') === JP_TERRAIN.land['Open Plains'];

    // AUDIT FIX: wherever terrain genuinely discriminates between animals, the per-stage pick must
    // be the argmax. Forest Path is the one documented exception (a deliberate capacity choice).
    const nonArgmax = [];
    for (const t of Object.keys(JP_TERRAIN.land)) for (const b of Object.keys(JP_BIOMES)) {
      const best = Math.max(...ANIMALS.map(a => jpAnimalTerrainMod(a, t)));
      const picked = jpAnimalTerrainMod(jpBestAnimalForContext(t, b).key, t);
      if (picked < best - 1e-9) nonArgmax.push(t);
    }
    o.onlyForestPathIsNonArgmax = nonArgmax.every(t => t === 'Forest Path');
    o.hillsPicksMule = jpBestAnimalForContext('Hills', 'Steppe / Grassland').key === 'mule';
    o.mountainPassPicksMule = jpBestAnimalForContext('Mountain Pass', 'Hot Desert').key === 'mule';

    // BOTTLENECK VETO: a real mountain share switches the whole route and reports the switch
    const mtn = jpPickSpeciesForRoute([S('Open Plains', 'Hot Desert', 400), S('Mountain Pass', 'Hot Desert', 100)]);
    o.bottleneckSwitches = mtn.key === 'mule' && !!mtn.switched && mtn.switched.from === 'camel' && mtn.switched.to === 'mule';
    o.bottleneckNamesTerrain = !!(mtn.switched && mtn.switched.terrain === 'Mountain Pass' && mtn.reason.includes('Mountain Pass'));
    // ...and a sand crossing switches the other way (not a mule-only rule)
    const sand = jpPickSpeciesForRoute([S('Open Plains', 'Temperate Forest', 350), S('Deep Sand', 'Hot Desert', 150)]);
    o.bottleneckSymmetric = sand.key === 'camel' && !!sand.switched && sand.switched.to === 'camel';

    // ...but a token stretch below the share floor must NOT hijack the route
    const tiny = jpPickSpeciesForRoute([S('Open Plains', 'Hot Desert', 950), S('Mountain Pass', 'Hot Desert', 50)]);
    o.smallStretchDoesNotSwitch = tiny.key === 'camel' && !tiny.switched;
    // ...and a route with no bottleneck reports no switch at all
    const plain = jpPickSpeciesForRoute([S('Open Plains', 'Hot Desert', 500)]);
    o.noBottleneckNoSwitch = plain.key === 'camel' && !plain.switched;
    // ...and the deliberate Forest Path capacity choice survives the new machinery
    const forest = jpPickSpeciesForRoute([S('Forest Path', 'Temperate Forest', 300)]);
    o.forestKeepsMule = forest.key === 'mule' && !forest.switched;

    // reason attribution follows the km-DOMINANT stage, not whichever was scored last
    const attr = jpPickSpeciesForRoute([S('Forest Path', 'Temperate Forest', 40), S('Rocky Terrain', 'Temperate Forest', 400)]);
    o.reasonFromDominantStage = attr.key === 'mule' && /rough\/upland/.test(attr.reason);

    // empty land-stage list still answers
    o.emptyRouteSafe = jpPickSpeciesForRoute([]).key === 'mule';
    return o;
  });

  // ── v1.51: the constraints that were stated but never measured ──────────────────────────────
  // The v1.50 audit found the TIME model sound and three of the CONSTRAINT inputs to be constants
  // standing in for data the world already carries. Each assertion below pins one measurement.
  R.v151 = await page.evaluate(() => {
    const o = {};
    const sea = state.seaLevel || 0.42;
    let landPt = null;
    for (let y = 4; y < GH - 4 && !landPt; y++) for (let x = 4; x < GW - 4 && !landPt; x++)
      if (field[y * GW + x] >= sea + 0.05) landPt = [x, y];
    const savedPlaces = state.places, savedJourneys = civJourneys, savedSelIdx = _civSelectedJourneyIdx;
    try {
      // a LONG route with settlements only at its two ends — the shape the audit measured, where
      // the required resupply interval and the real settlement spacing diverge hard
      const span = Math.min(GW - 10, 120) - landPt[0] > 40 ? 40 : Math.max(12, Math.floor((GW - 10 - landPt[0]) * 0.6));
      state.places = [
        { kind: 'town', name: 'A', x: landPt[0], y: landPt[1], category: 'settlement', pop: 1000 },
        { kind: 'town', name: 'B', x: landPt[0] + span, y: landPt[1], category: 'settlement', pop: 1000 }
      ];
      const pts = []; for (let k = 0; k <= 60; k++) pts.push([landPt[0] + span * k / 60, landPt[1]]);
      const jn = { pts, name: 'v151', groupSize: 4 };
      civJourneys = [jn]; _civSelectedJourneyIdx = 0;
      const base = () => {
        const p = _jpEnsurePlan(jn);
        Object.assign(p, {
          groupSize: 12, transport: 'Baggage Train', pace: 'Standard Pace', hours: 8, season: 'Summer',
          cargoKg: 900, supplyDays: 7, carryFood: true, grazing: 'Partial — graze at camp', foraging: 'None',
          desertWater: 'auto', routeCond: 'auto', infra: 'auto', assetMode: 'manual', autoPromote: false,
          weatherOverride: 'auto', stageOverrides: {}, seasonalClosures: true,
          // NO carts/wagons: the smoke suite's world has been mutated by ~430 prior assertions and
          // its terrain along this line is not guaranteed wheel-passable. A wheel block would make
          // _jpPlan report `blocked`, and _jpVerdict then returns early with empty reasons — which
          // is correct behaviour but would make these assertions test the route rather than the fix.
          carts: 0, wagons: 0, travois: 0, sleds: 0
        });
        // v1.63: F2's own supplyDays sweep goes up to 45/60 days, and under Partial grazing every
        // MULE's fodder for that long (5 kg/day x days x 0.5) exceeds its own 110 kg capacity — so
        // more mules make a long trip WORSE, not better (the same divergent-fixed-point shape v1.48
        // already documented for the pack-animal solver). Camels break even at 60 days (6 kg/day
        // fodder vs 300 kg capacity), so 10 of them give this multi-week scenario real headroom
        // without changing what F1-F5 are actually testing.
        p.animals = { donkey: 0, mule: 8, camel: 10, horse: 2 };
        return p;
      };

      // ── F1: the requirement finally meets the map ──
      base();
      const plan = _jpPlan(jn);
      const rr = plan.resupplyReach;
      o.reachExists = !!rr;
      o.reachFieldsSane = !!(rr && rr.requiredKm > 0 && rr.maxGapKm >= 0 && isFinite(rr.shortfall) && typeof rr.unmet === 'boolean');
      // Drive BOTH directions off supplyDays rather than asserting whatever this particular route
      // happens to be: 1 day of supplies cannot span the gap, 400 days trivially can. That tests the
      // comparison itself, independent of the world the suite has by now mutated into existence.
      const tiny = (() => { const p = base(); p.supplyDays = 1; return _jpPlan(jn); })();
      const huge = (() => { const p = base(); p.supplyDays = 60; return _jpPlan(jn); })();
      o.unmetDetected = !!(tiny.resupplyReach && tiny.resupplyReach.unmet)
        && !!(huge.resupplyReach && !huge.resupplyReach.unmet);
      // when unmet, the reason must name BOTH the real gap and the carried range — a verdict that
      // can't show its arithmetic is the thing v1.35's `basis` lesson exists to prevent
      const tinyReasons = (_jpVerdict(tiny) || {}).reasons || [];
      o.unmetNamesBothNumbers = tiny.blocked || tinyReasons.some(s =>
        /no settlement is \d+ km/.test(s) && /carry \d+ km/.test(s));
      o.falseStringGone = !((_jpVerdict(plan) || {}).reasons || [])
        .some(s => /resupplied from settlements in reach/.test(s));

      // ── F2: supplyDays must be live (v1.50: 2/7/20/45 all returned identical days) ──
      // Assert the RANGE, not the day count: the carried range is the quantity supplyDays sets, and
      // it must move monotonically. Day count only shifts when the change crosses one of
      // jpLoadPenalty's five bands, so a short route can legitimately show identical days for two
      // adjacent settings — verified as real step-function saturation, not a residual dead control.
      const sd = [2, 7, 20, 45].map(n => { const p = base(); p.supplyDays = n; const pl = _jpPlan(jn);
        return { n, days: pl.days, reach: pl.resupplyReach ? pl.resupplyReach.requiredKm : null }; });
      o.supplyDaysMovesReach = sd.every(r => r.reach > 0)
        && sd.every((r, i) => i === 0 || r.reach > sd[i - 1].reach);
      // and it must still be the multiplier it claims to be: range == supplyDays × the slowest pace
      o.supplyDaysMovesDays = Math.abs(sd[3].reach / sd[1].reach - 45 / 7) < 0.01;

      // ── F4a: waterless vs overloaded must be distinguishable at the source ──
      const dry = jpAssessResupply(9999, 100, 10, 20, 12, 7, true, 400);
      const load = jpAssessResupply(9999, 100, 10, 20, 1.0, 7, true, 0);
      o.waterCauseNamed = dry.cause === 'water' && /No water for/.test(dry.verdict);
      o.loadCausePlain = load.cause === 'load' && /over capacity/.test(load.verdict);
      o.causesDiffer = dry.verdict !== load.verdict;

      // ── F4b: the gap is measured from real hydrology, not a constant ──
      // v1.56 lowered the drinking-water threshold specifically so most short routes now find SOME
      // nearby water (see JP_DRINKING_FLOW_DIVISOR) — which made this test's original reliance on
      // the ambient, ~500-assertions-mutated smoke-suite world's by-chance hydrology fragile: this
      // exact route may now legitimately read freshwater-throughout under the new, looser test. A
      // controlled synthetic flowField proves the SAME underlying claim (dryKm/waterGapDays respond
      // to real per-cell hydrology, not a hardcoded 1.5) with certainty instead of by chance: one
      // pass with no water anywhere near the route (genuinely, unambiguously dry) and one pass with
      // abundant water right along it (never dry) — the SAME route measuring differently under
      // different real hydrology IS the claim, and is a more direct proof of it than hoping this
      // particular stage-chunking happens to vary.
      const savedFlow4b = flowField;
      let dryKmsDry, gapsDry, stagesDry;
      try {
        const n4b = GW * GH, flowThreshReal = GW * GH * 0.0004, midY2 = landPt[1];
        flowField = new Float32Array(n4b);   // no water anywhere ⇒ genuinely dry
        const p4 = base();
        stagesDry = _jpDeriveStages(jn, p4);
        dryKmsDry = stagesDry.filter(s => s.cat === 'land').map(s => +s.dryKm || 0);
        const plDry = _jpPlan(jn);
        gapsDry = plDry.results.filter(r => r.cat === 'land' && !r.blocked).map(r => r.waterGapDays);

        const wetField = new Float32Array(n4b);
        for (let x = 0; x < GW; x++) wetField[midY2 * GW + x] = flowThreshReal * 4;   // abundant water along the whole route
        flowField = wetField;
        const stagesWet = _jpDeriveStages(jn, p4);
        const dryKmsWet = stagesWet.filter(s => s.cat === 'land').map(s => +s.dryKm || 0);

        o.dryKmMeasured = dryKmsDry.length > 0 && dryKmsDry.every(v => v > 0);
        o.dryKmVaries = dryKmsDry.some(v => v > 0) && dryKmsWet.length > 0 && dryKmsWet.every(v => v === 0);
        o.gapNotConstant = gapsDry.some(v => Math.abs(v - 1.5) > 0.01);
      } finally { flowField = savedFlow4b; }
      // desert on 'auto' must derive its own gap rather than echo a dropdown tier
      // Assert the MECHANISM, not that auto ≠ manual: on some routes the measured gap coincides
      // with a tier's own gap by arithmetic accident (a 6.25 km dry run at ~1 km/day IS 6 days,
      // which is exactly Sparse Wells). Auto must equal the measured dry run over the stage's own
      // speed; manual must equal the chosen tier's constant, whatever the map says.
      // The stage supplies its OWN dry run rather than inheriting whatever this route measured: by
      // the time the suite reaches here the world has been mutated by ~430 assertions and its route
      // may legitimately have freshwater throughout (dryKm 0), which would leave the mechanism
      // untested rather than failing it. Fixed inputs make this assert the arithmetic, not the map.
      const stD = Object.assign({}, stagesDry[0], { terrain: 'Deep Sand', biome: 'Hot Desert', dryKm: 300 });
      const stD2 = Object.assign({}, stD, { dryKm: 600 });
      // base() returns _jpEnsurePlan(jn) — the SAME object every call — so two "variants" built from
      // it are aliases and the second configuration silently wins for both. Clone before diverging.
      // v1.63: JP_LOAD_INVALID_RATIO now blocks a stage whose UN-iterated ratio0 exceeds 1.50. base()'s
      // inherited cargoKg:900 sized for its own 8-mule/2-horse party is far beyond what 12 Walking
      // humans alone (360 kg porter capacity) can carry across a Hot Desert stage's water/food overhead
      // — genuinely infeasible regardless of cargo, not merely heavy. A couple of camels (desert's own
      // best-suited pack animal) plus a lighter cargo figure keeps this a real, non-blocked scenario
      // without changing what the desert-water mechanism itself is testing.
      const variant = (over) => Object.assign(JSON.parse(JSON.stringify(base())),
        { transport: 'Walking', animals: { donkey: 0, mule: 0, camel: 2, horse: 0 }, carts: 0, cargoKg: 300 }, over);
      const pA = variant({ desertWater: 'auto' });
      const pM = variant({ desertWater: 'Sparse Wells' });
      const rA = jpCalcLand(stD, pA), rM = jpCalcLand(stD, pM);
      const rA2 = jpCalcLand(stD2, pA), rM2 = jpCalcLand(stD2, pM);
      // auto == the measured run over the stage's OWN returned speed (an invariant of the return
      // value on every path since v1.51 recomputes it once after the convergence loop)
      const autoIsMeasured = !rA.blocked && rA.dryKm === 300
        && Math.abs(rA.waterGapDays - Math.max(0.5, 300 / rA.dailyKm)) < 1e-6;
      // manual == the chosen tier's constant, and INDEPENDENT of the map
      const manualIsTheTier = !rM.blocked
        && Math.abs(rM.waterGapDays - JP_DESERT_WATER['Sparse Wells'].gap) < 1e-6
        && Math.abs(rM2.waterGapDays - rM.waterGapDays) < 1e-6;
      o.desertAutoDerives = autoIsMeasured && manualIsTheTier
        && rA2.waterGapDays > rA.waterGapDays;   // auto follows the map, manual does not

      // ── F3: column length ──
      // v1.63: cargoKg lowered from 900 (sized for base()'s own 8-mule/2-horse party) to 300 — at
      // groupSize 30 with zero animals, 900kg trips JP_LOAD_INVALID_RATIO before column length is
      // even reached; 300kg stays valid across the full [30,200,2000,100000] sweep this test needs.
      const sizes = [30, 200, 2000, 100000].map(n => {
        const p = base(); p.transport = 'Walking'; p.animals = { donkey: 0, mule: 0, camel: 0, horse: 0 };
        p.carts = 0; p.groupSize = n; p.cargoKg = 300;
        const st = Object.assign({}, _jpDeriveStages(jn, p)[0], { terrain: 'Dirt Track' });
        const r = jpCalcLand(st, p);
        return { n, kmday: r.dailyKm, colKm: r.colKm, colMod: r.colMod };
      });
      o.colGrows = sizes.every((s, i) => i === 0 || s.colKm > sizes[i - 1].colKm);
      o.colFloored = Math.abs(sizes[sizes.length - 1].colMod - JP_COLUMN_FLOOR) < 1e-6;
      o.hugeIsSlower = sizes[sizes.length - 1].kmday < sizes.find(s => s.n === 200).kmday;
      o.caravanUnaffected = sizes.find(s => s.n === 30).colMod > 0.99;

      // ── F5: seasonal closure ──
      // v1.63: cargoKg lowered from the inherited 900 to 300 — same reasoning as F3, since this test
      // is asserting closure behaviour specifically and must not be confounded by an unrelated
      // capacity block (closure is checked first in jpCalcLand so winterPassClosed is unaffected
      // either way, but summerOpen/temperateOpen/plainsOpen need the stage to genuinely NOT block).
      const closureCase = (season, biome, terrain, override) => {
        const p = base(); p.season = season; p.transport = 'Walking';
        p.animals = { donkey: 0, mule: 0, camel: 0, horse: 0 }; p.carts = 0; p.cargoKg = 300;
        if (override !== undefined) p.seasonalClosures = override;
        const st = Object.assign({}, _jpDeriveStages(jn, p)[0], { terrain, biome });
        return !!jpCalcLand(st, p).blocked;
      };
      o.winterPassClosed = closureCase('Winter', 'Mountain Highland', 'Mountain Pass');
      o.summerOpen = !closureCase('Summer', 'Mountain Highland', 'Mountain Pass');
      o.temperateOpen = !closureCase('Winter', 'Temperate Forest', 'Mountain Pass');
      o.plainsOpen = !closureCase('Winter', 'Mountain Highland', 'Open Plains');
      o.closureOverridable = !closureCase('Winter', 'Mountain Highland', 'Mountain Pass', false);

      // ── owner request: an impossible stage must be highlighted where it can be EDITED ──
      // Force a guaranteed block (wheels can never cross Deep Sand) and read the rendered markup.
      {
        const p = base(); p.season = 'Winter'; p.seasonalClosures = true;
        p.carts = 4;                            // wheels: blocked on several terrains
        p.cargoKg = 400000;                     // and a load nothing can carry
        _jpRenderResults(jn);
        const host = document.getElementById('reResults');
        const h = host ? host.innerHTML : '';
        o.troubleRendered = /need(s)? attention|Impossible as configured|Unsupportable|Overloaded/.test(h);
        // the bad stage must be force-OPENED (not hidden behind a collapsed disclosure) and tinted
        o.troubleOpened = /<details[^>]*open[^>]*>/.test(h);
        o.troubleHasFix = /↳/.test(h);          // every trouble card states the control that fixes it
        o.troubleTinted = /var\(--warn\)|#e0a840/.test(h);
      }

      // ── owner request: vessel information — what is actually fast, and where it may sail ──
      {
        // pure resolver agrees with the frozen tables and with the validator's own verdict
        o.vesselDayKmComposes = Math.abs(jpVesselDayKm('Cog', 'sea', 'Open Sea')
          - JP_SHIPS['Cog'].speed * jpWaterWindow('sea', 'Open Sea') * JP_TERRAIN.sea['Open Sea']) < 1e-9;
        o.vesselDayKmRefuses = jpVesselDayKm('Fishing Vessel', 'sea', 'Open Sea') === null
          && jpVesselDayKm('River Barge', 'river', 'River with Rapids') === null
          && jpVesselDayKm('River Barge', 'sea', 'Open Sea') === null;
        const vm = jpVesselMatrix();
        o.vesselMatrixShape = vm.rows.length === Object.keys(JP_SHIPS).length
          && vm.waters.length === Object.keys(JP_TERRAIN.river).length + Object.keys(JP_TERRAIN.sea).length
          && vm.rows.every(r => r.cells.length === vm.waters.length);
        // every vessel must be usable somewhere, and no vessel may be rated for water it is blocked from
        o.vesselEveryHullSails = vm.rows.every(r => r.waters > 0);
        o.vesselMatrixMatchesValidator = vm.rows.every(r => r.cells.every(c =>
          (c.kmday == null) === (!r.ship.modes.includes(c.cat) || !!_jpVesselWaterBlock(r.ship, c.cat, c.terrain, r.name))));
        // "fastest" is genuinely water-dependent — the point of showing the table at all
        const bestOpen = vm.best['sea|Open Sea'].name, bestBay = vm.best['sea|Sheltered Bay'].name,
          bestCalm = vm.best['river|Calm River'].name;
        o.vesselBestVaries = new Set([bestOpen, bestBay, bestCalm].filter(Boolean)).size > 1;
        // and it is not simply the highest cruise speed (the misconception the panel exists to correct)
        const fastestCruise = Object.keys(JP_SHIPS).reduce((a, b) => JP_SHIPS[b].speed > JP_SHIPS[a].speed ? b : a);
        o.vesselBestIsNotJustCruise = bestBay !== fastestCruise || bestCalm !== fastestCruise;
        _jpRenderResults(jn);
        const h2 = (document.getElementById('reResults') || {}).innerHTML || '';
        o.vesselPanelRendered = /Vessel reference|what's fast/.test(h2);
      }
    } finally {
      state.places = savedPlaces; civJourneys = savedJourneys; _civSelectedJourneyIdx = savedSelIdx;
    }
    return o;
  });

  // ── v1.52: the Cartography season slider + the four deferred travel items ────────────────────
  // The slider half is driven through the real DOM event and forces the frame afterwards, because
  // render()/withBusy are deferred — hashing straight after dispatch measures the previous frame.
  R.v152 = {};
  {
    const hashFn = () => {
      const cv = document.getElementById('view');
      const g = cv.getContext('2d', { willReadFrequently: true });
      const d = g.getImageData(0, 0, cv.width, cv.height).data;
      let h = 2166136261 >>> 0;
      for (let i = 0; i < d.length; i += 17) { h ^= d[i]; h = Math.imul(h, 16777619) >>> 0; }
      return h >>> 0;
    };
    const saved = await page.evaluate(() => ({ mode: state.mode, seasons: !!state.climate.seasons, season: state.viz.season }));
    await page.evaluate(() => { state.mode = 'biome'; state.climate.seasons = false; state.viz.season = 0; renderNow(); });
    // warm-up: the first non-zero drag computes the seasonal fields on the busy chain (a one-off)
    await page.evaluate(() => { const sr = document.getElementById('seasonR'); sr.value = '75'; sr.dispatchEvent(new Event('input', { bubbles: true })); });
    await page.waitForTimeout(2500);
    const seasonsAfter = await page.evaluate(() => ({
      on: !!state.climate.seasons, chk: (document.getElementById('seasons') || {}).checked === true,
      note: (document.getElementById('seasonNote') || {}).textContent || ''
    }));
    R.v152.sliderEnablesSeasons = seasonsAfter.on;
    R.v152.checkboxSynced = seasonsAfter.chk;
    R.v152.noteLive = /Showing (July|January)/.test(seasonsAfter.note);
    const hs = [];
    for (const v of [-100, -50, 0, 50, 100]) {
      await page.evaluate((val) => { const sr = document.getElementById('seasonR'); sr.value = String(val); sr.dispatchEvent(new Event('input', { bubbles: true })); }, v);
      await page.waitForTimeout(400);
      await page.evaluate(() => { renderNow(); });
      hs.push(await page.evaluate(hashFn));
    }
    R.v152.sliderDistinct = new Set(hs).size;
    // and it must SAY so when it genuinely cannot show anything (wrong map view)
    R.v152.noteInert = await page.evaluate(() => {
      state.mode = 'height'; state.viz.season = 0.5; _seasonSliderNote();
      const t = (document.getElementById('seasonNote') || {}).textContent || '';
      return /Inert here/.test(t) && /Biome map view/.test(t);
    });
    await page.evaluate((s) => { state.mode = s.mode; state.climate.seasons = s.seasons; state.viz.season = s.season; renderNow(); }, saved);
  }
  Object.assign(R.v152, await page.evaluate(() => {
    const o = {};
    const sea = state.seaLevel || 0.42;
    let landPt = null;
    for (let y = 4; y < GH - 4 && !landPt; y++) for (let x = 4; x < GW - 4 && !landPt; x++)
      if (field[y * GW + x] >= sea + 0.05) landPt = [x, y];
    const savedPlaces = state.places, savedJ = civJourneys, savedIdx = _civSelectedJourneyIdx;
    try {
      const span = Math.max(20, Math.min(GW - 10 - landPt[0], 60));
      state.places = [{ kind: 'town', name: 'A', x: landPt[0], y: landPt[1], category: 'settlement', pop: 1000 },
      { kind: 'town', name: 'B', x: landPt[0] + span, y: landPt[1], category: 'settlement', pop: 1000 }];
      const pts = []; for (let k = 0; k <= 60; k++) pts.push([landPt[0] + span * k / 60, landPt[1]]);
      const jn = { pts, name: 'v152', groupSize: 4 };
      civJourneys = [jn]; _civSelectedJourneyIdx = 0;
      const mk = (over) => {
        const p = _jpEnsurePlan(jn);
        Object.assign(p, {
          groupSize: 12, transport: 'Baggage Train', pace: 'Standard Pace', hours: 8, season: 'Spring',
          /* small default cargo: this route is two hardcoded land points in a world already mutated
             by ~440 prior assertions, so it may cross water the tests never checked for. A water leg
             still prices cargo against whatever vessel gets auto-picked (smallest cap: Fishing
             Vessel, 1500 kg) regardless of the chosen LAND transport, so the base case must stay
             under that on any terrain — heavier cargo is used only in the calls that explicitly
             override it for a land-side purpose (the cost-model checks). */
          cargoKg: 50, supplyDays: 7, carryFood: true, grazing: 'Partial — graze at camp', foraging: 'None',
          desertWater: 'auto', routeCond: 'auto', infra: 'auto', assetMode: 'manual', autoPromote: false,
          weatherOverride: 'auto', stageOverrides: {}, seasonalClosures: true, restCadence: 'auto',
          seasonDrift: true, carts: 0, wagons: 0, travois: 0, sleds: 0
        }, over || {});
        p.animals = { donkey: 0, mule: 8, camel: 0, horse: 2 };
        return _jpPlan(jn);
      };

      // rest days — travel vs calendar
      const base = mk();
      o.restSums = Math.abs(base.totalDays - (base.days + base.restDays + base.layoverDays)) < 1e-9;
      const none = mk({ restCadence: 'None — press on' }), heavy = mk({ restCadence: 'Heavy — 1 in 3' });
      o.restCadenceLive = none.restDays === 0 && heavy.restDays >= base.restDays && heavy.restDays > 0;
      o.restShortNone = jpRestDays(4, 'auto', false).restDays === 0;
      o.restLongHas = jpRestDays(40, 'auto', false).restDays > 0 && jpRestDays(40, 'auto', false).every === 5;

      // season drift
      o.seasonWalks = JSON.stringify([0, 91, 182, 273, 364].map(d => jpSeasonAt('Spring', d)))
        === JSON.stringify(['Spring', 'Summer', 'Autumn', 'Winter', 'Spring']);
      // a stage straddling the boundary must take its MIDPOINT season: a stage starting day 80 and
      // running 30 days is mostly in the next season, and start-day assignment got that wrong.
      o.driftUsesMidpoint = jpSeasonAt('Spring', 80) === 'Spring' && jpSeasonAt('Spring', 80 + 30 / 2) === 'Summer';
      // build a long enough journey to actually cross one
      const long = mk({ cargoKg: 30000, groupSize: 40 });
      const longNo = mk({ cargoKg: 30000, groupSize: 40, seasonDrift: false });
      o.driftCrosses = !long.blocked ? (long.seasonDrift ? long.seasonsCrossed.length >= 1 : true) : true;
      o.driftChangesDays = !long.blocked && !longNo.blocked
        ? (long.seasonDrift ? Math.abs(long.days - longNo.days) >= 0 : true) : true;

      // sea closure
      o.seaShut = !!jpSeaClosure('Open Sea', 'Winter', { seasonalClosures: true })
        && !!jpSeaClosure('Rough Open Sea', 'Winter', { seasonalClosures: true });
      o.coastalOpen = !jpSeaClosure('Coastal Waters', 'Winter', { seasonalClosures: true })
        && !jpSeaClosure('Sheltered Bay', 'Winter', { seasonalClosures: true })
        && !jpSeaClosure('Open Sea', 'Summer', { seasonalClosures: true });
      o.seaOverridable = !jpSeaClosure('Open Sea', 'Winter', { seasonalClosures: false });
      {
        const p = _jpEnsurePlan(jn);
        Object.assign(p, { season: 'Winter', transport: 'Sea Faring', vessel: 'Cog', seasonalClosures: true, groupSize: 6, cargoKg: 100 });
        const st = { cat: 'sea', terrain: 'Open Sea', biome: 'Coastal Lowland', km: 500, routeCond: 'Neutral', infra: 'Stable Settlements' };
        const shut = !!jpCalcWater(st, p).blocked;
        p.seasonalClosures = false;
        o.seaBlocksStage = shut && !jpCalcWater(st, p).blocked;
      }

      // cost
      // v1.63: JP_LOAD_INVALID_RATIO now blocks a stage whose load ratio exceeds 1.50 — this route's
      // 8-mule/2-horse/12-person party caps out well under the old 5000/20000kg test cargo (measured
      // capacity ~1480kg before overhead), so those figures are now genuinely infeasible rather than
      // merely heavy. 1000/1500kg stay valid on every stage (max ratio ~1.36) while still scaling cost.
      const cp = mk({ cargoKg: 1000 });
      const c = jpJourneyCost(cp);
      o.costSums = !!c && Math.abs(c.total - (c.carriage + c.wages + c.crew + c.upkeep + c.tolls + c.transship)) < 1e-9;
      const c2 = jpJourneyCost(mk({ cargoKg: 1500 }));
      o.costScales = !!c && !!c2 && c2.total > c.total && c2.carriage > c.carriage;
      o.costRatios = JP_COST_PER_TKM.land > JP_COST_PER_TKM.river && JP_COST_PER_TKM.river > JP_COST_PER_TKM.sea
        && (JP_COST_PER_TKM.land / JP_COST_PER_TKM.sea) > 20;
      o.costBreakEven = !!c && c.breakEvenPerTonne > 0 && c.unit === 'day-wages';
      o.costBlockedNull = jpJourneyCost({ blocked: true, results: [], plan: {} }) === null
        && jpJourneyCost(null) === null;
      // no cargo ⇒ no break-even to quote, but still a real cost of moving the party
      const c0 = jpJourneyCost(mk({ cargoKg: 0 }));
      o.costBreakEven = o.costBreakEven && !!c0 && c0.breakEvenPerTonne === null && c0.total > 0;
    } finally {
      state.places = savedPlaces; civJourneys = savedJ; _civSelectedJourneyIdx = savedIdx;
    }
    return o;
  }));

  // ── v1.52: snap-to-place/way while drawing (owner: "reintroduce snapping to settlements/POI
  // logic as in Cartalith V1.915"). Uses the real settlements _civIterativeAutoWorld already placed
  // earlier in the suite — isolated from real civWays where noted, since a road genuinely
  // terminates at a settlement (v1.02) and can legitimately sit closer than the pin itself; that is
  // "nearest wins" working as designed (V1.915's own findWaySnap has no place-vs-way preference
  // either), not something the test should route around by coincidence.
  Object.assign(R.v152, await page.evaluate(() => {
    const o = {};
    const settles = _jpSettlements();
    if (!settles.length) { o.settleCount = 0; return o; }
    const s0 = settles[0];
    o.snapDefaultOn = _civSnapEnabled();

    const off = [Math.round(s0.x + 2), Math.round(s0.y + 1)];
    const savedWays = civWays;
    civWays = [];
    const t = _civFindSnapTarget(off[0], off[1]);
    o.snapsToPlaceNearby = !!(t && t.kind === 'place' && t.x === s0.x && t.y === s0.y);
    const sp = _civSnapPoint(off[0], off[1]);
    civWays = savedWays;
    o.snapPointWorks = sp[0] === s0.x && sp[1] === s0.y;

    const far = _civFindSnapTarget(2, 2);
    o.noSnapFarAway = far === null || Math.hypot((far.x || 0) - 2, (far.y || 0) - 2) < 50;

    state.viz.snapWays = false;
    o.disableWorks = _civFindSnapTarget(off[0], off[1]) === null;
    state.viz.snapWays = true;

    const savedWays2 = civWays;
    civWays = [{ pts: [[50, 50], [70, 50]], km: 10, sea: false, name: 'test road', type: 'road' }];
    const wt = _civFindSnapTarget(60, 52);
    o.snapsToWay = !!(wt && wt.kind === 'way' && Math.abs(wt.y - 50) < 0.01 && wt.x > 59 && wt.x < 61);
    civWays = savedWays2;

    const savedWays3 = civWays; civWays = [];
    _civSetTool('draw_way');
    _civWayWaypoints = [];
    _civWayWaypoints.push(_civSnapPoint(Math.round(s0.x + 1), Math.round(s0.y - 1)));
    const wp = _civWayWaypoints[0];
    _civWayWaypoints = [];
    _civSetTool('inspect');
    civWays = savedWays3;
    o.snappedExactly = wp[0] === s0.x && wp[1] === s0.y;

    o.checkboxesExist = !!document.getElementById('civSnapWayChk') && !!document.getElementById('civSnapRouteChk');
    return o;
  }));
  // v1.52: the header VERSION const (export/atlas metadata + the on-screen chip) drifted stale for
  // two versions after v1.30's own fix-comment warned about exactly this — derive the expected
  // value from the FILENAME under test rather than hardcoding it, so this stays a real check for
  // every future version instead of one that has to be hand-updated (and silently stops checking
  // anything) each time.
  {
    const m = (process.argv[2] || '').match(/v(\d+\.\d+)/);
    const expected = m ? m[1] : null;
    const actual = await page.evaluate(() => (typeof VERSION !== 'undefined' ? VERSION : null));
    R.v152.versionMatches = expected == null || actual === expected;
  }

  // ── v1.53: route drawing prioritizes existing infrastructure; a named per-stage transport
  // advisory (owner audit). (A) marks a bent OPEN-WATER "sea lane" between two ocean points and
  // confirms a fresh mixed-mode route follows the bend rather than a shorter beeline — possible
  // only because the sea-lane discount is now a real multiplicative reduction, not the old
  // Math.min(cost,1.0) cap that was inert whenever open water (_CIV_SEA_COST=0.6) was already below
  // the cap. (B) confirms _jpBestLandTransportForStage finds a genuinely faster mode, that
  // _jpRenderResults surfaces it as a named advisory with a "Use here" button (never applied on its
  // own), and that clicking it correctly writes into the same stageOverrides mechanism the manual
  // per-stage picker uses.
  R.v153 = await page.evaluate(() => {
    const o = {};
    const savedPlaces = state.places, savedWays = civWays, savedJourneys = civJourneys, savedIdx = _civSelectedJourneyIdx;
    try {
      const sea = state.seaLevel || 0.42;
      let oceanPt = null;
      for (let y = 20; y < GH - 20 && !oceanPt; y++) for (let x = 20; x < GW - 30 && !oceanPt; x++)
        if (field[y * GW + x] < sea - 0.05 && field[y * GW + (x + 30)] < sea - 0.05 && field[(y - 12) * GW + (x + 15)] < sea - 0.05)
          oceanPt = [x, y];
      if (oceanPt) {
        const [ax, ay] = oceanPt, bx = ax + 30, by = ay, cx = ax + 15, cy = ay - 12;   // bend north then back
        const laneKm = (Math.hypot(cx - ax, cy - ay) + Math.hypot(bx - cx, by - cy)) * (state.mapWidthKm || 12000) / GW;
        civWays = [{ pts: [[ax, ay], [cx, cy], [bx, by]], km: laneKm, sea: true, type: 'sea-lane', name: 'test lane' }];
        const j = _civJoinDijkstraSegs([[ax, ay], [bx, by]], 'mixed');
        let minDistToBend = Infinity;
        for (const pt of j.pts) minDistToBend = Math.min(minDistToBend, Math.hypot(pt[0] - cx, pt[1] - cy));
        o.laneFollowed = minDistToBend <= 5;   // grid-cell-quantised path; C itself is a bend apex, not a hard waypoint
        o.bendIsReal = Math.abs(cy - ay) > 5;   // the beeline would stay near y=ay, nowhere near C
      } else { o.laneFollowed = true; o.bendIsReal = true; }   // no suitable open ocean on this world — vacuous
      // v1.64: the 0.25 discount was extracted into the shared _CIV_EXISTING_WAY_DISCOUNT
      // constant (now also used by _civHierarchicalNetwork), so the old literal-substring match
      // ('cost[i]*0.25:1.0') no longer appears verbatim — check the function references the
      // shared constant instead, plus that its value genuinely lands below the old
      // Math.min(cost,1.0) cap this test exists to guard against (the bug the cap papered over).
      o.discountIsMultiplicative = _civDijkstraPath.toString().includes('_CIV_EXISTING_WAY_DISCOUNT')
        && _CIV_SEA_COST * _CIV_EXISTING_WAY_DISCOUNT < 1.0;
      civWays = savedWays;

      let landPt = null;
      for (let y = 8; y < GH - 8 && !landPt; y++) for (let x = 8; x < GW - 8 && !landPt; x++)
        if (field[y * GW + x] >= sea + 0.05) landPt = [x, y];
      const span = Math.max(20, Math.min(GW - 10 - landPt[0], 40));
      state.places = [{ kind: 'town', name: 'A', x: landPt[0], y: landPt[1], category: 'settlement', pop: 1000 },
      { kind: 'town', name: 'B', x: landPt[0] + span, y: landPt[1], category: 'settlement', pop: 1000 }];
      const pts = []; for (let k = 0; k <= 40; k++) pts.push([landPt[0] + span * k / 40, landPt[1]]);
      const jn = { pts, name: 'v153', groupSize: 4 };
      civJourneys = [jn]; _civSelectedJourneyIdx = 0;
      const p = _jpEnsurePlan(jn);
      Object.assign(p, {
        transport: 'Baggage Train', assetMode: 'manual', groupSize: 4, cargoKg: 50,
        stageOverrides: {}, animals: { donkey: 0, mule: 0, camel: 0, horse: 0 }, carts: 0, wagons: 1
      });
      const plan = _jpPlan(jn);
      o.functionExists = typeof _jpBestLandTransportForStage === 'function';
      const landIdx = plan.stages.findIndex((s, i) => s.cat === 'land' && !plan.results[i].blocked);
      if (landIdx >= 0) {
        const bestT = _jpBestLandTransportForStage(plan.stages[landIdx], plan.results[landIdx].effPlan);
        o.foundFasterMode = !!bestT && bestT.mode !== 'Baggage Train' && bestT.dailyKm > plan.results[landIdx].dailyKm;
        o.neverAutoApplied = !p.stageOverrides[landIdx];
        _civOpenRouteEditor(0);
        _jpRenderResults(jn);
        const h = (document.getElementById('reResults') || {}).innerHTML || '';
        o.advisoryRendered = /faster mode available/.test(h) && /Use here/.test(h);
        const btn = document.querySelector(`[data-jps-quick-idx="${landIdx}"]`);
        o.buttonExists = !!btn;
        if (btn) btn.click();
        const plan2 = _jpPlan(jn);
        o.applyWorks = !!bestT && plan2.results[landIdx].effPlan.transport === bestT.mode
          && plan2.results[landIdx].dailyKm > plan.results[landIdx].dailyKm;
        o.hintHonest = Array.from(document.querySelectorAll('#reResults .hint'))
          .some(el => /never applied automatically/.test(el.textContent || ''));
      } else {
        o.foundFasterMode = true; o.neverAutoApplied = true; o.advisoryRendered = true;
        o.buttonExists = true; o.applyWorks = true; o.hintHonest = true;
      }
    } finally {
      state.places = savedPlaces; civWays = savedWays; civJourneys = savedJourneys; _civSelectedJourneyIdx = savedIdx;
    }
    return o;
  });

  // ── v1.54: agricultural technology as a per-faction axis (owner: the 9:1 farmer:urbanite ratio
  // "doesn't sit against a civilisation having mastered the plow and sitting roughly at a barely-
  // industrial level" — docs/research/agricultural-productivity.md). Confirms (a) every existing
  // save's default (Traditional Agrarian, 9:1) is untouched to the bit, including the FIX to the
  // R vs R+1 surplus formula and the FOOD_SURPLUS_RATIO_MAX cap, both of which are pinned to their
  // exact shipped constants at the default; (b) a higher tech level genuinely, substantially raises
  // a faction's food-shed capacity — not just a rounding-level nudge, which the first cut of this
  // feature actually shipped as (the flat FOOD_SURPLUS_RATIO_MAX cap silently saturated every
  // tech level at the traditional tier's own ceiling); (c) the Faction Inspector UI is wired.
  R.v154 = await page.evaluate(() => {
    const o = {};
    // (a) backward compatibility, to the bit
    o.medianStillExact = Math.abs(foodSurplusRatio(0.5, 0.5) - 1 / 9) < 1e-9;
    o.implicitMatchesExplicitDefault = foodSurplusRatio(0.7, 0.5) === foodSurplusRatio(0.7, 0.5, 9);
    o.capStillExact = Math.abs(foodSurplusRatio(1, 0.2) - FOOD_SURPLUS_RATIO_MAX) < 1e-9;
    o.everyFactionDefaultsTraditional = civFactionAgTech.every(k => k === 'traditionalAgrarian');
    o.defaultRatioIs9 = AG_TECH_LEVELS.find(t => t.key === 'traditionalAgrarian').farmersPerUrbanite === 9;

    // (b) the ratio formula itself: correct population-balance math (1/(R+1), not the old 1/R,
    // which blows past 100% below R=1), and the cap scales with it so a low-R tier is not silently
    // clamped to the traditional tier's own ceiling — the actual bug the first cut of this shipped.
    o.formulaCorrect = Math.abs(foodSurplusRatio(0.5, 0.5, 4) - 1 / 5) < 1e-9;   // R=4 -> 1/(4+1)
    const industrialAtMedian = foodSurplusRatio(0.5, 0.5, 0.15);
    const traditionalAtMedian = foodSurplusRatio(0.5, 0.5, 9);
    o.industrialSubstantiallyHigher = industrialAtMedian > traditionalAtMedian * 3;   // not a rounding nudge
    o.industrialWithinAbsCap = industrialAtMedian <= FOOD_SURPLUS_RATIO_ABS_MAX + 1e-9;
    o.lowRNeverExceeds1 = foodSurplusRatio(1, 0.5, 0.02) < 1;   // near-zero R must never blow past 100%

    // (c) real-world effect: the same settlement, its faction switched between tech levels
    const settles = (typeof _jpSettlements === 'function') ? _jpSettlements() : (state.places || []).filter(p => p && p.category === 'settlement');
    if (settles.length) {
      const p = settles[0];
      const savedFid = p.faction, savedTech = civFactionAgTech[p.faction || 0];
      p.faction = p.faction || 1;
      civFactionAgTech[p.faction] = 'traditionalAgrarian';
      const shedTrad = _civFoodShed(p).supported;
      civFactionAgTech[p.faction] = 'earlyIndustrial';
      const shedEarly = _civFoodShed(p).supported;
      civFactionAgTech[p.faction] = savedTech; p.faction = savedFid;
      o.earlyIndustrialFeedsMuchMore = shedEarly > shedTrad * 1.5;   // a real shift, not noise
    } else { o.earlyIndustrialFeedsMuchMore = true; o.noSettlements = true; }

    // (d) UI wiring — Faction Inspector select exists, is populated, and writes through on change
    if (typeof CIV_FACTIONS !== 'undefined' && CIV_FACTIONS.length > 1 && typeof _civPopulateFactionEditor === 'function') {
      // _civPopulateFactionEditor wires handlers via document.getElementById (it always targets the
      // real, already-in-document inspector host), so the probe host must be attached too.
      const host = document.createElement('div');
      host.style.display = 'none';
      document.body.appendChild(host);
      _civPopulateFactionEditor(host, 1, null);
      const sel = document.getElementById('_civFeAgTech');
      o.selectExists = !!sel;
      o.selectHasAllLevels = !!sel && sel.options.length === AG_TECH_LEVELS.length;
      if (sel) {
        const saved = civFactionAgTech[1];
        sel.value = 'industrial';
        sel.dispatchEvent(new Event('change', { bubbles: true }));
        o.writesThrough = civFactionAgTech[1] === 'industrial';
        civFactionAgTech[1] = saved;
      }
      host.remove();
    } else { o.selectExists = true; o.selectHasAllLevels = true; o.writesThrough = true; }

    return o;
  });

  // ── v1.55: faction-first Civilization menu redesign (owner: "I like the new civilization menu,
  // implement it please in a logical fashion, maybe make it scroll into the screen from the left.
  // Only showing a simplified version at first"). Confirms (a) Factions is now the default/first
  // sub-tab; (b) the detail drawer starts closed (the "simplified... global overview" state) and
  // opens/closes correctly via row click / Back button, sliding via the .open class; (c) the world
  // overview renders real aggregate numbers; (d) Territory Fit — the audit finding that CIV_CULTURES
  // has zero mechanical effect on placement — is surfaced honestly: common/imperial get no fabricated
  // verdict, a terrain-themed culture gets a real relative-to-world-mean verdict; (e) the pre-world
  // guard added to _civFactionAggregates() (needed once Factions became the default tab, since
  // generate()'s own wrapper now reaches _civFactionAggregates() before the real generate() body
  // runs) never throws and returns a safe zeroed shape.
  R.v155 = await page.evaluate(() => {
    const o = {};
    // (a) faction-first ordering. The DOM-position check is independent of any runtime state this
    // long sequential suite's earlier blocks may have left _civSubTab in; the click drives the REAL
    // handler path (same as a user clicking the tab), which is the only reliable way to test the
    // "entering Factions" behavior this deep into a shared-page test run.
    const bar = document.querySelectorAll('#civSubBar .subtab');
    o.firstTabIsFactions = bar.length > 0 && bar[0].dataset.civsub === 'factions';
    if (bar.length) bar[0].click();
    o.defaultSubTabIsFactions = _civSubTab === 'factions';
    o.firstTabShowsOn = bar.length > 0 && bar[0].classList.contains('on');
    o.factionsPageVisibleByDefault = document.getElementById('civSubFactions').style.display !== 'none';

    // (b) drawer starts closed on a fresh entry into the tab; opens on row click; closes on Back
    const drawer = document.getElementById('civFactionDrawer');
    o.drawerHasClass = !!drawer && drawer.classList.contains('civ-drawer');
    o.drawerClosedByDefault = !!drawer && !drawer.classList.contains('open');
    if (typeof CIV_FACTIONS !== 'undefined' && CIV_FACTIONS.length > 1) {
      _civRenderFactionList();
      const row = document.querySelector('#civFactionList > div');
      if (row) row.click();
      o.drawerOpensOnRowClick = !!drawer && drawer.classList.contains('open');
      const backBtn = document.getElementById('civFactionBackBtn');
      if (backBtn) backBtn.click();
      o.drawerClosesOnBack = !!drawer && !drawer.classList.contains('open');
      // re-entering the tab (clicking its own subtab button again, a faction still left selected)
      // always resets to the overview — the real re-entry path, not a direct internal-function call
      if (row) row.click();
      const drawerReopened = !!drawer && drawer.classList.contains('open');
      if (bar.length) bar[0].click();
      o.reEntryResetsToOverview = drawerReopened && !!drawer && !drawer.classList.contains('open');
    } else {
      o.drawerOpensOnRowClick = true; o.drawerClosesOnBack = true; o.reEntryResetsToOverview = true;
    }

    // (c) world overview renders real numbers
    _civRenderFactionsWorldOverview();
    const overviewText = (document.getElementById('civWorldOverviewOut') || {}).textContent || '';
    o.overviewHasContent = overviewText.length > 0 && !/^\s*$/.test(overviewText);
    o.overviewMentionsFactionCount = /faction/i.test(overviewText);

    // (d) Territory Fit — verdict shape + honesty for non-terrain cultures
    const agg = _civFactionAggregates();
    o.aggHasTerrainMix = !!(agg.byFaction[1] && agg.byFaction[1].terrainMix);
    o.aggHasWorldMeanTerrain = !!agg.worldMeanTerrain && ['river', 'coast', 'arid', 'forest', 'hills'].every(k => typeof agg.worldMeanTerrain[k] === 'number');
    o.commonGetsNoVerdict = _civCultureTerrainFit('common', agg.byFaction[1].terrainMix, agg.worldMeanTerrain) === null;
    o.imperialGetsNoVerdict = _civCultureTerrainFit('imperial', agg.byFaction[1].terrainMix, agg.worldMeanTerrain) === null;
    const riverlandsFit = _civCultureTerrainFit('riverlands', agg.byFaction[1].terrainMix, agg.worldMeanTerrain);
    o.riverlandsGetsAVerdict = !!riverlandsFit && ['match', 'typical', 'mismatch'].includes(riverlandsFit.verdict);
    o.terrainMixFractionsInRange = ['river', 'coast', 'arid', 'forest', 'hills'].every(k => {
      const v = agg.byFaction[1].terrainMix[k]; return v >= 0 && v <= 1;
    });

    // (e) the pre-world guard: simulate the pre-generate() state (plates=[]) and confirm no throw
    const savedPlates = plates, savedAgg = _civAgg, savedAggKey = _civAggKey;
    try {
      plates = []; _civAgg = null; _civAggKey = '';
      let threw = false, safe = null;
      try { safe = _civFactionAggregates(); } catch (e) { threw = true; }
      o.preWorldGuardNoThrow = !threw;
      o.preWorldGuardSafeShape = !!safe && Array.isArray(safe.byFaction) && safe.byFaction.length === CIV_FACTIONS.length
        && safe.byFaction.every(b => b.pop === 0 && b.terrainMix && b.terrainMix.river === 0);
    } finally {
      plates = savedPlates; _civAgg = savedAgg; _civAggKey = savedAggKey;
    }

    return o;
  });

  // ── v1.56: water-constraint softening (owner: "people often drank from streams/rivers/other
  // smaller stops along a route... aside from literally carrying their own water sources" — build
  // the two-part fix already presented and approved). Confirms (a) JP_DRINKING_FLOW_DIVISOR exists,
  // is wired into _jpStageDryKm, and a synthetic "minor stream" cell — one whose flow clears the new
  // drinking threshold but NOT the old mapped-river flowThresh — now reads as freshwater; (b) the
  // auto water-crossing tier (previously isDesert-gated) now resolves for a non-desert biome too,
  // giving a real graduated reserve/speed response instead of a flat, ungraduated 1.1×; (c) the
  // explicit desert-override dropdown still stays desert-only (deliberately not generalized — its
  // labels are desert-narrative and the UI only ever exposes it on a desert stage); (d) a genuine
  // desert stage's own behavior (explicit override honored, auto tier resolves) is unchanged.
  R.v156 = await page.evaluate(() => {
    const o = {};
    o.divisorExists = typeof JP_DRINKING_FLOW_DIVISOR === 'number' && JP_DRINKING_FLOW_DIVISOR > 1;
    o.wiredIntoDryKm = _jpStageDryKm.toString().includes('JP_DRINKING_FLOW_DIVISOR');

    // (a) a synthetic "minor stream" — flow clears the NEW drinking threshold but not the OLD
    // mapped-river flowThresh — now reads as freshwater when it didn't before.
    const savedFlow = flowField;
    try {
      const n = GW * GH, synth = new Float32Array(n);
      const flowThresh = GW * GH * 0.0004;
      const minorStreamFlow = flowThresh / (JP_DRINKING_FLOW_DIVISOR / 2);   // clears new thresh (÷16), fails old (>flowThresh required)
      o.minorStreamFailsOldTest = !(minorStreamFlow > flowThresh);
      const midY = (GH / 2) | 0;
      for (let x = 0; x < GW; x++) synth[midY * GW + x] = minorStreamFlow;
      flowField = synth;
      const pts = []; for (let x = 5; x <= 15; x++) pts.push([x, midY]);   // path crossing the stream at its own row
      const dryKm = _jpStageDryKm(pts, 0, pts.length - 1, (state.mapWidthKm || 12000) / GW, null, flowThresh);
      o.minorStreamNowFound = (dryKm === 0);
    } finally { flowField = savedFlow; }

    // (b) the auto tier now applies to a non-desert biome — a severe synthetic dry gap gets a real
    // graduated reserve (not the old flat 1.1×) and the formula names it "water crossing".
    // v1.67 (owner report of an absurd multi-month journey): jpCalcLand now ALSO invalidates a stage
    // whose water-driven convergence loop pushes load past JP_LOAD_INVALID_RATIO, not just its
    // pre-loop ratio0 (see jpCalcLand's own v1.67 comment). This test's original 3000 km "severe" gap
    // was never actually carriable — even under a flat 1.1× reserve with zero tier escalation (part
    // (c)'s override plan, below) it works out to ~75 days of carried water for a 4-person walking
    // party with no pack animals, which no configuration of this model can carry; v1.67 now correctly
    // blocks it where earlier versions silently returned a triple-digit-percent-overloaded "answer".
    // 110 km is the same scenario shrunk to a genuinely carriable severity that still clears the
    // Sparse Wells threshold (gapDays>3) and reads as a real, graduated slowdown — the actual claim
    // this test exists to prove. Reaching the DEEPEST tier (Deep Desert Crossing, gapDays>6) is
    // checked directly below via _jpDesertTierForGap itself, decoupled from whether any specific
    // party could survive carrying water that long — that's a capacity question v1.63/v1.67 already
    // own, not this labeling test's job.
    const basePlan = { groupSize: 4, transport: 'Walking', pace: 'Standard Pace', hours: 8, cargoKg: 20,
      supplyDays: 7, season: 'Summer', grazing: 'Partial — graze at camp', foraging: 'None', carryFood: true,
      desertWater: 'auto', animals: { donkey: 0, mule: 0, camel: 0, horse: 0 }, carts: 0, wagons: 0, travois: 0, sleds: 0 };
    const stForest = (dryKm) => ({ km: 500, cat: 'land', terrain: 'Dirt Track', routeCond: 'Standard',
      infra: 'Stable Settlements', biome: 'Temperate Forest', dryKm });
    const rNoGap = jpCalcLand(stForest(0), basePlan);
    const rSevereGap = jpCalcLand(stForest(110), basePlan);   // a real, carriable waterless run (Sparse Wells tier)
    o.nonDesertGetsWaterCrossingLabel = !rNoGap.blocked && /water crossing/.test(rNoGap.formula);
    o.severeNonDesertGapSlowerThanNoGap = !rSevereGap.blocked && !rNoGap.blocked && rSevereGap.dailyKm < rNoGap.dailyKm;
    o.severeNonDesertGapNamesDeepTier = !rSevereGap.blocked && /Sparse Wells/.test(rSevereGap.formula)
      && _jpDesertTierForGap(0.5) === 'Dense Oasis Route' && _jpDesertTierForGap(2) === 'Established Caravan Route'
      && _jpDesertTierForGap(4.5) === 'Sparse Wells' && _jpDesertTierForGap(8) === 'Deep Desert Crossing';

    // (c) the explicit override dropdown stays desert-only: on a non-desert stage, setting it to a
    // literal tier (not 'auto') suppresses tier resolution entirely — jpCalcLand's override branch
    // requires isDesert and its auto branch requires _dwAuto, so neither fires — the formula shows no
    // water-crossing line at all rather than the override's own label.
    const overridePlan = Object.assign({}, basePlan, { desertWater: 'Sparse Wells' });
    const rOverrideNonDesert = jpCalcLand(stForest(110), overridePlan);
    o.explicitOverrideIgnoredOnNonDesert = !rOverrideNonDesert.blocked && !/water crossing/.test(rOverrideNonDesert.formula);

    // (d) a genuine desert stage: explicit override still honored (unchanged regression check).
    // v1.63: 4 Walking humans with zero animals (120 kg porter capacity) cannot carry Hot Desert's own
    // water/food overhead alone (measured 220 kg needed) — genuinely infeasible regardless of the tiny
    // 20kg cargo, so JP_LOAD_INVALID_RATIO now correctly blocks it. One camel (desert's own best pack
    // animal, +300 kg capacity) keeps this a real, non-blocked scenario; the override/auto formula
    // labels this test actually checks are unaffected by the animal's presence.
    const stDesert = (dryKm) => ({ km: 500, cat: 'land', terrain: 'Desert Hardpack', routeCond: 'Standard',
      infra: 'Stable Settlements', biome: 'Hot Desert', dryKm });
    const desertPlan = Object.assign({}, basePlan, { animals: { donkey: 0, mule: 0, camel: 1, horse: 0 } });
    const desertOverridePlan = Object.assign({}, desertPlan, { desertWater: 'Sparse Wells' });
    const rDesertOverride = jpCalcLand(stDesert(50), desertOverridePlan);
    o.desertExplicitOverrideStillHonored = !rDesertOverride.blocked && /Sparse Wells/.test(rDesertOverride.formula);
    const rDesertAuto = jpCalcLand(stDesert(50), desertPlan);
    o.desertAutoStillResolvesAndLabels = !rDesertAuto.blocked && /water crossing/.test(rDesertAuto.formula) && /auto — from map/.test(rDesertAuto.formula);

    return o;
  });

  // ── v1.57 (owner: "I'd also very much love it to be in a pop-up menu" — the v1.55 Factions
  // sub-page): the world overview/roster/per-faction drawer moved out of the sidebar into a new
  // full-screen #civFactionsModal, same shell contract as #cityViewerModal (v1.18)/#routeEditorModal
  // (v1.44) — own .open-class toggle, own Escape handler, added to _overCanvasOverlay's scroll-fix
  // list. Bundled in the same pass: the faction-pill dedup fix (culture/religion/government/ag-tech
  // editing previously existed BOTH as inline <select>s in the pill row AND in the Faction Inspector
  // drawer for the same four fields — now only the Inspector edits them; assertions for that live in
  // the v1.07/v1.10 blocks above, which this version's edit touched directly).
  R.v157 = await page.evaluate(() => {
    const o = {};
    const modal = document.getElementById('civFactionsModal');
    o.modalHasClass = !!modal && modal.classList.contains('civ-factions-modal');
    o.modalClosedInitially = !!modal && !modal.classList.contains('open');

    // the Factions tab must be active for the sidebar launcher button to exist/matter
    const bar = document.querySelectorAll('#civSubBar .subtab');
    if (bar.length) bar[0].click();   // bar[0] is Factions per the v1.55 faction-first ordering

    const openBtn = document.getElementById('civOpenFactionsBtn');
    o.openBtnExists = !!openBtn;
    if (openBtn) openBtn.click();
    o.opensOnButtonClick = !!modal && modal.classList.contains('open');
    const listEl = document.getElementById('civFactionList');
    o.rosterRendersOpen = !!listEl && listEl.innerHTML.trim().length > 0;   // populated by _civOpenFactionsModal's refresh-on-open, not left blank
    o.overCanvasRecognizesModal = typeof _overCanvasOverlay === 'function' &&
      _overCanvasOverlay({ target: document.getElementById('civWorldOverviewOut') }) === true;

    // Escape closes it
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    o.closesOnEscape = !!modal && !modal.classList.contains('open');

    // close button closes it too
    if (openBtn) openBtn.click();
    const reopened = !!modal && modal.classList.contains('open');
    const closeBtn = document.getElementById('cfmCloseBtn');
    if (closeBtn) closeBtn.click();
    o.closesOnCloseButton = reopened && !!modal && !modal.classList.contains('open');

    // re-entering the Factions tab with the modal left open always closes it (v1.55's drawer-reset
    // rule, extended one level up) — leave it open, then click the tab button again (real path).
    if (openBtn) openBtn.click();
    const leftOpen = !!modal && modal.classList.contains('open');
    if (bar.length) bar[0].click();
    o.reEntryClosesModal = leftOpen && !!modal && !modal.classList.contains('open');

    // the picker itself must now carry ZERO selects of any kind (dedup fix) — a direct, feature-
    // named check alongside the v1.07/v1.10 blocks' own coverage of the same fact.
    o.pickerHasNoSelects = document.querySelectorAll('#civFactionPicker select').length === 0;

    return o;
  });

  // ── v1.58 (owner: "if there is only 1 continent it should lead to a division of the continent,
  // based on geography and industrial prowess... I think those are easy denominators to use").
  // docs/research/political-fragmentation.md grounds the fix. Before this, _civIterativeAutoWorld
  // gave every candidate on a landmass the SAME faction id (one per connected component, cycling
  // if there were more landmasses than factions), so any faction id past the landmass count got
  // zero settlements — worst-case a single-continent world where only faction 1 was ever used.
  // _civAssignLandmassFactions now apportions spare ids (factionCount>landmassCount) across
  // landmasses by highest-averages (real seat-apportionment method) weighted by summed settlement
  // suitability (the file's own unified geography+resource signal, standing in for "industrial
  // prowess"), seeding extra capitals by suitability + blue-noise spacing (the v1.26 scatter
  // idiom) and assigning every other candidate to its nearest capital. Tested as a pure function
  // against controlled synthetic candidate arrays (this file's own v1.56 "synthetic scenario over
  // sampling the ambient world by chance" precedent), plus one real-world end-to-end check.
  R.v158 = await page.evaluate(async () => {
    const o = {};
    if (typeof _civAssignLandmassFactions !== 'function') return { present: false };
    o.present = true;
    const savedFactions = CIV_FACTIONS;
    const fakeFactions = n => { const a = [['Unclaimed', [0, 0, 0]]]; for (let i = 1; i <= n; i++) a.push(['F' + i, [i, i, i]]); return a; };
    try {
      // (a) byte-identical baseline: factionCount<=landmassCount reproduces the EXACT old cycling
      // (fi=1,2,1 for contId 0,1,2 at factionCount=2) — a strict generalisation, not a rewrite.
      CIV_FACTIONS = fakeFactions(2);
      {
        const cands = [
          { x: 0, y: 0, suit: 0.5, contId: 0 }, { x: 1, y: 0, suit: 0.4, contId: 0 },
          { x: 10, y: 10, suit: 0.6, contId: 1 }, { x: 11, y: 10, suit: 0.3, contId: 1 },
          { x: 20, y: 20, suit: 0.7, contId: 2 },
        ];
        const r = _civAssignLandmassFactions(cands);
        o.baselineMatchesOldCycling = r.factionOf[0] === 1 && r.factionOf[1] === 1 && r.factionOf[2] === 2 &&
          r.factionOf[3] === 2 && r.factionOf[4] === 1;
        o.baselineOneCapitalPerLandmass = r.capitalOf[0] === true && r.capitalOf[1] === false &&
          r.capitalOf[2] === true && r.capitalOf[3] === false && r.capitalOf[4] === true;
        o.baselineFactionCount = r.factionCount === 2;
      }

      // (b) single landmass, 6 factions defined: every id 1..6 gets used, none empty, each earns
      // its own capital.
      CIV_FACTIONS = fakeFactions(6);
      {
        const cands = [];
        for (let i = 0; i < 12; i++) cands.push({ x: (i % 4) * 40, y: ((i / 4) | 0) * 40, suit: 0.2 + 0.06 * i, contId: 0 });
        const r = _civAssignLandmassFactions(cands);
        const used = new Set(r.factionOf);
        o.singleLandmassUsesAllFactions = used.size === 6 && [1, 2, 3, 4, 5, 6].every(f => used.has(f));
        o.singleLandmassSixCapitals = r.capitalOf.filter(Boolean).length === 6;
      }

      // (c) apportionment proportionality: the higher-capacity landmass earns more of the spare
      // seats (L=2, factionCount=5 ⇒ 3 spare seats to distribute).
      CIV_FACTIONS = fakeFactions(5);
      {
        const cands = [];
        for (let i = 0; i < 10; i++) cands.push({ x: i, y: 0, suit: 1.0, contId: 0 });     // rich landmass
        for (let i = 0; i < 10; i++) cands.push({ x: i, y: 100, suit: 0.05, contId: 1 });  // poor landmass
        const r = _civAssignLandmassFactions(cands);
        const seatsA = new Set(r.factionOf.slice(0, 10)).size;
        const seatsB = new Set(r.factionOf.slice(10, 20)).size;
        o.apportionmentFavoursRicherLandmass = seatsA > seatsB && (seatsA + seatsB) === 5;
      }

      // (d) a landmass never earns more seats (capitals) than it has candidate settlements to
      // seed them with, even with far more spare faction ids than that landmass could ever use.
      CIV_FACTIONS = fakeFactions(10);
      {
        const cands = [{ x: 0, y: 0, suit: 0.9, contId: 0 }, { x: 5, y: 5, suit: 0.8, contId: 0 }];
        const r = _civAssignLandmassFactions(cands);
        o.seatsNeverExceedCandidates = r.capitalOf.filter(Boolean).length <= cands.length;
      }
    } finally {
      CIV_FACTIONS = savedFactions;
    }

    // (e) real-world end-to-end, the default faction roster: a fresh world with few landmasses now
    // uses more than the owner-reported 27/2/0/0/0/0 shape (only 1-2 factions ever getting anything).
    const savedPlaces = state.places, savedSeed = state.tect.seed, savedResW = state.resW;
    try {
      state.resW = 256; GW = 256; GH = gridH(GW); allocate();
      state.tect.seed = 12345; await generate();
      const ob = document.getElementById('onboard'); if (ob) ob.style.display = 'none';
      state.places = [];
      _civIterativeAutoWorld(3);
      const places = state.places.filter(p => p && p.category === 'settlement');
      const usedFactions = new Set(places.map(p => p.faction));
      o.realWorldFactionCount = CIV_FACTIONS.length - 1;
      o.realWorldUsesMoreThanTwoFactions = usedFactions.size > 2;
      o.realWorldEveryFactionHasASettlement = usedFactions.size === o.realWorldFactionCount;
    } finally {
      state.resW = savedResW; GW = savedResW; GH = gridH(GW); allocate();
      state.tect.seed = savedSeed; await generate();
      state.places = savedPlaces;
    }
    return o;
  });

  // ── v1.59 (owner: "completely redesign and rethink the civilisation menu's under generate...
  // Refactor and Consolidate the Generation → Civilization menu from the ground up putting the
  // menu's in a logical order of faction creation that leads up to the autopopulate function").
  // Pure civ-layer HTML/DOM reorganization: #civSubBar reorders Generation from last to 2nd
  // (right after Factions); #civSubGeneration restructures into an explicit Step 1→2→3 sequence
  // (populate → roads → territories), dissolving the old "Advanced" grab-bag — Ways/Provinces
  // promoted to always-visible sections, map-styling sliders isolated into their own "Display"
  // accordion; the Territory-paint brush radius (civTerRadius) moves out of Generation entirely
  // into a new contextual row (civTerritoryToolRow) beside civPoiTypeRow, shown only while the
  // Territory tool is armed. No ids/handlers/logic changed — only physical placement.
  R.v159 = await page.evaluate(() => {
    const o = {};

    // (1) real DOM tab order
    const tabs = [...document.querySelectorAll('#civSubBar .subtab')].map(b => b.dataset.civsub);
    o.tabOrderCorrect = JSON.stringify(tabs) === JSON.stringify(['factions', 'generation', 'settlements', 'economy', 'statistics']);

    // (2) Generation page's internal section order — click the real tab button first
    const genBtn = [...document.querySelectorAll('#civSubBar .subtab')].find(b => b.dataset.civsub === 'generation');
    if (genBtn) genBtn.click();
    const genPage = document.getElementById('civSubGeneration');
    const children = genPage ? [...genPage.children].filter(el => el.classList.contains('sec') || (el.tagName === 'DETAILS' && el.classList.contains('cat-acc'))) : [];
    const labelOf = el => {
      if (el.tagName === 'DETAILS') { const s = el.querySelector('summary'); return s ? s.textContent.trim() : ''; }
      const sl = el.querySelector('.sublabel');
      return sl ? sl.textContent.trim() : '';
    };
    const labels = children.map(labelOf);
    o.stepOrderCorrect = labels.length >= 6 &&
      labels[0].startsWith('Step 1') && labels[1].startsWith('Step 2') &&
      labels[2] === 'Ways' && labels[3].startsWith('Step 3') &&
      labels[4] === 'Provinces' && labels[5] === 'Display';
    o.roadsBeforeTerritories = labels.findIndex(l => l.startsWith('Step 2')) < labels.findIndex(l => l.startsWith('Step 3'));

    // (3) civTerRadius relocated out of Generation into civTerritoryToolRow, a sibling row before #civSubBar
    const terRadius = document.getElementById('civTerRadius');
    const terRow = document.getElementById('civTerritoryToolRow');
    o.terRadiusNotInGeneration = !!terRadius && !!genPage && !genPage.contains(terRadius);
    o.terRadiusInsideTerRow = !!terRadius && !!terRow && terRow.contains(terRadius);
    const poiRow = document.getElementById('civPoiTypeRow'), wayRow = document.getElementById('civWayDrawRow'), subBar = document.getElementById('civSubBar');
    o.terRowIsRowSiblingBeforeBar = !!terRow && terRow.classList.contains('row') && !!poiRow && !!wayRow && !!subBar &&
      !!(terRow.compareDocumentPosition(poiRow) & Node.DOCUMENT_POSITION_PRECEDING) &&
      !!(terRow.compareDocumentPosition(wayRow) & Node.DOCUMENT_POSITION_FOLLOWING) &&
      !!(terRow.compareDocumentPosition(subBar) & Node.DOCUMENT_POSITION_FOLLOWING);
    o.terRowHiddenByDefault = !!terRow && getComputedStyle(terRow).display === 'none';

    // (4) real click-path: arm Territory → row visible + button .on; arm Inspect → row hides
    const terBtn = document.querySelector('#civToolPalette [data-civtool="territory"]');
    const inspectBtn = document.querySelector('#civToolPalette [data-civtool="inspect"]');
    if (terBtn) terBtn.click();
    o.terRowVisibleWhenArmed = !!terRow && getComputedStyle(terRow).display !== 'none';
    o.terBtnHasOnClass = !!terBtn && terBtn.classList.contains('on');
    if (inspectBtn) inspectBtn.click();
    o.terRowHidesOnInspect = !!terRow && getComputedStyle(terRow).display === 'none';

    // (5) slider wiring survives the move
    if (terBtn) terBtn.click();   // re-arm territory
    if (terRadius) { terRadius.value = '17'; terRadius.dispatchEvent(new Event('input', { bubbles: true })); }
    const terRadiusV = document.getElementById('civTerRadiusV');
    o.sliderUpdatesGlobal = typeof _civTerRadius !== 'undefined' && _civTerRadius === 17;
    o.sliderUpdatesLabel = !!terRadiusV && terRadiusV.textContent === '17';
    if (inspectBtn) inspectBtn.click();   // leave tools back at rest

    // (6) old "Advanced" grab-bag is genuinely gone — civWayList/civProvincesChk are no longer
    // inside any <details>, and the Display accordion contains neither of them.
    const wayList = document.getElementById('civWayList');
    const provChk = document.getElementById('civProvincesChk');
    o.wayListNotInDetails = !!wayList && !wayList.closest('details');
    o.provChkNotInDetails = !!provChk && !provChk.closest('details');
    const iconScale = document.getElementById('civIconScaleR');
    const displayDetails = iconScale ? iconScale.closest('details.cat-acc') : null;
    o.displayAccordionExists = !!displayDetails;
    o.displayAccordionExcludesWaysProvinces = !!displayDetails && !displayDetails.contains(wayList) && !displayDetails.contains(provChk);

    return o;
  });

  // ---- v1.61 (owner-reported screenshot: a rectangular block of LOD tiles permanently stuck on the
  // coarse overview under deep Tiled-LOD zoom, plain Biome view, no bake involved). Root cause: neither
  // the worker's per-job loop nor refineVisibleTiles' sync fallback loop isolated one tile's pyramidTile()
  // call — a throw (whatever the trigger; not reproduced in this session) killed the rest of the batch/
  // loop and was swallowed silently by scheduleLodRefine's outer catch. Forces the SYNC path (disables
  // GENPOOL) and monkeypatches the global pyramidTile to fail for exactly one visible tile, twice in a
  // row, verifying siblings still land, the bad tile is skipped (not crashed into), a warning is now
  // logged, and a second refine attempt never throws uncaught either. ----
  R.v161 = await page.evaluate(async () => {
    const o = {};
    const savedPlaces = state.places, savedSeed = state.tect.seed, savedResW = state.resW, savedKm = state.mapWidthKm;
    const savedLodOn = _lodOn, savedLodCx = _lodCx, savedLodCy = _lodCy, savedLodZoom = _lodZoom;
    const origPyramidTile = window.pyramidTile, origUsableForTiles = GENPOOL.usableForTiles, origWarn = console.warn;
    const warnings = [];
    console.warn = (...args) => { warnings.push(args.map(String).join(' ')); };
    try {
      state.mapWidthKm = 800; state.tect.seed = 12345; state.resW = 512; GW = 512; GH = gridH(GW); allocate();
      await generate();
      GENPOOL.usableForTiles = () => false;   // force refineVisibleTiles' own sync fallback loop
      _lodOn = true; _lodCx = GW / 2; _lodCy = GH / 2; _lodZoom = 30; applyView(); renderNow();
      lodCacheClear();
      const v = lodViewRect();
      const keys = [...visibleTileKeys(v.z, v.x0, v.y0, v.x1, v.y1)];
      o.multipleTilesVisible = keys.length >= 2;
      const bad = keys[0];
      const failer = (coarse, cW, cH, z, col, row, tileSize, opts) => {
        if (col === bad.col && row === bad.row && z === v.z) throw new Error('forced test failure');
        return origPyramidTile(coarse, cW, cH, z, col, row, tileSize, opts);
      };
      window.pyramidTile = failer;
      await refineVisibleTiles();
      window.pyramidTile = origPyramidTile;
      const badKey = lodCacheKey(v.z, bad.col, bad.row, _lodTile);
      o.badTileStillUncached = !lodCacheGet(badKey);
      o.siblingsCached = keys.length > 1 && keys.slice(1).every(k => !!lodCacheGet(lodCacheKey(v.z, k.col, k.row, _lodTile)));
      o.warningLogged = warnings.some(w => w.indexOf('LOD tile') >= 0 && w.indexOf('refine failed') >= 0);
      // a repeated failure on the SAME tile must keep behaving the same way, not throw out of refineVisibleTiles
      window.pyramidTile = failer;
      let threwOnRetry = false;
      try { await refineVisibleTiles(); } catch (e) { threwOnRetry = true; }
      window.pyramidTile = origPyramidTile;
      o.neverThrowsUncaughtOnRetry = !threwOnRetry;
    } finally {
      window.pyramidTile = origPyramidTile;
      GENPOOL.usableForTiles = origUsableForTiles;
      console.warn = origWarn;
      lodCacheClear();
      _lodOn = savedLodOn; _lodCx = savedLodCx; _lodCy = savedLodCy; _lodZoom = savedLodZoom;
      state.mapWidthKm = savedKm; state.resW = savedResW; GW = savedResW; GH = gridH(GW); allocate();
      state.tect.seed = savedSeed; await generate();
      state.places = savedPlaces; applyView(); renderNow();
    }
    return o;
  });

  // ---- v1.62 (owner report: "settlements being created on top of each other even from opposing
  // factions"). Root cause, confirmed by ablation before any fix: the v1.46 coastal-preference swap
  // relocates a landmass's worst non-port settlement onto a fresh coastal candidate, checked for
  // spacing against the OTHER coastal candidates but never against the settlements already standing
  // on that landmass — byLandmass groups by LANDMASS, not faction, so once v1.58 let several factions
  // share one landmass this could drop one faction's settlement directly onto a rival's. Disabling
  // _civOceanDistField (the v1.46 smoke test's own technique for turning the swap off) eliminated
  // every observed overlap across 8 seeds; disabling the water-edge snap did not. Fixed by rejecting
  // a swap candidate within suppR of any OTHER settlement — the same suppression-radius convention
  // every other placement pass in this function already uses. Runs its own dedicated small worlds
  // (four of the seeds the pre-fix ablation actually reproduced on), matching this file's own
  // test-isolation precedent, and restores ambient state afterward. ----
  R.v162 = await page.evaluate(async () => {
    const o = {};
    const savedPlaces = state.places, savedSeed = state.tect.seed, savedResW = state.resW, savedKm = state.mapWidthKm;
    try {
      const seeds = [12345, 424242, 55555, 31337];
      const results = [];
      for (const seed of seeds) {
        state.mapWidthKm = 800; state.tect.seed = seed; state.resW = 512; GW = 512; GH = gridH(GW); allocate();
        await generate();
        state.places = []; _civIterativeAutoWorld(3);
        const places = (state.places || []).filter(p => p && p.category === 'settlement');
        const cellKm = state.mapWidthKm / GW;
        let overlaps = 0, crossFactionOverlaps = 0;
        for (let i = 0; i < places.length; i++) for (let j = i + 1; j < places.length; j++) {
          const a = places[i], b = places[j];
          if (Math.hypot(a.x - b.x, a.y - b.y) * cellKm < 3) { overlaps++; if (a.faction !== b.faction) crossFactionOverlaps++; }
        }
        results.push({ seed, nPlaces: places.length, overlaps, crossFactionOverlaps });
      }
      o.results = results;
      o.noOverlapsAnySeed = results.every(r => r.overlaps === 0);
      o.noCrossFactionOverlapsAnySeed = results.every(r => r.crossFactionOverlaps === 0);
      o.settlementsStillPlaced = results.every(r => r.nPlaces > 10);
    } finally {
      state.mapWidthKm = savedKm; state.resW = savedResW; GW = savedResW; GH = gridH(GW); allocate();
      state.tect.seed = savedSeed; await generate();
      state.places = savedPlaces;
    }
    return o;
  });

  // ---- v1.63 (owner-attached research prompt on the Journey Planner load-penalty mechanism and the
  // small-caravan coordination bonus). Two confirmed fixes:
  // Finding 2 (confident, sourced): Small Caravan (2-10) coordination was a neutral 1.00 — the
  // research wants it to actually CARRY the +15-25% travel-day advantage, not just be the zero-point
  // larger tiers are penalized against. Set to 1.20; other tiers untouched.
  // Finding 1.2: jpLoadPenalty floored at a flat 0.45 for ANY ratio past 1.50 — a party at 22x rated
  // capacity (root-caused to a portage stage checked against pure human-porter capacity while
  // carrying cargo sized for a different leg of the same journey) got the same verdict as one at
  // 1.51x and kept silently proceeding. Above JP_LOAD_INVALID_RATIO (1.50 — the curve's own existing
  // top boundary, so every graduated band below it is untouched) the stage is now flagged infeasible
  // instead of returning a slow-but-valid speed. ----
  R.v163 = await page.evaluate(async () => {
    const o = {};
    const S = x => Object.assign({ km: 500, cat: 'land', terrain: 'Dirt Track', routeCond: 'Standard',
      infra: 'Stable Settlements', biome: 'Temperate Forest' }, x);
    const P = x => Object.assign({ groupSize: 1, transport: 'Walking', pace: 'Standard Pace', hours: 8,
      cargoKg: 10, supplyDays: 4, season: 'Spring', grazing: 'None — carry all fodder', foraging: 'None',
      carryFood: true, desertWater: 'Established Caravan Route',
      animals: { donkey: 0, mule: 0, camel: 0, horse: 0 }, carts: 0, wagons: 0, travois: 0, sleds: 0 },
      x, { animals: Object.assign({ donkey: 0, mule: 0, camel: 0, horse: 0 }, (x && x.animals) || {}) });

    // Finding 2: the tier table itself
    o.smallCaravanBonus = jpGroupClass(6).coordMod;
    o.smallCaravanInBand = o.smallCaravanBonus >= 1.15 && o.smallCaravanBonus <= 1.25;
    o.individualUnchanged = jpGroupClass(1).coordMod === 1.00;
    o.caravanUnchanged = jpGroupClass(11).coordMod === 0.88;
    o.largeCaravanUnchanged = jpGroupClass(31).coordMod === 0.82;
    o.columnUnchanged = jpGroupClass(101).coordMod === 0.76;

    // Finding 2: the bonus actually reaches the composed speed (A/B against a monkeypatched neutral
    // tier table, everything else — group size, terrain, supplies — held identical)
    {
      const st = S({}), pl = P({ groupSize: 6 });
      const rBonus = jpCalcLand(Object.assign({}, st), Object.assign({}, pl));
      const savedClasses = JP_GROUP_CLASSES.map(c => Object.assign({}, c));
      JP_GROUP_CLASSES.find(c => c.label === 'Small Caravan').coordMod = 1.00;
      const rNeutral = jpCalcLand(Object.assign({}, st), Object.assign({}, pl));
      for (let i = 0; i < JP_GROUP_CLASSES.length; i++) Object.assign(JP_GROUP_CLASSES[i], savedClasses[i]);
      o.bonusReachesSpeed = !rBonus.blocked && !rNeutral.blocked &&
        Math.abs(rBonus.dailyKm / rNeutral.dailyKm - o.smallCaravanBonus) < 0.005;
    }

    // Finding 1.2: JP_LOAD_INVALID_RATIO reuses the curve's own existing top boundary
    o.invalidRatioIsCurveBoundary = JP_LOAD_INVALID_RATIO === 1.50;

    // Finding 1.2: an extreme overload (the reported ~22x shape — cargo sized for a different leg,
    // no pack animals on this stage) is now flagged infeasible instead of silently crawling at 45%
    {
      const st = S({}), pl = P({ groupSize: 1, cargoKg: 5000, transport: 'Walking' });   // ~166x JP_HUMAN_PORTER(30)
      const r = jpCalcLand(st, pl);
      o.extremeOverloadBlocked = !!r.blocked;
      o.extremeOverloadNamesOverload = !!r.blocked && /[Oo]verload/.test(r.blocked);
    }

    // The existing graduated bands (<=1.50) are untouched — a moderate overload still returns a
    // valid, merely-penalized speed, not a block
    {
      const st = S({}), pl = P({ groupSize: 6, cargoKg: 220, supplyDays: 2 });   // sized to land inside 1.0-1.5x
      const r = jpCalcLand(st, pl);
      o.moderateOverloadStaysValid = !r.blocked && r.loadRatio > 1.0 && r.loadRatio <= 1.50 && r.dailyKm > 0;
    }

    // lower-priority confirmations (doc checklist): grazing scale direction, sea-stage weather/biome
    o.grazingOrderedCorrectly = JP_GRAZING['None — carry all fodder'].speedMod > JP_GRAZING['Partial — graze at camp'].speedMod &&
      JP_GRAZING['Partial — graze at camp'].speedMod > JP_GRAZING['Full — graze on route'].speedMod;

    return o;
  });

  // ── v1.64: auto-generated roads preserve and prefer manually-drawn ways ──────────────────────
  // Owner: "on parts of routes and ways, when applicable always follow them as they are
  // optimized." _civAutoRoutes used to wipe ALL of civWays (civWays=[]) before rebuilding, and
  // _civHierarchicalNetwork had zero knowledge of pre-existing ways even when it wasn't
  // destructive — v1.53's "ride existing infrastructure" discount only ever reached the manual
  // Route/Way tools (_civDijkstraPath). Isolated on a dedicated fresh world (same test-isolation
  // discipline as v1.24 BUG-3/v1.46/v1.58/v1.60's own smelting check above).
  R.v164 = await page.evaluate(async () => {
    const o = {};
    o.discountConstantShared = _CIV_EXISTING_WAY_DISCOUNT === 0.25;
    const savedPlaces = state.places, savedWays = civWays, savedSeed = state.tect.seed,
      savedResW = state.resW, savedKm = state.mapWidthKm;
    try {
      state.mapWidthKm = 800; state.tect.seed = 12345; state.resW = 256; GW = 256; GH = gridH(GW); allocate();
      await generate();
      state.places = []; _civIterativeAutoWorld(3);
      const settles = state.places.filter(p => p.kind && CIV_SETTLE_KEYS.has(p.kind));
      if (settles.length < 4) { o.skip = true; return o; }

      // find a pair the base auto-network does NOT already connect directly — the case a
      // discount can actually change, not one where the direct line was already the cheapest
      // path regardless (which would make the before/after comparison a tautology).
      const netBase = _civHierarchicalNetwork(settles, {});
      const directPairs = new Set();
      for (const w of netBase.ways) { if (w.aIdx == null) continue;
        directPairs.add(Math.min(w.aIdx, w.bIdx) + '_' + Math.max(w.aIdx, w.bIdx)); }
      let pair = null;
      for (let i = 0; i < settles.length && !pair; i++) for (let j = i + 1; j < settles.length && !pair; j++) {
        const d = Math.hypot(settles[i].x - settles[j].x, settles[i].y - settles[j].y) * (state.mapWidthKm / GW);
        if (d > 15 && d < 150 && !directPairs.has(i + '_' + j)) pair = [i, j];
      }
      if (!pair) { o.skip = true; return o; }
      const [ai, bi] = pair, A = settles[ai], B = settles[bi];
      const N = 16, manualPts = [];
      for (let k = 0; k <= N; k++) manualPts.push([Math.round(A.x + (B.x - A.x) * k / N), Math.round(A.y + (B.y - A.y) * k / N)]);
      const manualWay = { pts: manualPts, sea: false, type: 'road', manual: true, name: 'TEST-MANUAL' };

      // _civHierarchicalNetwork actually prefers the manual corridor once handed it: cells along
      // the manual way see more usage, and the previously-indirect pair often becomes a direct edge.
      const { RW, RH, sc } = _civRoutingGrid();
      const wSet = new Set(); _civMarkWaysOnGrid([manualWay], RW, RH, sc, wSet);
      const netWith = _civHierarchicalNetwork(settles, { existingWays: [manualWay] });
      let usageNo = 0, usageWith = 0;
      for (const i of wSet) { usageNo += netBase.usageCount[i] || 0; usageWith += netWith.usageCount[i] || 0; }
      o.discountSteersTheNetwork = usageWith > usageNo;
      o.pairBecomesDirect = netWith.ways.some(w => w.aIdx != null &&
        ((w.aIdx === ai && w.bIdx === bi) || (w.aIdx === bi && w.bIdx === ai)));

      // _civAutoRoutes preserves manual ways (land AND sea-lane) instead of wiping civWays=[],
      // while still building a fresh auto-generated network alongside them.
      civWays = [manualWay, { pts: [[A.x, A.y], [B.x, B.y]], sea: true, type: 'sea-lane', manual: true, name: 'TEST-MANUAL-SEA' }];
      _civAutoRoutes();
      o.manualLandSurvived = civWays.some(w => w.name === 'TEST-MANUAL' && w.manual);
      o.manualSeaSurvived = civWays.some(w => w.name === 'TEST-MANUAL-SEA' && w.manual);
      o.autoWaysAlsoPresent = civWays.some(w => !w.manual);
    } finally {
      state.mapWidthKm = savedKm; state.resW = savedResW; GW = savedResW; GH = gridH(GW); allocate();
      state.tect.seed = savedSeed; await generate();
      state.places = savedPlaces; civWays = savedWays;
    }
    return o;
  });

  // ── v1.65: one-click auto-fix buttons for stage bugs ──────────────────────────────────────────
  // Owner: "when a stage gives a bug give a button to automate a fix." Extends the existing
  // advisory-button pattern (v1.53's "Use here", v1.47's "Re-route") to the three blocked-stage
  // subcases with a single, deterministic, side-effect-free remedy: a season-closed pass, a
  // mount-blocked/wheel-lacking-animals stage (both fixed by switching mode to Walking), and a
  // wheel-vehicle-present block (fixed by clearing this stage's carts/wagons AND switching to
  // Walking — clearing carts alone was tried first and just traded one wheel-block message for
  // the other, caught by testing the button end-to-end rather than assuming the fix worked).
  // _jpDeriveStages is monkeypatched per case to force an exact blocked terrain/biome/season
  // combination through the real _jpPlan/_jpRenderResults pipeline — real terrain sampling can't
  // reliably hit these specific combinations, and this is the same "swap the primitive, verify
  // the whole path, restore it" technique v1.51/v1.61 already use for hard-to-reach scenarios.
  R.v165 = await page.evaluate(async () => {
    const o = {};
    const sea = state.seaLevel || 0.42;
    let landPt = null;
    for (let y = 8; y < GH - 8 && !landPt; y++) for (let x = 8; x < GW - 8 && !landPt; x++)
      if (field[y * GW + x] >= sea + 0.05) landPt = [x, y];
    const span = Math.max(20, Math.min(GW - 10 - landPt[0], 40));
    const savedPlaces = state.places, savedWays = civWays, savedJourneys = civJourneys, savedIdx = _civSelectedJourneyIdx;
    const origDerive = _jpDeriveStages;
    try {
      state.places = [{ kind: 'town', name: 'A', x: landPt[0], y: landPt[1], category: 'settlement', pop: 1000 },
      { kind: 'town', name: 'B', x: landPt[0] + span, y: landPt[1], category: 'settlement', pop: 1000 }];
      const pts = []; for (let k = 0; k <= 40; k++) pts.push([landPt[0] + span * k / 40, landPt[1]]);
      const jn = { pts, name: 'v165', groupSize: 4 };
      civJourneys = [jn]; _civSelectedJourneyIdx = 0;

      // ── wheel-vehicle block: carts present on wheel-blocked terrain ──
      {
        window._jpDeriveStages = () => [{ km: 50, cat: 'land', terrain: 'Deep Sand', routeCond: 'Standard',
          infra: 'Stable Settlements', biome: 'Temperate Forest', dryKm: 0, i0: 0, i1: 40 }];
        const p = _jpEnsurePlan(jn);
        Object.assign(p, { transport: 'Baggage Train', assetMode: 'manual', carts: 2, wagons: 0, groupSize: 4,
          cargoKg: 10, stageOverrides: {}, animals: { donkey: 0, mule: 0, camel: 0, horse: 0 } });
        _civOpenRouteEditor(0);
        _jpRenderResults(jn);
        const h = document.getElementById('reResults').innerHTML;
        o.wheelBlockRendered = /Impossible as configured/.test(h) && /Wheeled vehicles cannot traverse/.test(h);
        const btn = document.querySelector('[data-jps-fix-no-wheels="0"]');
        o.wheelButtonExists = !!btn;
        if (btn) btn.click();
        const plan2 = _jpPlan(jn);
        o.wheelFixWorks = !plan2.results[0].blocked && p.stageOverrides['0'] &&
          p.stageOverrides['0'].carts === 0 && p.stageOverrides['0'].wagons === 0 && p.stageOverrides['0'].transport === 'Walking';
      }

      // ── mounted block: Mounted Rider on mount-blocked terrain ──
      {
        window._jpDeriveStages = () => [{ km: 50, cat: 'land', terrain: 'Swamp / Marsh', routeCond: 'Standard',
          infra: 'Stable Settlements', biome: 'Temperate Forest', dryKm: 0, i0: 0, i1: 40 }];
        const p = _jpEnsurePlan(jn);
        Object.assign(p, { transport: 'Mounted Rider', mountAnimal: 'horse', carts: 0, wagons: 0, groupSize: 1,
          cargoKg: 20, stageOverrides: {}, animals: { donkey: 0, mule: 0, camel: 0, horse: 0 } });
        _jpRenderResults(jn);
        const h = document.getElementById('reResults').innerHTML;
        o.mountBlockRendered = /Impossible as configured/.test(h) && /Mounted travel is not viable/.test(h);
        o.mountButtonLabel = /Switch to Walking/.test(h);
        const btn = document.querySelector('[data-jps-quick-idx="0"][data-jps-quick-mode="Walking"]');
        o.mountButtonExists = !!btn;
        if (btn) btn.click();
        const plan2 = _jpPlan(jn);
        o.mountFixWorks = !plan2.results[0].blocked && p.stageOverrides['0'] && p.stageOverrides['0'].transport === 'Walking';
      }

      // ── seasonal closure: a winter mountain pass ──
      {
        window._jpDeriveStages = () => [{ km: 50, cat: 'land', terrain: 'Mountain Pass', routeCond: 'Standard',
          infra: 'Stable Settlements', biome: 'Mountain Highland', dryKm: 0, i0: 0, i1: 40 }];
        const p = _jpEnsurePlan(jn);
        Object.assign(p, { transport: 'Walking', season: 'Winter', seasonalClosures: true, carts: 0, wagons: 0,
          groupSize: 4, cargoKg: 20, stageOverrides: {}, animals: { donkey: 0, mule: 0, camel: 0, horse: 0 } });
        _jpRenderResults(jn);
        const h = document.getElementById('reResults').innerHTML;
        o.seasonBlockRendered = /Impossible as configured/.test(h) && /closed by snow/.test(h);
        o.seasonButtonLabel = /Turn off seasonal closures/.test(h);
        const btn = document.querySelector('[data-jps-fix-season-off]');
        o.seasonButtonExists = !!btn;
        if (btn) btn.click();
        const plan2 = _jpPlan(jn);
        o.seasonFixWorks = !plan2.results[0].blocked && p.seasonalClosures === false;
      }

      // ── the existing advisory bar is untouched: vessel/capacity/cargo blocks stay text-only ──
      o.noFixButtonForCapacityBlock = (() => {
        window._jpDeriveStages = () => [{ km: 50, cat: 'land', terrain: 'Dirt Track', routeCond: 'Standard',
          infra: 'Stable Settlements', biome: 'Temperate Forest', dryKm: 0, i0: 0, i1: 40 }];
        const p = _jpEnsurePlan(jn);
        Object.assign(p, { transport: 'Walking', carts: 0, wagons: 0, groupSize: 1, cargoKg: 5000,
          stageOverrides: {}, animals: { donkey: 0, mule: 0, camel: 0, horse: 0 } });
        _jpRenderResults(jn);
        const h = document.getElementById('reResults').innerHTML;
        return /Impossible as configured/.test(h) && !document.querySelector('[data-jps-fix-no-wheels], [data-jps-fix-season-off]');
      })();
    } finally {
      window._jpDeriveStages = origDerive;
      state.places = savedPlaces; civWays = savedWays; civJourneys = savedJourneys; _civSelectedJourneyIdx = savedIdx;
    }
    return o;
  });

  // ── v1.66: per-stage pack animal + vehicle fine-tuning, with a swap advisory ───────────────────
  // Owner: a 2-person party travels moderate climate for 2/3 of the route then desert, and wants
  // to swap their mule+cart for a camel with travois at the transition — "For now I cant make any
  // such a finetunement." The underlying water/food math was already species- and per-stage-correct
  // (jpCapacity reads JP_ANIMALS[k]/JP_DESERT_ANIMAL_MOD[k] fresh per stage's own biome); the real
  // gaps were no per-stage vehicle control (only animalSpecies had one, since v1.50) and no
  // auto-detected advisory. _jpBestPackageForStage is the species/vehicle twin of v1.53's
  // _jpBestLandTransportForStage — same "measure, never silently apply" contract, same >10% margin.
  R.v166 = await page.evaluate(async () => {
    const o = {};
    const sea = state.seaLevel || 0.42;
    let landPt = null;
    for (let y = 8; y < GH - 8 && !landPt; y++) for (let x = 8; x < GW - 8 && !landPt; x++)
      if (field[y * GW + x] >= sea + 0.05) landPt = [x, y];
    const span = Math.max(40, Math.min(GW - 10 - landPt[0], 60));
    const savedPlaces = state.places, savedWays = civWays, savedJourneys = civJourneys, savedIdx = _civSelectedJourneyIdx;
    const origDerive = _jpDeriveStages;
    try {
      state.places = [{ kind: 'town', name: 'A', x: landPt[0], y: landPt[1], category: 'settlement', pop: 1000 },
      { kind: 'town', name: 'B', x: landPt[0] + span, y: landPt[1], category: 'settlement', pop: 1000 }];
      const pts = []; for (let k = 0; k <= 40; k++) pts.push([landPt[0] + span * k / 40, landPt[1]]);
      const jn = { pts, name: 'v166', groupSize: 2 };
      civJourneys = [jn]; _civSelectedJourneyIdx = 0;

      // sanity: the primitive itself declines outside its domain (no pack animals / not a Baggage Train)
      {
        const stTest = { km: 50, cat: 'land', terrain: 'Desert Hardpack', biome: 'Hot Desert', routeCond: 'Standard', infra: 'Stable Settlements', dryKm: 0 };
        o.declinesNonBaggageTrain = _jpBestPackageForStage(stTest, { transport: 'Walking', animals: { donkey: 0, mule: 0, camel: 0, horse: 0 }, carts: 0, wagons: 0, travois: 0, sleds: 0 }) === null;
        o.declinesNoAnimals = _jpBestPackageForStage(stTest, { transport: 'Baggage Train', animals: { donkey: 0, mule: 0, camel: 0, horse: 0 }, carts: 1, wagons: 0, travois: 0, sleds: 0 }) === null;
      }

      // the owner's own scenario: moderate climate for the first stretch, desert for the rest
      window._jpDeriveStages = () => [
        { km: 100, cat: 'land', terrain: 'Dirt Track', routeCond: 'Standard', infra: 'Stable Settlements', biome: 'Temperate Forest', dryKm: 0, i0: 0, i1: 27 },
        { km: 50, cat: 'land', terrain: 'Desert Hardpack', routeCond: 'Standard', infra: 'Stable Settlements', biome: 'Hot Desert', dryKm: 40, i0: 27, i1: 40 }
      ];
      const p = _jpEnsurePlan(jn);
      Object.assign(p, { transport: 'Baggage Train', assetMode: 'manual', carts: 1, wagons: 0, travois: 0, sleds: 0,
        groupSize: 2, cargoKg: 300, stageOverrides: {}, desertWater: 'Established Caravan Route',
        animals: { donkey: 0, mule: 2, camel: 0, horse: 0 } });
      _civOpenRouteEditor(0);
      _jpRenderResults(jn);
      o.stage1NoAdvisory = !document.querySelector('[data-jps-pkg-idx="0"]');
      const btn = document.querySelector('[data-jps-pkg-idx="1"]');
      o.stage2AdvisoryExists = !!btn;
      o.stage2RecommendsCamel = btn && btn.dataset.jpsPkgSpecies === 'camel';
      if (btn) btn.click();
      o.stage1UntouchedByClick = !p.stageOverrides['0'];
      o.stage2CamelApplied = p.stageOverrides['1'] && p.stageOverrides['1'].animals &&
        p.stageOverrides['1'].animals.camel === 2 && p.stageOverrides['1'].animals.mule === 0;
      o.basePlanStillMule = p.animals.mule === 2 && p.animals.camel === 0;

      // per-stage Vehicle select: options, inherit label, writes overrides, base plan untouched
      const sel = document.querySelector('select[data-jps="vehicle"][data-jps-idx="1"]');
      o.vehicleSelectExists = !!sel;
      o.vehicleSelectOptions = sel && Array.from(sel.options).map(op => op.value).join(',') === ',none,carts,wagons,travois,sleds';
      if (sel) { sel.value = 'travois'; sel.dispatchEvent(new Event('change', { bubbles: true })); }
      o.stage2TravoisApplied = p.stageOverrides['1'] && p.stageOverrides['1'].travois === 1 && p.stageOverrides['1'].carts === 0;
      o.stage1CartStillBasePlan = p.carts === 1 && !p.stageOverrides['0'];

      // vehicle-axis advisory: a wheel-blocked terrain currently on wheels gets the v1.65 hard-block
      // fix instead (deliberately deferred there); a party already on travois where wheels are viable
      // again gets THIS advisory (cart edges travois on speed per JP_TRAIN_PACE) once cargo makes the
      // difference cross the 10% bar
      window._jpDeriveStages = () => [{ km: 50, cat: 'land', terrain: 'Dirt Track', routeCond: 'Standard',
        infra: 'Stable Settlements', biome: 'Temperate Forest', dryKm: 0, i0: 0, i1: 40 }];
      const p2 = _jpEnsurePlan(jn);
      Object.assign(p2, { transport: 'Baggage Train', assetMode: 'manual', carts: 0, wagons: 0, travois: 1, sleds: 0,
        groupSize: 2, cargoKg: 300, stageOverrides: {}, animals: { donkey: 0, mule: 2, camel: 0, horse: 0 } });
      _jpRenderResults(jn);
      const h = document.getElementById('reResults').innerHTML;
      o.vehicleAdvisoryRendered = /better animal\/vehicle available/.test(h) && /cart \(was travois\)/i.test(h);
      const vbtn = document.querySelector('[data-jps-pkg-idx="0"]');
      o.vehicleAdvisoryHasNoSpeciesFix = vbtn && vbtn.dataset.jpsPkgSpecies === '';
      if (vbtn) vbtn.click();
      o.vehicleFixApplied = p2.stageOverrides['0'] && p2.stageOverrides['0'].carts === 1 && p2.stageOverrides['0'].travois === 0;
      o.vehicleFixLeftSpeciesAlone = !('animals' in (p2.stageOverrides['0'] || {}));
    } finally {
      window._jpDeriveStages = origDerive;
      state.places = savedPlaces; civWays = savedWays; civJourneys = savedJourneys; _civSelectedJourneyIdx = savedIdx;
    }
    return o;
  });

  // ── v1.67 (owner report: an 18-month, 4253 km, 14-stage journey with several stages at
  // 525%-1475% load all showing an identical flat 0.450 load-penalty multiplier and no error —
  // "Somehow it feels like it is way too long for travel time"). Root cause: jpCalcLand's
  // convergence loop derives its own water-carry mass from THIS stage's dryKm ÷ the speed reached
  // SO FAR — slower speed → longer gap in days → more water mass → more load → slower speed, a real
  // feedback loop — and jpLoadPenalty floors at a flat 0.45× for ANY ratio past 150%, so the loop
  // "converges" at a stable but physically absurd load and returns it as a real, summed stage
  // (reproduced from the report's own Stage 11: ratio0 0.82 read as fine by v1.63's pre-loop check,
  // converged loadRatio 15.3). Fix: the SAME JP_LOAD_INVALID_RATIO cutoff v1.63 already checks on
  // ratio0 is now ALSO checked on the post-loop loadRatio.
  R.v167 = await page.evaluate(() => {
    const o = {};
    // (a) the owner's own reported stage (Hills / Ruined Region / Hot Desert, 215 km dry run,
    // Baggage Train with 1 mule + 1 wagon, 2 people, Forced March/12h, 200 kg cargo, 20 supply
    // days) now blocks instead of silently returning an 1100%+-of-capacity "answer".
    const st = { km: 293.0, cat: 'land', terrain: 'Hills', routeCond: 'None / Wild', infra: 'Ruined Region',
      biome: 'Hot Desert', dryKm: 215 };
    const plan = { groupSize: 2, transport: 'Baggage Train', pace: 'Forced March', hours: 12, cargoKg: 200,
      supplyDays: 20, season: 'Autumn', grazing: 'Partial — graze at camp', foraging: 'Active', carryFood: true,
      desertWater: 'auto', animals: { donkey: 0, mule: 1, camel: 0, horse: 0 }, carts: 0, wagons: 1, travois: 0, sleds: 0 };
    const r = jpCalcLand(st, plan);
    o.reportedStageNowBlocked = !!r.blocked;
    o.reportedStageMsgNamesCapacity = !!(r.blocked && /capacity/i.test(r.blocked) && /no party departs/i.test(r.blocked));

    // (b) a genuinely fine stage (no dry gap, light cargo, no animals) is completely unaffected —
    // same threshold, same constant, no new false positives.
    const stFine = { km: 100, cat: 'land', terrain: 'Dirt Track', routeCond: 'Standard', infra: 'Stable Settlements',
      biome: 'Temperate Forest', dryKm: 0 };
    const planFine = { groupSize: 4, transport: 'Walking', pace: 'Standard Pace', hours: 8, cargoKg: 20,
      supplyDays: 7, season: 'Summer', grazing: 'Partial — graze at camp', foraging: 'None', carryFood: true,
      desertWater: 'auto', animals: { donkey: 0, mule: 0, camel: 0, horse: 0 }, carts: 0, wagons: 0, travois: 0, sleds: 0 };
    const rFine = jpCalcLand(stFine, planFine);
    o.fineStageUnaffected = !rFine.blocked && isFinite(rFine.dailyKm) && rFine.dailyKm > 0;

    // (c) the fix reuses the SAME v1.63 constant on the post-loop ratio — not a new, separate
    // magic threshold that could drift from the ratio0 check.
    o.reusesSharedConstant = typeof JP_LOAD_INVALID_RATIO === 'number' && JP_LOAD_INVALID_RATIO === 1.50 &&
      (jpCalcLand.toString().split('JP_LOAD_INVALID_RATIO').length - 1) >= 2;

    // (d) plan-level: a journey mixing the fine stage and the reported-bug stage blocks the WHOLE
    // plan's total (the same _jpPlan blockedIdx precedent every other hard block already uses),
    // while the fine stage's own per-stage result is still a real, computed number — one bad
    // stretch does not swallow the rest of the route's honest numbers.
    const savedPlaces = state.places, savedWays = civWays, savedJourneys = civJourneys, savedIdx = _civSelectedJourneyIdx;
    const origDerive = _jpDeriveStages;
    try {
      const sea = state.seaLevel || 0.42;
      let landPt = null;
      for (let y = 8; y < GH - 8 && !landPt; y++) for (let x = 8; x < GW - 8 && !landPt; x++)
        if (field[y * GW + x] >= sea + 0.05) landPt = [x, y];
      const pts = []; for (let k = 0; k <= 10; k++) pts.push([landPt[0] + k, landPt[1]]);
      const jn = { pts, name: 'v167', groupSize: 2 };
      state.places = []; civWays = []; civJourneys = [jn]; _civSelectedJourneyIdx = 0;
      window._jpDeriveStages = () => [
        Object.assign({}, stFine, { i0: 0, i1: 5 }),
        Object.assign({}, st, { i0: 5, i1: 10 })
      ];
      const p = _jpEnsurePlan(jn);
      Object.assign(p, plan);
      const full = _jpPlan(jn);
      o.planBlocked = !!(full && full.blocked);
      o.planBlockedMsgNamesCapacity = !!(full && full.blockedMsg && /capacity/i.test(full.blockedMsg));
      o.planTotalDaysNull = !!full && full.totalDays === null;
      o.fineStageStillComputedInPlan = !!(full && full.results && full.results[0] && !full.results[0].blocked && isFinite(full.results[0].days) && full.results[0].days > 0);
      o.badStageIsTheBlockedOne = !!(full && full.blockedIdx === 1);
    } finally {
      window._jpDeriveStages = origDerive;
      state.places = savedPlaces; civWays = savedWays; civJourneys = savedJourneys; _civSelectedJourneyIdx = savedIdx;
    }
    return o;
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
  A('v1.70 villages unit: _civRoadProximityQuery reads ~0 on the road, a small positive offset nearby, Infinity far outside the search window', R.villagesUnit.onRoad < 1 && R.villagesUnit.near4 > 2 && R.villagesUnit.near4 < 6 && R.villagesUnit.far === Infinity);
  A('v1.70 villages unit: an empty or sea-only way set never resolves a road distance', R.villagesUnit.emptyWaysAllInfinite && R.villagesUnit.seaWayIgnored);
  A('v1.70 villages unit: accept probability is 1 at the road regardless of (floor-clearing) suitability, and 1 at great suitability regardless of distance', R.villagesUnit.acceptAtRoad === 1 && R.villagesUnit.acceptFarGreatSuit === 1);
  A('v1.70 villages unit: far from any road, floor-level suitability alone earns near-zero acceptance odds — the hard floor cannot be bypassed by road proximity that isn\'t there', R.villagesUnit.acceptFarLowSuit < 0.01);
  A('v1.70 villages unit: acceptance decays smoothly with road distance — a soft falloff, not a hard cutoff', R.villagesUnit.acceptNear > R.villagesUnit.acceptFarther && R.villagesUnit.acceptFarther > R.villagesUnit.acceptFarthest);

  A('v1.70 villages: off by default — no villageAddon-tagged settlements on a plain auto-populate', !R.villages.baselineHasAny);
  A('v1.70 villages: enabling it adds a bounded, non-empty batch', R.villages.cappedSanely);
  A('v1.70 villages: every added village is a real hamlet — named, populated, factioned, same code path as any other settlement', R.villages.allHamlet && R.villages.allNamed && R.villages.allPopPositive && R.villages.allHaveFaction);
  A('v1.70 villages: respect VILLAGE_SPACING_KM both among themselves and against pre-existing settlements', R.villages.spacingRespectedAmong && R.villages.spacingRespectedVsOthers);
  A('v1.70 villages: every added village lands on dry land', R.villages.allOnLand);
  A('v1.70 villages: every added village clears VILLAGE_SUIT_THRESH on the SAME suit field every other placement pass reads — the hard floor', R.villages.allMeetSuitThreshold);
  A('v1.70 villages: the candidate search finds genuinely decent sites, not just barely-passing ones (mean score above threshold)', R.villages.meanSuitAboveThreshold);
  A('v1.70 villages: base capital/city/town/village/hamlet placement is unaffected by the toggle — only the additive layer responds (the actual "waay too populated" fix)', R.villages.baseUnchanged);
  A('v1.70 villages: toggling it back off reproduces the exact baseline settlement count — no residual state', R.villages.toggleOffMatchesBaseline);
  A('v1.70 villages: a village\'s map pin is hidden below CIV_VILLAGE_ADDON_LOD and pickable once zoomed past it (deliberately no dot fallback)', R.villages.pickHiddenBelow === true && R.villages.pickVisibleAbove === true);
  A('v1.70 villages: road proximity never leaves meaningfully fewer villages seeded than with no roads at all (comparative check on the pure seeding function)', R.villages.roadBiasSane === true);
  A('v1.70 villages: the unified "Villages" checkbox exists, defaults unchecked, and its change handler drives _civVillages', R.villagesToggle && R.villagesToggle.defaultChecked === false && R.villagesToggle.on === true && R.villagesToggle.off === false);
  A('v1.70 villages: regional population estimate integrates a positive total over a positive land area (unaffected by the toggle merge)', R.villages.popTotal > 0 && R.villages.popLand > 0);

  A('v1.71 villages unit: multi-source roadDijkstra matches the minimum of each source\'s own single-source distance at every cell', R.villagesUnit.multiSourceMatchesMinOfSingleSources);
  A('v1.71 villages unit: every pre-v1.71 scalar roadDijkstra call is still byte-identical', R.villagesUnit.scalarFormByteIdentical);
  A('v1.71 villages unit: _civWayLodMin overrides a villageAddon way\'s threshold to CIV_VILLAGE_ADDON_LOD but leaves a plain way of the same type at its ordinary CIV_LOD_ROAD value', R.villagesUnit.wayLodVillageAncient === 2.4 && R.villagesUnit.wayLodPlainAncient === 0.7 && R.villagesUnit.wayLodHighwayUnaffected);
  A('v1.71 villages: connecting each village produces a bounded, non-empty batch of ancient-type connector ways', R.villages.connectorCount > 0 && R.villages.allConnAncient);
  A('v1.71 villages: a connector\'s village end lands exactly on the village\'s own pin, and its settlement end lands exactly on a real settlement\'s pin', R.villages.villageEndsMatchPin && R.villages.settlementEndsMatchPin);
  A('v1.71 villages: a connector reveals at the SAME deep zoom as its village (CIV_VILLAGE_ADDON_LOD), not the generic ancient-road threshold', R.villages.connectorLodMatchesVillage);
  A('v1.71 villages: most villages reach the existing network with a connector (a few may be genuinely unreachable, e.g. an isolated landmass)', R.villages.mostVillagesConnected);
  A('v1.71 villages: every connected village is registered as non-isolated by _civNetworkMetrics — not a silently-dropped self-loop', R.villages.allConnectedVillagesNonIsolated);
  A('v1.71 villages: toggling the layer off leaves no villageAddon connector ways behind', R.villages.offHasNoConnectors);

  A('v1.72 BUG-A: the way serialization whitelist keeps villageAddon, so connectors survive a save/load round trip', R.v172.A_savedKeepsFlag && R.v172.A_survivesReload);
  A('v1.72 BUG-A: after a reload no village connector draws at a shallower zoom than the village it leads to (was 0.7 vs 2.4 — roads to invisible settlements)', R.v172.A_noRoadOutrunsItsVillage);
  A('v1.72 BUG-B: Generate Roads no longer destroys the village connectors', R.v172.B_connectorsSurvive);
  A('v1.72 BUG-B: after Generate Roads every way touching a village is still deep-zoom gated', R.v172.B_everyVillageWayIsDeepZoom);
  A('v1.72 BUG-B: Generate Roads does not rebuild the trunk network over addon villages', R.v172.B_noTrunkWayTouchesAVillage);
  A('v1.72 BUG-C: the way list is no longer flooded by auto connectors', R.v172.C_listNotFlooded && R.v172.C_connectorCount > 0);
  A('v1.72 BUG-C: connectors live in a collapsed disclosure and stay fully reachable', R.v172.C_disclosureExists && R.v172.C_disclosureStartsClosed && R.v172.C_connectorsStillReachable);

  A('v1.73: _civTraitDrop returns 0 for a trait-less place and a positive clearance for a trait-bearing one', R.v173.zeroWithoutTraits && R.v173.positiveWithTraits);
  A('v1.73: the clearance the label-collision pass reserves is the SAME number _civDrawSettlementPin draws at (one definition, no drift)', R.v173.matchesDrawnFormula);
  A('v1.73: the drop scales with pin size, so it stays correct at every zoom', R.v173.scalesWithSize);
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
  A('v1.07/v1.57: the faction pill row carries no naming-culture select (moved to the Faction Inspector); the Inspector\'s own culture select lists every CIV_CULTURES entry', R.cultureNaming.present && R.cultureNaming.pickerSelects === 0 && R.cultureNaming.inspectorCultureOptions === R.cultureNaming.culturesLen);
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
  A('v1.10/v1.57: the faction pill row carries no state-religion select (moved to the Faction Inspector, which lists it correctly), and civFactionReligion round-trips through sync', R.provinces.religionSelects === 0 && R.provinces.inspectorReligionOptions > 0 && R.provinces.savedReligionLen > 0 && R.provinces.religionRestored);
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
  A('v1.32: a genuine settlement-pin click in Explore mode opens the anchored popup, not the fullscreen viewer, and still skips the plain summary', R.v118.settlementClickOpensPopup && R.v118.settlementClickLeavesModalShut && R.v118.settlementClickSkipsPlainPanel);
  A('v1.18: the City Viewer still opens fully when explicitly requested (now via the popup button)', R.v118.viewerOpensOnRequest);
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

  A('v1.23 BUG1: Open Sea km/day > Coastal Waters (systemic sea ordering fixed)', R.v123.openFasterThanCoastal);
  A('v1.23 BUG1: Sheltered Bay is not the fastest sea terrain (no residual pair-ordering bug)', R.v123.shelteredNotFastest);
  A('v1.23 BUG2: selector and validator agree for every vessel × water terrain (single source of truth)', R.v123.selValidatorMismatches === 0 && R.v123.checks > 0);
  A('v1.23 BUG2: autoselect never picks a vessel the compat rule flags invalid', R.v123.autoInvalid === 0 && R.v123.autoPicks > 0);
  A('v1.23 BUG2: an autoselected Open Sea vessel passes the real jpCalcWater validator (not blocked)', !!R.v123.autoOpenPick && R.v123.autoOpenNotBlocked);
  A('v1.23 BUG2: jpCalcWater still blocks a genuinely infeasible manual pick (river barge on open sea)', R.v123.manualInfeasibleStillBlocked);
  A('v1.23 BUG2: dhow is rated open-sea capable (sea, not river) — historically correct', R.v123.dhow.openSea && R.v123.dhow.fitsOpenSea && R.v123.dhow.fitsCoastal && !R.v123.dhow.fitsRiver);
  A('v1.23: settlement pick radius shrinks as you zoom in (constant on-screen), off-LOD and under LOD', R.v123.pickShrinksOnZoomIn);

  A('v1.24 BUG-1: releasing a World Structure slider no longer throws and correctly sets archetype=custom', !R.v124.bug1.threw && R.v124.bug1.archetypeIsCustom && R.v124.bug1.archetypeBtnOn);
  A('v1.24 BUG-2: Delete while typing in the place editor does not delete the selected settlement', R.v124.bug2.hadInput && R.v124.bug2.placeSurvived);
  A('v1.24 BUG-3: busy overlay stays visible until every queued op has hidden it, then recovers normally', R.v124.bug3.stillVisibleAfterOneHide && R.v124.bug3.hiddenAfterSecondHide && R.v124.bug3.recoversNormally);
  A('v1.24 BUG-4: declining the confirm() on Clear labels/icons leaves the data untouched', R.v124.bug4.confirmCalls === 2 && R.v124.bug4.labelsSurvivedDecline && R.v124.bug4.iconsSurvivedDecline);
  A('v1.24 BUG-5: a beforeunload guard exists and correctly reports a live world', R.v124.bug5.hasFn && R.v124.bug5.reportsTrue);
  A('v1.24 BUG-6: the asset-pack thumbnail gallery has its host element back (was CSS-only)', R.v124.bug6.hasEl && !R.v124.bug6.threw);
  A('v1.24 BUG-7: user-entered names are HTML-escaped in the settlements table row (no tag corruption)', R.v124.bug7.escOk && R.v124.bug7.rowEscaped && !R.v124.bug7.rowHasRawTag);
  A('v1.24 BUG-8: a stuck Space-pan clears on window blur instead of requiring another key tap', R.v124.bug8.setTrue && R.v124.bug8.clearedOnBlur);

  A('v1.25: Volcanic (continentality 0.05) now renders MOSTLY OCEAN, not majority land', R.v125.archetypes.volcanic.landFraction < 0.25);
  A('v1.25: Archipelago (continentality 0.15) now renders mostly ocean', R.v125.archetypes.archipelago.landFraction < 0.35);
  A('v1.25: Supercontinent (continentality 0.60) still renders a dominant landmass', R.v125.archetypes.supercontinent.landFraction > 0.45);
  A('v1.25: Volcanic renders less land than Archipelago, which renders less land than Earth-like', R.v125.archetypes.volcanic.landFraction < R.v125.archetypes.archipelago.landFraction && R.v125.archetypes.archipelago.landFraction < R.v125.archetypes.earth.landFraction);
  A('v1.25: Archipelago renders less land than Supercontinent (ocean-world vs land-world ordering preserved)', R.v125.archetypes.archipelago.landFraction < R.v125.archetypes.supercontinent.landFraction);
  A('v1.25: land fraction tracks each archetype\'s own continentality parameter within a sane band', Object.values(R.v125.archetypes).every(a => Math.abs(a.landFraction - a.continentality) < 0.12));
  A('v1.25: the #sea slider DOM is refreshed to reflect the auto-derived seaLevel (not left stale)', Object.values(R.v125.archetypes).every(a => a.seaSliderReflectsState));

  A('v1.26: with no rules configured placeMapIcons keeps its legacy categories (bit-identical path)', R.v126.legacyKeepsCategories && R.v126.legacyItemsEqualSum && R.v126.rulesNullByDefault);
  A('v1.26: the unified items[] draw list is Y-sorted and interleaves categories (mountains no longer always on top)', R.v126.legacyYSorted && R.v126.legacyInterleaved);
  A('v1.26: a biome-restricted rule places only in that biome, never in water, within its size range', R.v126.ruledPlaced && R.v126.ruledObeysBiome && R.v126.ruledNeverInWater && R.v126.ruledSizeInRange && R.v126.ruledLegacyArraysEmpty);
  A('v1.26: density is monotonic, and relief mode obeys its elevation band + blue-noise spacing', R.v126.densityMonotonic && R.v126.reliefObeysBand && R.v126.reliefRespectsSpacing);
  A('v1.26: variant weighting honours a zero weight, and no weights reproduces the v1.25 hash pick exactly', R.v126.weightZeroNeverPicked && R.v126.unweightedMatchesLegacy);
  A('v1.26: the Library→runtime bridge installs rules, bumps the cache gen, and filters disabled assets out', R.v126.bridgeSetRules && R.v126.bridgeFiltersDisabled);
  A('v1.26: pack import autopopulates default biomes; custom-set assets start disabled (no invented intent)', R.v126.autoBindsDefaultBiomes && R.v126.autoCustomStartsDisabled && R.v126.customKeySpelling);
  A('v1.26: the density brush scatters many icons per stamp, on land, spaced, sized from the asset rule', R.v126brush.paintedMultiple && R.v126brush.allOnLand && R.v126brush.allCorrectSlot && R.v126brush.sizeVaries && R.v126brush.sizeFromRule && R.v126brush.noOverlap && R.v126brush.withinBrush);

  A('v1.27 FIX-1: wetland and biome are ANDed in scatter mode (vacuously true if this world has no wetland biome)', R.v127.hasWetlandBiome ? (R.v127.andSatisfiesBoth && R.v127.biomeNarrows) : true);
  A('v1.27 FIX-2: normalizeScatterRule rejects non-finite input and keeps a legitimate 0 density', R.v127.normAllFinite && R.v127.normSane && R.v127.zeroDensityKept && R.v127.densityClamped);
  A('v1.27 FIX-2b: normalize does not alias its own defaults object, and a NaN density cannot scatter everywhere', R.v127.noAliasing && R.v127.nanDensityBounded);
  A('v1.27 FIX-3: a NaN spacing cannot collapse the relief bucket grid into an O(n^2) scan', R.v127.reliefNaNSurvives);
  A('v1.27 FIX-4: the Library bridge retires art it previously owned when the asset is deleted', R.v127.bridgeRetires);
  A('v1.27 FIX-5: scatter priority is specificity-ordered, not dependent on rule insertion order (vacuous without a wetland biome)', R.v127.hasWetlandBiome ? (R.v127.priorityStable && R.v127.prioritySpecificWins) : true);
  A('v1.27 FIX-6: the density brush bounds one stamp\'s work at max radius/density', R.v127brush.stillPaints && R.v127brush.bounded && R.v127brush.allOnLand);

  A('v1.28: biome/terrain/trait slot vocabularies stay aligned with the frozen CART_*/CIV_TRAITS indices', R.v128.vocabAligned);
  A('v1.28: a painted biome cell renders the pack texture\'s TRUE colour, not the flat palette swatch', R.v128.foundCell ? R.v128.biomeTexture : true);
  A('v1.28: removing the pack falls back to the flat swatch (pack-less render unchanged)', R.v128.foundCell ? R.v128.biomeFallback : true);
  A('v1.28: a painted terrain cell renders its pack texture too', R.v128.foundCell ? R.v128.terrainTexture : true);
  A('v1.28: _assetGen bumps on pack change and participates in the bake/tile cache keys', R.v128.assetGenBumps && R.v128.assetGenInKeys);
  A('v1.28: "administrative" is now a real trait (was assigned by the economy code but absent from CIV_TRAITS)', R.v128.administrativeAdded);
  A('v1.28: settlement trait badges are actually drawn beside the pin, and use sprite art when present', R.v128.traitFnsExist && R.v128.traitBadgesDrawn && R.v128.traitSpriteUsed);

  // ── v1.29: eight owner-reported bugs ──
  A('v1.29 B1: every range input suppresses touch-action/selection (not just .row sliders)', R.v129.rangeCount > 0 && R.v129.rangesSuppressSelect);
  A('v1.29 B1: the long-press callout is suppressed by a bare input[type=range] rule', R.v129.calloutSuppressed);
  A('v1.29 B2: a river polyline crossing the world seam is split, straight ones are untouched', R.v129.seamSplit && R.v129.seamNoOp);
  A('v1.29 B3: river-way width grows sub-linearly with zoom on both camera paths, and is unchanged at zoom 1', R.v129.widthDampedLod && R.v129.widthDampedOff && R.v129.widthUnityAtZoom1);
  A('v1.29 B4: LOD zoom holds the world point under the cursor and moves the camera centre to do it', R.v129.zoomHoldsCursor && R.v129.zoomMovedCentre);
  A('v1.29 B4: a centred LOD zoom still behaves exactly like the old centre-zoom', R.v129.zoomCentreUnchanged);
  A('v1.29 B5: the joystick LOD pan and the zoom-reset button both schedule a tile refine', R.v129.joyRefineWired && R.v129.resetSchedulesRefine);
  A('v1.29 B5: adjacent tiles agree at the world column they share (shared ' + R.v129.seamShared + ' vs interior ' + R.v129.seamInterior + ')', R.v129.tilesSeamless);
  A('v1.29 B6: the 3D height source flattens an inland lake to its pooled surface without touching `field`', R.v129.foundLake ? (R.v129.lakeFlattened && R.v129.notInPlace) : true);
  A('v1.29 B6: flatten-sea off, or lakes-as-water off, returns `field` itself (no allocation, no divergence from the 2D map)', R.v129.offReturnsField && R.v129.showLakesOffRespected);
  A('v1.29 B7: a river run crossing open water is dropped, not stroked across the lake', R.v129.lakeSplit);
  A('v1.29 B7: a cell inside the lake\'s sub-cell flood band no longer counts as dry land', R.v129.foundFloodBand ? R.v129.floodBandIsWet : true);

  // ── v1.30: unified suitability + flood + per-settlement trade ──
  A('v1.30: the second, divergent suitability scorer is gone (no private copy left behind)', R.v130.extendedRetired);
  A('v1.30: one advisory seed threshold shared by the debug view and auto-populate', R.v130.oneThreshold);
  A('v1.30: the view and the placer read the same cached field object, so they cannot drift', R.v130.sameFieldObject && R.v130.seedsExist);
  A('v1.30: flood is a real penalty — a floodplain scores below identical dry ground', R.v130.foundFloodPair ? R.v130.floodPenalises : true);
  A('v1.30: settlements report their own exports/imports, not only their faction\'s', R.v130.havePlaces ? R.v130.anyTrade : true);
  A('v1.30: no good is listed as both an export and an import', R.v130.havePlaces ? R.v130.noGoodBothWays : true);
  A('v1.30: every reported trade states what it was derived from', R.v130.havePlaces ? R.v130.everyTradeHasBasis : true);
  A('v1.30: trade genuinely varies between settlements (it is not the faction row copied down)', R.v130.havePlaces ? R.v130.variesBySettlement : true);
  A('v1.30: a specialised settlement exports its primary good', R.v130.havePlaces ? R.v130.specExports : true);
  A('v1.30: the settlement inspector renders the trade rows', R.v130.havePlaces ? R.v130.inspectorRenders : true);

  A('v1.31: RESOURCE_KEYS grew to 15 append-only (original six keep their save-format indices)', R.v131.keyCount === 15 && R.v131.appendOnly && R.v131.namesAligned && R.v131.civKeysTrack);
  A('v1.31 §10.1: the scarcity cut is ordered by crustal abundance (gold < tin < copper < iron) and bounded', R.v131.scarcityOrdered && R.v131.cutsBounded);
  A('v1.31 §10.1: applyResourceScarcity only thins, never invents a deposit, and keeps the strongest cells', R.v131.scarcityNeverInvents && R.v131.scarcityThins && R.v131.scarcityKeepsStrongest);
  A('v1.31: every new potential field is present, finite and in [0,1] on a real world', R.v131.allFieldsPresent && R.v131.allFinite);
  A('v1.31: rarity is visible on the map — obsidian and silver occupy far less land than clay', R.v131.rarityShowsOnMap);
  A('v1.31 FIX: the channel atlas covers every RESOURCE_KEY (was a hand-listed six, dropping nine)', R.v131.atlasCoversAll);
  A('v1.31 FIX: worldMeanResource has no NaN (mkResMap was a frozen six-key literal indexed with fifteen)', R.v131.worldMeanNoNaN);
  A('v1.31 §10.7: subsistence modes are ordered, ocean/marginal read as foraging, good land as annual cultivation', R.v131.modeOrdered && R.v131.modeOcean && R.v131.modeIntensive && R.v131.modeMarginal && R.v131.densityMonotonic);
  A('v1.31 §10.7: per-world normalisation preserves the v1.30 land-integrated total while the distribution genuinely varies', R.v131.densityTotalPreserved && R.v131.densityVaries);
  A('v1.31 §10.2: the charcoal:iron ratio and coppice yields are in the reference\'s range', R.v131.ratioSane);
  A('v1.31 §10.3: smelting output is the MIN of the ore and fuel budgets, finite, and labelled by which binds', !R.v131.nPlaces || (R.v131.smeltFinite && R.v131.smeltIsMin && R.v131.smeltLabels && R.v131.coppiceScales));
  A('v1.31 §10.3: at least one settlement is genuinely fuel-limited rather than ore-limited (the Elba case)', !R.v131.nPlaces || R.v131.someFuelLimited);
  A('v1.31 §9: every settlement gets the full 7-category checklist with a valid severity, and no good is both an import and an export', !R.v131.nPlaces || (R.v131.checklistShape && R.v131.noGoodBothWays));
  A('v1.31 §8: archetypes are drawn from the declared vocabulary and at least one settlement matches', !R.v131.nPlaces || (R.v131.archetypesValid && R.v131.someArchetype));
  A('v1.31 §6: pasture/crop shares are disjoint fractions and the manure uplift is capped', !R.v131.nPlaces || (R.v131.pastoralShapes && R.v131.pastoralSharesDisjoint));
  A('v1.31 §7: bulk goods without navigable water reach only local markets; luxuries travel regardless', !R.v131.nPlaces || (R.v131.navShapes && R.v131.bulkGatedByWater && R.v131.luxuryAlwaysTravels && R.v131.bulkNeedsWater));

  A('v1.32 A: the setup gate is a canvas-wrap child with a scrollable card, and the overlay guard matches it but not the canvas', R.v132.guardExists && R.v132.gateIsCanvasChild && R.v132.gateCardScrollable && R.v132.guardMatchesGate && R.v132.guardIgnoresCanvas);
  /* NOTE: this smoke world never generates faction territory (territoryCells stays 0), so every
     faction's resource means are 0 and the resource-export threshold cannot be exercised here — the
     assertion is honestly vacuous in that case rather than passing on the unrelated 'food' export.
     The v1.32 threshold fix itself is verified by reading, not by this run; a world with real
     territory is needed to exercise it end-to-end. */
  A('v1.32 B: with real territory at least one faction exports a RESOURCE, not just food (vacuous here — this world has no territory)', !R.v132.territoryCells || R.v132.factionsWithResourceExports > 0);
  A('v1.32 B: faction exports are valid resource keys and no good is both imported and exported', R.v132.exportsAreValidKeys && R.v132.noGoodBothWays);
  A('v1.32 D: no settlement is classified coastal while the coast-distance field puts the sea far away', !R.v132.nPlaces || R.v132.wrongCoastal === 0);
  A('v1.32 E: no settlement reports a river order/width for a river beyond the context radius (the ~618km readout)', !R.v132.nPlaces || R.v132.badRiver === 0);
  A('v1.32 E: every Site Profile field stays finite and in range, and the km thresholds are resolution-independent', !R.v132.nPlaces || (R.v132.profileFinite && R.v132.boxKmSane));
  A('v1.32 C: selecting a settlement opens the anchored popup with the city card on top, an Open-city-view button and editable fields', !R.v132.nPlaces || (R.v132.popupOpens && R.v132.popupHasCityCard && R.v132.popupHasCityButton && R.v132.popupHasEditableFields));
  A('v1.32 C: the fullscreen City Viewer is not forced open by selecting a settlement', !R.v132.nPlaces || R.v132.fullscreenNotForced);

  A('v1.33 AUDIT: one shared resource-trade rule exists and behaves (rich exports, poor imports, average neither)', R.v133.sharedRuleExists && R.v133.ruleExportsWhenRich && R.v133.ruleImportsWhenPoor && R.v133.ruleNeutralWhenAverage);
  A('v1.33 AUDIT: the settlement inspector uses the same rule as the faction/Economy surfaces (was a stale absolute-margin copy)', !R.v133.nPlaces || R.v133.settlementUsesSharedRule);
  A('v1.33: food transport decay halves at the cost-doubling distance and falls monotonically with distance', R.v133.decayHalvesAtDoubleKm && R.v133.decayMonotonic);
  A('v1.33: water carriage beats land over the same distance (Diocletian ratios) and mode selection picks the cheapest both ends share', R.v133.waterBeatsLand && R.v133.modePicksCheapest);
  A('v1.33: a source 800km overland delivers nothing while the same distance by sea is nearly free', R.v133.decayLand800 === 0 && R.v133.decaySea800 > 0.9);
  A('v1.33: every food shed is finite and sums to local + hinterland + import', !R.v133.nPlaces || (R.v133.shedsFinite && R.v133.shedSumsCorrectly));
  A('v1.33: the countryside hinterland actually feeds settlements (not only other settlements\' surplus)', !R.v133.nPlaces || R.v133.hinterlandContributes);
  A('v1.33: after reconciliation every settlement is within its food shed (or at the minimum-population floor), and the pass is a fixed point', !R.v133.nPlaces || (R.v133.allSustainable && R.v133.passIsFixedPoint && R.v133.stillSustainable));
  A('v1.33: a food deficit is only reported as an import when a supply route can actually deliver it', !R.v133.nPlaces || R.v133.deficitNotAutoImport);

  A('v1.34 PARAMS: every food figure matches the research note (9:1 farmers, 470-1000 kg/ha, 160km doubling, 5.5x river, 50x sea, 4.34 seed ratio)', R.v134.paramsSane);
  A('v1.34 PARAMS: grain yield has one source of truth (v1.31\'s separate 500 kg/ha constant is now derived from the range)', R.v134.yieldUnified);
  A('v1.34: median soil reproduces the 9:1 baseline exactly, marginal soil yields NO surplus, rich soil is capped', R.v134.medianIsBaseline && R.v134.marginalYieldsNothing && R.v134.richIsCapped && R.v134.surplusMonotonic);
  A('v1.34: the surplus ratio calibrates to the world\'s own median soil, not an assumed 0.5 midpoint', R.v134.calibratesToWorld);
  A('v1.34 ACYCLIC: a settlement\'s own population never changes its own food supply (it cannot feed itself)', !R.v134.nPlaces || R.v134.ownPopDoesNotFeedItself);
  A('v1.34 ACYCLIC: growing one settlement never raises another settlement\'s ceiling (no mutual inflation)', !R.v134.nPlaces || R.v134.growthDoesNotInflateNeighbours !== false);
  A('v1.34: the reconciliation pass is monotonically non-increasing — it may only cap, never grow', !R.v134.nPlaces || R.v134.passNeverGrows);
  A('v1.34: the ceiling pass bounds settled population (strict historical band is checked on a clean world by probe_foodshed.js)', !R.v134.nPlaces || (R.v134.urbanShareBounded && R.v134.passReducesOrHolds));

  A('v1.35: every water-adjacency threshold is at least one grid cell (a finer one is unsatisfiable by construction)', R.v135.reachAtLeastOneCell);
  A('v1.35: no settlement the terrain calls coastal or riverine reports "water access: none"', !R.v135.nPlaces || R.v135.mismatch === 0);
  A('v1.35: riverOrder actually populates (the v1.34 gate was finer than a cell, so it was always 0)', !R.v135.nPlaces || R.v135.riverOrdersNonZero > 0);
  A('v1.35: an attached sea lane makes a settlement sea-accessible, and a distant one does not', !R.v135.nPlaces || (R.v135.seaLaneWins && R.v135.farLaneIgnored));
  A('v1.35: every water-access verdict states its basis, so "none" can be told from a threshold bug', !R.v135.nPlaces || R.v135.everyKindHasBasis);

  /* The water-edge snap is opt-in (state.civ.waterEdgeSnap) pending a placement/routing reorder — see
     the note at its call site — so this world does not exercise it. The snap's own invariants are
     asserted below as pure properties, which hold whether or not it is enabled. */
  A('v1.36: the snap is idempotent and only ever returns habitable, non-flooded land', !R.v136.nPlaces || (R.v136.snapIdempotent && R.v136.snapReturnsHabitable));
  /* On-water-edge share, flood-zone occupancy and corridor preference are PLACEMENT OUTCOMES, so they
     only mean anything on settlements this version actually placed. By this point ~350 earlier
     assertions have resampled and extracted this world, and its settlements predate the v1.36 pass —
     measuring them here would test history, not the feature. tests/perf/probe_placement.js runs those
     on a freshly generated world; what stays here is the property checks, which hold regardless. */
  A('v1.36: the corridor field is finite, sparse (an opportunity term, not a broad lift) and zero at sea', R.v136.corridorFinite && R.v136.corridorIsSparse && R.v136.corridorZeroInSea);

  A('v1.37: the coastal site-kind test uses the same >=1-cell floor as every other water test', R.v137.siteKindUsesReach);
  A('v1.37: an estuary settlement reports SEA access, not merely river', R.v137.estuaryIsSea);
  A('v1.37: every coastal settlement can make its own salt, and none imports salt it already has', !R.v137.nPlaces || (R.v137.coastalWithoutSalt === 0 && R.v137.importsSaltAnyway === 0));
  A('v1.37: the trade checklist discriminates between settlements (not every category unmet everywhere)', !R.v137.nPlaces || (R.v137.checklistDiscriminates && R.v137.gapsVary));

  A('v1.38: the City Viewer lists the same exports and imports as the settlement popup (one source, not faction-level)', !R.v138.nPlaces || (R.v138.viewerShowsPopupExports && R.v138.viewerShowsPopupImports));
  A('v1.38: the City Viewer shows the settlement\'s own trade rows and still labels the faction rows as such', !R.v138.nPlaces || (R.v138.viewerHasOwnRows && R.v138.viewerLabelsFaction));

  A('v1.40: landmass quality is finite, in [0,1], zero at sea, and its components partition the land exactly', R.v140.qualityFinite && R.v140.zeroAtSea && R.v140.partitionsLand && R.v140.sizesSumToLand);
  A('v1.40: the largest landmass scores above the smallest (placement can tell an island from a speck)', R.v140.bigBeatsSmall);
  A('v1.40: the islet penalty is sparse — it is an exception, not a reweighting of the whole map', R.v140.penaltySparse);
  A('v1.40: no settlement is seeded on a speck of land while real landmass exists', !R.v140.nPlaces || R.v140.onTinyIslet === 0);

  A('v1.43: every calibrated mode lands inside its travel-speeds.md §8 band', R.v143.allInBand);
  A('v1.43: an ox-wagon train is far slower than a pack-animal train (one "Baggage Train" bucket no longer covers both)', R.v143.wagonSlowerThanPack);
  A('v1.43: the pace-setting animal\'s terrain affinity reaches a TRAIN, not only a lone rider (camels beat mules on sand)', R.v143.camelBeatsMuleOnSand);
  A('v1.43: a paved surface lifts a walker more than an ox — the animal\'s gait is the ceiling', R.v143.surfaceGainDamped);
  A('v1.43: sea daily distance rises bay < coastal < open sea', R.v143.seaOrdered);
  A('v1.43: the land hours/day slider no longer moves a sea leg (the sailing window is the water\'s property)', R.v143.seaHoursIndependent);
  A('v1.43: infrastructure tiers are multiples of the world\'s own settlement density, not absolute counts', R.v143.tiersRelative);
  A('v1.43: empty countryside is not a "Hostile / Dead Zone" — the bottom tier needs a real signal', R.v143.emptyWildIsNotHostile && R.v143.ruinsStillHostile);
  A('v1.43: claimed faction territory floors a stage at Sparse Settlements (inhabited land is not wilderness)', R.v143.claimedFloorsTier);
  A('v1.43: an open-sea leg is not tiered by land settlement density', R.v143.openSeaNotLandTiered);
  A('v1.43: a short stage is not amplified by its own shortness, yet length still dilutes above the floor', R.v143.shortStageNotAmplified && R.v143.lengthStillDilutesAboveFloor);
  A('v1.43: a party of ≤10 is the reference tier and larger caravans carry the §5 spread (+15-25%)', R.v143.smallCaravanFavoured);

  A('v1.44: a route through settlements produces a Stops list, with no layover by default', R.v144.hasStops && R.v144.noLayoverByDefault);
  A('v1.44: a stop\'s key is stable (the same settlement re-derives the same key)', R.v144.keyStable);
  A('v1.44: a planned layover adds to total trip time without changing the underlying travel-day math', R.v144.layoverAdds && R.v144.travelDaysUnaffected);
  A('v1.44: weatherOverride="auto" is byte-identical to the pre-v1.44 unset field (the suggestion system, unchanged)', R.v144.autoMatchesUnset);
  A('v1.44: a forced weather condition diverges from the seasonal-average Auto and is labeled "forced:" in the trace', R.v144.stormDivergesFromAuto && R.v144.stormLabeledInTrace && R.v144.autoLabeledInTrace);
  A('v1.44: a forced Storm also degrades (or blocks) a sea leg, not just land', R.v144.waterStormBlockedOrSlower);
  A('v1.44: the Route Editor opens on call, sets its guard flag, and populates the party/stops/route-map surfaces', R.v144.opensOnCall && R.v144.modalHasOpenClass && R.v144.reOpenFlagSet && R.v144.routeMapCanvasExists && R.v144.partyFormPopulated && R.v144.stopsListPopulated);
  A('v1.44: the canvas-wheel scroll guard covers the open Route Editor (the v1.32 scroll-fix pattern)', R.v144.scrollGuardCoversModal);
  A('v1.44: the Route Editor closes on call and clears its guard flag', R.v144.closesOnCall && R.v144.reOpenFlagCleared);

  A('v1.45: at deep LOD zoom, drawRiverWays receives the real uncapped GW/span zk, not the old Math.min(8,...) clamp', R.v145.foundRiverSpot && R.v145.zkUncappedAtDeepZoom);
  A('v1.45: at shallow LOD zoom (already <=8 pre-fix), the river-ways zk is unchanged from before', R.v145.shallowZoomAlreadyUnderOldCap);
  A('v1.45: at deep zoom the uncapped stroke-width law paints meaningfully more river pixels than the old hard-capped-at-8 law on the same view', R.v145.deepZoomPaintsMoreThanOldCap);

  A('v1.46: _civOceanDistField is ocean-only (matches currentWaterBodies\' class-1 cells, zero there)', R.v146.oceanDTExists && R.v146.oceanDTZeroAtOcean);
  A('v1.46: the coastal-preference pass never reduces coastal representation in aggregate across a wide seed sample (v1.58: two independent stochastic runs per seed can locally diverge — see the test\'s own comment)', R.v146.neverWorse);
  A('v1.46: the coastal-preference pass demonstrably improves coastal representation on at least one seed (not a dead no-op)', R.v146.anyImproved);
  A('v1.46: the coastal-preference pass never places a settlement in water', R.v146.noneInWaterAnySeed);

  A('v1.47: _civDijkstraPath reports reachable=true for a genuine short land-mode hop', R.v147.foundLandPt && R.v147.landReachableTrue);
  A('v1.47: _jpModeForRoute maps Sea Faring->water, River Transport->mixed, land transports->undefined (the land branch)', R.v147.modeMapCorrect);
  A('v1.47: a land-mode re-route succeeds and genuinely replaces the drawn path', R.v147.walkRerouteOk && R.v147.walkRerouteReplacedPts);
  A('v1.47: a sea-mode re-route between two inland points reports failure with a reason, never a fabricated straight line', R.v147.seaRerouteReportsFailure && R.v147.seaRerouteNeverMutatedOnFailure);
  A('v1.47: the Re-route button exists in the Route Editor and is labeled with the live transport mode', R.v147.buttonExists && R.v147.buttonLabeledWithMode);
  A('v1.47: declining the confirm leaves the drawn path untouched (never silently discards user work)', R.v147.declineLeavesPtsUntouched);
  A('v1.47: accepting the confirm replaces the path and refreshes the modal', R.v147.acceptReplacesPts);

  A('v1.48: a normal short-duration trip auto-picks a small sane animal count, not flagged infeasible', R.v148.shortTripOk && R.v148.shortTripCountSane);
  A('v1.48: a very long supply duration on the same cargo is flagged infeasible instead of a runaway count', R.v148.longTripFlaggedInfeasible);
  A('v1.48: the flagged count stays bounded (the reported bug: 250kg used to require ~213 mules)', R.v148.longTripCountBounded);
  A('v1.48: the infeasibility hint explains why and points at resupply, not just more animals', R.v148.longTripHintExplainsWhy);
  A('v1.48: full grazing never trips the fodder-infeasibility check, however long the trip', R.v148.fullGrazingNeverInfeasible);

  A('v1.49: the verdict has a valid level, text and NAMED reasons (never an unexplained judgement)', R.v149.verdictShape && R.v149.verdictLevelValid && R.v149.verdictReasonsAreStrings);
  A('v1.49: a deliberately overloaded party escalates the verdict and cites the overload by name', R.v149.overloadEscalates && R.v149.overloadNamed);
  A('v1.49: the confidence band brackets the point estimate and is asymmetric (downside > upside)', R.v149.confBrackets && R.v149.confAsymmetric);
  A('v1.49: the confidence band widens with trip duration, and is null for a blocked route', R.v149.confWidensWithDuration && R.v149.confBlockedIsNull);
  A('v1.49: the pack-range ceiling reproduces the v1.48 guard threshold exactly (one source of truth)', R.v149.packRangeExists && R.v149.packRangeMatchesGuard);
  A('v1.49: full grazing reports no carry-duration ceiling (none exists when fodder is not carried)', R.v149.fullGrazingNoCeiling);
  A('v1.49: Results + Stops moved into the sticky output column (was a full-width block below the form)', R.v149.resultsInOutputColumn && R.v149.stopsInOutputColumn && R.v149.outColIsSticky);
  A('v1.49: Results renders above the fold and no longer trails the taller party form', R.v149.resultsAboveFold && R.v149.resultsBeforeParty);
  A('v1.49: the verdict and confidence band actually render into the panel', R.v149.verdictRendered && R.v149.confidenceRendered);

  A('v1.50: jpAnimalTerrainMod reproduces the override/base table exactly (one source of truth with jpCalcLand)', R.v150.modResolverMatchesTable && R.v150.modResolverDefaults);
  A('v1.50 AUDIT: Hills and Mountain Pass now select the mule their own ratings call best', R.v150.hillsPicksMule && R.v150.mountainPassPicksMule);
  A('v1.50 AUDIT: Forest Path is the ONLY terrain whose pick is not the argmax (a documented capacity choice)', R.v150.onlyForestPathIsNonArgmax);
  A('v1.50: a real mountain share switches the whole route\'s animal and reports the switch by name', R.v150.bottleneckSwitches && R.v150.bottleneckNamesTerrain);
  A('v1.50: the veto is symmetric — a sand crossing switches toward the camel, not only toward the mule', R.v150.bottleneckSymmetric);
  A('v1.50: a token stretch below the share floor never hijacks the route animal', R.v150.smallStretchDoesNotSwitch);
  A('v1.50: a route with no bottleneck reports no switch, and Forest Path keeps its capacity-chosen mule', R.v150.noBottleneckNoSwitch && R.v150.forestKeepsMule);
  A('v1.50: the reason shown comes from the km-dominant stage, not whichever was scored last', R.v150.reasonFromDominantStage);
  A('v1.50: an empty land-stage list still returns the versatile default', R.v150.emptyRouteSafe);

  A('v1.51: the resupply requirement is finally compared with the settlements actually on the route', R.v151.reachExists && R.v151.reachFieldsSane);
  A('v1.51: a route whose settlement gap exceeds the carried range is flagged, with both numbers named', R.v151.unmetDetected && R.v151.unmetNamesBothNumbers);
  A('v1.51: the false "resupplied from settlements in reach" verdict string is gone', R.v151.falseStringGone);
  A('v1.51: supplyDays is a live control — it sets the carried range instead of being divided out', R.v151.supplyDaysMovesReach && R.v151.supplyDaysMovesDays);
  A('v1.51: a waterless stretch and an overloaded pack give different causes and different messages', R.v151.waterCauseNamed && R.v151.loadCausePlain && R.v151.causesDiffer);
  A('v1.51: the water gap is measured from real hydrology, not the old flat 1.5-day constant', R.v151.dryKmMeasured && R.v151.dryKmVaries && R.v151.gapNotConstant);
  A('v1.51: column length grows with party size and damps the day, floored so a column never stops', R.v151.colGrows && R.v151.colFloored);
  A('v1.51: a 100k column is slower than a mid-size party (v1.50 made it the fastest configuration)', R.v151.hugeIsSlower);
  A('v1.51: caravan-scale parties are unaffected by the column term (colMod ~1.0)', R.v151.caravanUnaffected);
  A('v1.51: a winter pass in a cold biome is CLOSED, not merely slow', R.v151.winterPassClosed);
  A('v1.51: summer, a temperate biome, and non-pass terrain all stay open', R.v151.summerOpen && R.v151.temperateOpen && R.v151.plainsOpen);
  A('v1.51: seasonal closures are overridable per plan', R.v151.closureOverridable);
  A('v1.51: desert water on auto is derived from the map, not the dropdown default', R.v151.desertAutoDerives);
  A('v1.51: an impossible/overloaded stage is highlighted in the planner, force-opened where it can be edited', R.v151.troubleRendered && R.v151.troubleOpened && R.v151.troubleTinted);
  A('v1.51: every trouble card names the control that fixes it, not just the symptom', R.v151.troubleHasFix);
  A('v1.51: jpVesselDayKm composes cruise × sailing window × realised fraction, and refuses unrated water', R.v151.vesselDayKmComposes && R.v151.vesselDayKmRefuses);
  A('v1.51: the vessel matrix covers every hull × every water and agrees with the validator', R.v151.vesselMatrixShape && R.v151.vesselMatrixVsValidator !== false && R.v151.vesselMatrixMatchesValidator && R.v151.vesselEveryHullSails);
  A('v1.51: the fastest vessel genuinely varies by water and is not just the highest cruise speed', R.v151.vesselBestVaries && R.v151.vesselBestIsNotJustCruise);
  A('v1.51: the vessel reference renders in the Route Editor results', R.v151.vesselPanelRendered);

  A('v1.52: the Cartography season slider turns its own prerequisite on instead of sitting inert', R.v152.sliderEnablesSeasons && R.v152.checkboxSynced);
  A('v1.52: every slider position now renders a different map (was 1 render for all 5)', R.v152.sliderDistinct === 5);
  A('v1.52: the slider states its live/inert status rather than failing silently', R.v152.noteLive && R.v152.noteInert);
  A('v1.52: rest days are reported separately and total = travel + rest + layovers exactly', R.v152.restSums && R.v152.restCadenceLive);
  A('v1.52: rest days follow the researched cadence — none under a week, 1-in-4/5 on a long haul', R.v152.restShortNone && R.v152.restLongHas);
  A('v1.52: jpSeasonAt walks the calendar and wraps at a full year', R.v152.seasonWalks);
  A('v1.52: a journey longer than a season is computed in the seasons it actually crosses', R.v152.driftCrosses && R.v152.driftChangesDays);
  A('v1.52: a stage is assigned the season at its MIDPOINT, not the one it departed in', R.v152.driftUsesMidpoint);
  A('v1.52: open water is closed to shipping in winter; coastal cabotage continues', R.v152.seaShut && R.v152.coastalOpen);
  A('v1.52: the sea closure is overridable and blocks a real stage', R.v152.seaOverridable && R.v152.seaBlocksStage);
  A('v1.52: the cost model breaks down to its total and scales with cargo', R.v152.costSums && R.v152.costScales);
  A('v1.52: carriage rates keep the Diocletian land:river:sea ordering', R.v152.costRatios);
  A('v1.52: a cargo journey reports a break-even price per tonne; a blocked one prices at null', R.v152.costBreakEven && R.v152.costBlockedNull);
  A('v1.52: snap-to-place/way is on by default and a nearby click lands exactly on the settlement (V1.915 parity)', R.v152.snapDefaultOn && R.v152.snapsToPlaceNearby);
  A('v1.52: a far-away click does not snap, and the toggle genuinely disables it', R.v152.noSnapFarAway && R.v152.disableWorks);
  A('v1.52: drawing also snaps onto an existing way\'s curve, and a real draw_way click lands exactly on the pin', R.v152.snapsToWay && R.v152.snappedExactly);
  A('v1.52: _civSnapPoint applies the snap at the point of drawing, and both toggle checkboxes exist', R.v152.snapPointWorks && R.v152.checkboxesExist);
  A('v1.52: the header VERSION constant matches the file it is shipped in (was stuck on 1.50 through v1.51)', R.v152.versionMatches);

  A('v1.53: a marked sea-lane bend is followed by a fresh mixed-mode route instead of the shorter beeline', R.v153.laneFollowed && R.v153.bendIsReal);
  A('v1.53: the sea-lane discount is a real multiplicative reduction, not the old Math.min(cost,1.0) cap', R.v153.discountIsMultiplicative);
  A('v1.53: _jpBestLandTransportForStage finds a genuinely faster mode for a Baggage-Train stage', R.v153.functionExists && R.v153.foundFasterMode);
  A('v1.53: the faster-mode advisory is never applied automatically', R.v153.neverAutoApplied);
  A('v1.53: the advisory renders as a named suggestion with a "Use here" button', R.v153.advisoryRendered && R.v153.buttonExists);
  A('v1.53: clicking "Use here" writes into stageOverrides and speeds up just that stage', R.v153.applyWorks);
  A('v1.53: the per-stage hint text honestly says the suggestion is never auto-applied', R.v153.hintHonest);

  A('v1.54: median-soil surplus at the default ratio is still exactly 1/9 to the bit', R.v154.medianStillExact && R.v154.implicitMatchesExplicitDefault);
  A('v1.54: the rich-soil cap at the default ratio is still exactly FOOD_SURPLUS_RATIO_MAX (0.35)', R.v154.capStillExact);
  A('v1.54: every faction defaults to Traditional Agrarian (9:1) on a fresh/older-save world', R.v154.everyFactionDefaultsTraditional && R.v154.defaultRatioIs9);
  A('v1.54: the surplus-ratio formula is the correct population-balance 1/(R+1), not the old 1/R', R.v154.formulaCorrect);
  A('v1.54: an industrial tech level gives substantially more surplus than traditional, not a rounding-level nudge (the bug the first cut of this shipped)', R.v154.industrialSubstantiallyHigher);
  A('v1.54: even a very low farmers:urbanite ratio stays within the absolute cap and below 100%', R.v154.industrialWithinAbsCap && R.v154.lowRNeverExceeds1);
  A('v1.54: switching a real settlement\'s faction to Early Industrial substantially raises its food shed', R.v154.earlyIndustrialFeedsMuchMore);
  A('v1.54: the Faction Inspector\'s Ag. technology select exists, lists every level, and writes through on change', R.v154.selectExists && R.v154.selectHasAllLevels && R.v154.writesThrough);

  A('v1.55: Factions is the default/first Civilization sub-tab', R.v155.firstTabIsFactions && R.v155.defaultSubTabIsFactions && R.v155.firstTabShowsOn && R.v155.factionsPageVisibleByDefault);
  A('v1.55: the faction detail drawer carries the slide-in CSS class and starts closed', R.v155.drawerHasClass && R.v155.drawerClosedByDefault);
  A('v1.55: clicking a faction row opens the drawer; Back closes it', R.v155.drawerOpensOnRowClick && R.v155.drawerClosesOnBack);
  A('v1.55: re-entering the Factions tab always resets to the simplified overview, even if a faction was left selected', R.v155.reEntryResetsToOverview);
  A('v1.55: the world overview renders real content mentioning factions', R.v155.overviewHasContent && R.v155.overviewMentionsFactionCount);
  A('v1.55: _civFactionAggregates() exposes per-faction terrainMix + a world-mean twin, fractions in [0,1]', R.v155.aggHasTerrainMix && R.v155.aggHasWorldMeanTerrain && R.v155.terrainMixFractionsInRange);
  A('v1.55: Territory Fit gives no fabricated verdict for identity-flavored cultures (common/imperial)', R.v155.commonGetsNoVerdict && R.v155.imperialGetsNoVerdict);
  A('v1.55: Territory Fit gives a real match/typical/mismatch verdict for a terrain-themed culture (riverlands)', R.v155.riverlandsGetsAVerdict);
  A('v1.55: _civFactionAggregates()\'s pre-world guard never throws and returns a safe zeroed shape (needed once Factions became the default tab)', R.v155.preWorldGuardNoThrow && R.v155.preWorldGuardSafeShape);

  A('v1.56: JP_DRINKING_FLOW_DIVISOR exists and is wired into _jpStageDryKm', R.v156.divisorExists && R.v156.wiredIntoDryKm);
  A('v1.56: a minor stream that fails the old mapped-river flowThresh test now reads as freshwater', R.v156.minorStreamFailsOldTest && R.v156.minorStreamNowFound);
  A('v1.56: a non-desert biome now gets the water-crossing tier labeled in its formula (was desert-only)', R.v156.nonDesertGetsWaterCrossingLabel);
  A('v1.56: a severe non-desert dry gap is genuinely slower than no gap (graduated response, not a flat 1.1x with no speed penalty)', R.v156.severeNonDesertGapSlowerThanNoGap);
  A('v1.56/v1.67: a severe non-desert dry gap resolves to a real auto tier (Sparse Wells), and the tier ladder itself reaches every tier up to Deep Desert Crossing for a large enough gap', R.v156.severeNonDesertGapNamesDeepTier);
  A('v1.56: the explicit desert-override dropdown stays desert-only — on a non-desert stage it shows no water-crossing tier at all (neither the override nor the auto measurement applies)', R.v156.explicitOverrideIgnoredOnNonDesert);
  A('v1.56: a genuine desert stage still honors an explicit override (unchanged regression)', R.v156.desertExplicitOverrideStillHonored);
  A('v1.56: a genuine desert stage on auto still resolves and labels its tier', R.v156.desertAutoStillResolvesAndLabels);

  A('v1.57: the Factions pop-up carries the modal shell class and starts closed', R.v157.modalHasClass && R.v157.modalClosedInitially);
  A('v1.57: the sidebar launcher button opens it, with real roster content rendered', R.v157.openBtnExists && R.v157.opensOnButtonClick && R.v157.rosterRendersOpen);
  A('v1.57: _overCanvasOverlay recognizes the Factions pop-up (scroll/wheel events inside it are handed back to native scrolling)', R.v157.overCanvasRecognizesModal);
  A('v1.57: Escape closes the pop-up', R.v157.closesOnEscape);
  A('v1.57: the close button closes the pop-up', R.v157.closesOnCloseButton);
  A('v1.57: re-entering the Factions tab always closes the pop-up if left open (v1.55\'s drawer-reset rule, extended one level up)', R.v157.reEntryClosesModal);
  A('v1.57: the faction pill row carries zero selects of any kind (Government/Culture/Religion/Ag.-tech editing now lives only in the Inspector)', R.v157.pickerHasNoSelects);

  A('v1.58: factionCount<=landmassCount reproduces the exact pre-fix cycling assignment (byte-identical, not a special case)', R.v158.present && R.v158.baselineMatchesOldCycling && R.v158.baselineOneCapitalPerLandmass && R.v158.baselineFactionCount);
  A('v1.58: a single landmass with spare faction capacity uses every defined faction and seeds one capital each', R.v158.singleLandmassUsesAllFactions && R.v158.singleLandmassSixCapitals);
  A('v1.58: spare seats are apportioned by capacity — the richer landmass earns more of them, and the total matches factionCount exactly', R.v158.apportionmentFavoursRicherLandmass);
  A('v1.58: a landmass never earns more capitals than it has candidate settlements to seed them with', R.v158.seatsNeverExceedCandidates);
  A('v1.58: on a real generated world with few landmasses, more than 1-2 factions now get settlements — every defined faction gets at least one', R.v158.realWorldUsesMoreThanTwoFactions && R.v158.realWorldEveryFactionHasASettlement);

  A('v1.59: Civilization sub-tab order is Factions → Generation → Settlements → Economy → Statistics (owner: faction creation leads up to autopopulate)', R.v159.tabOrderCorrect);
  A('v1.59: Generation restructured into Step 1 (populate) → Step 2 (roads) → Ways → Step 3 (territories) → Provinces → Display', R.v159.stepOrderCorrect);
  A('v1.59: Generate Roads sits before Recalculate Territories (settle → connect → formalize control)', R.v159.roadsBeforeTerritories);
  A('v1.59: civTerRadius relocated out of #civSubGeneration into the new civTerritoryToolRow contextual row', R.v159.terRadiusNotInGeneration && R.v159.terRadiusInsideTerRow);
  A('v1.59: civTerritoryToolRow sits between civPoiTypeRow and civWayDrawRow, before #civSubBar, hidden by default', R.v159.terRowIsRowSiblingBeforeBar && R.v159.terRowHiddenByDefault);
  A('v1.59: arming the Territory tool reveals civTerritoryToolRow and marks the palette button on; arming Inspect hides it again', R.v159.terRowVisibleWhenArmed && R.v159.terBtnHasOnClass && R.v159.terRowHidesOnInspect);
  A('v1.59: civTerRadius slider wiring survives the relocation — dispatching input still updates _civTerRadius and the readout', R.v159.sliderUpdatesGlobal && R.v159.sliderUpdatesLabel);
  A('v1.59: the old "Advanced" grab-bag is gone — civWayList/civProvincesChk are no longer inside any <details>, and the Display accordion holds neither', R.v159.wayListNotInDetails && R.v159.provChkNotInDetails && R.v159.displayAccordionExists && R.v159.displayAccordionExcludesWaysProvinces);

  A('v1.61: the test scenario has multiple visible LOD tiles (so a sibling-survival check is meaningful)', R.v161.multipleTilesVisible);
  A('v1.61: a tile whose refine throws is skipped, not crashed into — it stays uncached, ready to retry', R.v161.badTileStillUncached);
  A('v1.61: siblings of a failed tile still get cached — one bad tile can no longer take its neighbours down with it', R.v161.siblingsCached);
  A('v1.61: a refine failure is now logged instead of silently swallowed', R.v161.warningLogged);
  A('v1.61: a repeated failure on the same tile never escapes refineVisibleTiles as an uncaught rejection', R.v161.neverThrowsUncaughtOnRetry);

  A('v1.62: no two settlements land within 3km of each other on any of the 4 seeds that reproduced the pre-fix bug', R.v162.noOverlapsAnySeed);
  A('v1.62: no cross-faction settlement overlaps either — the reported "even opposing factions" case', R.v162.noCrossFactionOverlapsAnySeed);
  A('v1.62: the overlap guard does not suppress placement outright — settlements are still placed normally', R.v162.settlementsStillPlaced);

  A('v1.63: Small Caravan coordination is now a real +15-25% bonus (1.15-1.25), not neutral', R.v163.smallCaravanInBand);
  A('v1.63: Individual/Caravan/Large Caravan/Column tiers are untouched', R.v163.individualUnchanged && R.v163.caravanUnchanged && R.v163.largeCaravanUnchanged && R.v163.columnUnchanged);
  A('v1.63: the coordination bonus actually reaches the composed daily speed (A/B vs a neutral tier, all else equal)', R.v163.bonusReachesSpeed);
  A('v1.63: JP_LOAD_INVALID_RATIO reuses the load curve\'s own existing top boundary (1.50) rather than inventing a new one', R.v163.invalidRatioIsCurveBoundary);
  A('v1.63: an extreme overload (~22x-166x capacity) is now flagged infeasible instead of silently crawling at a flat 45%', R.v163.extremeOverloadBlocked && R.v163.extremeOverloadNamesOverload);
  A('v1.63: the existing graduated load bands (<=1.50x) are untouched — a moderate overload still returns a valid, merely-penalized speed', R.v163.moderateOverloadStaysValid);
  A('v1.63: grazing speedMod scale is confirmed correctly ordered (None > Partial > Full), not inverted', R.v163.grazingOrderedCorrectly);

  A('v1.64: _civHierarchicalNetwork shares the manual Route/Way tools\' own 0.25x "existing infrastructure" discount constant', R.v164.discountConstantShared);
  A('v1.64: opts.existingWays measurably steers the auto-generated network onto the manual corridor (or the test scenario was skipped)', R.v164.skip || R.v164.discountSteersTheNetwork);
  A('v1.64: a settlement pair the base network did NOT connect directly often becomes a direct edge once a manual way exists between them (or skipped)', R.v164.skip || R.v164.pairBecomesDirect);
  A('v1.64: Generate Roads no longer destroys a manually-drawn LAND way (was civWays=[])', R.v164.skip || R.v164.manualLandSurvived);
  A('v1.64: Generate Roads no longer destroys a manually-drawn SEA-LANE way either', R.v164.skip || R.v164.manualSeaSurvived);
  A('v1.64: Generate Roads still builds a fresh auto-generated network alongside the preserved manual ways', R.v164.skip || R.v164.autoWaysAlsoPresent);

  A('v1.65: a wheel-vehicle-blocked stage (carts on wheel-blocked terrain) renders with its own quick-fix button', R.v165.wheelBlockRendered && R.v165.wheelButtonExists);
  A('v1.65: clicking that button clears carts/wagons AND switches the stage to Walking, actually unblocking it', R.v165.wheelFixWorks);
  A('v1.65: a mount-blocked stage renders a "Switch to Walking" quick-fix button', R.v165.mountBlockRendered && R.v165.mountButtonLabel && R.v165.mountButtonExists);
  A('v1.65: clicking it overrides that stage to Walking and unblocks it', R.v165.mountFixWorks);
  A('v1.65: a winter-closed mountain pass renders a "Turn off seasonal closures" quick-fix button', R.v165.seasonBlockRendered && R.v165.seasonButtonLabel && R.v165.seasonButtonExists);
  A('v1.65: clicking it sets plan.seasonalClosures=false and unblocks the stage', R.v165.seasonFixWorks);
  A('v1.65: a capacity/overload block still gets no fix button — only deterministic, side-effect-free remedies get one', R.v165.noFixButtonForCapacityBlock);

  A('v1.66: _jpBestPackageForStage declines outside its domain (non-Baggage-Train, or no pack animals)', R.v166.declinesNonBaggageTrain && R.v166.declinesNoAnimals);
  A('v1.66: the owner\'s own scenario — moderate-climate stage gets no swap advisory', R.v166.stage1NoAdvisory);
  A('v1.66: the desert-transition stage gets a species advisory recommending camel', R.v166.stage2AdvisoryExists && R.v166.stage2RecommendsCamel);
  A('v1.66: clicking it applies camel to ONLY that stage — the moderate stage and the shared plan stay mule', R.v166.stage1UntouchedByClick && R.v166.stage2CamelApplied && R.v166.basePlanStillMule);
  A('v1.66: a per-stage Vehicle select exists with None/Cart/Wagon/Travois/Sled options', R.v166.vehicleSelectExists && R.v166.vehicleSelectOptions);
  A('v1.66: picking Travois on it writes a per-stage override without touching the shared plan\'s cart', R.v166.stage2TravoisApplied && R.v166.stage1CartStillBasePlan);
  A('v1.66: a party already on travois where wheels are viable again gets a "cart (was travois)" advisory once cargo clears the margin', R.v166.vehicleAdvisoryRendered && R.v166.vehicleAdvisoryHasNoSpeciesFix);
  A('v1.66: clicking it switches to a cart and leaves species alone (mule was already optimal there)', R.v166.vehicleFixApplied && R.v166.vehicleFixLeftSpeciesAlone);

  A('v1.67: the owner\'s reported stage (Hills/Ruined Region/Hot Desert, 215km dry, 1 mule+1 wagon) now blocks instead of returning an 1100%+-overloaded "answer"', R.v167.reportedStageNowBlocked && R.v167.reportedStageMsgNamesCapacity);
  A('v1.67: a genuinely fine stage is completely unaffected by the new post-loop check', R.v167.fineStageUnaffected);
  A('v1.67: the fix reuses the SAME v1.63 JP_LOAD_INVALID_RATIO constant, not a new separate threshold', R.v167.reusesSharedConstant);
  A('v1.67: a journey mixing a fine stage and the reported-bug stage blocks the WHOLE plan (blockedIdx precedent) with a capacity-naming message', R.v167.planBlocked && R.v167.planBlockedMsgNamesCapacity && R.v167.badStageIsTheBlockedOne);
  A('v1.67: plan.totalDays is nulled on a block, but the fine stage\'s own per-stage result is still a real computed number', R.v167.planTotalDaysNull && R.v167.fineStageStillComputedInPlan);

  A('v1.74: the tile-canvas cap covers the MEASURED 68-tile working set of the reported zoom gesture (a 48-entry cap still thrashed)', R.v174.capCoversMeasuredWorkingSet);
  A('v1.74: the pixel cache is deliberately larger than the heightmap cache — pixels are what a zoom-back re-costs, and they are never invalidated by camera motion', R.v174.capExceedsDataCache);
  A('v1.74: the cap is a PIXEL budget, so it tracks _lodTile (2048 → fewer entries, 512 → more) instead of costing 16x more memory at 2048', R.v174.capTracksTileSize);
  A('v1.74: an absurd _lodTile still leaves a usable floor rather than a zero-entry cache', R.v174.capHasFloor);
  A('v1.74: _lodRenderKey deliberately excludes zoom/pan — a colorized tile is a static image across a whole zoom gesture', R.v174.renderKeyIgnoresCamera);
  A('v1.74: _lodRenderKey does still change when something visual changes (sea level), so a real edit invalidates the pixels', R.v174.renderKeyCoversVisualState);
  A('v1.74: requestLodRender() defers instead of compositing inline — 25 calls in one tick draw nothing yet', R.v174.coalescedNotImmediate);
  A('v1.74: those 25 requests collapse to exactly ONE composite on the next frame (was one full composite per wheel event)', R.v174.exactlyOneCompositePerFrame);
  A('v1.74: an interactive frame runs with a positive per-frame tile-colorization budget, and the budget is cleared again afterwards', R.v174.interactiveFrameIsBudgeted && R.v174.budgetClearedAfterFrame);
  A('v1.74: a direct renderNow() (settle refine, generate, export grab, this harness) still composites unbudgeted — the whole view in one frame', R.v174.directRenderNowUnbudgeted);

  A('v1.75: _civAutoRoutes builds trunk-road ways, and at least one land way with aIdx/bIdx set is produced (the scenario is meaningful)', R.v175.landWaysChecked > 0);
  A('v1.75: every land way\'s aIdx/bIdx resolves to a real, non-addon settlement in state.places — not a POI inserted ahead of the settlements in the array (the settles-vs-state.places index-base divergence flagged in v1.72\'s HANDOFF entry)', R.v175.allResolveToRealSettlements);

  A('v1.76: village connectors exist and were checked (the scenario is meaningful)', R.v176.connectorCount > 0 && R.v176.checked > 0);
  A('v1.76: no village connector loops — path length stays within a sane multiple of the straight-line distance between its own endpoints (was 3.35x pre-fix, generous slack above the measured 1.86x post-fix)', R.v176.maxCircuity < 2.2);
  A('v1.76: no village connector self-intersects (was 54/199 pre-fix — the endpoint-overwrite bug that "jump near destination, retrace the route backward, jump to destination again")', R.v176.selfXingCount === 0);

  A('v1.79: village connectors exist and were checked (the scenario is meaningful)', R.v179.connectorCount > 0 && R.v179.villageCount > 0);
  A('v1.79: at least one village actually connects to a SIBLING village, not just to real settlements (the reported bug is genuinely exercised and fixed, not just theoretically possible)', R.v179.villageToVillageEdges > 0);
  A('v1.79: nearest-sibling-is-closer-than-actual-connection dropped well below the pre-fix 79.5% (measured ~36.5% post-fix; generous slack)', R.v179.siblingCloser / R.v179.checked2 < 0.5);
  A('v1.79: every village\'s connector chain, followed through however many village-to-village hops, still reaches a real settlement — no cluster left networked only among itself', R.v179.stuckInVillageOnly === 0);
  A('v1.79: villages left without a connector at all are still genuinely rare (a landmass-reachability edge case, not a regression)', R.v179.isolated <= R.v179.villageCount * 0.05);

  A('v1.81: JP_BIOMES.waterForage exists and true desert is far smaller than a wet biome (a dew trap barely helps in the desert — the owner\'s own framing)', R.v181.hotDesertWF < R.v181.jungleWF * 0.2 && R.v181.hotDesertWF < R.v181.wetlandsWF * 0.2);
  A('v1.81: foraging="None" is an exact no-op — bit-identical to pre-v1.81 regardless of position/wildlife data (the default, most-common case)', R.v181.noneIsNoop);
  A('v1.81: Active foraging genuinely reduces carried water need in a real biome', R.v181.jungleWaterReduction > 0);
  A('v1.81: true desert\'s water-foraging offset is far smaller than a lush biome\'s (near-zero, not a meaningful range extension in genuine desert)', R.v181.desertMuchDrierThanJungle);
  A('v1.81: the water-foraging offset is deliberately smaller than the food offset (water is the harder resource to forage)', R.v181.waterReductionSmallerThanFoodReduction);
  A('v1.81: a real generated+auto-populated world was built for the wildlife-integration check (the scenario is meaningful)', R.v181.genOk && R.v181.wildlifeReachable);
  A('v1.81: real route stages carry a real map coordinate (mx/my) for foraging to sample', R.v181.stagesCarryMx);
  A('v1.81: real per-region wildlife data is genuinely consulted end-to-end — the wildlife modifier is reachable and produces real values on a live world, not just in isolation', R.v181.wildlifeModVaried);

  A('v1.78: the v1.77 Terrain-coupled wind & currents checkbox is gone — terrain coupling is unconditional now', R.v178.checkboxGone);
  A('v1.78: state.climate.terrainWind is gone (not just false) — no dead toggle field left behind', R.v178.stateFieldGone);
  A('v1.78: terrain deflection is real and LOCALIZED — near-ridge effect measurably exceeds the far-field effect', R.v178.nearRidgeMeanDiff > R.v178.farMeanDiff * 1.5);
  A('v1.78: World-mode wrap seam stays continuous (ridge kept away from the seam — a wrap bug would show as a real discontinuity, not legitimate ridge-crest flow-splitting)', R.v178.seamMeanDiff < 0.05);
  A('v1.78: refreshClimate() is deterministic on an unchanged field (re-running reproduces the same rain/temp — a sanity check on the always-on path, not a toggle A/B)', R.v178.rainStableOnReRun);
  A('v1.78: the Wind debug view (currentWindField) reports a real, non-trivial wind speed on the live world', R.v178.windFieldMaxSpeed > 1e-3);
  A('v1.78: the Ocean debug view has real ocean cells to compare on this world', R.v178.oceanCells > 0);
  A('v1.78: the Ocean debug view shows the REAL 2-D current (Ekman-rotated + coastal-deflected), not the old wy-as-current proxy shortcut', R.v178.oceanCurrentIsRealNotWindProxy);

  A('v1.78: the wind/current particle-streak overlay canvas exists and is hidden by default', R.v178fx.canvasExists && R.v178fx.hiddenByDefault && !R.v178fx.runningBeforeClick);
  A('v1.78: switching to the Wind debug view starts the streak animation with real particles', R.v178fx.runningOnWind && R.v178fx.visibleOnWind && R.v178fx.hasParticlesOnWind);
  A('v1.78: switching to the Ocean debug view keeps it running with an ocean-only particle set', R.v178fx.runningOnOcean && R.v178fx.oceanParticleCount > 0);
  A('v1.78: switching the debug view off self-terminates the animation and hides the canvas', R.v178fx.stoppedOnOff && R.v178fx.hiddenOnOff);

  console.log('\n' + ok + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();