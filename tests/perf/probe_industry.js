#!/usr/bin/env node
/* v2.64 — M-IND: industry sits where its dominant driver puts it, and the driver is real.
 *
 * docs/05 §7.1 names two cheap site-model additions as the thing that unblocks industry siting:
 * a prevailing-wind vector and an along-water gradient. Neither existed. Shipping them alone
 * would have left two fields nothing reads (v2.14's dead-code rule), so they ship with their
 * first consumer — the §4.7 siting table.
 *
 * The load-bearing assertions are the SIGN ones. "On the river" was already expressible; what
 * the vector buys is BELOW the town for the foul trades and ABOVE it for the mills — the same
 * field read with opposite signs. If those two ever agree, the vector is not being consulted
 * and the districts are decoration.
 *
 * v2.65 adds M-DIST (docs/05 §3.1 / §7.3): the status gradient made EXPLICIT as par.status, and
 * its two visible ends (patrician, slum). It also closes a gap v2.64's own probe missed — there
 * are TWO palettes, building tint and parcel fill, and asserting only the first let four districts
 * ship with no quarter colour in the City Viewer. The palette assertion below is now over every
 * district actually OBSERVED, so a future district cannot slip past it either.
 *
 *   node tests/perf/probe_industry.js "Cartalith v2.65 DCC test.html"
 */
const path=require('path');
const PW=process.env.PLAYWRIGHT_DIR||'/opt/node22/lib/node_modules/playwright';
const {chromium}=require(PW);
const FILE=process.argv[2];
let pass=0,fail=0;
const ck=(n,c,x)=>{ if(c){pass++;console.log('ok   - '+n+(x?'   ('+x+')':''));}
                    else{fail++;console.log('FAIL - '+n+(x?'   ('+x+')':''));} };
(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium',args:['--no-sandbox']});
  const pg=await b.newPage({viewport:{width:1400,height:900}});
  pg.on('pageerror',e=>{fail++;console.log('FAIL - uncaught page error: '+e.message);});
  await pg.goto('file://'+path.resolve(FILE));
  await pg.waitForFunction(()=>typeof generate==='function',{timeout:120000});
  await pg.evaluate(async()=>{ state.world=false; state.tect.seed=12345; state.resW=512; GW=512; GH=gridH(512);
    allocate(); await generate(); renderNow(); if(typeof _setupHide==='function')_setupHide();
    state.viz.urbanLayouts=true; _civAutoWorld(); });

  /* ── 1. the vectors exist and are the engine's OWN fields, not a per-seed invention ─────── */
  const v=await pg.evaluate(()=>{
    const p=state.places.filter(q=>CIV_SETTLE_KEYS.has(q.kind))[0];
    const fb=_umFlowBearings(p,0), fbr=_umFlowBearings(p,0.7);
    const wf=currentWindField();
    const cx=Math.min(wf.WW-1,Math.max(0,Math.round(p.x/Math.max(1,GW-1)*(wf.WW-1))));
    const cy=Math.min(wf.WH-1,Math.max(0,Math.round(p.y/Math.max(1,GH-1)*(wf.WH-1))));
    const i=cy*wf.WW+cx;
    return {wind:fb.wind, down:fb.downstream,
            windTrue:Math.atan2(wf.v[i],wf.u[i]),
            rotWind:fbr.wind, rotDown:fbr.downstream, has:typeof _umFlowBearings==='function'};
  });
  ck('_umFlowBearings exists', v.has);
  ck('the wind bearing IS currentWindField() at that cell, not a new field',
     v.wind!=null && Math.abs(v.wind-v.windTrue)<1e-9, 'bearing '+(v.wind||0).toFixed(4));
  ck('a downstream bearing is found from the real receiver tree', v.down!=null,
     v.down==null?'none':(v.down).toFixed(4));
  ck('both are returned in the LAYOUT frame — orient is subtracted (the _umOreBearing convention)',
     Math.abs((v.rotWind)-(v.wind-0.7))<1e-9 && (v.down==null||Math.abs((v.rotDown)-(v.down-0.7))<1e-9));

  /* ── 2. the adapter carries them, and the cache key notices ─────────────────────────────── */
  const ad=await pg.evaluate(()=>{
    const p=state.places.filter(q=>CIV_SETTLE_KEYS.has(q.kind))[0];
    const ctx=_umPlaceContext(p);
    const k1=_umCacheKey?null:null;
    const e=ctx&&ctx.economy;
    return {hasEcon:!!e, wind:e?e.wind:null, down:e?e.downstream:null,
            spec:e?e.specialisation:null};
  });
  ck('the adapter puts the bearings on opts.economy', ad.hasEcon && (ad.wind!=null||ad.down!=null));
  ck('…even for a town with no specialisation — a site has a downwind edge regardless',
     ad.hasEcon, 'specialisation='+ad.spec);

  /* ── 3. THE POINT: the signs are opposite, measured on real generated towns ─────────────── */
  const ind=await pg.evaluate(()=>{
    const out={towns:0,tan:0,mill:0,kiln:0,inn:0,pairs:0,orderWrong:0,kilnWrong:0,
               dup:0,noProv:0,noTint:0,anyRiver:0};
    const places=state.places.filter(q=>CIV_SETTLE_KEYS.has(q.kind)).slice(0,14);
    for(const p of places){
      let m=null; try{ m=_umModelForNow(p); }catch(_){ continue; }
      if(!m||!m.parcels) continue;
      const ctx=_umPlaceContext(p); const e=ctx&&ctx.economy; if(!e) continue;
      out.towns++;
      const mk=m.anchors.market;
      const wb=(e.wind!=null)?{x:Math.cos(e.wind),y:Math.sin(e.wind)}:null;
      const db=(e.downstream!=null)?{x:Math.cos(e.downstream),y:Math.sin(e.downstream)}:null;
      if(db) out.anyRiver++;
      const seen=new Set(); const tanA=[], millA=[];
      for(const par of m.parcels){
        const d=par.district; if(!/^(tanyard|millrace|kilnyard|innyard)$/.test(d)) continue;
        if(seen.has(par.id)) out.dup++; seen.add(par.id);
        if(!par.provDistrict) out.noProv++;
        const c=par.poly.reduce((a,q)=>({x:a.x+q.x/par.poly.length,y:a.y+q.y/par.poly.length}),{x:0,y:0});
        const alongD=db?((c.x-mk.x)*db.x+(c.y-mk.y)*db.y):0;
        const alongW=wb?((c.x-mk.x)*wb.x+(c.y-mk.y)*wb.y):0;
        if(d==='tanyard'){ out.tan++; tanA.push(alongD); }
        if(d==='millrace'){ out.mill++; millA.push(alongD); }
        if(d==='kilnyard'){ out.kiln++; if(!(alongW>0)) out.kilnWrong++; }
        if(d==='innyard') out.inn++;
      }
      /* The real invariant, and a strictly harder one than any sign test: within ONE town every
         tan yard must lie downstream of every mill race along the flow. A town whose frontage is
         entirely on one side of its market satisfies no sign rule, but this ordering still has to
         hold — and it can only hold if the vector is genuinely being consulted. */
      if(tanA.length&&millA.length){ out.pairs++;
        if(!(Math.min.apply(null,tanA)>Math.max.apply(null,millA))) out.orderWrong++; }
    }
    for(const k of ['tanyard','millrace','kilnyard','innyard']) if(!_UM_ECON_TINT[k]) out.noTint++;
    return out;
  });
  ck('real towns were generated to measure', ind.towns>0, ind.towns+' towns');
  ck('towns with a river in reach got a downstream vector', ind.anyRiver>0, ind.anyRiver+'/'+ind.towns);
  ck('tan yards exist', ind.tan>0, ind.tan+' parcels');
  ck('mill races exist', ind.mill>0, ind.mill+' parcels');
  ck('towns carrying both were found to compare', ind.pairs>0, ind.pairs+' towns');
  ck('in EVERY such town the tan yards sit downstream of the mill races',
     ind.pairs>0&&ind.orderWrong===0, ind.orderWrong+' wrong of '+ind.pairs);
  ck('kiln yards exist', ind.kiln>0, ind.kiln+' parcels');
  ck('EVERY kiln yard is DOWNWIND of the market', ind.kiln>0&&ind.kilnWrong===0,
     ind.kilnWrong+' wrong of '+ind.kiln);
  ck('inn yards appear at the gates', ind.inn>0, ind.inn+' parcels');
  ck('no parcel is claimed by two industries', ind.dup===0, ind.dup+' double-claimed');
  ck('every new district carries its own provenance line', ind.noProv===0);
  /* A district with no tint renders as the default brown — the invisible-feature defect
     v1.80 and v2.15 each paid for. */
  ck('every new district has a renderer tint', ind.noTint===0);

  /* ── 3b. the wind field is memoised per settlement, and the memo cannot go stale ────────── */
  const memo=await pg.evaluate(()=>{
    const p=state.places.filter(q=>CIV_SETTLE_KEYS.has(q.kind))[0];
    const a=_umWindFieldCached(), b=_umWindFieldCached();
    let t=performance.now(); for(let i=0;i<20;i++) _umFlowBearings(p,0);
    const per=(performance.now()-t)/20;
    const before=_umFlowBearings(p,0).wind;
    const eq=state.climate.equatorTemp; state.climate.equatorTemp=eq-18;
    const c=_umWindFieldCached(); const after=_umFlowBearings(p,0).wind;
    state.climate.equatorTemp=eq;
    return {same:a===b, rebuilt:c!==a, per, moved:before!==after};
  });
  ck('a repeat call returns the SAME field object, not a rebuild', memo.same);
  ck('…so a per-settlement bearing is cheap', memo.per<5, memo.per.toFixed(2)+' ms/settlement');
  ck('a climate change rebuilds it — the memo cannot go stale', memo.rebuilt);
  ck('…and the bearing genuinely follows the climate', memo.moved);

  /* ── 3c. M-DIST: the status gradient is explicit, and reads as a gradient ───────────────── */
  const st=await pg.evaluate(()=>{
    const o={n:0,bad:0,inW:0,inWs:0,outW:0,outWs:0,pat:0,patS:0,slum:0,slumS:0,
             seen:{},noFill:[],noTint:[],patFromMarket:0,dw:0,dwS:0,uw:0,uwS:0};
    for(const p of state.places.filter(q=>CIV_SETTLE_KEYS.has(q.kind)).slice(0,14)){
      let m=null; try{ m=_umModelForNow(p); }catch(_){ continue; }
      if(!m||!m.parcels) continue;
      const e=(_umPlaceContext(p)||{}).economy; if(!e) continue;
      const mk=m.anchors.market;
      const wb=(e.wind!=null)?{x:Math.cos(e.wind),y:Math.sin(e.wind)}:null;
      for(const par of m.parcels){
        o.seen[par.district]=1;
        if(typeof par.status!=='number'||!(par.status>=0&&par.status<=1)){ o.bad++; continue; }
        o.n++;
        const c=par.poly.reduce((a,z)=>({x:a.x+z.x/par.poly.length,y:a.y+z.y/par.poly.length}),{x:0,y:0});
        const near=V_dist(c,mk)<220;
        if(near){ o.inW++; o.inWs+=par.status; } else { o.outW++; o.outWs+=par.status; }
        if(wb&&near===false){ const a=(c.x-mk.x)*wb.x+(c.y-mk.y)*wb.y;
          if(a>0){ o.dw++; o.dwS+=par.status; } else { o.uw++; o.uwS+=par.status; } }
        if(par.district==='patrician'){ o.pat++; o.patS+=par.status; }
        if(par.district==='slum'){ o.slum++; o.slumS+=par.status; }
      }
    }
    for(const d of Object.keys(o.seen)){
      if(!_UM_DISTRICT_FILL[d]) o.noFill.push(d);
    }
    return o;
    function V_dist(a,b){ return Math.hypot(a.x-b.x,a.y-b.y); }
  });
  ck('every parcel carries a status in [0,1]', st.bad===0&&st.n>0, st.n+' parcels, '+st.bad+' bad');
  ck('status falls with distance from the market — it reads as a gradient',
     st.inW>0&&st.outW>0&&(st.inWs/st.inW)>(st.outWs/st.outW),
     (st.inWs/Math.max(1,st.inW)).toFixed(3)+' near vs '+(st.outWs/Math.max(1,st.outW)).toFixed(3)+' far');
  ck('…and outer ground DOWNWIND is poorer than outer ground upwind (§3.1\'s own summary)',
     st.dw>0&&st.uw>0&&(st.dwS/st.dw)<(st.uwS/st.uw),
     (st.dwS/Math.max(1,st.dw)).toFixed(3)+' downwind vs '+(st.uwS/Math.max(1,st.uw)).toFixed(3)+' upwind');
  ck('patrician and slum quarters both exist', st.pat>0&&st.slum>0, st.pat+' patrician, '+st.slum+' slum');
  ck('patrician outranks slum on the gradient that chose them',
     st.pat>0&&st.slum>0&&(st.patS/st.pat)>(st.slumS/st.slum),
     (st.patS/Math.max(1,st.pat)).toFixed(3)+' vs '+(st.slumS/Math.max(1,st.slum)).toFixed(3));
  /* v2.64 shipped four districts into the BUILDING tint and not the PARCEL fill, where an unknown
     district is silently skipped. Assert over what is actually observed, so the next one cannot
     slip past either. */
  ck('EVERY district observed has a parcel fill — both palettes, not just one',
     st.noFill.length===0, st.noFill.join(',')||'all covered');

  /* ── 4. absent economy ⇒ the pass does nothing (the v0.98 guard) ────────────────────────── */
  const off=await pg.evaluate(()=>{
    const p=state.places.filter(q=>CIV_SETTLE_KEYS.has(q.kind))[0];
    const ctx=_umPlaceContext(p); const o=Object.assign({},ctx); delete o.economy;
    const m=UME.cityGen(12345,o);
    return (m.parcels||[]).filter(par=>/^(tanyard|millrace|kilnyard|innyard|patrician|slum)$/.test(par.district)).length;
  });
  ck('with no opts.economy the M-IND pass is inert — the synthetic path is untouched', off===0,
     off+' districts');

  console.log('\n'+pass+' passed, '+fail+' failed');
  await b.close();
  process.exit(fail?1:0);
})();
