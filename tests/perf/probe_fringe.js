#!/usr/bin/env node
/* v2.68 — the agricultural fringe is DRAWN.
 *
 * THE DEFECT WAS A FEATURE THAT WAS GENERATED AND RENDERED NOWHERE. buildFarmland has pushed
 * field/pasture polygons into model.details since the layout engine was ported (v0.95). Neither
 * map renderer reads model.details at all, and the City Viewer's own detail pass (v1.18) branches
 * on well/cross/crane/bollard/spoilheap/tree/dryingrack/logboom/fence — with no branch for either
 * kind, so every field fell through every else-if and drew nothing, in silence, for the life of
 * the file. Measured on the shipped generator at seed 12345: 62-86 field and 17-22 pasture
 * polygons per pop-440 village. This version adds no generation and changes no value.
 *
 * WHAT WAS MEASURED BEFORE ANYTHING WAS WRITTEN, because it decided the design:
 *   - a strip is 5.8 x 91.5 m at the median, every poly a quad, aspect ~16:1 — a SELION, one
 *     plough-run, not a field. A furlong is a bundle of parallel selions, so the furrow texture
 *     AND the per-parcel ploughing direction are already in the geometry. No hatch pass is
 *     written and no plough bearing is stored: either would be a second way to say what the
 *     polygon already says. Assertion 5 is what that decision rests on.
 *   - the fringe spans 1726 x 401 m against a 187 x 332 m built mass, so it is the ground the
 *     town sits in and goes down FIRST — under the water, which must win wherever a strip
 *     clipped a channel (assertion 4).
 *
 * What this asserts, and why each one rather than a cheaper cousin:
 *   - with the CONTROL file the same model yields the same polygons and the renderers emit ZERO
 *     fringe marks. "It draws something" passes on a build that draws a tone for another reason;
 *     a delta against the prior version's own output cannot (v2.39/v2.57);
 *   - all THREE renderers, asserted separately — three call sites is exactly where this file's
 *     recurring "two functions answering one question" drift lives, which is also why the three
 *     share one helper rather than three copies;
 *   - the ORDER (fringe before water), not merely the presence of both;
 *   - the hedgerow gate is a real CROSSOVER — off at a coarse scale, on at a fine one. A gate
 *     that never fires is the same as no gate, and one that always fires is the dark-wash defect
 *     it exists to prevent (v2.50);
 *   - and the props gate on their OWN size, so a town at the far end of the crossfade draws no
 *     sub-pixel speckle.
 *
 *   node tests/perf/probe_fringe.js "Cartalith v2.68 DCC test.html" ["Cartalith v2.67 DCC test.html"]
 */
const path=require('path');
const PW=process.env.PLAYWRIGHT_DIR||'/opt/node22/lib/node_modules/playwright';
const {chromium}=require(PW);
const FILE=process.argv[2], CTRL=process.argv[3];
let pass=0,fail=0;
const ck=(n,c,x)=>{ if(c){pass++;console.log('ok   - '+n+(x?'   ('+x+')':''));}
                    else{fail++;console.log('FAIL - '+n+(x?'   ('+x+')':''));} };

/* Instruments the real 2D context: every fill()/stroke() records the style the renderer had set,
   so a "fringe mark" is identified by the colour the shipped code chose, never by a stub that
   could agree with a broken build. Canvas normalises a style to #rrggbb on read-back, so the
   expected values are normalised the same way rather than string-matched against the source. */
const INSTRUMENT=`
  window._recStart=()=>{ window._rec=[];
    const C=CanvasRenderingContext2D.prototype;
    if(!C.__patched){ const f=C.fill,s=C.stroke,a=C.arc;
      C.fill=function(){ if(window._rec) window._rec.push({op:'fill',st:this.fillStyle}); return f.apply(this,arguments); };
      C.stroke=function(){ if(window._rec) window._rec.push({op:'stroke',st:this.strokeStyle}); return s.apply(this,arguments); };
      C.__patched=true; }
  };
  window._norm=(c)=>{ const k=document.createElement('canvas').getContext('2d'); k.fillStyle=c; return k.fillStyle; };
  window._mkModel=(o)=>UME.cityGen(12345,Object.assign({epochs:8,pop:440,walls:false,fortified:false,culture:'medieval',site:'coast'},o||{}));
  window._runAll=(model)=>{
    const out={};
    const cv=document.createElement('canvas'); cv.width=900; cv.height=700;
    const g=cv.getContext('2d');
    // 1. the deep-zoom map renderer. toScreen maps grid->canvas; a plain affine is enough here.
    window._recStart();
    _umDrawLayout(g,{x:GW/2,y:GH/2},model,(gx,gy)=>[(gx-GW/2)*40+450,(gy-GH/2)*40+350],1,0);
    out.layout=window._rec.slice();
    // 2. the popup / Types-pane preview
    window._recStart(); _umDrawLayoutPreview(g,model,900,700); out.preview=window._rec.slice();
    // 3. the City Viewer, at a scale where the whole fringe is in frame
    window._recStart();
    _cvDrawCity(g,model,{panX:model.Wm/2,panY:model.Hm/2,scale:0.5},900,700);
    out.viewer=window._rec.slice();
    window._rec=null;
    return out;
  };
`;

async function open(file){
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium',args:['--no-sandbox']});
  const pg=await b.newPage({viewport:{width:1500,height:980}});
  pg.on('pageerror',e=>{fail++;console.log('FAIL - uncaught page error ('+path.basename(file)+'): '+e.message);});
  await pg.goto('file://'+path.resolve(file));
  await pg.waitForFunction(()=>typeof generate==='function',{timeout:120000});
  await pg.evaluate(async()=>{ state.world=false; state.tect.seed=12345; state.resW=256; GW=256; GH=gridH(256);
    allocate(); await generate(); if(typeof _setupHide==='function')_setupHide(); });
  await pg.evaluate(INSTRUMENT);
  return {b,pg};
}

(async()=>{
  const {b,pg}=await open(FILE);

  /* ── 1. the data was always there ──────────────────────────────────────────────────────── */
  const data=await pg.evaluate(()=>{
    const m=window._mkModel();
    const d=m.details||[];
    const c={}; for(const x of d) c[x.kind]=(c[x.kind]||0)+1;
    // every field poly's dimensions, to pin the selion claim the no-hatch decision rests on
    const dims=d.filter(x=>x.kind==='field'||x.kind==='pasture').map(x=>{
      const e=[]; for(let i=0;i<x.poly.length;i++){ const a=x.poly[i],b2=x.poly[(i+1)%x.poly.length];
        e.push(Math.hypot(b2.x-a.x,b2.y-a.y)); }
      e.sort((p,q)=>q-p); return {lon:e[0],shrt:e[e.length-1],n:x.poly.length};});
    const med=(a)=>{a=a.slice().sort((p,q)=>p-q);return a[Math.floor(a.length/2)];};
    return {counts:c, nFringe:dims.length, verts:[...new Set(dims.map(x=>x.n))],
            medLong:med(dims.map(x=>x.lon)), medShort:med(dims.map(x=>x.shrt))};
  });
  ck('a village-scale town generates a real fringe',
     data.nFringe>=40 && (data.counts.field||0)>0 && (data.counts.pasture||0)>0,
     data.nFringe+' parcels: '+JSON.stringify(data.counts));
  ck('every fringe parcel is a SELION, not a field — which is why no hatch pass is written',
     data.verts.length===1 && data.verts[0]===4 && data.medShort<12 && data.medLong>40 &&
     data.medLong/data.medShort>6,
     data.medShort.toFixed(1)+' x '+data.medLong.toFixed(1)+' m, aspect '+
     (data.medLong/data.medShort).toFixed(1)+':1');

  /* ── 2. all three renderers draw it ────────────────────────────────────────────────────── */
  const marks=await pg.evaluate(()=>{
    const m=window._mkModel(), out=window._runAll(m);
    const F=window._norm('rgb(178,170,120)'), P=window._norm('rgb(150,166,112)'),
          E=window._norm('rgb(104,118,72)'), W=window._norm('rgb(92,130,172)');
    const tally=(rec)=>({
      fill:rec.filter(r=>r.op==='fill'&&(r.st===F||r.st===P)).length,
      hedge:rec.filter(r=>r.op==='stroke'&&r.st===E).length,
      firstFringe:rec.findIndex(r=>r.op==='fill'&&(r.st===F||r.st===P)),
      firstWater:rec.findIndex(r=>r.op==='fill'&&r.st===W),
      total:rec.length});
    return {layout:tally(out.layout), preview:tally(out.preview), viewer:tally(out.viewer)};
  });
  for(const [name,t] of Object.entries(marks))
    ck('renderer draws the fringe: '+name, t.fill>=20, t.fill+' parcel fills of '+t.total+' ops');

  /* ── 3. the fringe is GROUND — under the water, not over it ────────────────────────────── */
  const order=Object.entries(marks).filter(([,t])=>t.firstWater>=0&&t.firstFringe>=0);
  ck('the fringe is drawn UNDER the water in every renderer that drew both',
     order.length>0 && order.every(([,t])=>t.firstFringe<t.firstWater),
     order.map(([k,t])=>k+' '+t.firstFringe+'<'+t.firstWater).join(', '));

  /* ── 4. the hedgerow gate is a CROSSOVER ───────────────────────────────────────────────── */
  const gate=await pg.evaluate(()=>{
    const m=window._mkModel();
    const cv=document.createElement('canvas'); cv.width=600; cv.height=600; const g=cv.getContext('2d');
    const E=window._norm('rgb(104,118,72)');
    /* v2.71 CORRECTION, not a loosening: this pairs the HEDGEROW stroke with the FIELD/PASTURE
       fills it belongs to. v2.71 added woodland to the same pass, and a wood strokes in its own
       darker edge colour and is deliberately exempt from the narrow-parcel gate (a wood's edge is
       its own boundary and a wood is never 5.8 m wide), so counting every fringe fill against
       hedgerow-coloured strokes compared 98 strokes with 108 fills. Scoping the denominator to the
       kinds the assertion is actually about keeps it passing on the control, which is what makes
       this a correction. */
    const F=window._norm('rgb(178,170,120)'), P=window._norm('rgb(150,166,112)');
    const run=(mScale)=>{ window._recStart();
      _umDrawFringe(g,m.details,(pts,cl)=>{ g.beginPath(); for(let i=0;i<pts.length;i++){ const x=pts[i].x*mScale,y=pts[i].y*mScale;
        if(i===0)g.moveTo(x,y); else g.lineTo(x,y);} if(cl)g.closePath(); },mScale);
      const r=window._rec; window._rec=null;
      return {fill:r.filter(q=>q.op==='fill'&&(q.st===F||q.st===P)).length,
              hedge:r.filter(q=>q.op==='stroke'&&q.st===E).length}; };
    // the median short edge is 5.8 m, so the 1.5 px gate sits near mScale 0.26
    return {coarse:run(0.08), fine:run(1.0),
            minEdge:Math.min.apply(null,(m.details||[]).filter(d=>d.kind==='field').map(d=>{
              let mn=Infinity; for(let i=0;i<d.poly.length;i++){ const a=d.poly[i],b=d.poly[(i+1)%d.poly.length];
                mn=Math.min(mn,Math.hypot(b.x-a.x,b.y-a.y)); } return mn; }))};
  });
  ck('at a coarse scale the fill survives and the hedgerow does NOT (no dark wash)',
     gate.coarse.fill>=20 && gate.coarse.hedge===0,
     gate.coarse.fill+' fills, '+gate.coarse.hedge+' hedgerows');
  ck('at a fine scale every parcel gets its hedgerow',
     gate.fine.hedge===gate.fine.fill && gate.fine.hedge>=20,
     gate.fine.hedge+' hedgerows / '+gate.fine.fill+' fills');

  /* ── 5. the ploughing direction is in the GEOMETRY ─────────────────────────────────────── */
  /* This is the assertion the "no hatch pass" decision rests on: if the selions did NOT already
     carry a per-parcel orientation, storing a plough bearing would be the right fix instead. */
  const dirs=await pg.evaluate(()=>{
    const m=window._mkModel();
    const bearing=(poly)=>{ let bx=0,by=0,bl=-1;
      for(let i=0;i<poly.length;i++){ const a=poly[i],b=poly[(i+1)%poly.length];
        const dx=b.x-a.x,dy=b.y-a.y,l=dx*dx+dy*dy; if(l>bl){bl=l;bx=dx;by=dy;} }
      let d=Math.atan2(by,bx)*180/Math.PI; d=((d%180)+180)%180; return d; };
    const bs=(m.details||[]).filter(d=>d.kind==='field'||d.kind==='pasture').map(d=>bearing(d.poly));
    const bins={}; for(const x of bs){ const k=Math.round(x/10)*10%180; bins[k]=(bins[k]||0)+1; }
    const counts=Object.values(bins).sort((a,b)=>b-a);
    return {n:bs.length, distinct:counts.length, biggest:counts[0], shared:counts.filter(c=>c>1).length};
  });
  ck('adjacent parcels are ploughed in different directions — the texture is the geometry',
     dirs.distinct>=3, dirs.distinct+' distinct bearings across '+dirs.n+' parcels');
  ck('and strips off one road SHARE a direction, which is what a furlong is',
     dirs.biggest>=2 && dirs.shared>=2,
     'largest bundle '+dirs.biggest+' parcels, '+dirs.shared+' bundles of 2+');

  /* ── 6. a prop gates on its own size ───────────────────────────────────────────────────── */
  const props=await pg.evaluate(()=>{
    const m=window._mkModel({site:'landlocked',pop:2500});
    const cv=document.createElement('canvas'); cv.width=600; cv.height=600; const g=cv.getContext('2d');
    const T=window._norm('rgb(78,116,58)'), O=window._norm('rgb(96,132,64)');
    const run=(mScale)=>{ window._recStart();
      _umDrawFringeProps(g,m.details,(pts,cl)=>{ g.beginPath(); for(let i=0;i<pts.length;i++){ const x=pts[i].x*mScale,y=pts[i].y*mScale;
        if(i===0)g.moveTo(x,y); else g.lineTo(x,y);} if(cl)g.closePath(); },(x,y)=>[x*mScale,y*mScale],mScale);
      const r=window._rec; window._rec=null;
      return r.filter(q=>q.op==='fill'&&(q.st===T||q.st===O)).length; };
    return {trees:(m.details||[]).filter(d=>d.kind==='tree').length, coarse:run(0.02), fine:run(1.0)};
  });
  ck('a sub-pixel tree draws nothing; at a real scale every tree draws',
     props.coarse===0 && props.fine===props.trees && props.trees>0,
     props.trees+' trees: '+props.coarse+' at 0.02 px/m, '+props.fine+' at 1.0');

  await b.close();

  /* ── 7. the control: the SAME data, and the prior version draws none of it ─────────────── */
  if(CTRL){
    const c=await open(CTRL);
    const ctl=await c.pg.evaluate(()=>{
      const m=window._mkModel(), out=window._runAll(m);
      const F=window._norm('rgb(178,170,120)'), P=window._norm('rgb(150,166,112)');
      const n=(rec)=>rec.filter(r=>r.op==='fill'&&(r.st===F||r.st===P)).length;
      return {fringe:(m.details||[]).filter(d=>d.kind==='field'||d.kind==='pasture').length,
              layout:n(out.layout), preview:n(out.preview), viewer:n(out.viewer)};
    });
    await c.b.close();
    ck('the control generates the identical fringe', ctl.fringe===data.nFringe,
       ctl.fringe+' parcels, same as '+data.nFringe);
    ck('and the control draws NONE of it — which is what makes this a delta, not a claim',
       ctl.layout===0&&ctl.preview===0&&ctl.viewer===0,
       'layout '+ctl.layout+', preview '+ctl.preview+', viewer '+ctl.viewer);
  } else console.log('note - pass the previous version as a 2nd argument for the control half');

  console.log('\n'+pass+' passed, '+fail+' failed');
  process.exit(fail?1:0);
})().catch(e=>{ console.error(e); process.exit(1); });
