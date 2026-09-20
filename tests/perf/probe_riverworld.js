#!/usr/bin/env node
/* v2.72 — the 40 000 km river render: TWO defects from one screenshot.
 *
 * Owner, on a 40 000 km world (seed 61684): a screenshot of the map crossed by straight horizontal
 * lines in the river blue. `net.recv` wraps in X in world mode, so consecutive points of one stem
 * can sit at x~GW-0.5 and x~0.5. v1.29 built `splitRiverPolylines` for exactly that and applied it
 * to the stroked overlay and the GeoJSON export; v2.37 added the carve as the third site. The
 * RASTER path — `riverRenderPolys` -> `riverFieldTile`/`riverMainField`, which is the one that
 * draws at the app default, since `state.viz.riverWays` is false — never got it, so `riverFieldTile`
 * stamped a band along a segment spanning the whole map.
 *
 * Two things make this probe worth more than "the picture looks better":
 *
 *   - It asserts the MECHANISM, not only the symptom (v2.37's own rule). A segment of the geometry
 *     handed to the drawer may not span more than half the map. That holds even if the colour, the
 *     width law or the floor is retuned later.
 *   - The CONTROL is what makes it a measurement. v2.58 had already unwrapped the LENGTH here
 *     (`dx-=Math.round(dx/GW)*GW`), so the stems MEASURE correctly while still being DRAWN wrapped —
 *     which is precisely why this read as fixed for fourteen versions. Pass the previous file as a
 *     second argument and the probe requires it to carry wrapped segments; without that half a
 *     no-op patch would pass.
 *
 * Region mode cannot wrap, so the split cuts nothing there and the default render is bit-identical
 * by construction — asserted anyway, because "by construction" is a claim.
 *
 *   node tests/perf/probe_riverworld.js "Cartalith v2.72 DCC test.html" "Cartalith v2.71 DCC test.html"
 */
const path=require('path');
const PW=process.env.PLAYWRIGHT_DIR||'/opt/node22/lib/node_modules/playwright';
const {chromium}=require(PW);
const A=process.argv[2], B=process.argv[3];
if(!A){ console.error('usage: probe_riverworld.js <new.html> [<prev.html>]'); process.exit(2); }
let pass=0,fail=0;
const ck=(n,c,x)=>{ if(c){pass++;console.log('ok   - '+n+(x?'   ('+x+')':''));}
                    else{fail++;console.log('FAIL - '+n+(x?'   ('+x+')':''));} };
const note=x=>console.log('note - '+x);

const PROBE=`(function(){
  window.__mk=async function(world,km,seed,res){
    state.world=!!world; state.mapWidthKm=km; state.tect.seed=seed;
    state.resW=res; GW=state.resW; GH=gridH(GW); allocate();      /* extent BEFORE GH (v2.37) */
    state.mode='biome';
    await generate(); renderNow();
  };
  /* the geometry the raster drawer actually receives */
  window.__seam=function(){
    const polys=(typeof riverRenderPolys==='function')?riverRenderPolys():null;
    if(!polys) return {polys:0,wrapped:0,worst:0,pts:0};
    const half=GW*0.5; let wrapped=0, worst=0, pts=0;
    for(const p of polys){ const v=p.v||p; pts+=v.length;
      for(let k=1;k<v.length;k++){ const d=Math.abs(v[k].x-v[k-1].x);
        if(d>worst) worst=d;
        if(d>half) wrapped++; } }
    return {polys:polys.length, wrapped:wrapped, worst:+worst.toFixed(2), pts:pts, half:+half.toFixed(1)};
  };
  /* the rendered symptom: rows whose horizontal detail has been wiped out by a straight line */
  window.__flatRows=function(){
    const c=document.getElementById('view'), cx=c.getContext('2d');
    const W=c.width,H=c.height,d=cx.getImageData(0,0,W,H).data, rows=new Float64Array(H);
    for(let y=0;y<H;y++){ let g=0;
      for(let x=1;x<W;x++){ const i=(y*W+x)*4, j=(y*W+x-1)*4;
        g+=Math.abs((0.299*d[i]+0.587*d[i+1]+0.114*d[i+2])-(0.299*d[j]+0.587*d[j+1]+0.114*d[j+2])); }
      rows[y]=g/(W-1); }
    const s=[...rows].sort((a,b)=>a-b), med=s[H>>1];
    let flat=0; for(let y=0;y<H;y++) if(rows[y]<med*0.35) flat++;
    return {flat:flat, rows:H, med:+med.toFixed(3)};
  };
  window.__dens=function(){
    const st=(typeof mainRiverStems==='function')?(mainRiverStems()||[]):[];
    const ease=(typeof riverCoarseEase==='function')?riverCoarseEase(state.mapWidthKm):1;
    const bar=(typeof RIVER_RENDER_AREA_K!=='undefined')?RIVER_RENDER_AREA_K*ease:0;
    const polys=(typeof riverRenderPolys==='function')?(riverRenderPolys()||[]):[];
    let cells=0; for(const p of polys) cells+=(p.v||p).length;
    /* how many stems THIS BAR rejects — not how many the renderer ends up drawing, which also
       carries v2.61's pre-existing "shorter than it is drawn wide" cull. Comparing drawn against
       available conflates the two: at 800 km it reads 761 of 833 and the 72 are all v2.61's. */
    let below=0; for(const q of st) if(q.area<bar) below++;
    return {ease:+ease.toFixed(2), bar:+bar.toFixed(2),
            available:st.length, drawn:polys.length, belowBar:below,
            chanFrac:+(cells/(GW*GH)).toFixed(4)};
  };
  window.__fnv=function(a){ let h=2166136261>>>0;
    const b=new Uint8Array(a.buffer,a.byteOffset,a.byteLength);
    for(let i=0;i<b.length;i++){ h^=b[i]; h=Math.imul(h,16777619)>>>0; } return h>>>0; };
  window.__canvasFnv=function(){
    const c=document.getElementById('view'), cx=c.getContext('2d');
    const d=cx.getImageData(0,0,c.width,c.height).data;
    let h=2166136261>>>0; for(let i=0;i<d.length;i++){ h^=d[i]; h=Math.imul(h,16777619)>>>0; }
    return h>>>0; };
})();`;

(async()=>{
  const br=await chromium.launch({args:['--no-sandbox','--use-gl=swiftshader']});
  const open=async f=>{ const pg=await br.newPage({viewport:{width:1280,height:900}});
    pg.on('pageerror',e=>console.log('     pageerror: '+String(e.message).slice(0,140)));
    await pg.goto('file://'+path.resolve('/home/user/Cartalith_RC',f));
    await pg.waitForFunction(()=>typeof generate==='function',null,{timeout:180000});
    await pg.evaluate(PROBE); return pg; };

  const a=await open(A);

  // ---- the owner's world: world mode, 40 000 km ----
  await a.evaluate(()=>window.__mk(true,40000,61684,1024));
  const seamA=await a.evaluate(()=>window.__seam());
  const flatA=await a.evaluate(()=>window.__flatRows());
  note('world 40 000 km, seed 61684: '+seamA.polys+' polylines / '+seamA.pts+' points');

  ck('no drawn river segment spans more than half the map',
     seamA.wrapped===0, seamA.wrapped+' wrapped segments, worst step '+seamA.worst+' cells of '+seamA.half);
  ck('the widest step is a plausible river step, not a map width',
     seamA.worst<=1.5, 'worst '+seamA.worst+' cells');
  ck('the geometry is not empty (the split did not delete the network)',
     seamA.polys>200&&seamA.pts>5000, seamA.polys+' polys, '+seamA.pts+' pts');
  ck('few rows have their horizontal detail wiped out',
     flatA.flat<=28, flatA.flat+' of '+flatA.rows+' rows below 35% of the median row gradient');

  // ---- region mode: the split must cut nothing ----
  await a.evaluate(()=>window.__mk(false,800,12345,512));
  const seamR=await a.evaluate(()=>window.__seam());
  const rgbaR=await a.evaluate(()=>window.__canvasFnv());
  ck('region mode carries no wrapped segment at all',
     seamR.wrapped===0&&seamR.worst<=1.5, 'worst step '+seamR.worst+' cells');

  // ---- DEFECT 2: the render spent the whole DETECTION ease on what it DRAWS ----
  /* riverCoarseEase answers "does this stream EXIST" on a coarse map (v1.101). v2.57 already split
     carveFlowThresh out of it, because that says nothing about whether the grid can hold the
     stream's VALLEY. It says nothing about whether the MAP can legibly carry it either. The bar is
     K x the ease, so at and below 800 km the ease is 1 and every stem of >=2 points clears it —
     the default is unchanged BY CONSTRUCTION, which is the assertion that matters most here. */
  await a.evaluate(()=>window.__mk(true,40000,61684,1024));
  const dW=await a.evaluate(()=>window.__dens());
  await a.evaluate(()=>window.__mk(false,800,12345,512));
  const dR=await a.evaluate(()=>window.__dens());
  note('channel share of map: 40 000 km '+(dW.chanFrac*100).toFixed(2)+'%  ·  800 km '+(dR.chanFrac*100).toFixed(2)+'%');

  ck('the 800 km default culls NOTHING (ease 1 => bar 2 => every stem clears it)',
     dR.ease===1 && dR.bar===2 && dR.belowBar===0,
     'ease '+dR.ease+', bar '+dR.bar+', '+dR.belowBar+' stems below it of '+dR.available);
  ck('the 40 000 km world DOES cull, and hard',
     dW.ease>1 && dW.belowBar > dW.available*0.8,
     'ease '+dW.ease+', bar '+dW.bar+', '+dW.belowBar+' stems below it of '+dW.available);
  ck('and it lands near the region map own density, not below it',
     dW.chanFrac>0.02 && dW.chanFrac < dR.chanFrac*1.2,
     '40 000 km '+(dW.chanFrac*100).toFixed(2)+'% vs 800 km '+(dR.chanFrac*100).toFixed(2)+'%');
  ck('the bar is DERIVED from the ease, never a per-extent constant',
     dW.bar===2*dW.ease && dR.bar===2*dR.ease,
     'bar '+dW.bar+' = 2 x ease '+dW.ease+' (world) · '+dR.bar+' = 2 x '+dR.ease+' (region)');

  if(!B){ note('pass the previous version as a 2nd argument for the control half'); }
  else {
    const b=await open(B);
    await b.evaluate(()=>window.__mk(true,40000,61684,1024));
    const seamB=await b.evaluate(()=>window.__seam());
    const flatB=await b.evaluate(()=>window.__flatRows());

    // THE load-bearing half: the previous version must genuinely carry the defect.
    ck('CONTROL: the previous version draws wrapped segments',
       seamB.wrapped>0, seamB.wrapped+' wrapped segments, worst step '+seamB.worst+' cells');
    ck('CONTROL: and that is visible as wiped-out rows',
       flatB.flat>flatA.flat, 'prev '+flatB.flat+' flat rows vs '+flatA.flat+' now');
    ck('CONTROL: the previous version measured its lengths correctly anyway (v2.58)',
       seamB.pts>5000, 'the stems existed and were the right length — only the DRAWING wrapped');

    // region mode must be untouched: same pixels as the previous version
    await b.evaluate(()=>window.__mk(false,800,12345,512));
    const rgbaRB=await b.evaluate(()=>window.__canvasFnv());
    ck('region-mode render is BIT-IDENTICAL to the previous version',
       rgbaR===rgbaRB, 'rgba '+rgbaR+' vs '+rgbaRB);
    await b.close();
  }
  await a.close(); await br.close();
  console.log('\n'+pass+' passed, '+fail+' failed');
  process.exit(fail?1:0);
})();
