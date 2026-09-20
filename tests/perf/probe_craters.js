/* v2.22 physical-crater probe.
 *
 * The headless suite covers the model (count from rate x area x age, the D^-1.8 size law,
 * diameter-dependent wear). This covers the browser half: the controls, the legacy sliders being
 * disabled rather than overwritten, persistence, and generate() actually producing a different
 * surface with the model on.
 *
 * Usage: node tests/perf/probe_craters.js "Cartalith Gen1 v2.22.html"
 */
const path = require('path');
const { chromium } = require(process.env.PLAYWRIGHT_DIR || '/opt/node22/lib/node_modules/playwright');

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_BIN || '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  page.on('dialog', d => d.dismiss());
  const errs = []; page.on('pageerror', e => errs.push(String(e).slice(0, 200)));
  await page.goto('file://' + path.resolve(process.argv[2]), { waitUntil: 'load', timeout: 120000 });
  await page.waitForTimeout(400);

  const out = await page.evaluate(async () => {
    const R = {};
    const $ = id => document.getElementById(id);
    const DEFAULT_RATE = state.crater.ratePerMkm2Myr;   /* captured before any probe edit */
    R.defaultRate = DEFAULT_RATE;
    R.defaultOff = state.crater.physical === false;
    R.controlsExist = !!($('cratPhys') && $('cratRate') && $('cratAge'));
    R.rowsHiddenWhenOff = $('cratRateRow').style.display === 'none' && $('cratAgeRow').style.display === 'none';
    R.legacyEnabledWhenOff = $('crat').disabled === false && $('crata').disabled === false;

    $('cratPhys').click();
    R.clickWritesState = state.crater.physical === true;
    R.rowsShownWhenOn = $('cratRateRow').style.display !== 'none' && $('cratAgeRow').style.display !== 'none';
    R.legacyDisabledWhenOn = $('crat').disabled === true && $('crata').disabled === true;

    /* The checkbox must CHOOSE which pair is read, never overwrite the other. */
    const legacyCount = state.crater.count, legacyAge = state.crater.age;
    R.legacyPreserved = legacyCount === 100 && legacyAge === 0.5;

    state.crater.physical = false; syncUI();
    R.syncUIReflectsOff = $('cratPhys').checked === false && $('cratRateRow').style.display === 'none';
    state.crater.physical = true; syncUI();
    R.syncUIReflectsOn = $('cratPhys').checked === true && $('cratRateRow').style.display !== 'none';
    R.syncUIShowsMyr = /Myr/.test($('cratAgeV').textContent);

    /* Persistence. */
    state.crater.surfaceAgeMyr = 1200; state.crater.ratePerMkm2Myr = 0.8;
    const ser = JSON.parse(JSON.stringify(serializeState())).state.crater;
    R.serialized = ser;
    R.serializesPhysical = ser.physical === true && ser.surfaceAgeMyr === 1200 && ser.ratePerMkm2Myr === 0.8;

    /* generate() with the model on must give a different surface than with it off, and an older
       surface must carry more impact than a young one. */
    state.tect.seed = 12345; state.resW = 256; GW = 256; GH = gridH(GW); allocate();
    const sum = () => { let s = 0; for (let i = 0; i < impactField.length; i++) s += impactField[i]; return s; };
    const nz = () => { let k = 0; for (let i = 0; i < impactField.length; i++) if (impactField[i] !== 0) k++; return k; };
    state.crater.physical = false; await generate(); const legacySum = sum(), legacyCells = nz();
    state.crater.physical = true; state.crater.ratePerMkm2Myr = DEFAULT_RATE; state.crater.surfaceAgeMyr = 500;   /* the SHIPPED rate, not a probe constant */
    await generate(); const physSum = sum(), physCells = nz();
    state.crater.surfaceAgeMyr = 3000; await generate(); const oldCells = nz();
    state.crater.surfaceAgeMyr = 5; await generate(); const youngCells = nz();
    R.legacyCells = legacyCells; R.physCells = physCells; R.oldCells = oldCells; R.youngCells = youngCells;
    R.physStamps = physCells > 0;
    R.differsFromLegacy = Math.abs(physSum - legacySum) > 1e-6;
    R.youngIsNearlyPristine = youngCells < physCells;

    /* The default must land near the legacy default, which is what its rate is anchored to -- and
       the interesting claim is NOT that an old surface has more craters. Production grows linearly
       with age while obliteration removes in proportion to the standing population, so the count
       SATURATES and the survivors get LARGER. That is the terrestrial record. Instrument the
       stamper to measure the population directly rather than counting impacted cells. */
    const orig = stampOneCrater, take = age => {
      const rec = [];
      stampOneCrater = function (cx, cy, radCells) { rec.push(radCells); return orig.apply(this, arguments); };
      state.crater.physical = true; state.crater.ratePerMkm2Myr = DEFAULT_RATE; state.crater.surfaceAgeMyr = age;
      impactField.fill(0); stampCraters();
      stampOneCrater = orig;
      const cellKm = state.mapWidthKm / GW, d = rec.map(r => r * 2 * cellKm).sort((a, b) => a - b);
      return { n: d.length, median: d.length ? d[d.length >> 1] : 0, max: d.length ? d[d.length - 1] : 0 };
    };
    const a500 = take(500), a3000 = take(3000), a6000 = take(6000);
    R.ages = { a500, a3000, a6000 };
    R.defaultNearLegacy = a500.n > 60 && a500.n < 160;
    R.countSaturates = a3000.n < a500.n * 2.5 && a6000.n < a500.n * 2.5;
    R.survivorsGrowLarger = a6000.median > a500.median && a6000.max > a500.max;

    state.crater = { count: 100, age: 0.50, physical: false, ratePerMkm2Myr: 0.49, surfaceAgeMyr: 500 };
    syncUI();
    return R;
  });

  await browser.close();
  const fails = [];
  const ok = (n, c, extra) => { console.log((c ? 'ok   ' : 'FAIL ') + n + (extra != null ? '   [' + extra + ']' : '')); if (!c) fails.push(n); };
  ok('the physical model is off by default', out.defaultOff);
  ok('its three controls exist in the real DOM', out.controlsExist);
  ok('its rows are hidden while it is off', out.rowsHiddenWhenOff);
  ok('the legacy sliders are live while it is off', out.legacyEnabledWhenOff);
  ok('a real click turns it on', out.clickWritesState);
  ok('...revealing its rows', out.rowsShownWhenOn);
  ok('...and disabling the legacy sliders rather than overwriting them', out.legacyDisabledWhenOn && out.legacyPreserved);
  ok('syncUI() reflects it (off)', out.syncUIReflectsOff);
  ok('syncUI() reflects it (on)', out.syncUIReflectsOn);
  ok('the surface age reads in Myr, not a bare 0-1', out.syncUIShowsMyr);
  ok('the physical settings are saved with the project', out.serializesPhysical, JSON.stringify(out.serialized));
  ok('generate() with the model on stamps real impacts', out.physStamps, out.physCells + ' cells');
  ok('...a different surface than the legacy path', out.differsFromLegacy, out.legacyCells + ' vs ' + out.physCells + ' cells');
  ok('a young surface is nearly pristine', out.youngIsNearlyPristine, out.youngCells + ' cells at 5 Myr');
  ok('the physical default stamps about what the legacy default did — what its rate is anchored to', out.defaultNearLegacy, out.ages.a500.n + ' craters at 500 Myr');
  ok('the count SATURATES with age rather than accumulating (erosion removes in proportion)', out.countSaturates, out.ages.a500.n + ' / ' + out.ages.a3000.n + ' / ' + out.ages.a6000.n + ' at 500/3000/6000 Myr');
  ok('...and the survivors get larger, which is the terrestrial record', out.survivorsGrowLarger, 'median ' + out.ages.a500.median.toFixed(2) + ' -> ' + out.ages.a6000.median.toFixed(2) + ' km, max ' + out.ages.a500.max.toFixed(1) + ' -> ' + out.ages.a6000.max.toFixed(1) + ' km');
  ok('no page errors', errs.length === 0);
  if (errs.length) console.log('  ' + errs.join('\n  '));
  console.log('\n' + (fails.length ? fails.length + ' FAILED' : 'all passed'));
  process.exit(fails.length ? 1 : 0);
})();
