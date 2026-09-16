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

  /* ---------- 5. generate() ---------- */
  const gn=await pg.evaluate(async()=>{ await window.__fresh(); window.__dirty(); state.finalized=false; applyFinalizedUI();
    await generate(); return window.__leaks(); });
  ck('generate: the stale province raster is cleared with its territory', gn.province===false);
  ck('generate: the previous world\'s region marquee is cleared', gn.regionSel===false);

  await b.close();
  console.log('\n'+pass+' passed, '+fail+' failed');
  process.exit(fail?1:0);
})().catch(e=>{console.error(e);process.exit(1);});
