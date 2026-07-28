/* Browser smoke test for the Fractal Geology Painter — real headless Chromium.
   Covers the half tests/run.sh cannot: DOM build, canvas render, pointer-driven
   painting, view switching, undo. Not a pixel test — DOM + behavior + a screenshot.
   Usage: node tests/browser_check.js ["Fractal Geology Painter v0.1.html"] */
const path = require('path');
const PW = process.env.PLAYWRIGHT_DIR || '/opt/node22/lib/node_modules/playwright';
const CHROME = process.env.CHROME_BIN || '/opt/pw-browsers/chromium';
const { chromium } = require(PW);
const fs = require('fs');

const glob = require('fs').readdirSync(path.resolve(__dirname,'..'))
  .filter(f=>/^Fractal Geology Painter v.*\.html$/.test(f)).sort();
const TARGET = process.argv[2] || glob[glob.length-1];
const FILE = 'file://' + path.resolve(__dirname,'..',TARGET);

let pass=0, fail=0;
const ok=(c,m)=>{ if(c){pass++; console.log('  ok  -',m);} else {fail++; console.error('  FAIL-',m);} };

(async () => {
  console.log('Target:', TARGET);
  const browser = await chromium.launch({ executablePath: CHROME });
  const page = await browser.newPage({ viewport:{ width:1200, height:760 } });
  const errors=[];
  page.on('pageerror', e=>errors.push(String(e)));
  page.on('console', m=>{ if(m.type()==='error') errors.push(m.text()); });
  await page.goto(FILE);
  await page.waitForTimeout(300);

  // 1. UI built
  ok(await page.locator('.feat').count() === 11, 'all 11 feature buttons rendered');
  ok(await page.locator('.viewbtn').count() === 5, '5 view buttons rendered');
  ok(await page.locator('.preset').count() === 8, '8 preset buttons rendered');
  ok(await page.evaluate(()=>typeof App==='object' && App.state.stamps.length===0), 'App exposed, stack starts empty');

  // 2. select mountains, paint a stroke across the canvas
  await page.locator('.feat', { hasText:'Mountains' }).click();
  const box = await page.locator('#map').boundingBox();
  const cx = box.x, cy = box.y;
  await page.mouse.move(cx+140, cy+300);
  await page.mouse.down();
  await page.mouse.move(cx+250, cy+270, { steps:8 });
  await page.mouse.move(cx+380, cy+300, { steps:8 });
  await page.mouse.up();
  await page.waitForTimeout(150);

  ok(await page.evaluate(()=>App.state.stamps.length===1), 'painting created exactly one stamp');
  ok(await page.evaluate(()=>App.state.stamps[0].type==='mountains'), 'stamp is a mountains feature');
  ok(await page.evaluate(()=>App.state.stamps[0].pts.length>2), 'stroke captured multiple points');
  // heightmap actually changed away from flat base
  ok(await page.evaluate(()=>{ const H=App.bakedH; const b=H[0]; for(let i=0;i<H.length;i++) if(Math.abs(H[i]-b)>0.01) return true; return false; }),
     'heightmap diverged from flat base after paint');
  ok(await page.locator('#stampCount').textContent().then(t=>t.trim()==='1'), 'stamp count badge shows 1');

  // 3. paint a river -> water layer populated
  await page.locator('.feat', { hasText:'River' }).click();
  await page.mouse.move(cx+120, cy+150);
  await page.mouse.down();
  await page.mouse.move(cx+300, cy+180, { steps:10 });
  await page.mouse.move(cx+450, cy+150, { steps:10 });
  await page.mouse.up();
  await page.waitForTimeout(150);
  ok(await page.evaluate(()=>App.state.stamps.length===2), 'river added as second stamp');
  ok(await page.evaluate(()=>{ const W=App.bakedW; for(let i=0;i<W.length;i++) if(W[i]>0) return true; return false; }),
     'river populated the water layer');

  // 4. view switching runs without error
  for(const v of ['Heightmap','Water','Contours','Slope','Terrain']){
    await page.locator('.viewbtn', { hasText:v }).click();
    await page.waitForTimeout(40);
  }
  ok(true, 'cycled through all view modes without throwing');

  // 5. preset changes tool + params
  await page.locator('.preset', { hasText:'Alps' }).click();
  ok(await page.evaluate(()=>App.state.feature==='mountains' && App.state.f.mountains.peakSharpness>1.5), 'Alps preset applied mountains params');

  // 6. undo removes the last stamp
  await page.keyboard.down('Control'); await page.keyboard.press('z'); await page.keyboard.up('Control');
  await page.waitForTimeout(120);
  ok(await page.evaluate(()=>App.state.stamps.length===1), 'undo removed the river (back to 1 stamp)');

  // 7. grid toggle
  await page.locator('#gridToggle').check();
  ok(await page.evaluate(()=>App.state.grid===true), 'grid toggle flips state');

  // screenshot for manual visual review
  await page.evaluate(()=>{ // redraw terrain with both features for the shot
    App.state.view='terrain';
  });
  await page.locator('.viewbtn', { hasText:'Terrain' }).click();
  const shot = path.resolve(__dirname, 'smoke.png');
  await page.locator('.canvas-wrap').screenshot({ path: shot });
  console.log('  screenshot ->', shot);

  ok(errors.length===0, 'no page/console errors ('+errors.length+')');
  if(errors.length) errors.slice(0,5).forEach(e=>console.error('    · '+e));

  await browser.close();
  console.log(`\n  ${pass} passed, ${fail} failed`);
  process.exit(fail?1:0);
})().catch(e=>{ console.error(e); process.exit(1); });
