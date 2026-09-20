#!/usr/bin/env node
/* v2.63 — the Settlements screen: three scopes, one window, and a knob that DOES something.
 *
 * Owner: "As with the asset manager id like a window/screen were I can modify settlement
 * parameters, global per faction but also per individual settlement." Two of the three scopes
 * already existed and were scattered (a map-anchored popup, a pop-up roster); the GLOBAL scope
 * had no control anywhere — seven constants, each declared once and hardcoded.
 *
 * What this asserts, and why each one is here rather than a cheaper cousin:
 *   - the header control is REACHABLE — a real page.mouse click has to land on it (v2.46's
 *     lesson: a DOM query about a hidden button passes while the feature is unusable);
 *   - the defaults REPRODUCE the constants, so an untouched world is bit-identical (hash battery);
 *   - a knob genuinely moves what Auto-populate produces. A screen that stores a number nothing
 *     reads is the v2.42 defect — a control that computes everything and then shows nothing;
 *   - the entity panes call the SAME editors the map popup does, never a second copy (v1.57).
 *
 *   node tests/perf/probe_settleparams.js "Cartalith v2.63 DCC test.html"
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
  await pg.evaluate(async()=>{ state.world=false; state.tect.seed=12345; state.resW=256; GW=256; GH=gridH(256);
    allocate(); await generate(); renderNow(); if(typeof _setupHide==='function')_setupHide(); });

  /* ── 1. defaults are the historical constants, so nothing moves until asked ───────────── */
  const d=await pg.evaluate(()=>({
    n:CIV_PARAM_DEFS.length,
    empty:Object.keys(state.civParams||{}).length,
    allDefault:CIV_PARAM_DEFS.every(p=>civParam(p.key)===p.def),
    seed:civParam('settleSeedThresh'), seedConst:SETTLE_SEED_THRESH,
    vsuit:civParam('villageSuitThresh'), vsuitConst:VILLAGE_SUIT_THRESH,
    vspace:civParam('villageSpacingKm'), vspaceConst:VILLAGE_SPACING_KM,
    vcap:civParam('villageCap'), vcapConst:_CIV_VILLAGE_CAP,
    fmax:civParam('foodSurplusRatioMax'), fmaxConst:FOOD_SURPLUS_RATIO_MAX,
    fmin:civParam('foodShedMinPop'), fminConst:FOOD_SHED_MIN_POP
  }));
  ck('seven knobs, exactly the seven agreed', d.n===7, d.n+' defs');
  ck('state.civParams starts EMPTY — a fresh world is v2.62 by construction', d.empty===0);
  ck('every knob reads its own default when unset', d.allDefault);
  ck('the constants and the table hold ONE number each (no second copy to drift)',
     d.seed===d.seedConst && d.vsuit===d.vsuitConst && d.vspace===d.vspaceConst &&
     d.vcap===d.vcapConst && d.fmax===d.fmaxConst && d.fmin===d.fminConst,
     'seed='+d.seed+' vsuit='+d.vsuit+' vspace='+d.vspace+' vcap='+d.vcap);

  /* ── 2. the header control is REACHABLE, not merely present (v2.46) ───────────────────── */
  const hb=await pg.evaluate(()=>{
    const el=document.getElementById('settlementsHeaderBtn');
    if(!el) return {exists:false};
    const r=el.getBoundingClientRect(), cs=getComputedStyle(el);
    return {exists:true, inHeader:!!el.closest('header'), inModal:!!el.closest('#settingsModal'),
            visible:cs.display!=='none'&&cs.visibility!=='hidden'&&r.width>0&&r.height>0};
  });
  ck('the Settlements button exists', hb.exists);
  ck('it is in the header, not behind the cog (v2.46)', hb.inHeader&&!hb.inModal);
  let landed=true;
  try{ await pg.click('#settlementsHeaderBtn',{timeout:5000}); }
  catch(e){ landed=false; }
  ck('a REAL click lands on it — not just a DOM query passing', landed);
  const open1=await pg.evaluate(()=>({open:_cfmOpen,
    cls:document.getElementById('civFactionsModal').classList.contains('open'),
    pressed:document.getElementById('settlementsHeaderBtn').getAttribute('aria-pressed')}));
  ck('that click opens the screen', open1.open&&open1.cls&&open1.pressed==='true');

  /* ── 3. three panes, and each one switches ───────────────────────────────────────────── */
  const panes=await pg.evaluate(()=>{
    const vis=id=>{const e=document.getElementById(id);return !!e&&getComputedStyle(e).display!=='none';};
    const out={tabs:Array.from(document.querySelectorAll('#civPmBar button[data-pm]')).map(b=>b.dataset.pm)};
    out.startFactions=vis('civPmFactions')&&!vis('civPmGlobal')&&!vis('civPmPlaces');
    _civPmSetTab('global');  out.global=vis('civPmGlobal')&&!vis('civPmFactions');
    _civPmSetTab('places');  out.places=vis('civPmPlaces')&&!vis('civPmGlobal');
    _civPmSetTab('factions');out.back=vis('civPmFactions')&&!vis('civPmPlaces');
    return out;
  });
  ck('three panes: global, factions, settlements',
     panes.tabs.join(',')==='global,factions,places', panes.tabs.join(','));
  ck('it opens on Factions — v1.57\'s pane, unmoved', panes.startFactions);
  ck('every pane switches and hides its siblings', panes.global&&panes.places&&panes.back);

  /* ── 4. the Global pane is BUILT from the table, and a drag writes state ──────────────── */
  const g=await pg.evaluate(()=>{
    _civPmSetTab('global');
    const rows=CIV_PARAM_DEFS.map(p=>!!document.getElementById('_pm_'+p.key));
    const el=document.getElementById('_pm_settleSeedThresh');
    el.value='0.30'; el.dispatchEvent(new Event('input',{bubbles:true}));
    const after={stored:state.civParams.settleSeedThresh, live:civParam('settleSeedThresh'),
                 readout:document.getElementById('_pmv_settleSeedThresh').textContent};
    document.querySelector('[data-pmreset="settleSeedThresh"]').click();
    after.reset=state.civParams.settleSeedThresh===undefined && civParam('settleSeedThresh')===SETTLE_SEED_THRESH;
    return {rows:rows.every(Boolean), rowCount:rows.filter(Boolean).length, ...after};
  });
  ck('one row per knob, generated from CIV_PARAM_DEFS', g.rows, g.rowCount+'/7 rows');
  ck('a drag stores the value and the live read follows', g.stored===0.3&&g.live===0.3,
     'stored='+g.stored+' live='+g.live);
  ck('the readout shows the new value', g.readout==='0.30', g.readout);
  ck('reset removes the override and the default comes back', g.reset);

  /* ── 5. THE POINT: a knob changes what Auto-populate produces ─────────────────────────── */
  const eff=await pg.evaluate(()=>{
    const suit=currentSettlementSuitability();
    const n=t=>{ state.civParams.settleSeedThresh=t;
                 return findSettlementSeeds(suit,GW,GH,{thresh:civParam('settleSeedThresh')}).length; };
    const low=n(0.30), def=n(SETTLE_SEED_THRESH), high=n(0.60);
    delete state.civParams.settleSeedThresh;
    const restored=findSettlementSeeds(suit,GW,GH,{thresh:civParam('settleSeedThresh')}).length;
    return {low,def,high,restored};
  });
  ck('lowering the threshold seeds MORE settlements', eff.low>eff.def,
     eff.low+' at 0.30 vs '+eff.def+' at the default');
  ck('raising it seeds FEWER', eff.high<eff.def, eff.high+' at 0.60');
  ck('clearing the override restores the default answer exactly', eff.restored===eff.def);

  /* ── 6. the food knob reaches the food-shed model, both ag-tech branches ──────────────── */
  const food=await pg.evaluate(()=>{
    const ref=0.5;
    const at=(m,R)=>{ if(m==null) delete state.civParams.foodSurplusRatioMax;
                      else state.civParams.foodSurplusRatioMax=m;
                      return foodSurplusRatio(1.0,ref,R); };
    const baseDef=at(null,FARMERS_PER_URBANITE), baseHi=at(0.70,FARMERS_PER_URBANITE);
    const midDef=at(null,6), midHi=at(0.70,6);
    const indDef=at(null,1.0), indHi=at(0.70,1.0);
    delete state.civParams.foodSurplusRatioMax;
    return {baseDef,baseHi,midDef,midHi,indDef,indHi};
  });
  ck('raising the surplus ceiling lifts a traditional faction', food.baseHi>food.baseDef,
     food.baseDef.toFixed(3)+' -> '+food.baseHi.toFixed(3));
  /* Both branches read the live ceiling, so a mid-tier faction moves too — which is what
     rules out the first cut, where only the isDefault branch scaled and the two disagreed. */
  ck('…and a mid-tier one, so the two ag-tech branches agree', food.midHi>food.midDef,
     food.midDef.toFixed(3)+' -> '+food.midHi.toFixed(3));
  /* And it is correctly INERT where the ceiling is not the binding constraint — an industrial
     faction's yield already sits below it, so a higher cap changes nothing. Asserting this
     stops a future "make the knob always do something" from quietly inventing surplus. */
  ck('…and inert for an industrial faction already under the ceiling',
     food.indHi===food.indDef, food.indDef.toFixed(3)+' unchanged');

  /* ── 7. the entity panes reuse the existing editors (v1.57), never a second copy ──────── */
  const ent=await pg.evaluate(async()=>{
    if(typeof _civAutoWorld==='function') _civAutoWorld();
    _civPmSetTab('places');
    const rows=document.querySelectorAll('#_pmList [data-pmp]').length;
    if(rows) document.querySelector('#_pmList [data-pmp]').click();
    const nameEl=document.getElementById('_civPeName');
    let edited=false;
    if(nameEl){ nameEl.value='Probeton'; nameEl.dispatchEvent(new Event('input',{bubbles:true}));
                edited=_civPmPlaceSel&&_civPmPlaceSel.name==='Probeton'; }
    _civPmSetTab('factions');
    if(typeof _civRenderFactionInspector==='function'){ _civSelectedFaction=1; _civRenderFactionInspector(); }
    return {rows, inspector:!!nameEl, edited,
            facFields:['_civFeName','_civFeGov','_civFeCul','_civFeRel','_civFeAgTech']
                        .filter(id=>document.getElementById(id)).length};
  });
  ck('the Settlements pane lists real settlements', ent.rows>0, ent.rows+' rows');
  ck('picking one opens the SAME editor the map popup uses', ent.inspector);
  ck('editing there writes straight through to the settlement', ent.edited);

  /* ── 8. the parameter dump carries them (v2.54's list rides along) ────────────────────── */
  const dump=await pg.evaluate(()=>{
    state.civParams.villageCap=42;
    const txt=generationInfoText();
    const ref=JSON.parse(JSON.stringify(state));
    const parsed=parseGenerationInfo(txt,ref);
    delete state.civParams.villageCap;
    return {listed:GEN_PARAM_BLOCKS.indexOf('civParams')>=0,
            inText:txt.indexOf('villageCap')>=0,
            readBack:parsed&&parsed.values&&parsed.values.civParams?parsed.values.civParams.villageCap:null};
  });
  ck('civParams is in GEN_PARAM_BLOCKS', dump.listed);
  ck('an override is written into the dump', dump.inText);
  ck('…and reads back out of it', dump.readBack===42, 'read '+dump.readBack);

  /* ── 9. closing. The screen is position:fixed;inset:0, so it COVERS the header button —
     the way out is the modal's own x and Escape (v1.57's shell contract), and the header
     button is the way IN. That is not v2.46's split-control defect: v2.46 was about a way in
     that no click could reach, and this one is asserted reachable above. What must hold is
     that the button's pressed state tracks the screen, so it never lies about being open. ── */
  /* Auto-populate in step 7 closed the screen on its own — _civRefreshActiveSubPage's factions
     branch resets the modal unconditionally (v1.96/v1.57). Re-open it rather than assume. */
  await pg.evaluate(()=>{ if(!_cfmOpen) _civOpenFactionsModal(); });
  const covered=await pg.evaluate(()=>{
    const r=document.getElementById('settlementsHeaderBtn').getBoundingClientRect();
    const top=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);
    return !!(top&&top.closest('#civFactionsModal'));
  });
  ck('the open screen covers the header, so x/Escape are the way out', covered);
  await pg.click('#cfmCloseBtn');
  const shut=await pg.evaluate(()=>({open:_cfmOpen,
    pressed:document.getElementById('settlementsHeaderBtn').getAttribute('aria-pressed')}));
  ck('x closes it and the header button stops claiming it is open',
     !shut.open&&shut.pressed==='false');
  await pg.click('#settlementsHeaderBtn');
  await pg.keyboard.press('Escape');
  const esc=await pg.evaluate(()=>({open:_cfmOpen,
    pressed:document.getElementById('settlementsHeaderBtn').getAttribute('aria-pressed')}));
  ck('Escape closes it too, and the button agrees', !esc.open&&esc.pressed==='false');

  console.log('\n'+pass+' passed, '+fail+' failed');
  await b.close();
  process.exit(fail?1:0);
})();
