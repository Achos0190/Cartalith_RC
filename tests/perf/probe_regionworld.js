#!/usr/bin/env node
/* v2.43 — "Extract as new world" builds a NEW world, so it must not inherit the old one's state;
 * and the flat project reader must refuse a heightmap-less archive the way the tree reader already does.
 *
 * Owner report: a region exported as a new map cannot have its terrain modified, cannot have its
 * generation settings changed, and has no layers. All three are one signature — `state.finalized`
 * true — and this handler was the one world-construction path that never cleared it.
 *
 *   node tests/perf/probe_regionworld.js "Cartalith v2.43 DCC test.html"
 */
const path=require('path');
const PW=process.env.PLAYWRIGHT_DIR||'/opt/node22/lib/node_modules/playwright';
const {chromium}=require(PW);
const FILE=process.argv[2];
if(!FILE){ console.error('usage: probe_regionworld.js <file.html>'); process.exit(2); }

let pass=0, fail=0;
const ck=(n,c,x)=>{ if(c){pass++; console.log('ok   - '+n+(x?'   ('+x+')':''));}
                    else{fail++; console.log('FAIL - '+n+(x?'   ('+x+')':''));} };

(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium',args:['--no-sandbox']});
  const pg=await b.newPage({viewport:{width:1400,height:900}});
  pg.on('pageerror',e=>{ fail++; console.log('FAIL - uncaught page error: '+e.message); });
  await pg.goto('file://'+path.resolve(FILE));
  await pg.waitForFunction(()=>typeof generate==='function',{timeout:120000});

  await pg.evaluate(()=>{
    window.__snap=()=>{ const lock=[...document.querySelectorAll('[data-genlock]')];
      let flowSum=0; for(let i=0;i<GW*GH;i++) flowSum+=flowField[i];
      return {GW,GH,kmWide:+state.mapWidthKm.toFixed(1),flowSum:Math.round(flowSum),
        finalized:!!state.finalized, lockedN:lock.filter(e=>e.disabled).length, lockTotal:lock.length,
        layers:document.querySelectorAll('#layersList .lp-item').length,
        undoDepth:(typeof undoStack!=='undefined')?undoStack.length:-1,
        wk:worldKey(), wkTracked:(typeof _worldKey!=='undefined')?_worldKey:null}; };
    window.__extract=async(frac)=>{ window.confirm=()=>true;
      regionSel={x:Math.floor(GW*0.30),y:Math.floor(GH*0.30),w:Math.floor(GW*frac),h:Math.floor(GH*frac)};
      document.getElementById('refSize').value='1024';
      const btn=document.getElementById('regionNewWorldBtn'); btn.disabled=false; btn.click();
      await new Promise(r=>setTimeout(r,6000)); return window.__snap(); };
  });

  const mk=()=>pg.evaluate(async()=>{ state.world=false; state.tect.seed=12345; state.resW=512; GW=512; GH=gridH(512);
    allocate(); await generate(); syncUI(); renderNow(); if(typeof _setupHide==='function')_setupHide(); return window.__snap(); });

  /* ---- fixture: the finalized signature is what the report describes ---- */
  const base=await mk();
  const fin=await pg.evaluate(()=>{ setFinalized(true); return window.__snap(); });
  ck('fixture: a deliberately finalized world locks every generation control', fin.lockedN===fin.lockTotal, fin.lockedN+'/'+fin.lockTotal);
  ck('fixture: ...and cuts the Layers popover to the Explore subset', fin.layers>0 && fin.layers<base.layers, fin.layers+' of '+base.layers);

  /* ---- 1. extract from that finalized parent ---- */
  const ex=await pg.evaluate(()=>window.__extract(0.25));
  ck('extract: the NEW world is not finalized', ex.finalized===false);
  ck('extract: terrain + generation controls are live again', ex.lockedN<=1, ex.lockedN+'/'+ex.lockTotal+' disabled');
  ck('extract: every layer is available again', ex.layers===base.layers, ex.layers+' of '+base.layers);
  ck('extract: the world has hydrology immediately, before any calibrate commit', ex.flowSum>0, 'flowSum='+ex.flowSum);
  ck('extract: real-km width scales with the region', Math.abs(ex.kmWide-base.kmWide*0.25)<1, ex.kmWide+' km from '+base.kmWide);
  ck('extract: resolution really changed', ex.GW!==base.GW, base.GW+' -> '+ex.GW);
  ck('extract: the stale parent atlas is retired (worldKey tracked)', ex.wk!==fin.wk && ex.wkTracked===ex.wk);
  ck('extract: undo history cleared across the resolution change', ex.undoDepth===0, 'depth='+ex.undoDepth);

  /* ---- 2. the extracted world is a working world ---- */
  ck('extract: generate() is no longer refused', await pg.evaluate(async()=>{
    const w=[]; const ow=console.warn; console.warn=(...a)=>{w.push(a.join(' '));ow(...a);};
    let s=0; for(let i=0;i<GW*GH;i++) s+=field[i];
    await generate();
    let t=0; for(let i=0;i<GW*GH;i++) t+=field[i];
    console.warn=ow; return s!==t && !w.some(x=>/world is finalized/.test(x));
  }));

  /* ---- 3. its export carries a rendered map ---- */
  const exp=await pg.evaluate(async()=>{
    await window.__extract(0.25);
    let blob=null; const orig=URL.createObjectURL;
    URL.createObjectURL=o=>{ if(o instanceof Blob&&!blob) blob=o; return orig.call(URL,o); };
    try{ await exportZip(); } finally { URL.createObjectURL=orig; }
    if(!blob) return {err:'no blob'};
    const u8=new Uint8Array(await blob.arrayBuffer()), dv=new DataView(u8.buffer), names=[];
    for(let i=0;i+30<u8.length;i++) if(dv.getUint32(i,true)===0x04034b50){
      const nl=dv.getUint16(i+26,true); names.push(new TextDecoder().decode(u8.subarray(i+30,i+30+nl))); }
    window.__projZip=blob;
    return {mb:+(blob.size/1048576).toFixed(1), map:names.some(n=>/map\.png$/.test(n)),
            tiles:names.some(n=>/^tiles\//.test(n)), hm:names.some(n=>/heightmap\.f32$/.test(n))};
  });
  ck('export: the extracted world\'s .zip carries a rendered map', exp.map||exp.tiles, 'map.png='+exp.map+' tiles='+exp.tiles+' '+exp.mb+'MB');
  ck('export: ...and its heightmap', exp.hm===true);

  /* ---- 4. the flat reader refuses a heightmap-less archive ---- */
  const reg=await pg.evaluate(async()=>{
    let blob=null; const orig=URL.createObjectURL;
    URL.createObjectURL=o=>{ if(o instanceof Blob&&!blob) blob=o; return orig.call(URL,o); };
    regionSel={x:10,y:10,w:Math.floor(GW*0.25),h:Math.floor(GH*0.25)};
    document.getElementById('refCols').value='1'; document.getElementById('refRows').value='1';
    document.getElementById('refSize').value='1024';
    const btn=document.getElementById('refineBtn'); btn.disabled=false; btn.click();
    for(let i=0;i<180 && !blob;i++) await new Promise(r=>setTimeout(r,500));
    URL.createObjectURL=orig;
    if(!blob) return {err:'region export produced no zip'};
    let before=0; for(let i=0;i<GW*GH;i++) before+=field[i];
    let alerted=null; window.alert=m=>{alerted=m;};
    await loadZip(blob);
    let after=0; for(let i=0;i<GW*GH;i++) after+=field[i];
    let land=0; for(let i=0;i<GW*GH;i++) if(field[i]>=state.seaLevel) land++;
    return {alerted, fieldUnchanged:before===after, landFrac:+(land/(GW*GH)).toFixed(4)};
  });
  ck('region zip: loading it as a project is refused, not silently accepted', !!reg.alerted && /no heightmap/i.test(reg.alerted||''), JSON.stringify((reg.alerted||'').slice(0,60)));
  ck('region zip: the refusal names Region export so the user knows which file it is', /region/i.test(reg.alerted||''));
  ck('region zip: the world on screen is untouched by the refusal', reg.fieldUnchanged===true);
  ck('region zip: ...so the map is NOT blanked to all-ocean', reg.landFrac>0.05, 'landFrac='+reg.landFrac);

  /* ---- 5. the guard is not over-broad: a real project still loads ---- */
  const rt=await pg.evaluate(async()=>{
    let alerted=null; window.alert=m=>{alerted=m;};
    await loadZip(window.__projZip);
    await new Promise(r=>setTimeout(r,1500));
    let land=0; for(let i=0;i<GW*GH;i++) if(field[i]>=state.seaLevel) land++;
    return {alerted, landFrac:+(land/(GW*GH)).toFixed(4), finalized:!!state.finalized, GW};
  });
  ck('a real project .zip still loads cleanly', !rt.alerted, rt.alerted?String(rt.alerted).slice(0,70):'no alert');
  ck('...with real terrain', rt.landFrac>0.05, 'landFrac='+rt.landFrac);
  ck('...and is not locked', rt.finalized===false);

  await b.close();
  console.log('\n'+pass+' passed, '+fail+' failed');
  process.exit(fail?1:0);
})().catch(e=>{ console.error(e); process.exit(1); });
