#!/usr/bin/env node
/* One LOD-7 tile, four rungs: what the deep-zoom plain looks like as each floor is removed.
 *   node tests/perf/probe_lod7compare.js "Cartalith v2.55 DCC test.html" out.png
 *
 * A FIGURE GENERATOR, not an assertion probe — it renders docs/images/lod7_contrast_compare.png
 * for docs/research/deep-zoom-contrast.md. It exits 0 regardless; read the numbers and the image.
 *
 *   A  16-bit   what a baked chunk held before v2.53 (the storage floor)
 *   B  24-bit   v2.53
 *   C  + relief floor    v2.55 part A — amplifyRegion/addZoomDetail's gate gains a real-metre minimum
 *   D  + local contrast  v2.55 part B — renderHeightTileRGBA rebases the ramp on local relief
 *
 * EVERY RUNG IS THE SHIPPED CODE. Nothing here is reimplemented or patched into the source — that
 * is the whole difference from the pre-v2.55 version of this file, whose C and D were simulations
 * and whose D used a multiplicative form the shipped build does NOT use (it clamps in the
 * Uint8ClampedArray and shifts hue; v2.55 stretches additively in shading space instead).
 *   A/B  pyramidTile with opts.reliefFloor forced to 0   (the pre-v2.55 arithmetic, exactly)
 *   C/D  pyramidTile with the real lodTileOpts()          (carries subcellReliefFloor)
 *   A-C  localContrastK swapped to ()=>0                  (a real switch-off, not a copy)
 *   D    the real localContrastK
 * The storage axis likewise round-trips through the file's own packHeight16/24, which is literally
 * what atlasPut stores and atlasGet returns. */
const path=require('path'), fs=require('fs'), os=require('os');

const {chromium}=require(process.env.PLAYWRIGHT_DIR||'/opt/node22/lib/node_modules/playwright');
const FILE=process.argv[2], OUT=process.argv[3];
(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium',args:['--no-sandbox']});
  const pg=await b.newPage({viewport:{width:1400,height:900}});
  pg.on('pageerror',e=>console.log('PAGEERROR '+e.message));
  await pg.goto('file://'+path.resolve(FILE));
  await pg.waitForFunction(()=>typeof generate==='function',{timeout:120000});

  const res=await pg.evaluate(async()=>{
    state.world=false; state.resW=1024; state.mapWidthKm=800; state.tect.seed=12345;
    await generate();
    const sea=state.seaLevel, denom=1-sea, mpu=metersPerUnit(), z=7, TS=512;
    /* fail loudly on a build that does not ship both halves, rather than quietly drawing a
       four-rung ladder whose last two rungs are the first two. */
    if(typeof subcellReliefFloor!=='function' || typeof localContrastK!=='function')
      throw new Error('this figure needs v2.55+ (subcellReliefFloor / localContrastK)');
    const FLOOR=lodTileOpts().reliefFloor;
    if(!(FLOOR>0)) throw new Error('lodTileOpts() carries no reliefFloor');

    /* the plain is picked FLAT and mid-elevation (true r 0.15..0.55) so the global ramp is
       genuinely the thing hiding it, not an out-of-range height. */
    const pick=(loR,hiR,flat)=>{ let best=flat?1e9:-1,bi=-1;
      for(let y=8;y<GH-8;y++) for(let x=8;x<GW-8;x++){ const i=y*GW+x; if(field[i]<sea) continue;
        const rr=(field[i]-sea)/denom; if(rr<loR||rr>hiR) continue;
        const g=Math.hypot(field[i+1]-field[i-1],field[i+GW]-field[i-GW]);
        if(flat?(g<best):(g>best)){best=g;bi=i;} } return bi; };
    const sites={plain:pick(0.15,0.55,true), steep:pick(0,1,false)};

    const rng=a=>{let lo=1e9,hi=-1e9;for(let i=0;i<a.length;i++){if(a[i]<lo)lo=a[i];if(a[i]>hi)hi=a[i];}return[lo,hi];};
    const levels=a=>{const s=new Set(); for(let i=0;i<a.length;i++) s.add(a[i]); return s.size;};

    /* the SHIPPED renderer, both ways. `localContrastK` is reassigned to ()=>0 for rungs A-C:
       a real switch-off of part B inside one build, never a second copy of the formula. */
    const _lck=localContrastK;
    const heightShipped=(arr,W,H,bounds,local)=>{
      localContrastK = local ? _lck : (()=>0);
      try { return renderHeightTileRGBA(arr,W,H,bounds); } finally { localContrastK=_lck; }
    };
    const stat=(rgba,W,H)=>{const k=p=>(rgba[p]<<16)|(rgba[p+1]<<8)|rgba[p+2];
      const mid=(H>>1)*W*4; const s=new Set([k(mid)]); let run=1,mx=0;
      for(let x=1;x<W;x++){const p=mid+x*4; if(k(p)===k(p-4))run++; else{if(run>mx)mx=run;run=1;} s.add(k(p));}
      return {cols:s.size, run:Math.max(mx,run)}; };
    const toPNG=(rgba,W,H)=>{const cv=document.createElement('canvas');cv.width=W;cv.height=H;
      const cx2=cv.getContext('2d'),id=cx2.createImageData(W,H);id.data.set(rgba);cx2.putImageData(id,0,0);
      return cv.toDataURL('image/png');};

    const panels={};
    for(const key of ['plain','steep']){
      const fi=sites[key], dims=pyramidDims(z);
      const col=Math.min(dims.cols-1,Math.floor((fi%GW)/((GW-1)/dims.cols)));
      const row=Math.min(dims.rows-1,Math.floor(((fi/GW)|0)/((GH-1)/dims.rows)));
      const bb=pyramidTileBounds(GW,GH,z,col,row);

      const t0=pyramidTile(field,GW,GH,z,col,row,TS,Object.assign(lodTileOpts(),{reliefFloor:0}));
      const tF=pyramidTile(field,GW,GH,z,col,row,TS,lodTileOpts());
      const TW=t0.w, TH=t0.h, N=TW*TH;

      /* the REAL shipped storage round trip — what atlasPut writes and atlasGet reads back */
      const h16 =unpackHeight16(packHeight16(t0.data,N),N);
      const h24 =unpackHeight24(packHeight24(t0.data,N),N);
      const h24f=unpackHeight24(packHeight24(tF.data,N),N);

      const rungs=[
        {id:'a', h:h16,  loc:false},
        {id:'b', h:h24,  loc:false},
        {id:'c', h:h24f, loc:false},
        {id:'d', h:h24f, loc:true },
      ];
      const out={ kmAcross:(bb.w/(GW-1))*800, tw:TW, th:TH,
        srcLevels:levels(t0.data), srcLevelsF:levels(tF.data),
        span0M:(rng(t0.data)[1]-rng(t0.data)[0])*mpu, spanFM:(rng(tF.data)[1]-rng(tF.data)[0])*mpu,
        step16M:mpu/65535, step24M:mpu/16777215, rungs:[] };
      for(const r of rungs){
        const bio=renderBiomeTileRGBA(r.h,TW,TH,bb);
        const hgt=heightShipped(r.h,TW,TH,bb,r.loc);
        out.rungs.push({ id:r.id, levels:levels(r.h),
          biome:{png:toPNG(bio,TW,TH),...stat(bio,TW,TH)},
          height:{png:toPNG(hgt,TW,TH),...stat(hgt,TW,TH)} });
      }
      panels[key]=out;
    }
    return {panels, z, TS, floor:FLOOR, mpu, tw:panels.plain.tw, th:panels.plain.th};
  });

  /* ---- composite: 4 columns x 3 rows ---- */
  const TW=res.tw, TH=res.th, GAP=10, M=20, HEAD=74, RH=50;
  const CAP=[38,72,38];                                   // caption height per row
  const W=M*2+TW*4+GAP*3, H=HEAD+(RH+TH+CAP[0])+(RH+TH+CAP[1])+(RH+TH+CAP[2])+M;
  const png=await pg.evaluate(async({res,TW,TH,GAP,M,HEAD,RH,CAP,W,H})=>{
    const cv=document.createElement('canvas'); cv.width=W; cv.height=H;
    const c=cv.getContext('2d');
    c.fillStyle='#14161a'; c.fillRect(0,0,W,H);
    const load=src=>new Promise(r=>{const im=new Image();im.onload=()=>r(im);im.src=src;});
    const P=res.panels, x=i=>M+i*(TW+GAP);

    c.fillStyle='#e8eaed'; c.font='600 21px system-ui,sans-serif';
    c.fillText('Cartalith — one LOD 7 tile, 6.25 km across, 512 px.  Four rungs: 16-bit → 24-bit → relief floor → local contrast.', M, 28);
    c.fillStyle='#9aa3ad'; c.font='13px system-ui,sans-serif';
    c.fillText(`seed 12345 · region · 800 km · 1024 px · sea ${state.seaLevel.toFixed(4)} · ${res.mpu.toFixed(0)} m per height unit.   `
      +`A = what a baked chunk held before v2.53 (packHeight16).   B = v2.53, SHIPPED (packHeight24) — the real round trip, not a stand-in.   `
      +`C = relief gate floored at ${res.floor} (§7A, proposed).   D = + Height-view contrast rebase (§7B, proposed).`, M, 48);
    c.fillText(`The plain tile holds ${P.plain.srcLevels.toLocaleString()} distinct source heights across ${P.plain.span0M.toFixed(2)} m of relief. `
      +`16-bit recovers ${P.plain.rungs[0].levels}; 24-bit recovers ${P.plain.rungs[1].levels.toLocaleString()}. `
      +`Storage step ${P.plain.step16M.toFixed(4)} m → ${P.plain.step24M.toExponential(2)} m (${(P.plain.step16M/P.plain.step24M).toFixed(0)}× finer).`, M, 64);

    const COLS=[['A · 16-bit  (pre-v2.53)','#f0b429'],['B · 24-bit  (v2.53, shipped)','#4fd18b'],
                ['C · + relief floor  (§7A)','#63b3ff'],['D · + local contrast  (§7B)','#c792ea']];
    const ROWS=[
      {key:'plain', set:'biome',  idx:[0,1,2,3],
       title:'LOWLAND PLAIN — Biome view (the default map).  Storage and the relief floor both reach it through the hillshade; the colour rebase does not (§6.1), so D is byte-identical to C here.'},
      {key:'plain', set:'height', idx:[0,1,2,3],
       title:'LOWLAND PLAIN — Relief / Height view.  D keeps the hypsometric tint on the TRUE elevation (rAbs) and stretches only luminance locally (rLocal), so a plain still reads as a plain.'},
      {key:'steep', set:null,     idx:[0,3],
       title:'STEEP CONTROL — the same four-rung ladder where the terrain is already expressive.  Biome A/D, then Height A/D.  Nothing here is damaged by the proposal.'},
    ];

    for(let r=0;r<3;r++){
      const row=ROWS[r];
      let yTop=HEAD; for(let k=0;k<r;k++) yTop+=RH+TH+CAP[k];
      c.fillStyle='#c7ccd1'; c.font='600 13px system-ui,sans-serif';
      c.fillText(row.title, M, yTop+15);

      /* cells: rows 0-1 are one view across 4 rungs; row 2 is 2 views x 2 rungs */
      const cells=[], heads=[];
      if(row.set){
        for(const i of row.idx){ cells.push(P[row.key].rungs[i][row.set]); heads.push(COLS[i]); }
      } else {
        for(const i of row.idx){ cells.push(P.steep.rungs[i].biome);  heads.push([('Biome · '+COLS[i][0]),COLS[i][1]]); }
        for(const i of row.idx){ cells.push(P.steep.rungs[i].height); heads.push([('Height · '+COLS[i][0]),COLS[i][1]]); }
      }
      for(let i=0;i<cells.length;i++){
        const im=await load(cells[i].png);
        c.fillStyle=heads[i][1]; c.font='600 13px system-ui,sans-serif';
        c.fillText(heads[i][0], x(i), yTop+RH-10);
        c.drawImage(im, x(i), yTop+RH, TW, TH);
        c.strokeStyle='#2a2f36'; c.lineWidth=1; c.strokeRect(x(i)+0.5, yTop+RH+0.5, TW-1, TH-1);
        let ty=yTop+RH+TH+16;
        c.fillStyle='#8b939c'; c.font='12px ui-monospace,monospace';
        c.fillText(`${cells[i].cols} colours on the centre row`, x(i), ty); ty+=16;
        c.fillStyle=cells[i].run>=24?'#ff6b6b':'#8b939c';
        c.fillText(`longest identical run: ${cells[i].run} px`, x(i), ty); ty+=16;
        if(r===1){
          const rr=P.plain.rungs[row.idx[i]];
          c.fillStyle='#8b939c';
          const src = (i>=2) ? P.plain.srcLevelsF : P.plain.srcLevels;
          c.fillText(`${rr.levels.toLocaleString()} of ${src.toLocaleString()} source heights kept`, x(i), ty); ty+=16;
          const note = i===0 ? `16-bit step ${P.plain.step16M.toFixed(4)} m`
                    : i===1 ? `24-bit step ${P.plain.step24M.toExponential(2)} m`
                    : i===2 ? `relief ${P.plain.span0M.toFixed(2)} m → ${P.plain.spanFM.toFixed(2)} m`
                            : `tint from true elevation, not the tile`;
          c.fillText(note, x(i), ty);
        }
      }
    }
    return cv.toDataURL('image/png');
  },{res,TW,TH,GAP,M,HEAD,RH,CAP,W,H});

  fs.writeFileSync(OUT, Buffer.from(png.split(',')[1],'base64'));
  const P=res.panels;
  console.log(`\nwrote ${OUT}  (${W}x${H})`);
  for(const k of ['plain','steep']){
    const p=P[k], nm=['A 16-bit       ','B 24-bit       ','C +relief floor','D +contrast    '];
    console.log(`\n${k}: ${p.kmAcross.toFixed(2)} km across, ${p.tw}x${p.th} px`);
    console.log(`  source heights ${p.srcLevels} distinct over ${p.span0M.toFixed(2)} m   (floored: ${p.srcLevelsF} over ${p.spanFM.toFixed(2)} m)`);
    console.log(`  storage step   16-bit ${p.step16M.toFixed(4)} m   24-bit ${p.step24M.toExponential(3)} m`);
    for(let i=0;i<4;i++){ const r=p.rungs[i];
      console.log(`  ${nm[i]}  levels ${String(r.levels).padStart(6)}   biome ${String(r.biome.cols).padStart(4)} cols / run ${String(r.biome.run).padStart(4)} px   height ${String(r.height.cols).padStart(4)} cols / run ${String(r.height.run).padStart(4)} px`);
    }
  }
  await b.close();
})();
