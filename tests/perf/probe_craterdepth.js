#!/usr/bin/env node
/* v2.51 — a crater's depth is a property of its real DIAMETER, not of how many grid cells it spans.
 *
 * The old law was `depth = min(0.4, 0.02 + radCells*0.004)`, a normalised-height depth keyed on the
 * crater's radius IN CELLS — so the SAME crater got shallower every time the map got wider.
 * Measured on one 10 km crater at a fixed 1024px:
 *     200 km -> 844 m,  800 km -> 314 m,  5 000 km -> 166 m,  40 000 km -> 141 m
 * and it put a crater at 0.07x-0.25x of the ~1:5 depth-to-diameter every simple crater has. That is
 * the v1.60 / v2.05 / v2.07 / v2.49 real-km defect once more, in the depth law rather than the radius.
 *
 * Replaced by Pike 1977's relation, with the transition diameter scaling as 1/g (Melosh 1989) and
 * the complex branch re-anchored so it MEETS the simple branch instead of stepping 1.66x at it.
 *
 * A deliberate re-baseline of every world generated from a seed — craters are default-on. Isolated:
 * with craters off on both sides the hash battery is ALL IDENTICAL.
 *
 *   node tests/perf/probe_craterdepth.js "Cartalith v2.51 DCC test.html"
 */
const path=require('path');
const PW=process.env.PLAYWRIGHT_DIR||'/opt/node22/lib/node_modules/playwright';
const {chromium}=require(PW);
const FILE=process.argv[2];
if(!FILE){ console.error('usage: probe_craterdepth.js <file.html>'); process.exit(2); }
let pass=0,fail=0;
const ck=(n,c,x)=>{ if(c){pass++;console.log('ok   - '+n+(x?'   ('+x+')':''));}
                    else{fail++;console.log('FAIL - '+n+(x?'   ('+x+')':''));} };
(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium',args:['--no-sandbox']});
  const pg=await b.newPage({viewport:{width:1300,height:900}});
  pg.on('pageerror',e=>{fail++;console.log('FAIL - uncaught page error: '+e.message);});
  await pg.goto('file://'+path.resolve(FILE));
  await pg.waitForFunction(()=>typeof generate==='function',{timeout:120000});

  /* ---------- 1. the relation exists (this is what fails on v2.50) ---------- */
  const has=await pg.evaluate(()=>({
    km: typeof craterDepthKm==='function', units: typeof craterDepthUnits==='function',
    rimK: typeof CRATER_RIM_FLOOR_K!=='undefined'?CRATER_RIM_FLOOR_K:null,
    dt:   typeof CRATER_TRANSITION_KM!=='undefined'?CRATER_TRANSITION_KM:null }));
  ck('craterDepthKm / craterDepthUnits exist', has.km&&has.units);
  ck('the stamp\'s own crest-to-floor factor is named', has.rimK===1.25, 'CRATER_RIM_FLOOR_K='+has.rimK);
  ck('the simple->complex transition is named and Earth-scaled', has.dt===3.2, 'CRATER_TRANSITION_KM='+has.dt);
  if(!has.km){ console.log('\n'+pass+' passed, '+fail+' failed — target predates v2.51, stopping.');
    await b.close(); process.exit(1); }

  /* ---------- 2. the relation itself ---------- */
  const R=await pg.evaluate(()=>{
    const dd=D=>craterDepthKm(D,1)/D;
    return { simple:[0.5,1,2,3].map(dd), complex:[10,50,200].map(dd),
      lo:craterDepthKm(3.199,1), hi:craterDepthKm(3.201,1),
      unanchored:0.27*Math.pow(3.2,0.301), atT:craterDepthKm(3.2,1),
      gHalf:craterDepthKm(5,0.5), gOne:craterDepthKm(5,1), gTwo:craterDepthKm(5,2) };
  });
  ck('a simple crater is ~1:5 deep and flat in D', R.simple.every(v=>Math.abs(v-0.2)<0.02),
     R.simple.map(v=>'1:'+(1/v).toFixed(1)).join(' '));
  ck('a complex crater shallows with diameter, to well past 1:50',
     R.complex[0]>R.complex[1] && R.complex[1]>R.complex[2] && 1/R.complex[2]>50,
     R.complex.map(v=>'1:'+(1/v).toFixed(0)).join(' '));
  ck('the two branches MEET at the transition', Math.abs(R.lo/R.hi-1)<2e-3,
     (R.lo*1000).toFixed(1)+'m / '+(R.hi*1000).toFixed(1)+'m');
  ck('...which the published complex fit does not — that step is what was removed',
     Math.abs(R.atT/R.unanchored-1)>0.3, 'unanchored step x'+(R.atT/R.unanchored).toFixed(2));
  ck('the transition diameter scales as 1/g', R.gHalf>R.gOne && R.gOne>R.gTwo,
     [R.gHalf,R.gOne,R.gTwo].map(v=>(v*1000).toFixed(0)+'m').join(' > '));

  /* ---------- 3. SCALE INVARIANCE: one real crater, four map extents ---------- */
  const S=await pg.evaluate(()=>{
    const mw0=state.mapWidthKm, radKm=5, D=2*radKm, out={};
    for(const mw of [200,800,5000,40000]){
      state.mapWidthKm=mw; const rc=radKm/(mw/GW);
      out[mw]={ neu:craterDepthUnits(rc)*metersPerUnit()*CRATER_RIM_FLOOR_K,
                alt:Math.min(0.4,0.02+rc*0.004)*metersPerUnit() };
    }
    state.mapWidthKm=mw0;
    return {out, want:craterDepthKm(D,state.planet.g)*1000};
  });
  const ns=[200,800,5000,40000].map(k=>S.out[k].neu), os=[200,800,5000,40000].map(k=>S.out[k].alt);
  ck('one real 10 km crater is the SAME depth at 200 / 800 / 5 000 / 40 000 km',
     ns.every(v=>Math.abs(v/S.want-1)<1e-9), ns.map(v=>v.toFixed(0)+'m').join(' / '));
  ck('and the old law was not — 200 km vs 40 000 km differed by over 5x',
     os[0]/os[3]>5, os.map(v=>v.toFixed(0)+'m').join(' / '));
  ck('the new depth is the published one, not merely constant',
     Math.abs(ns[0]-894)<15, ns[0].toFixed(0)+'m for D=10 km');

  /* ---------- 4. the crater the stamp actually DRAWS, on a real world ---------- */
  const D=await pg.evaluate(async()=>{
    state.world=false; state.resW=512; state.mapWidthKm=800; state.tect.seed=12345;
    await generate();
    const sv=new Float32Array(field), cellKm=state.mapWidthKm/GW, out=[];
    for(const rc of [4,8,16,40]){
      field.fill(0.5);
      stampOneCrater((GW/2)|0,(GH/2)|0,rc,rc*2*cellKm>=50,false,0);
      let lo=1e9,hi=-1e9;
      for(let i=0;i<field.length;i++){ if(field[i]<lo)lo=field[i]; if(field[i]>hi)hi=field[i]; }
      const Dkm=2*rc*cellKm;
      out.push({Dkm, drawn:(hi-lo)*metersPerUnit(), want:craterDepthKm(Dkm,state.planet.g)*1000});
    }
    field.set(sv);
    return out;
  });
  ck('the DRAWN crater measures the published depth from rim crest to floor',
     D.every(o=>Math.abs(o.drawn/o.want-1)<0.03),
     D.map(o=>'D'+o.Dkm.toFixed(1)+': '+o.drawn.toFixed(0)+'/'+o.want.toFixed(0)+'m').join('  '));
  ck('...and the drawn depth-to-diameter sits in the published band at every size',
     D.every(o=>{const r=o.Dkm*1000/o.drawn; return r>4 && r<120;}),
     D.map(o=>'1:'+(o.Dkm*1000/o.drawn).toFixed(0)).join(' '));

  /* ---------- 5. the size of the re-baseline, stated rather than implied ---------- */
  const M=await pg.evaluate(()=>{
    const run=(mwk,gw)=>{
      const mw0=state.mapWidthKm; state.mapWidthKm=mwk;
      const cellKm=mwk/gw, rng=mulberry32((12345^0x27d4eb2f)>>>0);
      let sO=0,sN=0,n=0,worst=1;
      for(let k=0;k<100;k++){
        rng(); rng();
        const r=rng(); let radKm;
        if(r<0.90) radKm=0.5+rng()*4.5; else if(r<0.99) radKm=5+rng()*20; else radKm=25+rng()*175;
        const rc=radKm/cellKm, D=2*radKm;
        const o=Math.min(0.4,0.02+rc*0.004)*metersPerUnit();
        const nn=Math.min(0.4,craterDepthKm(D,1)*1000/(metersPerUnit()*CRATER_RIM_FLOOR_K))*metersPerUnit();
        sO+=o; sN+=nn; n++; if(nn/o>worst) worst=nn/o;
      }
      state.mapWidthKm=mw0;
      return {mean:sN/sO, oldM:sO/n, newM:sN/n, worst};
    };
    return {def:run(800,512), huge:run(40000,1024)};
  });
  ck('at the app default this deepens craters by a real, disclosed factor',
     M.def.mean>1.5 && M.def.mean<8,
     'mean '+M.def.oldM.toFixed(0)+'m -> '+M.def.newM.toFixed(0)+'m  x'+M.def.mean.toFixed(2)+'  worst x'+M.def.worst.toFixed(1));
  ck('and it is a re-baseline at every extent, not only the large-map case',
     M.huge.mean>1.2, 'at 40 000 km mean x'+M.huge.mean.toFixed(2));

  console.log('\n'+pass+' passed, '+fail+' failed');
  await b.close();
  process.exit(fail?1:0);
})();
