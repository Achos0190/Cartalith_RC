/* v2.35 — boundary-margin length: the junction predicate is the CROSSING NUMBER, not the raw
   8-neighbour count. Drives the shipped currentBoundaryGraph(), never a reimplementation.

   Usage: node tests/perf/probe_margins.js "Cartalith v2.35 DCC test.html" [seeds]
   Several assertions FAIL on v2.34 by construction - that is the point.
   Measured on v2.34: longest collision margin 88.9 / 91.5 / 57.7 km (seeds 12345 / 31337 / 4242).
   Measured on v2.35:                          161.0 / 288.0 / 226.4 km. */
const path=require('path');
const {chromium}=require(process.env.PLAYWRIGHT_DIR||'/opt/node22/lib/node_modules/playwright');
const file=process.argv[2]||'Cartalith v2.35 DCC test.html';
const seeds=(process.argv[3]||'12345,31337,4242').split(',').map(Number);
let pass=0, fail=0;
const check=(name,ok,detail)=>{ if(ok){pass++; console.log('  ok   '+name);}
  else {fail++; console.log('  FAIL '+name+(detail!==undefined?'   ['+detail+']':''));} };

(async()=>{
  const b=await chromium.launch({executablePath:process.env.CHROME_BIN||'/opt/pw-browsers/chromium',args:['--no-sandbox']});
  const p=await b.newPage({viewport:{width:1200,height:800}});
  p.on('pageerror',e=>{ console.log('  PAGEERROR '+e.message); fail++; });
  await p.goto('file://'+path.resolve(file),{waitUntil:'load',timeout:180000});

  for(const seed of seeds){
    console.log('\nseed '+seed);
    const r=await p.evaluate(async(seed)=>{
      state.tect.seed=seed; state.resW=512; state.world=false; state.mapWidthKm=800;
      state.tect.tectonicGraph=true; state.tect.plates=14;
      GW=512; GH=gridH(GW); allocate(); await generate();

      const W=GW,H=GH,cellKm=state.mapWidthKm/W;
      const G=currentBoundaryGraph();
      const COL=BTYPE_KEYS.indexOf('collision');
      const len=pl=>{let L=0;for(let i=1;i<pl.pts.length;i++)L+=Math.hypot(pl.pts[i][0]-pl.pts[i-1][0],pl.pts[i][1]-pl.pts[i-1][1]);return L*cellKm;};
      const col=G.polylines.filter(q=>q.type===COL&&q.pts.length>=2).map(len).sort((a,b)=>b-a);

      /* every polyline must remain an 8-connected path - the forward-preferring step must not
         teleport across the skeleton */
      let maxStep=0, longest=0;
      for(const pl of G.polylines){
        if(pl.pts.length>longest) longest=pl.pts.length;
        for(let i=1;i<pl.pts.length;i++)
          maxStep=Math.max(maxStep,Math.max(Math.abs(pl.pts[i][0]-pl.pts[i-1][0]),Math.abs(pl.pts[i][1]-pl.pts[i-1][1])));
      }
      /* a declared node must genuinely sit where >=3 distinct plates meet, within a small window */
      let nodesAtTriple=0;
      for(const [x,y] of G.nodes){
        const s=new Set();
        for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++){
          const nx=x+dx,ny=y+dy; if(nx<0||ny<0||nx>=W||ny>=H)continue; s.add(plateId[ny*W+nx]); }
        if(s.size>=3) nodesAtTriple++;
      }
      return { plates:state.tect.plates, chains:G.polylines.length, nodes:G.nodes.length,
               nodesAtTriple, colCount:col.length, longestKm:+(col[0]||0).toFixed(1),
               colKm:+col.reduce((s,v)=>s+v,0).toFixed(1), maxStep, longestPts:longest, cells:W*H };
    },seed);

    console.log('       '+JSON.stringify(r));
    // the crossing number must report junctions of the order a planar plate graph really has (~2n-4)
    check('junction count is plate-graph order (<= 4*plates)', r.nodes<=4*r.plates, r.nodes+' nodes, '+r.plates+' plates');
    // and the overwhelming majority of them must be real triple points
    check('most junctions sit at a real plate triple point (>=50%)',
          r.nodes===0 || r.nodesAtTriple/r.nodes>=0.5, r.nodesAtTriple+'/'+r.nodes);
    // margins must be long enough to read as a range rather than a fragment
    check('longest collision margin > 120 km', r.longestKm>120, r.longestKm+' km');
    // the skeleton is not shattered into hundreds of stubs
    check('chain count under 500', r.chains<500, r.chains+' chains');
    // correctness invariants of the new walk
    check('every polyline stays 8-connected (max step 1)', r.maxStep<=1, 'max step '+r.maxStep);
    check('no walk ran to the safety cap', r.longestPts<=r.cells, r.longestPts+' pts');
    check('collision margins exist at all', r.colCount>0, r.colCount);
  }
  await b.close();
  console.log('\n'+pass+' passed, '+fail+' failed');
  process.exit(fail?1:0);
})().catch(e=>{ console.log('FATAL '+e.message); process.exit(1); });
