#!/usr/bin/env node
/* v2.50 — a feature smaller than one grid cell must not be INFLATED to one grid cell.
 *
 * stampOneCrater and stampOneVolcano each floor their DRAWN radius (1.5 / 2 cells) so the stamp
 * loop always touches a cell and t=d/R is never 0/0. v1.60's own comment, still sitting directly
 * above clampFeatureRadiusCells, claimed those floors "handle the world-scale
 * vanishing-to-sub-pixel case". They do the opposite: they widen the FOOTPRINT and leave the
 * AMPLITUDE alone, so a sub-cell feature is drawn at the floor's full depth/height.
 *
 * Measured at 40 000 km / 1024px (39.06 km per cell), legacy path, seed 12345:
 *   - 98 of 100 craters floored; the p50 one drawn 58.6 km wide against a true 3.0 km
 *   - a 6 km crater removed 381.5x the material its own radius accounts for
 *   - 96.9% of the crater depth the engine wrote at that extent was manufactured by the floor
 *   - 99.8% of volcanoes floored; the p50 one drawn 78.1 km wide against a true 8 km, FULL height
 *
 * The floor stays — it is what keeps the loop and t well-defined. The amplitude is scaled by the
 * AREA ratio (r/floor)^2 below it, which conserves the integrated material exactly.
 *
 *   node tests/perf/probe_craterscale.js "Cartalith v2.50 DCC test.html"
 */
const path=require('path');
const PW=process.env.PLAYWRIGHT_DIR||'/opt/node22/lib/node_modules/playwright';
const {chromium}=require(PW);
const FILE=process.argv[2];
if(!FILE){ console.error('usage: probe_craterscale.js <file.html>'); process.exit(2); }
let pass=0,fail=0;
const ck=(n,c,x)=>{ if(c){pass++;console.log('ok   - '+n+(x?'   ('+x+')':''));}
                    else{fail++;console.log('FAIL - '+n+(x?'   ('+x+')':''));} };
(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium',args:['--no-sandbox']});
  const pg=await b.newPage({viewport:{width:1300,height:900}});
  pg.on('pageerror',e=>{fail++;console.log('FAIL - uncaught page error: '+e.message);});
  await pg.goto('file://'+path.resolve(FILE));
  await pg.waitForFunction(()=>typeof generate==='function',{timeout:120000});

  /* ---------- 1. the mechanism exists at all (this is what fails on v2.49) ---------- */
  const has=await pg.evaluate(()=>({
    fn: typeof subCellStampScale==='function',
    craterK: typeof CRATER_MIN_DRAW_CELLS!=='undefined'?CRATER_MIN_DRAW_CELLS:null,
    volcK:   typeof VOLCANO_MIN_DRAW_CELLS!=='undefined'?VOLCANO_MIN_DRAW_CELLS:null,
  }));
  ck('the sub-cell stamp scale exists', has.fn===true);
  ck('both floors are named constants, not literals buried in the stamp',
     has.craterK===1.5 && has.volcK===2, 'crater '+has.craterK+' / volcano '+has.volcK);
  if(!has.fn){ console.log('\n'+pass+' passed, '+fail+' failed'); await b.close(); process.exit(fail?1:0); }

  /* ---------- 2. the contract ---------- */
  const C=await pg.evaluate(()=>({
    atFloor:subCellStampScale(1.5,1.5), above:subCellStampScale(9,1.5),
    half:subCellStampScale(0.75,1.5), quarter:subCellStampScale(0.375,1.5),
    zero:subCellStampScale(0,1.5), neg:subCellStampScale(-3,1.5), degen:subCellStampScale(1,0),
  }));
  ck('exactly 1 at the floor and above — a resolvable feature is untouched',
     C.atFloor===1 && C.above===1);
  ck('the AREA ratio below it, not the radius ratio',
     Math.abs(C.half-0.25)<1e-12 && Math.abs(C.quarter-0.0625)<1e-12, 'half->'+C.half+', quarter->'+C.quarter);
  ck('degenerate inputs stay finite and never divide by zero',
     C.zero===0 && Number.isFinite(C.neg) && Number.isFinite(C.degen));

  /* ---------- 3. volume conservation, on the REAL stamps ---------- */
  const V=await pg.evaluate(()=>{
    const sv=new Float32Array(field), svV=new Float32Array(volcanicField), svI=new Float32Array(impactField);
    const one=(r,kind)=>{
      field.fill(0.5); volcanicField.fill(0); impactField.fill(0);
      const cx=(GW/2)|0, cy=(GH/2)|0;
      if(kind==='crater') stampOneCrater(cx,cy,r,false,false,0); else stampOneVolcano(cx,cy,r,2000,0);
      let vol=0,touched=0,peak=0,marker=0;
      for(let i=0;i<field.length;i++){ const d=field[i]-0.5; if(d!==0){vol+=Math.abs(d);touched++;if(Math.abs(d)>peak)peak=Math.abs(d);} }
      const mk = kind==='crater'?impactField:volcanicField;
      for(let i=0;i<mk.length;i++) if(mk[i]>marker) marker=mk[i];
      return {vol,touched,peak,marker};
    };
    const rs=[0.1,0.25,0.5,1.0];
    const volc=rs.map(r=>({r,...one(r,'volcano')}));
    const crat=rs.map(r=>({r,...one(r,'crater')}));
    const big =one(6,'crater'), bigV=one(6,'volcano');
    field.set(sv); volcanicField.set(svV); impactField.set(svI);
    return {volc,crat,big,bigV};
  });
  const kV=V.volc.map(o=>o.vol/(o.r*o.r));
  ck('a sub-cell volcano contributes material proportional to its OWN r^2',
     kV.every(k=>Math.abs(k/kV[0]-1)<1e-4), kV.map(k=>k.toFixed(6)).join(' / '));
  const kC=V.crat.map(o=>o.vol/((0.02+0.004*o.r)*o.r*o.r));
  ck('a sub-cell crater likewise, with its own depth law divided out',
     kC.every(k=>Math.abs(k/kC[0]-1)<1e-3), kC.map(k=>k.toFixed(5)).join(' / '));
  ck('the footprint below the floor is the FLOOR\'s — only the amplitude moved',
     new Set(V.crat.map(o=>o.touched)).size===1 && new Set(V.volc.map(o=>o.touched)).size===1,
     'crater touched='+V.crat[0].touched+', volcano touched='+V.volc[0].touched);
  ck('a resolvable feature still draws its real, larger footprint',
     V.big.touched>V.crat[0].touched && V.bigV.touched>V.volc[0].touched,
     V.big.touched+' vs '+V.crat[0].touched);

  /* ---------- 4. the markers are area-weighted too, not left half-fixed ---------- */
  ck('impactField is area-weighted, so a sub-cell crater cannot claim full intensity',
     V.crat[0].marker < V.crat[3].marker && V.crat[3].marker < V.big.marker,
     V.crat.map(o=>o.marker.toFixed(4)).join(' / ')+' -> '+V.big.marker.toFixed(4));
  ck('volcanicField likewise',
     V.volc[0].marker < V.volc[3].marker && V.volc[3].marker < V.bigV.marker,
     V.volc.map(o=>o.marker.toFixed(4)).join(' / ')+' -> '+V.bigV.marker.toFixed(4));

  /* ---------- 5. the large-map claim, on the real legacy draw ---------- */
  const L=await pg.evaluate(()=>{
    const run=(mwk,gw,gh)=>{
      const cellKm=mwk/gw, rng=mulberry32((12345^0x27d4eb2f)>>>0);
      let n=0,floored=0,sumOld=0,sumNew=0;
      for(let k=0;k<100;k++){
        rng();rng();
        const r=rng(); let radKm;
        if(r<0.90){radKm=0.5+rng()*4.5;} else if(r<0.99){radKm=5+rng()*20;} else {radKm=25+rng()*175;}
        const age=rng()*0.5;
        const rc=clampFeatureRadiusCells((radKm*Math.pow(state.planet.g,-0.22))/cellKm,gw,gh);
        const d0=Math.min(0.4,0.02+rc*0.004)*(1-age*0.8), sc=subCellStampScale(rc,CRATER_MIN_DRAW_CELLS);
        n++; sumOld+=d0; sumNew+=d0*sc; if(sc<1) floored++;
      }
      return {mwk,gw,floored,ratio:sumNew/sumOld};
    };
    return {def:run(800,2048,1310), huge:run(40000,1024,512), mid:run(5000,1024,512)};
  });
  ck('at the app default the floor barely binds — this is a large-map defect',
     L.def.floored<=5 && L.def.ratio>0.99, L.def.floored+'/100 floored, depth x'+L.def.ratio.toFixed(4));
  ck('at 40 000 km nearly every crater was inflated by the floor',
     L.huge.floored>=90, L.huge.floored+'/100 floored');
  ck('and most of the material the engine wrote there was the floor\'s, not the craters\'',
     L.huge.ratio<0.10, 'kept x'+L.huge.ratio.toFixed(4)+' of the old depth budget');
  ck('the effect is monotonic in cell size, not a cliff at one extent',
     L.def.ratio>L.mid.ratio && L.mid.ratio>L.huge.ratio,
     [L.def.ratio,L.mid.ratio,L.huge.ratio].map(r=>r.toFixed(3)).join(' > '));

  console.log('\n'+pass+' passed, '+fail+' failed');
  await b.close();
  process.exit(fail?1:0);
})();
