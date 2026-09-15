/* v2.37 — the carve must not lay a trench across the antimeridian seam.
   Usage: node tests/perf/probe_seamcarve.js "Cartalith v2.37 DCC test.html" [seed]

   Why this is a browser probe and not a test_tail.js assertion, and why it is NEW rather than an
   addition to probe_carve.js: every existing harness runs in REGION mode, where no receiver can
   wrap, so none of them can see this. probe_carve.js sets state.world=false at resW 512;
   hash_gen1.js never sets state.world at all. The default battery seed (12345) also has ZERO
   seam-crossing rivers even in world mode -- seed 21811 is used here because it has 28.

   Measured on the owner's world before the fix / after:
     cells pinned at the descent floor   24830 / 0-113
     horizontal riverMask runs >=100      30 / 0
     longest horizontal run              355 / 42   (vertical 57 / 54)
     max carve-path x-extent            1025 / 91
     channel cells                     59481 / 71654  (the trenches were drowning real rivers) */
const path=require('path');
const {chromium}=require(process.env.PLAYWRIGHT_DIR||'/opt/node22/lib/node_modules/playwright');
const file=process.argv[2]||'Cartalith v2.37 DCC test.html';
const seed=+(process.argv[3]||21811);
let pass=0,fail=0;
const check=(n,ok,d)=>{ if(ok){pass++;console.log('  ok   '+n);} else {fail++;console.log('  FAIL '+n+(d!==undefined?'   ['+d+']':''));} };

(async()=>{
 const b=await chromium.launch({executablePath:process.env.CHROME_BIN||'/opt/pw-browsers/chromium',args:['--no-sandbox']});
 const p=await b.newPage({viewport:{width:1200,height:800}});
 p.on('pageerror',e=>{console.log('  PAGEERROR '+e.message);fail++;});
 await p.goto('file://'+path.resolve(file),{waitUntil:'load',timeout:180000});

 const r=await p.evaluate(async(seed)=>{
   state.tect.seed=seed; state.tect.plates=14; state.tect.warp=0.45;
   state.world=true; state.resW=1024; state.mapWidthKm=20000; state.seaLevel=0.42; state.peakM=8849;
   state.carveRivers=true;
   GW=1024; GH=gridH(GW); allocate(); await generate();
   const W=GW,H=GH;

   // (1) cells pinned at enforceChannelDescent's floor clamp
   const floorV=Math.fround(state.seaLevel-0.06);
   let atFloor=0; for(let i=0;i<W*H;i++) if(field[i]===floorV) atFloor++;

   /* (2,3) run-length isotropy OF THE TRENCH ITSELF. Measure the floor-clamped cells, not
      riverMask: the trench is what bottoms out at floorV, and riverMask's runs are shorter, so
      keying these on riverMask let them PASS on a build with 13 058 floor cells. */
   const on=i=>field[i]===floorV;
   let maxH=0,runs100=0;
   for(let y=0;y<H;y++){ let run=0;
     for(let x=0;x<W;x++){ if(on(y*W+x)){ run++; if(run>maxH)maxH=run; } else { if(run>=100)runs100++; run=0; } }
     if(run>=100)runs100++; }
   let maxV=0;
   for(let x=0;x<W;x++){ let run=0;
     for(let y=0;y<H;y++){ if(on(y*W+x)){ run++; if(run>maxV)maxV=run; } else run=0; } }

   // (4) the MECHANISM guard: no carve path may span a large fraction of the map
   const net=buildRiverNetwork(field, flowField, W, H, state.seaLevel,
     {world:!!state.world, riverDensity:(state.viz&&state.viz.riverDensity)||1});
   const polys=splitRiverPolylines(traceRiverPolylines(net.order, net.recv, W, H, 1), W);
   const rawPolys=traceRiverPolylines(net.order, net.recv, W, H, 1);
   let maxSpan=0, seamRaw=0;
   for(const q of polys){ let lo=Infinity,hi=-Infinity;
     for(const pt of q){ if(pt.x<lo)lo=pt.x; if(pt.x>hi)hi=pt.x; } if(hi-lo>maxSpan)maxSpan=hi-lo; }
   for(const q of rawPolys) for(let i=1;i<q.length;i++) if(Math.abs(q[i].x-q[i-1].x)>W/2){ seamRaw++; break; }

   // (6) the carve must not flood new land -- probe_carve.js's own budget, in world mode
   const rm=(typeof riverMask!=='undefined'&&riverMask)?riverMask:null;
   let subSeaCarved=0;
   if(rm) for(let i=0;i<W*H;i++) if(rm[i] && field[i]<state.seaLevel) subSeaCarved++;

   let chan=0; const thr=riverFlowThresh(W,H);
   for(let i=0;i<W*H;i++) if(field[i]>=state.seaLevel && flowField[i]>=thr) chan++;

   return { seed, W, H, atFloor, maxH, maxV, runs100, maxSpan:+maxSpan.toFixed(1),
            seamRawPolylines:seamRaw, rawPolylines:rawPolys.length, splitPolylines:polys.length,
            subSeaCarved, channelCells:chan, floodFrac:+(subSeaCarved/(W*H)*1000).toFixed(2) };
 },seed);

 console.log('\n  '+JSON.stringify(r));
 // the sharpest discriminator: a long sweep bottoms out at the floor clamp and stays there
 check('few cells pinned at the descent floor (<200)', r.atFloor<200, r.atFloor);
 // a carve that follows real drainage is isotropic; a seam trench is not
 check('longest horizontal run under 10% of map width', r.maxH<0.1*r.W, r.maxH+' of '+r.W);
 check('horizontal runs are not far longer than vertical', r.maxH<2*r.maxV, 'H '+r.maxH+' vs V '+r.maxV);
 check('zero carved runs of 100+ contiguous cells in a row', r.runs100===0, r.runs100);
 // the MECHANISM guard -- fails even if the floor clamp is later changed
 check('no carve path spans more than half the map', r.maxSpan<r.W/2, r.maxSpan);
 // the raw chain still wraps; the point is that the carve no longer consumes it raw
 check('the seed genuinely exercises the seam (raw chains still wrap)', r.seamRawPolylines>0, r.seamRawPolylines);
 // probe_carve.js's own no-flood budget, in the mode it never runs in
 check('the carve floods little new land (<2 per 1000 cells)', r.floodFrac<2, r.floodFrac+' per 1000');
 check('a real channel network survives', r.channelCells>40000, r.channelCells);

 await b.close();
 console.log('\n'+pass+' passed, '+fail+' failed');
 process.exit(fail?1:0);
})().catch(e=>{console.log('FATAL '+e.message);process.exit(1);});
