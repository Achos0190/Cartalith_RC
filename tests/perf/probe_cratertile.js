#!/usr/bin/env node
/* v2.52 — a sub-cell crater RESOLVES in the tile instead of staying the floor's smear.
 *
 * v2.50 established that a crater smaller than one grid cell is not MISSING from the coarse field,
 * it is manufactured there: drawn at the 1.5-cell draw floor with its amplitude scaled by the area
 * ratio (r/floor)^2, so the material is right and the shape is wrong. That is exactly the shape
 * v2.40 found the river had — a continuous profile the coarse grid merely sampled — so a tile can
 * RE-EVALUATE it at its own resolution rather than upscale the smear.
 *
 * The correctness question is double-counting: the coarse field already carries the smear, so the
 * tile must REMOVE it (the same profile, negated amplitude) before drawing the crater at its own
 * radius. As r -> floor the two calls become the same profile with opposite signs, so the pass
 * fades to exactly nothing where the coarse grid starts resolving the feature — no blend, no tuning.
 *
 * LOD-only, so `hash_gen1.js` vs v2.51 is ALL IDENTICAL.
 *
 *   node tests/perf/probe_cratertile.js "Cartalith v2.52 DCC test.html"
 */
const path=require('path');
const PW=process.env.PLAYWRIGHT_DIR||'/opt/node22/lib/node_modules/playwright';
const {chromium}=require(PW);
const FILE=process.argv[2];
if(!FILE){ console.error('usage: probe_cratertile.js <file.html>'); process.exit(2); }
let pass=0,fail=0;
const ck=(n,c,x)=>{ if(c){pass++;console.log('ok   - '+n+(x?'   ('+x+')':''));}
                    else{fail++;console.log('FAIL - '+n+(x?'   ('+x+')':''));} };
(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium',args:['--no-sandbox']});
  const pg=await b.newPage({viewport:{width:1300,height:900}});
  pg.on('pageerror',e=>{fail++;console.log('FAIL - uncaught page error: '+e.message);});
  await pg.goto('file://'+path.resolve(FILE));
  await pg.waitForFunction(()=>typeof generate==='function',{timeout:120000});

  /* ---------- 1. the mechanism exists (this is what fails on v2.51) ---------- */
  const has=await pg.evaluate(()=>({
    tile: typeof featureFieldTile==='function',
    add:  typeof craterAddAt==='function' && typeof volcanoAddAt==='function',
    stride: typeof FEAT_STRIDE!=='undefined'?FEAT_STRIDE:null }));
  ck('featureFieldTile and the shared profile writers exist', has.tile&&has.add);
  ck('the feature-record layout is named', has.stride===10, 'FEAT_STRIDE='+has.stride);
  if(!has.tile){ console.log('\n'+pass+' passed, '+fail+' failed — target predates v2.52, stopping.');
    await b.close(); process.exit(1); }

  /* ---------- 2. THE WORKER BOUNDARY. A name missing here is a ReferenceError inside the worker,
     which v1.61's per-tile isolation turns into a SILENTLY SKIPPED TILE. Check the real source. -- */
  const wk=await pg.evaluate(()=>{ const src=GENPOOL._body();
    return { len:src.length,
      names:['featureFieldTile','craterAddAt','volcanoAddAt'].filter(n=>src.indexOf('function '+n)>=0),
      layout:/const FEAT_STRIDE=10,FEAT_CRATER=0,FEAT_VOLCANO=1;/.test(src) }; });
  ck('the worker kernel carries all three new functions', wk.names.length===3, wk.names.join(','));
  ck('...and the record layout, generated rather than retyped', wk.layout);

  /* ---------- 3. a real world with real sub-cell craters ---------- */
  const W=await pg.evaluate(async()=>{
    state.world=false; state.resW=512; state.mapWidthKm=40000; state.tect.seed=12345;
    state.crater.physical=false; state.crater.count=100;
    await generate();
    const st=_featureStamps;
    if(!st) return {n:0};
    let best=-1,bi=-1;
    for(let k=0;k+FEAT_STRIDE<=st.length;k+=FEAT_STRIDE)
      if(st[k]===FEAT_CRATER && st[k+3]>best){ best=st[k+3]; bi=k; }
    return { n:st.length/FEAT_STRIDE, GW, GH, cellKm:state.mapWidthKm/GW,
      x:st[bi+1], y:st[bi+2], r:st[bi+3], rf:st[bi+4], aC:st[bi+5], aT:st[bi+7],
      opts:Object.keys(lodTileOpts()), hasStamps:!!lodTileOpts().featureStamps };
  });
  ck('a 40 000 km world registers sub-cell stamps', W.n>0, W.n+' records');
  ck('lodTileOpts carries the registry into the tile pipeline', W.hasStamps===true);
  ck('the pooled path is still eligible — the registry is not one of the opt-in extras',
     !W.opts.some(k=>['coarseFlow','coarseOrder','fjordM','canyonM','microErode'].indexOf(k)>=0),
     W.opts.join(','));
  ck('the largest registered crater really is sub-cell, and its coarse amplitude is the area ratio',
     W.r<W.rf && Math.abs(W.aC/W.aT-(W.r/W.rf)*(W.r/W.rf))<1e-9,
     'r='+W.r.toFixed(3)+' cells ('+(W.r*2*W.cellKm).toFixed(1)+' km) drawn at '+W.rf+' cells ('+(W.rf*2*W.cellKm).toFixed(1)+' km)');

  /* ---------- 4. RESOLUTION, not invention: hold the WORLD rect fixed, vary tile resolution.
     The refinement's area in WORLD units must hold while its area in PIXELS grows — v2.40's own
     proof technique, applied to the height field instead of the colour. ---------- */
  const R=await pg.evaluate(({x,y})=>{
    const z=4, dims=pyramidDims(z), stepX=(GW-1)/dims.cols, stepY=(GH-1)/dims.rows;
    const col=Math.min(dims.cols-1,Math.floor(x/stepX)), row=Math.min(dims.rows-1,Math.floor(y/stepY));
    const bb=pyramidTileBounds(GW,GH,z,col,row);
    const o=lodTileOpts(), oOff=Object.assign({},o); delete oOff.featureStamps;
    const out=[];
    for(const ts of [64,128,256,512,1024]){
      const on=pyramidTile(field,GW,GH,z,col,row,ts,o);
      const off=pyramidTile(field,GW,GH,z,col,row,ts,oOff);
      let peak=0,px=0;
      for(let i=0;i<on.data.length;i++){ const d=Math.abs(on.data[i]-off.data[i]);
        if(d>peak)peak=d; if(d>1e-4)px++; }
      const cellsPerPx=(bb.w/Math.max(1,on.w-1))*(bb.h/Math.max(1,on.h-1));
      out.push({ts,w:on.w,h:on.h,peak,px,worldArea:px*cellsPerPx});
    }
    return {out,z,col,row,bb};
  },{x:W.x,y:W.y});
  const P=R.out;
  console.log('    tile px        peak Δ      changed px   area (coarse cells²)');
  for(const o of P) console.log('    '+String(o.w+'x'+o.h).padEnd(12)+o.peak.toExponential(3).padStart(11)+String(o.px).padStart(13)+o.worldArea.toFixed(3).padStart(12));
  ck('the refinement grows in PIXELS as the tile resolution rises',
     P[P.length-1].px > 8*P[0].px, P[0].px+' px -> '+P[P.length-1].px+' px');
  const areas=P.filter(o=>o.px>=8).map(o=>o.worldArea);
  ck('...while its area in WORLD units holds — resolution, not invention',
     areas.length>=3 && Math.max(...areas)/Math.min(...areas)<2.2,
     areas.map(a=>a.toFixed(2)).join(' / ')+' cells²');
  ck('the refined crater reaches its own true depth, far past the smear\'s',
     P[P.length-1].peak > 5*P[0].peak && P[P.length-1].peak>0,
     P[0].peak.toExponential(2)+' -> '+P[P.length-1].peak.toExponential(2));

  /* ---------- 5. it must not touch the coarse field, and must not seam ---------- */
  const S=await pg.evaluate(({z,col,row})=>{
    const F=a=>{let h=2166136261>>>0;const bb=new Uint8Array(a.buffer,a.byteOffset,a.byteLength);
      for(let i=0;i<bb.length;i++){h^=bb[i];h=Math.imul(h,16777619)>>>0;}return h>>>0;};
    const before=F(field);
    const o=lodTileOpts(), dims=pyramidDims(z);
    const A=pyramidTile(field,GW,GH,z,col,row,256,o);
    const c2=Math.min(dims.cols-1,col+1);
    const B=pyramidTile(field,GW,GH,z,c2,row,256,o);
    let seam=0;
    if(c2!==col) for(let yy=0;yy<A.h;yy++) seam=Math.max(seam,Math.abs(A.data[yy*A.w+A.w-1]-B.data[yy*B.w]));
    let bad=0; for(let i=0;i<A.data.length;i++) if(!Number.isFinite(A.data[i])||A.data[i]<0||A.data[i]>1) bad++;
    return {same:before===F(field), seam, bad, neighbour:c2!==col};
  },{z:R.z,col:R.col,row:R.row});
  ck('refining a tile never writes to the coarse field', S.same);
  ck('adjacent tiles agree on their shared column', S.neighbour && S.seam<1e-6, 'max Δ='+S.seam.toExponential(2));
  ck('every refined value stays finite and inside [0,1]', S.bad===0);

  /* ---------- 6. the crossover is silent: at the app default almost nothing is sub-cell ------- */
  const D=await pg.evaluate(async()=>{
    state.mapWidthKm=800; state.resW=512; state.tect.seed=12345;
    await generate();
    const n=_featureStamps?_featureStamps.length/FEAT_STRIDE:0;
    const z=3, dims=pyramidDims(z);
    const o=lodTileOpts(), oOff=Object.assign({},o); delete oOff.featureStamps;
    let worst=0;
    for(let col=0;col<dims.cols;col++) for(let row=0;row<dims.rows;row++){
      const on=pyramidTile(field,GW,GH,z,col,row,128,o), off=pyramidTile(field,GW,GH,z,col,row,128,oOff);
      for(let i=0;i<on.data.length;i++){ const d=Math.abs(on.data[i]-off.data[i]); if(d>worst)worst=d; }
    }
    return {n, worst};
  });
  ck('at the app default only a handful of features are sub-cell', D.n<=12, D.n+' of 100 craters + volcanoes');
  ck('...so the default world\'s tiles barely move — the pass earns its place on large maps',
     D.worst<0.02, 'worst Δ='+D.worst.toExponential(2)+' of the height range');

  console.log('\n'+pass+' passed, '+fail+' failed');
  await b.close();
  process.exit(fail?1:0);
})();
