#!/usr/bin/env node
/* RESEARCH part 4: does the ATLAS's 16-bit global height encoding terrace a deep tile?
 * packHeight16 does q = round(v*65535) over the GLOBAL [0,1]. A baked chunk comes back through
 * unpackHeight16, so its height is on a fixed global ladder regardless of how little the tile spans.
 * Compare each tile as generated (float32) against the same tile after a real bake round trip. */
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
    const pick=(loR,hiR,wantFlat)=>{ let best=wantFlat?1e9:-1, bi=-1;
      for(let y=8;y<GH-8;y++) for(let x=8;x<GW-8;x++){ const i=y*GW+x; if(field[i]<sea) continue;
        const rr=(field[i]-sea)/denom; if(rr<loR||rr>hiR) continue;
        const g=Math.hypot(field[i+1]-field[i-1], field[i+GW]-field[i-GW]);
        if(wantFlat?(g<best):(g>best)){best=g;bi=i;} }
      return {x:bi%GW,y:(bi/GW)|0}; };
    const sites={ plain:pick(0.15,0.55,true), steep:pick(0,1,false) };
    const distinct=a=>{ const s=new Set(); for(let i=0;i<a.length;i++) s.add(a[i]); return s.size; };
    const cols=rgba=>{ const s=new Set(); for(let p=0;p<rgba.length;p+=4) s.add((rgba[p]<<16)|(rgba[p+1]<<8)|rgba[p+2]); return s.size; };
    const longestRun=a=>{ let m=0,r=1; for(let i=1;i<a.length;i++){ if(a[i]===a[i-1])r++; else {if(r>m)m=r;r=1;} } return r>m?r:m; };
    const out={mpu, globalStepM:mpu/65535, sites:{}};
    for(const k of ['plain','steep']){
      const S=sites[k], rows=[];
      for(const z of [6,7,8]){
        const dims=pyramidDims(z);
        const col=Math.min(dims.cols-1,Math.floor(S.x/((GW-1)/dims.cols)));
        const row=Math.min(dims.rows-1,Math.floor(S.y/((GH-1)/dims.rows)));
        const bb=pyramidTileBounds(GW,GH,z,col,row);
        const T=pyramidTile(field,GW,GH,z,col,row,512,lodTileOpts());
        let lo=1e9,hi=-1e9; for(let i=0;i<T.data.length;i++){ if(T.data[i]<lo)lo=T.data[i]; if(T.data[i]>hi)hi=T.data[i]; }
        const spanM=(hi-lo)*mpu;
        /* the REAL bake round trip the atlas performs */
        const baked=atlasDecodeChunk(atlasEncodeChunk(T));
        const mid=(T.h>>1)*T.w;
        const rowRaw=T.data.slice(mid,mid+T.w), rowBak=baked.data.slice(mid,mid+T.w);
        rows.push({z, kmAcross:(bb.w/(GW-1))*800, spanM,
          levelsRaw:distinct(rowRaw), levelsBaked:distinct(rowBak),
          runRaw:longestRun(rowRaw), runBaked:longestRun(rowBak),
          colsRaw:cols(renderHeightTileRGBA(T.data,T.w,T.h,bb)),
          colsBaked:cols(renderHeightTileRGBA(baked.data,T.w,T.h,bb)),
          bColsRaw:cols(renderBiomeTileRGBA(T.data,T.w,T.h,bb)),
          bColsBaked:cols(renderBiomeTileRGBA(baked.data,T.w,T.h,bb)),
          localStepM:spanM/65535});
      }
      out.sites[k]=rows;
    }
    return out;
  });
  const f=(x,d=2)=>x.toFixed(d);
  console.log(`\npackHeight16 step over the GLOBAL range: ${R.globalStepM.toExponential(3)} m  (${f(R.globalStepM,4)} m)\n`);
  for(const k of ['plain','steep']){
    console.log(`--- ${k.toUpperCase()} ---`);
    console.log('  z   km    span(m)   height levels/row     longest flat run     Height cols        Biome cols     16-bit step if LOCAL');
    console.log('                       raw -> baked          raw -> baked        raw -> baked      raw -> baked');
    for(const r of R.sites[k])
      console.log(`  ${r.z}  ${f(r.kmAcross,2).padStart(5)}  ${f(r.spanM,1).padStart(8)}   ${String(r.levelsRaw).padStart(4)} -> ${String(r.levelsBaked).padStart(4)}        ${String(r.runRaw).padStart(4)} -> ${String(r.runBaked).padStart(4)} px      ${String(r.colsRaw).padStart(5)} -> ${String(r.colsBaked).padStart(5)}    ${String(r.bColsRaw).padStart(5)} -> ${String(r.bColsBaked).padStart(5)}    ${r.localStepM.toExponential(2)} m`);
    console.log('');
  }
  await b.close();
})();
