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
  A('sidebar debug picker hidden (re-housed)', R.debugSegHidden === true);
  A('Layers popover builds grouped list (>=5 groups, >=25 items)', R.layers.groups >= 5 && R.layers.items >= 25);
  A('Layers item click proxies to #debugSeg (state.debug=bclass)', R.debugAfterClick === 'bclass');
  A('Antique preset sets parchment/sepia/icons', R.vizAntique.parchment === 0.6 && R.vizAntique.sepia === 0.35 && R.vizAntique.icons === true);
  A('Antique preset marks its seg button active', R.antiqueSegOn === true);
  A('Default preset resets look to base (all off)', R.vizDefault.parchment === 0 && R.vizDefault.sepia === 0 && R.vizDefault.icons === false);
  A('progressive-disclosure <details.adv> present + collapsed', R.advDetails.count >= 3 && R.advDetails.anyOpen === false);
  A('finalize → phase tint + chip + genBtn locked + Un-finalize stays clickable', R.phaseOn.body && R.phaseOn.chip && R.phaseOn.genBtnDisabled && R.phaseOn.unfinalizeEnabled);
  A('un-finalize clears phase-explore', R.phaseOff === false);
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
