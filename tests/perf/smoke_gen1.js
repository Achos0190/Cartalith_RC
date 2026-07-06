/* Gen1 UI smoke test — real headless Chromium (Playwright). Verifies the UI/UX chrome added in
   v0.63 (onboarding card, Layers popover proxying to #debugSeg, style presets, progressive-
   disclosure <details>, phase signal on finalize) and v0.64 (retired Edit tab / Generate sub-tabs,
   Civilization+Cartography re-homed to Explore, the unified tool palette incl. Label/Icon folded
   into _civTool, the lightweight pinned inspector, header Undo, confirm-gated Clear buttons).
   Not a pixel test — DOM + behavior.
   Usage: node tests/perf/smoke_gen1.js "Cartalith Gen1 v0.64.html"
   Env overrides: PLAYWRIGHT_DIR, CHROME_BIN. */
const path = require('path');
const PW = process.env.PLAYWRIGHT_DIR || '/opt/node22/lib/node_modules/playwright';
const CHROME = process.env.CHROME_BIN || '/opt/pw-browsers/chromium';
const { chromium } = require(PW);
const FILE = 'file://' + path.resolve(process.argv[2] || 'Cartalith Gen1 v0.64.html');

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox','--use-gl=swiftshader'] });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });
  await page.goto(FILE, { waitUntil: 'load' });
  await page.waitForTimeout(2500);   // let the deferred initial generate() + wiring settle

  const R = {};
  // 1. onboarding card shows on first run (modal — intercepts canvas) + is wired, then dismiss it
  R.onboard = await page.$eval('#onboard', el => ({ shown: getComputedStyle(el).display !== 'none', btns: el.querySelectorAll('.ob-btns button').length }));
  await page.click('#obDismiss');
  await page.waitForTimeout(100);
  R.onboardDismissed = await page.$eval('#onboard', el => getComputedStyle(el).display === 'none');
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
  R.phaseOn = await page.evaluate(() => ({ body: document.body.classList.contains('phase-explore'), chip: getComputedStyle(document.getElementById('phaseChip')).display !== 'none', genBtnDisabled: document.getElementById('genBtn').disabled }));
  await page.evaluate(() => { state.finalized = false; applyFinalizedUI(); });
  R.phaseOff = await page.evaluate(() => document.body.classList.contains('phase-explore'));

  // ---- v0.64: IA re-homing (no Edit tab / Generate sub-tabs; Civ+Carto live in Explore) ----
  R.tabs = await page.$$eval('.tab', els => els.map(e => e.dataset.tab));
  R.undoInHeader = await page.$eval('header #undoBtn', el => !!el);
  R.hasFactionPickerInGenerate = await page.evaluate(() => !!document.getElementById('generatePanel').querySelector('#civFactionPicker'));
  await page.click('[data-tab="explore"]');
  await page.waitForTimeout(150);
  R.factionPickerInExplore = await page.evaluate(() => !!document.getElementById('explorePanel').querySelector('#civFactionPicker'));
  R.mapStyleInExplore = await page.evaluate(() => !!document.getElementById('explorePanel').querySelector('#stylePresetSeg'));

  // ---- v0.64 (§4.5): unified tool palette — one button per tool, label/icon folded into _civTool ----
  R.paletteButtons = await page.$$eval('#explToolPalette [data-civtool]', els => els.map(e => e.dataset.civtool));
  R.duplicateToolButtons = await page.evaluate(() => {
    const seen = {};
    document.querySelectorAll('[data-civtool]').forEach(b => { seen[b.dataset.civtool] = (seen[b.dataset.civtool]||0)+1; });
    return Object.entries(seen).filter(([,v]) => v > 1);
  });
  await page.click('#explToolPalette [data-civtool="icon"]');
  await page.waitForTimeout(150);
  R.iconCtxVisible = await page.$eval('#carIconContextSec', el => getComputedStyle(el).display !== 'none');
  await page.click('#explToolPalette [data-civtool="label"]');
  await page.waitForTimeout(150);
  R.labelMode = await page.evaluate(() => _labelMode === true);
  R.iconCtxHiddenAfterLabel = await page.$eval('#carIconContextSec', el => getComputedStyle(el).display === 'none');
  await page.click('#explToolPalette [data-civtool="label"]');   // toggle back off
  await page.waitForTimeout(100);

  // ---- v0.64 (§4.7, lite): pinned selection inspector ----
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

  await browser.close();

  // ---- assertions ----
  let ok = 0, fail = 0;
  const A = (name, cond) => { if (cond) { ok++; console.log('ok   - ' + name); } else { fail++; console.log('FAIL - ' + name); } };
  A('no page/console errors on load', errors.length === 0);
  if (errors.length) errors.forEach(e => console.log('      ' + e));
  A('onboarding card shows on first run with 3 action buttons', R.onboard.shown && R.onboard.btns === 3);
  A('onboarding dismiss hides the card', R.onboardDismissed === true);
  A('sidebar debug picker hidden (re-housed)', R.debugSegHidden === true);
  A('Layers popover builds grouped list (>=5 groups, >=25 items)', R.layers.groups >= 5 && R.layers.items >= 25);
  A('Layers item click proxies to #debugSeg (state.debug=bclass)', R.debugAfterClick === 'bclass');
  A('Antique preset sets parchment/sepia/icons', R.vizAntique.parchment === 0.6 && R.vizAntique.sepia === 0.35 && R.vizAntique.icons === true);
  A('Antique preset marks its seg button active', R.antiqueSegOn === true);
  A('Default preset resets look to base (all off)', R.vizDefault.parchment === 0 && R.vizDefault.sepia === 0 && R.vizDefault.icons === false);
  A('progressive-disclosure <details.adv> present + collapsed', R.advDetails.count >= 3 && R.advDetails.anyOpen === false);
  A('finalize → phase-explore tint + chip + genBtn locked', R.phaseOn.body && R.phaseOn.chip && R.phaseOn.genBtnDisabled);
  A('un-finalize clears phase-explore', R.phaseOff === false);
  A('tabs are generate/explore/assets/export (no edit)', JSON.stringify(R.tabs) === JSON.stringify(['generate','explore','assets','export']));
  A('Undo button lives in header', R.undoInHeader === true);
  A('faction picker NOT in Generate (moved to Explore)', R.hasFactionPickerInGenerate === false);
  A('faction picker IS in Explore', R.factionPickerInExplore === true);
  A('Map style IS in Explore', R.mapStyleInExplore === true);
  A('unified tool palette has all 9 tools, no duplicates', JSON.stringify(R.paletteButtons) === JSON.stringify(['inspect','info','place','place_poi','label','icon','territory','draw_way','route']) && R.duplicateToolButtons.length === 0);
  A('Icon tool reveals its contextual gallery section', R.iconCtxVisible === true);
  A('Label tool sets _labelMode', R.labelMode === true);
  A('switching to Label hides the Icon gallery again', R.iconCtxHiddenAfterLabel === true);
  A('pinned inspector shows the empty state initially', R.inspectorEmptyState === true);
  A('header Undo starts disabled', R.undoDisabledInitially === true);
  A('destructive buttons carry .al-danger (>=8)', R.dangerButtons.length >= 8);
  A('Clear places does not prompt when empty', R.noConfirmWhenEmpty === true);
  A('Clear places prompts when non-empty', R.confirmedWhenNonEmpty === true);
  A('dismissing the confirm preserves the place', R.placesSurviveDismiss === true);

  console.log('\n' + ok + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
