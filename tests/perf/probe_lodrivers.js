/* v2.39 — rivers must be VISIBLE under Tiled LOD at default settings.
 *
 * The LOD path never calls surfaceColor: _lodBuildTileRGBA selects renderBiomeTileRGBA, which calls
 * landColorCore directly and so bypasses surfaceColor's `state.showRivers && _riverNet &&
 * !riverWays` Beer-Lambert blend entirely. Proven here by nulling _riverNet and re-colorizing one
 * tile: byte-identical. So drawLODView's vector overlay is the ONLY river renderer LOD has, and
 * until v2.39 it was gated on state.viz.riverWays, which v2.29 defaulted to false.
 *
 *   node tests/perf/probe_lodrivers.js "Cartalith v2.39 DCC test.html"
 *
 * 12 assertions. On v2.38 four fail: the overlay is never called at either zoom, so painting it
 * lifts river-cell blue by exactly 0 against the build's own baseline.
 */
const {chromium}=require(process.env.PLAYWRIGHT_DIR||'/opt/node22/lib/node_modules/playwright');
const F=process.argv[2]||'Cartalith v2.39 DCC test.html';
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
   sdfRivers:(state.viz&&state.viz.sdfRivers)||0, burn:(typeof _lodBurnRivers!=='undefined')?_lodBurnRivers:null,
   mode:state.mode, debug:state.debug,
   netCells:(()=>{ if(!_riverNet) _riverNet=buildRiverNetwork(field,flowField,GW,GH,state.seaLevel,{world:state.world,riverDensity:1});
     let n=0; for(let i=0;i<_riverNet.intensity.length;i++) if(_riverNet.intensity[i]>0) n++; return n; })(),
 }));
 /* Pin the premise: this probe is only meaningful at the shipped defaults. */
 ck('default riverWays is false',   def.riverWays===false, def.riverWays);
 ck('default showRivers is true',   def.showRivers===true);
 ck('sdfRivers + channel burn are both off', def.sdfRivers===0 && def.burn===false, def.sdfRivers+'/'+def.burn);
 ck('the world really has a river network', def.netCells>200, def.netCells);

 /* The tile colorizer is river-blind — the fact that makes the vector overlay load-bearing. */
 const blind=await p.evaluate(()=>{
   const W=128,H=128, bounds={x:GW*0.25,y:GH*0.25,w:GW*0.25,h:GH*0.25};
   const data=new Float32Array(W*H);
   for(let y=0;y<H;y++) for(let x=0;x<W;x++)
     data[y*W+x]=sampleArr(field,bounds.x+x*(bounds.w/W),bounds.y+y*(bounds.h/H));
   const fnv=(a)=>{let h=2166136261>>>0; for(let i=0;i<a.length;i++){h^=a[i];h=Math.imul(h,16777619)>>>0;} return h>>>0;};
   const A=fnv(renderBiomeTileRGBA(data,W,H,bounds));
   const keep=_riverNet; _riverNet=null;
   const B=fnv(renderBiomeTileRGBA(data,W,H,bounds));
   _riverNet=keep;
   return {A,B};
 });
 ck('renderBiomeTileRGBA never consults _riverNet', blind.A===blind.B, blind.A+' vs '+blind.B);

 /* Instrument the real drawRiverWays and drive the real LOD render. */
 const run=async(zoom,stub)=>p.evaluate(async([z,stubOverlay])=>{
   const orig=window.drawRiverWays; let calls=0;
   /* stubOverlay gives this SAME build its own overlay-suppressed baseline, so the pixel assertion
      is a measured DELTA rather than a hardcoded threshold. That matters: carved valleys and the TWI
      wetness term already make river cells ~25 (z4) / ~43 (z8) bluer than the land around them with
      no water drawn at all, so an absolute cutoff passes on a build that renders no river. */
   window.drawRiverWays=function(){ calls++; if(stubOverlay) return; return orig.apply(this,arguments); };
   const lc=document.getElementById('lodChk'); if(lc){ lc.checked=true; lc.dispatchEvent(new Event('change',{bubbles:true})); }
   _lodOn=true; _lodCx=GW/2; _lodCy=GH/2; _lodZoom=z;
   if(typeof applyView==='function') applyView();
   try{ await refineVisibleTiles(); }catch(e){}
   renderNow();
   await new Promise(r=>setTimeout(r,400));
   renderNow();
   window.drawRiverWays=orig;
   /* River signal on LAND only: mean blue-minus-red on cells the network marks, vs cells it doesn't. */
   const cv=document.getElementById('view'), g=cv.getContext('2d');
   const d=g.getImageData(0,0,cv.width,cv.height).data;
   const v=(typeof lodViewRect==='function')?lodViewRect():null;
   let rs=0,rn=0,ls=0,ln=0;
   if(v){ for(let py=0;py<cv.height;py+=2) for(let px=0;px<cv.width;px+=2){
     const wx=v.x0+(px/cv.width)*(v.x1-v.x0), wy=v.y0+(py/cv.height)*(v.y1-v.y0);
     const gx=Math.round(wx), gy=Math.round(wy); if(gx<0||gy<0||gx>=GW||gy>=GH) continue;
     const gi=gy*GW+gx; if(field[gi]<state.seaLevel) continue;          // land only
     const o=(py*cv.width+px)*4, blue=d[o+2]-d[o];                       // B - R
     if(_riverNet.intensity[gi]>0){ rs+=blue; rn++; } else { ls+=blue; ln++; }
   } }
   return {calls, zoom:z, riverBlue:rn?rs/rn:null, landBlue:ln?ls/ln:null, rn, ln,
           contrast:(rn&&ln)?(rs/rn-ls/ln):null};
 },[zoom,!!stub]);

 const z4=await run(4), z8=await run(8);
 const b4=await run(4,true), b8=await run(8,true);   /* same build, overlay suppressed */
 console.log('   LOD z4 '+JSON.stringify(z4)+'\n   base '+JSON.stringify({contrast:b4.contrast}));
 console.log('   LOD z8 '+JSON.stringify(z8)+'\n   base '+JSON.stringify({contrast:b8.contrast}));
 const g4=(z4.contrast!=null&&b4.contrast!=null)?z4.contrast-b4.contrast:null;
 const g8=(z8.contrast!=null&&b8.contrast!=null)?z8.contrast-b8.contrast:null;
 /* The mechanism: the overlay must actually run. 0 on v2.38, nonzero here. */
 ck('drawRiverWays IS called under LOD at defaults (z4)', z4.calls>0, z4.calls);
 ck('drawRiverWays IS called under LOD at defaults (z8)', z8.calls>0, z8.calls);
 ck('river cells sampled at z4', z4.rn>20, z4.rn);
 /* The symptom: painting the overlay must measurably lift river cells above this build's OWN
    no-overlay baseline. On v2.38 the gate blocks the overlay, so the gain is exactly 0. */
 ck('drawing the overlay lifts river-cell blue (z4)', g4!==null && g4>10, g4===null?'null':g4.toFixed(2));
 ck('drawing the overlay lifts river-cell blue (z8)', g8!==null && g8>10, g8===null?'null':g8.toFixed(2));
 /* The stub counts the call and then suppresses the paint, so b4.calls is nonzero by design —
    the suppression is proven by the delta above, not by the counter. */
 ck('the carved-valley residual is real, not the fix', b4.contrast>10,
    'baseline '+(b4.contrast==null?'null':b4.contrast.toFixed(2)));

 /* The gate must be a SUPERSET: riverWays on still draws, exactly as before. */
 await p.evaluate(()=>{ state.viz.riverWays=true; });
 const on=await run(4);
 ck('riverWays=true still draws under LOD (superset)', on.calls>0, on.calls);
 await p.evaluate(()=>{ state.viz.riverWays=false; });

 /* showRivers off must still mean off. */
 await p.evaluate(()=>{ state.showRivers=false; });
 const off=await run(4);
 /* Assert the GATE, not the pixels — the residual terrain signal is there either way. */
 ck('showRivers=false draws no river under LOD', off.calls===0, 'calls='+off.calls);
 await p.evaluate(()=>{ state.showRivers=true; });

 if(errs.length) console.log('page errors: '+JSON.stringify(errs.slice(0,3)));
 console.log('\n'+pass+' passed, '+fail+' failed');
 await b.close();
 process.exit(fail?1:0);
})().catch(e=>{console.error('FATAL '+e.message);process.exit(1);});
