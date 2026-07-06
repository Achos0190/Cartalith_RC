/* Gen1 UI smoke test — real headless Chromium (Playwright). Verifies the v0.63 UI/UX chrome:
   onboarding card, Layers popover (grouped, proxies to #debugSeg), style presets (state.viz writes),
   progressive-disclosure <details>, phase signal on finalize. Not a pixel test — DOM + behavior.
   Usage: node tests/perf/smoke_gen1.js "Cartalith Gen1 v0.63.html"
   Env overrides: PLAYWRIGHT_DIR, CHROME_BIN. */
const path = require('path');
const PW = process.env.PLAYWRIGHT_DIR || '/opt/node22/lib/node_modules/playwright';
const CHROME = process.env.CHROME_BIN || '/opt/pw-browsers/chromium';
const { chromium } = require(PW);
const FILE = 'file://' + path.resolve(process.argv[2] || 'Cartalith Gen1 v0.63.html');

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

  console.log('\n' + ok + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
