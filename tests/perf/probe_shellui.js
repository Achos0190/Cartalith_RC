const { chromium } = require(process.env.PLAYWRIGHT_DIR || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
let ok=0, fail=0;
const A=(n,c)=>{ if(c){ok++;console.log('ok   - '+n);} else {fail++;console.log('FAIL - '+n);} };
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME_BIN });
  const errs=[];
  // ---------- desktop ----------
  const p = await b.newPage({ viewport:{width:1400,height:900} });
  p.on('pageerror', e=>errs.push(String(e)));
  await p.goto('file://'+path.resolve(process.argv[2]));
  await p.waitForFunction(()=>typeof window.generate==='function',{timeout:60000});
  const D = await p.evaluate(async () => {
    const R={};
    state.tect.seed=12345; state.resW=256;
    if(typeof _setupSkipped!=='undefined') _setupSkipped=true;
    GW=state.resW; GH=gridH(GW); allocate(); await generate();
    const g=s=>document.querySelector(s);
    // 1. extent + grid are in the sidebar, under the heading, and OUT of the document bar
    const ex=g('#extentSeg'), rs=g('#resSeg');
    R.inSidebar = !!(ex&&rs&&ex.closest('#worldPanel')&&rs.closest('#worldPanel'));
    R.outOfDocBar = !!(ex&&rs&&!ex.closest('.docbar')&&!rs.closest('.docbar'));
    R.underHeading = (()=>{ const sec=ex&&ex.closest('.sec'); const h=sec&&sec.querySelector('h2');
      return !!(h&&/Extent/i.test(h.textContent)&&sec.contains(rs)); })();
    R.notDuplicated = document.querySelectorAll('#extentSeg,[id="extentSeg"]').length===1
                   && document.querySelectorAll('#resSeg').length===1;
    // and they still WORK from their new home
    const before=state.resW; const b512=g('#resSeg [data-w="512"]');
    window.confirm=()=>true; b512.click(); await new Promise(r=>setTimeout(r,2500));
    R.resStillWorks = state.resW===512 && before!==512;
    // 2. header cluster: symbols, emoji cog, one line
    const u=g('#undoBtn'), rd=g('#redoBtn'), cog=g('#cogBtn'), fw=g('#fileWrap'), fwB=g('#fileMenuBtn'), sb=g('#findWrap');
    R.undoSymbol = u.textContent.trim()==='↩' && u.getAttribute('aria-label')==='Undo';
    R.redoSymbol = rd.textContent.trim()==='↪' && rd.getAttribute('aria-label')==='Redo';
    R.cogEmoji   = cog.textContent.trim()==='⚙️' && !cog.querySelector('svg') && cog.getAttribute('aria-label')==='Settings';
    const rects=[sb,u,rd,fwB,cog].map(e=>e.getBoundingClientRect());
    R.oneLine = rects.every(r=>Math.abs(r.top-rects[0].top)<14);
    R.leftToRight = rects.every((r,i)=>i===0||r.left>=rects[i-1].left-1);
    R.memHidden = g('#undoMem').hidden===true;
    // 3. the undo readout survived as a tooltip
    if(typeof pushUndo==='function'){ pushUndo(); updateUndoUI(); }
    R.undoTooltip = /Undo/.test(u.title) && u.title.length>6;
    // 4. a View mode clears an obscuring layer
    const dl=g('#debugSeg [data-d="temp"]'); if(dl) dl.click();
    await new Promise(r=>setTimeout(r,300));
    R.layerWasOn = state.debug==='temp';
    g('#modeSeg [data-mode="shade"]').click();
    await new Promise(r=>setTimeout(r,400));
    R.modeClearedLayer = state.debug==='off' && state.mode==='shade';
    const offBtn=g('#debugSeg [data-d="off"]');
    R.offReflected = !!(offBtn&&offBtn.classList.contains('on'));
    return R;
  });
  await p.close();

  // ---------- mobile ----------
  const m = await b.newPage({ viewport:{width:390,height:720}, isMobile:true, hasTouch:true });
  m.on('pageerror', e=>errs.push(String(e)));
  await m.goto('file://'+path.resolve(process.argv[2]));
  await m.waitForFunction(()=>typeof window.generate==='function',{timeout:60000});
  const M = await m.evaluate(async () => {
    const R={};
    state.tect.seed=12345; state.resW=256;
    if(typeof _setupSkipped!=='undefined') _setupSkipped=true;
    GW=state.resW; GH=gridH(GW); allocate(); await generate();
    R.bodyH=getComputedStyle(document.body).height;
    R.usesDvh = /dvh/.test([...document.styleSheets].map(ss=>{try{return [...ss.cssRules].map(r=>r.cssText).join('')}catch(e){return ''}}).join('')) ;
    // layers popover reachable to its last entry
    const fab=document.getElementById('layersBtn')||document.getElementById('layersFab');
    if(fab) fab.click();
    await new Promise(r=>setTimeout(r,250));
    const pop=document.getElementById('layersPopover');
    if(pop){ const cs=getComputedStyle(pop);
      R.popMaxH=cs.maxHeight; R.popOverflow=cs.overflowY;
      R.popScrollH=pop.scrollHeight; R.popClientH=pop.clientHeight;
      R.popScrolls = pop.scrollHeight > pop.clientHeight;
      R.popFitsViewport = pop.getBoundingClientRect().bottom <= window.innerHeight+1;
      pop.scrollTop = pop.scrollHeight;
      await new Promise(r=>setTimeout(r,120));
      const items=pop.querySelectorAll('#layersList button');
      R.itemCount=items.length;
      const last=items[items.length-1];
      if(last){ const lr=last.getBoundingClientRect();
        R.lastItemReachable = lr.bottom<=window.innerHeight+1 && lr.top>=0; }
    }
    // drawer above the rail
    const tog=document.getElementById('panelToggle'); if(tog) tog.click();
    await new Promise(r=>setTimeout(r,350));
    const dw=document.querySelector('.dockwrap'), rail=document.querySelector('.domain-rail');
    if(dw&&rail){ R.dockZ=+getComputedStyle(dw).zIndex; R.railZ=+getComputedStyle(rail).zIndex;
      R.dockAboveRail = R.dockZ > R.railZ;
      R.dockHeight=getComputedStyle(dw).height; }
    return R;
  });
  await m.close(); await b.close();

  console.log('--- sidebar: extent + grid ---');
  A('extentSeg and resSeg live in the sidebar #worldPanel', D.inSidebar);
  A('...and are gone from the document bar', D.outOfDocBar);
  A('...under the "Extent & resolution" heading, together', D.underHeading);
  A('...moved, not duplicated (one element each)', D.notDuplicated);
  A('...and the grid buttons still regenerate from their new home', D.resStillWorks);
  console.log('--- header cluster ---');
  A('Undo is the symbol, still named for a screen reader', D.undoSymbol);
  A('Redo is the symbol, still named for a screen reader', D.redoSymbol);
  A('the cog is the emoji, SVG gone, still named "Settings"', D.cogEmoji);
  A('search, undo, redo, File and cog share one line', D.oneLine);
  A('...in that left-to-right order', D.leftToRight);
  A('the step-count text no longer splits the cluster', D.memHidden);
  A('...and its readout survives on the Undo tooltip', D.undoTooltip);
  console.log('--- View modes vs. an obscuring layer ---');
  A('a debug layer can be turned on', D.layerWasOn);
  A('picking a View mode clears it and applies the mode', D.modeClearedLayer);
  A('...and the Layers list shows Off, so the two agree', D.offReflected);
  console.log('--- mobile ---');
  A('the stylesheet uses dvh for viewport-sized boxes', M.usesDvh);
  A('the layers popover is a scroller sized to the VISIBLE viewport', M.popScrolls && M.popFitsViewport);
  A('...and its last layer can actually be scrolled into view', M.lastItemReachable);
  A('the dock sheet draws ABOVE the domain rail', M.dockAboveRail);
  console.log(`\n   layers popover: ${M.itemCount} entries, maxHeight ${M.popMaxH}, ${M.popScrollH}px of content in ${M.popClientH}px`);
  console.log(`   dock z=${M.dockZ} rail z=${M.railZ} dock height ${M.dockHeight} · body height ${M.bodyH}`);
  if(errs.length) console.log('\npage errors:', errs.slice(0,4));
  console.log(`\n${ok} passed, ${fail} failed`);
  process.exit(fail?1:0);
})();
