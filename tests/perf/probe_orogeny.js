/* v2.36 — the collision belt is a STACK of thrust sheets, and its width is real km.
   Usage: node tests/perf/probe_orogeny.js "Cartalith v2.36 DCC test.html"
   Several assertions FAIL on v2.35 by construction.

   The crest count is measured PER STATION along the margin, never on a mean cross-section: each
   sheet's crest wanders independently, so averaging across strike smears them back into one hump
   and undercounts ridges. That mistake cost a whole round of this investigation. */
const path=require('path');
const {chromium}=require(process.env.PLAYWRIGHT_DIR||'/opt/node22/lib/node_modules/playwright');
const file=process.argv[2]||'Cartalith v2.36 DCC test.html';
let pass=0,fail=0;
const check=(n,ok,d)=>{ if(ok){pass++;console.log('  ok   '+n);} else {fail++;console.log('  FAIL '+n+(d!==undefined?'   ['+d+']':''));} };

const MEASURE = async (p,seed,mapWidthKm)=>p.evaluate(async(a)=>{
  const {seed,mapWidthKm}=a;
  state.tect.seed=seed; state.resW=512; state.world=false; state.mapWidthKm=mapWidthKm;
  state.tect.tectonicGraph=true; state.tect.plates=14;
  GW=512; GH=gridH(GW); allocate(); await generate();

  const W=GW,H=GH,cellKm=state.mapWidthKm/W, blurR=state.tect.blurR;
  const widthK=(typeof orogenyWidthScaleK==='function')?orogenyWidthScaleK(state.mapWidthKm):1;
  const halfBelt=(typeof orogenBeltHalfWidth==='function')?orogenBeltHalfWidth(blurR,widthK,W,H):blurR*1.9;
  const O=currentOrogenyField(); if(!O) return {err:'no orogeny field'};
  const G=currentBoundaryGraph(), COL=BTYPE_KEYS.indexOf('collision');
  const plen=pl=>{let L=0;for(let i=1;i<pl.pts.length;i++)L+=Math.hypot(pl.pts[i][0]-pl.pts[i-1][0],pl.pts[i][1]-pl.pts[i-1][1]);return L;};
  const cand=G.polylines.filter(q=>q.type===COL&&q.pts.length>=12).sort((u,v)=>plen(v)-plen(u));
  if(!cand.length) return {err:'no collision margin'};
  const pl=cand[0], P=pl.pts;
  const samp=(fx,fy)=>{ const x=Math.max(0,Math.min(W-1,fx)), y=Math.max(0,Math.min(H-1,fy));
    const x0=x|0,y0=y|0,x1=Math.min(W-1,x0+1),y1=Math.min(H-1,y0+1),tx=x-x0,ty=y-y0;
    return O[y0*W+x0]*(1-tx)*(1-ty)+O[y0*W+x1]*tx*(1-ty)+O[y1*W+x0]*(1-tx)*ty+O[y1*W+x1]*tx*ty; };

  const REACH=halfBelt*2.2, STEP=0.5;
  const crests=[], widthsKm=[];
  for(let k=4;k<P.length-4;k+=3){
    let tx=P[k+2][0]-P[k-2][0], ty=P[k+2][1]-P[k-2][1]; const tl=Math.hypot(tx,ty)||1; tx/=tl; ty/=tl;
    const nx=-ty, ny=tx, prof=[];
    for(let u=-REACH;u<=REACH;u+=STEP) prof.push(samp(P[k][0]+nx*u, P[k][1]+ny*u));
    let mx=-Infinity,mn=Infinity; for(const v of prof){ if(v>mx)mx=v; if(v<mn)mn=v; }
    if(!(mx>mn) || !isFinite(mx) || !isFinite(mn)) continue;
    const range=mx-mn, promin=0.12*range;
    let n=0;
    for(let i=1;i<prof.length-1;i++){
      if(!(prof[i]>=prof[i-1]&&prof[i]>prof[i+1])) continue;
      let l=prof[i]; for(let j=i-1;j>=0&&prof[j]<=prof[j+1];j--) l=Math.min(l,prof[j]);
      let r=prof[i]; for(let j=i+1;j<prof.length&&prof[j]<=prof[j-1];j++) r=Math.min(r,prof[j]);
      if(prof[i]-Math.max(l,r)>=promin) n++;
    }
    crests.push(n);
    let lo=null,hi=null; const cut=mn+0.25*range;
    for(let i=0;i<prof.length;i++) if(prof[i]>=cut){ if(lo===null)lo=i; hi=i; }
    if(lo!==null) widthsKm.push((hi-lo)*STEP*cellKm);
  }
  crests.sort((a,b)=>a-b); widthsKm.sort((a,b)=>a-b);
  const med=arr=>arr.length?arr[arr.length>>1]:0;
  const multi=crests.filter(v=>v>=3).length/(crests.length||1);
  return { seed, mapWidthKm, cellKm:+cellKm.toFixed(3), blurR, widthK:+widthK.toFixed(4),
           halfBeltCells:+halfBelt.toFixed(2), halfBeltKm:+(halfBelt*cellKm).toFixed(1),
           stations:crests.length, medCrests:med(crests), maxCrests:crests[crests.length-1]||0,
           multiFrac:+multi.toFixed(2), medBeltWidthKm:+med(widthsKm).toFixed(1),
           capFrac:+(halfBelt/Math.min(W,H)).toFixed(3) };
},{seed,mapWidthKm});

(async()=>{
  const b=await chromium.launch({executablePath:process.env.CHROME_BIN||'/opt/pw-browsers/chromium',args:['--no-sandbox']});
  const p=await b.newPage({viewport:{width:1200,height:800}});
  p.on('pageerror',e=>{console.log('  PAGEERROR '+e.message);fail++;});
  await p.goto('file://'+path.resolve(file),{waitUntil:'load',timeout:180000});

  console.log('\n--- belt structure at the default map extent (800 km)');
  for(const seed of [12345,31337]){
    const r=await MEASURE(p,seed,800);
    console.log('  '+JSON.stringify(r));
    if(r.err){ check('measured seed '+seed,false,r.err); continue; }
    check('seed '+seed+': belt shows >=3 crests at the median station', r.medCrests>=3, 'median '+r.medCrests);
    /* 0.5 is a floor, not a target. Whether a station resolves the FULL stack is set by sheet
       spacing in CELLS, so it is resolution-bound, not a tuning knob: measured 0.86-0.96 at 35.3
       cells, 0.50-0.57 at 17.7, 0.07-0.18 at 8.8. The bar asserts the belt is a stack rather than a
       ridge; it deliberately does not pin a number the grid controls. */
    check('seed '+seed+': the stack survives at over half the stations', r.multiFrac>=0.5, r.multiFrac);
    check('seed '+seed+': belt half-width is unchanged at the default extent (widthK===1)',
          Math.abs(r.halfBeltCells-r.blurR*1.9)<1e-6, r.halfBeltCells+' vs '+(r.blurR*1.9));
    check('seed '+seed+': belt stays under the stamping-cost cap', r.capFrac<=0.3001, r.capFrac);
  }

  console.log('\n--- belt width vs map extent (real km should hold, cells should not)');
  const scales=[400,800,1600], out=[];
  for(const mk of scales){ const r=await MEASURE(p,12345,mk); out.push(r); console.log('  '+JSON.stringify(r)); }
  if(out.every(r=>!r.err)){
    /* Scale invariance can only be asserted where the cost cap is not binding. At a 400 km extent a
       250 km belt is 62% of the map, so the cap clips it -- which is the honest picture of a small
       window onto a real orogen, not a failure. */
    const free=out.filter(r=>r.capFrac<0.2999);
    const km=free.map(r=>r.halfBeltKm), cells=free.map(r=>r.halfBeltCells);
    const spread=Math.max(...km)/Math.max(1e-9,Math.min(...km));
    check('uncapped belt half-width in real km is scale-invariant (spread < 1.02x)',
          free.length>=2 && spread<1.02, km.join(' / ')+' km, spread '+spread.toFixed(3));
    check('belt half-width in CELLS does move with extent',
          Math.max(...out.map(r=>r.halfBeltCells))/Math.min(...out.map(r=>r.halfBeltCells))>1.5,
          out.map(r=>r.halfBeltCells).join(' / ')+' cells');
    check('the cost cap binds at a small extent rather than the belt running away',
          out[0].capFrac<=0.3001, '400 km capFrac '+out[0].capFrac);
    check('orogenyWidthScaleK is exactly 1 at the 800 km default', out[1].widthK===1, out[1].widthK);
  }
  await b.close();
  console.log('\n'+pass+' passed, '+fail+' failed');
  process.exit(fail?1:0);
})().catch(e=>{console.log('FATAL '+e.message);process.exit(1);});
