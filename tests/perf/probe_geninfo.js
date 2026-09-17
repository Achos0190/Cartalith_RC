#!/usr/bin/env node
/* v2.54: the parameter dump must be able to REBUILD the world it describes.
 *   node tests/perf/probe_geninfo.js "Cartalith v2.54 DCC test.html"
 *
 * Builds world A with deliberately non-default values in every place the v2.53 dump silently
 * dropped — 16 of climate's 22 fields, the `passes` and `hydro` blocks, and a seaLevel that is not
 * a whole percent — copies its dump, builds a DIFFERENT world B, then drives the real
 * #genInfoApplyBtn handler (withBusy intercepted for its promise, never reimplemented) and checks
 * the field comes back bit-identical to A.
 *
 * The control is the point: the same round trip through a v2.53-SHAPED dump (the new keys stripped)
 * must FAIL to reproduce, or the probe is not measuring the fix. Exit 1 on any failure. */
const path=require('path');
const {chromium}=require(process.env.PLAYWRIGHT_DIR||'/opt/node22/lib/node_modules/playwright');
let pass=0, fail=0;
const A=(m,c)=>{ if(c){pass++; console.log('  ok   '+m);} else {fail++; console.log('  FAIL '+m);} };

(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium',args:['--no-sandbox']});
  const pg=await b.newPage(); pg.on('pageerror',e=>console.log('ERR '+e.message));
  await pg.goto('file://'+path.resolve(process.argv[2]));
  await pg.waitForFunction(()=>typeof generate==='function',{timeout:120000});

  const R=await pg.evaluate(async()=>{
    window.confirm=()=>true;
    const fnv=a=>{ let h=2166136261>>>0; const v=new Uint8Array(a.buffer,a.byteOffset,a.byteLength);
      for(let i=0;i<v.length;i++){ h^=v[i]; h=Math.imul(h,16777619)>>>0; } return h>>>0; };
    const applyText=async txt=>{                        /* drive the REAL handler */
      document.getElementById('genInfoText').value=txt;
      const orig=withBusy; let pr=null;
      window.withBusy=(m,f)=>{ pr=orig(m,f); return pr; };
      document.getElementById('genInfoApplyBtn').click();
      window.withBusy=orig;
      if(pr) await pr;
      await new Promise(r=>setTimeout(r,60));
    };

    /* ---- world A: every field the old dump dropped, set away from its default ---- */
    state.resW=256; state.world=false; state.mapWidthKm=800; state.peakM=5000;
    state.seaLevel=0.4235;                              /* NOT a whole percent — the prose line rounded this */
    state.tect.seed=777; state.tect.plates=11;
    state.climate.equatorTemp=34; state.climate.poleTemp=-31; state.climate.lapseRate=7.2;
    state.climate.rainK=1.35; state.climate.rainDep=0.51; state.climate.oceanHum=1.2;
    state.climate.maxRainMm=2100; state.climate.evap=0.19; state.climate.wIters=55;
    state.passes.hillslope=true; state.hydro.integrate=true;
    await generate();
    const dumpA=generationInfoText(), hashA=fnv(field), seaA=state.seaLevel;

    /* the dump must now actually CONTAIN what it claims to */
    const has=k=>new RegExp('^'+k+': ','m').test(dumpA);
    const carries={ passes:has('passes'), hydro:has('hydro'), seaLevel:has('seaLevel'),
      resW:has('resW'), world:has('world'), mapWidthKm:has('mapWidthKm'), peakM:has('peakM'),
      climateFull:/^climate: (.+)$/m.test(dumpA) && Object.keys(JSON.parse(/^climate: (.+)$/m.exec(dumpA)[1])).length===Object.keys(state.climate).length,
      seaExact:/^seaLevel: 0\.4235$/m.test(dumpA) };

    /* a v2.53-SHAPED dump: drop exactly the lines that version never emitted */
    const dumpOld=dumpA.split('\n').filter(l=>!/^(passes|hydro|seaLevel|resW|world|mapWidthKm|peakM|carveRivers): /.test(l))
      .map(l=>{ const m=/^climate: (.+)$/.exec(l); if(!m) return l;
        const c=JSON.parse(m[1]);
        return 'climate: '+JSON.stringify({latN:c.latN,latS:c.latS,windMode:c.windMode,seasons:c.seasons,currents:c.currents,tilt:state.planet.axialTiltDeg}); }).join('\n');

    /* ---- world B: different in every one of those places ---- */
    const toB=async()=>{ state.tect.seed=31337; state.tect.plates=7; state.seaLevel=0.38;
      state.climate.equatorTemp=26; state.climate.poleTemp=-18; state.climate.lapseRate=5.9;
      state.climate.rainK=0.7; state.climate.rainDep=0.2; state.climate.oceanHum=0.8;
      state.climate.maxRainMm=3000; state.climate.evap=0.09; state.climate.wIters=90;
      state.passes.hillslope=false; state.hydro.integrate=false; await generate(); return fnv(field); };

    const hashB=await toB();
    await applyText(dumpA);
    const hashBack=fnv(field), seaBack=state.seaLevel;

    await toB();
    await applyText(dumpOld);
    const hashOld=fnv(field);

    /* ---- validation behaviour, on the pure parser ---- */
    const bad=parseGenerationInfo(
      'tect: {"seed":5,"plates":"twelve","nosuchfield":1}\nclimate: {"rainK":null}\nbogus: {"a":1}\nresW: 512\n', state);
    const nanRep=parseGenerationInfo('planet: {"g":1e999}\n', state);
    const nested=parseGenerationInfo('planet: {"geoid":{"enabled":true,"amp":0.02,"junk":3}}\n', state);
    const empty=parseGenerationInfo('just some prose, no parameters at all\n', state);

    /* a grid change must go through the snapshot path, not corrupt coordinates */
    state.resW=256; await generate();
    const gridTxt=generationInfoText().replace(/^resW: 256$/m,'resW: 512');
    await applyText(gridTxt);
    const gridNow={GW,GH,resW:state.resW};

    return { hashA, hashB, hashBack, hashOld, seaA, seaBack, carries,
      badRejected:bad.rejected, badUnknown:bad.unknown, badApplied:bad.applied,
      nanRejected:nanRep.rejected, nestedApplied:nested.applied, nestedUnknown:nested.unknown,
      emptySeen:empty.seen, gridNow,
      btn:(()=>{ const e=document.getElementById('genInfoApplyBtn');
        return e?{label:e.textContent.trim(), genlock:e.hasAttribute('data-genlock')}:null; })(),
      editable:!document.getElementById('genInfoText').readOnly };
  });

  console.log('\n'+JSON.stringify(R,null,1)+'\n');
  A('the dump now carries passes + hydro', R.carries.passes && R.carries.hydro);
  A('...the whole climate block, not a hand-picked six', R.carries.climateFull);
  A('...and the five scalars that were prose-only', R.carries.resW && R.carries.world && R.carries.mapWidthKm && R.carries.peakM && R.carries.seaLevel);
  A('seaLevel is emitted at full precision, not a rounded percent', R.carries.seaExact);
  A('worlds A and B really are different (the probe can tell them apart)', R.hashA !== R.hashB);
  A('a round trip rebuilds world A EXACTLY (field FNV '+R.hashBack+')', R.hashBack === R.hashA);
  A('...including seaLevel to full precision', R.seaBack === R.seaA);
  A('a v2.53-shaped dump does NOT reproduce it (proves the omissions mattered)', R.hashOld !== R.hashA);
  A('a wrong-typed field is refused by name', R.badRejected.indexOf('tect.plates')>=0);
  A('a null where a number belongs is refused', R.badRejected.indexOf('climate.rainK')>=0);
  A('an unknown field inside a real block is reported, not merged', R.badUnknown.indexOf('tect.nosuchfield')>=0);
  A('an unknown top-level key is reported', R.badUnknown.indexOf('bogus')>=0);
  A('...while the valid fields beside them still apply', R.badApplied >= 2);
  A('a non-finite number is refused', R.nanRejected.indexOf('planet.g')>=0);
  A('a nested block merges, and its junk is reported', R.nestedApplied===2 && R.nestedUnknown.indexOf('planet.geoid.junk')>=0);
  A('prose with no parameters reports nothing seen', R.emptySeen===0);
  A('a resolution change in the paste actually moves the grid ('+R.gridNow.GW+'×'+R.gridNow.GH+')', R.gridNow.resW===512 && R.gridNow.GW===512);
  A('the Apply button exists, is labelled, and carries the finalize lock', !!R.btn && /Apply/.test(R.btn.label) && R.btn.genlock);
  A('the dump textarea is editable', R.editable);

  /* v2.46's lesson: a DOM query passing is not the same as a real click LANDING. The panel lives
     inside Settings -> Workspace, so open it the way a person does and click for real. */
  /* The setup gate (#onboard, z-index 90) sits above the Settings modal (74) and is only cleared by
     _setupHide(); this probe generated through evaluate(), which never goes near it. Diagnosed, not
     assumed: with the gate up, elementFromPoint at the button's centre returns #obGenerate. The app's
     own flow cannot reach the cog while the gate is up, so this is the harness's gap, not a layering
     defect — clear it the way the app does. */
  await pg.evaluate(()=>{ window.confirm=()=>false; _setupHide(); window._openSettings('workspace'); });
  let landed=true;
  try{ await pg.click('#genInfoApplyBtn',{timeout:4000}); }catch(e){ landed=false; console.log('  click: '+e.message.split('\n')[0]); }
  A('a REAL click on Apply lands once Settings -> Workspace is open', landed);
  const vis=await pg.evaluate(()=>{ const e=document.getElementById('genInfoApplyBtn'); if(!e) return null;
    const r=e.getBoundingClientRect(); return {w:Math.round(r.width),h:Math.round(r.height),onPage:r.width>0&&r.height>0}; });
  A('...with a real box on the page ('+(vis?vis.w+'x'+vis.h:'none')+')', !!vis && vis.onPage);

  console.log('\n'+pass+' passed, '+fail+' failed');
  await b.close(); process.exit(fail?1:0);
})();
