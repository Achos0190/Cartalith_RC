#!/usr/bin/env node
/* v2.73 — the village green and the footpath class.
 *
 * THE LAST TWO UNBUILT ITEMS from the reference village map v2.68 worked through: "a village green
 * as an object distinct from the market plaza" and "a footpath street class". Both turned out to
 * be one decision and one source away, not new geometry.
 *
 * THE GREEN IS A PLAZA WITH A DIFFERENT PURPOSE. buildPlaza already produces the geometry for
 * either — a widened bay off the principal street — and what separates a market place from a
 * common green is MARKET RIGHT, not size. So the plaza gains a `kind`, decided at buildCivic's own
 * chartered-town threshold (pop 1500) rather than at a second number invented for the same
 * distinction; the market CROSS (the legal marker of that right) draws only on a market, and the
 * pond draws only on a green. The three addStreet calls are unchanged, in the same order, at the
 * same widths — which is why blocks/parcels/buildings, and so `hashModel`, cannot move.
 *
 * THE FOOTPATH HAD A FREE SOURCE THAT NEVER RUNS, AND MEASURING IT IS WHAT CAUGHT THAT.
 * privatizeAlleys models a through-alley being enclosed into the adjoining plots: the edge must
 * leave the STREET graph (no cart may route down it) but the foot traffic survives — that is what
 * a snicket is. Capturing the killed geometry is four lines and costs nothing. It is also
 * UNREACHABLE on the profile the app generates: that pass opens `if(!bias) return;` and
 * DEFAULT_RULES.street.deadEndBias is 0, with only the medina family's documented 0.16 floor ever
 * setting it. Measured across six populations on the default medieval profile: 0 paths. Shipping
 * only that half would have been v2.42's defect — a feature that computes correctly and shows
 * nothing on the map anyone actually makes. So buildFootpaths is the always-on source, and it
 * invents nothing either: it connects features the engine already places (church, wells, the pond)
 * to streets that already exist, which is what a desire line IS.
 *
 * What this asserts, and why each rather than a cheaper cousin:
 *   - the plaza kind is a CROSSOVER, asserted in BOTH directions. A gate that never fires is the
 *     same as no gate; one that always fires is the defect it exists to prevent (v2.68's rule);
 *   - the cross and the pond are asserted as MUTUALLY EXCLUSIVE per town, not merely present —
 *     "a village has a pond" passes on a build that also stands a market cross on the green;
 *   - the alley source is asserted to be INERT at the default rules and LIVE at a real bias, which
 *     is the measurement the always-on source exists because of. A probe that only counted paths
 *     would have reported this feature working while the alley half was dead;
 *   - no path may cross a building, measured by sampling the segment against real footprints —
 *     11.4% of path length fell inside one before the rejection test was added;
 *   - all THREE renderers, separately (v2.68: three call sites is where this file's drift lives),
 *     and the path gate keyed on its OWN width in both directions;
 *   - and, against the CONTROL, that the layout is BIT-IDENTICAL — `hashModel` covers
 *     graph/blocks/parcels/buildings and not plaza/details/paths, so the 882 UM goldens cannot
 *     move by construction. Asserting that rather than "the goldens still pass" is v2.66's rule.
 *
 *   node tests/perf/probe_greenpath.js "Cartalith v2.73 DCC test.html" ["Cartalith v2.72 DCC test.html"]
 */
const path=require('path');
const PW=process.env.PLAYWRIGHT_DIR||'/opt/node22/lib/node_modules/playwright';
const {chromium}=require(PW);
const FILE=process.argv[2], CTRL=process.argv[3];
let pass=0,fail=0;
const ck=(n,c,x)=>{ if(c){pass++;console.log('ok   - '+n+(x?'   ('+x+')':''));}
                    else{fail++;console.log('FAIL - '+n+(x?'   ('+x+')':''));} };

/* Instruments the real 2D context, exactly as probe_fringe does: a mark is identified by the
   colour the shipped renderer chose, never by a stub that could agree with a broken build. */
const INSTRUMENT=`
  window._recStart=()=>{ window._rec=[];
    const C=CanvasRenderingContext2D.prototype;
    if(!C.__patched2){ const f=C.fill,s=C.stroke;
      C.fill=function(){ if(window._rec) window._rec.push({op:'fill',st:this.fillStyle}); return f.apply(this,arguments); };
      C.stroke=function(){ if(window._rec) window._rec.push({op:'stroke',st:this.strokeStyle,dash:(this.getLineDash()||[]).length}); return s.apply(this,arguments); };
      C.__patched2=true; }
  };
  window._norm=(c)=>{ const k=document.createElement('canvas').getContext('2d'); k.fillStyle=c; return k.fillStyle; };
  window._mk=(pop,extra)=>UME.cityGen(4542,Object.assign(
    {epochs:8,pop:pop,walls:false,fortified:false,culture:'medieval',site:'coast'},extra||{}));
  /* Both map surfaces are driven at a stated PX-PER-METRE, so the two renderers are compared at
     one real scale rather than at whatever each happens to fit to. _umDrawLayout's own mScale is
     gridPerMeter x the screen scale, so the grid multiplier is pxPerM x the world's metres/cell;
     _cvDrawCity's camera scale is already px per metre. _umDrawLayoutPreview fits to the built
     mass and has no scale to set - it is always at town scale, which is the point of it. */
  window._mPerCell=()=>state.mapWidthKm*1000/GW;
  /* _umDrawLayout derives its own mScale from lodSpanKm() - the LIVE camera span - not from the
     toScreen it is handed, so the probe drives the REAL camera globals rather than stubbing the
     function: mScale = GW/(1000*span), and span = mapWidthKm/_lodZoom under Tiled LOD. The
     toScreen multiplier is set to agree with it, exactly as the app's own two conversions do. */
  window._runAll=(model,pxPerM)=>{
    const out={}, K=pxPerM*window._mPerCell();
    const wasOn=_lodOn, wasZ=_lodZoom;
    _lodOn=true; _lodZoom=(state.mapWidthKm*1000*pxPerM)/GW;   // => lodSpanKm() gives this mScale
    const cv=document.createElement('canvas'); cv.width=900; cv.height=700;
    const g=cv.getContext('2d');
    window._recStart();
    _umDrawLayout(g,{x:GW/2,y:GH/2},model,(gx,gy)=>[(gx-GW/2)*K+450,(gy-GH/2)*K+350],1,0);
    out.layout=window._rec.slice();
    _lodOn=wasOn; _lodZoom=wasZ;
    window._recStart(); _umDrawLayoutPreview(g,model,900,700); out.preview=window._rec.slice();
    window._recStart();
    _cvDrawCity(g,model,{panX:model.Wm/2,panY:model.Hm/2,scale:pxPerM},900,700);
    out.viewer=window._rec.slice();
    window._rec=null; return out;
  };
`;

async function open(file){
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium',args:['--no-sandbox']});
  const pg=await b.newPage({viewport:{width:1500,height:980}});
  pg.on('pageerror',e=>{fail++;console.log('FAIL - uncaught page error ('+path.basename(file)+'): '+e.message);});
  await pg.goto('file://'+path.resolve(file));
  await pg.waitForFunction(()=>typeof generate==='function',{timeout:120000});
  /* 512, not 256: _umDrawLayout's mScale is GW/(1000*max(1,lodSpanKm())), so its metres-to-pixels
     conversion SATURATES at GW/1000 px/m however far the camera zooms — 0.256 at a 256-cell grid,
     which sits below a 1.4 m path's own half-pixel gate, so the map renderer would correctly draw
     no footpath there and the probe would have read that as a broken renderer. Assertion 5b pins
     the ceiling itself rather than leaving it as a number this probe silently depends on. */
  await pg.evaluate(async()=>{ state.world=false; state.tect.seed=12345; state.resW=512; GW=512; GH=gridH(512);
    allocate(); await generate(); if(typeof _setupHide==='function')_setupHide(); });
  await pg.evaluate(INSTRUMENT);
  return {b,pg};
}

(async()=>{
  const {b,pg}=await open(FILE);

  /* ── 1. the plaza kind is a CROSSOVER, both directions ─────────────────────────────────── */
  const kinds=await pg.evaluate(()=>[300,900,1400,1600,4000,12000].map(p=>{
    const m=window._mk(p);
    const d=m.details||[];
    return {pop:p, kind:(m.plaza&&m.plaza.kind)||null,
            cross:d.filter(x=>x.kind==='cross').length,
            pond:d.filter(x=>x.kind==='pond').length,
            poly:(m.plaza&&m.plaza.poly||[]).length};
  }));
  const below=kinds.filter(k=>k.pop<1500), above=kinds.filter(k=>k.pop>=1500);
  ck('a settlement below the chartered-town threshold has a GREEN',
     below.length>0 && below.every(k=>k.kind==='green'),
     below.map(k=>k.pop+':'+k.kind).join(' '));
  ck('a settlement at or above it has a MARKET — the gate fires both ways',
     above.length>0 && above.every(k=>k.kind==='market'),
     above.map(k=>k.pop+':'+k.kind).join(' '));
  ck('the green is real geometry, not a label — same quad the market plaza is',
     kinds.every(k=>k.poly===4),
     'plaza vertices: '+[...new Set(kinds.map(k=>k.poly))].join(','));

  /* ── 2. cross and pond are mutually exclusive, because market right is ─────────────────── */
  ck('the market CROSS stands only where the market right exists',
     below.every(k=>k.cross===0) && above.every(k=>k.cross===1),
     kinds.map(k=>k.pop+':'+k.cross).join(' '));
  ck('the POND is the green\'s own water and never appears on a market place',
     below.every(k=>k.pond===1) && above.every(k=>k.pond===0),
     kinds.map(k=>k.pop+':'+k.pond).join(' '));

  /* ── 3. the alley source is INERT at the default rules — the measurement that decided the
         always-on source, and the one a bare path count would have hidden ─────────────────── */
  const alley=await pg.evaluate(()=>{
    /* the alley pass is gated on deadEndBias; medieval's profile is 0 and DEFAULT_RULES is 0, so
       the enclosure pass never runs on the profile the app actually generates. Feed a real bias
       through the rules object cityGen already reads to prove the capture works when it does. */
    const base=window._mk(900);
    const biased=UME.cityGen(4542,{epochs:8,pop:900,walls:false,fortified:false,culture:'medieval',
      site:'coast',rules:{street:{deadEndBias:0.30}}});
    return {defPaths:(base.paths||[]).length,
            defAlley:(base.paths||[]).filter(p=>/enclosed into the adjoining plots/.test(p.prov||'')).length,
            biasAlley:(biased.paths||[]).filter(p=>/enclosed into the adjoining plots/.test(p.prov||'')).length};
  });
  ck('the enclosed-alley source is UNREACHABLE at the default rules — why the always-on source exists',
     alley.defAlley===0,
     'default profile: '+alley.defAlley+' enclosed alleys of '+alley.defPaths+' paths');
  ck('...and it is genuinely live once a profile sets a real dead-end bias',
     alley.biasAlley>0, 'deadEndBias 0.30: '+alley.biasAlley+' enclosed alleys');

  /* ── 4. every town gets footpaths, and none of them runs through a house ───────────────── */
  const fp=await pg.evaluate(()=>[300,900,1400,1600,4000,12000].map(p=>{
    const m=window._mk(p), ps=m.paths||[], B=m.buildings||[];
    const inside=(q)=>{ for(const bl of B){ const pl=bl.poly; if(!pl||pl.length<3) continue;
      let c=false; for(let i=0,j=pl.length-1;i<pl.length;j=i++){ const u=pl[i],v=pl[j];
        if(((u.y>q.y)!==(v.y>q.y))&&(q.x<(v.x-u.x)*(q.y-u.y)/(v.y-u.y)+u.x)) c=!c; }
      if(c) return true; } return false; };
    let tot=0,bad=0;
    for(const s of ps){ const L=Math.hypot(s.b.x-s.a.x,s.b.y-s.a.y);
      for(let t=0;t<20;t++){ const u=(t+0.5)/20;
        tot+=L/20; if(inside({x:s.a.x+(s.b.x-s.a.x)*u, y:s.a.y+(s.b.y-s.a.y)*u})) bad+=L/20; } }
    const lens=ps.map(s=>Math.hypot(s.b.x-s.a.x,s.b.y-s.a.y));
    return {pop:p,n:ps.length,buildings:B.length,insidePct:tot?100*bad/tot:0,
            maxLen:lens.length?Math.max(...lens):0, minLen:lens.length?Math.min(...lens):0};
  }));
  ck('every settlement size wears at least one footpath',
     fp.every(f=>f.n>=1), fp.map(f=>f.pop+':'+f.n).join(' '));
  ck('NO footpath length falls inside a building — the seven-sample rejection',
     fp.every(f=>f.insidePct===0),
     fp.map(f=>f.pop+':'+f.insidePct.toFixed(1)+'%').join(' '));
  ck('a path is a desire line, bounded at both ends, never a lane the network owed',
     fp.every(f=>f.n===0||(f.minLen>=6 && f.maxLen<=90)),
     'lengths '+fp.filter(f=>f.n).map(f=>f.minLen.toFixed(0)+'-'+f.maxLen.toFixed(0)).join(', ')+' m');

  /* -- 5. all three renderers draw all three, and the map surfaces disclose them by SCALE ------
     A first cut of this assertion drove _umDrawLayout at an arbitrary multiplier that worked out
     to 0.013 px/m - where a 1.4 m path is a fiftieth of a pixel - and read the correct silence as
     a broken renderer. It is CORRECTED rather than loosened (v2.67's rule): both map surfaces are
     driven at a stated px-per-metre, and the claim is that each feature appears at the scale it
     becomes real at. The green is GROUND and reads as a mass at any zoom the town is drawn at; a
     footpath and a pond are the size of a person and are disclosed only once the map reaches their
     own scale - drawing them at a floor instead would be v2.50's inflating floor, a 1.4 m track
     painted as wide as the street beside it. */
  const marks=await pg.evaluate(()=>{
    const m=window._mk(900);
    const G=window._norm('rgb(146,164,104)'), P=window._norm('rgb(108,148,176)'),
          T=window._norm('rgb(196,186,158)');
    const tally=r=>({green:r.filter(x=>x.op==='fill'&&x.st===G).length,
                     pond:r.filter(x=>x.op==='fill'&&x.st===P).length,
                     paths:r.filter(x=>x.op==='stroke'&&x.st===T&&x.dash>0).length,
                     total:r.length});
    const deep=window._runAll(m,0.9), band=window._runAll(m,0.03);
    return {deep:{layout:tally(deep.layout),preview:tally(deep.preview),viewer:tally(deep.viewer)},
            band:{layout:tally(band.layout),viewer:tally(band.viewer)}};
  });
  for(const [name,t] of Object.entries(marks.deep))
    ck('at footpath scale, renderer draws green + pond + footpaths: '+name,
       t.green>=1 && t.pond>=1 && t.paths>=1,
       'green '+t.green+', pond '+t.pond+', path stroke '+t.paths+' of '+t.total+' ops');
  const ceil=await pg.evaluate(()=>{
    const was=[_lodOn,_lodZoom]; _lodOn=true; _lodZoom=1e9;
    const m=lodSpanKm(), sat=GW/(1000*Math.max(1,m));
    _lodOn=was[0]; _lodZoom=was[1];
    return {span:m, sat:sat, pathPx:1.4*sat, gw:GW};
  });
  /* The floor lives in the CONSUMER, not in lodSpanKm() — which happily returns a sub-metre span —
     so the ceiling is a property of _umDrawLayout's own expression and is stated as such. */
  ck('the map renderer\'s metres-to-pixels conversion saturates at GW/1000 px/m — a real ceiling, disclosed',
     Math.abs(ceil.sat-ceil.gw/1000)<1e-9 && ceil.span<1,
     'lodSpanKm() '+ceil.span.toExponential(1)+' km, floored at 1 km by the renderer => '+
     ceil.sat.toFixed(3)+' px/m at GW '+ceil.gw+', so a 1.4 m path tops out at '+
     ceil.pathPx.toFixed(2)+' px on the main map there');
  ck('at the crossfade band the green still reads as GROUND in both map renderers',
     marks.band.layout.green>=1 && marks.band.viewer.green>=1,
     'layout '+marks.band.layout.green+', viewer '+marks.band.viewer.green);
  ck('...while the sub-pixel path and pond correctly draw NOTHING there',
     marks.band.layout.paths===0 && marks.band.layout.pond===0 &&
     marks.band.viewer.paths===0 && marks.band.viewer.pond===0,
     'layout '+marks.band.layout.paths+'/'+marks.band.layout.pond+
     ', viewer '+marks.band.viewer.paths+'/'+marks.band.viewer.pond+' at 0.03 px/m');

  /* ── 6. the path gate is keyed on its OWN width, in both directions ────────────────────── */
  const gate=await pg.evaluate(()=>{
    const m=window._mk(900);
    const cv=document.createElement('canvas'); cv.width=900; cv.height=700;
    const g=cv.getContext('2d');
    const T=window._norm('rgb(196,186,158)');
    const run=(sc)=>{ window._recStart();
      _umDrawPaths(g,m,(x,y)=>[x*sc,y*sc],sc);
      const n=window._rec.filter(x=>x.op==='stroke'&&x.st===T).length; window._rec=null; return n; };
    return {coarse:run(0.02), fine:run(1.0), nPaths:(m.paths||[]).length};
  });
  ck('a 1.4 m path under half a pixel wide draws NOTHING — not a grey haze (v2.50 in a renderer)',
     gate.coarse===0, gate.coarse+' strokes at 0.02 px/m');
  ck('...and draws at a real scale, so the gate is a crossover rather than a mute',
     gate.fine>=1, gate.fine+' strokes at 1.0 px/m over '+gate.nPaths+' paths');

  /* ── 7. the control: the layout is BIT-IDENTICAL, and the prior version drew none of it ── */
  if(CTRL){
    const mine=await pg.evaluate(()=>[300,900,1400,1600,4000,12000].map(p=>UME.hashModel(window._mk(p))));
    const c=await open(CTRL);
    const theirs=await c.pg.evaluate(()=>[300,900,1400,1600,4000,12000].map(p=>UME.hashModel(window._mk(p))));
    const cm=await c.pg.evaluate(()=>{
      const m=window._mk(900), out=window._runAll(m,0.9);
      const G=window._norm('rgb(146,164,104)'), P=window._norm('rgb(108,148,176)'),
            T=window._norm('rgb(196,186,158)');
      const tally=r=>r.filter(x=>(x.op==='fill'&&(x.st===G||x.st===P))||
                                 (x.op==='stroke'&&x.st===T&&x.dash>0)).length;
      return {drawn:tally(out.layout)+tally(out.preview)+tally(out.viewer),
              paths:(m.paths||[]).length, kind:(m.plaza&&m.plaza.kind)||null,
              pond:(m.details||[]).filter(x=>x.kind==='pond').length};
    });
    await c.b.close();
    ck('CONTROL: the prior version generates no green, no pond and no footpath',
       cm.paths===0 && cm.kind===null && cm.pond===0,
       'paths '+cm.paths+', plaza.kind '+cm.kind+', ponds '+cm.pond);
    ck('CONTROL: and draws zero of them in all three renderers',
       cm.drawn===0, cm.drawn+' marks');
    ck('the LAYOUT is bit-identical to the control — hashModel cannot see plaza, details or paths',
       mine.length===theirs.length && mine.every((h,i)=>h===theirs[i]),
       mine.map((h,i)=>h===theirs[i]?'=':'X').join('')+' over 6 populations');
  }

  await b.close();
  console.log('\n'+pass+' passed, '+fail+' failed');
  process.exit(fail?1:0);
})();
