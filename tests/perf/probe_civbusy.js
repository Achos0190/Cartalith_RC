/* v2.38 — the long civilisation operations must acknowledge the click.
 *
 * Auto-populate is a synchronous 11-19 s main-thread pass (77% of it roadDijkstra, 326 full-grid
 * runs). Until v2.38 it ran as a bare `onclick=()=>_civAutoWorld()`, so the tab simply froze with
 * no overlay, no disabled button and no cursor change — the owner's "auto populate doesn't seem to
 * work". This probe pins the acknowledgement, NOT the duration: withBusy() does not make anything
 * quicker and must not be read as if it had.
 *
 *   node tests/perf/probe_civbusy.js "Cartalith v2.38 DCC test.html"
 *
 * 11 assertions. On v2.37 the four source-inspection checks and the overlay check fail.
 */
const {chromium}=require(process.env.PLAYWRIGHT_DIR||'/opt/node22/lib/node_modules/playwright');
const F=process.argv[2]||'Cartalith v2.38 DCC test.html';
const SEED=+(process.argv[3]||21811);
let pass=0, fail=0;
const ck=(n,c,extra)=>{ if(c){pass++; console.log('ok   - '+n);} else {fail++; console.log('FAIL - '+n+(extra!==undefined?('  ['+extra+']'):''));} };

(async()=>{
 const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium',args:['--no-sandbox']});
 const p=await b.newPage({viewport:{width:1400,height:900}});
 const errs=[]; p.on('pageerror',e=>errs.push(e.message));
 await p.goto('file:///home/user/Cartalith_RC/'+encodeURIComponent(F),{waitUntil:'load',timeout:180000});

 /* withBusy is declared at top level in block 1; the civ layer is a later script block in the same
    scope, so it is reachable — it simply had zero call sites there before v2.38. */
 ck('withBusy is reachable from the civ layer', await p.evaluate(()=>typeof withBusy)==='function');

 const src=await p.evaluate(()=>{
   const out={};
   [['pop','civAutoPopulateBtn'],['routes','civAutoRoutesBtn'],['polity','civAutoPolityBtn']].forEach(([k,id])=>{
     const e=document.getElementById(id); out[k]=e&&e.onclick?String(e.onclick):null; });
   return out;
 });
 ck('Auto-populate handler is wired',            !!src.pop);
 ck('Auto-populate acknowledges the click',      !!src.pop && /withBusy/.test(src.pop), src.pop);
 ck('Generate-roads acknowledges the click',     !!src.routes && /withBusy/.test(src.routes), src.routes);
 ck('Recalculate-territories acknowledges it',   !!src.polity && /withBusy/.test(src.polity), src.polity);

 await p.evaluate(async(seed)=>{
   if(typeof _setupHide==='function') _setupHide();
   state.tect.seed=seed; state.tect.plates=14; state.tect.warp=0.45;
   state.world=true; state.resW=1024; state.mapWidthKm=20000; state.seaLevel=0.42; state.peakM=8849;
   GW=1024; GH=gridH(GW); allocate(); await generate();
 },SEED);

 await p.click('[data-domain="civ"]',{timeout:20000}); await p.waitForTimeout(300);
 await p.click('[data-civsub="generation"]',{timeout:20000}); await p.waitForTimeout(300);
 const box=await p.evaluate(()=>{const e=document.getElementById('civAutoPopulateBtn');
   const r=e?e.getBoundingClientRect():null; return r?{w:Math.round(r.width),h:Math.round(r.height)}:null;});
 ck('the button is reachable via CIVIL > Generation', !!box && box.w>0 && box.h>0, JSON.stringify(box));

 /* The main thread blocks for the whole pass, so sample through a MutationObserver armed BEFORE the
    click rather than by polling — a poll can miss every window between macrotasks. */
 await p.evaluate(()=>{ window.__seen={vis:false,label:''};
   const el=document.getElementById('busy'); if(!el) return;
   const peek=()=>{ const s=getComputedStyle(el);
     if(s.display!=='none'&&s.visibility!=='hidden'&&!window.__seen.vis){
       window.__seen.vis=true; window.__seen.label=(el.textContent||'').trim(); } };
   window.__peek=peek;
   new MutationObserver(peek).observe(el,{attributes:true,childList:true,subtree:true,characterData:true});
 });

 await p.click('#civAutoPopulateBtn',{timeout:60000});
 for(let i=0;i<40;i++){
   try{ if(await p.evaluate(()=>{window.__peek&&window.__peek();return window.__seen.vis;},{timeout:4000})) break; }
   catch(e){ /* CDP blocked = the pass is running */ }
   await p.waitForTimeout(150);
 }
 await p.waitForFunction(()=>state.places.length>0,{timeout:300000});
 await p.waitForTimeout(1500);

 const fin=await p.evaluate(()=>{ const el=document.getElementById('busy');
   const k={}; state.places.forEach(q=>k[q.kind]=(k[q.kind]||0)+1);
   return {seen:window.__seen, places:state.places.length, kinds:k,
           ways:(typeof civWays!=='undefined')?civWays.length:-1,
           depth:(typeof _busyDepth!=='undefined')?_busyDepth:-1,
           hidden: el? getComputedStyle(el).display==='none' : false };
 });
 ck('the busy overlay is shown while the pass runs', fin.seen.vis, JSON.stringify(fin.seen));
 ck('its label names the operation',                 /populating world/i.test(fin.seen.label||''), fin.seen.label);
 ck('the overlay is hidden again when it finishes',  fin.hidden===true);
 /* v1.24 BUG-3: showBusy/hideBusy must balance, or a later op is owed a hide it never gets. */
 ck('_busyDepth returns to 0',                        fin.depth===0, fin.depth);
 /* The wrap must change WHEN the user learns the click landed, never WHAT the pass produces. */
 ck('the pass still produces the same world',         fin.places===43 && fin.ways===63,
    'places='+fin.places+' ways='+fin.ways+' '+JSON.stringify(fin.kinds));

 if(errs.length) console.log('page errors: '+JSON.stringify(errs.slice(0,3)));
 console.log('\n'+pass+' passed, '+fail+' failed');
 await b.close();
 process.exit(fail?1:0);
})().catch(e=>{console.error('FATAL '+e.message);process.exit(1);});
