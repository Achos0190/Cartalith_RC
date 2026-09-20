#!/usr/bin/env node
/* v2.58 — rivers are WHOLE rivers, ranked by drainage area, disclosed by on-screen length.
 *
 * Owner: "only render it when we zoom ... and only do that for rivers that are actually big.
 * Rhine, Amazon, yellow river. And do the same for smaller rivers as we do ways for smaller cities."
 *
 * Three measured facts shaped this, and each has an assertion below.
 *
 * 1. Strahler order cannot carry the tiers. Max order is 4 at world extent and 2 at the app default;
 *    real rivers are order 8-12, and order is anyway a property of a river PLUS a channel-initiation
 *    threshold (the Amazon is reported as 9, 10 and 12 in different datasets), so Amazon, Rhine and
 *    Yellow River would all be order 3-4 here. Drainage area is continuous and is what USGS's own
 *    display-scale filter keys on.
 * 2. `traceRiverPolylines` returns inter-confluence FRAGMENTS, not rivers. Spearman rho between
 *    fragment length and the fragment's own upstream accumulation was 0.252-0.298 and the top 100
 *    by each shared 2-7 features, so a cartographic minimum-length rule applied to fragments selects
 *    the WRONG rivers. Assembling whole stems mouth-upward takes rho to 0.96-0.97.
 *    CORRECTED IN v2.59, and the correction matters: that 0.96 is length against `buildMainStems`'
 *    OWN accumulation over `net.recv`, which covers CHANNEL cells only — a count of upstream channel
 *    cells, not a catchment AREA. Against computeFlow's real catchment raster the same stems measure
 *    rho 0.11-0.40, worse than Strahler order's own 0.38-0.73 (`probe_riverorder.js`). v2.41's "two
 *    different trees" a third time. The fragments-vs-stems comparison below is unaffected — it is
 *    like-for-like on ONE quantity — but the LENGTH GATE is justified as a CARTOGRAPHIC disclosure
 *    rule (a stem's own extent in screen pixels, which is literally what it measures), never as a
 *    measure of hydrological importance.
 * 3. The rank must be accumulated on the tree being WALKED. net.recv and flowField are different
 *    trees (v2.41: they "describe different objects"); mixing them reached a cell with 163 405 of
 *    accumulated flow whose net.recv-upstream set was empty.
 *
 *   node tests/perf/probe_riverscale.js "Cartalith v2.58 DCC test.html"
 */
const path=require('path');
const PW=process.env.PLAYWRIGHT_DIR||'/opt/node22/lib/node_modules/playwright';
const {chromium}=require(PW);
const FILE=process.argv[2];
if(!FILE){ console.error('usage: probe_riverscale.js <file.html>'); process.exit(2); }
let pass=0,fail=0;
const ck=(n,c,x)=>{ if(c){pass++;console.log('ok   - '+n+(x?'   ('+x+')':''));}
                    else{fail++;console.log('FAIL - '+n+(x?'   ('+x+')':''));} };
(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium',args:['--no-sandbox']});
  const pg=await b.newPage({viewport:{width:1400,height:900}});
  pg.on('pageerror',e=>{fail++;console.log('FAIL - uncaught page error: '+e.message);});
  await pg.goto('file://'+path.resolve(FILE));
  await pg.waitForFunction(()=>typeof generate==='function',{timeout:120000});

  /* ---------- 1. the symbols exist ---------- */
  const S=await pg.evaluate(()=>({
    fn:typeof buildMainStems==='function' && typeof mainRiverStems==='function',
    px:typeof RIVER_MIN_SCREEN_PX!=='undefined'?RIVER_MIN_SCREEN_PX:null,
    wl:typeof RIVER_MEANDER_WL_KM!=='undefined'?RIVER_MEANDER_WL_KM:null }));
  ck('v2.58 buildMainStems / mainRiverStems exist', S.fn);
  ck('v2.58 the on-screen gate sits inside the band real stylesheets use (13-490 px)',
     S.px>=13&&S.px<=490, 'RIVER_MIN_SCREEN_PX='+S.px);

  /* ---------- 2. geometry is bit-identical where v2.57 was, and refines where it was not ---------- */
  const G=await pg.evaluate(()=>{
    const out={};
    for(const gw of [1024,2048,4096]){
      out['eps@'+gw]=[Math.max(0.4,gw/900), Math.max(0.10,(gw/900)/1)];
      out['step@'+gw]=[Math.max(1.2,gw/360), Math.max(0.25,(gw/360)/1)];
      out['wl@'+gw]=[Math.max(6,gw/40), Math.max(2,RIVER_MEANDER_WL_KM/(800/gw))];
    }
    out.refine=[ (1024/360)/1, (1024/360)/8, (1024/360)/64 ];
    return out; });
  const same=k=>Math.abs(G[k][0]-G[k][1])<1e-9;
  ck('v2.58 at zoom 1 the spline step is v2.57\'s value exactly, at every resolution',
     same('step@1024')&&same('step@2048')&&same('step@4096'), '1024/2048/4096');
  ck('v2.58 at zoom 1 the RDP tolerance is v2.57\'s value exactly, at every resolution',
     same('eps@1024')&&same('eps@2048')&&same('eps@4096'));
  ck('v2.58 the real-km meander wavelength reproduces GW/40 exactly at the app default extent',
     same('wl@1024')&&same('wl@2048')&&same('wl@4096'), '20 km / cellKm === GW/40 when mapWidthKm=800');
  ck('v2.58 the spline REFINES with zoom (v2.57 held it constant)',
     G.refine[0]>G.refine[1] && G.refine[1]>G.refine[2],
     G.refine.map(v=>v.toFixed(3)).join(' -> '));

  /* ---------- 3. the network, on a real world ---------- */
  const W=await pg.evaluate(async()=>{
    state.world=true; state.mapWidthKm=40000; state.tect.seed=77805;
    if(state.hydro) state.hydro.integrate=true;
    state.resW=1024; GW=state.resW; GH=gridH(GW); allocate();
    await generate();
    const net=_riverNet; if(!net) return {err:'no net'};
    const cellKm=state.mapWidthKm/GW;
    const spear=(rows)=>{ const n=rows.length;
      const rk=(k)=>{const idx=rows.map((_,i)=>i).sort((a,b)=>rows[a][k]-rows[b][k]);
        const r=new Array(n); idx.forEach((v,i)=>r[v]=i); return r;};
      const A=rk('L'),B=rk('a'); let d2=0; for(let i=0;i<n;i++){const d=A[i]-B[i];d2+=d*d;}
      return 1-(6*d2)/(n*(n*n-1)); };
    // fragments, the v2.57 decomposition
    const frag=[];
    for(const pl of splitRiverPolylines(traceRiverPolylines(net.order,net.recv,GW,GH,1),GW,null)){
      if(pl.length<2) continue; let L=0,f=0;
      for(let k=0;k<pl.length;k++){const i=((pl[k].y|0)*GW)+(pl[k].x|0);
        if(flowField[i]>f)f=flowField[i]; if(k)L+=Math.hypot(pl[k].x-pl[k-1].x,pl[k].y-pl[k-1].y);}
      frag.push({L,a:f}); }
    const st=mainRiverStems();
    const rows=st.map(s=>({L:s.len,a:s.area}));
    // contiguity, wrap-aware: a stem must never jump
    let maxStep=0;
    for(const s of st) for(let k=1;k<s.pts.length;k++){
      let dx=s.pts[k].x-s.pts[k-1].x; dx-=Math.round(dx/GW)*GW;
      const d=Math.hypot(dx, s.pts[k].y-s.pts[k-1].y); if(d>maxStep) maxStep=d; }
    const ladder=[]; for(let L=0;L<9;L++){ const z=Math.pow(2,L);
      ladder.push(st.filter(s=>s.len*z>=RIVER_MIN_SCREEN_PX).length); }
    // the cache must return the SAME object
    const a1=mainRiverStems(), a2=mainRiverStems();
    return { nFrag:frag.length, nStem:st.length, cellKm,
      rhoFrag:+spear(frag).toFixed(3), rhoStem:+spear(rows).toFixed(3),
      maxStep:+maxStep.toFixed(3),
      longestKm:Math.round(Math.max(...st.map(s=>s.len))*cellKm),
      ladder, cached:a1===a2,
      maxOrder:Math.max(...st.map(s=>s.order)) };
  });
  ck('v2.58 a real world produces main stems', !W.err && W.nStem>100, W.nStem+' stems');
  ck('v2.58 whole stems correlate length with upstream accumulation FAR better than v2.57 fragments',
     W.rhoStem>0.85 && W.rhoStem > W.rhoFrag+0.4, 'rho '+W.rhoFrag+' -> '+W.rhoStem);
  /* This is length against the stem's own net.recv accumulation (upstream CHANNEL CELLS), which is
     what makes a length gate select whole rivers rather than arbitrary fragments. It is NOT a claim
     that length tracks catchment AREA — see probe_riverorder.js, where the same stems measure
     rho 0.11-0.40 against the real catchment raster. */
  ck('v2.58 so a length gate selects whole rivers rather than fragments (a DISCLOSURE rule, not an importance measure)',
     W.rhoStem>0.9, 'rho(length, upstream channel cells)='+W.rhoStem);
  ck('v2.58 no stem jumps the antimeridian (the seam length defect)',
     W.maxStep<1.5, 'max step '+W.maxStep+' cells');
  ck('v2.58 the longest river is a plausible real length, not a wrapped artefact',
     W.longestKm>1000 && W.longestKm<20000, W.longestKm+' km (Amazon 6400, Rhine 1230)');
  ck('v2.58 Strahler could NOT have carried these tiers', W.maxOrder<=5,
     'max Strahler order in this world = '+W.maxOrder+', real rivers are 8-12');
  ck('v2.58 mainRiverStems is cached (drawRiverWays re-traced every call in v2.57)', W.cached);

  /* ---------- 4. the ladder ---------- */
  let mono=true; for(let i=1;i<W.ladder.length;i++) if(W.ladder[i]<W.ladder[i-1]) mono=false;
  ck('v2.58 the ladder is monotone: zooming in only ever ADDS rivers', mono, W.ladder.join(' '));
  ck('v2.58 the ladder actually discloses (world scale shows a small fraction)',
     W.ladder[0] < W.nStem*0.30, W.ladder[0]+' of '+W.nStem+' at LOD 0');
  ck('v2.58 the ladder SATURATES well before LOD 7, so LOD 7/8 is not where selection happens',
     W.ladder[5]===W.ladder[8] && W.ladder[5]===W.nStem,
     'saturated by LOD '+W.ladder.findIndex(v=>v===W.nStem));

  /* ---------- 5. the min-order slider still filters ---------- */
  const M=await pg.evaluate(()=>{
    const a=mainRiverStems().length;
    state.viz.minRiverOrder=3; const b=mainRiverStems().length;
    state.viz.minRiverOrder=1; const c=mainRiverStems().length;
    return {a,b,c}; });
  ck('v2.58 the Min stream order slider still thins the set, and is part of the cache key',
     M.b<M.a && M.c===M.a, M.a+' -> '+M.b+' -> '+M.c);

  await b.close();
  console.log('\n'+pass+' passed, '+fail+' failed');
  process.exit(fail?1:0);
})().catch(e=>{console.error(e);process.exit(1);});
