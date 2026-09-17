#!/usr/bin/env node
/* v2.57 — the coastline must stop being the plate polygon, and the carve must stop combing it.
 *
 * Owner, on a 40 000 km world (seed 77805): "what geometric patterns do you see ... and how they
 * translate to the water." Measured on the coarse `field` before any fix: the pure Voronoi partition
 * plates[plateId[i]].base>=0 reproduces the land mask at IoU 0.813, locally-straight coast runs
 * parallel to the nearest plate-boundary segment at mean|cos| 0.968 against a 0.648 shuffle null,
 * and 21.3% of the coastline is one-cell filaments 39 km wide. Two independent causes:
 *
 *   (1) carveRiverValleys inherited riverCoarseEase, which is a DETECTION ease (v1.101). At 40 000 km
 *       it pinned at its cap of 16 and took the channel threshold 209.7 -> 13.1, cutting 8.1x more
 *       trench; enforceChannelDescent floors every carve point at sea-0.06, so a headwater reaching
 *       the coast is cut below sea level and the land between two floodings is left as a bristle.
 *   (2) the coastline is the level set of a piecewise-CONSTANT plate map blurred at blurR*0.35, and a
 *       box blur's boundary gradient scales as 1/radius, so that one radius decides how far the noise
 *       can push the shoreline off the polygon edge.
 *
 * Each half is measured against its OWN off-state (v2.39/v2.42/v2.55): PLATE_BASE_BLUR_K restored to
 * 0.35 IS v2.56's blur exactly, and riverCoarseEase is 1.0 at the app default so the carve fix is a
 * no-op there by construction. Both are asserted, not argued.
 *
 *   node tests/perf/probe_coastgeom.js "Cartalith v2.57 DCC test.html" "Cartalith v2.56 DCC test.html"
 */
const path=require('path');
const PW=process.env.PLAYWRIGHT_DIR||'/opt/node22/lib/node_modules/playwright';
const {chromium}=require(PW);
const A=process.argv[2], B=process.argv[3];
if(!A||!B){ console.error('usage: probe_coastgeom.js <v2.57.html> <v2.56.html>'); process.exit(2); }
let pass=0,fail=0;
const ck=(n,c,x)=>{ if(c){pass++;console.log('ok   - '+n+(x?'   ('+x+')':''));}
                    else{fail++;console.log('FAIL - '+n+(x?'   ('+x+')':''));} };

const SETUP=`(function(){
  /* capture the SHIPPED default so K=null means "restore it", not "leave whatever the last call set".
     Leaving it unset leaks the previous rung's value into the next world and the probe then reports
     the control's numbers as the fix's — which is exactly what the first run of this probe did. */
  window.__K0 = (typeof PLATE_BASE_BLUR_K!=='undefined') ? PLATE_BASE_BLUR_K : null;
  window.__world=async function(km,world,K){
    state.world=!!world; state.mapWidthKm=km; state.tect.seed=77805;
    state.resW=1024; GW=state.resW; GH=gridH(GW); allocate();        /* extent BEFORE GH (v2.37) */
    if(typeof PLATE_BASE_BLUR_K!=='undefined') PLATE_BASE_BLUR_K=(K!=null?K:window.__K0);
    await generate();
  };
  window.__fnv=function(a){ let h=2166136261>>>0;
    const b=new Uint8Array(a.buffer,a.byteOffset,a.byteLength);
    for(let i=0;i<b.length;i++){ h^=b[i]; h=Math.imul(h,16777619)>>>0; } return h>>>0; };
  window.__geom=function(){
    const W=GW,H=GH,sea=state.seaLevel,n=W*H, land=new Uint8Array(n);
    for(let i=0;i<n;i++) land[i]=field[i]>=sea?1:0;
    const at=(x,y)=>{ if(y<0||y>=H) return 0; const xx=state.world?((x%W)+W)%W:(x<0||x>=W?-1:x); return xx<0?0:land[y*W+xx]; };
    const coast=[];
    for(let y=1;y<H-1;y++)for(let x=0;x<W;x++){ const i=y*W+x; if(!land[i])continue;
      if(!at(x-1,y)||!at(x+1,y)||!at(x,y-1)||!at(x,y+1)) coast.push(i); }
    const isC=new Uint8Array(n); for(const i of coast) isC[i]=1;
    const R=7; let straight=0,nfit=0;
    for(const i of coast){ const cx=i%W,cy=(i/W)|0; const px=[],py=[]; let sx=0,sy=0,c=0;
      for(let dy=-R;dy<=R;dy++)for(let dx=-R;dx<=R;dx++){ if(dx*dx+dy*dy>R*R)continue;
        let x=cx+dx,y=cy+dy; if(y<0||y>=H)continue;
        if(state.world)x=((x%W)+W)%W; else if(x<0||x>=W)continue;
        if(!isC[y*W+x])continue; px.push(dx);py.push(dy);sx+=dx;sy+=dy;c++; }
      if(c<5)continue; nfit++;
      const mx=sx/c,my=sy/c; let a=0,bb=0,cc=0;
      for(let k=0;k<c;k++){const u=px[k]-mx,v=py[k]-my;a+=u*u;bb+=u*v;cc+=v*v;}
      a/=c;bb/=c;cc/=c; const tr=a+cc,det=a*cc-bb*bb,dsc=Math.sqrt(Math.max(0,tr*tr/4-det));
      if(Math.sqrt(Math.max(0,tr/2-dsc))<0.60) straight++; }
    const nearSea=new Uint8Array(n);
    for(let y=1;y<H-1;y++)for(let x=0;x<W;x++){ const i=y*W+x; if(!land[i])continue;
      let e=0; for(let dy=-1;dy<=1&&!e;dy++)for(let dx=-1;dx<=1;dx++) if(!at(x+dx,y+dy)){e=1;break;}
      nearSea[i]=e; }
    let tooth=0;
    for(let y=1;y<H-1;y++)for(let x=0;x<W;x++){ const i=y*W+x; if(!nearSea[i])continue;
      let solid=0;
      for(let dy=-1;dy<=1&&!solid;dy++)for(let dx=-1;dx<=1;dx++){
        let xx=x+dx,yy=y+dy; if(yy<1||yy>=H-1)continue;
        if(state.world)xx=((xx%W)+W)%W; else if(xx<0||xx>=W)continue;
        const j=yy*W+xx; if(land[j]&&!nearSea[j]){solid=1;break;} }
      if(!solid) tooth++; }
    const pts=[];
    for(const s of [2,4,8,16,32]){ const seen=new Set();
      for(const i of coast){ const x=i%W,y=(i/W)|0; seen.add(((y/s)|0)*4096+((x/s)|0)); }
      pts.push([Math.log(1/s),Math.log(seen.size)]); }
    let sx=0,sy=0,sxx=0,sxy=0; for(const[u,v]of pts){sx+=u;sy+=v;sxx+=u*u;sxy+=u*v;}
    const D=(pts.length*sxy-sx*sy)/(pts.length*sxx-sx*sx);
    let inter=0,uni=0;
    for(let i=0;i<n;i++){ const v=(plates[plateId[i]].base>=0)?1:0;
      if(v&&land[i])inter++; if(v||land[i])uni++; }
    return { coast:coast.length, straight:+(100*straight/Math.max(1,nfit)).toFixed(2),
             tooth:+(100*tooth/Math.max(1,coast.length)).toFixed(2),
             D:+D.toFixed(4), iou:+(inter/Math.max(1,uni)).toFixed(4), fnv:window.__fnv(field) };
  };
})()`;

(async()=>{
  const br=await chromium.launch({executablePath:'/opt/pw-browsers/chromium',args:['--no-sandbox']});
  const open=async f=>{ const p=await br.newPage({viewport:{width:1400,height:900}});
    p.on('pageerror',e=>{fail++;console.log('FAIL - uncaught page error ('+path.basename(f)+'): '+e.message);});
    await p.goto('file://'+path.resolve(f));
    await p.waitForFunction(()=>typeof generate==='function',{timeout:120000});
    await p.evaluate(SETUP); return p; };
  const pA=await open(A), pB=await open(B);

  /* ---------- 1. the two knobs exist and are shaped right ---------- */
  const K=await pA.evaluate(()=>({
    has:typeof PLATE_BASE_BLUR_K!=='undefined' && typeof plateBaseBlurR==='function' && typeof carveFlowThresh==='function',
    k:PLATE_BASE_BLUR_K, r:(state.tect.blurR=18, plateBaseBlurR()),
    floor:(state.tect.blurR=4, plateBaseBlurR()), back:(state.tect.blurR=18, plateBaseBlurR()) }));
  ck('v2.57 PLATE_BASE_BLUR_K / plateBaseBlurR / carveFlowThresh all exist', K.has);
  ck('v2.57 the blur radius is above gaussBlur\'s own 3-box floor at the shipped blurR', K.r>2.0+1e-9, 'r='+K.r);
  ck('v2.57 the Math.max(2,...) floor still binds for a small blurR', Math.abs(K.floor-2)<1e-9, 'r='+K.floor);

  /* ---------- 2. the carve ease, both sides of the cap ---------- */
  const T=await pA.evaluate(()=>{ const o={w:state.world,km:state.mapWidthKm};
    state.world=false; state.mapWidthKm=800;
    const d800={ease:riverCoarseEase(800), carve:carveFlowThresh(), det:riverFlowThresh(GW,GH)};
    state.mapWidthKm=40000;
    const d40k={ease:riverCoarseEase(40000), carve:carveFlowThresh(), det:riverFlowThresh(GW,GH)};
    state.world=o.w; state.mapWidthKm=o.km; return {d800,d40k}; });
  ck('v2.57 the carve threshold is the DETECTION threshold at the app default (no-op by construction)',
     Math.abs(T.d800.carve-T.d800.det)<1e-9 && Math.abs(T.d800.ease-1)<1e-9, 'ease='+T.d800.ease);
  ck('v2.57 at 40 000 km the carve multiplies the capped ease back out',
     Math.abs(T.d40k.carve-T.d40k.det*T.d40k.ease)<1e-6 && T.d40k.ease===16, 'ease='+T.d40k.ease+' det='+T.d40k.det.toFixed(1)+' carve='+T.d40k.carve.toFixed(1));
  ck('v2.57 the carve therefore cuts a threshold the detection layer no longer uses at world extent',
     T.d40k.carve > T.d40k.det*8, 'carve/det='+(T.d40k.carve/T.d40k.det).toFixed(1)+'x');

  /* ---------- 3. opts.flowThresh absent === riverFlowThresh (the v1.98 discipline) ---------- */
  const ID=await pA.evaluate(async()=>{
    await window.__world(800,false,0.35);
    const o1=buildRiverNetwork(field,flowField,GW,GH,state.seaLevel,{world:!!state.world});
    const o2=buildRiverNetwork(field,flowField,GW,GH,state.seaLevel,{world:!!state.world,flowThresh:riverFlowThresh(GW,GH)});
    let same=o1.order.length===o2.order.length;
    for(let i=0;same&&i<o1.order.length;i++) if(o1.order[i]!==o2.order[i]) same=false;
    return same; });
  ck('v2.57 buildRiverNetwork with opts.flowThresh omitted is bit-identical to passing riverFlowThresh', ID);

  /* ---------- 4. isolation: restore the blur and the app default is v2.56 exactly ---------- */
  const a800=await pA.evaluate(async()=>{ await window.__world(800,false,0.35); return window.__geom(); });
  const b800=await pB.evaluate(async()=>{ await window.__world(800,false,null); return window.__geom(); });
  ck('v2.57 with PLATE_BASE_BLUR_K restored to 0.35 the app default is BIT-IDENTICAL to v2.56',
     a800.fnv===b800.fnv, 'fnv '+a800.fnv+' vs '+b800.fnv);

  /* ---------- 5. the comb fix, isolated (blur held at v2.56's value) ---------- */
  const a40k035=await pA.evaluate(async()=>{ await window.__world(40000,true,0.35); return window.__geom(); });
  const b40k=await pB.evaluate(async()=>{ await window.__world(40000,true,null); return window.__geom(); });
  ck('v2.56 at 40 000 km really does comb the coast into one-cell bristles', b40k.tooth>19, b40k.tooth+'% of the coastline');
  ck('v2.57 the carve fix ALONE cuts the bristles by a third or more',
     a40k035.tooth < b40k.tooth*0.70, b40k.tooth+'% -> '+a40k035.tooth+'%');

  /* ---------- 6. both halves together, against v2.56 ---------- */
  const a40k=await pA.evaluate(async()=>{ await window.__world(40000,true,null); return window.__geom(); });
  ck('v2.57 the coastline is measurably less straight than v2.56 at 40 000 km',
     a40k.straight < b40k.straight-3, b40k.straight+'% -> '+a40k.straight+'%');
  ck('v2.57 the coastline is measurably more crenulated (box-count dimension) than v2.56',
     a40k.D > b40k.D+0.008, b40k.D+' -> '+a40k.D);
  ck('v2.57 the coastline is measurably less the plate polygon than v2.56 (IoU against the Voronoi partition)',
     a40k.iou < b40k.iou-0.03, b40k.iou+' -> '+a40k.iou);
  ck('v2.57 bristles are still better than v2.56 even after the blur narrows',
     a40k.tooth < b40k.tooth*0.80, b40k.tooth+'% -> '+a40k.tooth+'%');
  ck('v2.57 the coastline got LONGER, not merely different',
     a40k.coast > b40k.coast, b40k.coast+' -> '+a40k.coast+' cells');

  /* ---------- 7. the sweep direction is monotone, so the value is on a curve not a cliff ---------- */
  const mono=await pA.evaluate(async()=>{ const out=[];
    for(const k of [0.35,0.25,0.18]){ await window.__world(40000,true,k); const g=window.__geom(); out.push([k,g.D,g.straight]); }
    return out; });
  const dOK = mono[0][1]<mono[1][1] && mono[1][1]<mono[2][1];
  const sOK = mono[0][2]>mono[1][2] && mono[1][2]>mono[2][2];
  ck('v2.57 narrowing the blur monotonically raises the coastline dimension', dOK, mono.map(m=>m[0]+':'+m[1]).join(' '));
  ck('v2.57 narrowing the blur monotonically lowers straightness', sOK, mono.map(m=>m[0]+':'+m[2]).join(' '));

  await br.close();
  console.log('\n'+pass+' passed, '+fail+' failed');
  process.exit(fail?1:0);
})().catch(e=>{console.error(e);process.exit(1);});
