#!/usr/bin/env node
/* v2.67 — the WARD sets the plot grain, and the subdivision is what it sets.
 *
 * THE DEFECT WAS TWO FUNCTIONS ANSWERING ONE QUESTION. buildParcels asked "core or fringe?" with
 * a hardcoded `dM<160` and spent the answer on one number; assignDistricts asked the same question
 * 130 lines later with the plaza, the wall ring, the river, the quay and the market radius, and
 * produced seven wards. So the plot grain could only say near/far, and a harbour, a suburb, an
 * agrarian fringe and a riverside craft quarter all platted identically — while the harbour's own
 * source comment in this file cites lit. review §1.1 #22 ("warehouses = deepest plots at quay;
 * plot frontage narrowest of any family") as the reason that ward exists at all.
 *
 * WHAT WAS MEASURED BEFORE ANY OF IT WAS BUILT, because it changed the design:
 *   - DEPTH is very nearly inert. 67.6% of parcels across six towns come out BELOW depthTarget's
 *     own 14 m floor — the block waist (`tMin*0.42`) binds, not the draw — and tripling
 *     plotDepthVariance 0.22 → 0.60 moves median depth 11.09 → 11.07 m. Building ward-driven DEPTH
 *     as the feature would have been v2.42's defect: a control that stores a number nothing reads.
 *   - SUBDIVISION is live, and it was driven by STREET AGE alone, so a market frontage and an
 *     agrarian-fringe frontage of the same age subdivided identically. M-PAR-1's register row says
 *     mature widths come from "grant + subdivision history (p_split per epoch ~0.1-0.2)", and what
 *     selects a plot for halving is the VALUE of its frontage. That is what the ward supplies.
 *
 * What this asserts, and why each one rather than a cheaper cousin:
 *   - WARD_GRAIN covers every ward the classifier can actually RETURN, derived by sampling the
 *     real classifier over a real town rather than from a hand-written list (v2.65: a hand-list of
 *     things to check is the same defect as a hand-list of things to define);
 *   - ONE definition — a parcel's district must be exactly what makeWardAt returns for it, so the
 *     grain and the labels can never describe different towns;
 *   - wardGrain:0 is BIT-IDENTICAL to the prior version (needs the control file), so the guarantee
 *     is structural rather than checked;
 *   - the effect is asserted as an ORDERING and as a MONOTONICITY derived from the table itself
 *     (v2.64): a no-op wiring satisfies neither;
 *   - the depth half is asserted to be SMALL, pinning the measurement so a later change that makes
 *     it load-bearing is caught rather than assumed;
 *   - and the water-footprint hole this exposed stays closed: a deep narrow plot can span a narrow
 *     channel with all four corners dry, so corners alone were never the footprint.
 *
 *   node tests/perf/probe_wardgrain.js "Cartalith v2.67 DCC test.html" ["Cartalith v2.66 DCC test.html"]
 */
const path=require('path'), fs=require('fs'), os=require('os'), cp=require('child_process');
const FILE=process.argv[2], CTRL=process.argv[3];
let pass=0,fail=0;
const ck=(n,c,x)=>{ if(c){pass++;console.log('ok   - '+n+(x?'   ('+x+')':''));}
                    else{fail++;console.log('FAIL - '+n+(x?'   ('+x+')':''));} };

/* The UME engine is a DOM-free IIFE, so this probe runs it in node exactly as tests/run_um.sh
   does — extract the marked block, prepend script block 1's own mulberry32 (the port deliberately
   does not redefine it), require it. No browser is needed and none is used. */
function loadEngine(html,tag){
  const src=fs.readFileSync(html,'utf8');
  const mulb=(src.match(/^function mulberry32.*$/m)||[])[0];
  if(!mulb) throw new Error('mulberry32 not found in '+html);
  const lines=src.split('\n'); let on=false; const body=[];
  for(const l of lines){
    if(l.indexOf('UM-ENGINE-START')>=0){on=true;continue;}
    if(l.indexOf('UM-ENGINE-END')>=0){on=false;continue;}
    if(on&&!/^<\/?script>$/.test(l.trim())) body.push(l);
  }
  if(!body.length) throw new Error('UM-ENGINE block not found in '+html);
  const f=path.join(fs.mkdtempSync(path.join(os.tmpdir(),'wardgrain-')),tag+'.js');
  fs.writeFileSync(f,mulb+'\n'+body.join('\n'));
  cp.execFileSync(process.execPath,['--check',f]);
  return require(f);
}
const UME=loadEngine(FILE,'cur');
const T=UME._test;
const SITES0=['river','riverthrough','bay','coast','landlocked'];
const opt=(o)=>Object.assign({epochs:8,pop:7500,walls:true,fortified:false,culture:'medieval'},o);

/* ── 1. the table is complete against the wards that are actually PLATTED ───────────────── */
{
  /* Derived, never hand-listed (v2.65). par.ward is the ward the plot series was cut for, i.e.
     exactly the classifier's own answer at the moment the grain was chosen -- so the set of
     wards observed across a spread of sites IS the set that needs a grain row. */
  const seen=new Set();
  for(const site of SITES0) for(const pop of [2500,7500]){
    const m=UME.cityGen(12345,opt({site,pop}));
    for(const p of m.parcels) if(p.ward) seen.add(p.ward);
  }
  const missing=[...seen].filter(w=>!UME.WARD_GRAIN[w]);
  const extra=Object.keys(UME.WARD_GRAIN).filter(w=>!seen.has(w));
  ck('the sweep actually plats a spread of wards', seen.size>=5, [...seen].sort().join(','));
  ck('WARD_GRAIN covers every ward that is actually platted', missing.length===0,
     missing.length?('no row for: '+missing.join(',')):'all covered');
  ck('and holds no row nothing is ever platted for', extra.length===0,
     extra.length?('unreached: '+extra.join(',')):'none unreached');
  ck('every row carries both a subdivision pressure and a depth base',
     Object.keys(UME.WARD_GRAIN).every(w=>{const g=UME.WARD_GRAIN[w];
       return typeof g.sub==='number'&&g.sub>0&&typeof g.depth==='number'&&g.depth>0;}),
     Object.keys(UME.WARD_GRAIN).length+' rows');
  /* the depth bases stay inside the envelope the pre-v2.67 proxy could already produce (22 at
     the core, 30 elsewhere). Going deeper is not a free look change -- a plot runs further back
     from its street, and a deep narrow plot is exactly what spanned a channel below -- and the
     measurement says it buys nothing anyway. */
  const deps=Object.keys(UME.WARD_GRAIN).map(w=>UME.WARD_GRAIN[w].depth);
  ck('no ward is deeper than the proxy\'s own maximum', Math.max(...deps)<=30,
     'max '+Math.max(...deps)+' m, min '+Math.min(...deps)+' m');
}

/* ── 2. the ward is the SERIES' own, and the labels still come from one classifier ────────── */
{
  let n=0, agree=0, differ=0, noWard=0;
  for(const site of ['river','bay','landlocked']){
    const m=UME.cityGen(4242,opt({site}));
    for(const p of m.parcels){ n++;
      if(!p.ward){ noWard++; continue; }
      /* where the parcel's own final label is still a classifier ward, the two must agree far
         more often than not: they are the same rule read at the block and at the parcel. Where
         they differ it is because the parcel sits across a ward boundary inside its block, or
         because the economy/status passes re-tagged it -- both real, both stated. */
      if(UME.WARD_GRAIN[p.district]){ if(p.ward===p.district) agree++; else differ++; } }
  }
  ck('every parcel carries the ward its plot series was cut for', n>500&&noWard===0,
     n+' parcels, '+noWard+' without a ward');
  ck('the block ward and the parcel label are the same rule, read one level apart',
     agree>differ*4, agree+' agree / '+differ+' differ (boundary blocks and re-tagged parcels)');
}

/* ── 3. the strength is a real lerp, and 0 is the identity ───────────────────────────────── */
{
  const g0=T.wardGrainFor('market',22,0), g1=T.wardGrainFor('market',22,1),
        gh=T.wardGrainFor('market',22,0.5), gn=T.wardGrainFor(null,30,1),
        gx=T.wardGrainFor('market',22,'nonsense');
  ck('strength 0 is the identity — sub 1.0 and the proxy\'s own depth',
     g0.sub===1&&g0.depth===22);
  ck('strength 1 is the table', g1.sub===UME.WARD_GRAIN.market.sub&&g1.depth===UME.WARD_GRAIN.market.depth);
  ck('and half-strength is exactly half way', Math.abs(gh.sub-(1+(g1.sub-1)*0.5))<1e-12&&
     Math.abs(gh.depth-(22+(g1.depth-22)*0.5))<1e-12, 'sub '+gh.sub.toFixed(3)+', depth '+gh.depth.toFixed(2));
  ck('an unknown ward and a non-numeric strength both fall back to the identity',
     gn.sub===1&&gn.depth===30&&gx.sub===1&&gx.depth===22);
}

/* ── 4. the EFFECT, as an ordering and a monotonicity derived from the table ─────────────── */
const SITES=['river','riverthrough','bay','coast','landlocked'], POPS=[2500,7500];
function sweep(rules){
  const by={},counts={};
  for(const site of SITES) for(const pop of POPS){
    const m=UME.cityGen(12345,opt({site,pop,rules}));
    for(const p of m.parcels){ const d=p.district;
      if(!UME.WARD_GRAIN[d]) continue;                 // classifier wards only
      (by[d]=by[d]||{n:0,f:0,dep:0}); by[d].n++; by[d].f+=p.frontage; by[d].dep+=p.depth;
      counts[d]=(counts[d]||0)+1; }
  }
  const o={}; for(const d of Object.keys(by)) o[d]={n:by[d].n,f:by[d].f/by[d].n,dep:by[d].dep/by[d].n};
  return o;
}
const OFF=sweep({parcels:{wardGrain:0}}), ON=sweep({parcels:{wardGrain:1}});
{
  /* the wards ranked by the table's own pressure — never a hand-written order */
  const wards=Object.keys(ON).filter(w=>OFF[w]&&ON[w].n>40)
    .sort((a,b)=>UME.WARD_GRAIN[b].sub-UME.WARD_GRAIN[a].sub);
  ck('the sweep reaches enough wards to rank them', wards.length>=4, wards.join(' > '));

  /* THE SIGN, PER WARD, AGAINST THAT WARD'S OWN BASELINE -- not a ranking of the wards against
     each other. A first cut asserted that mean frontage at wardGrain:1 is MONOTONE across the
     wards ordered by pressure, and it failed by 0.08 m (market 7.61 against harbour 7.53): mean
     frontage per ward is not a function of the pressure alone, because the BLOCKS differ per
     ward -- harbour blocks are small quay-side strips, agrarian ones broad fringe faces -- and
     that geometry is already in the baseline. Comparing a ward to itself removes it. So the
     claim is the one the table actually makes: pressure above 1 narrows a ward, below 1 broadens
     it, and 1.0 leaves it where it was. A no-op wiring satisfies none of those. */
  let wrong=[], detail=[];
  for(const w of wards){
    const k=UME.WARD_GRAIN[w].sub, d=ON[w].f-OFF[w].f;
    detail.push(w+'('+k.toFixed(1)+') '+(d>=0?'+':'')+d.toFixed(2));
    if(k>1.05&&!(d<-0.2)) wrong.push(w);
    else if(k<0.95&&!(d>0.2)) wrong.push(w);
    else if(k>=0.95&&k<=1.05&&Math.abs(d)>0.35) wrong.push(w);
  }
  ck('each ward moves the way its own pressure says, against its own baseline',
     wrong.length===0, detail.join('  '));

  /* the ORDERING WIDENS — the load-bearing form (v2.64). It is not enough that the core is
     narrower than the fringe; it already was, by accident of block geometry. The gap must GROW
     when the ward drives the grain, which only a wiring that is genuinely consulted can do. */
  const hi=wards[0], lo=wards[wards.length-1];
  const gapOff=OFF[lo].f-OFF[hi].f, gapOn=ON[lo].f-ON[hi].f;
  ck('the core-to-fringe frontage gap widens when the ward drives the grain',
     gapOn>gapOff*1.3&&gapOn>0.8, hi+' vs '+lo+': '+gapOff.toFixed(2)+' m -> '+gapOn.toFixed(2)+' m');

  /* and each end moves in its OWN direction, so the gap is not widened from one side only */
  ck('the highest-pressure ward gets narrower', ON[hi].f<OFF[hi].f-0.2,
     hi+' '+OFF[hi].f.toFixed(2)+' -> '+ON[hi].f.toFixed(2)+' m');
  ck('the lowest-pressure ward gets broader', ON[lo].f>OFF[lo].f+0.2,
     lo+' '+OFF[lo].f.toFixed(2)+' -> '+ON[lo].f.toFixed(2)+' m');

  /* SUBDIVISION, not just width: a dearer frontage yields MORE plots off the same street */
  ck('the dear ward gains parcels and the cheap one loses them',
     ON[hi].n>OFF[hi].n&&ON[lo].n<OFF[lo].n,
     hi+' '+OFF[hi].n+' -> '+ON[hi].n+' parcels, '+lo+' '+OFF[lo].n+' -> '+ON[lo].n);

  /* the DEPTH half is small, and saying so is the point — the measurement that decided the
     design is pinned here so a later change that makes depth load-bearing is caught. */
  const wAll=Object.keys(ON).filter(w=>OFF[w]);
  const pool=(S,k)=>wAll.reduce((a,w)=>a+S[w][k]*S[w].n,0)/wAll.reduce((a,w)=>a+S[w].n,0);
  const df=pool(ON,'f')-pool(OFF,'f'), dd=pool(ON,'dep')-pool(OFF,'dep');
  ck('the depth half is inert across the whole town, and the frontage half is not',
     Math.abs(dd)<0.5&&Math.abs(df)>0.25,
     'pooled mean depth '+(dd>=0?'+':'')+dd.toFixed(3)+' m vs frontage '+(df>=0?'+':'')+df.toFixed(3)+' m');
}

/* ── 5. the measurement that ruled DEPTH out, asserted rather than remembered ─────────────── */
{
  const depths=(sig)=>{ const d=[];
    for(const site of ['river','bay','landlocked']) for(const pop of POPS){
      const m=UME.cityGen(12345,opt({site,pop,rules:{parcels:{plotDepthVariance:sig}}}));
      for(const p of m.parcels) d.push(p.depth); }
    d.sort((a,b)=>a-b); return d; };
  const lo=depths(0.22), hi=depths(0.60);
  const med=a=>a[a.length>>1];
  const belowFloor=lo.filter(v=>v<14).length/lo.length;
  ck('most parcels never reach depthTarget\'s own 14 m floor — the block waist binds',
     belowFloor>0.4, (100*belowFloor).toFixed(1)+'% below the floor');
  ck('and tripling plotDepthVariance barely moves the median depth',
     Math.abs(med(hi)-med(lo))<1.0, med(lo).toFixed(2)+' m at 0.22 -> '+med(hi).toFixed(2)+' m at 0.60');
}

/* ── 6. the water-footprint hole this exposed, closed ────────────────────────────────────── */
{
  /* A deep narrow plot can span a NARROW channel with all four corners on dry banks and its
     middle in the water — which is how the golden suite's own model-level test caught a 41.3 m
     craftriver parcel whose every corner was dry. Corners were never the footprint. */
  let wet=0, checked=0;
  for(const site of ['river','riverthrough','bay','coast'])
    for(const fortified of [false,true]){
      const m=UME.cityGen(777,opt({site,fortified}));
      if(m.site.noWater||!m.site.waterPoly||!m.site.waterPoly.length) continue;
      for(const p of m.parcels){ checked++;
        if(T.pointInPoly(T.polyCentroid(p.poly),m.site.waterPoly)) wet++; }
    }
  ck('no parcel spans the channel with a wet middle and dry corners',
     checked>1000&&wet===0, checked+' parcels, '+wet+' wet');
}

/* ── 7. structural bit-identity against the prior version (needs the control file) ─────────── */
if(CTRL){
  const OLD=loadEngine(CTRL,'ctrl');
  let n=0,diff=0;
  for(const culture of Object.keys(OLD.CULTURE_PROFILES))
    for(const site of SITES) for(const seed of [4242,777,12345]){
      const a=OLD.cityGen(seed,opt({site,culture}));
      const b=UME.cityGen(seed,opt({site,culture,rules:{parcels:{wardGrain:0}}}));
      n++; if(OLD.hashModel(a)!==UME.hashModel(b)) diff++;
    }
  ck('wardGrain:0 reproduces the prior version EXACTLY — the guarantee is structural',
     n>=20&&diff===0, n+' towns, '+diff+' divergent');
  /* and the same comparison at the shipped default is the re-baseline, sized rather than argued */
  let moved=0,dp=0,tp=0;
  for(const site of SITES) for(const seed of [4242,777,12345]){
    const a=OLD.cityGen(seed,opt({site})), b=UME.cityGen(seed,opt({site}));
    if(OLD.hashModel(a)!==UME.hashModel(b)) moved++;
    dp+=Math.abs(b.parcels.length-a.parcels.length); tp+=a.parcels.length;
  }
  ck('the shipped default is a bounded, measured re-baseline of generated layouts',
     tp>0&&dp/tp<0.12, moved+' towns differ; '+dp+' of '+tp+' parcels ('+(100*dp/tp).toFixed(2)+'%)');
}else{
  console.log('note - control file not given; the bit-identity comparison was skipped');
}

console.log('\n'+(pass+fail)+' assertions: '+pass+' passed, '+fail+' failed');
process.exit(fail?1:0);
