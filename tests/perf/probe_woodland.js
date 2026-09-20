#!/usr/bin/env node
/* v2.71 — woodland as an AREA, and nothing the settlement draws sits on water.
 *
 * Owner: "do woodland areas next and on part of settlements, your example rendered in water
 * (either lake or sea it should avoid and always have suitable land beneath it".
 * Then, on seeing the first fix pass its fixtures: "Now in these static tests the waterline and
 * around a river work fine, within the actual cartalith generation it seems to miss. Do we need an
 * extra technical layer to help guide settlement generation or can we use an existing layer?"
 *
 * THE ANSWER WAS AN EXISTING LAYER, AND THE SECOND REPORT IS THE ONE THAT MATTERED. On the REAL
 * map-water path `buildSite` sets `waterPoly=[]` deliberately — its own comment says the map
 * already draws the sea under the town, so the town must not paint a second one — which left every
 * renderer with NO water geometry on exactly the towns the app actually generates. A clip keyed on
 * `waterPoly` therefore passed every synthetic fixture and did nothing in the real app. No new
 * layer was needed: `_umWaterCtx` has always built a 22 m mask of the real sea, lakes and river
 * band, and `isWater` reads it already; it simply never reached the model, because `cityGen`'s site
 * record is function-free and the mask was not among the fields copied. `landRuns` is that mask,
 * run-length encoded, carried across.
 *
 * WHY A CLIP RATHER THAN A GEOMETRY FIX: measured, ZERO blocks, parcels, buildings or fringe
 * parcels have a sample inside the water, and on a coast fixture ZERO street CENTRELINES do. What
 * crosses is the street's WIDTH — stroked ~8.4 m — and fixing that alone would leave blocks, walls,
 * buildings and every future feature to be fixed one at a time.
 *
 * WHAT THE MEASUREMENT HAD TO BE, because two cheaper ones both lied:
 *   - counting overdrawn water pixels as a SHARE of the water body reads 0.14% and looks like
 *     antialiasing, because the denominator is a 211 000-pixel sea;
 *   - counting pixels whose colour matches a built palette MISSES the encroachment entirely, because
 *     a street edge over water is antialiased and no longer matches any palette entry.
 *     The honest test renders the town, renders it again with the settlement layer stripped, and
 *     diffs INSIDE the water: any pixel the town changed there is the town on the water.
 *
 *   node tests/perf/probe_woodland.js "Cartalith v2.71 DCC test.html" ["Cartalith v2.70 DCC test.html"]
 */
const path=require('path');
const PW=process.env.PLAYWRIGHT_DIR||'/opt/node22/lib/node_modules/playwright';
const {chromium}=require(PW);
const FILE=process.argv[2], CTRL=process.argv[3];
let pass=0,fail=0;
const ck=(n,c,x)=>{ if(c){pass++;console.log('ok   - '+n+(x?'   ('+x+')':''));}
                    else{fail++;console.log('FAIL - '+n+(x?'   ('+x+')':''));} };

const HARNESS=`
  window._inPoly=(p,poly)=>{ let c=false;
    for(let i=0,j=poly.length-1;i<poly.length;j=i++){ const a=poly[i],b=poly[j];
      if(((a.y>p.y)!==(b.y>p.y)) && (p.x < (b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x)) c=!c; }
    return c; };
  /* the honest encroachment measure: diff the town against the SAME site with the settlement layer
     stripped, inside the water. Colour heuristics miss antialiased edges; shares hide behind a big sea. */
  window._encroach=(m,wetAt)=>{
    const W=900,H=660, cam={panX:m.Wm/2,panY:m.Hm/2,scale:Math.min(W/m.Wm,H/m.Hm)*0.95};
    const draw=(mm)=>{ const cv=document.createElement('canvas'); cv.width=W; cv.height=H;
      const g=cv.getContext('2d'); _cvDrawCity(g,mm,cam,W,H); return g.getImageData(0,0,W,H).data; };
    const full=draw(m);
    const bare=Object.assign({},m,{blocks:[],buildings:[],parcels:[],details:[],wall:null,
      graph:{nodes:m.graph.nodes,edges:[]},churches:[],markets:[],civic:null,games:[]});
    const base=draw(bare);
    const mx=(px)=>(px-W/2)/cam.scale+cam.panX, my=(py)=>(py-H/2)/cam.scale+cam.panY;
    const cross=[]; if(m.site.bridgePt) cross.push(m.site.bridgePt);
    for(const bb of m.site.bridges||[]) if(bb&&bb.pt) cross.push(bb.pt);
    if(m.site.ford&&m.site.ford.pt) cross.push(m.site.ford.pt);
    const rw=(m.site.riverW||20)*1.5+40;
    let wet=0, enc=0, atCross=0;
    for(let py=0;py<H;py++) for(let px=0;px<W;px++){
      const q={x:mx(px+0.5),y:my(py+0.5)};
      if(q.x<0||q.y<0||q.x>m.Wm||q.y>m.Hm) continue;
      if(!wetAt(q)) continue; wet++;
      const i=(py*W+px)*4;
      if(full[i]===base[i]&&full[i+1]===base[i+1]&&full[i+2]===base[i+2]) continue;
      if(cross.some(c=>Math.hypot(q.x-c.x,q.y-c.y)<rw)) atCross++; else enc++;
    }
    return {wet,enc,atCross};
  };
`;

async function open(file,real){
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium',args:['--no-sandbox']});
  const pg=await b.newPage({viewport:{width:1200,height:820}});
  pg.on('pageerror',e=>{fail++;console.log('FAIL - uncaught page error ('+path.basename(file)+'): '+e.message);});
  await pg.goto('file://'+path.resolve(file));
  await pg.waitForFunction(()=>typeof generate==='function',{timeout:120000});
  await pg.evaluate(async(real)=>{
    state.world=false; state.tect.seed=12345; state.resW=real?512:256; GW=state.resW; GH=gridH(GW);
    if(real) state.mapWidthKm=200;
    allocate(); await generate(); if(typeof _setupHide==='function')_setupHide();
    if(real){ state.viz.urbanLayouts=true; await _civAutoWorld(); }
  },!!real);
  await pg.evaluate(HARNESS);
  return {b,pg};
}

(async()=>{
  /* ── 1. woodland is an AREA, on land, and loses to the plough ──────────────────────────── */
  const A=await open(FILE,false);
  const wood=await A.pg.evaluate(()=>{
    const out={sites:{},anyPoint:0,wet:0,onFarm:0,total:0};
    for(const site of ['coast','bay','river','riverthrough','landlocked'])
      for(const pop of [440,900,2500]){
        const m=UME.cityGen(12345,{epochs:8,pop,walls:pop>1500,fortified:false,culture:'medieval',site});
        const w=(m.details||[]).filter(d=>d.kind==='wood');
        const farm=(m.details||[]).filter(d=>d.kind==='field'||d.kind==='pasture');
        const fc=farm.map(f=>{ let x=0,y=0; for(const q of f.poly){x+=q.x;y+=q.y;}
          return {x:x/f.poly.length,y:y/f.poly.length}; });
        out.sites[site+'/'+pop]=w.length;
        const wp=m.site.waterPoly;
        for(const ww of w){ out.total++;
          if(!ww.poly||ww.poly.length<3){ out.anyPoint++; continue; }
          let cx=0,cy=0; for(const q of ww.poly){cx+=q.x;cy+=q.y;} cx/=ww.poly.length; cy/=ww.poly.length;
          let r=0; for(const q of ww.poly) r=Math.max(r,Math.hypot(q.x-cx,q.y-cy));
          if(wp&&wp.length>=3&&(window._inPoly({x:cx,y:cy},wp)||ww.poly.some(q=>window._inPoly(q,wp)))) out.wet++;
          if(fc.some(q=>Math.hypot(q.x-cx,q.y-cy)<r*0.5)) out.onFarm++;
        }
      }
    return out;
  });
  const counts=Object.values(wood.sites);
  ck('every site kind and size grows woodland', counts.every(n=>n>0),
     Object.entries(wood.sites).map(([k,v])=>k+':'+v).join(' '));
  ck('a wood is an AREA, never a point', wood.anyPoint===0 && wood.total>0,
     wood.total+' woods, '+wood.anyPoint+' without a polygon');
  ck('no wood sits on the synthetic water', wood.wet===0, wood.wet+' wet of '+wood.total);
  ck('the plough keeps its ground — a wood never sits on a field', wood.onFarm===0,
     wood.onFarm+' of '+wood.total+' overlapping a field centroid');

  /* ── 2. the synthetic path: the fabric is off the water, the crossings are still on it ──── */
  const syn=await A.pg.evaluate(()=>{
    const out={};
    for(const site of ['coast','river','riverthrough']){
      const m=UME.cityGen(12345,{epochs:8,pop:440,walls:false,fortified:false,culture:'medieval',site});
      if(!m.site.waterPoly||m.site.waterPoly.length<3){ out[site]=null; continue; }
      out[site]=window._encroach(m,(q)=>window._inPoly(q,m.site.waterPoly));
    }
    return out;
  });
  const synRows=Object.entries(syn).filter(([,v])=>v);
  ck('on a synthetic site the built fabric is off the water',
     synRows.every(([,v])=>v.enc<=v.wet*0.004),
     synRows.map(([k,v])=>k+' '+v.enc+'/'+v.wet).join(', '));
  await A.b.close();

  /* ── 3. THE REAL PATH — the half the owner's second report was about ────────────────────── */
  const R=await open(FILE,true);
  const real=await R.pg.evaluate(()=>{
    const rows=[]; let withMask=0, emptyPoly=0, n=0;
    for(const p of state.places){
      if(p.kind==='poi') continue;
      const m=_umModelForNow(p); if(!m||!m.site) continue; n++;
      if(m.site.landRuns&&m.site.landRuns.length) withMask++;
      if(!m.site.waterPoly||!m.site.waterPoly.length) emptyPoly++;
    }
    /* encroachment against the town's OWN real-water mask, which is what isWater reads */
    for(const p of state.places.slice(0,40)){
      if(p.kind==='poi') continue;
      const c=_umPlaceContext(p); if(!c||!c.water||!c.water.mask||!c.water.waterCells) continue;
      const m=_umModelForNow(p); if(!m||!m.site) continue;
      const wc=c.water;
      const wetAt=(q)=>{ const i=Math.max(0,Math.min(wc.mw-1,Math.floor(q.x/wc.cellM)));
        const j=Math.max(0,Math.min(wc.mh-1,Math.floor(q.y/wc.cellM))); return wc.mask[j*wc.mw+i]===1; };
      const e=window._encroach(m,wetAt);
      if(e.wet>200) rows.push({name:p.name,wet:e.wet,enc:e.enc});
      if(rows.length>=6) break;
    }
    return {n,withMask,emptyPoly,rows};
  });
  ck('real-water towns carry the mask through to the renderer',
     real.withMask>0, real.withMask+' of '+real.n+' towns have landRuns');
  ck('and many of them have NO waterPoly — which is why a polygon-only clip missed the real app',
     real.emptyPoly>0, real.emptyPoly+' of '+real.n+' with an empty waterPoly');
  const worst=real.rows.length?Math.max.apply(null,real.rows.map(r=>r.enc)):0;
  ck('on a REAL generated world the settlement layer is off the water',
     real.rows.length>=3 && worst<=12,
     real.rows.map(r=>r.name+' '+r.enc+'/'+r.wet).join(', '));
  await R.b.close();

  /* ── 4. the control: the same real world, the same measure, the drift present ───────────── */
  if(CTRL){
    const C=await open(CTRL,true);
    const ctl=await C.pg.evaluate(()=>{
      const rows=[]; let withMask=0;
      for(const p of state.places){ if(p.kind==='poi') continue;
        const m=_umModelForNow(p); if(m&&m.site&&m.site.landRuns&&m.site.landRuns.length) withMask++; }
      for(const p of state.places.slice(0,40)){
        if(p.kind==='poi') continue;
        const c=_umPlaceContext(p); if(!c||!c.water||!c.water.mask||!c.water.waterCells) continue;
        const m=_umModelForNow(p); if(!m||!m.site) continue;
        const wc=c.water;
        const wetAt=(q)=>{ const i=Math.max(0,Math.min(wc.mw-1,Math.floor(q.x/wc.cellM)));
          const j=Math.max(0,Math.min(wc.mh-1,Math.floor(q.y/wc.cellM))); return wc.mask[j*wc.mw+i]===1; };
        const e=window._encroach(m,wetAt);
        if(e.wet>200) rows.push({name:p.name,wet:e.wet,enc:e.enc});
        if(rows.length>=6) break;
      }
      return {withMask,rows,woods:0};
    });
    await C.b.close();
    ck('the control has no mask to clip with — the layer existed and never reached the renderer',
       ctl.withMask===0, ctl.withMask+' towns with landRuns');
    const cw=ctl.rows.length?Math.max.apply(null,ctl.rows.map(r=>r.enc)):0;
    ck('and the control DOES put the settlement on the water — this is a delta, not a claim',
       cw>worst, 'control worst '+cw+' px vs '+worst+' px');
  } else console.log('note - pass the previous version as a 2nd argument for the control half');

  console.log('\n'+pass+' passed, '+fail+' failed');
  process.exit(fail?1:0);
})().catch(e=>{ console.error(e); process.exit(1); });
