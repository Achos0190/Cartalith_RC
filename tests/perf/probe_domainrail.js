/* v2.31 — the domain rail is the phone drawer's head, not a band above the map.
 *
 * Owner: "in smartphone mode I'd like to put the buttons for world, carto, explore and civil back on
 * top of the sidebar that is behind the hamburger button. On a phone screen it's scarce real estate."
 *
 * Every claim here is a rendered geometry or a real click, which is why this is a Playwright probe and
 * not a headless assertion — nothing about it is visible to tests/run.sh.
 *
 * Usage: node tests/perf/probe_domainrail.js "Cartalith v2.31 DCC test.html" ["Cartalith v2.30 DCC test.html"]
 *   The optional second file is the BEFORE build: the "the map got the 44px back" claim is then a
 *   measured comparison rather than an assertion against a magic number.
 */
const { chromium } = require(process.env.PLAYWRIGHT_DIR || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
let ok = 0, fail = 0;
const A = (n, c, extra) => { if (c) { ok++; console.log('ok   - ' + n); }
  else { fail++; console.log('FAIL - ' + n + (extra ? '  [' + extra + ']' : '')); } };

const boot = async (b, file, vp) => {
  const p = await b.newPage({ viewport: vp });
  p.on('pageerror', e => console.log('  PAGEERROR ' + e.message));
  await p.goto('file://' + path.resolve(file));
  await p.waitForFunction(() => typeof window.generate === 'function', { timeout: 60000 });
  return p;
};
const gen = async (p) => p.evaluate(async () => {
  state.tect.seed = 12345; state.resW = 256;
  if (typeof _setupSkipped !== 'undefined') _setupSkipped = true;
  GW = state.resW; GH = gridH(GW); allocate(); await generate();
});

(async () => {
  const FILE = process.argv[2], BEFORE = process.argv[3];
  const b = await chromium.launch({ executablePath: process.env.CHROME_BIN, args: ['--no-sandbox'] });

  /* ---------------- the setup gate still disables it ---------------- */
  {
    const p = await boot(b, FILE, { width: 390, height: 760 });
    const R = await p.evaluate(() => { const r = document.querySelector('.domain-rail'), cs = getComputedStyle(r);
      return { gated: document.body.classList.contains('setup-gated'),
               pe: cs.pointerEvents, op: parseFloat(cs.opacity) }; });
    console.log('\n--- behind the setup gate ---');
    A('the gate is up on a fresh load', R.gated);
    A('...and the rail is dimmed and inert with it', R.pe === 'none' && R.op < 0.6, R.pe + '/' + R.op);
    await p.close();
  }

  /* ---------------- phone ---------------- */
  const P = await boot(b, FILE, { width: 390, height: 760 });
  await gen(P);
  const M = await P.evaluate(async () => {
    const R = {}, g = s => document.querySelector(s);
    const rail = g('.domain-rail'), wrap = g('#dockWrap'), left = g('.dock-left'), cw = g('.canvas-wrap');
    R.oneRail = document.querySelectorAll('.domain-rail').length === 1;
    R.oneSetOfButtons = document.querySelectorAll('[data-domain]').length === 4;
    R.insideDrawer = !!(wrap && wrap.contains(rail));
    R.notInStage = rail.parentElement !== g('.stage');
    const cs = getComputedStyle(rail);
    R.sticky = cs.position === 'sticky' && cs.top === '0px';
    R.canvasTop = Math.round(cw.getBoundingClientRect().top);
    R.canvasH = Math.round(cw.getBoundingClientRect().height);

    /* open the drawer and look at it */
    g('#panelToggle').click();
    await new Promise(r => setTimeout(r, 420));
    R.open = document.body.classList.contains('panel-open');
    const rb = rail.getBoundingClientRect(), lb = left.getBoundingClientRect();
    R.aboveTheDock = rb.top < lb.top && rb.bottom <= lb.top + 1;
    R.onScreen = rb.left >= -1 && rb.right <= innerWidth + 1 && rb.width > 200;
    R.btnTouch = [...rail.querySelectorAll('.dr-btn')].every(x => x.getBoundingClientRect().height >= 44);
    /* a .dr-btn stacks its glyph over its label; squeezed into a 44px row that is a real clipping risk,
       and a clipped glyph is exactly the kind of thing a class-name assertion would never notice. */
    R.btnLegible = [...rail.querySelectorAll('.dr-btn')].every(x => {
      const gl = x.querySelector('.dr-gl').getBoundingClientRect(), tx = x.querySelector('.dr-tx').getBoundingClientRect();
      return gl.height > 3 && tx.height > 3 && gl.top >= rb.top - 0.5 && tx.bottom <= rb.bottom + 0.5; });
    R.railAtDrawerTop = Math.abs(rb.top - wrap.getBoundingClientRect().top) < 1;

    /* a real click on a domain button, from inside the drawer */
    const civ = rail.querySelector('[data-domain="civ"]');
    civ.click();
    await new Promise(r => setTimeout(r, 260));
    R.switched = civ.classList.contains('on') &&
      rail.querySelector('[data-domain="world"]').classList.contains('on') === false;
    R.panelShown = getComputedStyle(g('#genCiv')).display !== 'none';
    R.stillOpen = document.body.classList.contains('panel-open');

    /* sticky really sticks: scroll the drawer and the rail must not leave its top */
    wrap.scrollTop = 600;
    await new Promise(r => setTimeout(r, 120));
    R.scrolled = wrap.scrollTop > 100;
    R.stuck = Math.abs(rail.getBoundingClientRect().top - wrap.getBoundingClientRect().top) < 2;
    wrap.scrollTop = 0;
    return R;
  });

  console.log('\n--- phone (390x760) ---');
  A('there is exactly one rail', M.oneRail);
  A('...carrying exactly one set of four domain buttons, not a second copy', M.oneSetOfButtons);
  A('it lives inside the drawer', M.insideDrawer);
  A('...and is no longer a band in the stage', M.notInStage);
  A('the hamburger opens the drawer', M.open);
  A('the rail is the drawer\'s first band, above the tools dock', M.aboveTheDock);
  A('...flush with the drawer\'s top edge', M.railAtDrawerTop);
  A('...spanning the open drawer, on screen', M.onScreen);
  A('every button clears the 44px touch minimum', M.btnTouch);
  A('...with its glyph AND its label still inside the row, unclipped', M.btnLegible);
  A('a domain button still switches domain from in there', M.switched);
  A('...and reveals that domain\'s panel', M.panelShown);
  A('...without closing the drawer over it', M.stillOpen);
  A('the drawer scrolls', M.scrolled);
  A('...and the rail stays stuck to its top', M.stuck);
  await P.close();

  /* ---------------- desktop: nothing may move ---------------- */
  const D = await boot(b, FILE, { width: 1400, height: 900 });
  await gen(D);
  const W = await D.evaluate(() => {
    const r = s => { const e = document.querySelector(s); const b = e.getBoundingClientRect();
      return { x: Math.round(b.left), w: Math.round(b.width), top: Math.round(b.top) }; };
    return { rail: r('.domain-rail'), left: r('.dock-left'), canvas: r('.canvas-wrap'), right: r('.dock-right'),
             vertical: getComputedStyle(document.querySelector('.domain-rail')).flexDirection };
  });
  console.log('\n--- desktop (1400x900) ---');
  A('the rail is still the vertical 40px spine', W.vertical === 'column' && W.rail.w === 40, String(W.rail.w));
  A('...still between the tools dock and the map', W.left.x < W.rail.x && W.rail.x < W.canvas.x,
    W.left.x + '/' + W.rail.x + '/' + W.canvas.x);
  A('...with the information pane still last', W.canvas.x < W.right.x);
  await D.close();

  /* ---------------- the 44px, measured against the build before it ---------------- */
  if (BEFORE) {
    const p2 = await boot(b, BEFORE, { width: 390, height: 760 });
    await gen(p2);
    const B = await p2.evaluate(() => { const b = document.querySelector('.canvas-wrap').getBoundingClientRect();
      return { top: Math.round(b.top), h: Math.round(b.height) }; });
    const p3 = await boot(b, BEFORE, { width: 1400, height: 900 });
    await gen(p3);
    const B2 = await p3.evaluate(() => Math.round(document.querySelector('.canvas-wrap').getBoundingClientRect().left));
    console.log('\n--- vs ' + path.basename(BEFORE) + ' ---');
    console.log('   phone canvas: top ' + B.top + ' -> ' + M.canvasTop + ', height ' + B.h + ' -> ' + M.canvasH);
    A('the map starts higher up the phone screen', M.canvasTop < B.top, B.top + ' -> ' + M.canvasTop);
    A('...and is taller by about the 44px band it lost', Math.abs((M.canvasH - B.h) - 44) <= 2,
      '+' + (M.canvasH - B.h) + 'px');
    A('desktop map geometry is untouched', W.canvas.x === B2, B2 + ' -> ' + W.canvas.x);
    await p2.close(); await p3.close();
  }

  console.log('\n' + (ok + fail) + ' assertions: ' + ok + ' passed, ' + fail + ' failed');
  await b.close();
  process.exit(fail ? 1 : 0);
})();
