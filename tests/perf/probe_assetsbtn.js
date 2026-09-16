#!/usr/bin/env node
/* v2.46 — the Asset Library toggle must be a visible, one-click header control, in and out.
 *
 * Owner: "it seems the button for the asset manager has gone." It had not — v2.24 filed the Library
 * under "program scope" and moved the toggle into the cog's Settings window, which left it in the
 * DOM but never visible, so a real click cannot reach it at all. That is what the fourth assertion
 * measures: not a class name, a genuine page.mouse click landing on the control.
 *
 *   node tests/perf/probe_assetsbtn.js "Cartalith v2.46 DCC test.html"
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

  const st=async()=>pg.evaluate(()=>{
    const ab=document.getElementById('assetsHeaderBtn');
    const inHeader=!!(ab&&ab.closest('header'));
    const inModal=!!(ab&&ab.closest('#settingsModal'));
    const cs=ab?getComputedStyle(ab):null;
    const r=ab?ab.getBoundingClientRect():{width:0,height:0};
    return {exists:!!ab, inHeader, inModal, label:ab?ab.textContent.trim():null,
            on:!!(ab&&ab.classList.contains('on')), pressed:ab?ab.getAttribute('aria-pressed'):null,
            visible:!!(cs&&cs.display!=='none'&&cs.visibility!=='hidden'&&r.width>0&&r.height>0),
            w:Math.round(r.width), h:Math.round(r.height),
            assetsMode:document.body.classList.contains('assets-mode'),
            libVisible:(()=>{const al=document.getElementById('assetLibrary');
              if(!al) return false; const c=getComputedStyle(al); return c.display!=='none';})(),
            backBtn:!!document.getElementById('assetsBackBtn'),
            cogOpen:!!(document.getElementById('settingsModal')||{classList:{contains:()=>false}}).classList.contains('open')};
  });

  const a=await st();
  ck('the Assets button exists', a.exists);
  ck('it is in the header, not buried in the cog window', a.inHeader && !a.inModal, 'header='+a.inHeader+' modal='+a.inModal);
  ck('it is visible and clickable without opening anything first', a.visible, a.w+'x'+a.h);
  ck('it reads "Assets" while the map is showing', /Assets/.test(a.label||'') && !a.on, JSON.stringify(a.label));
  ck('the separate "back" stand-in is gone (one control, one surface)', !a.backBtn);

  const click=async()=>{ try{ await pg.click('#assetsHeaderBtn',{timeout:4000}); return true; }
                         catch(_){ return false; } };
  const clicked1=await click(); await pg.waitForTimeout(600);
  ck('the button can actually be clicked where it sits', clicked1, clicked1?'':'not visible to a real click');
  const c=await st();
  ck('one click enters the Asset Library', c.assetsMode && c.libVisible, 'mode='+c.assetsMode+' lib='+c.libVisible);
  ck('the same button is still visible in assets mode', c.visible, c.w+'x'+c.h);
  ck('...and now reads "← Map"', /Map/.test(c.label||''), JSON.stringify(c.label));
  ck('...and is marked pressed', c.on && c.pressed==='true', 'on='+c.on+' pressed='+c.pressed);
  ck('the cog window is not left open over the library', !c.cogOpen);

  await click(); await pg.waitForTimeout(600);
  const d=await st();
  ck('clicking it again returns to the map', !d.assetsMode && !d.libVisible, 'mode='+d.assetsMode+' lib='+d.libVisible);
  ck('...and the label goes back', /Assets/.test(d.label||'') && !d.on, JSON.stringify(d.label));
  ck('the map canvas is showing again', await pg.evaluate(()=>{
      const cw=document.querySelector('.canvas-wrap'); return !!cw && getComputedStyle(cw).display!=='none'; }));

  await b.close();
  console.log('\n'+pass+' passed, '+fail+' failed');
  process.exit(fail?1:0);
})().catch(e=>{console.error(e);process.exit(1);});
