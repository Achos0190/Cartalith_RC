#!/usr/bin/env node
/* v2.42 — the Seasons checkbox must open the render blend it just made available.
 *
 * v1.52 wired the Season (render) slider -> the "Seasons & Köppen climate" checkbox. The reverse was
 * never wired, and had the identical defect: computeSeasons() writes only the Jul/Jan/Köppen fields
 * and restores the annual rainField, so ticking the box computed everything and then drew a map that
 * is byte-identical to the unticked one.
 *
 * The load-bearing assertion is keyed to THIS build's own baseline, not an absolute: annual render
 * (A) -> tick (B) -> force season back to 0 and re-render (C). A===C proves the checkbox alone is
 * genuinely inert (so the fix is answering a real defect, not decorating a working control), and
 * B!==A proves the link makes it visible. That is the v2.39 lesson — an absolute threshold passes on
 * the broken build.
 *
 *   node tests/perf/probe_seasonlink.js "Cartalith v2.42 DCC test.html"
 */
const path=require('path');
const PW=process.env.PLAYWRIGHT_DIR||'/opt/node22/lib/node_modules/playwright';
const {chromium}=require(PW);
const FILE=process.argv[2];
if(!FILE){ console.error('usage: probe_seasonlink.js <file.html>'); process.exit(2); }

let pass=0, fail=0;
const ck=(name,cond,extra)=>{ if(cond){pass++; console.log('ok   - '+name+(extra?'   ('+extra+')':''));}
                              else{fail++; console.log('FAIL - '+name+(extra?'   ('+extra+')':''));} };

(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium',args:['--no-sandbox']});
  const pg=await b.newPage({viewport:{width:1280,height:900}});
  pg.on('pageerror',e=>{ fail++; console.log('FAIL - uncaught page error: '+e.message); });
  await pg.goto('file://'+path.resolve(FILE));
  await pg.waitForFunction(()=>typeof generate==='function'&&typeof allocate==='function',{timeout:120000});

  /* one small world, biome view, slider parked at annual, checkbox off */
  await pg.evaluate(async()=>{
    state.world=false; state.resW=192; state.tect.seed=12345; state.mode='biome';
    state.climate.seasons=false; state.viz.season=0;
    allocate(); await generate(); syncUI(); renderNow();
  });

  /* withBusy defers 20ms and the seasons pass is synchronous inside it — wait for it to land */
  const settle=()=>pg.waitForFunction(()=>{
    const o=document.getElementById('busy');
    return !o || o.style.display==='none' || getComputedStyle(o).display==='none';
  },{timeout:120000}).then(()=>pg.waitForTimeout(120));

  const fnv=()=>pg.evaluate(()=>{
    const cv=document.getElementById('view'), c=cv.getContext('2d');
    const d=c.getImageData(0,0,cv.width,cv.height).data;
    let h=2166136261>>>0;
    for(let i=0;i<d.length;i+=4){ h^=d[i]; h=Math.imul(h,16777619)>>>0; h^=d[i+1]; h=Math.imul(h,16777619)>>>0; h^=d[i+2]; h=Math.imul(h,16777619)>>>0; }
    return h>>>0;
  });
  const snap=()=>pg.evaluate(()=>({
    seasons: !!state.climate.seasons,
    season: state.viz.season,
    sliderDom: +document.getElementById('seasonR').value,
    labelDom: document.getElementById('seasonV').textContent,
    note: (document.getElementById('seasonNote')||{}).textContent||'',
    checkedDom: !!document.getElementById('seasons').checked,
  }));
  const clickSeasons=async()=>{ await pg.evaluate(()=>document.getElementById('seasons').click()); await settle(); };

  const base=await snap(), A=await fnv();
  ck('fixture: starts unticked at annual, biome view', !base.seasons && base.season===0 && base.sliderDom===0, 'label "'+base.labelDom+'"');

  /* ---- 1. ticking the box opens the blend ---- */
  await clickSeasons();
  const on=await snap(), B=await fnv();
  ck('tick: the checkbox state itself is on', on.seasons && on.checkedDom);
  ck('tick: state.viz.season left annual', on.season===1, 'season='+on.season);
  ck('tick: the slider DOM moved with it', on.sliderDom===100, 'seasonR='+on.sliderDom);
  ck('tick: the readout says July, not "annual"', on.labelDom==='Jul 100%', '"'+on.labelDom+'"');
  ck('tick: the note reports it live, not inert', /Showing July/.test(on.note), '"'+on.note.slice(0,60)+'"');

  /* ---- 2. the delta, against this build's own suppressed baseline ---- */
  const C=await pg.evaluate(()=>{ state.viz.season=0; renderNow();
    const cv=document.getElementById('view'), c=cv.getContext('2d');
    const d=c.getImageData(0,0,cv.width,cv.height).data;
    let h=2166136261>>>0;
    for(let i=0;i<d.length;i+=4){ h^=d[i]; h=Math.imul(h,16777619)>>>0; h^=d[i+1]; h=Math.imul(h,16777619)>>>0; h^=d[i+2]; h=Math.imul(h,16777619)>>>0; }
    return h>>>0;
  });
  ck('inert-without-the-link: seasons ON at annual renders the SAME map as seasons OFF', A===C, 'A='+A+' C='+C);
  ck('the link is what makes it visible: the ticked render differs', B!==A, 'B='+B+' A='+A);

  /* ---- 3. it never overwrites a choice the user already made ---- */
  await pg.evaluate(async()=>{
    state.climate.seasons=false; state.viz.season=-0.4;
    const r=document.getElementById('seasonR'); r.value=-40;
    document.getElementById('seasonV').textContent='Jan 40%';
    document.getElementById('seasons').checked=false; renderNow();
  });
  await clickSeasons();
  const keep=await snap();
  ck('existing choice: a Jan 40% blend survives ticking the box', Math.abs(keep.season+0.4)<1e-9 && keep.sliderDom===-40, 'season='+keep.season+' dom='+keep.sliderDom);

  /* ---- 4. it only ever turns ON (v1.52's own rule) ---- */
  await clickSeasons();
  const off=await snap();
  ck('untick: the checkbox goes off', !off.seasons && !off.checkedDom);
  ck('untick: the slider is NOT reset — re-ticking restores the user value', Math.abs(off.season+0.4)<1e-9 && off.sliderDom===-40, 'season='+off.season);
  ck('untick: the note says inert and names the prerequisite', /Inert here/.test(off.note) && /needs Seasons/.test(off.note), '"'+off.note.slice(0,60)+'"');

  /* ---- 5. v1.52's direction still works (regression guard on the other half) ---- */
  await pg.evaluate(async()=>{ state.climate.seasons=false; state.viz.season=0;
    document.getElementById('seasons').checked=false; const r=document.getElementById('seasonR');
    r.value=60; r.dispatchEvent(new Event('input',{bubbles:true})); });
  await settle();
  const rev=await snap();
  ck('v1.52 still holds: dragging the slider turns the checkbox on', rev.seasons && rev.checkedDom, 'season='+rev.season);

  /* ---- 6. the map-view half of the gate is deliberately not forced ---- */
  await pg.evaluate(async()=>{ state.climate.seasons=false; state.viz.season=0; state.mode='height';
    document.getElementById('seasons').checked=false; renderNow(); });
  await clickSeasons();
  const hv=await snap();
  ck('map view: the blend still opens outside Biome view', hv.season===1, 'season='+hv.season);
  ck('map view: ...but the View is NOT switched out from under the user', await pg.evaluate(()=>state.mode)==='height');
  ck('map view: the note names the remaining prerequisite', /needs the Biome map view/.test(hv.note), '"'+hv.note.slice(0,70)+'"');

  await b.close();
  console.log('\n'+pass+' passed, '+fail+' failed');
  process.exit(fail?1:0);
})().catch(e=>{ console.error(e); process.exit(1); });
