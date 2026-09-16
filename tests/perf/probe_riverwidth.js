#!/usr/bin/env node
/* v2.49 — a river's width must follow its discharge, and the real-km scaling must keep working.
 *
 * Owner, on a 40 000 km world: rivers read as uniform lines. Two clamps, stacked:
 *
 *  (1) riverWidthScaleK shared 1/TERRAIN_DETAIL_MAX_K as its lower bound, so the whole real-km
 *      family STOPPED RESPONDING TO REAL KM at mapWidthKm=12 800. An Earth-sized map wanted
 *      800/40000 = 0.02 and got 0.0625 — three times too wide — and nothing said so.
 *  (2) buildRiverNetwork floors halfW at 0.5 cells. At that widthK the largest width the formula can
 *      produce is 0.3656, so EVERY channel of EVERY order clamped and halfw[] was uniformly 0.5 —
 *      a 39 km band for the trunk and the trickle alike, on every river on the planet.
 *
 * The floor is dead weight on the RASTER, which is what makes fixing it safe: r=ceil(halfW)=1 for
 * any halfW in (0,1), so only d=0 passes the d>halfW test and there t=1 regardless. The floor stays
 * on the stamp; halfw[] carries the true width to the two renderers that exist to use it.
 *
 *   node tests/perf/probe_riverwidth.js "Cartalith v2.49 DCC test.html"
 */
const path=require('path');
const PW=process.env.PLAYWRIGHT_DIR||'/opt/node22/lib/node_modules/playwright';
const {chromium}=require(PW);
const FILE=process.argv[2];
if(!FILE){ console.error('usage: probe_riverwidth.js <file.html>'); process.exit(2); }
let pass=0,fail=0;
const ck=(n,c,x)=>{ if(c){pass++;console.log('ok   - '+n+(x?'   ('+x+')':''));}
                    else{fail++;console.log('FAIL - '+n+(x?'   ('+x+')':''));} };
(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium',args:['--no-sandbox']});
  const pg=await b.newPage({viewport:{width:1300,height:900}});
  pg.on('pageerror',e=>{fail++;console.log('FAIL - uncaught page error: '+e.message);});
  await pg.goto('file://'+path.resolve(FILE));
  await pg.waitForFunction(()=>typeof generate==='function',{timeout:120000});

  /* ---------- 1. the scaling function ---------- */
  const S=await pg.evaluate(()=>({
    at800:riverWidthScaleK(800), at6400:riverWidthScaleK(6400),
    at40000:riverWidthScaleK(40000), want40000:800/40000,
    at12800:riverWidthScaleK(12800), want12800:800/12800,
    atTiny:riverWidthScaleK(1e-6), cap:TERRAIN_DETAIL_MAX_K,
    huge:riverWidthScaleK(1e9),
    /* the stamp footprint — why the floor cannot move the raster */
    stamp:[0.04,0.12,0.366,0.5,0.9].map(h=>{
      const r=Math.ceil(h); let n=0,ts=[];
      for(let dy=-r;dy<=r;dy++)for(let dx=-r;dx<=r;dx++){
        const d=Math.sqrt(dx*dx+dy*dy); if(d>h) continue; n++; ts.push(+(1-d/h).toFixed(6)); }
      return {h,n,t:ts.join(',')};
    })
  }));
  ck('unchanged at the app default (800 km)', S.at800===1);
  ck('still eases in the range it always did (6400 km)', Math.abs(S.at6400-800/6400)<1e-12);
  ck('still exact at the old ceiling (12 800 km)', Math.abs(S.at12800-S.want12800)<1e-12);
  ck('KEEPS RESPONDING past it — an Earth-sized map gets its real width',
     Math.abs(S.at40000-S.want40000)<1e-12, S.at40000.toFixed(5)+' (wants '+S.want40000.toFixed(5)+')');
  ck('the upper cap is untouched — a small map must not exaggerate a river', S.atTiny===S.cap);
  ck('the lower floor is positive (halfW=0 would make t a NaN)', S.huge>0);
  ck('the floor cannot move the raster: halfW in (0,1) stamps ONE cell at t=1',
     S.stamp.every(q=>q.n===1&&q.t==='1'), S.stamp.map(q=>q.h+'->'+q.n+'cell').join(' '));

  /* ---------- 2. the reported world ---------- */
  const R=await pg.evaluate(async()=>{
    state.tect=Object.assign(state.tect,{plates:16,seed:13820,vel:1.2,warp:0.45,blurR:18,alpha:0.85,beta:0.22,age:0.6,ridged:true,lloyd:2,flexure:0.2,hetero:0.08,resist:0.5,tectonicGraph:true,foldIntensity:1.2,trenchDepth:1.18,faultBlock:0.6,dynamicLithology:false});
    state.volc=Object.assign(state.volc,{count:12,age:0.4,provinces:true});
    state.crater=Object.assign(state.crater,{count:100,age:0.5,physical:true,ratePerMkm2Myr:0.97,surfaceAgeMyr:1280});
    state.stream=Object.assign(state.stream||{},{uplift:0,k:0.012,iters:15,deposit:0.3,climateK:0.5,cycles:5});
    state.planet.geoid={enabled:true,amp:0.015};
    state.planet.tides={enabled:true,k2:1,moons:[{massRel:1,distRel:1,phase:0}]};
    state.world_structure=Object.assign(state.world_structure,{enabled:true,archetype:'earth',continentality:0.3,fragmentation:0.5,tectonicEnergy:0.6,oceanDepth:0.6,hotspotDensity:0.2});
    state.carveRivers=true; state.world=true; state.mapWidthKm=40000; state.peakM=8849;
    state.resW=1024; GW=1024; GH=gridH(1024); state.finalized=false;
    allocate(); refreshGeoid&&refreshGeoid(); refreshTides&&refreshTides();
    await generate();
    if(!_riverNet) _riverNet=buildRiverNetwork(field,flowField,GW,GH,state.seaLevel,{routeOn:currentRoutingSurface(),world:!!state.world,riverDensity:1});
    const polys=riverRenderPolys(); if(!polys||!polys.length) return {err:'no polys'};
    const cellKm=state.mapWidthKm/GW;
    const byOrd={}; let mn=1e9,mx=0,n=0;
    for(const pl of polys) for(const v of pl.v){
      if(v.w<mn)mn=v.w; if(v.w>mx)mx=v.w; n++;
      const o=_riverNet.omax?_riverNet.omax[((v.y|0)*GW)+(v.x|0)]:0;
      (byOrd[o]=byOrd[o]||[]).push(v.w);
    }
    const mean=a=>a.reduce((x,y)=>x+y,0)/a.length;
    const ords=Object.keys(byOrd).map(Number).sort((a,b)=>a-b);
    return { n, cellKm:+cellKm.toFixed(2), distinct:new Set(Array.from({length:n},(_,i)=>0)).size,
             minKm:+(2*mn*cellKm).toFixed(3), maxKm:+(2*mx*cellKm).toFixed(3),
             orders:ords, meanByOrd:ords.map(o=>+(2*mean(byOrd[o])*cellKm).toFixed(3)),
             uniform: Math.abs(mx-mn)<1e-9 };
  });
  ck('the world really has a multi-order river network', !R.err && R.orders.length>=3,
     R.err||('orders '+JSON.stringify(R.orders)));
  ck('river width is no longer ONE constant for every stream on the planet', !R.uniform,
     R.minKm+' km .. '+R.maxKm+' km');
  ck('width rises with Strahler order (discharge drives it, as the model intends)',
     R.meanByOrd && R.meanByOrd.length>=3 && R.meanByOrd[0]<R.meanByOrd[R.meanByOrd.length-1],
     'mean km by order: '+JSON.stringify(R.meanByOrd));
  ck('...and no river is an implausible tens-of-km band on an Earth-sized map', R.maxKm<10,
     'widest '+R.maxKm+' km   (39.06 km before)');

  await b.close();
  console.log('\n'+pass+' passed, '+fail+' failed');
  process.exit(fail?1:0);
})().catch(e=>{console.error(e);process.exit(1);});
