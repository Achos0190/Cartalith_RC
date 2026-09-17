#!/usr/bin/env node
/* RESEARCH part 5: are the two rebases independent? Stretching the COLOUR ramp on a BAKED tile
 * renders the atlas's 16-bit global quantization staircase at full contrast. Measure it. */
const path=require('path');
const {chromium}=require(process.env.PLAYWRIGHT_DIR||'/opt/node22/lib/node_modules/playwright');
(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium',args:['--no-sandbox']});
  const pg=await b.newPage({viewport:{width:1300,height:900}});
  pg.on('pageerror',e=>console.log('PAGEERROR '+e.message));
  await pg.goto('file://'+path.resolve(process.argv[2]));
  await pg.waitForFunction(()=>typeof generate==='function',{timeout:120000});
  const R=await pg.evaluate(async()=>{
    state.world=false; state.resW=1024; state.mapWidthKm=800; state.tect.seed=12345;
    await generate();
    const sea=state.seaLevel, denom=1-sea, mpu=metersPerUnit();
    let flat=1e9,fi=-1;
    for(let y=8;y<GH-8;y++) for(let x=8;x<GW-8;x++){ const i=y*GW+x; if(field[i]<sea) continue;
      const rr=(field[i]-sea)/denom; if(rr<0.15||rr>0.55) continue;
      const g=Math.hypot(field[i+1]-field[i-1], field[i+GW]-field[i-GW]); if(g<flat){flat=g;fi=i;} }
    const z=8, dims=pyramidDims(z);
    const col=Math.min(dims.cols-1,Math.floor((fi%GW)/((GW-1)/dims.cols)));
    const row=Math.min(dims.rows-1,Math.floor(((fi/GW)|0)/((GH-1)/dims.rows)));
    const T=pyramidTile(field,GW,GH,z,col,row,512,lodTileOpts());
    const baked=atlasDecodeChunk(atlasEncodeChunk(T));
    const scan=(a)=>{ const mid=(T.h>>1)*T.w; return a.slice(mid,mid+T.w); };
    const stats=(rowArr, lo, hi)=>{                       // rebased hypso across [lo,hi]
      const span=(hi-lo)||1e-9, seen=new Set(); let maxRun=0, run=1, prev=null;
      for(let i=0;i<rowArr.length;i++){
        const c=hypso(sea+((rowArr[i]-lo)/span)*denom);
        const k=(Math.round(c[0])<<16)|(Math.round(c[1])<<8)|Math.round(c[2]);
        seen.add(k); if(prev!==null){ if(k===prev)run++; else {if(run>maxRun)maxRun=run; run=1;} } prev=k; }
      return {distinct:seen.size, maxRun:Math.max(maxRun,run)};
    };
    const rr=scan(T.data), rb=scan(baked.data);
    const rng=a=>{ let lo=1e9,hi=-1e9; for(let i=0;i<a.length;i++){ if(a[i]<lo)lo=a[i]; if(a[i]>hi)hi=a[i]; } return [lo,hi]; };
    const [lo,hi]=rng(T.data), [lo2,hi2]=rng(baked.data);
    return { spanM:(hi-lo)*mpu,
      rawRebased:stats(rr,lo,hi), bakedRebased:stats(rb,lo2,hi2) };
  });
  const f=(x,d=1)=>x.toFixed(d);
  console.log(`\nLOWLAND plain, z=8, tile spans ${f(R.spanM)} m — colour ramp REBASED to the tile's own range\n`);
  console.log('                        distinct colours/row   longest identical run');
  console.log(`  raw float32 tile      ${String(R.rawRebased.distinct).padStart(8)}             ${String(R.rawRebased.maxRun).padStart(4)} px`);
  console.log(`  after the atlas bake  ${String(R.bakedRebased.distinct).padStart(8)}             ${String(R.bakedRebased.maxRun).padStart(4)} px\n`);
  await b.close();
})();
