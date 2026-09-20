/* v2.32 — gaussBlur's CPU path is the fast one, and the GPU path it replaced is not a fallback.
 *
 * This needs a real browser: the headless suite has no WebGL2, so it has always taken the CPU path
 * and cannot see the difference. Two claims, both measured here rather than asserted from reading:
 *   (1) the two implementations compute the same thing (same algorithm, float32 noise apart), and
 *   (2) the CPU one is faster at every size and radius, and its lead GROWS with radius, because it
 *       carries a running sum (O(N), radius-free) where the shader samples the whole kernel (O(N·pr)).
 * Claim (2)'s SHAPE is the load-bearing one — a machine with more cores moves the constant, not the
 * exponent — so the radius-independence check matters more than any single ratio.
 *
 * Usage: node tests/perf/probe_blur.js "Cartalith v2.32 DCC test.html"
 */
const path = require('path');
const { chromium } = require(process.env.PLAYWRIGHT_DIR || '/opt/node22/lib/node_modules/playwright');
let pass = 0, fail = 0;
const ok = (n, c, extra) => { if (c) { pass++; console.log('  ok   ' + n); }
  else { fail++; console.log('  FAIL ' + n + (extra ? '  [' + extra + ']' : '')); } };

(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME_BIN || '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
  const p = await b.newPage({ viewport: { width: 1200, height: 800 } });
  p.on('pageerror', e => console.log('  PAGEERROR ' + e.message));
  await p.goto('file://' + path.resolve(process.argv[2]), { waitUntil: 'load', timeout: 180000 });
  await p.waitForFunction(() => typeof window.generate === 'function', { timeout: 60000 });

  const r = await p.evaluate(async () => {
    /* `typeof` because an older build has no such identifier at all — a regression guard must FAIL
       on the version it guards against, not throw and take the rest of the probe down with it. Safe
       here (unlike v2.15's case): the page is fully loaded, so this const is long past its TDZ. */
    const flag = (typeof GAUSS_BLUR_GPU === 'undefined') ? 'absent' : GAUSS_BLUR_GPU;
    const out = { gpu: GPU.ok ? (GPU.enabled ? 'on' : 'off') : 'none', flag, rows: [] };
    if (!GPU.ok || !GPU.enabled || !GPU.blurOK) return out;      // no WebGL2 here: report and skip
    state.tect.seed = 12345; state.resW = 512; state.world = false;
    GW = 512; GH = gridH(GW); allocate(); state.mode = 'biome'; state.debug = 'off';
    await generate();
    const src = Float32Array.from(field), med = a => a.slice().sort((x, y) => x - y)[a.length >> 1];
    for (const rad of [6, 64]) {
      const g = [], c = [];
      for (let i = 0; i < 5; i++) {
        let t = performance.now(); const a = GPU.blurArr(src, rad, false); g.push(performance.now() - t);
        const e = GPU.enabled; GPU.enabled = false;
        t = performance.now(); const q = gaussBlur(src, rad, GW, GH, false); c.push(performance.now() - t);
        GPU.enabled = e;
        if (i === 0) { let d = 0; for (let k = 0; k < a.length; k++) d = Math.max(d, Math.abs(a[k] - q[k]));
          out.rows.push({ rad, maxDiff: d }); }
      }
      const o = out.rows[out.rows.length - 1]; o.gpuMs = med(g); o.cpuMs = med(c);
    }
    /* the live default really is the CPU path — measured through gaussBlur itself, GPU left enabled */
    let t = performance.now(); gaussBlur(src, 64, GW, GH, false); out.liveMs = performance.now() - t;
    return out;
  });

  console.log('\n=== gaussBlur: which path, and is it the fast one? (WebGL2 ' + r.gpu + ') ===');
  ok('the GPU blur route is off by default', r.flag === false,
    r.flag === 'absent' ? 'GAUSS_BLUR_GPU does not exist in this build' : String(r.flag));
  if (r.gpu !== 'on') {
    console.log('  -- no WebGL2 in this browser; the timing half of this probe cannot run --');
  } else {
    for (const o of r.rows)
      console.log('   r=' + String(o.rad).padStart(2) + '   GPU ' + o.gpuMs.toFixed(1).padStart(7) +
        ' ms   CPU ' + o.cpuMs.toFixed(1).padStart(7) + ' ms   maxDiff ' + o.maxDiff.toExponential(1));
    const lo = r.rows[0], hi = r.rows[1];
    ok('the two implementations agree to float32 noise — it is one algorithm, two hosts',
      lo.maxDiff < 1e-5 && hi.maxDiff < 1e-5, lo.maxDiff.toExponential(1) + ' / ' + hi.maxDiff.toExponential(1));
    ok('the CPU path is faster at a small radius', lo.cpuMs < lo.gpuMs,
      lo.cpuMs.toFixed(1) + ' vs ' + lo.gpuMs.toFixed(1) + ' ms');
    ok('...and by a wider margin at a large one', hi.cpuMs < hi.gpuMs && (hi.gpuMs / hi.cpuMs) > (lo.gpuMs / lo.cpuMs),
      (lo.gpuMs / lo.cpuMs).toFixed(1) + 'x -> ' + (hi.gpuMs / hi.cpuMs).toFixed(1) + 'x');
    /* The claim that survives a change of machine: the CPU cost barely moves with radius while the
       shader's scales with it. A 10x radius must not cost anything like 10x on the CPU. */
    ok('the CPU blur is near radius-independent (a running sum, not a kernel scan)',
      hi.cpuMs < lo.cpuMs * 3, 'r=6 ' + lo.cpuMs.toFixed(1) + ' ms -> r=64 ' + hi.cpuMs.toFixed(1) + ' ms');
    ok('...where the shader is not', (hi.gpuMs / lo.gpuMs) > 2,
      (hi.gpuMs / lo.gpuMs).toFixed(1) + 'x for 10x the radius');
    ok('a live gaussBlur call takes the CPU path even with WebGL2 up',
      r.liveMs < hi.gpuMs * 0.6, r.liveMs.toFixed(1) + ' ms vs the GPU route\'s ' + hi.gpuMs.toFixed(1) + ' ms');
  }
  console.log('\n' + (pass + fail) + ' assertions: ' + pass + ' passed, ' + fail + ' failed');
  await b.close();
  process.exit(fail ? 1 : 0);
})();
