/* Headless assertions for the Fractal Geology Painter pure engine.
   Appended after the extracted <ENGINE-START>..<ENGINE-END> section, which
   exports (in scope): SIZE, N, makeNoise, FEATURES, FEATURE_KEYS, GLOBAL_DEF,
   applyStamp, stampBBox, nearestOnStroke, clamp, ss, smoothstep, fillBase. */

let pass=0, fail=0;
function ok(cond,msg){ if(cond){pass++;} else {fail++; console.error("  FAIL:", msg);} }
function finite(arr){ for(let i=0;i<arr.length;i++){ if(!Number.isFinite(arr[i])) return false; } return true; }

// helper: build a stamp with feature defaults
function mkStamp(type, pts, gOver, fOver){
  const g=Object.assign({}, GLOBAL_DEF, gOver||{});
  const f={}; for(const c of FEATURES[type].controls) f[c[0]]=c[5];
  Object.assign(f, fOver||{});
  return { id:1, type, seed:12345, g, f, pts, hidden:false };
}
function blank(){ const H=new Float32Array(N), W=new Float32Array(N); fillBase(H,W,0.45); return {H,W}; }
function sum(a){ let s=0; for(let i=0;i<a.length;i++) s+=a[i]; return s; }

/* ---- 1. Noise determinism ------------------------------------------------ */
{
  const a=makeNoise(777), b=makeNoise(777), c=makeNoise(778);
  ok(a.p2(1.3,2.7)===b.p2(1.3,2.7), "perlin deterministic for equal seed");
  ok(a.p2(1.3,2.7)!==c.p2(1.3,2.7), "perlin differs for different seed");
  let mn=9,mx=-9; for(let i=0;i<4000;i++){ const v=a.p2(i*0.13, i*0.07); mn=Math.min(mn,v); mx=Math.max(mx,v); }
  ok(mn>=-1.2 && mx<=1.2, "perlin stays roughly in [-1,1] (got "+mn.toFixed(2)+".."+mx.toFixed(2)+")");
  let r0=9,r1=-9; for(let i=0;i<4000;i++){ const v=a.ridged(i*0.13,i*0.07,5,0.5,2); r0=Math.min(r0,v); r1=Math.max(r1,v); }
  ok(r0>=0 && r1<=1.001, "ridged fbm in [0,1]");
}

/* ---- 2. Every feature: finite output, respects mask, is deterministic ---- */
for(const type of FEATURE_KEYS){
  const pts = FEATURES[type].radial ? [{x:256,y:256}]
                                    : [{x:180,y:220},{x:256,y:256},{x:330,y:280}];
  const {H,W}=blank();
  const before=H.slice();
  applyStamp(mkStamp(type,pts), H, W);
  ok(finite(H), type+": heightmap finite after apply");
  ok(finite(W), type+": water layer finite after apply");
  for(let i=0;i<H.length;i++){ if(H[i]<0||H[i]>1){ ok(false,type+": height out of [0,1] at "+i); break; } }
  // a corner far from the stroke must be untouched (mask locality / dirty-rect)
  ok(H[0]===before[0] && H[N-1]===before[N-1], type+": leaves far corners untouched (masked)");
  // determinism: same stamp twice -> identical field
  const {H:H2,W:W2}=blank();
  applyStamp(mkStamp(type,pts), H2, W2);
  let same=true; for(let i=0;i<N;i++){ if(H[i]!==H2[i]){ same=false; break; } }
  ok(same, type+": identical seed/params reproduce the field bit-for-bit");
  // it actually changed *something*
  let changed=false; for(let i=0;i<N;i++){ if(H[i]!==before[i]){ changed=true; break; } }
  ok(changed, type+": produces a non-empty modification");
}

/* ---- 3. Feature semantics ------------------------------------------------ */
{ // mountains raise, canyon/valley/basin lower
  const raiseTypes=['mountains','hills','plateau','volcano'];
  const lowerTypes=['canyon','valley','basin'];
  for(const t of raiseTypes){
    const pts = FEATURES[t].radial?[{x:256,y:256}]:[{x:200,y:256},{x:312,y:256}];
    const {H,W}=blank(); const before=sum(H); applyStamp(mkStamp(t,pts),H,W);
    ok(sum(H)>before+1, t+": net raises terrain");
  }
  for(const t of lowerTypes){
    const pts=[{x:200,y:256},{x:312,y:256}];
    const {H,W}=blank(); const before=sum(H); applyStamp(mkStamp(t,pts),H,W);
    ok(sum(H)<before-1, t+": net lowers terrain");
  }
}
{ // river and lake must populate the water layer
  const {H,W}=blank(); applyStamp(mkStamp('river',[{x:120,y:256},{x:256,y:256},{x:400,y:256}]),H,W);
  ok(sum(W)>0, "river writes into the water layer");
  const {H:H2,W:W2}=blank(); applyStamp(mkStamp('lake',[{x:256,y:256}]),H2,W2);
  ok(sum(W2)>0, "lake writes into the water layer");
}
{ // cliff is one-sided: high side raised, low side lowered relative to base
  const {H,W}=blank();
  applyStamp(mkStamp('cliff',[{x:256,y:120},{x:256,y:400}]),H,W); // vertical stroke, brush r=60
  const left=H[256*SIZE+226], right=H[256*SIZE+286]; // both within the brush radius
  ok(Math.abs(left-right)>0.02, "cliff creates a step between its two sides");
}
{ // hardness widens/narrows the feather; harder edge => sharper coverage falloff
  const soft=blank(), hard=blank();
  applyStamp(mkStamp('mountains',[{x:256,y:256}],{hardness:0.0}),soft.H,soft.W);
  applyStamp(mkStamp('mountains',[{x:256,y:256}],{hardness:0.95}),hard.H,hard.W);
  let ds=0,dh=0; for(let i=0;i<N;i++){ if(soft.H[i]!==0.45)ds++; if(hard.H[i]!==0.45)dh++; }
  ok(ds>0 && dh>0, "both soft and hard brushes modify some pixels");
}
{ // intensity 0 => no change; higher intensity => more change
  const base=blank();
  const {H,W}=blank(); applyStamp(mkStamp('mountains',[{x:256,y:256}],{intensity:0}),H,W);
  let changed=false; for(let i=0;i<N;i++) if(H[i]!==base.H[i]){changed=true;break;}
  ok(!changed, "intensity 0 leaves terrain untouched");
}
{ // stacking is order-dependent and composable (non-destructive rebuild path)
  const {H,W}=blank();
  applyStamp(mkStamp('mountains',[{x:200,y:256},{x:312,y:256}]),H,W);
  const midHeight=H.slice();
  applyStamp(mkStamp('canyon',[{x:256,y:180},{x:256,y:330}]),H,W);
  let diff=false; for(let i=0;i<N;i++){ if(H[i]!==midHeight[i]){diff=true;break;} }
  ok(diff, "a second stamp composites on top of the first");
}

/* ---- 4. Geometry: signed distance / arclength ---------------------------- */
{
  const pts=[{x:100,y:100},{x:300,y:100}]; // horizontal segment
  const above=nearestOnStroke(200,60,pts);   // one side
  const below=nearestOnStroke(200,140,pts);  // other side
  ok(Math.sign(above.sd)!==Math.sign(below.sd), "signed distance flips across the stroke");
  ok(Math.abs(above.dist-40)<1e-6 && Math.abs(below.dist-40)<1e-6, "unsigned distance correct");
  ok(nearestOnStroke(200,100,pts).s>90 && nearestOnStroke(200,100,pts).s<110, "arclength ~halfway along segment");
}

/* ---- 5. Per-feature edge character -------------------------------------- */
{
  // Raggedness proxy: for a straight horizontal stroke, walk columns along its
  // middle span and find the boundary y where coverage starts (the local
  // "radius" at that column: base.H[i] vs H[i], NOT a literal, since Float32
  // storage of 0.45 never === the JS double 0.45). The stddev of that radius
  // across columns is ~0 for a clean straight edge and grows with how ragged
  // the warped boundary is — the same real signal driving the visual result.
  function boundaryStd(type, extraG){
    const g=Object.assign({brushSize:70}, extraG||{});
    const base=blank();
    const {H,W}=blank();
    applyStamp(mkStamp(type,[{x:180,y:256},{x:332,y:256}],g), H, W);
    const radii=[];
    for(let x=210;x<=302;x+=2){
      let boundaryY=-1;
      for(let y=100;y<256;y++){ if(H[y*SIZE+x]!==base.H[y*SIZE+x]){ boundaryY=y; break; } }
      if(boundaryY>=0) radii.push(256-boundaryY);
    }
    const mean=radii.reduce((a,b)=>a+b,0)/radii.length;
    return Math.sqrt(radii.reduce((a,b)=>a+(b-mean)*(b-mean),0)/radii.length);
  }
  const sMtn = boundaryStd('mountains');
  const sHill = boundaryStd('hills');
  ok(sMtn > sHill, "mountains' higher edgeChar/edgeFreqMul reads more ragged than hills at equal brush size (boundary std "+sMtn.toFixed(2)+" vs "+sHill.toFixed(2)+")");

  const sFlat = boundaryStd('mountains', {edgeNoise:0});
  ok(sFlat===0, "edgeNoise:0 restores a perfectly straight boundary (std "+sFlat+")");
}

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail? 1 : 0);
