/* Timing harness for "Cartalith Gen1 v0.57.html".
 *
 * Measures, at a pinned seed (12345):
 *  (a) generate() per-stage wall clock at 512 / 1024 / 2048 (median of 3, 1 warmup discarded)
 *      — read from the in-app PERF instrumentation;
 *  (b) renderNow() phase split (prologue / pixels / overlays), median of 20 direct calls
 *      (direct — render() would RAF-coalesce them into one);
 *  (c) a simulated civ label drag: 60 synthetic pointermove events with _civLabelDrag armed,
 *      reporting ms/move and how many full pixel-loop repaints they triggered;
 *  (d) FNV-1a hashes of field/temp/rain/flow + rendered RGBA (cross-run sanity, NOT golden values
 *      — hashes are engine-version-dependent).
 *
 * Numbers are headless-Chromium (SwiftShader WebGL2) on the current machine — treat GPU-adjacent
 * figures as software-rasterizer results, not real-GPU. Emits one JSON object on stdout.
 *
 * Usage: node tests/perf/perf_gen1.js [file.html] [--res 512,1024,2048]
 * Env overrides: PLAYWRIGHT_DIR, CHROME_BIN.
 */
const path = require('path');
const PLAYWRIGHT_DIR = process.env.PLAYWRIGHT_DIR || '/opt/node22/lib/node_modules/playwright';
const CHROME_BIN = process.env.CHROME_BIN || '/opt/pw-browsers/chromium';
const { chromium } = require(PLAYWRIGHT_DIR);

const SEED = 12345;
const median = a => { const s = [...a].sort((x, y) => x - y); return s[s.length >> 1]; };

(async () => {
  const args = process.argv.slice(2);
  const resArg = args.includes('--res') ? args[args.indexOf('--res') + 1] : '512,1024,2048';
  const resolutions = resArg.split(',').map(Number);
  const positional = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--res');
  const file = positional[0] || 'Cartalith Gen1 v0.57.html';

  const browser = await chromium.launch({ executablePath: CHROME_BIN });
  const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
  const errs = []; page.on('pageerror', e => errs.push(String(e)));
  page.on('dialog', async d => { await d.dismiss(); });
  await page.goto('file://' + path.resolve(file), { waitUntil: 'load', timeout: 120000 });
  await page.waitForTimeout(500);

  const out = { file, seed: SEED, machine: 'headless-chromium', gen: {}, render: {}, drag: null, hashes: {}, env: null };
  out.env = await page.evaluate(() => ({
    gpu: GPU.ok ? (GPU.enabled ? (GPU._r32f ? 'R32F' : 'RGBA32F') : 'off') : 'no-webgl2',
    pool: GENPOOL._tagStr || String(GENPOOL.usable),
    cores: navigator.hardwareConcurrency,
  }));

  for (const res of resolutions) {
    const stageRuns = [], totalRuns = [], flowSortRuns = [];
    const N = 4;                                   // 1 warmup + 3 measured
    for (let i = 0; i < N; i++) {
      const r = await page.evaluate(async ({ res, SEED, i }) => {
        state.tect.seed = SEED + 0;                // same seed each run — measuring, not exploring
        state.resW = res; GW = res; GH = gridH(GW); allocate();
        await generate();
        return { gen: { ...PERF.gen }, total: PERF.genTotal, flowSort: PERF.flowSortMs };
      }, { res, SEED, i });
      if (i === 0) continue;                       // discard warmup (JIT + pool spin-up)
      stageRuns.push(r.gen); totalRuns.push(r.total); flowSortRuns.push(r.flowSort);
    }
    const stages = {};
    for (const k of Object.keys(stageRuns[0])) stages[k] = +median(stageRuns.map(r => r[k])).toFixed(1);
    out.gen[res] = { total: +median(totalRuns).toFixed(0), flowSortMs: +median(flowSortRuns).toFixed(1), stages };

    // (b) render phase split at this resolution — 20 direct renderNow() calls
    const rr = await page.evaluate(() => {
      const P = [], X = [], O = [], T = [];
      for (let i = 0; i < 20; i++) {
        renderNow();
        P.push(PERF.render.prologue); X.push(PERF.render.pixels); O.push(PERF.render.overlays); T.push(PERF.render.total);
      }
      const med = a => { const s = [...a].sort((x, y) => x - y); return s[s.length >> 1]; };
      return { prologue: +med(P).toFixed(1), pixels: +med(X).toFixed(1), overlays: +med(O).toFixed(1), total: +med(T).toFixed(1) };
    });
    out.render[res] = rr;

    // (d) hashes at this resolution (sanity for cross-run comparisons of THIS harness output)
    out.hashes[res] = await page.evaluate(() => {
      function fnv(bytes) { let h = 2166136261 >>> 0; for (let i = 0; i < bytes.length; i++) { h ^= bytes[i]; h = Math.imul(h, 16777619) >>> 0; } return h >>> 0; }
      const hf = a => a ? fnv(new Uint8Array(a.buffer, a.byteOffset, a.byteLength)) : 0;
      renderNow();
      return { field: hf(field), temp: hf(tempField), rain: hf(rainField), flow: hf(flowField), rgba: fnv(vctx.getImageData(0, 0, GW, GH).data) };
    });
  }

  // (c) civ-drag simulation at the LAST measured resolution (labels live on civCanvas)
  out.drag = await page.evaluate(async () => {
    state.labels.push({ x: GW / 2, y: GH / 2, text: 'PerfProbe', size: 18, angle: 0, arc: 0 });
    drawCivLayerAuto();
    const lb = state.labels[state.labels.length - 1];
    _civLabelDrag = { label: lb, moved: false };
    const view = document.getElementById('view');
    const rect = view.getBoundingClientRect();
    const px0 = PERF.counters.renderPixelLoop, cv0 = PERF.counters.drawCivLayer;
    const t0 = performance.now();
    const MOVES = 60;
    for (let i = 0; i < MOVES; i++) {
      view.dispatchEvent(new PointerEvent('pointermove', {
        clientX: rect.left + rect.width * (0.3 + 0.4 * i / MOVES),
        clientY: rect.top + rect.height * 0.5, bubbles: true,
      }));
    }
    const ms = performance.now() - t0;
    _civLabelDrag = null;
    state.labels.pop(); drawCivLayerAuto();
    return { moves: MOVES, msPerMove: +(ms / MOVES).toFixed(2), totalMs: +ms.toFixed(0),
             pixelLoopRepaints: PERF.counters.renderPixelLoop - px0,
             civRedraws: PERF.counters.drawCivLayer - cv0 };
  });

  out.pageErrors = errs;
  console.log(JSON.stringify(out, null, 2));
  await browser.close();
  process.exit(errs.length ? 1 : 0);
})();
