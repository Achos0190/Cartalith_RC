#!/usr/bin/env node
/* RESEARCH part 3: on a lowland plain at z=8, how much of the flatness is the DATA and how much is
 * addZoomDetail's relief gate? Both amplifyRegion and addZoomDetail multiply every added octave by
 * relief = min(1, |grad coarse| * 8), which is ~0 on a plain. */
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
    const sx=fi%GW, sy=(fi/GW)|0, z=8, dims=pyramidDims(z);
    const col=Math.min(dims.cols-1,Math.floor(sx/((GW-1)/dims.cols)));
    const row=Math.min(dims.rows-1,Math.floor(sy/((GH-1)/dims.rows)));
    const bb=pyramidTileBounds(GW,GH,z,col,row);
    const cx=bb.x+bb.w/2, cy=bb.y+bb.h/2;
    const gx=(sampleC1(field,GW,GH,cx+1,cy)-sampleC1(field,GW,GH,cx-1,cy))*0.5;
    const gy=(sampleC1(field,GW,GH,cx,cy+1)-sampleC1(field,GW,GH,cx,cy-1))*0.5;
    const relief=Math.min(1,Math.hypot(gx,gy)*8);
    const span=(t)=>{ let lo=1e9,hi=-1e9; for(let i=0;i<t.length;i++){ if(t[i]<lo)lo=t[i]; if(t[i]>hi)hi=t[i]; } return (hi-lo)*mpu; };
    const shipped=pyramidTile(field,GW,GH,z,col,row,512,lodTileOpts());
    // what the SAME tile would span if the relief taper were 1 instead of ~0: amplifyRegion's added
    // term is d*detailAmp*taper, and addZoomDetail's is sum*relief. Reconstruct the unclamped ceiling.
    const o=lodTileOpts();
    const amp=(o.detailAmp!=null?o.detailAmp:0.14);
    const zk=(o.zoomDetailK!=null?o.zoomDetailK:1);
    let ladder=0, a=amp*0.6*zk; for(let k=0;k<6;k++){ ladder+=a; a*=0.6; }
    return {relief, gradCoarse:Math.hypot(gx,gy), shippedSpanM:span(shipped.data),
      amplifyCeilM:amp*mpu, ladderCeilM:ladder*mpu,
      amplifyActualM:amp*relief*mpu, ladderActualM:ladder*relief*mpu,
      kmAcross:(bb.w/(GW-1))*800};
  });
  const f=(x,d=2)=>x.toFixed(d);
  console.log(`\nLOWLAND plain, z=8, ${f(R.kmAcross)} km across`);
  console.log(`  coarse |grad| ${R.gradCoarse.toExponential(2)}  ->  relief gate = ${f(R.relief,4)}\n`);
  console.log(`  shipped tile height span            : ${f(R.shippedSpanM,1)} m`);
  console.log(`  amplifyRegion detail, ungated       : +-${f(R.amplifyCeilM,1)} m   gated -> +-${f(R.amplifyActualM,2)} m`);
  console.log(`  addZoomDetail ladder, ungated       : +-${f(R.ladderCeilM,1)} m   gated -> +-${f(R.ladderActualM,2)} m`);
  console.log(`\n  => the gate removes ${f(100*(1-R.relief),1)}% of every synthetic octave on this tile\n`);
  await b.close();
})();
