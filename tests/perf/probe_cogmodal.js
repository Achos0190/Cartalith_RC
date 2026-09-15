/* v2.28 cog-menu probe.
 *
 * Two faults, each alone enough to put the ✕ out of reach:
 *   (1) `vh` resolves against the LARGE viewport, so on a phone with the address bar showing the
 *       shell is taller than the visible area (the v2.27 root cause, in the box that pass missed);
 *   (2) a flex container centring an item that overflows splits the overflow across BOTH edges and
 *       the top half cannot be scrolled to — the v1.21 `.al-slice-cv-wrap` quirk again.
 *
 * Headless Chromium cannot model the dynamic viewport (vh == the real viewport there), so (1) is
 * checked at the source and by the computed height tracking a short viewport. (2) IS reproducible:
 * force a shell taller than its container and assert the head stays reachable.
 *
 * Usage: node tests/perf/probe_cogmodal.js "Cartalith v2.28 DCC test.html"
 */
const path = require('path');
const { chromium } = require(process.env.PLAYWRIGHT_DIR || '/opt/node22/lib/node_modules/playwright');

let pass = 0, fail = 0;
const ok = (name, cond, extra) => { if (cond) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra ? '  [' + extra + ']' : '')); } };

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_BIN || '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
  const file = 'file://' + path.resolve(process.argv[2]);

  for (const vp of [{ w: 1400, h: 900, n: 'desktop 1400x900', mobile: false },
                    { w: 390, h: 720, n: 'phone 390x720', mobile: true },
                    { w: 390, h: 480, n: 'phone 390x480 (short)', mobile: true }]) {
    const page = await browser.newPage({ viewport: { width: vp.w, height: vp.h } });
    page.on('dialog', d => d.dismiss());
    await page.goto(file, { waitUntil: 'load', timeout: 120000 });
    await page.waitForTimeout(350);

    const r = await page.evaluate(() => {
      const m = document.getElementById('settingsModal');
      m.classList.add('open');
      const sh = m.querySelector('.set-shell'), hd = m.querySelector('.set-head'),
            x = document.getElementById('settingsClose');
      const R = e => { const q = e.getBoundingClientRect(); return { t: q.top, b: q.bottom, h: q.height, w: q.width }; };
      const cs = getComputedStyle(m), cshell = getComputedStyle(sh), chead = getComputedStyle(hd);
      /* getComputedStyle returns the USED margin, so `margin:auto` reads as the resolved pixel
         centring (e.g. "110px 210px"), never the literal "auto" — assert the OUTCOME instead. */
      const base = { align: cs.alignItems, overflow: cs.overflowY, shellMargin: cshell.margin,
                     headPos: chead.position, shell: R(sh), head: R(hd), close: R(x),
                     shellH: parseFloat(cshell.height), inner: innerHeight };
      /* (2) reproduce the overflow case directly: a shell taller than its container. */
      sh.style.height = (innerHeight + 260) + 'px';
      const over = { head: R(hd), close: R(x), scrollTop0: m.scrollTop, scrollH: m.scrollHeight, clientH: m.clientHeight };
      m.scrollTop = 0;
      over.headAfterScrollTop = R(hd).t;
      sh.style.height = '';
      return { base, over };
    });

    console.log('\n=== ' + vp.n + ' ===');
    const b = r.base, o = r.over;
    ok('shell fits the viewport', b.shell.h <= b.inner + 1, b.shell.h + ' vs ' + b.inner);
    ok('head fully on-screen', b.head.t >= -0.5 && b.head.b <= b.inner + 0.5, JSON.stringify(b.head));
    ok('✕ fully on-screen', b.close.t >= -0.5 && b.close.b <= b.inner + 0.5, JSON.stringify(b.close));
    ok('modal does not centre-clip (align-items != center)', b.align !== 'center', b.align);
    ok('modal is a scroll container', b.overflow === 'auto' || b.overflow === 'scroll', b.overflow);
    /* auto margins still centre it: equal gap above and below (0 when the shell fills). */
    ok('shell still centred vertically', Math.abs(b.shell.t - (b.inner - b.shell.b)) <= 1.5,
      'top ' + b.shell.t.toFixed(1) + ' vs bottom ' + (b.inner - b.shell.b).toFixed(1));
    ok('head is sticky', b.headPos === 'sticky', b.headPos);
    /* the real regression test: over-tall shell must still expose its head at scrollTop 0 */
    ok('OVERFLOW: head reachable at scroll top', o.headAfterScrollTop >= -0.5, 'top=' + o.headAfterScrollTop);
    ok('OVERFLOW: container actually scrolls', o.scrollH > o.clientH, o.scrollH + '>' + o.clientH);
    if (vp.mobile) ok('✕ is a 44px touch target', b.close.w >= 43.5 && b.close.h >= 43.5,
      b.close.w.toFixed(1) + 'x' + b.close.h.toFixed(1));
    await page.close();
  }

  /* source-level: dvh present with vh first as the fallback, in BOTH shell rules */
  const fs = require('fs'), src = fs.readFileSync(path.resolve(process.argv[2]), 'utf8');
  console.log('\n=== source ===');
  ok('base shell has vh then dvh', /height:min\(680px,90vh\);height:min\(680px,90dvh\)/.test(src));
  ok('mobile shell has vh then dvh', /height:100vh;height:100dvh/.test(src));
  ok('modal itself tracks dvh', /#settingsModal\{[^}]*height:100dvh/.test(src));
  ok('no bare 90vh/100vh left as the only height on .set-shell',
    !/\.set-shell\{[^}]*height:min\(680px,90vh\)\}/.test(src) && !/\.set-shell\{width:100vw;height:100vh\}/.test(src));

  console.log('\n' + (pass + fail) + ' assertions: ' + pass + ' passed, ' + fail + ' failed');
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
