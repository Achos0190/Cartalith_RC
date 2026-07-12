/* Browser verification for the Urban Morphology PoC.
 * Loads the app in headless Chromium (repo-standard Playwright paths), waits for
 * generation, exercises the inspector (click a parcel / road / building), reads the
 * morphometrics panel, and writes screenshots.
 *
 * Usage: node tests/browser_check.js [target.html] [outDir]
 */
'use strict';
const path = require('path');
const fs = require('fs');
const PLAYWRIGHT_DIR = process.env.PLAYWRIGHT_DIR || '/opt/node22/lib/node_modules/playwright';
const CHROME_BIN = process.env.CHROME_BIN || '/opt/pw-browsers/chromium';
const { chromium } = require(PLAYWRIGHT_DIR);

(async () => {
  const target = path.resolve(process.argv[2] || 'Urban Morphology v0.1.html');
  const outDir = path.resolve(process.argv[3] || '/tmp/um-shots');
  fs.mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch({ executablePath: CHROME_BIN,
    args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const page = await browser.newPage({ viewport: { width: 1680, height: 1050 } });
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

  await page.goto('file://' + target);
  await page.waitForFunction(() => window.__UM_MODEL && document.querySelectorAll('[data-um]').length > 500, { timeout: 60000 });

  const stats = await page.evaluate(() => {
    const m = window.__UM_MODEL;
    return { seed: m.seed, pop: m.pop, edges: m.graph.edges.length, blocks: m.blocks.length,
      parcels: m.parcels.length, buildings: m.buildings.length, details: m.details.length,
      gates: m.wall.gates.length, metrics: m.metrics,
      status: document.getElementById('status').textContent,
      layers: [...document.querySelectorAll('[data-um-layer]')].map(g => g.getAttribute('data-um-layer') + ':' + g.children.length) };
  });
  console.log(JSON.stringify(stats, null, 1));

  await page.screenshot({ path: path.join(outDir, 'town-full.png'), fullPage: false });

  // inspector click-tests: parcel, street, building, wall
  const clicks = [
    ['path.parcel', 'Parcel'],
    ['path.roadfill', 'road|Street|lane|Lane'],
    ['path.bld', 'House|wing|range|Outbuilding|Church'],
    ['path.wall', 'wall']
  ];
  const inspResults = [];
  for (const [sel, expect] of clicks) {
    const r = await page.evaluate(([sel, expect]) => {
      const els = [...document.querySelectorAll(sel)];
      const el = els[Math.floor(els.length / 2)];
      if (!el) return { sel, ok: false, text: '(no element)' };
      el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      const text = document.getElementById('insp').innerText.replace(/\s+/g, ' ').slice(0, 300);
      return { sel, ok: new RegExp(expect, 'i').test(text), text };
    }, [sel, expect]);
    inspResults.push(r);
    console.log((r.ok ? 'INSPECT OK  ' : 'INSPECT FAIL') + ' ' + r.sel + ' -> ' + r.text.slice(0, 140));
  }

  // zoomed screenshot on the market for detail inspection
  await page.evaluate(() => {
    const m = window.__UM_MODEL;
    const c = m.plaza ? m.plaza.center : m.anchors.market;
    const svg = document.querySelector('svg');
    svg.setAttribute('viewBox', `${c.x - 260} ${c.y - 190} 520 380`);
  });
  await page.screenshot({ path: path.join(outDir, 'town-market.png') });

  // metrics panel screenshot region: full sidebar
  await page.screenshot({ path: path.join(outDir, 'town-panel.png'),
    clip: { x: 0, y: 0, width: 320, height: 1050 } });

  // harbour site variants: bay + open coast
  for (const kind of ['bay', 'coast']) {
    await page.evaluate((k) => {
      document.getElementById('siteKind').value = k;
      document.getElementById('gen').click();
    }, kind);
    await page.waitForFunction((k) => window.__UM_MODEL && window.__UM_MODEL.site.kind === k, kind, { timeout: 60000 });
    const hs = await page.evaluate(() => {
      const m = window.__UM_MODEL;
      return { kind: m.site.kind, parcels: m.parcels.length,
        harbourParcels: m.parcels.filter(p => p.district === 'harbour').length,
        warehouses: m.buildings.filter(b => b.kind === 'warehouse').length,
        piers: m.harbour ? m.harbour.piers.length : 0, mole: !!(m.harbour && m.harbour.mole) };
    });
    console.log('VARIANT ' + JSON.stringify(hs));
    await page.screenshot({ path: path.join(outDir, `town-${kind}.png`) });
  }

  // fortified (star fort) river town
  await page.evaluate(() => {
    document.getElementById('siteKind').value = 'river';
    document.getElementById('pop').value = '8000';
    document.getElementById('fortified').checked = true;
    document.getElementById('gen').click();
  });
  await page.waitForFunction(() => window.__UM_MODEL && window.__UM_MODEL.fortified, { timeout: 60000 });
  const fort = await page.evaluate(() => {
    const m = window.__UM_MODEL, w = m.wall;
    return { style: w.style, bastions: w.fort ? w.fort.bastions.length : 0,
      ravelins: w.fort ? w.fort.ravelins.length : 0, gates: w.gates.length,
      waterGates: w.gates.filter(g => g.water).length };
  });
  console.log('FORT ' + JSON.stringify(fort));
  await page.screenshot({ path: path.join(outDir, 'town-fort.png') });
  // zoom to a bastion salient for detail
  await page.evaluate(() => {
    const m = window.__UM_MODEL, s = m.wall.fort.bastions[Math.floor(m.wall.fort.bastions.length / 2)].salient;
    document.querySelector('svg').setAttribute('viewBox', `${s.x - 170} ${s.y - 120} 340 240`);
  });
  await page.screenshot({ path: path.join(outDir, 'town-fort-detail.png') });

  // river-through-town + big amenity-rich city, and a chain-protected harbour
  const scenarios = [
    { name: 'riverthrough', set: { siteKind: 'riverthrough', pop: '9000', fortified: false, walls: true } },
    { name: 'city-amenities', set: { siteKind: 'river', pop: '16000', fortified: false, walls: true } },
    { name: 'harbour-chain', set: { siteKind: 'bay', pop: '6000', fortified: false, walls: false, harbourDefence: 'chain' } },
    { name: 'temple-town', set: { siteKind: 'river', pop: '7000', fortified: false, walls: true, faith: 'temple', civicStyle: 'basilica' } },
    { name: 'mosque-town', set: { siteKind: 'coast', pop: '7000', fortified: false, walls: true, faith: 'mosque', harbourDefence: 'chain', civicStyle: 'auto' } },
    { name: 'landlocked', set: { siteKind: 'landlocked', pop: '6000', fortified: false, walls: true, faith: 'church', civicStyle: 'auto' } },
    { name: 'hamlet', set: { siteKind: 'landlocked', pop: '400', fortified: false, walls: false, faith: 'none' } },
    { name: 'roman-colonia', set: { culture: 'roman', siteKind: 'river', pop: '8000', fortified: false, walls: true, faith: 'temple', civicStyle: 'basilica' } },
    { name: 'islamic-medina', set: { culture: 'islamic', siteKind: 'river', pop: '7000', fortified: false, walls: true, faith: 'mosque', civicStyle: 'auto' } },
    { name: 'byzantine-city', set: { culture: 'byzantine', siteKind: 'river', pop: '7000', fortified: false, walls: true, faith: 'orthodox', civicStyle: 'auto' } },
    { name: 'chinese-capital', set: { culture: 'chinese', siteKind: 'river', pop: '7000', fortified: false, walls: true, faith: 'temple', civicStyle: 'basilica' } },
  ];
  for (const sc of scenarios) {
    await page.evaluate((s) => {
      for (const k in s) { const el = document.getElementById(k); if (el.type === 'checkbox') el.checked = s[k]; else el.value = s[k]; }
      document.getElementById('gen').click();
    }, sc.set);
    await page.waitForFunction(() => window.__UM_MODEL, { timeout: 60000 });
    const info = await page.evaluate(() => {
      const m = window.__UM_MODEL;
      return { site: m.site.kind, culture: m.culture, markets: (m.markets || []).length, civic: !!m.civic,
        harbourDef: m.harbour && m.harbour.defence ? m.harbour.defence.type : null,
        gates: m.wall.gates.map(g => g.name || (g.water ? 'water' : '?')) };
    });
    console.log('SCENARIO ' + sc.name + ' ' + JSON.stringify(info));
    await page.screenshot({ path: path.join(outDir, `town-${sc.name}.png`) });
  }
  // reset the culture selector back to medieval so it doesn't leak into any later manual use
  await page.evaluate(() => { document.getElementById('culture').value = 'medieval'; });

  await browser.close();
  const failedInsp = inspResults.filter(r => !r.ok);
  if (errors.length) { console.error('PAGE ERRORS:\n' + errors.join('\n')); process.exit(1); }
  if (failedInsp.length) { console.error('INSPECTOR FAILURES: ' + failedInsp.length); process.exit(1); }
  console.log('browser check: OK — screenshots in ' + outDir);
})().catch(e => { console.error(e); process.exit(1); });
