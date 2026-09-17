#!/usr/bin/env node
/* v2.56 — the render prologue's derived fields are generation-keyed.
 *   node tests/perf/probe_renderfields.js "Cartalith v2.56 DCC test.html"
 *
 * Two claims, and the second is the one that makes the first safe:
 *   1. A repeat render REUSES every field (builder call count 0) and is BYTE-IDENTICAL.
 *   2. Touching any input a builder reads REBUILDS that field and CHANGES the pixels.
 * (1) alone would pass on a cache that never invalidates — which is a stale render, not a speedup.
 * Both are measured against the same build through the real renderNow(), never a reimplementation.
 * Hard-errors on v2.55 and earlier: `renderFieldCached` does not exist there. */
const path=require('path');
const {chromium}=require(process.env.PLAYWRIGHT_DIR||'/opt/node22/lib/node_modules/playwright');
const FILE=process.argv[2]||'Cartalith v2.56 DCC test.html';
let pass=0, fail=0;
const ok=(n,c,d)=>{ (c?pass++:fail++); console.log((c?'  ok   - ':'  FAIL - ')+n+(d?'   '+d:'')); };

(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium',args:['--no-sandbox']});
  const pg=await b.newPage({viewport:{width:1400,height:900}});
  pg.on('pageerror',e=>console.log('PAGEERROR '+e.message));
  await pg.goto('file://'+path.resolve(FILE));
  await pg.waitForFunction(()=>typeof generate==='function',{timeout:120000});

  const R=await pg.evaluate(async()=>{
    if(typeof renderFieldCached!=='function') throw new Error('needs v2.56+ (renderFieldCached)');
    state.world=false; state.resW=512; state.mapWidthKm=800; state.tect.seed=12345;
    await generate();
    Object.assign(state.viz,{ao:0.5,crest:0.5,svf:0.5,shadows:0.5,waves:1,sdfCoast:1,sdfRivers:1,sdfBiomes:1});
    const RN=_civBakeRN||renderNow;   /* the civ bake cache would hide everything behind a 1 ms hit */

    /* count real builder calls */
    const BUILDERS={ao:'buildAOField',crest:'buildCrestField',svf:'buildSVFField',shadow:'buildSunShadowField',
      coastD:'computeCoastDistance',coastSDF:'buildCoastSDF',riverSDF:'buildRiverSDF',biomeBD:'buildBiomeBoundaryDist'};
    const C={};
    for(const k in BUILDERS){ const n=BUILDERS[k], orig=window[n]; C[k]=0;
      window[n]=function(){ C[k]++; return orig.apply(this,arguments); }; }
    const zero=()=>{ for(const k in C) C[k]=0; };
    const fnv=()=>{ const d=vctx.getImageData(0,0,GW,GH).data; let h=2166136261>>>0;
      for(let i=0;i<d.length;i++){ h^=d[i]; h=Math.imul(h,16777619)>>>0; } return h; };
    const render=()=>{ zero(); const t=performance.now(); RN(); return {ms:performance.now()-t, hash:fnv(), calls:Object.assign({},C)}; };

    const first=render();                 // cold: every builder must run
    const second=render();                // warm: none may run, pixels identical
    const sum=o=>Object.values(o).reduce((a,b)=>a+b,0);

    /* each perturbation names the input its builder actually reads */
    const probes=[];
    /* `expect` is the EXACT set that must rebuild — under-invalidation is a stale render and
       over-invalidation is the bug this version exists to fix, so both are failures. */
    const check=(field,label,expect,mutate)=>{
      const before=render().hash;         // settle
      mutate();
      const after=render();
      probes.push({field,label,expect,rebuilt:after.calls[field],changed:after.hash!==before,
        total:sum(after.calls), rebuiltNames:Object.keys(after.calls).filter(k=>after.calls[k]>0).sort().join(',')});
    };
    check('ao','state.viz.ao','ao',()=>{state.viz.ao=0.9;});
    check('svf','state.viz.svf','svf',()=>{state.viz.svf=0.9;});
    check('shadow','state.sunAz','shadow',()=>{state.sunAz=(state.sunAz+90)%360;});
    check('crest','state.seaLevel','coastD,coastSDF,crest',()=>{state.seaLevel=state.seaLevel+0.02;});
    check('biomeBD','_climGen (computeTemperature)','biomeBD',()=>{ state.climate.equatorTemp+=6; computeTemperature(); });
    /* _fieldGen is in EVERY key, so a field/flow change must rebuild ALL EIGHT — that is the
       contract, not a stampede: every one of them is derived from the field. */
    check('riverSDF','_fieldGen (computeFlow)','ao,biomeBD,coastD,coastSDF,crest,riverSDF,shadow,svf',()=>{ computeFlow(true); });
    return {first,second,probes,firstSum:sum(first.calls),secondSum:sum(second.calls)};
  });

  ok('cold render builds every derived field (8)', R.firstSum===8, R.firstSum+' builder calls');
  ok('a repeat render rebuilds NOTHING', R.secondSum===0, R.secondSum+' builder calls');
  ok('...and is BYTE-IDENTICAL', R.first.hash===R.second.hash, 'FNV '+R.first.hash+' vs '+R.second.hash);
  ok('the repeat render is materially quicker', R.second.ms < R.first.ms*0.5,
     R.first.ms.toFixed(0)+' ms -> '+R.second.ms.toFixed(0)+' ms');
  for(const p of R.probes){
    ok('changing '+p.label+' rebuilds '+p.field, p.rebuilt>0, 'rebuilt '+p.rebuilt+'x');
    ok('...and the pixels actually move', p.changed);
  }
  for(const p of R.probes)
    ok('changing '+p.label+' rebuilds EXACTLY the fields that read it',
       p.rebuiltNames===p.expect, 'rebuilt {'+p.rebuiltNames+'} expected {'+p.expect+'}');

  console.log('\n'+pass+' passed, '+fail+' failed');
  await b.close();
  process.exit(fail?1:0);
})();
