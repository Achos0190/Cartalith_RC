#!/usr/bin/env node
/* v2.55 — the heightmap LOD system: the relief FLOOR (data) and the local-contrast REBASE (legibility).
 *   node tests/perf/probe_reliefloor.js "Cartalith v2.55 DCC test.html"
 *
 * Both halves are measured INSIDE ONE BUILD against their own off-state, which is what makes the
 * "before" a real control rather than a second implementation:
 *   Part A  omit opts.reliefFloor  -> v2.54's exact arithmetic (the documented absent-⇒-0 convention)
 *   Part B  force localContrastK() -> 0  (a live reassignment of the shipped function, not a copy)
 * Exits 1 on any failure. */
const path=require('path'), fs=require('fs');
const {chromium}=require(process.env.PLAYWRIGHT_DIR||'/opt/node22/lib/node_modules/playwright');
const FILE=process.argv[2]||'Cartalith v2.55 DCC test.html';
let pass=0, fail=0;
const ok=(n,c,d)=>{ if(c){pass++;console.log('  ok   - '+n+(d?'   '+d:''));} else {fail++;console.log('  FAIL - '+n+(d?'   '+d:''));} };

(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium',args:['--no-sandbox']});
  const pg=await b.newPage({viewport:{width:1280,height:800}});
  pg.on('pageerror',e=>{ console.log('PAGEERROR '+e.message); fail++; });
  await pg.goto('file://'+path.resolve(FILE));
  await pg.waitForFunction(()=>typeof generate==='function',{timeout:120000});

  const R=await pg.evaluate(async()=>{
    const out={};
    state.world=false; state.resW=1024; state.mapWidthKm=800; state.tect.seed=12345;
    await generate();
    const sea=state.seaLevel, denom=1-sea, mpu=metersPerUnit(), z=7, TS=512;

    /* ---------- the two sites: a genuinely flat mid-elevation plain, and the steepest land ---------- */
    const pick=(loR,hiR,flat)=>{ let best=flat?1e9:-1,bi=-1;
      for(let y=8;y<GH-8;y++) for(let x=8;x<GW-8;x++){ const i=y*GW+x; if(field[i]<sea) continue;
        const rr=(field[i]-sea)/denom; if(rr<loR||rr>hiR) continue;
        const g=Math.hypot(field[i+1]-field[i-1],field[i+GW]-field[i-GW]);
        if(flat?(g<best):(g>best)){best=g;bi=i;} } return bi; };
    const sites={plain:pick(0.15,0.55,true), steep:pick(0,1,false)};
    const tileAt=(fi,opts)=>{ const dims=pyramidDims(z);
      const col=Math.min(dims.cols-1,Math.floor((fi%GW)/((GW-1)/dims.cols)));
      const row=Math.min(dims.rows-1,Math.floor(((fi/GW)|0)/((GH-1)/dims.rows)));
      return {t:pyramidTile(field,GW,GH,z,col,row,TS,opts), col, row,
              bb:pyramidTileBounds(GW,GH,z,col,row)}; };
    const rng=a=>{let lo=1e9,hi=-1e9;for(let i=0;i<a.length;i++){if(a[i]<lo)lo=a[i];if(a[i]>hi)hi=a[i];}return[lo,hi];};
    const lv=a=>{const s=new Set();for(let i=0;i<a.length;i++)s.add(a[i]);return s.size;};

    /* =================== PART A — the relief floor =================== */
    out.floorNow=subcellReliefFloor(0.12, mpu);
    out.mpu=mpu;
    /* the floor is a REAL-METRE quantity: halve metres-per-unit and the normalised floor doubles,
       so the metres it buys are invariant. That is the whole point of converting on the main thread. */
    const f1=subcellReliefFloor(0.12, 1000), f2=subcellReliefFloor(0.12, 2000);
    out.metreInvariant=Math.abs((f1*1000)-(f2*2000));
    out.floorZeroGuards=[subcellReliefFloor(0,mpu), subcellReliefFloor(0.12,0)];

    /* absent ⇒ bit-identical */
    const base=lodTileOpts(); const offOpts=Object.assign({},base); delete offOpts.reliefFloor;
    for(const key of ['plain','steep']){
      const on=tileAt(sites[key], base), off=tileAt(sites[key], offOpts);
      const [lo0,hi0]=rng(off.t.data), [lo1,hi1]=rng(on.t.data);
      let maxD=0; for(let i=0;i<on.t.data.length;i++){ const d=Math.abs(on.t.data[i]-off.t.data[i]); if(d>maxD)maxD=d; }
      out[key]={ spanOffM:(hi0-lo0)*mpu, spanOnM:(hi1-lo1)*mpu,
        levelsOff:lv(off.t.data), levelsOn:lv(on.t.data),
        maxDeltaM:maxD*mpu, kmAcross:(on.bb.w/(GW-1))*800, tw:on.t.w, th:on.t.h,
        col:on.col, row:on.row };
    }
    /* the absent-⇒-identical guarantee, asserted directly on the pure passes */
    { const reg={x:40,y:40,w:8,h:8};
      const a=amplifyRegion(field,GW,GH,reg,64,64,{seed:7,sea:sea,detailAmp:0.12});
      const c=amplifyRegion(field,GW,GH,reg,64,64,{seed:7,sea:sea,detailAmp:0.12,reliefFloor:0});
      let d=0; for(let i=0;i<a.length;i++) d=Math.max(d,Math.abs(a[i]-c[i]));
      out.absentIsZero=d; }

    /* OCEAN: the floor must add exactly nothing below sea level */
    { let oi=-1; for(let i=0;i<field.length;i++) if(field[i]<sea-0.15){ oi=i; break; }
      if(oi>=0){ const on=tileAt(oi,base), off=tileAt(oi,offOpts);
        let n=0,maxD=0; for(let i=0;i<on.t.data.length;i++){ if(off.t.data[i]<sea-0.06){ n++;
          const d=Math.abs(on.t.data[i]-off.t.data[i]); if(d>maxD)maxD=d; } }
        out.oceanDeepPx=n; out.oceanMaxDeltaM=maxD*mpu; } }

    /* ICE / PLAYA — the risk §7A named. Coldest flat land, and driest flat land. */
    const flatExtreme=(scoreArr,wantMin)=>{ let best=wantMin?1e9:-1e9, bi=-1;
      for(let y=8;y<GH-8;y++) for(let x=8;x<GW-8;x++){ const i=y*GW+x; if(field[i]<sea) continue;
        const g=Math.hypot(field[i+1]-field[i-1],field[i+GW]-field[i-GW]);
        if(g>2e-4) continue;                                   // flat only
        const v=scoreArr[i]; if(wantMin?(v<best):(v>best)){best=v;bi=i;} } return {i:bi,v:best}; };
    for(const [nm,arr,mn] of [['ice',tempField,true],['playa',rainField,true]]){
      const s=flatExtreme(arr,mn); if(s.i<0){ out[nm]=null; continue; }
      const on=tileAt(s.i,base), off=tileAt(s.i,offOpts);
      const [lo0,hi0]=rng(off.t.data), [lo1,hi1]=rng(on.t.data);
      let maxD=0; for(let i=0;i<on.t.data.length;i++) maxD=Math.max(maxD,Math.abs(on.t.data[i]-off.t.data[i]));
      out[nm]={ signal:s.v, spanOffM:(hi0-lo0)*mpu, spanOnM:(hi1-lo1)*mpu, maxDeltaM:maxD*mpu };
    }

    /* the scalar must not cost pool eligibility — poolExtrasFree's own expression, re-evaluated */
    out.poolFree=!base.coarseFlow && !base.coarseOrder && !base.fjordM && !base.canyonM && !base.microErode;
    out.reliefFloorIsScalar=(typeof base.reliefFloor==='number' && isFinite(base.reliefFloor));

    /* =================== PART B — the local-contrast rebase =================== */
    const stat=(rgba,W,H)=>{const k=p=>(rgba[p]<<16)|(rgba[p+1]<<8)|rgba[p+2];
      const mid=(H>>1)*W*4; const s=new Set([k(mid)]); let run=1,mx=0;
      for(let x=1;x<W;x++){const p=mid+x*4; if(k(p)===k(p-4))run++; else{if(run>mx)mx=run;run=1;} s.add(k(p));}
      return {cols:s.size, run:Math.max(mx,run)}; };
    const _K=localContrastK;
    for(const key of ['plain','steep']){
      const T=tileAt(sites[key], base);
      /* the FULL ladder's floor: v2.54's own tile, rendered with v2.54's own ramp */
      const Tb=tileAt(sites[key], offOpts);
      localContrastK=()=>0;
      out[key].hBare=stat(renderHeightTileRGBA(Tb.t.data,Tb.t.w,Tb.t.h,Tb.bb),Tb.t.w,Tb.t.h);
      localContrastK=_K;
      out[key].hLadder=null;
      const onR=renderHeightTileRGBA(T.t.data,T.t.w,T.t.h,T.bb);
      localContrastK=()=>0;                                      // the SHIPPED function, switched off
      const offR=renderHeightTileRGBA(T.t.data,T.t.w,T.t.h,T.bb);
      localContrastK=_K;
      out[key].hOn=stat(onR,T.t.w,T.t.h); out[key].hOff=stat(offR,T.t.w,T.t.h);
      out[key].hLadder=out[key].hOn;
      /* the TINT must be untouched: hypso(v) is read from the true elevation, so no pixel may change
         which hypsometric band it is in. Compare hue direction, which the luminance scale cannot move. */
      /* THE DEFECT THIS CATCHES is a clamp, so test for a clamp directly. `s` is bounded to [0.4,1]
         by the band mapping, so every channel must land at or below its OWN unshaded hypso value —
         the multiplicative first cut reached s=1.35 and blew straight through it, which is what
         moved the tint. Well-conditioned at every brightness, unlike a channel ratio. */
      let overTint=0, overN=0;
      /* and, separately, that ONE scalar explains all three channels — least squares over the
         triple rather than a single-channel ratio, which is pure rounding at low brightness. */
      let resid=0;
      for(let i=0;i<T.t.w*T.t.h;i++){ const p=i*4, v=T.t.data[i], tc=hypso(v);
        for(let ch=0;ch<3;ch++){ const e=onR[p+ch]-tc[ch]; if(e>overTint){overTint=e;} if(e>1) overN++; }
        const a=[onR[p],onR[p+1],onR[p+2]], c=[offR[p],offR[p+1],offR[p+2]];
        let num=0,den=0; for(let ch=0;ch<3;ch++){ num+=a[ch]*c[ch]; den+=c[ch]*c[ch]; }
        if(den<64) continue;
        const m=num/den;
        for(let ch=0;ch<3;ch++) resid=Math.max(resid, Math.abs(a[ch]-c[ch]*m)); }
      out[key].overTint=overTint; out[key].overTintPx=overN; out[key].scalarResidual=resid;
      /* what the local field says about this tile */
      const lr=currentLocalReliefField();
      let sMin=1e9,sMax=-1e9,sSum=0,n=0;
      const cxw=T.bb.w/Math.max(1,T.t.w-1), cyw=T.bb.h/Math.max(1,T.t.h-1);
      for(let y=0;y<T.t.h;y+=16){ const rp=sampleArrRowPrep(T.bb.y+y*cyw);
        for(let x=0;x<T.t.w;x+=16){ const wx=T.bb.x+x*cxw;
          const sp=(sampleArrRow(lr.hi,wx,rp)-sampleArrRow(lr.lo,wx,rp))*mpu;
          sMin=Math.min(sMin,sp); sMax=Math.max(sMax,sp); sSum+=sp; n++; } }
      out[key].localSpanM={min:sMin,max:sMax,mean:sSum/n, k:localContrastK(sSum/n)};
    }

    /* SEAM: two real adjacent tiles, their shared column. The contrast FACTOR must match exactly —
       both read the same world-wide field at the same world coordinate. */
    { const P=out.plain, dims=pyramidDims(z);
      const colL=Math.min(dims.cols-2,P.col), colR=colL+1;
      const bbL=pyramidTileBounds(GW,GH,z,colL,P.row), bbR=pyramidTileBounds(GW,GH,z,colR,P.row);
      const tL=pyramidTile(field,GW,GH,z,colL,P.row,TS,base), tR=pyramidTile(field,GW,GH,z,colR,P.row,TS,base);
      const lr=currentLocalReliefField();
      const factor=(bb,W,H,px,py)=>{ const cxw=bb.w/Math.max(1,W-1), cyw=bb.h/Math.max(1,H-1);
        const rp=sampleArrRowPrep(bb.y+py*cyw), wx=bb.x+px*cxw;
        const lo=sampleArrRow(lr.lo,wx,rp), hi=sampleArrRow(lr.hi,wx,rp), span=hi-lo;
        return {k:localContrastK(span*mpu), lo, hi, wx}; };
      let maxF=0, maxWx=0;
      for(let y=0;y<tL.h;y++){
        const a=factor(bbL,tL.w,tL.h,tL.w-1,y), c=factor(bbR,tR.w,tR.h,0,y);
        maxF=Math.max(maxF, Math.abs(a.k-c.k), Math.abs(a.lo-c.lo), Math.abs(a.hi-c.hi));
        maxWx=Math.max(maxWx, Math.abs(a.wx-c.wx)); }
      out.seamFactorDelta=maxF; out.seamCoordDelta=maxWx;
      /* and the finished RGBA, on vs off, so the change cannot be hiding a seam elsewhere */
      const seamRGBA=()=>{ const A=renderHeightTileRGBA(tL.data,tL.w,tL.h,bbL), B=renderHeightTileRGBA(tR.data,tR.w,tR.h,bbR);
        let m=0; for(let y=0;y<tL.h;y++){ const pa=(y*tL.w+tL.w-1)*4, pb=(y*tR.w)*4;
          for(let ch=0;ch<3;ch++) m=Math.max(m,Math.abs(A[pa+ch]-B[pb+ch])); } return m; };
      out.seamRGBAOn=seamRGBA();
      localContrastK=()=>0; out.seamRGBAOff=seamRGBA(); localContrastK=_K; }

    /* buildLocalReliefField: wraps in X only when asked */
    { const W=8,H=4, f=new Float32Array(W*H);
      for(let y=0;y<H;y++) for(let x=0;x<W;x++) f[y*W+x]= (x===0?1:0);   // a spike on the left edge only
      const nw=buildLocalReliefField(f,W,H,2,false), wr=buildLocalReliefField(f,W,H,2,true);
      out.wrapOff=nw.hi[0*W+(W-1)];     // right edge: no wrap ⇒ never sees the spike ⇒ 0
      out.wrapOn =wr.hi[0*W+(W-1)];     // wrapped ⇒ sees it ⇒ 1
      out.wrapSym=[nw.hi[0], wr.hi[0]]; }
    return out;
  });

  const P=R.plain, S=R.steep;
  console.log(`\nworld: seed 12345 · region · 800 km · 1024 px · ${R.mpu.toFixed(0)} m per height unit`);
  console.log(`LOD 7 tile ${P.tw}x${P.th}, ${P.kmAcross.toFixed(2)} km across · reliefFloor ${R.floorNow.toExponential(3)}\n`);
  console.log('PART A — the relief floor');
  ok('the floor is bit-identical when absent', R.absentIsZero===0, `max Δ ${R.absentIsZero}`);
  ok('the floor is a REAL-METRE quantity (invariant under metersPerUnit)', R.metreInvariant<1e-9,
     `|f(1000)*1000 - f(2000)*2000| = ${R.metreInvariant.toExponential(2)}`);
  ok('degenerate inputs floor to 0, never NaN', R.floorZeroGuards.every(v=>v===0), JSON.stringify(R.floorZeroGuards));
  ok('the flat plain gains real relief', P.spanOnM > P.spanOffM*1.4,
     `span ${P.spanOffM.toFixed(2)} m -> ${P.spanOnM.toFixed(2)} m  (max px Δ ${P.maxDeltaM.toFixed(2)} m)`);
  ok('and gains distinct heights with it', P.levelsOn > P.levelsOff,
     `${P.levelsOff.toLocaleString()} -> ${P.levelsOn.toLocaleString()} distinct`);
  /* a steep TILE is not uniformly steep — it holds valley floors and benches where the floor
     legitimately binds — so the claim is that the floor is negligible AGAINST THE TILE'S OWN SPAN,
     not that it never fires. The span itself must not move at all. */
  ok('the steep tile is negligibly changed relative to its own span',
     (S.maxDeltaM/S.spanOffM)<0.002 && Math.abs(S.spanOnM-S.spanOffM)<0.05,
     `span ${S.spanOffM.toFixed(1)} m -> ${S.spanOnM.toFixed(1)} m, max px Δ ${S.maxDeltaM.toFixed(2)} m = ${(100*S.maxDeltaM/S.spanOffM).toFixed(3)}% of span`);
  ok('deep ocean is untouched — the floor is land-only by construction', R.oceanMaxDeltaM===0,
     `${R.oceanDeepPx} sub-shelf px, max Δ ${R.oceanMaxDeltaM} m`);
  if(R.ice) ok('coldest flat land: the floor adds a few metres, not a mountain range', R.ice.maxDeltaM<40,
     `T=${R.ice.signal.toFixed(1)}C  span ${R.ice.spanOffM.toFixed(2)} -> ${R.ice.spanOnM.toFixed(2)} m, max Δ ${R.ice.maxDeltaM.toFixed(2)} m`);
  if(R.playa) ok('driest flat land: same', R.playa.maxDeltaM<40,
     `rain=${R.playa.signal.toFixed(3)}  span ${R.playa.spanOffM.toFixed(2)} -> ${R.playa.spanOnM.toFixed(2)} m, max Δ ${R.playa.maxDeltaM.toFixed(2)} m`);
  ok('it is a SCALAR, so a refine batch stays pool-eligible', R.reliefFloorIsScalar && R.poolFree,
     `reliefFloor=${R.floorNow.toExponential(3)}, poolExtrasFree=${R.poolFree}`);

  console.log('\nPART B — the local-contrast rebase (Relief / Height view)');
  ok('B alone: the plain gains a real gradient', P.hOn.cols > P.hOff.cols*4 && P.hOn.run < P.hOff.run,
     `${P.hOff.cols} -> ${P.hOn.cols} colours / longest run ${P.hOff.run} -> ${P.hOn.run} px  (this control already has A)`);
  ok('A+B together take the plain off the floor', P.hLadder.cols > P.hBare.cols*20 && P.hLadder.run < P.hBare.run/8,
     `bare ${P.hBare.cols} colours / run ${P.hBare.run} px  ->  A+B ${P.hLadder.cols} / ${P.hLadder.run} px`);
  ok('the steep tile is left alone — its local span is past the cutoff', S.hOn.cols===S.hOff.cols && S.hOn.run===S.hOff.run,
     `${S.hOff.cols} colours / run ${S.hOff.run} px, local span mean ${S.localSpanM.mean.toFixed(0)} m -> k=${S.localSpanM.k.toFixed(3)}`);
  /* "luminance only" stated so it can fail: every pixel's on-colour must be its off-colour times ONE
     scalar, to 8-bit rounding. A clamped channel breaks this immediately — which is how the
     multiplicative first cut was caught. */
  /* "luminance only" stated so it can fail. The shading band bounds s to [0.4,1], so no channel may
     exceed its own unshaded hypso value — a clamp is exactly what breaks that, and is how the
     multiplicative first cut was caught (it reached s=1.35 and shifted the tint by 4.09e-3). */
  ok('the TINT stays absolute — no channel exceeds its own unshaded hypso value',
     P.overTint<=1 && S.overTint<=1,
     `plain max over-tint ${P.overTint}/255 (${P.overTintPx} px), steep ${S.overTint}/255`);
  ok('...and one scalar explains all three channels', P.scalarResidual<=2.01,
     `max |on - off*m| = ${P.scalarResidual.toFixed(3)} / 255 — 8-bit rounding of two renders`);
  ok('SEAM: adjacent tiles read the identical world coordinate', R.seamCoordDelta<1e-9,
     `max |Δwx| ${R.seamCoordDelta.toExponential(2)}`);
  ok('SEAM: and therefore the identical contrast factor — Δ exactly 0', R.seamFactorDelta===0,
     `max |Δk|,|Δlo|,|Δhi| = ${R.seamFactorDelta}`);
  ok('SEAM: the finished RGBA seam is no worse than with the rebase off', R.seamRGBAOn<=R.seamRGBAOff,
     `on ${R.seamRGBAOn}/255 vs off ${R.seamRGBAOff}/255 (the v1.29 hillshade residue, unchanged)`);
  ok('the local-relief field wraps in X only when asked', R.wrapOff===0 && R.wrapOn===1,
     `right-edge max: nowrap ${R.wrapOff}, wrap ${R.wrapOn}`);

  console.log(`\n${pass} passed, ${fail} failed`);
  await b.close();
  process.exit(fail?1:0);
})();
