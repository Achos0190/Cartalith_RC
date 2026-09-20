#!/usr/bin/env node
/* v2.70 — the flat village-map look, as a Cartography style preset.
 *
 * Owner, having pointed at a reference village map: "And for the coloration and style can we add it
 * as a preset in the styles section under carto".
 *
 * WHY THIS IS A PRESET AND NOT A RENDERER. The audit that decided it (v2.58's rule — find which
 * half already exists): `landColorCore` is the ONE function that colours land and it has four call
 * sites — the main map's per-pixel loop, the LOD tile renderer and the flat bake — and it already
 * ends in a chain of per-pixel NPR steps each gated on its own `state.viz` key (cel, crosshatch,
 * stipple, sepia, risograph, pointillism). `seaColorCore` is its twin for water. So the whole
 * feature is one more step in each chain, one key, one row in STYLE_PRESETS and one button; every
 * surface that draws a map gets it for free, which is exactly what assertion 4 exists to prove.
 *
 * The ramp is keyed on LUMA (land) and DEPTH (sea), never on biome, for the same reason `risograph`
 * beside it is: the lit colour already carries slope, aspect, material and shading, so quantising it
 * keeps every distinction the map had and removes only the continuous gradient — which is the whole
 * of the difference between a relief map and a drawn one. The stops are not invented: they are the
 * colours this file already paints the settlement layer with, so the terrain under a town and the
 * town on top of it finally read as one drawing.
 *
 * What this asserts, and why each one rather than a cheaper cousin:
 *   - a real CLICK lands on the button (v2.46: a control the DOM has and a click cannot reach is not
 *     a control), and the slider moves with it — `syncUI` does not reflect the Painter sliders, so a
 *     preset that forgets its `extra` entry silently leaves the row lying about its own value;
 *   - the preset is not INERT (v2.42's defect: a control that computes and shows nothing) — the
 *     rendered pixels must actually move;
 *   - Default must return the render BYTE-IDENTICAL, measured inside this one build against its own
 *     baseline rather than against a number (v2.39/v2.42/v2.55). That is what makes the preset
 *     bundle ABSOLUTE rather than sticky, and it is why `village` has to be in STYLE_MANAGED_NUM;
 *   - and the palette must reach the LOD tile and the bake, not just the screen. This is the claim
 *     the whole design rests on, and it is the one that a "just tint the canvas" implementation
 *     would fail.
 *
 *   node tests/perf/probe_villagestyle.js "Cartalith v2.70 DCC test.html"
 */
const path=require('path');
const PW=process.env.PLAYWRIGHT_DIR||'/opt/node22/lib/node_modules/playwright';
const {chromium}=require(PW);
const FILE=process.argv[2];
let pass=0,fail=0;
const ck=(n,c,x)=>{ if(c){pass++;console.log('ok   - '+n+(x?'   ('+x+')':''));}
                    else{fail++;console.log('FAIL - '+n+(x?'   ('+x+')':''));} };

(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium',args:['--no-sandbox']});
  const pg=await b.newPage({viewport:{width:1500,height:980}});
  pg.on('pageerror',e=>{fail++;console.log('FAIL - uncaught page error: '+e.message);});
  await pg.goto('file://'+path.resolve(FILE));
  await pg.waitForFunction(()=>typeof generate==='function',{timeout:120000});
  await pg.evaluate(async()=>{ state.world=false; state.tect.seed=12345; state.resW=256; GW=256; GH=gridH(256);
    allocate(); await generate(); renderNow(); if(typeof _setupHide==='function')_setupHide();
    window._fnv=(a)=>{ let h=2166136261>>>0; for(let i=0;i<a.length;i++){ h^=a[i]; h=Math.imul(h,16777619)>>>0; } return h>>>0; };
    /* renderNow() FIRST: _applyStylePreset ends in render(), which is deferred, so reading the
       canvas straight after a preset returns the PREVIOUS frame — a first cut of this probe
       reported "the preset changes nothing" and then caught the change one assertion later, on the
       return to Default. Forcing the synchronous path is what makes the comparison mean anything. */
    window._screen=()=>{ renderNow(); const cv=document.getElementById('view');
      return window._fnv(cv.getContext('2d').getImageData(0,0,cv.width,cv.height).data); };
  });

  /* ── 1. the table, and the bundle's own contract ───────────────────────────────────────── */
  const tbl=await pg.evaluate(()=>({
    inPresets:!!STYLE_PRESETS.village,
    managed:STYLE_MANAGED_NUM.indexOf('village')>=0,
    recipe:JSON.stringify(STYLE_PRESETS.village),
    buttons:[...document.querySelectorAll('#stylePresetSeg button')].map(b=>b.dataset.preset),
    hasSlider:!!document.getElementById('villageR'),
    rampL:(typeof VILLAGE_RAMP!=='undefined')?VILLAGE_RAMP.length:0,
    rampS:(typeof VILLAGE_SEA!=='undefined')?VILLAGE_SEA.length:0}));
  ck('the preset is in the table and has its own button', tbl.inPresets&&tbl.buttons.indexOf('village')>=0,
     tbl.buttons.join(', '));
  ck('`village` is MANAGED, so every other preset resets it — the bundle stays absolute',
     tbl.managed, tbl.recipe);
  ck('both ramps exist and the land one has more stops than a duotone',
     tbl.rampL>=3 && tbl.rampS>=2, 'land '+tbl.rampL+' stops, sea '+tbl.rampS);
  ck('the preset has its own slider row', tbl.hasSlider);

  /* ── 2. a real click LANDS, and moves the slider with it ───────────────────────────────── */
  await pg.evaluate(()=>{ _applyStylePreset('default'); });
  const base=await pg.evaluate(()=>window._screen());
  /* the presets live in the Cartography domain panel, so a user reaches them by going there first
     — navigate the same way, by clicking the real rail button, rather than by calling _setDomain.
     A control that is only reachable once its own domain is open is correct; one that no click can
     reach is v2.46's defect, and only a real click can tell the two apart. */
  await pg.click('[data-domain="carto"]',{timeout:8000});
  /* and the preset row sits inside a collapsed category accordion, so open it the way a user does
     — by clicking its own <summary>, found by walking up from the button rather than by a
     hand-written selector that would stop describing the shell the moment it is rearranged. */
  const summarySel=await pg.evaluate(()=>{
    let n=document.querySelector('#stylePresetSeg button[data-preset="village"]');
    while(n && n.tagName!=='DETAILS') n=n.parentElement;
    if(!n) return null;
    n.id=n.id||'_probeCatAcc';
    return '#'+n.id+' > summary';
  });
  ck('the preset row lives in a Cartography category accordion', !!summarySel, summarySel||'not found');
  if(summarySel) await pg.click(summarySel,{timeout:8000});
  const railed=await pg.evaluate(()=>{
    const el=document.querySelector('#stylePresetSeg button[data-preset="village"]');
    el.scrollIntoView({block:'center'});
    const r=el.getBoundingClientRect();
    return {domain:(typeof _domain!=='undefined')?_domain:'?',
            w:Math.round(r.width),h:Math.round(r.height),
            hit:document.elementFromPoint(r.left+r.width/2,r.top+r.height/2)===el};
  });
  ck('opening Cartography and its category puts the preset button under a real cursor',
     railed.domain==='carto' && railed.w>0 && railed.h>0 && railed.hit,
     'domain '+railed.domain+', '+railed.w+'x'+railed.h+' px, hit-tested');
  await pg.click('#stylePresetSeg button[data-preset="village"]',{timeout:8000});
  const afterClick=await pg.evaluate(()=>({
    viz:state.viz.village, on:document.querySelector('#stylePresetSeg button[data-preset="village"]').classList.contains('on'),
    slider:+document.getElementById('villageR').value,
    label:document.getElementById('villageV').textContent,
    shadows:state.viz.shadows, hash:window._screen()}));
  ck('a real click applies the preset', afterClick.viz>0 && afterClick.on,
     'village='+afterClick.viz);
  ck('the slider and its label follow the preset — syncUI does not reflect Painter rows',
     afterClick.slider===Math.round(afterClick.viz*100) && afterClick.label!=='off',
     afterClick.slider+' / "'+afterClick.label+'"');
  ck('the recipe turns relief shading OFF — the ramp flattens colour, the hillshade would put the gradient back',
     afterClick.shadows===0);

  /* ── 3. it is not INERT, and Default restores the render EXACTLY ───────────────────────── */
  ck('the preset actually changes the rendered pixels', afterClick.hash!==base,
     'FNV '+base+' -> '+afterClick.hash);
  const back=await pg.evaluate(()=>{ _applyStylePreset('default'); return window._screen(); });
  ck('Default returns the render BYTE-IDENTICAL — the preset is opt-in, not sticky',
     back===base, 'FNV '+base+' -> '+back);

  /* ── 4. the palette reaches the LOD tile and the bake, not only the screen ─────────────── */
  /* the claim the design rests on: landColorCore/seaColorCore are shared, so every surface that
     draws a map gets this. A canvas-level tint would pass assertion 3 and fail this one. */
  const surf=await pg.evaluate(()=>{
    const hash=window._fnv;
    const tile=()=>{ const o=lodTileOpts(); const t=pyramidTile(field,GW,GH,3,3,2,128,o);
      const rgba=renderBiomeTileRGBA(t.data,t.w,t.h,pyramidTileBounds(GW,GH,3,3,2),o);
      return hash(rgba); };
    const bake=()=>{ const out=[]; for(let y=8;y<GH;y+=17) for(let x=8;x<GW;x+=17){
        const c=bakePixel(x,y); out.push(c[0]|0,c[1]|0,c[2]|0); } return hash(Uint8Array.from(out)); };
    /* bakePixel reads the render's shared sea caches (_seaH/_seaShade), built by a real render, AND
       the per-cell grids the EXPORT path precomputes (gridSlope/gridShade/gridShadeMeso) — which
       the interactive render never builds, so calling it cold throws inside sampleArr. Stand both
       up the way the bake itself does rather than skipping the surface: the whole design claim is
       that an exported map matches the screen, and only exercising it proves that. */
    buildGridFields();
    _applyStylePreset('default'); renderNow(); const t0=tile(), b0=bake();
    _applyStylePreset('village'); renderNow(); const t1=tile(), b1=bake();
    _applyStylePreset('default'); renderNow(); const t2=tile(), b2=bake();
    return {tileMoved:t1!==t0, bakeMoved:b1!==b0, tileBack:t2===t0, bakeBack:b2===b0};
  });
  ck('the LOD tile renderer picks the palette up (shared landColorCore/seaColorCore)',
     surf.tileMoved && surf.tileBack);
  ck('and so does the flat bake — an exported map matches the screen',
     surf.bakeMoved && surf.bakeBack);

  /* ── 5. the sea is flattened too, and not just the land ────────────────────────────────── */
  const sea=await pg.evaluate(()=>{
    /* QUANTISED distinct, not exact distinct. The blend leaves 12% of the original colour, and that
       residual carries the seabed grain, so an exact count barely moves while the sea is visibly
       flat — a first cut of this assertion read 1322 -> 1322 against a screenshot that plainly
       showed the change. Counting 16-level buckets measures BANDING, which is what "collapses onto
       a small palette" actually means. */
    const spread=()=>{ const vals=[];
      for(let y=2;y<GH;y+=3) for(let x=2;x<GW;x+=3){ const i=y*GW+x; if(field[i]>=state.seaLevel) continue;
        const c=seaColor(x,y,i,null);
        vals.push((c[0]>>4)+((c[1]>>4)<<4)+((c[2]>>4)<<8)); }
      return new Set(vals).size; };
    _applyStylePreset('default'); renderNow(); const d=spread();
    _applyStylePreset('village'); renderNow(); const v=spread();
    _applyStylePreset('default'); renderNow();
    return {dflt:d, village:v};
  });
  ck('the water collapses onto a small palette instead of a photographic ramp',
     sea.village < sea.dflt/2 && sea.village>1,
     sea.dflt+' distinct sea colours -> '+sea.village);

  await b.close();
  console.log('\n'+pass+' passed, '+fail+' failed');
  process.exit(fail?1:0);
})().catch(e=>{ console.error(e); process.exit(1); });
