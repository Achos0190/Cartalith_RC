#!/usr/bin/env node
/* Side-by-side at LOD 7: the shipped system vs the deep-zoom-contrast proposal.
 *   node tests/perf/probe_lod7compare.js "Cartalith v2.52 DCC test.html" out.png [floor]
 *
 * This is a FIGURE GENERATOR, not an assertion probe — it renders
 * docs/images/lod7_contrast_compare.png for docs/research/deep-zoom-contrast.md.
 * It exits 0 regardless; read the printed numbers and the image.
 *
 * CURRENT  = relief gate as shipped, 16-bit height over the GLOBAL range (what a baked chunk holds)
 * PROPOSED = relief gate floored, 16-bit height over the CHUNK's own range, and — Height view only —
 *            the colour ramp rebased locally while the HILLSHADE keeps the true heights. That split
 *            is the rAbs/rLocal design; it is not simulable in the Biome view without touching
 *            landColorCore, so the Biome row shows gate + storage only and is labelled as such.
 *
 * ONE BUILD RENDERS BOTH SIDES. buildSwitchable() below patches a throwaway copy of the target so
 * the relief gate reads a runtime global — __RELIEF_FLOOR=0 reproduces the shipped build exactly,
 * which is what makes the "current" column a real control rather than a second implementation.
 * The patch is two substitutions; both gate sites must be hit (amplifyRegion AND addZoomDetail),
 * and the regex tolerates the whitespace difference between them. If a future version renames or
 * reshapes the gate this throws rather than silently patching one site. */
const path=require('path'), fs=require('fs'), os=require('os');

function buildSwitchable(src){
  let s=fs.readFileSync(src,'utf8');
  const GATE=/Math\.min\(1,\s*Math\.hypot\(gx,gy\)\*8\)/g;
  const hits=s.match(GATE);
  if(!hits || hits.length!==2) throw new Error('relief gate: expected 2 sites, found '+(hits?hits.length:0));
  s=s.replace(GATE,"Math.max((typeof __RELIEF_FLOOR!=='undefined'?__RELIEF_FLOOR:0), $&)");
  const i=s.indexOf('<script>');
  if(i<0) throw new Error('no <script> block found');
  s=s.slice(0,i+8)+'var __RELIEF_FLOOR=0;\n'+s.slice(i+8);
  const dst=path.join(os.tmpdir(),'lod7cmp_switchable.html');
  fs.writeFileSync(dst,s);
  return dst;
}
const {chromium}=require(process.env.PLAYWRIGHT_DIR||'/opt/node22/lib/node_modules/playwright');
const FILE=process.argv[2], OUT=process.argv[3], FLOOR=+(process.argv[4]||0.006);
(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium',args:['--no-sandbox']});
  const pg=await b.newPage({viewport:{width:1400,height:900}});
  pg.on('pageerror',e=>console.log('PAGEERROR '+e.message));
  await pg.goto('file://'+buildSwitchable(path.resolve(FILE)));
  await pg.waitForFunction(()=>typeof generate==='function',{timeout:120000});

  const res=await pg.evaluate(async(FLOOR)=>{
    state.world=false; state.resW=1024; state.mapWidthKm=800; state.tect.seed=12345;
    __RELIEF_FLOOR=0; await generate();
    const sea=state.seaLevel, denom=1-sea, mpu=metersPerUnit(), z=7, TS=512;

    const pick=(loR,hiR,flat)=>{ let best=flat?1e9:-1,bi=-1;
      for(let y=8;y<GH-8;y++) for(let x=8;x<GW-8;x++){ const i=y*GW+x; if(field[i]<sea) continue;
        const rr=(field[i]-sea)/denom; if(rr<loR||rr>hiR) continue;
        const g=Math.hypot(field[i+1]-field[i-1],field[i+GW]-field[i-GW]);
        if(flat?(g<best):(g>best)){best=g;bi=i;} } return bi; };
    const sites={plain:pick(0.15,0.55,true), steep:pick(0,1,false)};

    const rng=a=>{let lo=1e9,hi=-1e9;for(let i=0;i<a.length;i++){if(a[i]<lo)lo=a[i];if(a[i]>hi)hi=a[i];}return[lo,hi];};
    const q16Global=a=>{const o=new Float32Array(a.length);
      for(let i=0;i<a.length;i++){const v=a[i]<0?0:a[i]>1?1:a[i];o[i]=Math.round(v*65535)/65535;}return o;};
    const q16Local=a=>{const[lo,hi]=rng(a),sp=(hi-lo)||1e-9,o=new Float32Array(a.length);
      for(let i=0;i<a.length;i++)o[i]=lo+(Math.round(((a[i]-lo)/sp)*65535)/65535)*sp;return o;};
    /* renderHeightTileRGBA, with the colour value and the SHADING value taken from different arrays
       — the rAbs / rLocal split, simulated exactly rather than approximated. */
    const heightRGBA=(shadeArr,colArr,W,H,bounds)=>{
      const out=new Uint8ClampedArray(W*H*4), az=state.sunAz*Math.PI/180, alt=40*Math.PI/180;
      const lx=Math.cos(alt)*Math.sin(az), ly=-Math.cos(alt)*Math.cos(az), lz=Math.sin(alt);
      const ex=tileShadeExag(bounds,W);
      for(let y=0;y<H;y++)for(let x=0;x<W;x++){
        const i=y*W+x, ro=y*W;
        const L=edgeL(shadeArr,W,x,ro),R=edgeR(shadeArr,W,x,ro),U=edgeU(shadeArr,W,H,x,y),D=edgeD(shadeArr,W,H,x,y);
        let nx=-(R-L)*ex, ny=-(D-U)*ex, nz=1; const il=1/Math.hypot(nx,ny,nz); nx*=il;ny*=il;nz*=il;
        const sh=Math.max(0,nx*lx+ny*ly+nz*lz);
        const c=hypso(colArr[i]), s=shadeArr[i]<state.seaLevel?0.75+0.25*sh:0.4+0.6*sh, p=i*4;
        out[p]=c[0]*s; out[p+1]=c[1]*s; out[p+2]=c[2]*s; out[p+3]=255; }
      return out; };
    const LOCAL_K=0.7;
    const heightRGBAlocal=(arr,W,H,bounds)=>{
      const out=new Uint8ClampedArray(W*H*4), az=state.sunAz*Math.PI/180, alt=40*Math.PI/180;
      const lx=Math.cos(alt)*Math.sin(az), ly=-Math.cos(alt)*Math.cos(az), lz=Math.sin(alt);
      const ex=tileShadeExag(bounds,W); const[lo,hi]=rng(arr), sp=(hi-lo)||1e-9;
      for(let y=0;y<H;y++)for(let x=0;x<W;x++){
        const i=y*W+x, ro=y*W;
        const L=edgeL(arr,W,x,ro),R=edgeR(arr,W,x,ro),U=edgeU(arr,W,H,x,y),D=edgeD(arr,W,H,x,y);
        let nx=-(R-L)*ex, ny=-(D-U)*ex, nz=1; const il=1/Math.hypot(nx,ny,nz); nx*=il;ny*=il;nz*=il;
        const sh=Math.max(0,nx*lx+ny*ly+nz*lz);
        const c=hypso(arr[i]);                                   // rAbs: tint from TRUE elevation
        const rLocal=(arr[i]-lo)/sp;                             // rLocal: continuous shading only
        const s=(arr[i]<state.seaLevel?0.75+0.25*sh:0.4+0.6*sh)*(1+LOCAL_K*(rLocal-0.5));
        const p=i*4; out[p]=c[0]*s; out[p+1]=c[1]*s; out[p+2]=c[2]*s; out[p+3]=255; }
      return out; };
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

      __RELIEF_FLOOR=0;      const tCur=pyramidTile(field,GW,GH,z,col,row,TS,lodTileOpts());
      __RELIEF_FLOOR=FLOOR;  const tPro=pyramidTile(field,GW,GH,z,col,row,TS,lodTileOpts());
      __RELIEF_FLOOR=0;
      const cur=tCur.data, pro=tPro.data, TW=tCur.w, TH=tCur.h;
      const curBaked=q16Global(cur), proBaked=q16Local(pro);

      const bCur=renderBiomeTileRGBA(curBaked,TW,TH,bb), bPro=renderBiomeTileRGBA(proBaked,TW,TH,bb);
      const hCur=heightRGBA(curBaked,curBaked,TW,TH,bb);
      const hPro=heightRGBAlocal(proBaked,TW,TH,bb);

      const[clo,chi]=rng(cur),[plo,phi]=rng(pro);
      panels[key]={ kmAcross:(bb.w/(GW-1))*800, tw:TW, th:TH,
        spanCurM:(chi-clo)*mpu, spanProM:(phi-plo)*mpu,
        stepCurM:mpu/65535, stepProM:((phi-plo)*mpu)/65535,
        biomeCur:{png:toPNG(bCur,TW,TH),...stat(bCur,TW,TH)}, biomePro:{png:toPNG(bPro,TW,TH),...stat(bPro,TW,TH)},
        heightCur:{png:toPNG(hCur,TW,TH),...stat(hCur,TW,TH)}, heightPro:{png:toPNG(hPro,TW,TH),...stat(hPro,TW,TH)} };
    }
    return {panels, z, TS, floor:FLOOR, mpu, tw:panels.plain.tw, th:panels.plain.th};
  },FLOOR);

  /* composite */
  const TS=res.tw, TH=res.th, GAP=10, M=18, HEAD=46, COLH=30, ROWH=26, CAP=40;
  const W=M*2+TS*4+GAP*3, H=HEAD+COLH+(ROWH+TH+CAP)*2+M;
  const png=await pg.evaluate(async({res,TS,TH,GAP,M,HEAD,COLH,ROWH,CAP,W,H})=>{
    const cv=document.createElement('canvas'); cv.width=W; cv.height=H;
    const c=cv.getContext('2d');
    c.fillStyle='#14161a'; c.fillRect(0,0,W,H);
    const load=src=>new Promise(r=>{const im=new Image();im.onload=()=>r(im);im.src=src;});
    c.fillStyle='#e8eaed'; c.font='600 20px system-ui,sans-serif';
    c.fillText(`Cartalith — LOD 7 tile, 6.25 km across, 512 px.  Current system vs proposal.  seed 12345 · 800 km · 1024 px`, M, 28);
    c.fillStyle='#9aa3ad'; c.font='13px system-ui,sans-serif';
    c.fillText(`CURRENT = shipped relief gate + 16-bit height over the GLOBAL range (what a baked chunk stores).   PROPOSED = relief gate floored at ${res.floor} + 16-bit over the CHUNK's own range.   lo/span are taken per tile here; the shipped design reads them from a world-wide field so neighbours agree (no seam).` , M, 44);
    const cols=[['LOWLAND PLAIN — current','#f0b429'],['LOWLAND PLAIN — proposed','#4fd18b'],
                ['STEEP — current','#f0b429'],['STEEP — proposed','#4fd18b']];
    const x=i=>M+i*(TS+GAP);
    c.font='600 14px system-ui,sans-serif';
    cols.forEach((t,i)=>{ c.fillStyle=t[1]; c.fillText(t[0], x(i), HEAD+20); });
    const rows=[['Biome view — the default map (gate + storage only; the colour rebase is not simulable here, see §6.1)','biome'],
                ['Relief / Height view — gate + storage + local contrast. The hypsometric tint still comes from the TRUE elevation (rAbs), so a plain stays a plain; only luminance is stretched locally (rLocal)','height']];
    const P=res.panels;
    for(let r=0;r<2;r++){
      const yTop=HEAD+COLH+r*(ROWH+TH+CAP);
      c.fillStyle='#c7ccd1'; c.font='600 13px system-ui,sans-serif';
      c.fillText(rows[r][0], M, yTop+17);
      const set=rows[r][1];
      const cells=[P.plain[set+'Cur'],P.plain[set+'Pro'],P.steep[set+'Cur'],P.steep[set+'Pro']];
      for(let i=0;i<4;i++){
        const im=await load(cells[i].png);
        c.drawImage(im, x(i), yTop+ROWH, TS, TH);
        c.strokeStyle='#2a2f36'; c.lineWidth=1; c.strokeRect(x(i)+0.5, yTop+ROWH+0.5, TS-1, TH-1);
        c.fillStyle='#8b939c'; c.font='12px ui-monospace,monospace';
        c.fillText(`${cells[i].cols} colours on the centre row`, x(i), yTop+ROWH+TH+16);
        const bad=cells[i].run>=24;
        c.fillStyle=bad?'#ff6b6b':'#8b939c';
        c.fillText(`longest identical run: ${cells[i].run} px`, x(i), yTop+ROWH+TH+32);
      }
      if(r===1){
        c.fillStyle='#8b939c'; c.font='12px ui-monospace,monospace';
        c.fillText(`16-bit step ${P.plain.stepCurM.toFixed(4)} m`, x(0), yTop+ROWH+TH+48);
        c.fillText(`16-bit step ${P.plain.stepProM.toExponential(2)} m  (${(P.plain.stepCurM/P.plain.stepProM).toFixed(0)}x finer)`, x(1), yTop+ROWH+TH+48);
        c.fillText(`tile spans ${P.steep.spanCurM.toFixed(0)} m`, x(2), yTop+ROWH+TH+48);
        c.fillText(`tile spans ${P.steep.spanProM.toFixed(0)} m`, x(3), yTop+ROWH+TH+48);
      }
    }
    return cv.toDataURL('image/png');
  },{res,TS,TH,GAP,M,HEAD,COLH,ROWH,CAP,W,H});

  fs.writeFileSync(OUT, Buffer.from(png.split(',')[1],'base64'));
  const P=res.panels;
  console.log(`\nwrote ${OUT}`);
  for(const k of ['plain','steep']){
    const p=P[k];
    console.log(`\n${k}: ${p.kmAcross.toFixed(2)} km across, span ${p.spanCurM.toFixed(1)} m -> ${p.spanProM.toFixed(1)} m (relief floor)`);
    console.log(`  Biome  current ${p.biomeCur.cols} cols / run ${p.biomeCur.run} px   proposed ${p.biomePro.cols} cols / run ${p.biomePro.run} px`);
    console.log(`  Height current ${p.heightCur.cols} cols / run ${p.heightCur.run} px   proposed ${p.heightPro.cols} cols / run ${p.heightPro.run} px`);
    console.log(`  16-bit step ${p.stepCurM.toFixed(4)} m -> ${p.stepProM.toExponential(2)} m`);
  }
  await b.close();
})();
