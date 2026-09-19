/* v2.60 — a river is a CONTINUOUS FEATURE, not a chain of cells.
 *
 * Owner: "I find that rivers are quickly small strokes one after another and when we zoom in, maybe
 * we should paint/fill them the same way we do with lakes", then "Be sure a river doesn't break up
 * into parts. You can also use a bit of the sculpt tools to make sure a length of the river is deep
 * enough to constitute river."
 *
 *   node tests/perf/probe_riverfill.js "Cartalith v2.60 DCC test.html"
 *
 * The load-bearing assertion is the FIRST one and it is not a component count — it walks every main
 * stem cell by cell and asks whether the painted WATER (river blend or lake) is 4-connected from one
 * chain cell to the next. That is what "breaks up into parts" means on screen, and it is the only
 * metric that cannot be satisfied by painting more pixels somewhere else. On v2.59 it reads 884 of
 * 1305 stems broken over 3554 breaks; here it must read zero.
 *
 * Two connectivities matter and they are not interchangeable. A D8 chain is 8-connected by
 * construction, so an 8-connected count says nothing; two diagonally adjacent SQUARES touch only at
 * a corner, so 4-connectivity is what the eye reads as one line.
 */
const {chromium}=require(process.env.PLAYWRIGHT_DIR||'/opt/node22/lib/node_modules/playwright');
const path=require('path');
const FILE=process.argv[2]||'Cartalith v2.60 DCC test.html';
const SEED=+(process.argv[3]||12345);
let pass=0, fail=0;
const ok=(n,c,x)=>{ if(c){pass++; console.log('ok   - '+n);} else {fail++; console.log('FAIL - '+n+(x!==undefined?('   ['+x+']'):''));} };

(async()=>{
 const br=await chromium.launch({executablePath:'/opt/pw-browsers/chromium',args:['--no-sandbox']});
 const pg=await br.newPage({viewport:{width:1200,height:800}});
 const errs=[]; pg.on('pageerror',e=>errs.push(e.message));
 await pg.goto('file://'+path.resolve(FILE),{waitUntil:'load',timeout:240000});
 await pg.waitForFunction(()=>typeof generate==='function',{timeout:180000});

 const R=await pg.evaluate(async(seed)=>{
   for(const n of ['riverMainField','riverFieldTile','riverRenderPolys','mainRiverStems'])
     if(typeof window[n]!=='function' && typeof eval(n)!=='function') throw new Error('needs v2.60+ (missing '+n+')');
   if(typeof RIVER_MIN_HALF_CELLS==='undefined') throw new Error('needs v2.60+ (RIVER_MIN_HALF_CELLS)');
   if(typeof _setupHide==='function') _setupHide();
   state.tect.seed=seed; state.world=false; state.mapWidthKm=800; state.resW=1024; GW=1024; GH=gridH(GW);
   allocate(); await generate();
   const n=GW*GH, out={};

   /* ---------- 1. does a river break up into parts? ---------- */
   const wb=currentWaterBodies(), rf=riverMainField(), S=rf?rf.s:null;
   const wet=new Uint8Array(n);
   for(let i=0;i<n;i++) if((S&&S[i]>0)||wb[i]===2||field[i]<state.seaLevel) wet[i]=1;
   const lab=new Int32Array(n).fill(-1);
   { const st=new Int32Array(n); let c=0;
     for(let s=0;s<n;s++){ if(!wet[s]||lab[s]>=0) continue; let sp=0; st[sp++]=s; lab[s]=c;
       while(sp){ const i=st[--sp], x=i%GW, y=(i/GW)|0;
         for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){ const xx=x+dx, yy=y+dy;
           if(xx<0||xx>=GW||yy<0||yy>=GH) continue; const j=yy*GW+xx;
           if(wet[j]&&lab[j]<0){ lab[j]=c; st[sp++]=j; } } } c++; } }
   const stems=mainRiverStems();
   let broken=0, breaks=0, chainCells=0, dry=0;
   for(const s of stems){ let prev=-2, bad=0;
     for(const q of s.pts){ const i=((q.y|0)*GW)+(q.x|0); chainCells++;
       if(!wet[i]){ dry++; prev=-2; continue; }
       if(prev>=0 && lab[i]!==prev) bad++;
       prev=lab[i]; }
     breaks+=bad; if(bad) broken++; }
   out.cont={stems:stems.length, broken, breaks, chainCells, dry};

   /* the same, for the OLD per-cell disc stamp still sitting in _riverNet — the control */
   const comps=(on,conn)=>{ const seen=new Uint8Array(n), st=new Int32Array(n); let c=0;
     for(let s=0;s<n;s++){ if(!on[s]||seen[s]) continue; c++; let sp=0; st[sp++]=s; seen[s]=1;
       while(sp){ const i=st[--sp], x=i%GW, y=(i/GW)|0;
         for(let dy=-1;dy<=1;dy++) for(let dx=-1;dx<=1;dx++){ if(!dx&&!dy) continue;
           if(conn===4&&dx&&dy) continue;
           const xx=x+dx, yy=y+dy; if(xx<0||xx>=GW||yy<0||yy>=GH) continue;
           const j=yy*GW+xx; if(on[j]&&!seen[j]){ seen[j]=1; st[sp++]=j; } } } } return c; };
   const mk=(get,thr)=>{ const a=new Uint8Array(n); let k=0; for(let i=0;i<n;i++) if(get(i)>=thr){a[i]=1;k++;} return {a,k}; };
   const OLD=mk(i=>_riverNet.intensity[i],0.45), NEW=mk(i=>S?S[i]:0,0.45);
   out.old4=comps(OLD.a,4); out.old8=comps(OLD.a,8);
   out.new4=comps(NEW.a,4); out.new8=comps(NEW.a,8);
   /* how many painted cells have NO orthogonal painted neighbour — the corner-touch signature */
   const orphan=(A)=>{ let k=0; for(let y=1;y<GH-1;y++) for(let x=1;x<GW-1;x++){ const i=y*GW+x;
     if(!A[i]) continue; if(!A[i-1]&&!A[i+1]&&!A[i-GW]&&!A[i+GW]) k++; } return k; };
   out.oldOrphan=orphan(OLD.a); out.newOrphan=orphan(NEW.a);

   /* ---------- 2. the symbol floor is a GRID statement ---------- */
   let hwSum=0,hwN=0,hwMax=0;
   for(let i=0;i<n;i++) if(_riverNet.order[i]>=1){ const w=_riverNet.halfw[i]; hwSum+=w; hwN++; if(w>hwMax)hwMax=w; }
   out.floor={RIVER_MIN_HALF_CELLS, meanRealHalfCells:hwSum/Math.max(1,hwN), maxRealHalfCells:hwMax};

   /* ---------- 3. the profile is bit-identical where no floor binds ---------- */
   /* a synthetic two-vertex reach whose real half-width is far above both floors */
   out.profile=(()=>{
     const W=64,H=64, bounds={x:0,y:0,w:8,h:8}, cx=bounds.w/(W-1);
     const save=riverRenderPolys;
     const v=[{x:2.5,y:4.5,w:3.0,a:1,d:0.5},{x:6.5,y:4.5,w:3.0,a:1,d:0.5}];
     const pl={v, x0:-1, y0:1, x1:10, y1:8, wmin:RIVER_MIN_HALF_CELLS, len:4};
     riverRenderPolys=()=>[pl];
     const t=riverFieldTile(bounds,W,H,cx,cx);
     riverRenderPolys=save;
     if(!t) return {err:'no field'};
     /* v2.40's own expression, reproduced OPERATION FOR OPERATION — Math.sqrt of the squares, not
        Math.hypot (they differ in the last bits), and through Math.fround because the field is a
        Float32Array. Anything less and this measures the reproduction, not the code. */
     const pxX=1/cx, wpx=3.0*pxX, ax=(2.5-0.5)*pxX, ay=(4.5-0.5)*pxX, bx=(6.5-0.5)*pxX;
     let worst=0;
     for(let qy=0;qy<H;qy++) for(let qx=0;qx<W;qx++){
       const ex=bx-ax, L2=ex*ex;
       let tt=L2>0?(((qx-ax)*ex+(qy-ay)*0)/L2):0; tt=tt<0?0:(tt>1?1:tt);
       const ddx=qx-(ax+tt*ex), ddy=qy-ay, dd=Math.sqrt(ddx*ddx+ddy*ddy);
       const want=dd<wpx ? Math.fround(1*(1-dd/wpx)) : 0;
       const got=t.s[qy*W+qx];
       const e=Math.abs(want-got); if(e>worst) worst=e; }
     return {worstAbsDiff:worst, floorBound:wpx>Math.max(RIVER_TILE_MIN_PX,RIVER_MIN_HALF_CELLS*pxX)};
   })();

   /* ---------- 4. seam: adjacent tiles agree on the shared column ---------- */
   out.seam=(()=>{
     let bi=-1,bo=-1; for(let i=0;i<_riverNet.order.length;i++){ const o=_riverNet.order[i];
       if(o>bo&&field[i]>=state.seaLevel){bo=o;bi=i;} }
     const rx=(bi%GW), ry=((bi/GW)|0), span=24, W=128,H=128;
     const L={x:rx-span,y:ry-span/2,w:span,h:span}, Rt={x:rx,y:ry-span/2,w:span,h:span};
     const cx=span/(W-1), cy=span/(H-1);
     const a=riverFieldTile(L,W,H,cx,cy), b=riverFieldTile(Rt,W,H,cx,cy);
     if(!a||!b) return {maxDelta:0,note:'no river in either tile'};
     let mx=0; for(let y=0;y<H;y++){ const d=Math.abs(a.s[y*W+(W-1)]-b.s[y*W+0]); if(d>mx) mx=d; }
     return {maxDelta:mx};
   })();

   /* ---------- 5. registration: a horizontal reach sits ON its channel row ---------- */
   let onRow=0, offRow=0;
   for(let i=0;i<n;i++){ if(_riverNet.order[i]<1) continue; const r=_riverNet.recv[i];
     if(r<0) continue; const x=i%GW, y=(i/GW)|0, rx=r%GW, ry=(r/GW)|0;
     if(ry!==y||Math.abs(rx-x)!==1) continue;
     if(S[i] >= S[Math.min(n-1,i+GW)]) onRow++; else offRow++; }
   out.reg={onRow, offRow};

   /* ---------- 6. the raster geometry is WHOLE STEMS, not fragments ---------- */
   const rp=riverRenderPolys()||[];
   let stub=0, ptsum=0; for(const p of rp){ ptsum+=p.v.length; if(p.v.length<=3) stub++; }
   const frag=splitRiverPolylines(traceRiverPolylines(_riverNet.order,_riverNet.recv,GW,GH,1),GW);
   let fstub=0; for(const f of frag) if(f.length<=3) fstub++;
   out.geom={renderPolys:rp.length, renderStubs:stub, fragPolys:frag.length, fragStubs:fstub,
             meanPts:ptsum/Math.max(1,rp.length)};

   /* ---------- 7. the finishing descent pass ---------- */
   const mpu=metersPerUnit();
   let up=0, tot=0, carved=0, chan=0;
   for(let i=0;i<n;i++) if(_riverNet.order[i]>=1){ chan++; if(riverMask&&riverMask[i]) carved++; }
   for(const s of stems) for(let k=1;k<s.pts.length;k++){
     const a=((s.pts[k-1].y|0)*GW)+(s.pts[k-1].x|0), c=((s.pts[k].y|0)*GW)+(s.pts[k].x|0); tot++;
     if((field[c]-field[a])*mpu>1e-3) up++; }
   out.descent={steps:tot, uphill:up, pctUphill:100*up/Math.max(1,tot),
     carvedPct:100*carved/Math.max(1,chan),
     hasPass:/FINISHING DESCENT PASS/.test(carveRiverValleys.toString()),
     centreOnly:(typeof CHANNEL_DESCENT_CENTRE_HALFW!=='undefined')&&CHANNEL_DESCENT_CENTRE_HALFW>0&&CHANNEL_DESCENT_CENTRE_HALFW<1};

   /* ---------- 8. the lake cut lives on the STROKE, not on the raster ---------- */
   out.cut={rasterCuts:/riverLakeSkip\(\)/.test(riverRenderPolys.toString()),
            strokeCuts:/_inLake/.test(drawRiverWays.toString())};
   /* and a reach terminates AT the water */
   out.endsAtWater=(()=>{
     const pts=[{x:0.5,y:0.5},{x:1.5,y:0.5},{x:2.5,y:0.5},{x:3.5,y:0.5}];
     const r=splitRiverPolylines([pts],GW,(p)=>p.x>2);      // cut from x=2.5 on
     return r.length===1 && r[0].length===3 && r[0][2].x===2.5;   // ...ending ON the first cut point
   })();
   return out;
 },SEED);

 const C=R.cont;
 ok('NO main stem breaks into parts',            C.broken===0, C.broken+' of '+C.stems+' stems, '+C.breaks+' breaks');
 ok('...and no break anywhere on any stem',      C.breaks===0, C.breaks);
 ok('every chain cell has water painted',        C.dry===0, C.dry+' dry of '+C.chainCells);
 ok('the old per-cell stamp really was shattered (the control)',
    R.old4>2000 && R.old8<300, '4-conn '+R.old4+' vs 8-conn '+R.old8);
 ok('the drawn field is an order of magnitude less shattered',
    R.new4 < R.old4/4, R.old4+' -> '+R.new4);
 ok('corner-touch orphans are essentially gone',
    R.newOrphan < R.oldOrphan/20, R.oldOrphan+' -> '+R.newOrphan);
 ok('the symbol floor clears a cell circumradius (sqrt(1/2))',
    R.floor.RIVER_MIN_HALF_CELLS > Math.SQRT1_2, R.floor.RIVER_MIN_HALF_CELLS);
 ok('...and it is a FLOOR, not a width: it binds where the grid cannot resolve the channel',
    R.floor.meanRealHalfCells < R.floor.RIVER_MIN_HALF_CELLS,
    'mean real half-width '+R.floor.meanRealHalfCells.toFixed(3)+' cells');
 ok('...and releases on a channel the grid DOES resolve',
    R.floor.maxRealHalfCells > R.floor.RIVER_MIN_HALF_CELLS, R.floor.maxRealHalfCells.toFixed(3));
 ok('the profile is v2.40 exactly where no floor binds',
    R.profile.floorBound===true && R.profile.worstAbsDiff===0, JSON.stringify(R.profile));
 ok('adjacent tiles agree on the shared column (v1.29 seam rule)',
    R.seam.maxDelta<0.02, R.seam.maxDelta);
 ok('a horizontal reach is drawn ON its channel row, not half a cell off',
    R.reg.onRow>R.reg.offRow*20, R.reg.onRow+' on / '+R.reg.offRow+' off');
 ok('the raster geometry is whole stems, not source fragments',
    R.geom.renderPolys < R.geom.fragPolys, R.geom.fragPolys+' fragments -> '+R.geom.renderPolys+' stems');
 ok('...so the 2-3 point stubs that drew as blobs are mostly gone',
    R.geom.renderStubs < R.geom.fragStubs*0.7, R.geom.fragStubs+' -> '+R.geom.renderStubs);
 ok('the finishing descent pass is present and centre-cell only',
    R.descent.hasPass && R.descent.centreOnly, JSON.stringify({p:R.descent.hasPass,c:R.descent.centreOnly}));
 ok('fewer than 6% of drawn chain steps climb (v2.59: 12.55%)',
    R.descent.pctUphill<6, R.descent.pctUphill.toFixed(2)+'%');
 ok('over 90% of the drawn channel sits in carved terrain (v2.59: 87.7%)',
    R.descent.carvedPct>90, R.descent.carvedPct.toFixed(1)+'%');
 ok('the lake cut is on the STROKE only, never the raster',
    R.cut.strokeCuts && !R.cut.rasterCuts, JSON.stringify(R.cut));
 ok('a reach terminates AT the water, not one cell short',
    R.endsAtWater===true);
 ok('no page errors', errs.length===0, errs.slice(0,2).join(' | '));

 console.log('\n'+pass+' passed, '+fail+' failed');
 await br.close();
 process.exit(fail?1:0);
})();
