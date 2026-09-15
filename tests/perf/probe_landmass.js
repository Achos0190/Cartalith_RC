/* v2.20 landmass-entity probe.
 *
 * The headless suite covers the pure half (kinds, keys, names, the circular centroid). This covers
 * what only a browser can reach: the map label layer actually painting, the Statistics section and
 * its rename control, persistence through serializeState, and the v2.15 search bug this version
 * fixes -- _findMapIndex read `l.text` while the one site that creates a map label writes `name`,
 * so no hand-placed label was ever findable. Nothing threw; it just returned nothing.
 *
 * Usage: node tests/perf/probe_landmass.js "Cartalith Gen1 v2.20.html"
 */
const path = require('path');
const { chromium } = require(process.env.PLAYWRIGHT_DIR || '/opt/node22/lib/node_modules/playwright');
const CHROME_BIN = process.env.CHROME_BIN || '/opt/pw-browsers/chromium';

(async () => {
  const file = process.argv[2];
  const browser = await chromium.launch({ executablePath: CHROME_BIN, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  page.on('dialog', d => d.dismiss());
  const errs = []; page.on('pageerror', e => errs.push(String(e).slice(0, 200)));
  await page.goto('file://' + path.resolve(file), { waitUntil: 'load', timeout: 120000 });
  await page.waitForTimeout(400);

  const out = await page.evaluate(async () => {
    const R = {};
    state.tect.seed = 12345; state.resW = 256; GW = 256; GH = gridH(GW); allocate();
    await generate();
    const ob = document.getElementById('onboard'); if (ob) ob.style.display = 'none';

    const lms = currentLandmasses();
    R.count = lms.length;
    R.top = lms.slice(0, 4).map(l => ({ name: l.name, kind: l.kind, km2: Math.round(l.km2), share: +l.share.toFixed(4) }));

    /* --- the v2.15 search bug --------------------------------------------------------------- */
    state.labels.push({ x: 40, y: 40, name: '__ProbeLabel__', angle: 0, arc: 0, size: 16 });
    const midx = _findMapIndex();
    R.labelFindable = midx.some(e => e.kind === 'label' && e.label === '__ProbeLabel__');
    R.labelsUseName = !midx.some(e => e.kind === 'label' && e.label === undefined);
    R.landmassInSearch = midx.some(e => e.kind === 'landmass' && e.label === lms[0].name);
    R.landmassSearchCount = midx.filter(e => e.kind === 'landmass').length;
    state.labels = state.labels.filter(l => l.name !== '__ProbeLabel__');

    /* --- the map label layer ----------------------------------------------------------------- */
    R.defaultOff = state.viz.landmassLabels === false;
    const chk = document.getElementById('landmassLabelChk');
    R.checkboxExists = !!chk;
    state.viz.landmassLabels = true; syncUI();
    R.syncUIReflects = chk && chk.checked === true;
    state.viz.landmassLabels = false; syncUI();
    R.syncUIReflectsOff = chk && chk.checked === false;
    chk.click();
    R.clickWritesState = state.viz.landmassLabels === true;

    /* Paint with and without, and count non-transparent pixels on the civ overlay. A drawn label
       must be measurably MORE ink -- "the code ran" is not the claim being made. */
    const cv = document.getElementById('civCanvas');
    const ink = () => { const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data; let k = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 8) k++; return k; };
    state.viz.landmassLabels = false; renderNow(); const inkOff = ink();
    state.viz.landmassLabels = true; renderNow(); const inkOn = ink();
    R.inkOff = inkOff; R.inkOn = inkOn;
    R.labelsPaint = inkOn > inkOff;
    state.viz.landmassLabels = false; renderNow();

    /* --- the Statistics section + rename ------------------------------------------------------ */
    _civSubTab = 'statistics';
    _civRenderStatisticsPage();
    const host = document.getElementById('civStatisticsBody');
    R.statsHasBlock = /Landmasses/.test(host.textContent);
    R.statsNamesTop = host.textContent.indexOf(String(lms[0].km2 > 0 ? Math.round(lms[0].km2).toLocaleString() : '')) >= 0;
    const inputs = host.querySelectorAll('input[data-lmkey]');
    R.renameInputs = inputs.length;
    R.firstInputIsTopName = inputs.length > 0 && inputs[0].value === lms[0].name;

    const key = lms[0].key, derived = lms[0].name;
    inputs[0].value = '  Probonia  ';
    inputs[0].dispatchEvent(new Event('change', { bubbles: true }));
    R.renameStored = state.landmassNames[key] === 'Probonia';
    R.renameTrimmed = state.landmassNames[key] === 'Probonia';
    R.renameVisible = currentLandmasses()[0].name === 'Probonia' && currentLandmasses()[0].named === true;
    R.renameSurvivesSerialize = JSON.parse(JSON.stringify(serializeState())).state.landmassNames[key] === 'Probonia';
    /* Only that one. */
    R.othersUntouched = lms.length < 2 || currentLandmasses()[1].named === false;

    /* Clearing restores the DERIVED name rather than blanking it. */
    const inputs2 = document.getElementById('civStatisticsBody').querySelectorAll('input[data-lmkey]');
    inputs2[0].value = '';
    inputs2[0].dispatchEvent(new Event('change', { bubbles: true }));
    R.clearRestoresDerived = currentLandmasses()[0].name === derived && state.landmassNames[key] === undefined;

    /* --- stability: the same world names the same landmasses twice --------------------------- */
    const before = currentLandmasses().map(l => l.name);
    await generate();
    const after = currentLandmasses().map(l => l.name);
    R.stableAcrossRegenerate = before.length === after.length && before.every((v, i) => v === after[i]);
    return R;
  });

  await browser.close();
  const fails = [];
  const ok = (n, c, extra) => { console.log((c ? 'ok   ' : 'FAIL ') + n + (extra != null ? '   [' + extra + ']' : '')); if (!c) fails.push(n); };

  ok('the world resolves into named landmasses', out.count > 0, out.count);
  ok('a hand-placed map label is findable by the unified search (v2.15 read `l.text`, labels carry `name`)', out.labelFindable);
  ok('no label entry has an undefined label', out.labelsUseName);
  ok('landmasses are in the search index too', out.landmassInSearch, out.landmassSearchCount + ' entries');
  ok('the label layer is off by default', out.defaultOff);
  ok('the toggle exists in the real DOM', out.checkboxExists);
  ok('syncUI() reflects it (on)', out.syncUIReflects);
  ok('syncUI() reflects it (off)', out.syncUIReflectsOff);
  ok('a real click writes state', out.clickWritesState);
  ok('turning it on measurably paints more ink on the civ overlay', out.labelsPaint, out.inkOff + ' -> ' + out.inkOn);
  ok('the Statistics page carries a Landmasses block', out.statsHasBlock);
  ok('...with a rename field per listed landmass', out.renameInputs > 0, out.renameInputs);
  ok('...pre-filled with the current name', out.firstInputIsTopName);
  ok('a rename is stored against the positional key, trimmed', out.renameStored && out.renameTrimmed);
  ok('...and is what the landmass then reports, flagged as user-given', out.renameVisible);
  ok('...and survives serializeState, so it is saved with the project', out.renameSurvivesSerialize);
  ok('...and touches only that landmass', out.othersUntouched);
  ok('clearing the field restores the DERIVED name rather than blanking it', out.clearRestoresDerived);
  ok('regenerating the same seed names the same landmasses', out.stableAcrossRegenerate);
  ok('no page errors', errs.length === 0);
  if (errs.length) console.log('  ' + errs.join('\n  '));
  console.log('\ntop landmasses: ' + JSON.stringify(out.top));
  console.log('\n' + (fails.length ? fails.length + ' FAILED' : 'all passed'));
  process.exit(fails.length ? 1 : 0);
})();
