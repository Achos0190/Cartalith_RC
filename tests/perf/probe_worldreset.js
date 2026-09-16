#!/usr/bin/env node
/* v2.44 — every world-construction path must reset the previous world's state.
 *
 * v2.43 fixed one of five (the region extract). Measurement found the same defect shape in
 * loadImage(), two session globals surviving loadZip(), and coordinate corruption in the
 * resolution/extent buttons. There are FIVE allocate() sites: generate(), loadZip(), loadImage(),
 * the region extract, and resSeg/extentSeg.
 *
 *   node tests/perf/probe_worldreset.js "Cartalith v2.44 DCC test.html"
 */
const path=require('path'),fs=require('fs'),os=require('os'),zlib=require('zlib');
const PW=process.env.PLAYWRIGHT_DIR||'/opt/node22/lib/node_modules/playwright';
const {chromium}=require(PW);
const FILE=process.argv[2];
if(!FILE){ console.error('usage: probe_worldreset.js <file.html>'); process.exit(2); }

let pass=0,fail=0;
const ck=(n,c,x)=>{ if(c){pass++;console.log('ok   - '+n+(x?'   ('+x+')':''));}
                    else{fail++;console.log('FAIL - '+n+(x?'   ('+x+')':''));} };

function png(w,h){const raw=Buffer.alloc((w*3+1)*h);
  for(let y=0;y<h;y++){raw[y*(w*3+1)]=0;for(let x=0;x<w;x++){const v=Math.floor(128+100*Math.sin(x/7)*Math.cos(y/5));
    const o=y*(w*3+1)+1+x*3;raw[o]=v;raw[o+1]=v;raw[o+2]=v;}}
  const ck2=(t,d)=>{const L=Buffer.alloc(4);L.writeUInt32BE(d.length);const td=Buffer.concat([Buffer.from(t),d]);
    const c=Buffer.alloc(4);c.writeUInt32BE(zlib.crc32(td)>>>0);return Buffer.concat([L,td,c]);};
  const ih=Buffer.alloc(13);ih.writeUInt32BE(w,0);ih.writeUInt32BE(h,4);ih[8]=8;ih[9]=2;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),ck2('IHDR',ih),ck2('IDAT',zlib.deflateSync(raw)),ck2('IEND',Buffer.alloc(0))]);}

(async()=>{
  const img=path.join(fs.mkdtempSync(path.join(os.tmpdir(),'cw-')),'hm.png');
  fs.writeFileSync(img,png(64,40));
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium',args:['--no-sandbox']});
  const pg=await b.newPage({viewport:{width:1400,height:900}});
  pg.on('pageerror',e=>{fail++;console.log('FAIL - uncaught page error: '+e.message);});
  await pg.goto('file://'+path.resolve(FILE));
  await pg.waitForFunction(()=>typeof generate==='function',{timeout:120000});

  await pg.evaluate(()=>{
    window.__fresh=async()=>{ state.world=false; state.tect.seed=12345; state.resW=512; GW=512; GH=gridH(512);
      state.finalized=false; allocate(); await generate(); syncUI(); renderNow(); if(typeof _setupHide==='function')_setupHide(); };
    window.__dirty=()=>{ setFinalized(true);
      state.places=[{x:10,y:10,name:'GHOST',kind:'city',pop:9999,faction:0}];
      civWays=[{type:'road',pts:[[1,1],[2,2]]}]; civJourneys=[{name:'GJ',pts:[[1,1],[2,2]]}];
      civTerritory=new Int32Array(GW*GH).fill(1); civProvince=new Int32Array(GW*GH).fill(1); _civTerrGen++;
      state.labels=[{x:5,y:5,text:'GL'}]; state.mapIcons=[{x:6,y:6,kind:'mountain'}];
      paintBiome=new Uint8Array(GW*GH).fill(3); paintTerrain=new Uint8Array(GW*GH).fill(2);
      regionSel={x:1,y:1,w:9,h:9}; state.region={x:1,y:1,w:9,h:9};
      sculptStamps=[{feature:'mountains',pts:[{x:3,y:3}]}];
      pushUndo(); pushUndo(); _worldKey='GHOSTKEY'; _atlasBaked.add('ghost');
      if(typeof _setupSkipped!=='undefined') _setupSkipped=true; };
    window.__leaks=()=>{ let f=0; for(let i=0;i<GW*GH;i++) f+=flowField[i];
      return {finalized:!!state.finalized, atlasStale:(_worldKey!==worldKey()), atlasChunks:_atlasBaked.size,
        undo:(typeof undoStack!=='undefined')?undoStack.length:-1, places:state.places.length,
        ways:(typeof civWays!=='undefined')?civWays.length:-1, labels:state.labels.length, icons:state.mapIcons.length,
        paintSized:(paintBiome?paintBiome.length:0), gridCells:GW*GH,
        sculpt:sculptStamps.length, regionSel:!!regionSel, province:!!civProvince,
        setupSkipped:(typeof _setupSkipped!=='undefined')?_setupSkipped:false, flowSum:Math.round(f), GW}; };
  });

  /* ---------- 1. loadImage() — Import heightmap ---------- */
  await pg.evaluate(async()=>{ await window.__fresh(); window.__dirty(); });
  await pg.setInputFiles('#file',img);
  await pg.waitForTimeout(5000);
  const im=await pg.evaluate(()=>window.__leaks());
  ck('loadImage: a fresh heightmap is not locked by the previous world', im.finalized===false);
  ck('loadImage: the previous world\'s baked-atlas association is dropped', !im.atlasStale && im.atlasChunks===0, 'stale='+im.atlasStale+' chunks='+im.atlasChunks);
  ck('loadImage: undo history cleared', im.undo===0, 'depth='+im.undo);
  ck('loadImage: the previous world\'s civ layer is gone', im.places===0&&im.ways===0&&im.labels===0&&im.icons===0, 'places='+im.places+' ways='+im.ways);
  ck('loadImage: paint rasters are not left at the old grid size', im.paintSized===0, 'paintLen='+im.paintSized+' grid='+im.gridCells);
  ck('loadImage: the sculpt draft and region marquee are cleared', im.sculpt===0&&!im.regionSel);
  ck('loadImage: the imported world has hydrology', im.flowSum>0, 'flowSum='+im.flowSum);

  /* ---------- 2. loadZip() ---------- */
  const lz=await pg.evaluate(async()=>{
    await window.__fresh();
    state.places=[{x:40,y:40,name:'KEEPER',kind:'town',pop:500,faction:1}];
    let blob=null; const o=URL.createObjectURL; URL.createObjectURL=x=>{ if(x instanceof Blob&&!blob)blob=x; return o.call(URL,x); };
    try{ await exportZip(); } finally { URL.createObjectURL=o; }
    window.__dirty(); window.alert=()=>{};
    await loadZip(blob); await new Promise(r=>setTimeout(r,2000));
    return Object.assign({names:state.places.map(p=>p.name)}, window.__leaks());
  });
  ck('loadZip: the sculpt draft from the previous world is cleared', lz.sculpt===0, 'stamps='+lz.sculpt);
  ck('loadZip: _setupSkipped cleared — a loaded world satisfies _hasLiveWorld', lz.setupSkipped===false);
  ck('loadZip: the file\'s own civ layer still restores (guard not over-broad)', lz.places===1&&lz.names[0]==='KEEPER', JSON.stringify(lz.names));

  /* ---------- 3. extract as new world ---------- */
  const ex=await pg.evaluate(async()=>{ await window.__fresh(); window.__dirty(); window.confirm=()=>true;
    regionSel={x:Math.floor(GW*0.3),y:Math.floor(GH*0.3),w:Math.floor(GW*0.25),h:Math.floor(GH*0.25)};
    document.getElementById('refSize').value='1024';
    const btn=document.getElementById('regionNewWorldBtn'); btn.disabled=false; btn.click();
    await new Promise(r=>setTimeout(r,8000)); return window.__leaks(); });
  ck('extract: paint rasters no longer left at the OLD grid size', ex.paintSized===0, 'paintLen='+ex.paintSized+' grid='+ex.gridCells);
  ck('extract: sculpt draft and region marquee cleared', ex.sculpt===0&&!ex.regionSel);
  ck('extract: still not finalized, still has hydrology', ex.finalized===false&&ex.flowSum>0, 'flowSum='+ex.flowSum);

  /* ---------- 4. resolution change keeps content in the same PLACE ---------- */
  const rs=await pg.evaluate(async()=>{
    await window.__fresh(); _civIterativeAutoWorld(2);
    state.labels=[{x:Math.round(GW*0.25),y:Math.round(GH*0.25),text:'MARK'}];
    state.mapIcons=[{x:Math.round(GW*0.75),y:Math.round(GH*0.5),kind:'mountain'}];
    _civSyncToState(); window.confirm=()=>true;
    const frac=()=>({p:state.places.slice(0,3).map(p=>[+(p.x/GW).toFixed(3),+(p.y/GH).toFixed(3)]),
      l:[+(state.labels[0].x/GW).toFixed(3),+(state.labels[0].y/GH).toFixed(3)],
      i:[+(state.mapIcons[0].x/GW).toFixed(3),+(state.mapIcons[0].y/GH).toFixed(3)],
      places:state.places.length, ways:civWays.length, GW});
    const before=frac();
    const btn=document.querySelector('#resSeg button[data-w="1024"]'); btn.disabled=false; btn.click();
    await new Promise(r=>setTimeout(r,16000));
    return {before, after:frac()};
  });
  const same=(a,b)=>Math.abs(a-b)<0.01;
  ck('resolution change: the grid really changed', rs.after.GW!==rs.before.GW, rs.before.GW+' -> '+rs.after.GW);
  ck('resolution change: settlements stay in the same place on the map',
     rs.after.p.length===rs.before.p.length && rs.before.p.every((q,i)=>same(q[0],rs.after.p[i][0])&&same(q[1],rs.after.p[i][1])),
     JSON.stringify(rs.before.p[0])+' -> '+JSON.stringify(rs.after.p[0]));
  ck('resolution change: no settlements lost', rs.after.places===rs.before.places, rs.before.places+' -> '+rs.after.places);
  ck('resolution change: roads survive', rs.after.ways===rs.before.ways && rs.after.ways>0, rs.before.ways+' -> '+rs.after.ways);
  ck('resolution change: the label stays put', same(rs.before.l[0],rs.after.l[0])&&same(rs.before.l[1],rs.after.l[1]), JSON.stringify(rs.before.l)+' -> '+JSON.stringify(rs.after.l));
  ck('resolution change: the icon stays put', same(rs.before.i[0],rs.after.i[0])&&same(rs.before.i[1],rs.after.i[1]), JSON.stringify(rs.before.i)+' -> '+JSON.stringify(rs.after.i));

  /* ---------- 6. a resolution/extent change carries the per-cell RASTERS too (v2.45) ----------
     v2.44 rescaled the vectors and let the rasters go, calling it recoverable from "Recalculate
     Territories". Measured, it was wider than that: 96 659 cells of painted territory and BOTH
     timeline years went to zero, and every faction's culture/religion/government/ag-tech silently
     reverted to its default — ag-tech drives foodSurplusRatio since v1.54, so that one moves the
     model, not just the label. */
  const rr=await pg.evaluate(async()=>{
    await window.__fresh(); _civIterativeAutoWorld(2); _civAutoPolity();
    civFactionCulture[1]='maritime'; civFactionReligion[1]='sunCult';
    civFactionGovernment[1]='republic'; civFactionAgTech[1]='earlyIndustrial';
    civAddYear(100); civAddYear(300); civGotoYear(100); _civSyncToState();
    window.confirm=()=>true;
    const st=()=>{ const t=civTerritory; let n=0,sx=0,sy=0;
      if(t) for(let i=0;i<t.length;i++) if(t[i]){ n++; sx+=(i%GW)/GW; sy+=Math.floor(i/GW)/GH; }
      const tl=civTimeline.map(s=>{ const d=s.territory||s.data||[]; let m=0,c=0;
        for(let k=0;k<d.length;k+=2){ c++; if(d[k]>m)m=d[k]; }
        return {year:s.year, cells:c, frac:+(c/(GW*GH)).toFixed(4), maxIdx:m, inRange:m<GW*GH,
                p0:(s.places&&s.places[0])?[+(s.places[0].x/GW).toFixed(3),+(s.places[0].y/GH).toFixed(3)]:null}; });
      return {GW, cells:GW*GH, terr:n, frac:+(n/(GW*GH)).toFixed(4),
              cx:n?+(sx/n).toFixed(4):null, cy:n?+(sy/n).toFixed(4):null, tl,
              meta:[civFactionCulture[1],civFactionReligion[1],civFactionGovernment[1],civFactionAgTech[1]].join('/'),
              year:civYear}; };
    const before=st();
    const btn=document.querySelector('#resSeg button[data-w="1024"]'); btn.disabled=false; btn.click();
    await new Promise(r=>setTimeout(r,20000));
    return {before, after:st()};
  });
  ck('raster fixture: the world really has painted territory and two timeline years',
     rr.before.terr>0 && rr.before.tl.length===2, 'cells='+rr.before.terr+' years='+rr.before.tl.length);
  ck('resolution change: painted territory survives', rr.after.terr>0, rr.before.terr+' -> '+rr.after.terr);
  ck('resolution change: territory covers the same share of the map',
     Math.abs(rr.after.frac-rr.before.frac)<0.01, rr.before.frac+' -> '+rr.after.frac);
  ck('resolution change: territory is in the same PLACE, not merely the same size',
     rr.after.cx!=null && Math.abs(rr.after.cx-rr.before.cx)<0.01 && Math.abs(rr.after.cy-rr.before.cy)<0.01,
     JSON.stringify([rr.before.cx,rr.before.cy])+' -> '+JSON.stringify([rr.after.cx,rr.after.cy]));
  /* A copied index list would still be in range on a LARGER grid, so range alone proves nothing —
     the indices must have grown with the grid. Both are asserted. */
  ck('resolution change: territory indices are re-keyed to the new grid, not copied',
     rr.after.tl.length===rr.before.tl.length && rr.after.tl.every(e=>e.inRange)
       && rr.after.tl.every((e,i)=>e.maxIdx>rr.before.tl[i].maxIdx),
     JSON.stringify(rr.before.tl.map(e=>e.maxIdx))+' -> '+JSON.stringify(rr.after.tl.map(e=>e.maxIdx))+' of '+rr.after.cells);
  ck('resolution change: every timeline year survives with its own raster',
     rr.after.tl.length===rr.before.tl.length && rr.after.tl.every(e=>e.cells>0)
       && rr.after.tl.every((e,i)=>Math.abs(e.frac-rr.before.tl[i].frac)<0.01),
     JSON.stringify(rr.before.tl.map(e=>e.year+':'+e.cells))+' -> '+JSON.stringify(rr.after.tl.map(e=>e.year+':'+e.cells)));
  ck('resolution change: a timeline year\'s own settlements stay in the same place',
     rr.after.tl.length===rr.before.tl.length && rr.after.tl.every((e,i)=>e.p0 && rr.before.tl[i].p0
       && Math.abs(e.p0[0]-rr.before.tl[i].p0[0])<0.01 && Math.abs(e.p0[1]-rr.before.tl[i].p0[1])<0.01),
     JSON.stringify(rr.before.tl[0]&&rr.before.tl[0].p0)+' -> '+JSON.stringify(rr.after.tl[0]&&rr.after.tl[0].p0));
  ck('resolution change: faction culture/religion/government/ag-tech are not reset to defaults',
     rr.after.meta===rr.before.meta, rr.before.meta+' -> '+rr.after.meta);
  ck('resolution change: the timeline year cursor survives', rr.after.year===rr.before.year,
     rr.before.year+' -> '+rr.after.year);

  /* A journey's planned rest days are keyed by _jpStopKey, which embeds the settlement's GRID
     coordinates — so rescaling the settlement detaches every layover from its stop. The stop is
     still on the route and the day count is still stored; only the join is gone, which is why it
     reads as nothing at all rather than as an error. */
  const lv=await pg.evaluate(async()=>{
    await window.__fresh(); _civIterativeAutoWorld(2);
    const w=civWays.find(x=>!x.sea&&x.pts&&x.pts.length>8);
    if(!w) return {err:'no land way long enough'};
    const pts=w.pts.map(q=>Array.isArray(q)?[q[0],q[1]]:[q.x,q.y]);
    const jn={name:'TESTRUN',pts,km:100,layovers:{}}; civJourneys.push(jn);
    const stops=_civPassedSettlements(pts); if(!stops.length) return {err:'no stops on this way'};
    jn.layovers[_jpStopKey(stops[0])]=3; _civSyncToState();
    const probe=()=>{ const j=civJourneys.find(x=>x.name==='TESTRUN'); if(!j) return {gone:true};
      const keys=_civPassedSettlements(j.pts).map(s=>_jpStopKey(s));
      const matched=Object.keys(j.layovers||{}).filter(k=>keys.includes(k));
      return {stops:keys.length, stored:Object.keys(j.layovers||{}).length,
              matched:matched.length, days:matched.map(k=>j.layovers[k])}; };
    const before=probe(); window.confirm=()=>true;
    const btn=document.querySelector('#resSeg button[data-w="1024"]'); btn.disabled=false; btn.click();
    await new Promise(r=>setTimeout(r,20000));
    return {before, after:probe()};
  });
  ck('layover fixture: a journey really has a rest day attached to a passed settlement',
     !lv.err && lv.before && lv.before.matched===1 && lv.before.days[0]===3, lv.err||JSON.stringify(lv.before));
  ck('resolution change: a journey\'s planned rest days stay attached to their stop',
     !lv.err && lv.after && lv.after.stops>0 && lv.after.matched===lv.before.matched
       && String(lv.after.days)===String(lv.before.days),
     lv.err||('stops='+(lv.after&&lv.after.stops)+' stored='+(lv.after&&lv.after.stored)
              +' matched='+(lv.after&&lv.after.matched)+' days='+(lv.after&&lv.after.days)));

  /* An extent switch also changes the ASPECT, so the cell COUNT must move and the map FRACTION
     must not — that is what makes per-axis scaling the right treatment rather than one factor. */
  const rx=await pg.evaluate(async()=>{
    await window.__fresh(); _civIterativeAutoWorld(2); _civAutoPolity(); _civSyncToState();
    window.confirm=()=>true;
    const st=()=>{ const t=civTerritory; let n=0,sx=0,sy=0;
      if(t) for(let i=0;i<t.length;i++) if(t[i]){ n++; sx+=(i%GW)/GW; sy+=Math.floor(i/GW)/GH; }
      return {GH, cells:GW*GH, terr:n, frac:+(n/(GW*GH)).toFixed(4),
              cx:n?+(sx/n).toFixed(4):null, cy:n?+(sy/n).toFixed(4):null}; };
    const before=st();
    const btn=document.querySelector('#extentSeg button[data-world="1"]'); btn.disabled=false; btn.click();
    await new Promise(r=>setTimeout(r,20000));
    return {before, after:st()};
  });
  ck('extent change: the aspect really changed', rx.after.GH!==rx.before.GH, rx.before.GH+' -> '+rx.after.GH);
  ck('extent change: territory keeps its share of the map across the aspect change',
     rx.after.terr>0 && Math.abs(rx.after.frac-rx.before.frac)<0.01,
     rx.before.frac+' ('+rx.before.terr+' cells) -> '+rx.after.frac+' ('+rx.after.terr+' cells)');
  ck('extent change: territory keeps its fractional position on both axes',
     rx.after.cx!=null && Math.abs(rx.after.cx-rx.before.cx)<0.01 && Math.abs(rx.after.cy-rx.before.cy)<0.01,
     JSON.stringify([rx.before.cx,rx.before.cy])+' -> '+JSON.stringify([rx.after.cx,rx.after.cy]));

  /* ---------- 5. generate() ---------- */
  const gn=await pg.evaluate(async()=>{ await window.__fresh(); window.__dirty(); state.finalized=false; applyFinalizedUI();
    await generate(); return window.__leaks(); });
  ck('generate: the stale province raster is cleared with its territory', gn.province===false);
  ck('generate: the previous world\'s region marquee is cleared', gn.regionSel===false);

  await b.close();
  console.log('\n'+pass+' passed, '+fail+' failed');
  process.exit(fail?1:0);
})().catch(e=>{console.error(e);process.exit(1);});
