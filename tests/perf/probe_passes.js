/* v2.17 generation-pass probe.
 *
 * The headless suite proves each *Pass() equals the button's own mutation. What it cannot reach is
 * the part that only exists in a browser: the four checkboxes, syncUI() reflecting them, and
 * generate() itself actually running the stage. That is what this measures, through the real DOM.
 *
 * Usage: node probe_passes.js "Cartalith Gen1 v2.17.html"
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
  await page.waitForTimeout(500);

  const out = await page.evaluate(async () => {
    const R = {};
    const fnv = a => { let h = 2166136261 >>> 0; for (let i = 0; i < a.length; i++) { h ^= Math.round(a[i] * 65536) | 0; h = Math.imul(h, 16777619) >>> 0; } return h >>> 0; };
    const IDS = ['passVeloChk', 'passGlacChk', 'passCoastChk', 'passDiffChk'];

    R.boxesExist = IDS.every(id => !!document.getElementById(id));
    R.boxesStartUnticked = IDS.every(id => document.getElementById(id).checked === false);

    /* A control that is not in syncUI() goes stale on load (this file's own v2.14 rule). Set the
       state behind the app's back, then call syncUI() and see whether the box followed. */
    state.passes.glacial = true; syncUI();
    R.syncUIReflects = document.getElementById('passGlacChk').checked === true;
    state.passes.glacial = false; syncUI();
    R.syncUIReflectsOff = document.getElementById('passGlacChk').checked === false;

    /* A real click must reach state, not just flip a box. */
    document.getElementById('passDiffChk').click();
    R.clickWritesState = state.passes.hillslope === true;
    document.getElementById('passDiffChk').click();
    R.clickClearsState = state.passes.hillslope === false;

    state.tect.seed = 12345; state.resW = 256; GW = 256; GH = gridH(GW); allocate();

    /* Baseline: every pass off. */
    await generate();
    const base = fnv(field), baseSample = field.slice(0, 64);

    /* Same seed, one pass on: the world must genuinely differ. */
    state.passes.hillslope = true;
    await generate();
    const withDiff = fnv(field);

    /* ...and turning it back off must reproduce the baseline exactly, which is what proves the
       difference came from the pass and not from generate() being non-deterministic. */
    state.passes.hillslope = false;
    await generate();
    const backToBase = fnv(field);

    R.base = base; R.withDiff = withDiff; R.backToBase = backToBase;
    R.passChangesWorld = withDiff !== base;
    R.offReproducesBaseline = backToBase === base;
    R.baselineSampleStable = field.slice(0, 64).every((v, i) => v === baseSample[i]);

    /* Each pass on its own must move the world, and differently from the others. */
    const hashes = {};
    for (const k of ['velocity', 'glacial', 'coastal', 'hillslope']) {
      state.passes[k] = true; await generate(); hashes[k] = fnv(field); state.passes[k] = false;
    }
    R.hashes = hashes;
    R.eachPassDiffersFromBase = Object.values(hashes).every(h => h !== base);
    R.passesDifferFromEachOther = new Set(Object.values(hashes)).size === 4;

    /* The stage is saved with the project, so a round-trip through serializeState must carry it. */
    state.passes.coastal = true; state.passes.velocity = true;
    const ser = JSON.parse(JSON.stringify(serializeState()));
    R.serialized = ser.state.passes;
    R.serializedCarriesPasses = !!(ser.state.passes && ser.state.passes.coastal === true && ser.state.passes.velocity === true && ser.state.passes.glacial === false);
    state.passes = { velocity: false, glacial: false, coastal: false, hillslope: false };

    /* velocityPass' side product: generate() nulls the velocity buffers at its top, so a generated
       world with the pass on must come out with them populated (the Velocity view reads them). */
    state.passes.velocity = true; await generate();
    R.veloBuffersAfterGenerate = !!(_veloVx && _veloVy && _veloWater && _veloVx.length === GW * GH);
    state.passes.velocity = false;

    return R;
  });

  await browser.close();
  const fails = [];
  const ok = (n, c) => { console.log((c ? 'ok   ' : 'FAIL ') + n); if (!c) fails.push(n); };
  ok('four checkboxes exist in the real DOM', out.boxesExist);
  ok('all four start unticked', out.boxesStartUnticked);
  ok('syncUI() reflects state.passes (on)', out.syncUIReflects);
  ok('syncUI() reflects state.passes (off)', out.syncUIReflectsOff);
  ok('a real click writes state.passes', out.clickWritesState);
  ok('a second click clears it', out.clickClearsState);
  ok('a ticked pass changes the generated world', out.passChangesWorld);
  ok('unticking it reproduces the baseline exactly', out.offReproducesBaseline);
  ok('the baseline field itself is stable across regenerates', out.baselineSampleStable);
  ok('each of the four passes changes the world on its own', out.eachPassDiffersFromBase);
  ok('the four produce four distinct worlds', out.passesDifferFromEachOther);
  ok('serializeState() carries state.passes', out.serializedCarriesPasses);
  ok('a generated world with velocity on has its velocity buffers filled', out.veloBuffersAfterGenerate);
  ok('no page errors', errs.length === 0);
  if (errs.length) console.log('  ' + errs.join('\n  '));
  console.log('\nhashes: base=' + out.base + ' ' + JSON.stringify(out.hashes));
  console.log('\n' + (fails.length ? fails.length + ' FAILED' : 'all passed'));
  process.exit(fails.length ? 1 : 0);
})();
