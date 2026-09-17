/* v2.41 — integrated drainage, and river deltas.
 *
 *   node tests/perf/probe_deltas.js "Cartalith v2.41 DCC test.html"
 *
 * Two claims, measured on one world each way.
 *
 * (1) DRAINAGE. computeFlow accumulated on the RAW field with no depression filling, so every local
 *     pit terminated accumulation: 65-80% of land never reached the sea, the biggest channel cell
 *     drained into a pit ~391 m ABOVE sea level, and the largest flow reaching the sea anywhere was
 *     six times smaller than the largest flow on land. A delta is a trunk-river landform and there
 *     were no trunk rivers.
 * (2) DELTAS. routeSediment's sub-sea branch was an asymptote at sea level ((sea-h)*0.5 with one
 *     visit per cell), so it could never cross into land however much sediment it was given; and the
 *     only river-mouth process in the engine, coastalPass's estuary branch, SUBTRACTS height.
 *
 * Both flags default OFF, so the last assertions pin that the shipped world is untouched.
 */
const {chromium}=require(process.env.PLAYWRIGHT_DIR||'/opt/node22/lib/node_modules/playwright');
const F=process.argv[2]||'Cartalith v2.41 DCC test.html';
const SEED=+(process.argv[3]||12345);
let pass=0, fail=0;
const ck=(n,c,x)=>{ if(c){pass++; console.log('ok   - '+n);} else {fail++; console.log('FAIL - '+n+(x!==undefined?('  ['+x+']'):''));} };

(async()=>{
 const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium',args:['--no-sandbox']});
 const p=await b.newPage({viewport:{width:1400,height:900}});
 const errs=[]; p.on('pageerror',e=>errs.push(e.message));
 await p.goto('file:///home/user/Cartalith_RC/'+encodeURIComponent(F),{waitUntil:'load',timeout:180000});

 const defs=await p.evaluate(()=>({
   hydro:JSON.parse(JSON.stringify(state.hydro||null)),
   hasFns:typeof buildRoutingSurface==='function'&&typeof applyRiverDeltas==='function'
          &&typeof traceDistributaries==='function',
 }));
 /* v2.59 CONTRACT, not v2.41's: `integrate` ships ON — v2.41 measured that leaving it off left
    68.5% of land draining into an interior pit and shipped it off anyway so no existing world would
    move, and v2.59 accepted that re-baseline. `deltas` stays OFF (it deposits real sediment).
    This assertion therefore FAILS on v2.41-v2.58 by design, which is what makes it evidence. */
 ck('v2.59: integrate defaults ON, deltas defaults OFF',
    defs.hydro && defs.hydro.integrate===true && defs.hydro.deltas===false, JSON.stringify(defs.hydro));
 ck('the new engine functions exist', defs.hasFns);

 /* One generate per configuration, measured the same way each time. */
 const run=async(integrate,deltas)=>p.evaluate(async([seed,ig,dl])=>{
   if(typeof _setupHide==='function') _setupHide();
   state.hydro.integrate=ig; state.hydro.deltas=dl;
   state.tect.seed=seed; state.world=false; state.resW=512; GW=512; GH=gridH(GW);
   allocate(); await generate();
   const n=GW*GH, sea=state.seaLevel;
   const net=buildRiverNetwork(field,flowField,GW,GH,sea,{world:!!state.world,riverDensity:1});
   let land=0, maxLandFlow=0, maxOutletFlow=0, maxOrder=0, maxOutletOrder=0, outlets=0;
   for(let i=0;i<n;i++){
     if(field[i]<sea) continue;
     land++;
     const q=flowField[i]; if(q>maxLandFlow) maxLandFlow=q;
     const o=net.order[i]||0; if(o>maxOrder) maxOrder=o;
     /* An outlet is GEOMETRIC — a land cell touching the sea. Defining it via net.recv measures
        buildRiverNetwork's own tree, which is a different object from computeFlow's accumulation
        (the two disagreed before v2.41 threaded one routing surface through both), so a recv-based
        test reports the tree rather than the drainage. */
     const x=i%GW, y=(i/GW)|0; let coastal=false;
     for(let dy=-1;dy<=1&&!coastal;dy++)for(let dx=-1;dx<=1;dx++){ if(!dx&&!dy)continue;
       let nx=x+dx, ny=y+dy;
       if(state.world) nx=((nx)%GW+GW)%GW; else if(nx<0||nx>=GW) continue;
       if(ny<0||ny>=GH) continue;
       if(field[ny*GW+nx]<sea){ coastal=true; break; } }
     if(coastal){ outlets++;
       if(q>maxOutletFlow) maxOutletFlow=q;
       if(o>maxOutletOrder) maxOutletOrder=o; }
   }
   /* THE decisive drainage number: walk every land cell down its own receiver chain on the surface
      the engine actually routes on, and classify where it ends — the sea, a map edge (a legitimate
      outlet for a region crop), or an interior pit (the defect). A max-flow ratio cannot answer this:
      in region mode the largest basin often exits via a map edge, which says something about the crop
      rather than about the drainage. */
   const rs=(typeof currentRoutingSurface==='function' && currentRoutingSurface()) || field;
   const D8=new Float64Array(9);
   for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++) D8[(dy+1)*3+(dx+1)]=Math.hypot(dx,dy);
   const wrapX=state.world, rcv=new Int32Array(n).fill(-1);
   for(let i=0;i<n;i++){ const x=i%GW, y=(i/GW)|0, h=rs[i]; let best=-1,bd=0;
     for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){ if(!dx&&!dy)continue;
       let nx=x+dx, ny=y+dy;
       if(wrapX) nx=((nx)%GW+GW)%GW; else if(nx<0||nx>=GW) continue;
       if(ny<0||ny>=GH) continue;
       const j=ny*GW+nx, d=(h-rs[j])/D8[(dy+1)*3+(dx+1)]; if(d>bd){ bd=d; best=j; } }
     rcv[i]=best; }
   let toSea=0, toEdge=0, toPit=0;
   for(let i=0;i<n;i++){
     if(field[i]<sea) continue;
     let cur=i, steps=0, end=0;
     while(steps++ < n){
       if(field[cur]<sea){ end=1; break; }
       const x=cur%GW, y=(cur/GW)|0;
       if(y===0||y===GH-1||(!wrapX&&(x===0||x===GW-1))){ end=2; break; }
       const r=rcv[cur]; if(r<0){ end=3; break; }
       cur=r;
     }
     if(end===1) toSea++; else if(end===2) toEdge++; else toPit++;
   }
   return {land, outlets, maxLandFlow, maxOutletFlow, maxOrder, maxOutletOrder,
           toSea, toEdge, toPit, pitFrac: land>0 ? toPit/land : 0,
           landFrac: land/n, seaLevel:sea};
 },[SEED,integrate,deltas]);

 const base=await run(false,false);
 const intg=await run(true,false);
 const pc=r=>(100*r.toPit/r.land).toFixed(1)+'% pit / '+(100*r.toSea/r.land).toFixed(1)
   +'% sea / '+(100*r.toEdge/r.land).toFixed(1)+'% edge';
 console.log('    drainage: '+pc(base)+'   ->   '+pc(intg));
 console.log('    orders:   max '+base.maxOrder+' outlet '+base.maxOutletOrder
   +'  ->  max '+intg.maxOrder+' outlet '+intg.maxOutletOrder);

 ck('the defect reproduces: most land drains into an interior pit',
    base.pitFrac>0.5, (base.pitFrac*100).toFixed(1)+'%');
 ck('integrated drainage reaches an outlet from essentially everywhere',
    intg.pitFrac<0.01, (intg.pitFrac*100).toFixed(1)+'%');
 /* The land freed from pits splits between the two legitimate outlets; which way it splits is a
    property of the crop's geometry, not of the fix, so the bound is deliberately loose. */
 ck('...and substantially more land now drains to the SEA specifically',
    intg.toSea > base.toSea*1.25,
    base.toSea+' -> '+intg.toSea+'  ('+(intg.toSea/base.toSea).toFixed(2)+'x)');
 /* v2.41 asserted this as a rise in the OUTLET'S STRAHLER ORDER and that no longer discriminates:
    it reads 3 -> 3 on v2.58 as well as v2.59, so the drift is pre-existing (v2.48's exact EDT,
    v2.50/v2.51's crater scale and depth, and v2.57's plate blur each moved this seed's terrain).
    The ladder is simply saturated — riverFlowThresh caps how many tributary levels the channel mask
    can resolve, so order cannot express a change that moves 68.5% of the world's land from a pit to
    a real outlet. The DISCHARGE arriving at the coast can, and that is what the claim was about. */
 ck('a real trunk now reaches the sea (the discharge arriving at the coast rises sharply)',
    intg.maxOutletFlow>base.maxOutletFlow*3,
    'max flow at an outlet '+base.maxOutletFlow.toFixed(0)+' -> '+intg.maxOutletFlow.toFixed(0)
    +' cells ('+(intg.maxOutletFlow/Math.max(1e-9,base.maxOutletFlow)).toFixed(1)+'x), while its Strahler order held at '
    +base.maxOutletOrder+' -> '+intg.maxOutletOrder);
 ck('integration does not move the coastline (it never touches field)',
    Math.abs(intg.landFrac-base.landFrac)<0.02, base.landFrac.toFixed(4)+' -> '+intg.landFrac.toFixed(4));

 /* --- deltas --- */
 const dl=await p.evaluate(async(seed)=>{
   if(typeof _setupHide==='function') _setupHide();
   state.hydro.integrate=true; state.hydro.deltas=true;
   state.tect.seed=seed; state.world=false; state.resW=512; GW=512; GH=gridH(GW);
   allocate(); await generate();
   const n=GW*GH, sea=state.seaLevel;
   /* Re-run the pass in isolation on the finished world so its own report is observable. */
   const net=buildRiverNetwork(field,flowField,GW,GH,sea,{world:!!state.world,riverDensity:1});
   const pre=field.slice();
   for(let i=0;i<n;i++) pre[i]=field[i]+0.004;                 // synthetic uniform supply, bounded
   const rep=applyRiverDeltas(net, pre);
   let nl=0, nearMouth=0;
   const mouths=_deltaMouths(net);
   for(let i=0;i<n;i++){
     if(!(pre[i]-0.004<sea && field[i]>=sea)) continue;
     nl++;
     const x=i%GW, y=(i/GW)|0;
     for(const m of mouths){ if(Math.hypot(x-m.x,y-m.y)<=14){ nearMouth++; break; } }
   }
   const cellKm=state.mapWidthKm/GW;
   return {rep, nl, nearMouth, km2: nl*cellKm*cellKm,
           dist:_riverDistributaries?_riverDistributaries.polys.length:0,
           mouths:mouths.length};
 },SEED);
 console.log('    deltas:   '+dl.rep.mouths+' mouths, '+dl.rep.riverDominated+' river-dominated, '
   +dl.nl+' new land cells = '+dl.km2.toFixed(0)+' km2, '+dl.rep.branches+' distributary branches');

 ck('the world has river mouths to work with', dl.rep.mouths>10, dl.rep.mouths);
 ck('some mouths are river-dominated', dl.rep.riverDominated>0, dl.rep.riverDominated);
 ck('but MOST are not — the 80/10/10 split, not a map of birds-feet',
    dl.rep.riverDominated/dl.rep.mouths < 0.30,
    (100*dl.rep.riverDominated/dl.rep.mouths).toFixed(1)+'% river-dominated');
 ck('land is actually built at the coast (the old asymptote could not)', dl.nl>20, dl.nl);
 ck('the new land is AT the mouths, not smeared along the shore',
    dl.nl>0 && dl.nearMouth/dl.nl > 0.6, (100*dl.nearMouth/Math.max(1,dl.nl)).toFixed(1)+'% within 14 cells');
 ck('the lobes are bounded, not a continent', dl.km2 < 6000, dl.km2.toFixed(0)+' km2');
 ck('river-dominated mouths grow distributaries', dl.rep.branches>0, dl.rep.branches);
 ck('...and they reach the one render geometry set', dl.dist>0, dl.dist);

 /* --- routeSediment without opts.prograde must be bit-identical to v2.40 --- */
 const iden=await p.evaluate(()=>{
   const W=64,H=64,n=W*H, sea=0.42;
   const mk=()=>{ const a=new Float32Array(n); for(let i=0;i<n;i++) a[i]=0.30+0.0002*((i*37)%400); return a; };
   const sup=new Float32Array(n); for(let i=0;i<n;i++) sup[i]=0.001;
   const d=new Float32Array(n); d.fill(1);
   const A=mk(), B=mk();
   routeSediment(A,d,sup.slice(),W,H,{sea:sea});
   routeSediment(B,d,sup.slice(),W,H,{sea:sea, prograde:null});
   let same=true; for(let i=0;i<n;i++) if(A[i]!==B[i]){ same=false; break; }
   let crossed=0; for(let i=0;i<n;i++) if(A[i]>=sea) crossed++;
   return {same, crossed};
 });
 ck('routeSediment without opts.prograde is bit-identical', iden.same);
 ck('...and still cannot cross sea level (the defect, reproduced)', iden.crossed===0, iden.crossed);

 ck('no page errors', errs.length===0, errs.slice(0,2).join(' | '));
 console.log('\n'+pass+' passed, '+fail+' failed');
 await b.close();
 process.exit(fail?1:0);
})();
