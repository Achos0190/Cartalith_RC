#!/usr/bin/env node
/* How many bits does the stored height word actually need?
 *   node tests/perf/probe_heightbits.js "Cartalith v2.52 DCC test.html"
 *
 * Quantises ONE real LOD-7 tile (the flattest mid-elevation land site, same rule as
 * probe_lod7compare.js) four ways and counts how many of its distinct source heights survive:
 * 16/24/32-bit over the GLOBAL [0,1] range, and 16-bit over the chunk's own range.
 *
 * The result that matters is that 24 and 32 are identical, because `field` is a Float32Array and
 * f32 carries a 24-bit mantissa — `f32UlpM` vs `stepG24` agree to seven figures. Backs
 * docs/research/deep-zoom-contrast.md §7C. Prints JSON; exits 0 either way.
 *
 * `srcLevels` is the ceiling: no encoding can recover more than the tile already contains. */
const path=require('path');
const {chromium}=require(process.env.PLAYWRIGHT_DIR||'/opt/node22/lib/node_modules/playwright');
(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium',args:['--no-sandbox']});
  const pg=await b.newPage(); pg.on('pageerror',e=>console.log('ERR '+e.message));
  await pg.goto('file://'+path.resolve(process.argv[2]));
  await pg.waitForFunction(()=>typeof generate==='function',{timeout:120000});
  const out=await pg.evaluate(async()=>{
    state.world=false; state.resW=1024; state.mapWidthKm=800; state.tect.seed=12345; await generate();
    const sea=state.seaLevel, mpu=metersPerUnit(), z=7;
    // flattest land cell in a mid elevation band (same site rule as the figure)
    let best=1e9,bi=-1;
    for(let y=8;y<GH-8;y++)for(let x=8;x<GW-8;x++){const i=y*GW+x; if(field[i]<sea)continue;
      const rr=(field[i]-sea)/(1-sea); if(rr<0.15||rr>0.55)continue;
      const g=Math.hypot(field[i+1]-field[i-1],field[i+GW]-field[i-GW]); if(g<best){best=g;bi=i;}}
    const col=Math.floor((bi%GW)/GW*(1<<z)), row=Math.floor(Math.floor(bi/GW)/GH*(1<<z));
    const t=pyramidTile(field,GW,GH,z,col,row,512,lodTileOpts());
    const d=t.data; let lo=1e9,hi=-1e9; for(const v of d){if(v<lo)lo=v;if(v>hi)hi=v;}
    const span=hi-lo;
    const distinct=a=>{const s=new Set(); for(const v of a)s.add(v); return s.size;};
    const q=(n,base,rng)=>{const m=n-1,o=new Float32Array(d.length);
      for(let i=0;i<d.length;i++)o[i]=Math.round((d[i]-base)/rng*m)/m*rng+base; return o;};
    // f32 ULP at the top of the tile's own values
    const ulp=Math.abs(Math.fround(hi*(1+Math.pow(2,-23)))-hi);
    return { spanM:span*mpu, srcLevels:distinct(d), px:d.length,
      g16:distinct(q(65536,0,1)), g24:distinct(q(16777216,0,1)), g32max:distinct(q(4294967296,0,1)),
      c16:distinct(q(65536,lo,span)),
      stepG16:1/65535*mpu, stepG24:1/16777215*mpu, stepC16:span/65535*mpu, f32UlpM:ulp*mpu };
  });
  console.log(JSON.stringify(out,null,1)); await b.close();
})();
