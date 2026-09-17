#!/usr/bin/env node
/* RESEARCH part 2: cost/benefit of rebasing the height ramp per tile at deep LOD.
 *  A. banding structure — is the flat tile actually STEPPED, or just smooth?
 *  B. upside — distinct colours if r is stretched to the tile's own [min,max]
 *  C. breakage — how much of a lowland tile crosses r-keyed ABSOLUTE thresholds once rebased
 *  D. seam cost — how far apart two adjacent tiles' mappings would be at their shared edge
 */
const path=require('path');
const {chromium}=require(process.env.PLAYWRIGHT_DIR||'/opt/node22/lib/node_modules/playwright');
const FILE=process.argv[2];
(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium',args:['--no-sandbox']});
  const pg=await b.newPage({viewport:{width:1300,height:900}});
  pg.on('pageerror',e=>console.log('PAGEERROR '+e.message));
  await pg.goto('file://'+path.resolve(FILE));
  await pg.waitForFunction(()=>typeof generate==='function',{timeout:120000});
  const R=await pg.evaluate(async()=>{
    state.world=false; state.resW=1024; state.mapWidthKm=800; state.tect.seed=12345;
    await generate();
    const sea=state.seaLevel, denom=1-sea, mpu=metersPerUnit();
    /* a genuine LOWLAND flat: flattest land cell whose TRUE r sits mid-range, which is where a
       per-tile rebase would wrongly push a plain across the rock/scree thresholds. The first cut of
       this probe took the flattest land cell outright and got a high plateau at r=0.91, where those
       thresholds already fire for real — the breakage it measured there was meaningless. */
    let flat=1e9,fi=-1;
    for(let y=8;y<GH-8;y++) for(let x=8;x<GW-8;x++){ const i=y*GW+x; if(field[i]<sea) continue;
      const rr=(field[i]-sea)/denom; if(rr<0.15||rr>0.55) continue;
      const g=Math.hypot(field[i+1]-field[i-1], field[i+GW]-field[i-GW]); if(g<flat){flat=g;fi=i;} }
    const sx=fi%GW, sy=(fi/GW)|0, z=8, dims=pyramidDims(z);
    const stepX=(GW-1)/dims.cols, stepY=(GH-1)/dims.rows;
    const col=Math.min(dims.cols-1,Math.floor(sx/stepX)), row=Math.min(dims.rows-1,Math.floor(sy/stepY));
    const bb=pyramidTileBounds(GW,GH,z,col,row);
    const T=pyramidTile(field,GW,GH,z,col,row,512,lodTileOpts());
    const W=T.w,H=T.h,t=T.data;
    let lo=1e9,hi=-1e9; for(let i=0;i<t.length;i++){ if(t[i]<lo)lo=t[i]; if(t[i]>hi)hi=t[i]; }

    /* A. banding in the SHIPPED height view */
    const img=renderHeightTileRGBA(t,W,H,bb);
    const bimg=renderBiomeTileRGBA(t,W,H,bb);
    const key=p=>(img[p]<<16)|(img[p+1]<<8)|img[p+2];
    let maxRun=0, runs=0, rowDistinct=0;
    { const mid=(H>>1)*W*4; let run=1, seen=new Set([key(mid)]);
      for(let x=1;x<W;x++){ const p=mid+x*4; if(key(p)===key(p-4)) run++; else {maxRun=Math.max(maxRun,run);run=1;runs++;} seen.add(key(p)); }
      maxRun=Math.max(maxRun,run); rowDistinct=seen.size; }
    let bMaxRun=0,bRowDistinct=0;
    { const bk=p=>(bimg[p]<<16)|(bimg[p+1]<<8)|bimg[p+2];
      const mid=(H>>1)*W*4; let run=1, seen=new Set([bk(mid)]);
      for(let x=1;x<W;x++){ const p=mid+x*4; if(bk(p)===bk(p-4)) run++; else {bMaxRun=Math.max(bMaxRun,run);run=1;} seen.add(bk(p)); }
      bMaxRun=Math.max(bMaxRun,run); bRowDistinct=seen.size; }

    /* B. upside: hypso on the tile's own range vs the global one */
    const cnt=(f)=>{ const s=new Set();
      for(let i=0;i<t.length;i+=7){ const c=f(t[i]); s.add((Math.round(c[0])<<16)|(Math.round(c[1])<<8)|Math.round(c[2])); }
      return s.size; };
    const globalCols=cnt(v=>hypso(v));
    const span=(hi-lo)||1e-9;
    const rebased=cnt(v=>hypso(sea+((v-lo)/span)*denom));   // stretch the tile's range across [sea,1]

    /* C. breakage: r-keyed ABSOLUTE thresholds once rebased */
    let rockThresh=0, screeThresh=0, mangrove=0, n=0;
    for(let i=0;i<t.length;i+=7){ const rl=(t[i]-lo)/span; n++;
      if(rl>0.7) rockThresh++;            // materialWeights: smoothstep(0.7,0.95,r) -> rock
      if(rl>0.82) screeThresh++;          // rockCol: ramp3(ROCK_SCREE)
      if(rl<0.08) mangrove++; }           // materialWeights: smoothstep(0.08,0,r) -> mangrove
    const rTrueMax=(hi-sea)/denom, rTrueMin=(lo-sea)/denom;

    /* D. seam: the tile immediately east, and how far apart the two mappings are */
    const col2=Math.min(dims.cols-1,col+1);
    const T2=pyramidTile(field,GW,GH,z,col2,row,512,lodTileOpts());
    let lo2=1e9,hi2=-1e9; for(let i=0;i<T2.data.length;i++){ if(T2.data[i]<lo2)lo2=T2.data[i]; if(T2.data[i]>hi2)hi2=T2.data[i]; }
    // shared column: this tile's last column vs the neighbour's first
    let seamNow=0, seamRebased=0;
    const span2=(hi2-lo2)||1e-9;
    for(let y=0;y<H;y++){
      const a=t[y*W+W-1], bv=T2.data[y*T2.w+0];
      const cA=hypso(a), cB=hypso(bv);
      seamNow=Math.max(seamNow, Math.max(Math.abs(cA[0]-cB[0]),Math.abs(cA[1]-cB[1]),Math.abs(cA[2]-cB[2])));
      const rA=hypso(sea+((a-lo)/span)*denom), rB=hypso(sea+((bv-lo2)/span2)*denom);
      seamRebased=Math.max(seamRebased, Math.max(Math.abs(rA[0]-rB[0]),Math.abs(rA[1]-rB[1]),Math.abs(rA[2]-rB[2])));
    }
    return {sea,denom,mpu,lo,hi,spanM:(hi-lo)*mpu,kmAcross:(bb.w/(GW-1))*800,
      maxRun,runs,rowDistinct,bMaxRun,bRowDistinct,W,globalCols,rebased,
      rockPct:100*rockThresh/n, screePct:100*screeThresh/n, mangrovePct:100*mangrove/n,
      rTrueMin,rTrueMax, nbrLo:lo2,nbrHi:hi2, nbrSpanM:(hi2-lo2)*mpu, seamNow, seamRebased};
  });
  const f=(x,d=2)=>x.toFixed(d);
  console.log(`\nFLAT tile, z=8, ${f(R.kmAcross)} km across, 512 px`);
  console.log(`  height span ${f(R.spanM,1)} m   true r range ${f(R.rTrueMin,4)}..${f(R.rTrueMax,4)}\n`);
  console.log('A. BANDING in the shipped Height view (centre scanline of 512 px)');
  console.log(`   distinct colours on the row : ${R.rowDistinct}`);
  console.log(`   longest identical run       : ${R.maxRun} px   (${f(100*R.maxRun/R.W,1)}% of the row)`);
  console.log(`   colour changes across row   : ${R.runs}`);
  console.log(`   Biome view, same row        : ${R.bRowDistinct} distinct, longest run ${R.bMaxRun} px\n`);
  console.log('B. UPSIDE of rebasing the ramp to the tile\'s own min/max');
  console.log(`   distinct colours, global ramp : ${R.globalCols}`);
  console.log(`   distinct colours, rebased     : ${R.rebased}   (x${f(R.rebased/Math.max(1,R.globalCols),1)})\n`);
  console.log('C. BREAKAGE — r-keyed ABSOLUTE thresholds, once r is rebased');
  console.log(`   true elevation never exceeds r=${f(R.rTrueMax,4)}, so NONE of these should fire`);
  console.log(`   pixels that would cross rock    (r>0.70) : ${f(R.rockPct,1)}%`);
  console.log(`   pixels that would cross scree   (r>0.82) : ${f(R.screePct,1)}%`);
  console.log(`   pixels that would cross mangrove(r<0.08) : ${f(R.mangrovePct,1)}%\n`);
  console.log('D. SEAM COST — this tile vs its east neighbour at the shared column');
  console.log(`   neighbour span ${f(R.nbrSpanM,1)} m  vs this tile ${f(R.spanM,1)} m`);
  console.log(`   max channel jump, shipped global ramp : ${f(R.seamNow,1)} / 255`);
  console.log(`   max channel jump, per-tile rebased    : ${f(R.seamRebased,1)} / 255\n`);
  await b.close();
})();
