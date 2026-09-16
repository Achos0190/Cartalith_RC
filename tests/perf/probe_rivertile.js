/* v2.40 — the river must live IN the tile, and must RESOLVE with zoom rather than be invented.
 *
 * v2.39 established that renderBiomeTileRGBA never consults _riverNet (byte-identical with the
 * network nulled, FNV 262842011 both ways), so LOD's only river renderer was drawLODView's stroked
 * vector overlay. v2.40 evaluates buildRiverNetwork's own falloff from the traced centreline at the
 * tile's own resolution, so the tile finally carries real water.
 *
 *   node tests/perf/probe_rivertile.js "Cartalith v2.40 DCC test.html"
 *
 * 15 assertions. On v2.39 at least six fail: the tile is river-blind, riverFieldTile does not exist,
 * and the overlay fires at defaults where v2.40 leaves it silent.
 *
 * The load-bearing test is RESOLUTION vs INVENTION. The same world bounds are colorized at five tile
 * resolutions. If the pass is resolving known geometry, the channel's area expressed in WORLD units
 * is the same number every time and only its pixel count grows; if it were synthesizing detail, the
 * world-unit area would drift. Below the symbol floor the world-unit area is legitimately larger —
 * that is the cartographic symbol keeping a sub-pixel river visible — so the convergence is asserted
 * at the top of the ladder and the inflation at the bottom.
 */
const {chromium}=require(process.env.PLAYWRIGHT_DIR||'/opt/node22/lib/node_modules/playwright');
const F=process.argv[2]||'Cartalith v2.40 DCC test.html';
const SEED=+(process.argv[3]||12345);
let pass=0, fail=0;
const ck=(n,c,x)=>{ if(c){pass++; console.log('ok   - '+n);} else {fail++; console.log('FAIL - '+n+(x!==undefined?('  ['+x+']'):''));} };

(async()=>{
 const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium',args:['--no-sandbox']});
 const p=await b.newPage({viewport:{width:1400,height:900}});
 const errs=[]; p.on('pageerror',e=>errs.push(e.message));
 await p.goto('file:///home/user/Cartalith_RC/'+encodeURIComponent(F),{waitUntil:'load',timeout:180000});

 /* state.world must be assigned BEFORE gridH() is read — it is a module global (v2.37). */
 await p.evaluate(async(seed)=>{
   if(typeof _setupHide==='function') _setupHide();
   state.tect.seed=seed; state.world=false; state.resW=512; GW=512; GH=gridH(GW);
   allocate(); await generate();
 },SEED);

 const def=await p.evaluate(()=>({
   riverWays:!!(state.viz&&state.viz.riverWays), showRivers:!!state.showRivers,
   hasFn:typeof riverFieldTile==='function' && typeof riverRenderPolys==='function',
   keyHasRivers:(typeof _lodRenderKey==='function')&&/showRivers/.test(_lodRenderKey.toString()),
   minPx:(typeof RIVER_TILE_MIN_PX!=='undefined')?RIVER_TILE_MIN_PX:null,
   netCells:(()=>{ let n=0; for(let i=0;i<_riverNet.intensity.length;i++) if(_riverNet.intensity[i]>0) n++; return n; })(),
 }));
 ck('default riverWays false / showRivers true', def.riverWays===false&&def.showRivers===true);
 ck('riverFieldTile + riverRenderPolys exist',   def.hasFn);
 ck('_lodRenderKey carries a showRivers term',   def.keyHasRivers);
 ck('the world really has a river network',      def.netCells>200, def.netCells);

 /* --- the mechanism: the tile colorizer now DOES consult _riverNet (v2.39's assertion, inverted) --- */
 const sense=await p.evaluate(()=>{
   const W=192,H=192;
   /* Centre the tile on a genuinely high-order channel cell so the test is about a real river. */
   let bi=-1,bo=0; for(let i=0;i<_riverNet.order.length;i++){ const o=_riverNet.order[i];
     if(o>bo && field[i]>=state.seaLevel){ bo=o; bi=i; } }
   const rx=(bi%GW)+0.5, ry=((bi/GW)|0)+0.5, span=GW*0.10;
   const bounds={x:rx-span/2,y:ry-span/2,w:span,h:span};
   const data=new Float32Array(W*H);
   for(let y=0;y<H;y++) for(let x=0;x<W;x++)
     data[y*W+x]=sampleArr(field,bounds.x+x*(bounds.w/(W-1)),bounds.y+y*(bounds.h/(H-1)));
   const fnv=(a)=>{let h=2166136261>>>0; for(let i=0;i<a.length;i++){h^=a[i];h=Math.imul(h,16777619)>>>0;} return h>>>0;};
   const A=fnv(renderBiomeTileRGBA(data,W,H,bounds));
   const keep=_riverNet; _riverNet=null; _rpolyCache=null; _rpolyKey='';
   const B=fnv(renderBiomeTileRGBA(data,W,H,bounds));
   _riverNet=keep; _rpolyCache=null; _rpolyKey='';
   /* riverWays ON must put the tile back to blind — the v1.14 either/or, now honoured on both paths. */
   state.viz.riverWays=true;
   const C=fnv(renderBiomeTileRGBA(data,W,H,bounds));
   const keep2=_riverNet; _riverNet=null; _rpolyCache=null; _rpolyKey='';
   const D=fnv(renderBiomeTileRGBA(data,W,H,bounds));
   _riverNet=keep2; state.viz.riverWays=false; _rpolyCache=null; _rpolyKey='';
   return {A,B,C,D,order:bo,rx,ry,span};
 });
 ck('the tile now consults _riverNet (it did not in v2.39)', sense.A!==sense.B, sense.A+' vs '+sense.B);
 ck('with riverWays ON the tile stands down again',          sense.C===sense.D, sense.C+' vs '+sense.D);
 ck('...and that suppressed tile differs from the drawn one', sense.C!==sense.A);
 ck('the test river is the world\'s highest-order trunk',      sense.order>=3, 'order '+sense.order);

 /* --- RESOLUTION vs INVENTION: one fixed world rect, five tile resolutions --- */
 const ladder=await p.evaluate(([rx,ry,span])=>{
   const bounds={x:rx-span/2,y:ry-span/2,w:span,h:span};
   const out=[];
   for(const W of [64,128,256,512,1024]){
     const H=W, cx=bounds.w/(W-1), cy=bounds.h/(H-1);
     const f=riverFieldTile(bounds,W,H,cx,cy);
     let px=0; if(f) for(let i=0;i<f.s.length;i++) if(f.s[i]>0) px++;
     out.push({W, pxPerCell:1/cx, areaPx:px, areaCells:px*cx*cy});
   }
   return out;
 },[sense.rx,sense.ry,sense.span]);
 console.log('    ladder: '+ladder.map(r=>r.W+'px → '+r.areaPx+'px² = '+r.areaCells.toFixed(2)+' cells²').join(' | '));
 const hi=ladder[4], mid=ladder[3], lo=ladder[0];
 ck('the river is stamped at every resolution', ladder.every(r=>r.areaPx>0), JSON.stringify(ladder.map(r=>r.areaPx)));
 ck('pixel area grows with resolution',         hi.areaPx>mid.areaPx && mid.areaPx>lo.areaPx);
 ck('WORLD area converges — resolving, not inventing',
    Math.abs(hi.areaCells-mid.areaCells)/mid.areaCells < 0.08,
    mid.areaCells.toFixed(3)+' → '+hi.areaCells.toFixed(3));
 ck('pixel area grows faster than resolution (true width, not a 1px thread)',
    (hi.areaPx/mid.areaPx) > 2.5, (hi.areaPx/mid.areaPx).toFixed(2)+'x for 2x resolution');

 /* --- the symbol floor, tested where it actually BINDS. It does not bind on the ladder above:
        at 64px over a tenth of the map that trunk is already ~2px wide, which is the crossover
        working, not the floor. Put the whole map in one coarse tile and the true channel really is
        sub-pixel — the case the floor exists for. --- */
 const floor=await p.evaluate(()=>{
   const W=128,H=128, bounds={x:0,y:0,w:GW,h:GH};
   const cx=bounds.w/(W-1), cy=bounds.h/(H-1);
   const f=riverFieldTile(bounds,W,H,cx,cy);
   let px=0; if(f) for(let i=0;i<f.s.length;i++) if(f.s[i]>0) px++;
   let maxHW=0; for(let i=0;i<_riverNet.halfw.length;i++)
     if(_riverNet.intensity[i]>0 && _riverNet.halfw[i]>maxHW) maxHW=_riverNet.halfw[i];
   return {px, widestPx:2*maxHW/cx, floorPx:2*RIVER_TILE_MIN_PX};
 });
 ck('at world scale even the widest channel is sub-pixel',
    floor.widestPx < floor.floorPx, floor.widestPx.toFixed(3)+'px true vs '+floor.floorPx+'px floor');
 ck('...and the symbol floor still renders it rather than dropping it', floor.px>0, floor.px);

 /* --- seam: two adjacent tiles must agree on their shared world column --- */
 const seam=await p.evaluate(([rx,ry,span])=>{
   const W=128,H=128, hw=span/2;
   const L={x:rx-hw,y:ry-hw/2,w:hw,h:hw}, R={x:rx,y:ry-hw/2,w:hw,h:hw};
   const cxL=L.w/(W-1), cyL=L.h/(H-1);
   const a=riverFieldTile(L,W,H,cxL,cyL), c=riverFieldTile(R,W,H,cxL,cyL);
   if(!a||!c) return {n:0,maxDiff:null};
   let m=0,n=0;
   for(let y=0;y<H;y++){ const va=a.s[y*W+(W-1)], vc=c.s[y*W+0]; const d=Math.abs(va-vc);
     if(va>0||vc>0){ n++; if(d>m) m=d; } }
   return {n,maxDiff:m};
 },[sense.rx,sense.ry,sense.span]);
 ck('the shared column carries river in both tiles', seam.n>0, seam.n);
 ck('adjacent tiles agree on the shared column',    seam.maxDiff!==null&&seam.maxDiff<0.02, seam.maxDiff);

 /* --- the overlay must now be SILENT at defaults, because the tile is drawing --- */
 const ov=await p.evaluate(async()=>{
   const orig=window.drawRiverWays; let calls=0;
   window.drawRiverWays=function(){ calls++; return orig.apply(this,arguments); };
   const lc=document.getElementById('lodChk'); if(lc){ lc.checked=true; lc.dispatchEvent(new Event('change',{bubbles:true})); }
   _lodOn=true; _lodCx=GW/2; _lodCy=GH/2; _lodZoom=6;
   if(typeof applyView==='function') applyView();
   try{ await refineVisibleTiles(); }catch(e){}
   renderNow(); await new Promise(r=>setTimeout(r,400)); renderNow();
   const off=calls;
   state.viz.riverWays=true; calls=0;
   renderNow(); await new Promise(r=>setTimeout(r,200)); renderNow();
   const on=calls;
   state.viz.riverWays=false; window.drawRiverWays=orig;
   return {off,on};
 });
 ck('at defaults the vector overlay no longer fires (the tile draws instead)', ov.off===0, ov.off);
 ck('with riverWays ON the overlay is the renderer again',                     ov.on>0, ov.on);

 /* --- the EXPORT path: bakePixel is river-blind for the same reason renderBiomeTileRGBA was, so an
        exported map.png had no river water either. Keyed as a DELTA against this same build with
        rivers suppressed — an absolute blue-contrast threshold passes on a build that draws no river
        at all, because carved valleys and landColorCore's TWI wetness term already make channel cells
        bluer than the land around them (the v2.39 probe was written that way and passed on v2.38). --- */
 const bake=await p.evaluate(async()=>{
   const measure=async()=>{
     buildGridFields();
     const blob=await bakeSingle(320,null);
     const bmp=await createImageBitmap(blob);
     const cv=document.createElement('canvas'); cv.width=bmp.width; cv.height=bmp.height;
     const g=cv.getContext('2d'); g.drawImage(bmp,0,0);
     const d=g.getImageData(0,0,cv.width,cv.height).data;
     const sx=(GW-1)/Math.max(1,cv.width-1), sy=(GH-1)/Math.max(1,cv.height-1);
     let rs=0,rn=0,ls=0,ln=0;
     for(let y=0;y<cv.height;y++) for(let x=0;x<cv.width;x++){
       const gx=Math.round(x*sx), gy=Math.round(y*sy);
       if(gx<0||gy<0||gx>=GW||gy>=GH) continue;
       const gi=gy*GW+gx; if(field[gi]<state.seaLevel) continue;
       const o=(y*cv.width+x)*4, blue=d[o+2]-d[o];
       if(_riverNet.intensity[gi]>0){ rs+=blue; rn++; } else { ls+=blue; ln++; }
     }
     return {rn,ln,contrast:(rn&&ln)?(rs/rn-ls/ln):null};
   };
   const on=await measure();
   state.showRivers=false; const off=await measure(); state.showRivers=true;
   return {on,off,gain:(on.contrast!=null&&off.contrast!=null)?(on.contrast-off.contrast):null};
 });
 console.log('    bake: river-vs-land blue '+bake.off.contrast.toFixed(2)+' with rivers off → '
   +bake.on.contrast.toFixed(2)+' on  (gain '+bake.gain.toFixed(2)+', n='+bake.on.rn+' river px)');
 ck('the bake samples real river cells',            bake.on.rn>50, bake.on.rn);
 ck('an exported map.png now carries river water',  bake.gain>3, bake.gain);

 ck('no page errors', errs.length===0, errs.join(' | '));
 console.log('\n'+pass+' passed, '+fail+' failed');
 await b.close();
 process.exit(fail?1:0);
})();
