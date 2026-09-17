#!/usr/bin/env node
/* v2.53: the baked atlas must stop destroying height detail.
 *   node tests/perf/probe_hgt24.js "Cartalith v2.53 DCC test.html" ["Cartalith v2.52 DCC test.html"]
 *
 * Takes the flattest mid-elevation land tile at LOD 7 (the site rule probe_lod7compare.js uses),
 * pushes it through the REAL atlas path — atlasEncodeChunk -> atlasPut -> atlasGet ->
 * atlasDecodeChunk, i.e. IndexedDB, not a reimplementation — and counts how many of its distinct
 * source heights come back. On v2.52 that is 58 of 12 524; it must be all of them here.
 *
 * Also asserts what the widening must NOT break: a pre-v2.53 `rg16` record still decodes, and the
 * discrimination is by FIELD PRESENCE, so an all-flat tile (constant low byte — the one case
 * byte-inspection would misread) is still read as 24. Exit 1 on any failure. */
const path=require('path');
const {chromium}=require(process.env.PLAYWRIGHT_DIR||'/opt/node22/lib/node_modules/playwright');
let pass=0, fail=0;
const A=(m,c)=>{ if(c){pass++; console.log('  ok   '+m);} else {fail++; console.log('  FAIL '+m);} };

async function measure(pg){
  return pg.evaluate(async()=>{
    state.world=false; state.resW=1024; state.mapWidthKm=800; state.tect.seed=12345; await generate();
    const sea=state.seaLevel, mpu=metersPerUnit(), z=7;
    let best=1e9,bi=-1;
    for(let y=8;y<GH-8;y++)for(let x=8;x<GW-8;x++){const i=y*GW+x; if(field[i]<sea)continue;
      const rr=(field[i]-sea)/(1-sea); if(rr<0.15||rr>0.55)continue;
      const g=Math.hypot(field[i+1]-field[i-1],field[i+GW]-field[i-GW]); if(g<best){best=g;bi=i;}}
    const col=Math.floor((bi%GW)/GW*(1<<z)), row=Math.floor(Math.floor(bi/GW)/GH*(1<<z));
    const t=pyramidTile(field,GW,GH,z,col,row,512,lodTileOpts());
    const lv=a=>{const s=new Set(); for(const v of a)s.add(v); return s.size;};
    let lo=1e9,hi=-1e9; for(const v of t.data){if(v<lo)lo=v;if(v>hi)hi=v;}

    /* the REAL path: encode -> IndexedDB -> get -> decode */
    const tile={data:t.data,w:t.w,h:t.h,z,col,row};
    const enc=atlasEncodeChunk(tile), key='hgt24probe';
    let viaIDB=null;
    try{ await atlasPut({key, worldKey:'hgt24probe', ts:512, z, col, row, w:t.w, h:t.h,
           ...(enc.hgt24?{hgt24:enc.hgt24}:{rg16:enc.rg16}), png:null, ver:VERSION, time:1});
         const rec=await atlasGet(key); if(rec) viaIDB=lv(atlasDecodeChunk(rec).data); }catch(_){}

    const out={ src:lv(t.data), px:t.data.length, spanM:(hi-lo)*mpu,
      roundTrip:lv(atlasDecodeChunk(enc).data), viaIDB,
      enc: (typeof atlasChunkHeight==='function') ? atlasChunkHeight(enc).enc : 16,
      hasNew: !!enc.hgt24, hasOld: !!enc.rg16 };

    /* backward compatibility + the flat-tile discrimination case (v2.53 only) */
    if(typeof packHeight24==='function'){
      const legacy={ rg16:packHeight16(t.data,t.data.length), w:t.w, h:t.h, z, col, row };
      out.legacyEnc=atlasChunkHeight(legacy).enc;
      out.legacyLevels=lv(atlasDecodeChunk(legacy).data);
      const flat=new Float32Array(64).fill(0.25);
      out.flatEnc=atlasChunkHeight(atlasEncodeChunk({data:flat,w:8,h:8,z:0,col:0,row:0})).enc;
      let mx=0; const back=atlasDecodeChunk(enc).data;
      for(let i=0;i<t.data.length;i++) mx=Math.max(mx,Math.abs(t.data[i]-back[i]));
      out.maxErrM=mx*mpu;
    }
    return out;
  });
}

(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium',args:['--no-sandbox']});
  const open=async f=>{ const pg=await b.newPage(); pg.on('pageerror',e=>console.log('ERR '+e.message));
    await pg.goto('file://'+path.resolve(f)); await pg.waitForFunction(()=>typeof generate==='function',{timeout:120000}); return pg; };

  const pg=await open(process.argv[2]); const R=await measure(pg);
  console.log('\nv2.53 target — plain tile, '+R.px+' px, span '+R.spanM.toFixed(2)+' m');
  console.log(JSON.stringify(R,null,1)+'\n');

  A('the chunk is written as hgt24, not rg16', R.hasNew && !R.hasOld);
  A('atlasChunkHeight reports 24 for a fresh chunk', R.enc===24);
  A('a round trip loses NO distinct height ('+R.roundTrip+' of '+R.src+')', R.roundTrip===R.src);
  A('the same holds through real IndexedDB ('+R.viaIDB+')', R.viaIDB===R.src);
  A('max round-trip error is below a millimetre ('+(R.maxErrM*1000).toFixed(4)+' mm)', R.maxErrM*1000 < 1);
  A('a pre-v2.53 rg16 record still decodes', R.legacyEnc===16 && R.legacyLevels>0);
  A('...and is correctly the LOSSY one ('+R.legacyLevels+' of '+R.src+')', R.legacyLevels < R.src/10);
  A('an all-flat tile is still read as 24 (field presence, not byte content)', R.flatEnc===24);

  if(process.argv[3]){
    const pg2=await open(process.argv[3]); const C=await measure(pg2);
    console.log('\ncontrol '+path.basename(process.argv[3])+': '+C.roundTrip+' of '+C.src+' levels survive\n');
    A('the control build really does destroy them (proves the probe measures the fix)', C.roundTrip < C.src/10);
    A('both builds see the same source tile', C.src===R.src);
  }
  console.log('\n'+pass+' passed, '+fail+' failed');
  await b.close(); process.exit(fail?1:0);
})();
