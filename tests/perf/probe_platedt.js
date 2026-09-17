#!/usr/bin/env node
/* v2.48 — the plate-age distance transform must be exact, isotropic and wrap-aware.
 *
 * Owner, on a 40 000 km world: "still unnatural geometric shapes". Not an LOD defect — the straight
 * edges were already in the coarse `field`. distanceToBoundary() was a two-pass 3x3 chamfer, whose
 * error is DIRECTIONAL: 0.00% at 0/45/90 degrees, +8.15% at 22.5/67.5, so its level sets are octagons
 * with flat facets at exactly those angles. That field becomes ageField, which the height formula
 * spends as the NOISE AMPLITUDE (rug = exp(-age*(1+ageInf*6))) and which also feeds resistanceField,
 * so terrain roughness and erosion both inherited the octagons.
 *
 * Second defect, same function: no X wrap, so in world mode the seam column believed it was
 * maximally far from every plate boundary — 251 against a true 5.
 *
 *   node tests/perf/probe_platedt.js "Cartalith v2.48 DCC test.html"
 */
const path=require('path');
const PW=process.env.PLAYWRIGHT_DIR||'/opt/node22/lib/node_modules/playwright';
const {chromium}=require(PW);
const FILE=process.argv[2];
if(!FILE){ console.error('usage: probe_platedt.js <file.html>'); process.exit(2); }
let pass=0,fail=0;
const ck=(n,c,x)=>{ if(c){pass++;console.log('ok   - '+n+(x?'   ('+x+')':''));}
                    else{fail++;console.log('FAIL - '+n+(x?'   ('+x+')':''));} };
(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium',args:['--no-sandbox']});
  const pg=await b.newPage({viewport:{width:1400,height:900}});
  pg.on('pageerror',e=>{fail++;console.log('FAIL - uncaught page error: '+e.message);});
  await pg.goto('file://'+path.resolve(FILE));
  await pg.waitForFunction(()=>typeof generate==='function',{timeout:120000});

  /* ---------- 1. the transform itself ---------- */
  const T=await pg.evaluate(()=>{
    const W=257,H=257; GW=W; GH=H;
    boundaryMask=new Uint8Array(W*H); boundaryMask[128*W+128]=1;
    const d=distanceToBoundary({wrapX:false});
    const errs=[];
    for(let deg=0;deg<=90;deg+=5){
      const a=deg*Math.PI/180, xi=Math.round(128+100*Math.cos(a)), yi=Math.round(128+100*Math.sin(a));
      errs.push(100*(d[yi*W+xi]-Math.hypot(xi-128,yi-128))/Math.hypot(xi-128,yi-128));
    }
    /* wrap, in both modes */
    const W2=256,H2=64; GW=W2; GH=H2; boundaryMask=new Uint8Array(W2*H2);
    for(let y=0;y<H2;y++) boundaryMask[y*W2+4]=1;
    const dr=distanceToBoundary({wrapX:false}), dw=distanceToBoundary({wrapX:true});
    return { anis:+(Math.max(...errs)-Math.min(...errs)).toFixed(3),
             maxErr:+Math.max(...errs.map(Math.abs)).toFixed(3),
             regionSeam:+dr[32*W2+W2-1].toFixed(2), worldSeam:+dw[32*W2+W2-1].toFixed(2) };
  });
  ck('the transform is isotropic — no direction is favoured', T.anis<0.001, 'spread across angle '+T.anis+'%');
  ck('...and exact, not merely even', T.maxErr<0.001, 'worst |error| '+T.maxErr+'%');
  ck('world mode takes the short way round the seam', Math.abs(T.worldSeam-5)<0.01, T.worldSeam+' (true 5)');
  ck('region mode still does NOT wrap (a region has real edges)', Math.abs(T.regionSeam-251)<0.01, T.regionSeam);

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
    const sea=state.seaLevel, N=GW*GH, land=new Uint8Array(N);
    for(let i=0;i<N;i++) land[i]=field[i]>=sea?1:0;
    const isEdge=(x,y)=>{ if(!land[y*GW+x]) return false;
      for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){ const nx=((x+dx)%GW+GW)%GW, ny=y+dy;
        if(ny<0||ny>=GH) continue; if(!land[ny*GW+nx]) return true; } return false; };
    const eset=new Set(), edge=[];
    for(let y=1;y<GH-1;y++) for(let x=0;x<GW;x++) if(isEdge(x,y)){ edge.push([x,y]); eset.add(y*GW+x); }
    const runLen=(x,y,dx,dy)=>{ let n=1,cx=x+dx,cy=y+dy;
      while(cy>=0&&cy<GH&&eset.has(cy*GW+(((cx%GW)+GW)%GW))){ n++; cx+=dx; cy+=dy; } return n; };
    let straight=0, longest=0, seamCol=0;
    for(const [x,y] of edge){
      const L=Math.max(runLen(x,y,0,1),runLen(x,y,1,0),runLen(x,y,1,1),runLen(x,y,1,-1));
      if(L>=8) straight++;
      if(x>5&&x<GW-6&&L>longest) longest=L;
      if(x===GW-1&&runLen(x,y,0,1)>=8) seamCol++;
    }
    return { edge:edge.length, straight, straightPct:+(100*straight/edge.length).toFixed(2),
             longestInterior:longest, seamCol, landFrac:+(land.reduce((a,b)=>a+b,0)/N).toFixed(3) };
  });
  ck('the reported world still generates sane land', R.landFrac>0.2&&R.landFrac<0.4, 'landFrac '+R.landFrac);
  ck('straight-edged coastline is a small minority of the coast', R.straightPct<2.0,
     R.straight+' of '+R.edge+' cells = '+R.straightPct+'%   (2.52% before)');
  ck('no interior coastline runs dead straight for 25+ cells', R.longestInterior<25,
     'longest interior run '+R.longestInterior+' cells   (37 before)');
  ck('the antimeridian column is no longer the worst offender', R.seamCol<30,
     R.seamCol+' straight cells at x=GW-1   (63 before)');

  await b.close();
  console.log('\n'+pass+' passed, '+fail+' failed');
  process.exit(fail?1:0);
})().catch(e=>{console.error(e);process.exit(1);});
