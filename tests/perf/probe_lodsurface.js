#!/usr/bin/env node
/* v2.47 — refinement must reconstruct the coarse surface, not facet it, and must not add what the
 * tile cannot represent.
 *
 * Owner: "I want the output at whatever zoom to be most natural looking."
 *
 * Two defects, both measured on v2.46 before anything was written:
 *   (a) amplifyRegion/addZoomDetail reconstructed the coarse height BILINEARLY, which is C0 —
 *       exactly linear inside a coarse cell and kinked across every boundary. The tile renderers
 *       hillshade from finite differences, so the surface reads as flat facets with a crease
 *       between each pair. Measured: the second difference ON a boundary is ~3000x its value
 *       INSIDE a cell (interior is float noise, because bilinear has no curvature there at all).
 *   (b) fbm is SIX internal octaves at lacunarity 2, so the added detail reaches far above the
 *       tile's own sampling rate, where it can only alias. Worst on a large world, where
 *       lodDetailFreqK (v2.05) raises detailFreq to 16.
 *
 *   node tests/perf/probe_lodsurface.js "Cartalith v2.47 DCC test.html"
 */
const path=require('path');
const PW=process.env.PLAYWRIGHT_DIR||'/opt/node22/lib/node_modules/playwright';
const {chromium}=require(PW);
const FILE=process.argv[2];
if(!FILE){ console.error('usage: probe_lodsurface.js <file.html>'); process.exit(2); }
let pass=0,fail=0;
const ck=(n,c,x)=>{ if(c){pass++;console.log('ok   - '+n+(x?'   ('+x+')':''));}
                    else{fail++;console.log('FAIL - '+n+(x?'   ('+x+')':''));} };
(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium',args:['--no-sandbox']});
  const pg=await b.newPage({viewport:{width:1400,height:900}});
  pg.on('pageerror',e=>{fail++;console.log('FAIL - uncaught page error: '+e.message);});
  await pg.goto('file://'+path.resolve(FILE));
  await pg.waitForFunction(()=>typeof generate==='function',{timeout:120000});

  const R=await pg.evaluate(()=>{
    const cW=257,cH=257,co=new Float32Array(cW*cH);
    for(let y=0;y<cH;y++)for(let x=0;x<cW;x++)
      co[y*cW+x]=0.52+0.30*(fbm(x*0.02,y*0.02,777)-0.5)*2;
    const O={detailAmp:0.12,seed:1,zBase:2,sea:0.42,detailFreq:1.0,zoomDetailK:1};
    const LEG=Object.assign({},O,{legacyFilter:true,legacyBands:true});
    const out={};

    /* --- the escape hatch is real, so a re-baseline can always be isolated --- */
    /* Guarded so this probe still MEASURES an older build rather than hard-erroring on it —
       the crease and boil figures below need only the legacy path, which every build has. */
    out.hasPrims=(typeof fbmBand==='function'&&typeof sampleC1==='function'&&typeof detailBandWeight==='function');
    out.fbmBandIsFbm=out.hasPrims&&(()=>{ for(let i=0;i<400;i++){ const x=i*0.37,y=i*0.71;
      if(fbmBand(x,y,7,0)!==fbm(x,y,7)) return false; } return true; })();
    out.c1Interp=out.hasPrims?(()=>{ let w=0; for(let y=3;y<40;y++)for(let x=3;x<40;x++)
      w=Math.max(w,Math.abs(sampleC1(co,cW,cH,x,y)-co[y*cW+x])); return w; })():null;
    out.bandW=out.hasPrims?[detailBandWeight(1,0), detailBandWeight(1,1), detailBandWeight(1,0.5), detailBandWeight(1,0.1)]:null;

    /* --- (a) the crease --- */
    const crease=(opts)=>{ const N=128,rg={x:20,y:20,w:5,h:5},px=(N-1)/(rg.w-1);
      const t=amplifyRegion(co,cW,cH,rg,N,N,Object.assign({},opts,{detailAmp:0}));
      let on=0,nb=0,inn=0,ni=0,row=N>>1;
      for(let x=1;x<N-1;x++){ const d2=Math.abs(t[row*N+x-1]-2*t[row*N+x]+t[row*N+x+1]);
        const q=x/px,fr=Math.abs(q-Math.round(q));
        if(fr*px<0.5){on+=d2;nb++;} else if(fr>0.25){inn+=d2;ni++;} }
      on/=Math.max(1,nb); inn/=Math.max(1,ni); return on/(inn||1e-30); };
    out.creaseLegacy=crease(LEG); out.creaseNew=crease(O);

    /* --- (b) half-pixel shift stability: does the detail boil when you pan? --- */
    const boil=(z,TILE,df,legacy)=>{
      const {cols,rows}=pyramidDims(z);
      const bb=pyramidTileBounds(cW,cH,z,Math.floor(cols*0.37),Math.floor(rows*0.37));
      const o=Object.assign({},O,{detailFreq:df}, legacy?{legacyFilter:true,legacyBands:true}:{});
      const half=(bb.w/(TILE-1))*0.5;
      const mk=d=>{ const r={x:bb.x+d,y:bb.y+d,w:bb.w,h:bb.h};
        let t=amplifyRegion(co,cW,cH,r,TILE,TILE,o);
        return addZoomDetail(Float32Array.from(t),TILE,TILE,co,cW,cH,r,z,o); };
      const A=mk(0),B=mk(half); let s=0;
      for(let i=0;i<A.length;i++) s+=(A[i]-B[i])**2; return Math.sqrt(s/A.length); };
    out.boilBigLegacy=boil(6,256,16,true);  out.boilBigNew=boil(6,256,16,false);
    out.boilDefLegacy=boil(6,256,1,true);   out.boilDefNew=boil(6,256,1,false);

    /* --- seams must still be EXACTLY zero, under both filters --- */
    const seam=(opts)=>{ let w=0;
      for(const z of [4,6]){
        const a=pyramidTile(co,cW,cH,z,3,3,256,opts), c=pyramidTile(co,cW,cH,z,4,3,256,opts),
              d=pyramidTile(co,cW,cH,z,3,4,256,opts);
        for(let y=0;y<a.h;y++) w=Math.max(w,Math.abs(a.data[y*a.w+a.w-1]-c.data[y*c.w]));
        for(let x=0;x<a.w;x++) w=Math.max(w,Math.abs(a.data[(a.h-1)*a.w+x]-d.data[x]));
      } return w; };
    out.seamNew=seam(O); out.seamLegacy=seam(LEG);

    /* --- refining the SAMPLING of one world rect must reveal more, and the level must not --- */
    const detailAt=(z,N)=>{ const {cols,rows}=pyramidDims(z);
      const bb=pyramidTileBounds(cW,cH,z,Math.floor(cols*0.37),Math.floor(rows*0.37));
      const flat=amplifyRegion(co,cW,cH,bb,N,N,Object.assign({},O,{detailAmp:0}));
      let t=amplifyRegion(co,cW,cH,bb,N,N,O);
      t=addZoomDetail(Float32Array.from(t),N,N,co,cW,cH,bb,z,O);
      let s=0; for(let i=0;i<t.length;i++) s+=Math.abs(t[i]-flat[i]); return s/t.length; };
    out.fine64=detailAt(6,64); out.fine256=detailAt(6,256);

    /* --- finite and in range, which every tile must always be --- */
    const t=pyramidTile(co,cW,cH,6,20,20,256,O);
    out.finite=t.data.every(v=>Number.isFinite(v)&&v>=0&&v<=1);
    const t2=pyramidTile(co,cW,cH,6,20,20,256,O);
    out.deterministic=t.data.every((v,i)=>v===t2.data[i]);
    return out;
  });

  ck('the refinement primitives exist on this build', R.hasPrims);
  ck('fbmBand with no spacing is bit-identical to fbm (the re-baseline can be isolated)', R.fbmBandIsFbm);
  ck('sampleC1 is INTERPOLATING — exact at coarse nodes, so it reconstructs rather than approximates',
     R.c1Interp===0, 'max |Δ| = '+R.c1Interp);
  ck('detailBandWeight: no spacing ⇒ 1; at/below Nyquist ⇒ 0; well above ⇒ 1',
     !!R.bandW && R.bandW[0]===1 && R.bandW[1]===0 && R.bandW[3]===1, JSON.stringify(R.bandW));
  ck('the bilinear crease is real on the legacy filter', R.creaseLegacy>100, R.creaseLegacy.toFixed(0)+'x');
  ck('the C1 filter removes it — curvature is no longer concentrated at cell boundaries',
     R.creaseNew<5, R.creaseLegacy.toFixed(0)+'x -> '+R.creaseNew.toFixed(2)+'x');
  ck('on a large world (detailFreq 16) the tile stops boiling under a half-pixel pan',
     R.boilBigNew < R.boilBigLegacy*0.9,
     R.boilBigLegacy.toExponential(2)+' -> '+R.boilBigNew.toExponential(2)
       +'  ('+(100*(R.boilBigNew-R.boilBigLegacy)/R.boilBigLegacy).toFixed(1)+'%)');
  ck('at the default detailFreq the band-limit is near a no-op — nothing there is unrepresentable',
     R.boilDefNew < R.boilDefLegacy*1.6,
     R.boilDefLegacy.toExponential(2)+' -> '+R.boilDefNew.toExponential(2));
  ck('seams stay EXACTLY zero under the C1 filter (it is still a pure function of world position)',
     R.seamNew===0, 'new '+R.seamNew.toExponential(1)+', legacy '+R.seamLegacy.toExponential(1));
  ck('refining the SAMPLING of one world rect reveals more detail',
     R.fine256>R.fine64, R.fine64.toExponential(2)+' -> '+R.fine256.toExponential(2));
  ck('every tile value stays finite and in [0,1]', R.finite);
  ck('tiles are deterministic', R.deterministic);

  await b.close();
  console.log('\n'+pass+' passed, '+fail+' failed');
  process.exit(fail?1:0);
})().catch(e=>{console.error(e);process.exit(1);});
