/* A/B bit-identity battery for "Cartalith Gen1 v0.57.html".
 *
 * Loads two copies of the app (baseline vs working tree) in the SAME headless Chromium with the
 * SAME flags (hashes are engine-version-dependent — Math.sin etc. are implementation-defined, so
 * golden hashes are never checked in; only two live runs in one binary are comparable), generates
 * a pinned-seed world in each, and compares FNV-1a hashes of field/temp/rain/flow and the rendered
 * canvas RGBA across a config matrix (default + individually-enabled gated render branches).
 *
 * Usage:
 *   node tests/perf/hash_gen1.js <baseline.html> <candidate.html> [--full]
 *     baseline.html is typically extracted via:
 *       git show <sha>:"Cartalith Gen1 v0.57.html" > /tmp/baseline.html
 *   --full runs the whole viz-branch matrix (used to gate the landColorCore refactor);
 *   default runs the core config set (default render + geoid + waves + AO + icons).
 *
 * Env overrides: PLAYWRIGHT_DIR, CHROME_BIN.
 */
const path = require('path');
const PLAYWRIGHT_DIR = process.env.PLAYWRIGHT_DIR || '/opt/node22/lib/node_modules/playwright';
const CHROME_BIN = process.env.CHROME_BIN || '/opt/pw-browsers/chromium';
const { chromium } = require(PLAYWRIGHT_DIR);

const SEED = 12345;
const RES = 512;             // battery resolution — cheap, and every code path is resolution-independent

/* Config matrix: name -> in-page setup run BEFORE the hashed render (world already generated).
 * Each entry exercises one gated branch of the render pipeline that the default hash cannot see. */
const CORE_CONFIGS = {
  default:   ``,
  geoid:     `state.planet.geoid.enabled=true; state.planet.geoid.amp=0.015; refreshGeoid();`,
  waves:     `state.viz.waves=true;`,
  ao:        `state.viz.ao=0.6;`,
  icons:     `state.viz.icons=true;`,
};
const FULL_CONFIGS = {
  ...CORE_CONFIGS,
  crest:       `state.viz.crest=0.6;`,
  rockSlope:   `state.viz.rockSlope=0.6;`,
  texture:     `state.viz.texture=0.6;`,
  minorStreams:`state.viz.minorStreams=0.6;`,
  ridgedRelief:`state.viz.ridgedRelief=0.6;`,
  svf:         `state.viz.svf=0.6;`,
  shadows:     `state.viz.shadows=0.6;`,
  curveShade:  `state.viz.curveShade=0.6;`,
  geology:     `state.viz.geology=0.6;`,
  wetness:     `state.viz.wetness=0.6;`,
  sdfCoast:    `state.viz.sdfCoast=0.6;`,
  sdfRivers:   `state.viz.sdfRivers=0.6;`,
  sdfBiomes:   `state.viz.sdfBiomes=0.6;`,   /* also exercises the ecoK param */
  contours:    `state.viz.contours=0.6;`,
  ink:         `state.viz.ink=0.6;`,
  hachure:     `state.viz.hachure=0.6;`,     /* exercises the gx,gy gradient params */
  watercolor:  `state.viz.watercolor=0.6;`,
  cel:         `state.viz.cel=0.6;`,
  crosshatch:  `state.viz.crosshatch=0.6;`,
  stipple:     `state.viz.stipple=0.6;`,
  sepia:       `state.viz.sepia=0.6;`,
  risograph:   `state.viz.risograph=0.6;`,
  pointillism: `state.viz.pointillism=0.6;`,
  parchment:   `state.viz.parchment=0.6;`,
  multiSun:    `state.viz.multiSun=true;`,
  bioBlend:    `state.bioBlend=0.5;`,
  seasonView:  `state.climate.seasons=true; state.viz.season=0.6;`,
  paint:       `{ const wb=currentWaterBodies(); const b=getPaintLayer('biome'), t=getPaintLayer('terrain');
                  let k=0; for(let i=0;i<wb.length&&k<4000;i++) if(wb[i]===0){ b[i]=6; t[i]=7; k++; } }`,
  hypso:       `state.mode='hypso';`,
  waterAnimOff:`` /* placeholder keeps count stable; waterAnim is RAF-only, not hashable per-frame */,
};

async function bootPage(browser, fileUrl) {
  const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
  const errs = []; page.on('pageerror', e => errs.push(String(e)));
  page.on('dialog', async d => { await d.dismiss(); });
  await page.goto(fileUrl, { waitUntil: 'load', timeout: 120000 });
  await page.waitForTimeout(500);
  return { page, errs };
}

async function genWorld(page, res, seed) {
  await page.evaluate(async ({ res, seed }) => {
    state.tect.seed = seed;
    state.resW = res; GW = res; GH = gridH(GW); allocate();
    await generate();
  }, { res, seed });
  await page.waitForTimeout(100);
}

/* FNV-1a over a byte view — same constants as the app's worldKey() */
const FNV_SRC = `
  function __fnv(bytes){ let h=2166136261>>>0;
    for(let i=0;i<bytes.length;i++){ h^=bytes[i]; h=Math.imul(h,16777619)>>>0; }
    return h>>>0; }
  function __hashF32(a){ return a?__fnv(new Uint8Array(a.buffer,a.byteOffset,a.byteLength)):0; }
`;

async function hashConfig(page, setup) {
  return page.evaluate(async ({ setup, FNV_SRC }) => {
    eval(FNV_SRC);
    // reset the viz/mode surface to defaults before applying this config
    // (fresh page per side would be cleaner but 30 configs × 2 sides × generate() is too slow;
    //  instead the world is generated once per side and each config restores what it touched)
    eval(setup);
    renderNow();
    const rgba = vctx.getImageData(0, 0, GW, GH).data;
    const out = {
      field: __hashF32(field), temp: __hashF32(tempField), rain: __hashF32(rainField),
      flow: __hashF32(flowField), rgba: __fnv(rgba),
      gpu: (typeof GPU !== 'undefined') ? (GPU.ok ? (GPU.enabled ? (GPU._r32f ? 'R32F' : 'RGBA32F') : 'off') : 'no-webgl2') : 'none',
    };
    return out;
  }, { setup, FNV_SRC });
}

/* Undo map: everything a config could have touched, restored before the next config */
const RESET = `
  state.mode='biome'; state.bioBlend=0.90;
  for(const k of ['waves','ao','icons','crest','rockSlope','texture','minorStreams','ridgedRelief','svf',
    'shadows','curveShade','geology','wetness','sdfCoast','sdfRivers','sdfBiomes','contours','ink','hachure',
    'watercolor','cel','crosshatch','stipple','sepia','risograph','pointillism','parchment','season'])
    if(k in state.viz) state.viz[k]=(k==='icons'||k==='waves')?false:0;
  state.viz.multiSun=false; state.climate.seasons=false;
  if(state.planet.geoid.enabled){ state.planet.geoid.enabled=false; refreshGeoid(); }
  paintBiome=null; paintSplat=null; paintTerrain=null;
`;

(async () => {
  const [,, baselineHtml, candidateHtml, flag] = process.argv;
  if (!baselineHtml || !candidateHtml) {
    console.error('usage: node hash_gen1.js <baseline.html> <candidate.html> [--full]');
    process.exit(2);
  }
  const configs = flag === '--full' ? FULL_CONFIGS : CORE_CONFIGS;

  const browser = await chromium.launch({
    executablePath: CHROME_BIN,
    args: ['--disable-gpu'],   // both sides deterministically take CPU fallbacks
  });

  const sides = {};
  for (const [name, file] of [['A', baselineHtml], ['B', candidateHtml]]) {
    const url = 'file://' + path.resolve(file);
    const { page, errs } = await bootPage(browser, url);
    await genWorld(page, RES, SEED);
    const res = {};
    for (const [cfg, setup] of Object.entries(configs)) {
      await page.evaluate(({ RESET }) => { eval(RESET); }, { RESET });
      res[cfg] = await hashConfig(page, setup);
    }
    sides[name] = { res, errs };
    await page.close();
  }
  await browser.close();

  let fails = 0;
  const gpuA = Object.values(sides.A.res)[0].gpu, gpuB = Object.values(sides.B.res)[0].gpu;
  if (gpuA !== gpuB) { console.log(`GPU MODE MISMATCH: A=${gpuA} B=${gpuB} — comparison invalid`); process.exit(2); }
  console.log(`GPU mode (both sides): ${gpuA}`);
  for (const cfg of Object.keys(configs)) {
    const a = sides.A.res[cfg], b = sides.B.res[cfg];
    const keys = ['field', 'temp', 'rain', 'flow', 'rgba'];
    const bad = keys.filter(k => a[k] !== b[k]);
    if (bad.length) { fails++; console.log(`FAIL  ${cfg}: mismatch on ${bad.join(',')} A=${JSON.stringify(a)} B=${JSON.stringify(b)}`); }
    else console.log(`PASS  ${cfg}  (rgba ${a.rgba})`);
  }
  for (const s of ['A', 'B']) if (sides[s].errs.length) { fails++; console.log(`PAGE ERRORS side ${s}:\n` + sides[s].errs.join('\n')); }
  console.log(fails ? `\n${fails} FAILURES` : '\nALL IDENTICAL');
  process.exit(fails ? 1 : 0);
})();
