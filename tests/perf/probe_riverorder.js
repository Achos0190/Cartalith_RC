#!/usr/bin/env node
/* v2.59 — integrated drainage becomes the default, and Strahler order is measured against the
 * alternative currency v2.58 introduced (upstream drainage area).
 *
 * Two questions, both answered by measurement rather than by argument.
 *
 * A. What does `state.hydro.integrate` actually buy, and is it safe as the default?
 *    v2.41 built it, measured the cost of leaving it off (66.5% of land draining into an interior
 *    pit, no order-3 outlet anywhere) and then shipped it OFF so no existing world would move. This
 *    probe re-measures BOTH states inside ONE build, so the flip is justified against its own
 *    off-state rather than against a remembered number (v2.39/v2.42/v2.55/v2.57's rule).
 *    The drainage walk is lifted from `probe_deltas.js` verbatim — it is the verified one, and a
 *    re-derived receiver tree is exactly the "two functions answering one question" defect this
 *    file has paid for nine times. A first cut here DID re-derive it, omitted the map-edge outlet
 *    case, and read 55% pit on a world `probe_deltas.js` measures at under 1%.
 *
 * B. Strahler order is this engine's river-importance currency — `order>=3` gates navigability and
 *    harbour validity, `order>=4` the fishing specialisation, `10+order*7` a town's river width,
 *    `0.45*(order-1)` the channel half-width, and the Min-stream-order slider thins the drawn
 *    network by it. v2.58 introduced upstream drainage area (accumulated on the channel receiver
 *    tree by Kahn's algorithm) and ranked main stems by it. The question is not which correlates
 *    better with the other; it is what each one can and cannot express.
 *
 *    TWO OF MY OWN HYPOTHESES WERE REFUTED HERE AND THE ASSERTIONS RECORD THE REFUTATION:
 *      - "Strahler is resolution-dependent" is FALSE in this engine. `riverFlowThresh` is
 *        `gw*gh*0.0004/riverCoarseEase(mapWidthKm)`, i.e. keyed on the CELL COUNT, so the channel
 *        mask is a roughly constant FRACTION of the grid and the tributary ladder does not deepen
 *        as the grid refines. The classic criticism of Strahler order does not apply here.
 *        v2.60: measured as an AGGREGATE over five PINNED seeds, because a single seed's equality
 *        is the fragile-outlier shape v2.25/v2.32 both had to retire — and it duly flipped (seed
 *        12345 reads 3/3/3 on v2.59 and 3/3/4 on v2.60). A genuinely resolution-dependent network
 *        would gain log_Rb(16) = 1.7-2.5 levels over this 16x cell count; measured mean is 0.0.
 *      - The resolution sweep cannot isolate anything anyway: v1.60's `terrainDetailK` makes relief
 *        frequency real-km-aware, so changing resolution at a fixed extent changes the TERRAIN.
 *        It is printed with that caveat and asserted only on the order ladder, which is a property
 *        of the threshold rather than of the particular hills it found.
 *
 *   node tests/perf/probe_riverorder.js "Cartalith v2.59 DCC test.html"
 */
const path=require('path');
const PW=process.env.PLAYWRIGHT_DIR||'/opt/node22/lib/node_modules/playwright';
const {chromium}=require(PW);
const fs=require('fs');
const FILE=process.argv[2];
if(!FILE){ console.error('usage: probe_riverorder.js <file.html>'); process.exit(2); }
let pass=0,fail=0;
const ck=(n,c,x)=>{ if(c){pass++;console.log('ok   - '+n+(x?'   ('+x+')':''));}
                    else{fail++;console.log('FAIL - '+n+(x?'   ('+x+')':''));} };
const f=(v,d)=>(v==null||!isFinite(v))?'n/a':Number(v).toFixed(d==null?3:d);

(async()=>{
  const src=fs.readFileSync(path.resolve(FILE),'utf8');
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium',args:['--no-sandbox']});
  const pg=await b.newPage({viewport:{width:1400,height:900}});
  pg.on('pageerror',e=>{fail++;console.log('FAIL - uncaught page error: '+e.message);});
  await pg.goto('file://'+path.resolve(FILE));
  await pg.waitForFunction(()=>typeof generate==='function',{timeout:120000});

  /* ---------- 1. the flip itself ---------- */
  const D=await pg.evaluate(()=>({
    integrate:!!(state.hydro&&state.hydro.integrate),
    deltas:!!(state.hydro&&state.hydro.deltas),
    checked:(()=>{const el=document.getElementById('hydroIntegrateChk');return el?!!el.checked:null;})() }));
  ck('v2.59 integrated drainage is ON in the shipped state literal', D.integrate===true);
  ck('v2.59 the checkbox ships CHECKED, so the control and the state agree before any syncUI',
     D.checked===true);
  ck('v2.59 deltas stay OFF — they deposit real sediment and are a separate look decision',
     D.deltas===false);
  ck('v2.59 the loadZip compat guard still defaults integrate to FALSE (a pre-v2.59 save reloads as the world it was)',
     /state\.hydro=Object\.assign\(\{integrate:false,deltas:false\}/.test(src));

  /* ---------- 2. what the flip buys, measured against its OWN off-state in one build ---------- */
  const drain=await pg.evaluate(async()=>{
    /* probe_deltas.js's own walk, unchanged: classify each land cell's terminus as SEA, a map EDGE
       (a legitimate outlet for a region crop) or an interior PIT. Reaching an edge is not a pit,
       and that distinction is the whole measurement. */
    const measure=()=>{
      const n=GW*GH, sea=state.seaLevel;
      const rs=(typeof currentRoutingSurface==='function' && currentRoutingSurface()) || field;
      const D8=new Float64Array(9);
      for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++) D8[(dy+1)*3+(dx+1)]=Math.hypot(dx,dy);
      const wrapX=state.world, rcv=new Int32Array(n).fill(-1);
      for(let i=0;i<n;i++){ const x=i%GW, y=(i/GW)|0, h=rs[i]; let best=-1,bd=0;
        for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){ if(!dx&&!dy)continue;
          let nx=x+dx; const ny=y+dy;
          if(wrapX) nx=((nx)%GW+GW)%GW; else if(nx<0||nx>=GW) continue;
          if(ny<0||ny>=GH) continue;
          const j=ny*GW+nx, d=(h-rs[j])/D8[(dy+1)*3+(dx+1)]; if(d>bd){ bd=d; best=j; } }
        rcv[i]=best; }
      let land=0,toSea=0,toEdge=0,toPit=0;
      for(let i=0;i<n;i++){
        if(field[i]<sea) continue; land++;
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
      /* the outlet's own Strahler order: v2.41's crispest single number for "a trunk reaches the
         sea", measured geometrically (a land cell touching the sea) rather than through net.recv,
         which is a different tree from computeFlow's accumulation. */
      let maxOutletOrder=0, maxOrder=0;
      const ord=_riverNet&&_riverNet.order;
      if(ord) for(let i=0;i<n;i++){
        if(field[i]<sea) continue;
        const o=ord[i]|0; if(o>maxOrder) maxOrder=o;
        const x=i%GW, y=(i/GW)|0; let coastal=false;
        for(let dy=-1;dy<=1&&!coastal;dy++)for(let dx=-1;dx<=1;dx++){ if(!dx&&!dy)continue;
          let nx=x+dx; const ny=y+dy;
          if(state.world) nx=((nx)%GW+GW)%GW; else if(nx<0||nx>=GW) continue;
          if(ny<0||ny>=GH) continue;
          if(field[ny*GW+nx]<sea){ coastal=true; break; } }
        if(coastal && o>maxOutletOrder) maxOutletOrder=o;
      }
      /* The metrics Strahler order CANNOT express, measured on the same world: the longest whole
         main stem (v2.58's own trunk measure) and the largest catchment arriving at a stem mouth. */
      let longestKm=0, topSeaKm2=0;
      if(typeof mainRiverStems==='function'){
        const cellKm=state.mapWidthKm/GW, cellKm2=cellKm*cellKm;
        for(const s of mainRiverStems()){
          if(s.len*cellKm>longestKm) longestKm=s.len*cellKm;
          const p=s.pts[s.pts.length-1], i=((p.y|0)*GW)+(p.x|0);
          const km2=(flowField[i]||0)*cellKm2; if(km2>topSeaKm2) topSeaKm2=km2;
        }
      }
      return {land,toSea,toEdge,toPit,pitFrac:land>0?toPit/land:0,maxOrder,maxOutletOrder,
              longestKm,topSeaKm2};
    };
    state.world=false; state.mapWidthKm=800; state.tect.seed=12345;
    state.viz.minRiverOrder=1;
    state.resW=512; GW=state.resW; GH=gridH(GW); allocate();
    state.hydro.integrate=false; await generate(); const off=measure();
    state.hydro.integrate=true;  await generate(); const on =measure();
    return {off,on};
  });
  const pc=r=>f(100*r.toPit/r.land,1)+'% pit / '+f(100*r.toSea/r.land,1)+'% sea / '+f(100*r.toEdge/r.land,1)+'% edge';
  console.log('\n--- what the flip buys (region, 800 km, 512px, seed 12345) ----------------');
  const dl=r=>'   max order '+r.maxOrder+', outlet '+r.maxOutletOrder
    +'   longest stem '+f(r.longestKm,0)+' km, biggest catchment at a mouth '+f(r.topSeaKm2,0)+' km2';
  console.log('  integrate OFF: '+pc(drain.off)+dl(drain.off));
  console.log('  integrate ON : '+pc(drain.on) +dl(drain.on));

  ck('v2.59 with integrate OFF most land still drains into an interior PIT — the shipped default was a broken drainage network',
     drain.off.pitFrac>0.5, f(drain.off.pitFrac*100,1)+'% of land');
  ck('v2.59 with integrate ON essentially nothing terminates in a pit',
     drain.on.pitFrac<0.01, f(drain.on.pitFrac*100,2)+'% of land');
  ck('v2.59 substantially more land now drains to the SEA specifically',
     drain.on.toSea>drain.off.toSea*1.25,
     drain.off.toSea+' -> '+drain.on.toSea+' cells ('+f(drain.on.toSea/Math.max(1,drain.off.toSea),2)+'x)');
  ck('v2.59 a real TRUNK now exists — the longest whole main stem grows substantially',
     drain.on.longestKm>drain.off.longestKm*1.3,
     f(drain.off.longestKm,0)+' km -> '+f(drain.on.longestKm,0)+' km ('
     +f(drain.on.longestKm/Math.max(1e-9,drain.off.longestKm),2)+'x)');
  /* THE COMPARISON THE OWNER ASKED FOR, in its sharpest form. A defect that moves 68.5% of the
     world's land from an interior pit to a real outlet, and lengthens the trunk by a third or more,
     is a change to the hydrology of every river on the map — and Strahler order, the currency nine
     consumers read, reports EXACTLY NOTHING about it, because riverFlowThresh caps how many
     tributary levels the channel mask can resolve and the ladder was already saturated. v2.41's own
     note recorded "outlet Strahler 2 -> 3", which is true of the network probe_deltas.js rebuilds
     with riverDensity:1 and NOT of the shipped `_riverNet` every consumer actually reads. */
  ck('v2.59 and Strahler order reports NOTHING about that change — the ladder is already saturated',
     drain.on.maxOrder===drain.off.maxOrder && drain.on.maxOutletOrder===drain.off.maxOutletOrder,
     'max order '+drain.off.maxOrder+' -> '+drain.on.maxOrder
     +', outlet '+drain.off.maxOutletOrder+' -> '+drain.on.maxOutletOrder
     +', against a '+f(drain.on.longestKm/Math.max(1e-9,drain.off.longestKm),2)+'x longer trunk');

  /* ---------- 3. Strahler vs drainage area ---------- */
  const run=async(cfg)=>pg.evaluate(async(c)=>{
    state.world=c.world; state.mapWidthKm=c.km; state.tect.seed=c.seed;
    state.hydro.integrate=true; state.viz.minRiverOrder=1;
    state.resW=c.gw; GW=state.resW; GH=gridH(GW); allocate();
    await generate();
    const net=_riverNet; if(!net) return {err:'no net'};
    const n=GW*GH, cellKm=state.mapWidthKm/GW, cellKm2=cellKm*cellKm, sea=state.seaLevel;
    const ord=net.order;
    let land=0; for(let i=0;i<n;i++) if(field[i]>=sea) land++;
    const hist=[]; let chan=0, maxO=0;
    for(let i=0;i<n;i++){ const o=ord[i]|0; if(o<1) continue; chan++;
      hist[o]=(hist[o]||0)+1; if(o>maxO) maxO=o; }
    for(let k=1;k<=maxO;k++) if(!hist[k]) hist[k]=0;
    let ge3=0; for(let k=3;k<=maxO;k++) ge3+=hist[k]||0;
    /* One ROW per whole main stem, read at its own mouth: the Strahler order the engine assigns it
       and the upstream catchment the flow raster accumulated there. computeFlow mean-normalises
       acc to 1 per cell, so flowField is a catchment in CELLS and x cellKm2 is km2 — a real,
       resolution-free quantity, unlike a count of resolved tributary levels. */
    const st=mainRiverStems();
    const rows=st.map(s=>{
      const p=s.pts[s.pts.length-1], i=((p.y|0)*GW)+(p.x|0);
      /* THREE quantities, deliberately kept apart. `flow` is computeFlow's D8 accumulation over
         ALL cells on the routing surface — the real upstream CATCHMENT AREA, and the quantity
         riverFlowThresh itself compares against. `area` is buildMainStems' Kahn accumulation over
         `net.recv`, which only covers CHANNEL cells — a count of upstream channel cells, i.e. a
         network-topology measure, not an area. v2.41 recorded that those are two different trees;
         this probe measures how far apart they actually are. */
      return {o:(ord[i]|0)||1, flow:flowField[i]||0, km2:(flowField[i]||0)*cellKm2,
              len:s.len, area:s.area||0};
    }).filter(r=>r.flow>0);
    rows.sort((a,b)=>b.flow-a.flow);
    const top=rows[0]||null;
    const band=(k)=>{ const v=rows.filter(r=>r.o===k).map(r=>r.flow).sort((a,b)=>a-b);
      return v.length?{n:v.length,ratio:v[v.length-1]/Math.max(1e-9,v[0])}:null; };
    /* Spearman needs MID-RANKS: order is {1,2,3,4} over thousands of stems, so ties dominate and
       handing tied values arbitrary distinct ranks destroys the statistic (a first cut did exactly
       that and read -0.26 to +0.41 on data that is plainly monotone). Ranks with ties are then
       Pearson-correlated; the d^2 shortcut is only valid without them. */
    const rho=(()=>{ const m=rows.length; if(m<8) return null;
      const mid=(get)=>{ const v=rows.map(get);
        const idx=v.map((_,i)=>i).sort((a,b)=>v[a]-v[b]);
        const r=new Array(m); let i=0;
        while(i<m){ let j=i; while(j+1<m && v[idx[j+1]]===v[idx[i]]) j++;
          const avg=(i+j)/2; for(let k=i;k<=j;k++) r[idx[k]]=avg; i=j+1; }
        return r; };
      const pear=(A,B)=>{ let ma=0,mb=0; for(let i=0;i<m;i++){ma+=A[i];mb+=B[i];} ma/=m; mb/=m;
        let sab=0,sa=0,sb=0;
        for(let i=0;i<m;i++){const a=A[i]-ma,bb=B[i]-mb; sab+=a*bb; sa+=a*a; sb+=bb*bb;}
        return sab/Math.sqrt(Math.max(1e-12,sa*sb)); };
      const C=mid(r=>r.flow), L=mid(r=>r.len), A=mid(r=>r.area), O=mid(r=>r.o);
      return {ordFlow:pear(O,C), lenFlow:pear(L,C), lenArea:pear(L,A), ordArea:pear(O,A)}; })();
    return {gw:GW,gh:GH,km:state.mapWidthKm,cellKm,land,chan,maxO,hist:hist.slice(1),
            ge3Frac:ge3/Math.max(1,chan), stems:rows.length,
            topKm2:top?top.km2:0, topFrac:top?top.flow/Math.max(1,land):0, topOrder:top?top.o:0,
            bandTop:band(maxO), rho};
  },cfg);

  const line=(r,label)=>`  ${label}  cell ${f(r.cellKm,2).padStart(6)} km  stems ${String(r.stems).padStart(5)}  channel ${String(r.chan).padStart(6)}  maxOrder ${r.maxO}  hist ${r.hist.join('/')}  order>=3 ${f(r.ge3Frac*100,2)}%  biggest catchment ${f(r.topKm2,0)} km2 = ${f(r.topFrac*100,1)}% of land, and it is order ${r.topOrder}`;

  console.log('\n--- resolution sweep (region, 800 km, seed 12345) --------------------------');
  console.log('    NOTE: v1.60 makes relief frequency real-km-aware, so changing resolution at a');
  console.log('    fixed extent changes the TERRAIN. Only the order ladder is asserted from this.');
  const A=[];
  for(const gw of [512,1024,2048]) A.push(await run({world:false,km:800,seed:12345,gw}));
  for(const r of A) console.log(line(r,String(r.gw).padStart(4)+'px'));

  console.log('\n--- extent sweep (world, 1024px, seed 77805) -------------------------------');
  const B=[];
  for(const km of [800,8000,40000]) B.push(await run({world:true,km,seed:77805,gw:1024}));
  for(const r of B) console.log(line(r,String(r.km).padStart(5)+' km'));
  console.log('');

  const ordersA=A.map(r=>r.maxO), ordersB=B.map(r=>r.maxO);

  /* v2.60: the ladder is asserted as an AGGREGATE over PINNED seeds, never as one seed's
     equality. A single-outlier assertion on generated terrain is the shape v2.25 and v2.32 both
     had to retire, and this one duly flipped: seed 12345 reads 3/3/3 on v2.59 and 3/3/4 on v2.60,
     which says which hills that seed happened to grow, not what the threshold does. The claim is
     about whether the ladder DEEPENS as the grid refines, and Horton's own bifurcation ratio
     (Rb 3-5) puts a genuinely resolution-dependent network at log_Rb(16) = 1.7-2.5 EXTRA LEVELS
     over this 16x cell-count change. Measured here: 0 of 5 seeds deepen on v2.59, 1 of 5 by one
     step on v2.60, and the mean moves DOWNWARD on v2.59 — noise either way, not a ladder. */
  const LADDER_SEEDS=[31337,77805,8080,2];
  const ends=[{seed:12345,lo:A[0].maxO,hi:A[2].maxO}];
  for(const seed of LADDER_SEEDS){
    const lo=await run({world:false,km:800,seed,gw:512});
    const hi=await run({world:false,km:800,seed,gw:2048});
    ends.push({seed,lo:lo.maxO,hi:hi.maxO});
  }
  const dEnd=ends.map(e=>e.hi-e.lo);
  const meanEnd=dEnd.reduce((a,b)=>a+b,0)/dEnd.length;
  console.log('\n--- resolution ladder, 512 -> 2048px, five pinned seeds ---------------------');
  console.log('  '+ends.map(e=>'seed '+e.seed+' '+e.lo+'->'+e.hi).join(',  '));
  console.log('  seeds that DEEPEN: '+dEnd.filter(v=>v>0).length+' of '+dEnd.length
              +';  mean change '+f(meanEnd,2)+' levels\n');
  ck('v2.59 REFUTED — Strahler order is NOT resolution-dependent here: riverFlowThresh is keyed on the CELL COUNT, so the ladder does not deepen as the grid refines',
     meanEnd<0.5 && Math.max(...dEnd)<=1,
     'mean change '+f(meanEnd,2)+' levels over a 16x cell count (Horton predicts 1.7-2.5 for a resolution-dependent network); worst single seed '
     +(Math.max(...dEnd)>=0?'+':'')+Math.max(...dEnd)+'; '+ends.map(e=>e.lo+'->'+e.hi).join(' / '));

  const g3B=B.map(r=>r.ge3Frac);
  ck('v2.59 but it IS extent-dependent, so `order>=3` means a different thing on every map',
     Math.max(...g3B)>Math.min(...g3B)*3,
     'order>=3 covers '+g3B.map(v=>f(v*100,2)+'%').join(' / ')+' of channel at 800/8000/40000 km, one seed, one resolution');
  ck('v2.59 ...and the ladder itself lengthens with extent at a fixed resolution',
     Math.max(...ordersB)>Math.min(...ordersB), 'max order '+ordersB.join(' -> '));

  const ALL=A.concat(B);
  const worst=ALL.map(r=>r.bandTop&&r.bandTop.ratio).filter(v=>v>0);
  ck('v2.59 the TOP Strahler bucket spans a wide range of real catchment, so order cannot rank INSIDE itself',
     Math.max(...worst)>4, 'largest:smallest catchment sharing the top order = '+f(Math.max(...worst),1)+'x');

  const misranked=ALL.filter(r=>r.topOrder<r.maxO);
  ck('v2.59 and order is not even MONOTONE in catchment — the single biggest river in the world is often not the highest-order one',
     misranked.length>0,
     misranked.length+' of '+ALL.length+' configs: '+ALL.map(r=>'order '+r.topOrder+'/'+r.maxO).join(', '));

  const vocab=Math.max(...ordersA.concat(ordersB));
  ck('v2.59 the whole vocabulary is far short of a real river network (Amazon 9-12, Rhine ~8)',
     vocab<8, 'the widest max order measured anywhere here is '+vocab);

  const RO =ALL.map(r=>r.rho&&r.rho.ordFlow).filter(v=>v!=null);
  const RL =ALL.map(r=>r.rho&&r.rho.lenFlow).filter(v=>v!=null);
  const RLA=ALL.map(r=>r.rho&&r.rho.lenArea).filter(v=>v!=null);
  ck('v2.59 order and catchment agree on DIRECTION everywhere — order is a coarsening of the same signal, not a rival measure of a different thing',
     Math.min(...RO)>0.3, 'rho(order, catchment), mid-ranked = '+RO.map(v=>f(v,3)).join(' / '));
  /* REFUTED, and this is the decisive finding for "should we replace it". v2.58's stem LENGTH is a
     WORSE proxy for real catchment area than the Strahler order it was going to replace — in every
     single configuration measured, by a factor of two to four. */
  ck('v2.59 REFUTED — v2.58\'s stem LENGTH ranks real catchment WORSE than Strahler order does, everywhere',
     RO.every((v,i)=>RL[i]<v),
     'rho(length, catchment) '+RL.map(v=>f(v,3)).join(' / ')+'   against rho(order, catchment) '+RO.map(v=>f(v,3)).join(' / '));
  /* ...and here is why v2.58 measured 0.963 for the same pairing. It correlated length against
     `buildMainStems`' OWN accumulation over `net.recv` — upstream CHANNEL CELLS — not against the
     catchment area computeFlow accumulates over every cell. v2.41's "two different trees" lesson, a
     third time, and this time it is in a number I published. v2.58's fix stands: its 0.207 -> 0.963
     is a like-for-like comparison of fragments against whole stems on ONE quantity. What does not
     stand is reading that figure as "length tracks drainage area". */
  ck('v2.59 the 0.963 v2.58 published is length vs UPSTREAM CHANNEL CELLS, a different tree from the catchment raster',
     Math.max(...RLA)>0.9 && RLA.every((v,i)=>v>RL[i]+0.4),
     'rho(length, net.recv area) '+RLA.map(v=>f(v,3)).join(' / ')+'   against rho(length, catchment) '+RL.map(v=>f(v,3)).join(' / '));

  await b.close();
  console.log('\n'+pass+' passed, '+fail+' failed');
  process.exit(fail?1:0);
})();
