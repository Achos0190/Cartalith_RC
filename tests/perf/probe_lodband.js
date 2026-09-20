#!/usr/bin/env node
/* RESEARCH (not a verification probe): where does colour resolution go at LOD 6-8?
 * Measures, per pyramid level, on real tiles of a real world:
 *   - the tile's own height span, and what fraction of the GLOBAL [sea,1] range that is
 *   - distinct RGB values out of each tile renderer
 *   - the same with hillshade neutralised (exag -> 0), which isolates the height RAMP alone
 *   - whether the height DATA carries fine detail at that level (2nd-difference energy)
 *   - the coarse relief at the tile, to test the addZoomDetail relief-gate hypothesis
 */
const path=require('path');
const {chromium}=require(process.env.PLAYWRIGHT_DIR||'/opt/node22/lib/node_modules/playwright');
const FILE=process.argv[2], MAPKM=+(process.argv[3]||800), RES=+(process.argv[4]||1024);
(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium',args:['--no-sandbox']});
  const pg=await b.newPage({viewport:{width:1300,height:900}});
  pg.on('pageerror',e=>console.log('PAGEERROR '+e.message));
  await pg.goto('file://'+path.resolve(FILE));
  await pg.waitForFunction(()=>typeof generate==='function',{timeout:120000});

  const R=await pg.evaluate(async({mapkm,res})=>{
    state.world=false; state.resW=res; state.mapWidthKm=mapkm; state.tect.seed=12345;
    await generate();
    const sea=state.seaLevel, denom=1-sea, mpu=metersPerUnit();

    // pick two probe sites: the steepest land cell and the flattest land cell well inside the map
    let best=-1,bi=-1, flat=1e9,fi=-1;
    for(let y=8;y<GH-8;y++) for(let x=8;x<GW-8;x++){
      const i=y*GW+x; if(field[i]<sea) continue;
      const g=Math.hypot(field[i+1]-field[i-1], field[i+GW]-field[i-GW]);
      if(g>best){best=g;bi=i;}
      if(g<flat){flat=g;fi=i;}
    }
    const sites={ steep:{x:bi%GW,y:(bi/GW)|0,grad:best}, flat:{x:fi%GW,y:(fi/GW)|0,grad:flat} };

    const distinct=(rgba)=>{ const s=new Set();
      for(let p=0;p<rgba.length;p+=4) s.add((rgba[p]<<16)|(rgba[p+1]<<8)|rgba[p+2]); return s.size; };
    const hfEnergy=(t,W,H)=>{ let e=0,n=0;
      for(let y=1;y<H-1;y++) for(let x=1;x<W-1;x++){ const i=y*W+x;
        const l=t[i-1]+t[i+1]+t[i-W]+t[i+W]-4*t[i]; e+=l*l; n++; } return Math.sqrt(e/Math.max(1,n)); };

    const out={sea,denom,mpu,GW,GH,mapkm,res,sites:{},global:{}};
    let lo=1e9,hi=-1e9; for(let i=0;i<field.length;i++){ if(field[i]<lo)lo=field[i]; if(field[i]>hi)hi=field[i]; }
    out.global={lo,hi,spanM:(hi-lo)*mpu};

    for(const key of ['steep','flat']){
      const S=sites[key]; const rows=[];
      for(const z of [4,5,6,7,8]){
        const dims=pyramidDims(z), stepX=(GW-1)/dims.cols, stepY=(GH-1)/dims.rows;
        const col=Math.min(dims.cols-1,Math.floor(S.x/stepX)), row=Math.min(dims.rows-1,Math.floor(S.y/stepY));
        const bb=pyramidTileBounds(GW,GH,z,col,row);
        const t=pyramidTile(field,GW,GH,z,col,row,512,lodTileOpts());
        let tlo=1e9,thi=-1e9; for(let i=0;i<t.data.length;i++){ if(t.data[i]<tlo)tlo=t.data[i]; if(t.data[i]>thi)thi=t.data[i]; }
        const dr=(thi-tlo)/denom;                       // the tile's span in GLOBAL r units

        const ex0=state.exag;
        const hA=renderHeightTileRGBA(t.data,t.w,t.h,bb), bA=renderBiomeTileRGBA(t.data,t.w,t.h,bb);
        state.exag=0;                                   // neutralise hillshade -> the ramp alone
        const hB=renderHeightTileRGBA(t.data,t.w,t.h,bb), bB=renderBiomeTileRGBA(t.data,t.w,t.h,bb);
        state.exag=ex0;

        // coarse relief exactly as amplifyRegion/addZoomDetail compute it (gates every added octave)
        const cx=bb.x+bb.w/2, cy=bb.y+bb.h/2;
        const gx=(sampleC1(field,GW,GH,cx+1,cy)-sampleC1(field,GW,GH,cx-1,cy))*0.5;
        const gy=(sampleC1(field,GW,GH,cx,cy+1)-sampleC1(field,GW,GH,cx,cy-1))*0.5;
        const relief=Math.min(1,Math.hypot(gx,gy)*8);

        rows.push({z, kmAcross:(bb.w/(GW-1))*mapkm, spanM:(thi-tlo)*mpu, dr,
          drPctOfGlobal:dr*100, relief,
          heightHF:hfEnergy(t.data,t.w,t.h),
          hCols:distinct(hA), hColsNoShade:distinct(hB),
          bCols:distinct(bA), bColsNoShade:distinct(bB)});
      }
      out.sites[key]={site:S,rows};
    }
    return out;
  },{mapkm:MAPKM,res:RES});

  console.log(`\nworld: ${R.mapkm} km / ${R.res}px  seaLevel ${R.sea.toFixed(4)}  m per unit ${R.mpu.toFixed(0)}`);
  console.log(`global field span ${R.global.lo.toFixed(4)}..${R.global.hi.toFixed(4)} = ${R.global.spanM.toFixed(0)} m\n`);
  for(const key of ['steep','flat']){
    const S=R.sites[key];
    console.log(`--- ${key.toUpperCase()} site  (coarse |grad| ${S.site.grad.toExponential(2)}) ---`);
    console.log('  z  km across   span(m)   Δr %global  relief  height-HF   HEIGHT view       BIOME view');
    console.log('                                                          all / no-shade    all / no-shade');
    for(const r of S.rows)
      console.log(`  ${r.z}  ${r.kmAcross.toFixed(2).padStart(8)}  ${r.spanM.toFixed(1).padStart(8)}  ${r.drPctOfGlobal.toFixed(3).padStart(9)}  ${r.relief.toFixed(3).padStart(6)}  ${r.heightHF.toExponential(2)}  ${String(r.hCols).padStart(5)} / ${String(r.hColsNoShade).padStart(4)}    ${String(r.bCols).padStart(5)} / ${String(r.bColsNoShade).padStart(4)}`);
    console.log('');
  }
  await b.close();
})();
