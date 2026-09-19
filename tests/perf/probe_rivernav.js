/* v2.62 — a navigable river is a ROUTE, and it has a DIRECTION.
 *
 * Owner: "these rivers should be navigateable as a route (but with a lower friction/cost) and a
 * course or direction the water flows (this also informs the travel planner)", then "Now do the
 * navigable rivers with flow direction."
 *
 *   node tests/perf/probe_rivernav.js "Cartalith v2.62 DCC test.html"
 *
 * Two claims, and they are measured separately because they can fail separately.
 *
 * ROUTE. Before this version a river cell cost the SAME whether you walked along the channel or
 * cut across it, because the ford was charged per CELL — v2.33's own finding about slope ("it is
 * the only place a direction exists"), which that version moved to the edge and did not carry to
 * the river terms ten lines below. So the most navigable river on the map was the most expensive
 * ground on it. The load-bearing assertion is not "a river is cheap": it is that ALONG and ACROSS
 * the SAME water now differ by a large factor, because that is the distinction a per-cell cost is
 * structurally unable to draw.
 *
 * DIRECTION. The planner inferred the current from the route's own elevation profile, which is a
 * proxy for the water's direction rather than the water's direction — measured 20.8% backwards on
 * real steps. The assertion is the round trip: the SAME geometry walked both ways must report
 * opposite currents, which an elevation proxy cannot guarantee and a receiver tree cannot get
 * wrong.
 *
 * The navigability gate is keyed on CATCHMENT AREA IN KM2, not Strahler order, and two assertions
 * here are the evidence for that rather than tests of it (v2.59's recommendation, measured again
 * on this build): the catchment is resolution-stable where the order ladder is not, and one
 * "order 3" label spans two orders of magnitude of real river across map extents.
 */
const {chromium}=require(process.env.PLAYWRIGHT_DIR||'/opt/node22/lib/node_modules/playwright');
const path=require('path');
const FILE=process.argv[2]||'Cartalith v2.62 DCC test.html';
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
   for(const n of ['_civRiverFlowField','_civRiverAlign','_civRiverTravelSpeed','_jpRiverReach'])
     if(typeof eval(n)!=='function') throw new Error('needs v2.62+ (missing '+n+')');
   if(typeof CIV_RIVER_NAVIGABLE_KM2==='undefined') throw new Error('needs v2.62+ (CIV_RIVER_NAVIGABLE_KM2)');
   if(typeof _setupHide==='function') _setupHide();
   const out={}, q=(a,p)=>{ if(!a.length)return 0; const s=a.slice().sort((x,y)=>x-y); return s[Math.min(s.length-1,Math.floor(p*s.length))]; };
   const mean=a=>a.length?a.reduce((s,v)=>s+v,0)/a.length:0;

   /* ---------- the evidence for keying the gate on km2 rather than Strahler order ---------- */
   const sweep={};
   for(const [km,world,res,tag] of [[800,false,512,'d512'],[800,false,1024,'d1024'],[40000,true,1024,'w40k']]){
     state.tect.seed=seed; state.world=world; state.mapWidthKm=km; state.resW=res; GW=res; GH=gridH(GW);
     allocate(); await generate();
     const thr=riverFlowThresh(GW,GH), net=_riverNet, ff=_civRiverFlowField();
     const all=[], o3=[];
     for(let i=0;i<GW*GH;i++){
       if(!(flowField[i]>thr)) continue; if(field[i]<state.seaLevel) continue;
       all.push(ff.km2[i]);
       if(net&&net.order&&net.order[i]>=3) o3.push(ff.km2[i]);
     }
     sweep[tag]={channel:all.length, p50:q(all,0.5), o3p50:q(o3,0.5), o3n:o3.length,
                 navPct:all.filter(v=>v>=CIV_RIVER_NAVIGABLE_KM2).length/Math.max(1,all.length)*100};
   }
   out.sweep=sweep;

   /* ---------- the app default, for everything else ---------- */
   state.tect.seed=seed; state.world=false; state.mapWidthKm=800; state.resW=512; GW=512; GH=gridH(GW);
   allocate(); await generate();
   const thr=riverFlowThresh(GW,GH), net=_riverNet, ff=_civRiverFlowField();

   /* the flow direction IS the receiver tree, and every step is one cell */
   let chan=0, withDir=0, matchesRecv=0, sampled=0, maxStep=0;
   for(let i=0;i<GW*GH;i++){
     if(!(flowField[i]>thr)) continue; if(field[i]<state.seaLevel) continue;
     chan++; const has=(ff.fx[i]!==0||ff.fy[i]!==0); if(has) withDir++;
     if(!has||sampled>=3000) continue;
     const r=net.recv[i]; if(r<0) continue;
     let dx=(r%GW)-(i%GW); if(state.world) dx-=Math.round(dx/GW)*GW;
     const dy=((r/GW)|0)-((i/GW)|0), L=Math.hypot(dx,dy);
     sampled++; maxStep=Math.max(maxStep,L);
     if(Math.abs(_civRiverAlign(ff,i,dx,dy)-1)<1e-5) matchesRecv++;
   }
   out.dir={channel:chan, withDir, pct:withDir/Math.max(1,chan)*100, sampled, matchesRecv, maxStep};

   /* ---------- the ROUTE half: along vs across on the SAME water ---------- */
   const G=_civRoutingGrid(), RW=G.RW, RH=G.RH, dfld=G.dfld;
   const F=_civTravelHours(dfld,RW,RH,state.seaLevel,null,{});
   out.hasPack=!!(F.river&&F.river.km2&&F.river.fi);
   out.rivSpeed=_civRiverTravelSpeed();
   const ec=_civLandTimeEdgeCost(F.cost,F.delay,dfld,RW,F.cellKm,F.gradeK,F.river);
   const ecNone=_civLandTimeEdgeCost(F.cost,F.delay,dfld,RW,F.cellKm,F.gradeK);   /* omitted ⇒ v2.61 */
   const NAV=CIV_RIVER_NAVIGABLE_KM2;
   const along=[], across=[], plain=[], subNav=[];
   let legacySame=true, maxAsym=0, symN=0;
   for(let y=1;y<RH-1;y++)for(let x=1;x<RW-1;x++){
     const i=y*RW+x; if(!isFinite(F.cost[i])) continue;
     for(const [dx,dy] of [[1,0],[0,1],[1,1],[1,-1]]){
       const nx=x+dx, ny=y+dy; if(nx<0||ny<0||nx>=RW||ny>=RH) continue;
       const j=ny*RW+nx; if(!isFinite(F.cost[j])) continue;
       const c=ec(i,j,dx,dy); if(!isFinite(c)) continue;
       const L=Math.hypot(dx,dy), ki=F.river.km2[i], kj=F.river.km2[j];
       if(ki===0&&kj===0){
         plain.push(c/L);
         if(legacySame && Math.abs(c-ecNone(i,j,dx,dy))>0) legacySame=false;   /* no river ⇒ identical */
         continue;
       }
       const a=0.5*(Math.abs(_civRiverAlign(ff,F.river.fi[i],dx,dy))+Math.abs(_civRiverAlign(ff,F.river.fi[j],dx,dy)));
       if(ki>=NAV&&kj>=NAV){ if(a>=CIV_RIVER_ALONG) along.push(c/L); else if(a<=CIV_RIVER_ACROSS) across.push(c/L); }
       else if(ki>0&&kj>0&&ki<NAV&&kj<NAV&&a>=CIV_RIVER_ALONG) subNav.push(c/L);
       /* an undirected Prim MST (v1.98) has no answer for an asymmetric edge */
       if(symN<8000){ const b=ec(j,i,-dx,-dy); if(isFinite(b)){ symN++; maxAsym=Math.max(maxAsym,Math.abs(c-b)/Math.max(1e-12,c)); } }
     }
   }
   out.edge={alongN:along.length, acrossN:across.length, plainN:plain.length, subNavN:subNav.length,
     along:mean(along), across:mean(across), plain:mean(plain), subNav:mean(subNav),
     legacySame, symN, maxAsym};

   /* the speed comes from JP_SHIPS, not from a constant here */
   const before=_civRiverTravelSpeed();
   let moved=false;
   try{
     const keep={}; for(const n in JP_SHIPS){ keep[n]=JP_SHIPS[n].speed; if(JP_SHIPS[n].modes&&JP_SHIPS[n].modes.includes('river')) JP_SHIPS[n].speed*=2; }
     moved=Math.abs(_civRiverTravelSpeed()-before*2)<1e-6;
     for(const n in JP_SHIPS) JP_SHIPS[n].speed=keep[n];
   }catch(e){}
   out.speedFromTable={before, moved, restored:Math.abs(_civRiverTravelSpeed()-before)<1e-9};

   /* ---------- the DIRECTION half: the planner, on a real navigable chain ---------- */
   let best=null;
   for(let i=0;i<GW*GH;i++){
     if(!(ff.km2[i]>=NAV)) continue; if(field[i]<state.seaLevel) continue;
     const pts=[]; let c=i, guard=0;
     while(c>=0&&guard++<600){ pts.push([(c%GW)+0.5,((c/GW)|0)+0.5]);
       const r=net.recv[c]; if(r<0||field[r]<state.seaLevel) break; c=r; }
     if(!best||pts.length>best.length) best=pts;
   }
   out.chain=best?best.length:0;
   if(best&&best.length>8){
     const cellKm=state.mapWidthKm/GW;
     let km=0; for(let k=1;k<best.length;k++) km+=Math.hypot(best[k][0]-best[k-1][0],best[k][1]-best[k-1][1])*cellKm;
     const mk=p=>{ const j={pts:p,km,brks:[]}; return {jn:j, plan:_jpEnsurePlan(j)}; };
     const D=mk(best), U=mk(best.slice().reverse());
     const sd=_jpDeriveStages(D.jn,D.plan), su=_jpDeriveStages(U.jn,U.plan);
     const sum=st=>{ let riv=0, land=0; const cond=new Set(), terr=new Set();
       for(const s of st){ if(s.cat==='river'){riv+=s.km||0; cond.add(s.routeCond); terr.add(s.terrain);} else land+=s.km||0; }
       return {riverKm:riv, landKm:land, conds:[...cond], terrains:[...terr], stages:st.length}; };
     out.jp={km, down:sum(sd), up:sum(su)};
     /* the proxy path must survive: pts omitted ⇒ the v2.61 elevation answer, character for character */
     const c={i0:0,i1:3,km:10,gain:0,loss:500};
     out.jp.proxyIntact=(_jpRiverCondition(c)==="Strong Downstream")&&(_jpRiverCondition({i0:0,i1:3,km:10,gain:500,loss:0})==="Strong Upstream");
   }

   /* the three pre-existing order>=3 consumers are untouched */
   out.legacyGateKept = /riverOrder\s*\|\|\s*0\s*\)\s*>=\s*3/.test(_civPlaceNavigability.toString());
   return out;
 },SEED);

 const e=R.edge, s=R.sweep;
 console.log('\nsweep  512px p50 '+s.d512.p50.toFixed(0)+' km2 | 1024px p50 '+s.d1024.p50.toFixed(0)+
   ' km2 | order3 median 800km '+s.d512.o3p50.toFixed(0)+' vs 40000km '+s.w40k.o3p50.toFixed(0)+' km2');
 console.log('edge   along '+e.along.toFixed(3)+' h  across '+e.across.toFixed(3)+'  plain '+e.plain.toFixed(3)+
   '  sub-navigable '+e.subNav.toFixed(3)+'\n');

 ok('the flow direction is the receiver tree, for essentially every land channel cell',
    R.dir.pct>99 && R.dir.matchesRecv===R.dir.sampled,
    R.dir.pct.toFixed(1)+'% covered, '+R.dir.matchesRecv+'/'+R.dir.sampled+' align exactly with recv');
 ok('...and a wrapped receiver is ONE step, never a map width (v1.29/v2.37/v2.58)',
    R.dir.maxStep<=Math.SQRT2+1e-9, 'max step '+R.dir.maxStep.toFixed(4)+' cells');

 ok('EVIDENCE: the catchment is resolution-stable where the order ladder is not',
    Math.abs(s.d512.p50-s.d1024.p50)/Math.max(1,s.d512.p50) < 0.05,
    s.d512.p50.toFixed(0)+' km2 at 512px vs '+s.d1024.p50.toFixed(0)+' at 1024px');
 ok('EVIDENCE: one "order 3" label spans orders of magnitude of real river across map extents',
    s.w40k.o3p50 > s.d512.o3p50*10,
    'median catchment '+s.d512.o3p50.toFixed(0)+' km2 at 800 km against '+s.w40k.o3p50.toFixed(0)+' at 40 000 km');
 ok('so the gate covers a real share of the channel network at the app default',
    s.d512.navPct>10, s.d512.navPct.toFixed(1)+'% of channel cells navigable');

 ok('the routing grid carries the catchment and the full-res index the edge needs',
    R.hasPack===true);
 ok('a step ALONG a navigable river is cheaper than plain ground',
    e.alongN>50 && e.along < e.plain,
    e.alongN+' edges, '+e.along.toFixed(3)+' h against '+e.plain.toFixed(3)+' h');
 ok('...by about the fastest river hull JP_SHIPS admits, not a constant of its own',
    Math.abs(e.along/e.plain - 1/R.rivSpeed) < 0.25,
    'ratio '+(e.along/e.plain).toFixed(3)+' against 1/'+R.rivSpeed.toFixed(3)+' = '+(1/R.rivSpeed).toFixed(3));
 ok('a step ACROSS the same water still pays its bridge',
    e.acrossN>10 && e.across > e.plain,
    e.acrossN+' edges, '+e.across.toFixed(3)+' h against '+e.plain.toFixed(3)+' h');
 ok('LOAD-BEARING: along and across the SAME river differ by a large factor',
    e.across/e.along > 3, 'across/along = '+(e.across/e.along).toFixed(2));
 ok('a river too small to float a hull gets NO boat, whichever way you walk beside it',
    e.subNavN>50 && Math.abs(e.subNav/e.plain-1) < 0.08,
    e.subNavN+' edges at '+(e.subNav/e.plain).toFixed(3)+'x plain');
 ok('the edge cost is EXACTLY symmetric, which an undirected Prim MST requires (v1.98)',
    e.symN>1000 && e.maxAsym===0, e.symN+' pairs, max relative asymmetry '+e.maxAsym);
 ok('omitting the river argument reproduces the v2.61 arithmetic exactly',
    e.legacySame===true);
 ok('the river speed is read from JP_SHIPS and follows it',
    R.speedFromTable.moved===true && R.speedFromTable.restored===true,
    JSON.stringify(R.speedFromTable));

 ok('the planner reports a real navigable chain as WATER, not as land beside water',
    R.jp && R.jp.down.riverKm > R.jp.km*0.4,
    R.jp?(R.jp.down.riverKm.toFixed(1)+' km of river on a '+R.jp.km.toFixed(1)+' km chain'):'no chain');
 ok('LOAD-BEARING: the same water walked both ways reports OPPOSITE currents',
    R.jp && R.jp.down.conds.some(c=>/Downstream/.test(c)) && R.jp.up.conds.some(c=>/Upstream/.test(c))
         && !R.jp.down.conds.some(c=>/Strong Upstream/.test(c)),
    R.jp?('down '+JSON.stringify(R.jp.down.conds)+'  up '+JSON.stringify(R.jp.up.conds)):'no chain');
 ok('...and omitting the heading still gives the v2.61 elevation answer',
    R.jp && R.jp.proxyIntact===true);

 ok('the three pre-existing order>=3 consumers are left alone',
    R.legacyGateKept===true);
 ok('no page errors', errs.length===0, errs.slice(0,2).join(' | '));

 console.log('\n'+pass+' passed, '+fail+' failed');
 await br.close();
 process.exit(fail?1:0);
})();
