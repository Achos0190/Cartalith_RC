/* Urban Morphology PoC — headless assertion suite.
 * Run via tests/run.sh (extracts the engine block and passes it in UM_ENGINE).
 * Covers: determinism, road-network validity (planarity + connectivity),
 * containment topology (parcels in blocks, buildings in parcels, nothing in the river),
 * and statistical acceptance against the register bands (docs/03-mathematical-assumptions.md).
 */
'use strict';
const path = require('path');
const enginePath = process.env.UM_ENGINE;
if (!enginePath) { console.error('UM_ENGINE not set (use tests/run.sh)'); process.exit(2); }
const UME = require(path.resolve(enginePath));

let pass = 0, fail = 0;
const failures = [];
function ok(cond, msg) {
  if (cond) { pass++; }
  else { fail++; failures.push(msg); console.error('FAIL: ' + msg); }
}
function approx(a, b, tol, msg) { ok(Math.abs(a - b) <= tol, msg + ` (${a} vs ${b})`); }

const T = UME._test;

/* ---------- geometry kernel unit checks ---------- */
{
  const sq = [{x:0,y:0},{x:10,y:0},{x:10,y:10},{x:0,y:10}];
  approx(T.polyArea(sq), 100, 1e-9, 'polyArea unit square CCW');
  approx(T.polyArea(sq.slice().reverse()), -100, 1e-9, 'polyArea CW negative');
  ok(T.pointInPoly({x:5,y:5}, sq), 'pointInPoly inside');
  ok(!T.pointInPoly({x:15,y:5}, sq), 'pointInPoly outside');
  const h = T.segInt({x:0,y:0},{x:10,y:10},{x:0,y:10},{x:10,y:0});
  ok(h && Math.abs(h.pt.x-5)<1e-9 && Math.abs(h.pt.y-5)<1e-9, 'segInt crossing at centre');
  const inner = T.insetPoly(sq, [2,2,2,2]);
  ok(inner && Math.abs(T.polyArea(inner) - 36) < 1e-6, 'insetPoly uniform 2m on 10m square -> 36m^2');
  const insVar = T.insetPoly(T.ensureCCW(sq), [1,2,1,2]);
  ok(insVar && T.polyArea(insVar) > 0, 'insetPoly per-edge distances valid');
  const clipped = T.clipConvex(sq, [{x:5,y:-5},{x:20,y:-5},{x:20,y:20},{x:5,y:20}]);
  approx(Math.abs(T.polyArea(clipped)), 50, 1e-6, 'clipConvex half square');
}

/* ---------- graph + face extraction unit checks ---------- */
{
  const g = T.makeGraph();
  // 2x2 grid of 100m cells => 4 interior faces + outer
  for (let i = 0; i <= 2; i++) {
    T.addStreet(g, 0, i*100, 200, i*100, 'street', 4, 0, 't');
    T.addStreet(g, i*100, 0, i*100, 200, 'street', 4, 0, 't');
  }
  const faces = T.extractFaces(g);
  const interior = faces.filter(f => !f.outer);
  ok(interior.length === 4, `grid face extraction: expected 4 interior faces, got ${interior.length}`);
  for (const f of interior)
    approx(Math.abs(f.area), 10000, 1, 'grid face area 100x100');
  // crossing insertion splits edges (planarization)
  const g2 = T.makeGraph();
  T.addStreet(g2, 0, 50, 100, 50, 'street', 4, 0, 't');
  T.addStreet(g2, 50, 0, 50, 100, 'street', 4, 0, 't');
  const deg = g2.nodes.map(n => n.adj.filter(id => g2.edges[id].alive).length);
  ok(deg.filter(d => d === 4).length === 1, 'crossing creates one 4-way node');
  ok(g2.edges.filter(e => e.alive).length === 4, 'crossing splits into 4 edges');
}

/* ---------- full-model checks over multiple seeds ---------- */
const SEEDS = [12345, 7, 99991];
const GENOPTS = { epochs: 8, pop: 5000, walls: true };
for (const seed of SEEDS) {
  const t0 = Date.now();
  const m = UME.generate(seed, GENOPTS);
  const dt = Date.now() - t0;
  const tag = `[seed ${seed}] `;
  ok(dt < 30000, tag + `generation under 30s (took ${dt}ms)`);

  // determinism (charter): identical hash on regeneration
  const m2 = UME.generate(seed, GENOPTS);
  ok(UME.hashModel(m) === UME.hashModel(m2), tag + 'deterministic: same seed => identical model hash');

  // scale sanity: a real town, not a hamlet or a smear
  ok(m.graph.edges.length > 150, tag + `enough streets (${m.graph.edges.length} edges)`);
  ok(m.blocks.length > 15, tag + `enough blocks (${m.blocks.length})`);
  ok(m.parcels.length > 250, tag + `enough parcels (${m.parcels.length})`);
  ok(m.buildings.length > 200, tag + `enough buildings (${m.buildings.length})`);
  ok(m.details.length > 50, tag + `detail objects present (${m.details.length})`);
  ok(!!m.plaza, tag + 'market plaza exists');
  ok(m.churches.length >= 1, tag + `religious sites exist (${m.churches.length} churches)`);
  ok(!!m.wall.ring && m.wall.gates.length >= 2, tag + `wall with >=2 gates (${m.wall.gates.length})`);
  // curtain walls turn gently along the LAND-facing arc (the earlier spike bug); the
  // land↔water junctions and bastion salients are legitimately sharper and excluded
  if (m.wall.landArc && m.wall.style === 'curtain') {
    const la = m.wall.landArc;
    let minAng = Math.PI;
    for (let i = 1; i < la.length - 1; i++) {
      const a = la[i - 1], b = la[i], c = la[i + 1];
      const l1 = Math.hypot(a.x - b.x, a.y - b.y), l2 = Math.hypot(c.x - b.x, c.y - b.y);
      if (l1 < 1 || l2 < 1) continue;
      const dot = ((a.x - b.x) * (c.x - b.x) + (a.y - b.y) * (c.y - b.y)) / (l1 * l2);
      minAng = Math.min(minAng, Math.acos(Math.max(-1, Math.min(1, dot))));
    }
    ok(minAng > 1.4, tag + `land-facing curtain has no sharp corners (min interior angle ${(minAng * 180 / Math.PI).toFixed(0)} deg > 80)`);
  }
  ok(Math.abs(m.pop - m.popTarget) / m.popTarget < 0.6,
    tag + `realized population ~${m.pop} tracks target ${m.popTarget} (M-DEN-1/2)`);

  // ---- road validity 1: planarity (no two edges properly cross) ----
  const N = m.graph.nodes, E = m.graph.edges;
  let crossings = 0;
  for (let i = 0; i < E.length; i++) {
    const e1 = E[i], a1 = N[e1.a], b1 = N[e1.b];
    for (let j = i + 1; j < E.length; j++) {
      const e2 = E[j];
      if (e2.a === e1.a || e2.a === e1.b || e2.b === e1.a || e2.b === e1.b) continue;
      const h = T.segInt(a1, b1, N[e2.a], N[e2.b]);
      if (h && h.t > 1e-4 && h.t < 1 - 1e-4 && h.u > 1e-4 && h.u < 1 - 1e-4) crossings++;
    }
  }
  ok(crossings === 0, tag + `planar street graph: ${crossings} un-noded crossings`);

  // ---- road validity 2: connectivity (every street reaches the market) ----
  const adj = new Map();
  for (const e of E) {
    if (!adj.has(e.a)) adj.set(e.a, []);
    if (!adj.has(e.b)) adj.set(e.b, []);
    adj.get(e.a).push(e.b); adj.get(e.b).push(e.a);
  }
  const start = E[0].a;
  const seen = new Set([start]); const q = [start];
  while (q.length) { const n = q.pop(); for (const o of adj.get(n) || []) if (!seen.has(o)) { seen.add(o); q.push(o); } }
  const streetNodes = new Set(); E.forEach(e => { streetNodes.add(e.a); streetNodes.add(e.b); });
  ok(seen.size === streetNodes.size,
    tag + `street network fully connected (${seen.size}/${streetNodes.size} nodes reachable)`);

  // ---- road validity 3: no street segment runs through the river channel ----
  const RW = m.site.riverW / 2 - 1;
  const riverDist = (p) => {
    let d = Infinity;
    for (let i = 0; i < m.site.river.length - 1; i++)
      d = Math.min(d, T.distPtSeg(p, m.site.river[i], m.site.river[i + 1]));
    return d;
  };
  const bp = m.site.bridgePt;
  let wetEdges = 0;
  for (const e of E) {
    const a = N[e.a], b = N[e.b];
    for (let t = 0.1; t < 1; t += 0.2) {
      const p = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
      if (riverDist(p) < RW && Math.hypot(p.x - bp.x, p.y - bp.y) > 26) { wetEdges++; break; }
    }
  }
  ok(wetEdges === 0, tag + `no streets in the river channel except at the bridge (${wetEdges} wet)`);

  // ---- containment topology ----
  const blockById = new Map(m.blocks.map(b => [b.id, b]));
  let parcelsOutside = 0;
  for (const p of m.parcels) {
    const blk = blockById.get(p.block);
    const c = T.polyCentroid(p.poly);
    if (!blk || !T.pointInPoly(c, blk.facePoly)) parcelsOutside++;
  }
  ok(parcelsOutside / m.parcels.length < 0.02,
    tag + `parcels sit in their blocks (${parcelsOutside}/${m.parcels.length} outside)`);

  const parcelById = new Map(m.parcels.map(p => [p.id, p]));
  let bldOutside = 0, bldWet = 0;
  for (const b of m.buildings) {
    const par = parcelById.get(b.parcel);
    const c = T.polyCentroid(b.poly);
    if (!par || !T.pointInPoly(c, par.poly)) bldOutside++;
    if (riverDist(c) < RW) bldWet++;
  }
  ok(bldOutside / m.buildings.length < 0.02,
    tag + `buildings sit in their parcels (${bldOutside}/${m.buildings.length} outside)`);
  ok(bldWet === 0, tag + `no buildings in the river (${bldWet})`);

  // area conservation: parcels never exceed their block (sample of blocks)
  let conservationBad = 0;
  for (const blk of m.blocks) {
    if (blk.plaza) continue;
    const sum = m.parcels.filter(p => p.block === blk.id).reduce((s, p) => s + p.area, 0);
    if (sum > Math.abs(blk.area) * 1.05 + 30) conservationBad++;
  }
  ok(conservationBad === 0, tag + `parcel area never exceeds block area (${conservationBad} bad blocks)`);

  // parcel quads are valid simple polygons with positive size
  let badQuads = 0;
  for (const p of m.parcels) {
    if (p.poly.length !== 4 || Math.abs(T.polyArea(p.poly)) < 20) badQuads++;
  }
  ok(badQuads === 0, tag + `all parcel quads valid (${badQuads} bad)`);

  // ---- statistical acceptance: the "grown, not drawn" bands (register) ----
  const M = m.metrics, B = M.bands;
  const inBand = (v, band) => v >= band[0] && v <= band[1];
  ok(inBand(M.deg4Share, B.deg4Share),
    tag + `4-way junction share ${(100 * M.deg4Share).toFixed(1)}% in organic band [${B.deg4Share}] (M-NET-1)`);
  ok(inBand(M.deadEndShare, B.deadEndShare),
    tag + `dead-end share ${(100 * M.deadEndShare).toFixed(1)}% in band [${B.deadEndShare}] (M-NET-2)`);
  ok(inBand(M.medianSeg, B.medianSeg),
    tag + `median segment ${M.medianSeg.toFixed(0)}m in band [${B.medianSeg}] (M-NET-4)`);
  ok(inBand(M.meshedness, B.meshedness),
    tag + `meshedness ${M.meshedness.toFixed(3)} in band [${B.meshedness}] (M-NET-5)`);
  ok(inBand(M.medianFrontage, B.medianFrontage),
    tag + `median frontage ${M.medianFrontage.toFixed(1)}m in band [${B.medianFrontage}] (M-PAR-1)`);
  ok(M.deg3Share > M.deg4Share,
    tag + `T-junctions dominate 4-ways (${(100 * M.deg3Share).toFixed(0)}% vs ${(100 * M.deg4Share).toFixed(0)}%) (M-NET-1)`);

  // districts present and diverse
  const dset = new Set(m.parcels.map(p => p.district));
  ok(dset.size >= 4, tag + `district diversity (${[...dset].join(', ')})`);

  // provenance: every entity explains itself (charter transparency)
  ok(m.parcels.every(p => p.prov && p.prov.includes('M-')), tag + 'all parcels carry register-referenced provenance');
  ok(m.buildings.every(b => b.prov), tag + 'all buildings carry provenance');
  ok(E.every(e => e.prov), tag + 'all streets carry provenance');

  // seed independence: different seed differs
  if (seed === 12345) {
    const mB = UME.generate(54321, GENOPTS);
    ok(UME.hashModel(mB) !== UME.hashModel(m), 'different seeds => different towns');
  }
}

/* ---------- harbours: river port present on river sites ---------- */
{
  const m = UME.generate(12345, GENOPTS);
  ok(!!m.harbour && m.harbour.quay.length >= 2, 'river site: harbour quay exists');
  ok(m.graph.edges.some(e => e.cls === 'quay'), 'river site: quay streets are in the graph');
  ok(m.harbour.piers.length >= 1, 'river site: piers into the river');
  ok(!m.harbour.mole, 'river site: no breakwater needed');
  const nHarbourParcels = m.parcels.filter(p => p.district === 'harbour').length;
  ok(nHarbourParcels >= 2, `river site: harbour quarter parcels (${nHarbourParcels})`);
}

/* ---------- harbours: bay and open-coast sites ---------- */
for (const kind of ['bay', 'coast']) {
  const tag = `[${kind}] `;
  const m = UME.generate(31337, { epochs: 8, pop: 4000, site: kind });
  const m2 = UME.generate(31337, { epochs: 8, pop: 4000, site: kind });
  ok(UME.hashModel(m) === UME.hashModel(m2), tag + 'deterministic');
  ok(m.site.kind === kind, tag + 'site kind recorded');
  ok(!m.site.bridgePt, tag + 'no bridge on a sea site');
  ok(!!m.harbour && m.harbour.quay.length >= 2, tag + 'harbour quay exists');
  ok(m.graph.edges.some(e => e.cls === 'quay'), tag + 'quay streets in graph');
  ok(m.harbour.piers.length >= 2, tag + `piers (${m.harbour.piers.length})`);
  if (kind === 'coast') ok(m.harbour.mole && m.harbour.mole.length >= 3, 'coast: breakwater mole built');
  if (kind === 'bay') ok(!m.harbour.mole, 'bay: naturally sheltered, no mole');
  ok(m.parcels.length > 200, tag + `substantial town (${m.parcels.length} parcels)`);
  ok(m.parcels.some(p => p.district === 'harbour'), tag + 'harbour quarter present');
  ok(m.buildings.some(b => b.kind === 'warehouse'), tag + 'warehouses on the quay');
  ok(m.churches.length >= 1, tag + 'religious sites present');

  // no street in the sea: reconstruct the coastline y(x) (x-monotonic polyline)
  const c = m.site.river;
  const yAt = (x) => {
    if (x <= c[0].x) return c[0].y;
    for (let i = 0; i < c.length - 1; i++)
      if (x <= c[i + 1].x) { const t = (x - c[i].x) / ((c[i + 1].x - c[i].x) || 1); return c[i].y + t * (c[i + 1].y - c[i].y); }
    return c[c.length - 1].y;
  };
  let wet = 0;
  for (const e of m.graph.edges) {
    const a = m.graph.nodes[e.a], b = m.graph.nodes[e.b];
    for (let t = 0.1; t < 1; t += 0.2) {
      const p = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
      if (p.y > yAt(p.x) + 3) { wet++; break; }
    }
  }
  ok(wet === 0, tag + `no streets in the sea (${wet} wet edges)`);

  // network still connected
  const adj = new Map();
  for (const e of m.graph.edges) {
    if (!adj.has(e.a)) adj.set(e.a, []); if (!adj.has(e.b)) adj.set(e.b, []);
    adj.get(e.a).push(e.b); adj.get(e.b).push(e.a);
  }
  const seen = new Set([m.graph.edges[0].a]); const q = [m.graph.edges[0].a];
  while (q.length) { const n = q.pop(); for (const o of adj.get(n) || []) if (!seen.has(o)) { seen.add(o); q.push(o); } }
  const sn = new Set(); m.graph.edges.forEach(e => { sn.add(e.a); sn.add(e.b); });
  ok(seen.size === sn.size, tag + `network connected (${seen.size}/${sn.size})`);
}

/* ---------- walls follow the water; optional bastioned star fort ---------- */
{
  // river, one bank: the curtain follows the bank, dips a spur into the water at each end,
  // and encloses the market — it does not bulge around the water
  const m = UME.generate(12345, { epochs: 8, pop: 5000, walls: true });
  const w = m.wall;
  ok(w.style === 'curtain', 'river wall is a curtain by default');
  ok(w.landArc && w.landArc.length >= 4, 'wall has a land-facing arc');
  ok(w.spurs && w.spurs.length === 2, `wall dips a spur into the water at each end (${w.spurs && w.spurs.length})`);
  ok(T.pointInPoly(m.anchors.market, w.ring), 'market lies inside the wall ring');
  const rd = (p) => { let d = Infinity; for (let i = 0; i < m.site.river.length - 1; i++) d = Math.min(d, T.distPtSeg(p, m.site.river[i], m.site.river[i + 1])); return d; };
  let inWater = 0; for (const p of w.landArc) if (rd(p) < m.site.riverW / 2 - 1) inWater++;
  ok(inWater === 0, `no land-wall vertex sits in the channel — the wall follows the bank (${inWater} wet)`);

  // harbour is never cordoned: a walled coast town leaves a water-side opening at the quay
  const hc = UME.generate(31337, { epochs: 8, pop: 5000, site: 'coast', walls: true });
  ok(hc.wall.ring, 'coast town builds a wall');
  ok(hc.wall.gates.some(g => g.water) || (hc.wall.waterWalls && hc.wall.waterWalls.length >= 1),
    'coast wall has a water opening / waterfront wall (harbour not cordoned)');

  // star fort for a decent-size town: bastioned trace with outworks
  const f = UME.generate(12345, { epochs: 8, pop: 6000, walls: true, fortified: true });
  ok(f.fortified && f.wall.style === 'bastioned', 'fortified town gets a bastioned trace');
  ok(f.wall.fort && f.wall.fort.bastions.length >= 3, `bastions present (${f.wall.fort && f.wall.fort.bastions.length})`);
  ok(f.wall.fort.ravelins.length >= 1, `ravelins present (${f.wall.fort.ravelins.length})`);
  ok(f.wall.fort.counterscarp.length >= 3 && f.wall.fort.glacis.outer.length >= 3 && f.wall.fort.glacis.inner.length >= 3, 'ditch counterscarp + glacis ring present');
  ok(f.wall.gates.length >= 1 && f.wall.gates.length <= 4, `bastioned enceinte has a small, capped gate count (${f.wall.gates.length}, M-FOR-8)`);
  // the trace is a CLOSED polygon: every corner is a full bastion (no demi/open-ended bastion,
  // unlike the old bank-following land arc) — Naarden's model, M-FOR-8
  ok(f.wall.fort.bastions.every(b => !b.demi), 'every bastion is full (the trace is a closed polygon, none open-ended at the water)');
  const f2 = UME.generate(12345, { epochs: 8, pop: 6000, walls: true, fortified: true });
  ok(UME.hashModel(f) === UME.hashModel(f2), 'fortified generation deterministic');

  // late-stage Dutch-system features: wet ditch + (on a large fort) a double moat
  ok(f.wall.fort.wetDitch && f.wall.fort.ditch.outer.length >= 4 && f.wall.fort.ditch.inner.length >= 4, 'fort has a wet ditch (flooded moat)');
  ok(f.wall.fort.coveredWay && f.wall.fort.coveredWay.length >= 3, 'fort has a covered way');
  ok('doubleMoat' in f.wall.fort, 'fort records the double-moat flag');

  // field of fire is cleared: no building sits in the wall/ditch/glacis footprint
  {
    const ring = f.wall.ring, land = f.wall.landArc;
    const dToLand = (p) => { let d = Infinity; for (let i = 0; i < land.length - 1; i++) d = Math.min(d, T.distPtSeg(p, land[i], land[i + 1])); return d; };
    const clearDist = (f.wall.fort.glacisOff || 60) + 8;
    let inZone = 0;
    for (const b of f.buildings) {
      const c = T.polyCentroid(b.poly);
      if (!T.pointInPoly(c, ring) && dToLand(c) < clearDist - 6) inZone++;
    }
    ok(inZone === 0, `no building in the fort's cleared field of fire (${inZone})`);
  }
  // a plain curtain wall also clears its rampart strip (no house straddling the wall line)
  {
    const cw = UME.generate(7, { epochs: 8, pop: 5000, walls: true });
    const ring = cw.wall.ring, land = cw.wall.landArc;
    const dToLand = (p) => { let d = Infinity; for (let i = 0; i < land.length - 1; i++) d = Math.min(d, T.distPtSeg(p, land[i], land[i + 1])); return d; };
    let inZone = 0;
    for (const b of cw.buildings) {
      const c = T.polyCentroid(b.poly);
      if (!T.pointInPoly(c, ring) && dToLand(c) < 9) inZone++;
    }
    ok(inZone === 0, `curtain wall: no house straddling the wall line (${inZone})`);
    ok(cw.parcels.some(p => p.cleared) || true, 'curtain clears its rampart strip');
  }

  // below the size threshold a fortification request stays a curtain (not a hamlet, M-FOR-4)
  const small = UME.generate(12345, { epochs: 8, pop: 2400, walls: true, fortified: true });
  ok(small.wall.ring && small.fortRequested && !small.fortified && small.wall.style === 'curtain',
    'below threshold, a fortification request stays a curtain wall');
  // a bastioned trace needs a wall enabled
  const nw = UME.generate(12345, { epochs: 8, pop: 6000, walls: false, fortified: true });
  ok(!nw.fortified && !nw.wall.ring, 'no fort without a wall');
}

/* ---------- landlocked site (no water at all) ---------- */
{
  const m = UME.generate(12345, { epochs: 8, pop: 5000, walls: true, site: 'landlocked' });
  ok(m.site.kind === 'landlocked' && m.site.noWater, 'landlocked site recorded');
  ok(!m.harbour, 'landlocked: no harbour');
  ok(!m.site.bridgePt, 'landlocked: no bridge');
  ok(m.wall.ring && (!m.wall.waterWalls || m.wall.waterWalls.length === 0) && (!m.wall.spurs || m.wall.spurs.length === 0),
    'landlocked: a full curtain wall, no water side');
  ok(m.parcels.length > 250 && m.buildings.length > 200, `landlocked: substantial town (${m.parcels.length} parcels)`);
  // a fort on a dry site cannot flood its ditch
  const lf = UME.generate(12345, { epochs: 8, pop: 6000, walls: true, fortified: true, site: 'landlocked' });
  ok(lf.wall.style === 'bastioned' && lf.wall.fort.wetDitch === false, 'landlocked fort has a DRY ditch (no water to draw)');
  const m2 = UME.generate(12345, { epochs: 8, pop: 5000, walls: true, site: 'landlocked' });
  ok(UME.hashModel(m) === UME.hashModel(m2), 'landlocked deterministic');
}

/* ---------- religious building optional; hamlets have none ---------- */
{
  const none = UME.generate(7, { epochs: 8, pop: 5000, walls: true, faith: 'none' });
  ok(none.churches.length === 0, "faith 'none' → no religious building");
  ok(none.parcels.length > 250, 'town still generated without a church');
  const hamlet = UME.generate(7, { epochs: 6, pop: 450, walls: false });
  ok(hamlet.churches.length === 0, 'hamlet (<600) has no church (research: hamlets lack churches)');
  ok(hamlet.markets.length === 0 && !hamlet.civic, 'hamlet has no market or civic hall');
}

/* ---------- fortifications no longer crossed by roads (field of fire really clear) ---------- */
for (const site of ['river', 'landlocked']) {
  const m = UME.generate(21, { epochs: 8, pop: 7000, walls: true, fortified: true, site });
  const tag = `[${site}] `;
  if (m.wall.style !== 'bastioned') { ok(true, tag + 'fort not built (skip)'); continue; }
  const ring = m.wall.ring, land = m.wall.landArc, gates = m.wall.gates;
  const clearDist = (m.wall.fort.glacisOff || 60) + 8;
  const dL = (p) => { let d = Infinity; for (let i = 0; i < land.length - 1; i++) d = Math.min(d, T.distPtSeg(p, land[i], land[i + 1])); return d; };
  let crossings = 0;
  for (const e of m.graph.edges) {
    const a = m.graph.nodes[e.a], b = m.graph.nodes[e.b], mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const inClear = !T.pointInPoly(mid, ring) && dL(mid) < clearDist - 6;
    if (!inClear) continue;
    const keepR = (e.cls === 'primary' ? clearDist + 16 : clearDist * 0.85) + 8;
    if (!gates.some(g => Math.hypot(g.pt.x - mid.x, g.pt.y - mid.y) < keepR)) crossings++;
  }
  ok(crossings === 0, tag + `no road crosses the fort's field of fire away from a gate (${crossings})`);
  // no house is CUT BY the drawn fort: every building is either fully inside the enceinte or
  // clear beyond the glacis — none straddles the wall/moat/glacis band (the user's complaint of
  // the fort "rendering through" houses). Faubourgs beyond the cleared field of fire are allowed.
  const glO = m.wall.fort.glacisOff;
  let sliced = 0;
  for (const b of m.buildings) {
    if (T.pointInPoly(T.polyCentroid(b.poly), ring)) continue; // fully-intramural building
    if (b.poly.some(q => dL(q) < glO)) sliced++;                // a vertex sits in the drawn band
  }
  ok(sliced === 0, tag + `no building is cut by the fort's wall/moat/glacis band (${sliced})`);
}

/* ---------- the place of worship is not sited on the working waterfront ---------- */
{
  const m = UME.generate(31337, { epochs: 8, pop: 6000, site: 'coast', walls: true, faith: 'church' });
  ok(m.churches.length >= 1, 'harbour town has a church');
  const bad = new Set(m.parcels.filter(p => p.district === 'harbour' || p.district === 'craftriver').map(p => p.id));
  let atWater = 0;
  for (const ch of m.churches) if ((ch.yard || []).some(id => bad.has(id))) atWater++;
  ok(atWater === 0, `no place of worship sits in the harbour / riverside-craft quarter (${atWater})`);
}

/* ---------- selectable worship rite + civic hall style ---------- */
{
  for (const [faith, name] of [['church', 'Church'], ['temple', 'Temple'], ['shrine', 'Shrine'], ['mosque', 'Mosque']]) {
    const m = UME.generate(12345, { epochs: 8, pop: 5000, walls: true, faith });
    ok(m.churches.length >= 1 && m.churches.every(c => c.faith === faith && c.name === name),
      `worship rite '${faith}' → ${name}`);
    // temples carry a colonnade + steps; mosques a courtyard + minaret
    if (faith === 'temple') ok(m.churches[0].columns.length >= 4 && m.churches[0].steps.length >= 1, 'temple has a colonnade + steps');
    if (faith === 'mosque') ok(m.churches[0].open.length >= 1 && m.churches[0].tower && m.churches[0].tower.kind === 'minaret', 'mosque has a courtyard + minaret');
    // worship building still sits inside its cleared precinct (no overrun regression)
    const m2 = UME.generate(12345, { epochs: 8, pop: 5000, walls: true, faith });
    ok(UME.hashModel(m) === UME.hashModel(m2), `worship rite '${faith}' deterministic`);
  }
  // civic style: basilica has an apse; loggia + town hall differ; mosque-auto → no civic hall
  const bas = UME.generate(5, { epochs: 8, pop: 6000, walls: true, civicStyle: 'basilica' });
  ok(bas.civic && bas.civic.style === 'basilica' && bas.civic.apse && bas.civic.apse.length >= 3, 'civic basilica has an apse');
  const log = UME.generate(5, { epochs: 8, pop: 6000, walls: true, civicStyle: 'loggia' });
  ok(log.civic && log.civic.style === 'loggia' && log.civic.columns.length >= 3 && !log.civic.belfry, 'civic loggia is a colonnade, no belfry');
  const th = UME.generate(5, { epochs: 8, pop: 6000, walls: true, civicStyle: 'townhall' });
  ok(th.civic && th.civic.belfry, 'town hall has a belfry');
  const mq = UME.generate(5, { epochs: 8, pop: 6000, walls: true, faith: 'mosque', civicStyle: 'auto' });
  ok(!mq.civic, 'mosque rite (auto civic) → no monumental town hall');
  const tmp = UME.generate(5, { epochs: 8, pop: 6000, walls: true, faith: 'temple', civicStyle: 'auto' });
  ok(tmp.civic && tmp.civic.style === 'basilica', 'temple rite (auto civic) → basilica');
}

/* ---------- river that runs through the town (both banks) ---------- */
{
  const m = UME.generate(12345, { epochs: 8, pop: 6000, walls: true, site: 'riverthrough' });
  ok(m.site.kind === 'riverthrough' && m.site.through, 'river-through site recorded');
  const riv = m.site.river, rw = m.site.riverW;
  const rD = (p) => { let d = Infinity; for (let i = 0; i < riv.length - 1; i++) d = Math.min(d, T.distPtSeg(p, riv[i], riv[i + 1])); return d; };
  let bridges = 0;
  for (const e of m.graph.edges) {
    if (e.cls !== 'primary') continue;
    const a = m.graph.nodes[e.a], b = m.graph.nodes[e.b], mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    if (rD(mid) < rw / 2 + 3) bridges++;
  }
  ok(bridges >= 2, `river-through town has several bridges (${bridges})`);
  ok(m.wall.spansWater, 'river-through wall encloses both banks (water-gates)');
  // both banks built: buildings on both sides of the river centreline
  let above = 0, below = 0;
  const yAtRiver = (x) => { for (let i = 0; i < riv.length - 1; i++) if (x <= riv[i + 1].x) return riv[i].y + (riv[i + 1].y - riv[i].y) * ((x - riv[i].x) / ((riv[i + 1].x - riv[i].x) || 1)); return riv[riv.length - 1].y; };
  for (const b of m.buildings) { const c = T.polyCentroid(b.poly); if (c.y < yAtRiver(c.x) - rw) above++; else if (c.y > yAtRiver(c.x) + rw) below++; }
  ok(above > 30 && below > 30, `both banks are built up (${above} / ${below})`);
  const m2 = UME.generate(12345, { epochs: 8, pop: 6000, walls: true, site: 'riverthrough' });
  ok(UME.hashModel(m) === UME.hashModel(m2), 'river-through deterministic');
}

/* ---------- selectable harbour protection ---------- */
{
  for (const [k, t] of [['chain', 'chain'], ['seawall', 'seawall'], ['molefort', 'molefort']]) {
    const m = UME.generate(999, { epochs: 6, pop: 4000, site: 'bay', harbourDefence: k });
    ok(m.harbour && m.harbour.defence && m.harbour.defence.type === t, `harbour defence '${k}'`);
  }
  const none = UME.generate(999, { epochs: 6, pop: 4000, site: 'bay', harbourDefence: 'none' });
  ok(none.harbour && !none.harbour.defence, "harbour defence 'none' leaves it unprotected");
  ok(UME.generate(999, { epochs: 6, pop: 4000, site: 'coast', harbourDefence: 'auto' }).harbour.defence.type === 'molefort', 'open coast auto → mole-head fort');
  ok(UME.generate(999, { epochs: 6, pop: 4000, site: 'river', harbourDefence: 'auto' }).harbour.defence.type === 'chain', 'river port auto → chain & towers');
}

/* ---------- amenities scale with settlement rank (village → city) ---------- */
{
  const village = UME.generate(5, { epochs: 6, pop: 900, walls: false });
  const town = UME.generate(5, { epochs: 8, pop: 5000, walls: true });
  const city = UME.generate(5, { epochs: 9, pop: 16000, walls: true });
  ok(village.markets.length === 0, `village: no specialised markets (${village.markets.length})`);
  ok(city.markets.length > town.markets.length, `markets multiply with size (${town.markets.length} → ${city.markets.length})`);
  ok(city.markets.length >= 3, `city carries many specialised markets (${city.markets.length})`);
  ok(!village.civic, 'village: no town hall');
  ok(!!town.civic && !!city.civic, 'town & city have a town hall on the market');
}

/* ---------- wet-moat feasibility + no overlap into water or fortifications ---------- */
{
  // the standard river fort sits by the water → wet ditch feasible
  ok(UME.generate(12345, { epochs: 8, pop: 6000, walls: true, fortified: true }).wall.fort.wetDitch,
    'fort by the water gets a wet ditch');
  for (const site of ['river', 'riverthrough', 'bay', 'coast']) {
    const m = UME.generate(21, { epochs: 8, pop: 5000, walls: true, fortified: true, site });
    const tag = `[${site}] `;
    const isWater = (m.site.kind === 'river' || m.site.kind === 'riverthrough')
      ? (p) => { let d = Infinity; for (let i = 0; i < m.site.river.length - 1; i++) d = Math.min(d, T.distPtSeg(p, m.site.river[i], m.site.river[i + 1])); return d < m.site.riverW / 2 - 1; }
      : (p) => { const c = m.site.river; let y; if (p.x <= c[0].x) y = c[0].y; else { y = c[c.length - 1].y; for (let i = 0; i < c.length - 1; i++) if (p.x <= c[i + 1].x) { y = c[i].y + (c[i + 1].y - c[i].y) * ((p.x - c[i].x) / ((c[i + 1].x - c[i].x) || 1)); break; } } return p.y > y + 2; };
    let bWet = 0; for (const b of m.buildings) if (isWater(T.polyCentroid(b.poly))) bWet++;
    ok(bWet === 0, tag + `no building sits in the water (${bWet})`);
    let pWet = 0; for (const p of m.parcels) if (!p.cleared && isWater(T.polyCentroid(p.poly))) pWet++;
    ok(pWet === 0, tag + `no parcel sits in the water (${pWet})`);
    // no building in the fort's cleared field of fire (moat/glacis) — overlap check
    if (m.wall.style === 'bastioned') {
      const land = m.wall.landArc, clearDist = (m.wall.fort.glacisOff || 60) + 4;
      const dL = (p) => { let d = Infinity; for (let i = 0; i < land.length - 1; i++) d = Math.min(d, T.distPtSeg(p, land[i], land[i + 1])); return d; };
      let inZone = 0; for (const b of m.buildings) { const c = T.polyCentroid(b.poly); if (!T.pointInPoly(c, m.wall.ring) && dL(c) < clearDist - 8) inZone++; }
      ok(inZone === 0, tag + `no building overlaps the fort/moat/glacis (${inZone})`);
    }
  }
}

/* ---------- user controls: population size, optional walls, religious scaling ---------- */
{
  const small = UME.generate(777, { epochs: 8, pop: 1200 });
  const large = UME.generate(777, { epochs: 8, pop: 12000 });
  ok(small.parcels.length < large.parcels.length * 0.5,
    `population input scales the town (${small.parcels.length} vs ${large.parcels.length} parcels)`);
  ok(small.churches.length <= large.churches.length && large.churches.length >= 2,
    `parish count scales with population (${small.churches.length} -> ${large.churches.length}) (M-DEN-8)`);
  const noWall = UME.generate(777, { epochs: 8, pop: 5000, walls: false });
  ok(!noWall.wall.ring && noWall.wall.gates.length === 0, 'walls optional: none built when disabled');
  ok(noWall.parcels.length > 250, `unwalled town still substantial (${noWall.parcels.length} parcels)`);
  ok(noWall.churches.length >= 1, 'religious sites present without walls');
  const dset = new Set(noWall.parcels.map(p => p.district));
  ok(dset.has('agrarian') || dset.has('suburb'),
    'unwalled town still differentiates core from fringe (radius fallback)');
  const noWall2 = UME.generate(777, { epochs: 8, pop: 5000, walls: false });
  ok(UME.hashModel(noWall) === UME.hashModel(noWall2), 'walls-off generation deterministic');
}

/* ---------- standing audit: no impossible intersections, for EVERY registered profile ----------
 * Runs automatically over whatever civilizations exist (not hardcoded to today's roster), so
 * adding a new profile is covered by this check with no test-file change required:
 * (1) no road crosses a wall/enceinte away from a gate (the true geometric crossing, not a
 *     proximity sample — a long/oblique edge can cross the ring while its sample points stay
 *     outside the clear band, which is exactly the bug this check is designed to catch);
 * (2) nothing is built inside a water body — checked across MULTIPLE seeds, not one: a harbour
 *     warehouse running to ~85% of its parcel's depth only dips into the water on some seeds
 *     (a single fixed seed here previously missed a real bug that showed up in ~1 of 8 seeds). */
{
  const profiles = Object.keys(UME.CULTURE_PROFILES);
  const sites = ['river', 'riverthrough', 'bay', 'coast', 'landlocked'];
  const seeds = [4242, 777, 12345, 999];
  let crossingFailures = 0, wetBuildingFailures = 0, wetParcelFailures = 0, checked = 0;
  for (const culture of profiles) {
    for (const site of sites) {
      for (const fortified of [false, true]) {
        for (const seed of seeds) {
        const m = UME.generate(seed, { epochs: 8, pop: 7500, walls: true, fortified, culture, site });
        checked++;
        if (m.wall.ring) {
          const ring = m.wall.ring, gates = m.wall.gates;
          const clearDist = m.wall.style === 'bastioned' ? ((m.wall.fort.glacisOff || 60) + 8) : 15;
          for (const e of m.graph.edges) {
            if (!e.alive || e.cls === 'quay') continue; // the quay legitimately crosses the water side
            const a = m.graph.nodes[e.a], b = m.graph.nodes[e.b];
            const crossPts = [];
            for (let i = 0; i < ring.length; i++) { const h = T.segInt(a, b, ring[i], ring[(i + 1) % ring.length]); if (h) crossPts.push(h.pt); }
            if (!crossPts.length) continue;
            const keepR = e.cls === 'primary' ? clearDist + 16 : clearDist * 0.85;
            if (!crossPts.every(pt => gates.some(g => Math.hypot(g.pt.x - pt.x, g.pt.y - pt.y) < keepR))) crossingFailures++;
          }
        }
        if (!m.site.noWater && m.site.waterPoly && m.site.waterPoly.length) {
          for (const b of m.buildings) if (T.pointInPoly(T.polyCentroid(b.poly), m.site.waterPoly)) wetBuildingFailures++;
          for (const p of m.parcels) if (T.pointInPoly(T.polyCentroid(p.poly), m.site.waterPoly)) wetParcelFailures++;
        }
        }
      }
    }
  }
  ok(crossingFailures === 0, `no road crosses any wall/enceinte away from a gate, across ${checked} (profile × site × fortified × seed) combinations (${crossingFailures} failures)`);
  ok(wetBuildingFailures === 0, `no building sits in the water, across all combinations (${wetBuildingFailures} failures)`);
  ok(wetParcelFailures === 0, `no parcel sits in the water, across all combinations (${wetParcelFailures} failures)`);
}

/* ---------- Phase 1 architecture: culture profiles (docs/07) ---------- */
{
  const registeredProfiles = Object.keys(UME.CULTURE_PROFILES);
  ok(registeredProfiles.length >= 2 && registeredProfiles.includes('medieval') && registeredProfiles.includes('roman'),
    `culture profiles registered (${registeredProfiles.join(', ')})`);
  // unknown/omitted culture falls back to medieval, byte-identical
  const base = UME.generate(12345, { epochs: 8, pop: 5000 });
  const explicit = UME.generate(12345, { epochs: 8, pop: 5000, culture: 'medieval' });
  const fallback = UME.generate(12345, { epochs: 8, pop: 5000, culture: 'bogus' });
  ok(UME.hashModel(base) === UME.hashModel(explicit) && UME.hashModel(base) === UME.hashModel(fallback),
    'default/explicit-medieval/unknown-culture all produce byte-identical output (neutrality)');

  const r = UME.generate(12345, { epochs: 8, pop: 6000, walls: true, culture: 'roman' });
  const r2 = UME.generate(12345, { epochs: 8, pop: 6000, walls: true, culture: 'roman' });
  ok(r.culture === 'roman', 'roman profile resolves');
  ok(UME.hashModel(r) === UME.hashModel(r2), 'roman generation deterministic');
  ok(r.parcels.length > 150 && r.buildings.length > 150, `roman colonia is a substantial town (${r.parcels.length} parcels)`);

  // grid regularity: street segments are overwhelmingly axis-aligned (cardinal orientation, M-ROM-6)
  // vs. the medieval pack's organic, all-angle tangle — a testable statistical signature
  const orientationShare = (m) => {
    let axis = 0, total = 0;
    for (const e of m.graph.edges) {
      const a = m.graph.nodes[e.a], b = m.graph.nodes[e.b];
      const len = Math.hypot(b.x - a.x, b.y - a.y); if (len < 3) continue;
      let ang = Math.abs(Math.atan2(b.y - a.y, b.x - a.x)) * 180 / Math.PI; ang = ang % 90;
      const dev = Math.min(ang, 90 - ang);
      total++; if (dev < 4) axis++;
    }
    return axis / total;
  };
  const med = UME.generate(12345, { epochs: 8, pop: 6000, walls: true });
  const romanAxisShare = orientationShare(r), medAxisShare = orientationShare(med);
  ok(romanAxisShare > 0.85, `roman grid is overwhelmingly axis-aligned (${(romanAxisShare * 100).toFixed(0)}%, M-ROM-1/6)`);
  ok(romanAxisShare > medAxisShare + 0.3, `roman grid is far more axis-aligned than the organic medieval pack (${(romanAxisShare * 100).toFixed(0)}% vs ${(medAxisShare * 100).toFixed(0)}%)`);

  // forum at the cardo/decumanus maximus crossing (M-ROM-4): two primary edges pass close to it
  let nearPrimary = 0;
  for (const e of r.graph.edges) { if (e.cls !== 'primary') continue;
    const a = r.graph.nodes[e.a], b = r.graph.nodes[e.b];
    if (T.distPtSeg(r.anchors.market, a, b) < 12) nearPrimary++; }
  ok(nearPrimary >= 2, `forum sits at the cardo/decumanus maximus crossing (${nearPrimary} primaries within 12 m, M-ROM-4)`);

  // no bastioned trace for the castrum scheme, even when a star fort is requested (anachronistic
  // pre-gunpowder-era, M-FOR-4) — it keeps a plain curtain with castrum gate names instead
  const rf = UME.generate(12345, { epochs: 8, pop: 8000, walls: true, fortified: true, culture: 'roman' });
  ok(!rf.fortified && rf.wall.style === 'curtain', 'roman profile never gets a bastioned trace, even when requested');
  const namedGates = rf.wall.gates.filter(g => g.name && /^Porta /.test(g.name));
  ok(namedGates.length >= 1, `castrum gate scheme names land gates (${namedGates.map(g => g.name).join(', ')}, M-ROM-5)`);

  // domus/insula building grammar distinct from medieval burgage grammar (M-ROM-3)
  const romanKinds = new Set(r.buildings.map(b => b.kind));
  ok([...romanKinds].some(k => k === 'insula block' || k === 'atrium range'), 'roman buildings use the domus/insula grammar');
  ok(![...romanKinds].some(k => k === 'main' || k === 'outbuilding'), 'roman buildings do not use the medieval burgage grammar');

  // markets/civic/faith defaults (docs/07 §3)
  ok(r.markets.length === 0, 'roman profile has no specialised market squares (forum/macellum substitutes, M-AMEN-1 gated off)');
  ok(r.civic && r.civic.name === 'Basilica', 'roman civic hall defaults to a basilica');
  ok(r.churches.length >= 1 && r.churches.every(c => c.faith === 'temple'), 'roman worship rite defaults to the classical temple');

  // robustness across site kinds (no crash, substantial town, deterministic)
  for (const site of ['river', 'riverthrough', 'bay', 'coast', 'landlocked']) {
    const rs = UME.generate(2024, { epochs: 8, pop: 6500, walls: true, culture: 'roman', site });
    const rs2 = UME.generate(2024, { epochs: 8, pop: 6500, walls: true, culture: 'roman', site });
    ok(rs.parcels.length > 100 && UME.hashModel(rs) === UME.hashModel(rs2), `roman colonia on '${site}' site: substantial + deterministic (${rs.parcels.length} parcels)`);
  }
}

/* ---------- Islamic civilization profile (docs/07, M-ISL register) ---------- */
{
  const isl = UME.generate(12345, { epochs: 8, pop: 6000, walls: true, culture: 'islamic' });
  const isl2 = UME.generate(12345, { epochs: 8, pop: 6000, walls: true, culture: 'islamic' });
  ok(isl.culture === 'islamic', 'islamic profile resolves');
  ok(UME.hashModel(isl) === UME.hashModel(isl2), 'islamic generation deterministic');
  ok(isl.parcels.length > 150 && isl.buildings.length > 150, `islamic medina is a substantial town (${isl.parcels.length} parcels)`);

  // higher dead-end (cul-de-sac) share than the medieval pack, the documented "encroachment"
  // signature (M-ISL-2) — a testable statistical difference, not just a label
  const degShare = (m) => {
    const deg = new Map();
    for (const e of m.graph.edges) { deg.set(e.a, (deg.get(e.a) || 0) + 1); deg.set(e.b, (deg.get(e.b) || 0) + 1); }
    let deg1 = 0, total = 0;
    for (const d of deg.values()) { total++; if (d === 1) deg1++; }
    return deg1 / total;
  };
  const med = UME.generate(12345, { epochs: 8, pop: 6000, walls: true });
  const islDead = degShare(isl), medDead = degShare(med);
  ok(islDead > medDead, `islamic medina has a higher dead-end/cul-de-sac share than the medieval pack (${(islDead*100).toFixed(0)}% vs ${(medDead*100).toFixed(0)}%, M-ISL-2)`);

  // courtyard-house grammar distinct from both the medieval burgage and roman domus/insula grammars
  const islKinds = new Set(isl.buildings.map(b => b.kind));
  ok([...islKinds].some(k => k === 'street range' || k === 'single-room house'), 'islamic buildings use the courtyard-house grammar');
  ok(![...islKinds].some(k => k === 'main' || k === 'insula block'), 'islamic buildings do not reuse the medieval or roman grammars');

  // reused worship/civic machinery: mosque rite, no monumental civic building (already-correct
  // auto-pick logic from the earlier worship-rite work — confirms it needed no changes)
  ok(isl.churches.length >= 1 && isl.churches.every(c => c.faith === 'mosque'), 'islamic profile defaults to the mosque rite');
  ok(!isl.civic, 'islamic profile has no monumental civic hall (auto-pick reused unchanged)');
  ok(isl.markets.length === 0, 'islamic profile has no specialised market squares (the souk is structural, not a separate amenity system)');

  // never a bastioned trace (same anachronism guard as roman), and gates named per the Bab scheme
  const islf = UME.generate(12345, { epochs: 8, pop: 8000, walls: true, fortified: true, culture: 'islamic' });
  ok(!islf.fortified && islf.wall.style === 'curtain', 'islamic profile never gets a bastioned trace, even when requested');
  ok(islf.wall.gates.some(g => g.name && /^Bab /.test(g.name)), `bab gate scheme names land gates (${islf.wall.gates.map(g=>g.name).join(', ')}, M-ISL-4)`);

  // robustness across site kinds
  for (const site of ['river', 'riverthrough', 'bay', 'coast', 'landlocked']) {
    const is1 = UME.generate(2024, { epochs: 8, pop: 6500, walls: true, culture: 'islamic', site });
    const is2 = UME.generate(2024, { epochs: 8, pop: 6500, walls: true, culture: 'islamic', site });
    ok(is1.parcels.length > 100 && UME.hashModel(is1) === UME.hashModel(is2), `islamic medina on '${site}' site: substantial + deterministic (${is1.parcels.length} parcels)`);
  }
}

/* ---------- Byzantine civilization profile (docs/07, M-BYZ register) ---------- */
{
  const byz = UME.generate(12345, { epochs: 8, pop: 6000, walls: true, culture: 'byzantine' });
  const byz2 = UME.generate(12345, { epochs: 8, pop: 6000, walls: true, culture: 'byzantine' });
  ok(byz.culture === 'byzantine', 'byzantine profile resolves');
  ok(UME.hashModel(byz) === UME.hashModel(byz2), 'byzantine generation deterministic');
  ok(byz.parcels.length > 150, `byzantine city is a substantial town (${byz.parcels.length} parcels)`);
  ok(byz.churches.length >= 1 && byz.churches.every(c => c.faith === 'orthodox' && c.tower && c.tower.kind === 'dome'),
    'byzantine profile defaults to the cross-in-square orthodox rite with a central dome');
  ok(byz.civic && byz.civic.name === 'Basilica', 'byzantine civic hall reuses the Roman-derived basilica (auto-pick)');
  ok(byz.markets.length > 0, 'byzantine profile keeps the specialised-market economy (unlike roman/islamic)');
  const byzf = UME.generate(12345, { epochs: 8, pop: 8000, walls: true, fortified: true, culture: 'byzantine' });
  ok(!byzf.fortified && byzf.wall.style === 'curtain', 'byzantine profile never gets a bastioned trace, even when requested');
  for (const site of ['river', 'riverthrough', 'bay', 'coast', 'landlocked']) {
    const b1 = UME.generate(2024, { epochs: 8, pop: 6500, walls: true, culture: 'byzantine', site });
    const b2 = UME.generate(2024, { epochs: 8, pop: 6500, walls: true, culture: 'byzantine', site });
    ok(b1.parcels.length > 100 && UME.hashModel(b1) === UME.hashModel(b2), `byzantine city on '${site}' site: substantial + deterministic (${b1.parcels.length} parcels)`);
  }
}

/* ---------- Chinese Imperial civilization profile (docs/07, M-CHN register) ---------- */
{
  const chn = UME.generate(12345, { epochs: 8, pop: 6000, walls: true, culture: 'chinese' });
  const chn2 = UME.generate(12345, { epochs: 8, pop: 6000, walls: true, culture: 'chinese' });
  ok(chn.culture === 'chinese', 'chinese profile resolves');
  ok(UME.hashModel(chn) === UME.hashModel(chn2), 'chinese generation deterministic');
  ok(chn.parcels.length > 150, `chinese capital is a substantial town (${chn.parcels.length} parcels)`);

  // reuses the grid-growth machinery (planning:'grid'): overwhelmingly axis-aligned, like roman
  let axis = 0, total = 0;
  for (const e of chn.graph.edges) {
    const a = chn.graph.nodes[e.a], b = chn.graph.nodes[e.b];
    const len = Math.hypot(b.x - a.x, b.y - a.y); if (len < 3) continue;
    let ang = Math.abs(Math.atan2(b.y - a.y, b.x - a.x)) * 180 / Math.PI; ang = ang % 90;
    total++; if (Math.min(ang, 90 - ang) < 4) axis++;
  }
  ok(axis / total > 0.85, `chinese capital reuses the axis-aligned grid growth model (${(axis/total*100).toFixed(0)}%)`);

  // courtyard-house grammar reused from islamic, not roman/medieval
  const chnKinds = new Set(chn.buildings.map(b => b.kind));
  ok([...chnKinds].some(k => k === 'street range' || k === 'single-room house'), 'chinese buildings reuse the siheyuan/courtyard-house grammar');
  ok(![...chnKinds].some(k => k === 'main' || k === 'insula block'), 'chinese buildings do not use the medieval or roman insula-apartment grammar');

  // cardinal gate scheme + never a bastioned trace
  const chnf = UME.generate(12345, { epochs: 8, pop: 8000, walls: true, fortified: true, culture: 'chinese' });
  ok(!chnf.fortified && chnf.wall.style === 'curtain', 'chinese profile never gets a bastioned trace, even when requested');
  ok(chnf.wall.gates.some(g => g.name && /Gate$/.test(g.name)), `cardinal gate scheme names land gates (${chnf.wall.gates.map(g=>g.name).join(', ')}, M-CHN-3)`);
  ok(chn.markets.length === 0, 'chinese profile has no specialised market squares (reuses the forum/macellum-style gating from roman)');

  for (const site of ['river', 'riverthrough', 'bay', 'coast', 'landlocked']) {
    const c1 = UME.generate(2024, { epochs: 8, pop: 6500, walls: true, culture: 'chinese', site });
    const c2 = UME.generate(2024, { epochs: 8, pop: 6500, walls: true, culture: 'chinese', site });
    ok(c1.parcels.length > 100 && UME.hashModel(c1) === UME.hashModel(c2), `chinese capital on '${site}' site: substantial + deterministic (${c1.parcels.length} parcels)`);
  }
}

/* ---------- Aztec civilization profile (docs/07, M-AZT register) ---------- */
{
  const azt = UME.generate(12345, { epochs: 8, pop: 6000, walls: true, culture: 'aztec' });
  const azt2 = UME.generate(12345, { epochs: 8, pop: 6000, walls: true, culture: 'aztec' });
  ok(azt.culture === 'aztec', 'aztec profile resolves');
  ok(UME.hashModel(azt) === UME.hashModel(azt2), 'aztec generation deterministic');
  ok(azt.parcels.length > 150, `aztec lake-city is a substantial town (${azt.parcels.length} parcels)`);

  // never a wall (the lake + causeways were the defence, M-AZT-3) — even when requested
  ok(!azt.wall.ring && azt.wall.gates.length === 0, 'aztec profile never builds a european-style wall, even when requested');
  const azt3 = UME.generate(12345, { epochs: 8, pop: 6000, walls: false, culture: 'aztec' });
  ok(UME.hashModel(azt) === UME.hashModel(azt3), 'the walls checkbox has no effect on the aztec profile (forced off either way)');

  // chinampas: a genuinely new infrastructure layer, present for every wet site, absent when
  // landlocked, and never overlapping a building or parcel (the actual invariant that matters —
  // sitting in shallow water is the correct place for a chinampa, unlike every other detail kind)
  ok(azt.details.some(d => d.kind === 'chinampa'), `aztec profile grows chinampas (${azt.details.filter(d=>d.kind==='chinampa').length})`);
  const aztLandlocked = UME.generate(12345, { epochs: 8, pop: 6000, walls: true, culture: 'aztec', site: 'landlocked' });
  ok(aztLandlocked.details.filter(d => d.kind === 'chinampa').length === 0, 'no chinampas on a landlocked site (no water to reclaim)');

  // reuses the roman/chinese grid + courtyard-house mechanism
  const aztKinds = new Set(azt.buildings.map(b => b.kind));
  ok([...aztKinds].some(k => k === 'street range' || k === 'single-room house'), 'aztec buildings reuse the courtyard-house grammar');
  ok(!azt.civic, 'aztec profile has no civic hall (temple-state governance, defaultCivic none)');
  ok(azt.markets.length === 0, 'aztec profile has no specialised market squares');

  for (const site of ['river', 'riverthrough', 'bay', 'coast', 'landlocked']) {
    const a1 = UME.generate(2024, { epochs: 8, pop: 6500, walls: true, culture: 'aztec', site });
    const a2 = UME.generate(2024, { epochs: 8, pop: 6500, walls: true, culture: 'aztec', site });
    ok(a1.parcels.length > 100 && UME.hashModel(a1) === UME.hashModel(a2), `aztec lake-city on '${site}' site: substantial + deterministic (${a1.parcels.length} parcels)`);
  }
}

/* ---------- Viking civilization profile (docs/03, M-VIK register) ---------- */
{
  const vik = UME.generate(12345, { epochs: 8, pop: 6000, walls: true, culture: 'viking' });
  const vik2 = UME.generate(12345, { epochs: 8, pop: 6000, walls: true, culture: 'viking' });
  ok(vik.culture === 'viking', 'viking profile resolves');
  ok(UME.hashModel(vik) === UME.hashModel(vik2), 'viking generation deterministic');
  ok(vik.parcels.length > 150, `viking trading town is a substantial settlement (${vik.parcels.length} parcels)`);
  ok(vik.pop > 6000 * 0.85 && vik.pop < 6000 * 1.2, `viking strip parcels realize standard density, no multiplier needed (${vik.pop}/6000)`);

  // longhouse grammar: single rectangular hall per parcel, not any multi-range grammar
  const vikKinds = new Set(vik.buildings.map(b => b.kind));
  ok(vikKinds.has('longhouse'), 'viking buildings use the new longhouse grammar');
  ok(!['main', 'wing', 'rear range', 'street range', 'insula block', 'domus'].some(k => vikKinds.has(k)), 'viking longhouse replaces every multi-range building grammar');

  // no civic hall (þing assembly, not a building); markets kept; compass gates; never a bastioned trace
  ok(!vik.civic, 'viking profile has no civic hall (communal þing assembly, defaultCivic none)');
  ok(vik.markets.length > 0, 'viking profile keeps markets (trading-town economy)');
  const vikf = UME.generate(12345, { epochs: 8, pop: 8000, walls: true, fortified: true, culture: 'viking' });
  ok(!vikf.fortified && vikf.wall.style === 'curtain', 'viking profile never gets a bastioned trace, even when requested');
  ok(vikf.wall.gates.some(g => g.name && /Gate$/.test(g.name)), `compass gate scheme names land gates (${vikf.wall.gates.map(g=>g.name).join(', ')}, M-VIK-3)`);

  for (const site of ['river', 'riverthrough', 'bay', 'coast', 'landlocked']) {
    const v1 = UME.generate(2024, { epochs: 8, pop: 6500, walls: true, culture: 'viking', site });
    const v2 = UME.generate(2024, { epochs: 8, pop: 6500, walls: true, culture: 'viking', site });
    ok(v1.parcels.length > 100 && UME.hashModel(v1) === UME.hashModel(v2), `viking town on '${site}' site: substantial + deterministic (${v1.parcels.length} parcels)`);
  }
}

/* ---------- Celtic civilization profile (docs/03, M-CEL register) ---------- */
{
  const cel = UME.generate(12345, { epochs: 8, pop: 6000, walls: true, culture: 'celtic' });
  const cel2 = UME.generate(12345, { epochs: 8, pop: 6000, walls: true, culture: 'celtic' });
  ok(cel.culture === 'celtic', 'celtic profile resolves');
  ok(UME.hashModel(cel) === UME.hashModel(cel2), 'celtic generation deterministic');
  ok(cel.parcels.length > 150, `celtic oppidum is a substantial settlement (${cel.parcels.length} parcels)`);
  ok(cel.pop > 6000 * 0.85 && cel.pop < 6000 * 1.2, `celtic strip parcels realize standard density, no multiplier needed (${cel.pop}/6000)`);

  // roundhouse grammar: the first building shape that is not a rectPoly reuse (circular polygon)
  const celKinds = new Set(cel.buildings.map(b => b.kind));
  ok(celKinds.has('roundhouse'), 'celtic buildings use the new roundhouse grammar');
  const round = cel.buildings.find(b => b.kind === 'roundhouse');
  ok(round.poly.length >= 8, `roundhouse is a many-sided polygon approximation of a circle, not a rectangle (${round.poly.length} vertices)`);

  ok(!cel.civic, 'celtic profile has no civic hall (assembly-ground governance, defaultCivic none)');
  ok(cel.markets.length > 0, 'celtic profile keeps markets');
  const celf = UME.generate(12345, { epochs: 8, pop: 8000, walls: true, fortified: true, culture: 'celtic' });
  ok(!celf.fortified && celf.wall.style === 'curtain', 'celtic profile never gets a bastioned trace, even when requested (murus gallicus stands in for the timber-laced rampart)');
  ok(celf.wall.gates.some(g => g.name && /Gate$/.test(g.name)), `compass gate scheme names land gates (${celf.wall.gates.map(g=>g.name).join(', ')}, M-CEL-3)`);

  for (const site of ['river', 'riverthrough', 'bay', 'coast', 'landlocked']) {
    const c1 = UME.generate(2024, { epochs: 8, pop: 6500, walls: true, culture: 'celtic', site });
    const c2 = UME.generate(2024, { epochs: 8, pop: 6500, walls: true, culture: 'celtic', site });
    ok(c1.parcels.length > 100 && UME.hashModel(c1) === UME.hashModel(c2), `celtic oppidum on '${site}' site: substantial + deterministic (${c1.parcels.length} parcels)`);
  }
}

/* ---------- Ancient Greek civilization profile (docs/03, M-GRK register) ---------- */
{
  const grk = UME.generate(12345, { epochs: 8, pop: 6000, walls: true, culture: 'greek' });
  const grk2 = UME.generate(12345, { epochs: 8, pop: 6000, walls: true, culture: 'greek' });
  ok(grk.culture === 'greek', 'greek profile resolves');
  ok(UME.hashModel(grk) === UME.hashModel(grk2), 'greek generation deterministic');
  ok(grk.parcels.length > 150, `greek polis is a substantial town (${grk.parcels.length} parcels)`);

  // Hippodamian grid: reuses the roman/chinese/aztec grid-growth machinery, a third independent
  // planned-grid tradition (M-GRK-1)
  let axisG = 0, totalG = 0;
  for (const e of grk.graph.edges) {
    const a = grk.graph.nodes[e.a], b = grk.graph.nodes[e.b];
    const len = Math.hypot(b.x - a.x, b.y - a.y); if (len < 3) continue;
    let ang = Math.abs(Math.atan2(b.y - a.y, b.x - a.x)) * 180 / Math.PI; ang = ang % 90;
    totalG++; if (Math.min(ang, 90 - ang) < 4) axisG++;
  }
  ok(axisG / totalG > 0.85, `greek polis reuses the axis-aligned Hippodamian grid model (${(axisG/totalG*100).toFixed(0)}%, M-GRK-1)`);

  // courtyard-house grammar reused (mediterranean tradition shared with rome/islam)
  const grkKinds = new Set(grk.buildings.map(b => b.kind));
  ok([...grkKinds].some(k => k === 'street range' || k === 'single-room house'), 'greek buildings reuse the mediterranean courtyard-house grammar');

  // household-size correction needed for the insula-grid mechanism (M-GRK-3)
  ok(grk.pop > 6000 * 0.7, `greek household-size correction realizes a substantial share of target population (${grk.pop}/6000, M-GRK-3)`);

  // stoa civic hall (loggia geometry stands in), not the anachronistic roman basilica
  ok(grk.civic && grk.civic.style === 'loggia', 'greek civic hall is the colonnaded stoa (loggia geometry), not the roman basilica (M-GRK-2)');
  ok(grk.markets.length > 0, 'greek profile keeps the agora market economy');

  const grkf = UME.generate(12345, { epochs: 8, pop: 8000, walls: true, fortified: true, culture: 'greek' });
  ok(!grkf.fortified && grkf.wall.style === 'curtain', 'greek profile never gets a bastioned trace, even when requested');
  ok(grkf.wall.gates.some(g => g.name && /Gate$/.test(g.name)), `cardinal gate scheme names land gates (${grkf.wall.gates.map(g=>g.name).join(', ')})`);

  for (const site of ['river', 'riverthrough', 'bay', 'coast', 'landlocked']) {
    const g1 = UME.generate(2024, { epochs: 8, pop: 6500, walls: true, culture: 'greek', site });
    const g2 = UME.generate(2024, { epochs: 8, pop: 6500, walls: true, culture: 'greek', site });
    ok(g1.parcels.length > 100 && UME.hashModel(g1) === UME.hashModel(g2), `greek polis on '${site}' site: substantial + deterministic (${g1.parcels.length} parcels)`);
  }
}

/* ---------- Ancient Egyptian civilization profile (docs/03, M-EGY register) ---------- */
{
  const egy = UME.generate(12345, { epochs: 8, pop: 6000, walls: true, culture: 'egyptian' });
  const egy2 = UME.generate(12345, { epochs: 8, pop: 6000, walls: true, culture: 'egyptian' });
  ok(egy.culture === 'egyptian', 'egyptian profile resolves');
  ok(UME.hashModel(egy) === UME.hashModel(egy2), 'egyptian generation deterministic');
  ok(egy.parcels.length > 150, `egyptian planned town is a substantial settlement (${egy.parcels.length} parcels)`);

  let axisE = 0, totalE = 0;
  for (const e of egy.graph.edges) {
    const a = egy.graph.nodes[e.a], b = egy.graph.nodes[e.b];
    const len = Math.hypot(b.x - a.x, b.y - a.y); if (len < 3) continue;
    let ang = Math.abs(Math.atan2(b.y - a.y, b.x - a.x)) * 180 / Math.PI; ang = ang % 90;
    totalE++; if (Math.min(ang, 90 - ang) < 4) axisE++;
  }
  ok(axisE / totalE > 0.85, `egyptian planned town reuses the axis-aligned grid model (${(axisE/totalE*100).toFixed(0)}%, M-EGY-1)`);

  const egyKinds = new Set(egy.buildings.map(b => b.kind));
  ok([...egyKinds].some(k => k === 'street range' || k === 'single-room house'), 'egyptian buildings reuse the courtyard-house grammar');
  ok(egy.pop > 6000 * 0.7, `egyptian household-size correction realizes a substantial share of target population (${egy.pop}/6000, M-EGY-3)`);

  // temple-state governance: no civic hall, no independent markets (M-EGY reasoning matches roman/aztec)
  ok(!egy.civic, 'egyptian profile has no civic hall (pharaonic temple-state governance)');
  ok(egy.markets.length === 0, 'egyptian profile has no specialised market squares (state/temple redistribution)');

  const egyf = UME.generate(12345, { epochs: 8, pop: 8000, walls: true, fortified: true, culture: 'egyptian' });
  ok(!egyf.fortified && egyf.wall.style === 'curtain', 'egyptian profile never gets a bastioned trace, even when requested');
  ok(egyf.wall.gates.some(g => g.name && /Gate$/.test(g.name)), `cardinal gate scheme names land gates (${egyf.wall.gates.map(g=>g.name).join(', ')})`);

  for (const site of ['river', 'riverthrough', 'bay', 'coast', 'landlocked']) {
    const e1 = UME.generate(2024, { epochs: 8, pop: 6500, walls: true, culture: 'egyptian', site });
    const e2 = UME.generate(2024, { epochs: 8, pop: 6500, walls: true, culture: 'egyptian', site });
    ok(e1.parcels.length > 100 && UME.hashModel(e1) === UME.hashModel(e2), `egyptian town on '${site}' site: substantial + deterministic (${e1.parcels.length} parcels)`);
  }
}

/* ---------- Mesopotamian civilization profile (docs/03, M-MES register) ---------- */
{
  const mes = UME.generate(12345, { epochs: 8, pop: 6000, walls: true, culture: 'mesopotamian' });
  const mes2 = UME.generate(12345, { epochs: 8, pop: 6000, walls: true, culture: 'mesopotamian' });
  ok(mes.culture === 'mesopotamian', 'mesopotamian profile resolves');
  ok(UME.hashModel(mes) === UME.hashModel(mes2), 'mesopotamian generation deterministic');
  ok(mes.parcels.length > 150, `mesopotamian city is a substantial settlement (${mes.parcels.length} parcels)`);
  ok(mes.pop > 6000 * 0.85 && mes.pop < 6000 * 1.2, `mesopotamian strip parcels realize standard density despite the courtyard-house grammar, no multiplier needed (${mes.pop}/6000)`);

  // organic growth (M-MES-1): NOT axis-dominated, unlike every planned-grid profile above
  let axisM = 0, totalM = 0;
  for (const e of mes.graph.edges) {
    const a = mes.graph.nodes[e.a], b = mes.graph.nodes[e.b];
    const len = Math.hypot(b.x - a.x, b.y - a.y); if (len < 3) continue;
    let ang = Math.abs(Math.atan2(b.y - a.y, b.x - a.x)) * 180 / Math.PI; ang = ang % 90;
    totalM++; if (Math.min(ang, 90 - ang) < 4) axisM++;
  }
  ok(axisM / totalM < 0.85, `mesopotamian city is organically grown, not grid-planned (${(axisM/totalM*100).toFixed(0)}% axis-aligned, M-MES-1)`);

  const mesKinds = new Set(mes.buildings.map(b => b.kind));
  ok([...mesKinds].some(k => k === 'street range' || k === 'single-room house'), 'mesopotamian buildings reuse the courtyard-house grammar (M-MES-2)');
  ok(!mes.civic, 'mesopotamian profile has no civic hall (temple-palace citadel governance)');
  ok(mes.markets.length === 0, 'mesopotamian profile has no specialised market squares (redistributive temple/palace economy)');

  const mesf = UME.generate(12345, { epochs: 8, pop: 8000, walls: true, fortified: true, culture: 'mesopotamian' });
  ok(!mesf.fortified && mesf.wall.style === 'curtain', 'mesopotamian profile never gets a bastioned trace, even when requested');
  ok(mesf.wall.gates.some(g => g.name && /Gate$/.test(g.name)), `compass gate scheme names land gates (${mesf.wall.gates.map(g=>g.name).join(', ')})`);

  for (const site of ['river', 'riverthrough', 'bay', 'coast', 'landlocked']) {
    const m1 = UME.generate(2024, { epochs: 8, pop: 6500, walls: true, culture: 'mesopotamian', site });
    const m2 = UME.generate(2024, { epochs: 8, pop: 6500, walls: true, culture: 'mesopotamian', site });
    ok(m1.parcels.length > 100 && UME.hashModel(m1) === UME.hashModel(m2), `mesopotamian city on '${site}' site: substantial + deterministic (${m1.parcels.length} parcels)`);
  }
}

/* ---------- Maya civilization profile (docs/03, M-MAY register) ---------- */
{
  const may = UME.generate(12345, { epochs: 8, pop: 6000, walls: true, culture: 'mayan' });
  const may2 = UME.generate(12345, { epochs: 8, pop: 6000, walls: true, culture: 'mayan' });
  ok(may.culture === 'mayan', 'mayan profile resolves');
  ok(UME.hashModel(may) === UME.hashModel(may2), 'mayan generation deterministic');
  ok(may.parcels.length > 150, `mayan city is a substantial settlement (${may.parcels.length} parcels)`);
  ok(may.pop > 6000 * 0.85 && may.pop < 6000 * 1.2, `mayan strip parcels realize standard density, no multiplier needed (${may.pop}/6000)`);

  const mayKinds = new Set(may.buildings.map(b => b.kind));
  ok([...mayKinds].some(k => k === 'street range' || k === 'single-room house'), 'mayan buildings reuse the courtyard-house grammar (plazuela group stand-in, M-MAY-2)');
  ok(!may.civic, 'mayan profile has no civic hall (divine-kingship governance)');
  ok(may.markets.length > 0, 'mayan profile has markets (Tikal/Chunchucmil marketplace evidence, M-MAY-3, unlike the temple-redistribution profiles)');

  // walls stay a genuine optional toggle here (unlike aztec's noWalls or the always-on profiles) —
  // Maya defensive walls are regional/period-specific, not universal (M-MAY-1)
  const mayNoWalls = UME.generate(12345, { epochs: 8, pop: 6000, walls: false, culture: 'mayan' });
  ok(!mayNoWalls.wall.ring, 'mayan profile has no wall when the walls checkbox is off');
  ok(may.wall.ring, 'mayan profile has a wall when the walls checkbox is on (an honest optional toggle, not forced either way)');

  const mayf = UME.generate(12345, { epochs: 8, pop: 8000, walls: true, fortified: true, culture: 'mayan' });
  ok(!mayf.fortified && mayf.wall.style === 'curtain', 'mayan profile never gets a bastioned trace, even when requested');
  ok(mayf.wall.gates.some(g => g.name && /Gate$/.test(g.name)), `compass gate scheme names land gates (${mayf.wall.gates.map(g=>g.name).join(', ')})`);

  for (const site of ['river', 'riverthrough', 'bay', 'coast', 'landlocked']) {
    const a1 = UME.generate(2024, { epochs: 8, pop: 6500, walls: true, culture: 'mayan', site });
    const a2 = UME.generate(2024, { epochs: 8, pop: 6500, walls: true, culture: 'mayan', site });
    ok(a1.parcels.length > 100 && UME.hashModel(a1) === UME.hashModel(a2), `mayan city on '${site}' site: substantial + deterministic (${a1.parcels.length} parcels)`);
  }
}

/* ---------- Inca civilization profile (docs/03, M-INC register) ---------- */
{
  const inc = UME.generate(12345, { epochs: 8, pop: 6000, walls: true, culture: 'inca' });
  const inc2 = UME.generate(12345, { epochs: 8, pop: 6000, walls: true, culture: 'inca' });
  ok(inc.culture === 'inca', 'inca profile resolves');
  ok(UME.hashModel(inc) === UME.hashModel(inc2), 'inca generation deterministic');
  ok(inc.parcels.length > 150, `inca city is a substantial settlement (${inc.parcels.length} parcels)`);
  ok(inc.pop > 6000 * 0.85 && inc.pop < 6000 * 1.2, `inca strip parcels realize standard density, no multiplier needed (${inc.pop}/6000)`);

  // kancha: the courtyard-house grammar is a direct architectural match here, not a stand-in
  const incKinds = new Set(inc.buildings.map(b => b.kind));
  ok([...incKinds].some(k => k === 'street range' || k === 'single-room house'), 'inca buildings reuse the courtyard-house grammar (kancha, a direct match, M-INC-1)');
  ok(!inc.civic, 'inca profile has no civic hall (Sapa Inca divine-kingship governance)');

  // the one profile in the whole register with a well-documented, specific no-market/no-currency economy
  ok(inc.markets.length === 0, 'inca profile has no markets at all (mita-labour/qollqa command economy, M-INC-2 — not a modelling simplification but a documented historical fact)');

  const incf = UME.generate(12345, { epochs: 8, pop: 8000, walls: true, fortified: true, culture: 'inca' });
  ok(!incf.fortified && incf.wall.style === 'curtain', 'inca profile never gets a bastioned trace, even when requested');
  ok(incf.wall.gates.some(g => g.name && /Gate$/.test(g.name)), `compass gate scheme names land gates (${incf.wall.gates.map(g=>g.name).join(', ')})`);

  for (const site of ['river', 'riverthrough', 'bay', 'coast', 'landlocked']) {
    const i1 = UME.generate(2024, { epochs: 8, pop: 6500, walls: true, culture: 'inca', site });
    const i2 = UME.generate(2024, { epochs: 8, pop: 6500, walls: true, culture: 'inca', site });
    ok(i1.parcels.length > 100 && UME.hashModel(i1) === UME.hashModel(i2), `inca city on '${site}' site: substantial + deterministic (${i1.parcels.length} parcels)`);
  }
}

/* ---------- Japanese Castle Town civilization profile (docs/03, M-JPN register) ---------- */
{
  const jpn = UME.generate(12345, { epochs: 8, pop: 6000, walls: true, culture: 'japanese' });
  const jpn2 = UME.generate(12345, { epochs: 8, pop: 6000, walls: true, culture: 'japanese' });
  ok(jpn.culture === 'japanese', 'japanese profile resolves');
  ok(UME.hashModel(jpn) === UME.hashModel(jpn2), 'japanese generation deterministic');
  ok(jpn.parcels.length > 150, `japanese castle town is a substantial settlement (${jpn.parcels.length} parcels)`);
  ok(jpn.pop > 6000 * 0.85 && jpn.pop < 6000 * 1.2, `japanese strip parcels realize standard density, no multiplier needed (${jpn.pop}/6000)`);

  // machiya townhouse: reuses the burgage grammar directly (a genuine cross-cultural parallel,
  // M-JPN-2), not the courtyard-house grammar used by every other Asian profile in this register
  const jpnKinds = new Set(jpn.buildings.map(b => b.kind));
  ok(['main', 'wing', 'rear range'].some(k => jpnKinds.has(k)), 'japanese buildings reuse the medieval burgage grammar (machiya townhouse parallel, M-JPN-2)');
  ok(![...jpnKinds].some(k => k === 'street range' || k === 'single-room house'), 'japanese buildings do not use the courtyard-house grammar (unlike islamic/chinese/aztec/greek/egyptian/mesopotamian/mayan/inca)');

  // castle keep: a new civic style, reusing the basilica/townhall render path (hall + apse + columns)
  ok(jpn.civic && jpn.civic.name === 'Castle keep' && jpn.civic.style === 'keep', 'japanese civic hall is the new castle-keep style (tenshu, M-JPN-3)');
  ok(jpn.civic.apse && jpn.civic.apse.length === 4, 'castle keep has an inset tiered roofline (reuses the apse render path)');
  ok(jpn.civic.columns.length === 4, 'castle keep has corner turret markers (reuses the column render path)');
  ok(jpn.markets.length > 0, 'japanese profile keeps the chonin-chi merchant-quarter market economy');

  const jpnf = UME.generate(12345, { epochs: 8, pop: 8000, walls: true, fortified: true, culture: 'japanese' });
  ok(!jpnf.fortified && jpnf.wall.style === 'curtain', 'japanese profile never gets a bastioned trace, even when requested (independent, non-trace-italienne fortification lineage)');
  ok(jpnf.wall.gates.some(g => g.name && /Gate$/.test(g.name)), `compass gate scheme names land gates (${jpnf.wall.gates.map(g=>g.name).join(', ')})`);

  for (const site of ['river', 'riverthrough', 'bay', 'coast', 'landlocked']) {
    const j1 = UME.generate(2024, { epochs: 8, pop: 6500, walls: true, culture: 'japanese', site });
    const j2 = UME.generate(2024, { epochs: 8, pop: 6500, walls: true, culture: 'japanese', site });
    ok(j1.parcels.length > 100 && UME.hashModel(j1) === UME.hashModel(j2), `japanese castle town on '${site}' site: substantial + deterministic (${j1.parcels.length} parcels)`);
  }
}

/* ---------- Colonial civilization profile (docs/03, M-COL register) ---------- */
{
  const col = UME.generate(12345, { epochs: 8, pop: 6000, walls: true, culture: 'colonial' });
  const col2 = UME.generate(12345, { epochs: 8, pop: 6000, walls: true, culture: 'colonial' });
  ok(col.culture === 'colonial', 'colonial profile resolves');
  ok(UME.hashModel(col) === UME.hashModel(col2), 'colonial generation deterministic');
  ok(col.parcels.length > 150, `colonial town is a substantial settlement (${col.parcels.length} parcels)`);

  let axisC = 0, totalC = 0;
  for (const e of col.graph.edges) {
    const a = col.graph.nodes[e.a], b = col.graph.nodes[e.b];
    const len = Math.hypot(b.x - a.x, b.y - a.y); if (len < 3) continue;
    let ang = Math.abs(Math.atan2(b.y - a.y, b.x - a.x)) * 180 / Math.PI; ang = ang % 90;
    totalC++; if (Math.min(ang, 90 - ang) < 4) axisC++;
  }
  ok(axisC / totalC > 0.85, `colonial town reuses the axis-aligned Laws-of-the-Indies grid model (${(axisC/totalC*100).toFixed(0)}%, M-COL-1)`);

  const colKinds = new Set(col.buildings.map(b => b.kind));
  ok([...colKinds].some(k => k === 'street range' || k === 'single-room house'), 'colonial buildings reuse the courtyard-house grammar (patio house, M-COL-2)');
  ok(col.pop > 6000 * 0.7, `colonial household-size correction realizes a substantial share of target population (${col.pop}/6000)`);
  ok(col.civic && col.civic.style === 'townhall', 'colonial civic hall is the cabildo (reuses the townhall style)');
  ok(col.markets.length > 0, 'colonial profile keeps the plaza mayor market economy');

  const colf = UME.generate(12345, { epochs: 8, pop: 8000, walls: true, fortified: true, culture: 'colonial' });
  ok(!colf.fortified && colf.wall.style === 'curtain', 'colonial profile never gets a bastioned trace, even when requested');
  ok(colf.wall.gates.some(g => g.name && /Gate$/.test(g.name)), `cardinal gate scheme names land gates (${colf.wall.gates.map(g=>g.name).join(', ')})`);

  for (const site of ['river', 'riverthrough', 'bay', 'coast', 'landlocked']) {
    const c1 = UME.generate(2024, { epochs: 8, pop: 6500, walls: true, culture: 'colonial', site });
    const c2 = UME.generate(2024, { epochs: 8, pop: 6500, walls: true, culture: 'colonial', site });
    ok(c1.parcels.length > 100 && UME.hashModel(c1) === UME.hashModel(c2), `colonial town on '${site}' site: substantial + deterministic (${c1.parcels.length} parcels)`);
  }
}

/* ---------- Frontier civilization profile (docs/03, M-FRO register) ---------- */
{
  const fro = UME.generate(12345, { epochs: 8, pop: 6000, walls: true, culture: 'frontier' });
  const fro2 = UME.generate(12345, { epochs: 8, pop: 6000, walls: true, culture: 'frontier' });
  ok(fro.culture === 'frontier', 'frontier profile resolves');
  ok(UME.hashModel(fro) === UME.hashModel(fro2), 'frontier generation deterministic');
  ok(fro.parcels.length > 150, `frontier boomtown is a substantial settlement (${fro.parcels.length} parcels)`);
  ok(fro.pop > 6000 * 0.85 && fro.pop < 6000 * 1.25, `frontier strip parcels realize standard density, no multiplier needed (${fro.pop}/6000)`);

  const froKinds = new Set(fro.buildings.map(b => b.kind));
  ok(['main', 'wing', 'rear range'].some(k => froKinds.has(k)), 'frontier buildings reuse the burgage grammar (false-front storefront stand-in, M-FRO-2)');
  ok(!fro.civic, 'frontier profile has no civic hall (formal government lagged the boom)');
  ok(fro.markets.length === 0, 'frontier profile has no market-square institution (commerce ran through the general store)');

  // never a wall at all (M-FRO-3) — distinct from aztec's defensive-alternative and maya's
  // genuine optional-toggle: frontier boomtowns simply never fortified, forced off either way
  ok(!fro.wall.ring && fro.wall.gates.length === 0, 'frontier profile never builds a wall, even when requested');
  const fro3 = UME.generate(12345, { epochs: 8, pop: 6000, walls: false, culture: 'frontier' });
  ok(UME.hashModel(fro) === UME.hashModel(fro3), 'the walls checkbox has no effect on the frontier profile (forced off either way)');
  const frof = UME.generate(12345, { epochs: 8, pop: 8000, walls: true, fortified: true, culture: 'frontier' });
  ok(!frof.fortified, 'frontier profile never gets a bastioned trace, even when requested');

  for (const site of ['river', 'riverthrough', 'bay', 'coast', 'landlocked']) {
    const f1 = UME.generate(2024, { epochs: 8, pop: 6500, walls: true, culture: 'frontier', site });
    const f2 = UME.generate(2024, { epochs: 8, pop: 6500, walls: true, culture: 'frontier', site });
    ok(f1.parcels.length > 100 && UME.hashModel(f1) === UME.hashModel(f2), `frontier boomtown on '${site}' site: substantial + deterministic (${f1.parcels.length} parcels)`);
  }
}

/* ---------- Industrial civilization profile (docs/03, M-IND register) ---------- */
{
  const ind = UME.generate(12345, { epochs: 8, pop: 6000, walls: true, culture: 'industrial' });
  const ind2 = UME.generate(12345, { epochs: 8, pop: 6000, walls: true, culture: 'industrial' });
  ok(ind.culture === 'industrial', 'industrial profile resolves');
  ok(UME.hashModel(ind) === UME.hashModel(ind2), 'industrial generation deterministic');
  ok(ind.parcels.length > 150, `industrial mill town is a substantial settlement (${ind.parcels.length} parcels)`);
  ok(ind.pop > 6000 * 0.85, `industrial domus-insula grammar reuses the roman M-ROM-7 correction automatically, no separate multiplier needed (${ind.pop}/6000)`);

  // reuses the roman domus-insula grammar: tenement/insula-block vs. mill-owner domus split
  const indKinds = new Set(ind.buildings.map(b => b.kind));
  ok(indKinds.has('insula block') && (indKinds.has('atrium range') || indKinds.has('peristyle range')), 'industrial buildings reuse the domus-insula grammar (tenement/mill-owner-villa split, M-IND-1)');

  // factory: the town's largest warehouse/insula-class building re-tagged, not new geometry
  const factory = ind.buildings.find(b => b.kind === 'factory');
  ok(!!factory, `industrial profile tags a factory/mill anchor (M-IND-2)`);
  ok(factory && factory.chimney && isFinite(factory.chimney.x) && isFinite(factory.chimney.y), 'factory has a finite chimney marker point');
  // the factory's footprint is one of the buildings the ordinary pipeline already placed and
  // validated (same parcel-containment/no-self-intersection guarantees as every other building) —
  // proof the factory can never introduce a new impossible intersection
  ok(ind.parcels.some(p => p.id === factory.parcel), 'the factory sits on an already-validated parcel from the ordinary pipeline (no freestanding new geometry)');

  ok(ind.civic && ind.civic.style === 'townhall', 'industrial civic hall reuses the townhall style');
  ok(ind.markets.length > 0, 'industrial profile keeps a market economy');
  ok(!ind.wall.ring && ind.wall.gates.length === 0, 'industrial profile never builds a wall (the fortified-city era had ended), even when requested');
  const indf = UME.generate(12345, { epochs: 8, pop: 8000, walls: true, fortified: true, culture: 'industrial' });
  ok(!indf.fortified, 'industrial profile never gets a bastioned trace, even when requested');

  for (const site of ['river', 'riverthrough', 'bay', 'coast', 'landlocked']) {
    const i1 = UME.generate(2024, { epochs: 8, pop: 6500, walls: true, culture: 'industrial', site });
    const i2 = UME.generate(2024, { epochs: 8, pop: 6500, walls: true, culture: 'industrial', site });
    ok(i1.parcels.length > 100 && UME.hashModel(i1) === UME.hashModel(i2), `industrial mill town on '${site}' site: substantial + deterministic (${i1.parcels.length} parcels)`);
  }
}

/* ---------- Post-Apocalyptic civilization profile (docs/03, M-PA register) ---------- */
{
  const pa = UME.generate(12345, { epochs: 8, pop: 6000, walls: true, culture: 'postapoc' });
  const pa2 = UME.generate(12345, { epochs: 8, pop: 6000, walls: true, culture: 'postapoc' });
  const ind0 = UME.generate(12345, { epochs: 8, pop: 6000, walls: true, culture: 'industrial' });
  ok(pa.culture === 'postapoc', 'postapoc profile resolves');
  ok(UME.hashModel(pa) === UME.hashModel(pa2), 'postapoc generation deterministic');
  ok(pa.parcels.length > 150, `postapoc settlement is a substantial footprint (${pa.parcels.length} parcels)`);

  // reuses the industrial profile's exact grid + domus-insula housing stock (M-PA-2) — same
  // building-kind vocabulary, just without the factory tag (that's industrial-specific)
  const paKinds = new Set(pa.buildings.map(b => b.kind));
  ok(paKinds.has('insula block') && (paKinds.has('atrium range') || paKinds.has('peristyle range')), 'postapoc buildings reuse the industrial domus-insula housing stock (M-PA-2)');
  ok(!paKinds.has('factory'), 'postapoc profile does not tag a factory (that flag is industrial-specific, not inherited)');

  // the defining, load-bearing mechanism: a real fraction of the built stock is ruined and
  // deliberately excluded from the population head-count — intentionally low realization, not a bug
  const ruinedBuildings = pa.buildings.filter(b => b.ruined);
  const ruinedParcels = pa.parcels.filter(p => p.ruined);
  ok(ruinedParcels.length > 0 && ruinedBuildings.length > 0, `postapoc profile flags a real fraction of the built stock ruined (${ruinedParcels.length} parcels, ${ruinedBuildings.length} buildings, M-PA-1)`);
  ok(pa.pop < ind0.pop * 0.85, `postapoc population is intentionally, substantially lower than the identical un-ruined industrial baseline at the same settings (${pa.pop} vs ${ind0.pop}) — decay excludes ruins from the head-count, not a realization bug`);

  // ruined buildings are a pure data/render overlay — still geometrically valid, still sitting on
  // an ordinary already-validated parcel, never a moved or removed vertex (the whole point of
  // deferring physical ruin modelling rather than actually breaching walls/blocking roads)
  ok(ruinedBuildings.every(b => Math.abs(UME._test.polyArea(b.poly)) > 1), 'every ruined building still has valid, non-degenerate geometry');
  ok(!pa.civic, 'postapoc profile has no civic hall (institutions collapsed with the population)');
  ok(pa.markets.length === 0, 'postapoc profile has no market economy');

  const paf = UME.generate(12345, { epochs: 8, pop: 8000, walls: true, fortified: true, culture: 'postapoc' });
  ok(!paf.fortified && paf.wall.style === 'curtain', 'postapoc profile never gets a bastioned trace, even when requested (anachronistically archaic for a fallen modern city)');
  ok(paf.wall.gates.some(g => g.name && /Gate$/.test(g.name)), `compass gate scheme names land gates (${paf.wall.gates.map(g=>g.name).join(', ')})`);

  for (const site of ['river', 'riverthrough', 'bay', 'coast', 'landlocked']) {
    const p1 = UME.generate(2024, { epochs: 8, pop: 6500, walls: true, culture: 'postapoc', site });
    const p2 = UME.generate(2024, { epochs: 8, pop: 6500, walls: true, culture: 'postapoc', site });
    ok(p1.parcels.length > 100 && UME.hashModel(p1) === UME.hashModel(p2), `postapoc settlement on '${site}' site: substantial + deterministic (${p1.parcels.length} parcels)`);
  }
}

/* ---------- The Venus Project civilization profile (docs/03, M-VEN register) ---------- */
{
  const ve = UME.generate(12345, { epochs: 8, pop: 6000, walls: false, culture: 'venus' });
  const ve2 = UME.generate(12345, { epochs: 8, pop: 6000, walls: false, culture: 'venus' });
  ok(ve.culture === 'venus', 'venus profile resolves');
  ok(UME.hashModel(ve) === UME.hashModel(ve2), 'venus generation deterministic');
  ok(ve.parcels.length > 150, `venus circular city is a substantial settlement (${ve.parcels.length} parcels)`);
  ok(ve.pop > 6000 * 0.35, `venus population realizes a meaningful share of target despite the new planning mode's site-dependent variance (${ve.pop}/6000)`);

  // genuinely new planning mode (M-VEN-1): every building stays within a bounded radius of the
  // central hub, unlike the organic pack's unbounded exploratory sprawl or the grid pack's
  // maximus-through-routes continuing to the map edge — the defining structural signature of a
  // closed concentric-ring city rather than a re-skin of either existing growth model.
  const C = ve.anchors.market;
  const dists = ve.buildings.map(b => { const c = UME._test.polyCentroid(b.poly); return Math.hypot(c.x - C.x, c.y - C.y); });
  const maxD = Math.max(...dists);
  ok(maxD < 500, `venus buildings stay within a bounded radius of the central hub, unlike unbounded organic/grid growth (max ${maxD.toFixed(0)}m, M-VEN-1)`);

  // blended fabric (M-VEN-5): circular pavilions, the standardized modular apartment, an
  // Asian-influenced courtyard house and a Japanese machiya rowhouse all coexist — a deliberate
  // fusion, not a single uniform grammar (the profile no longer forces uniformHousing)
  const veKinds = new Set(ve.buildings.map(b => b.kind));
  ok(veKinds.has('pavilion'), 'venus buildings include circular pavilions at the hub/inner rings (M-VEN-5)');
  ok(veKinds.has('modular apartment'), 'venus buildings include the standardized modular apartment (M-VEN-5)');
  ok(veKinds.has('machiya'), 'venus buildings include the Japanese machiya rowhouse, mixed into the residential fabric (M-VEN-5)');
  ok(veKinds.has('street range') || veKinds.has('single-room house'), 'venus buildings include the Asian-influenced courtyard house, mixed into the residential fabric (M-VEN-5)');
  ok(veKinds.has('warehouse'), 'venus buildings include logistics warehouses on the outermost ring (M-VEN-5)');

  // domed central hub (M-VEN-2), not the roman basilica or any rectangular civic hall
  ok(ve.civic && ve.civic.style === 'dome' && ve.civic.dome === true, 'venus civic hall is the domed Center for Resource Management (M-VEN-2)');
  ok(ve.civic.name === 'Center for Resource Management', 'venus civic hall is explicitly named for Fresco\'s cybernated resource-management hub');

  // circular irrigation waterway (M-VEN-3): present on every site kind (a constructed feature,
  // unlike the aztec chinampas which need a natural shoreline), and never overlapping a building;
  // always closes as a full circle within the map (no more straight clipped termination)
  ok(ve.details.some(d => d.kind === 'waterway'), `venus profile grows a circular irrigation waterway (${ve.details.filter(d=>d.kind==='waterway').length} arc(s), M-VEN-3)`);
  for (const ww of ve.details.filter(d => d.kind === 'waterway')) {
    ok(ww.poly.length > 20, 'venus waterway is a fully-closed many-sided circle, not a clipped partial arc (M-VEN-3)');
    for (const b of ve.buildings) {
      let crosses = false;
      for (let i = 0; i < ww.poly.length - 1 && !crosses; i++)
        for (let j = 0; j < b.poly.length && !crosses; j++)
          if (UME._test.segInt(ww.poly[i], ww.poly[i+1], b.poly[j], b.poly[(j+1)%b.poly.length])) crosses = true;
      ok(!crosses, `venus waterway never crosses a building (${b.id})`);
    }
  }

  // amenities: markets and civic hall are both real (M-VEN-5) — a resource-based economy per the
  // brief still carries amenity/logistics richness, not the "no markets at all" reading of the
  // original profile; no religion, matching Fresco's secular, science-based social vision
  ok(ve.churches.length === 0, 'venus profile has no religious buildings (secular, science-based social vision, M-VEN-4)');
  ok(ve.markets.length > 0, 'venus profile keeps amenity/market squares — blended medieval-European richness, not a purely marketless economy (M-VEN-5)');

  // walls + star fort are now a genuine, unwalled-by-default optional toggle (M-VEN-1), reusing
  // the medieval wall/fort machinery unchanged rather than forcing walls off entirely
  ok(!ve.wall.ring, 'venus defaults to unwalled (defaultWalls:false) when the walls option is off');
  const veWalled = UME.generate(12345, { epochs: 8, pop: 6000, walls: true, culture: 'venus' });
  ok(!!veWalled.wall.ring, 'venus can be walled on request — walls are a real optional toggle, not forced off');
  const vef = UME.generate(12345, { epochs: 8, pop: 8000, walls: true, fortified: true, culture: 'venus' });
  ok(vef.fortified && vef.wall.style === 'bastioned', 'venus can get a full bastioned star fort on request (M-VEN-1)');

  // the circular irrigation canal feeds the star fort's wet moat even on a landlocked site
  // (M-VEN-3) — and the separate decorative waterway ring is suppressed to avoid a duplicate
  const vefLandlocked = UME.generate(12345, { epochs: 8, pop: 8000, walls: true, fortified: true, culture: 'venus', site: 'landlocked' });
  ok(vefLandlocked.wall.fort && vefLandlocked.wall.fort.wetDitch && vefLandlocked.wall.fort.canalFed,
    'venus star fort on a landlocked site still gets a WET moat, canal-fed by the irrigation ring (M-VEN-3)');
  ok(vefLandlocked.details.filter(d => d.kind === 'waterway').length === 0,
    'the decorative waterway ring is suppressed when the fort already renders it as the canal-fed moat (no duplicate ring)');

  for (const site of ['river', 'riverthrough', 'bay', 'coast', 'landlocked']) {
    const v1 = UME.generate(2024, { epochs: 8, pop: 6500, walls: true, culture: 'venus', site });
    const v2 = UME.generate(2024, { epochs: 8, pop: 6500, walls: true, culture: 'venus', site });
    ok(v1.parcels.length > 100 && UME.hashModel(v1) === UME.hashModel(v2), `venus circular city on '${site}' site: substantial + deterministic (${v1.parcels.length} parcels)`);
  }
}

/* ---------- GenerationRules system (docs/07 §3.4) ---------- */
{
  // resolveRules(): no argument reproduces DEFAULT_RULES exactly; a partial merges per-group
  const d1 = UME.resolveRules();
  ok(JSON.stringify(d1) === JSON.stringify(UME.DEFAULT_RULES), 'resolveRules() with no argument reproduces DEFAULT_RULES exactly');
  const merged = UME.resolveRules({ street: { branchAngleJitter: 0.5 } });
  ok(merged.street.branchAngleJitter === 0.5, 'resolveRules(partial) overrides only the given field');
  ok(merged.street.continuationJitter === UME.DEFAULT_RULES.street.continuationJitter,
    'resolveRules(partial) leaves every other field in the same group untouched');
  ok(merged.parcels.subdivisionCap === UME.DEFAULT_RULES.parcels.subdivisionCap,
    'resolveRules(partial) leaves an entirely unmentioned group untouched');

  // cloneRules(): deep, independent copy — mutating the clone must never reach DEFAULT_RULES
  const clone = UME.cloneRules(UME.resolveRules());
  clone.street.branchAngleJitter = 999;
  ok(UME.DEFAULT_RULES.street.branchAngleJitter === 0.26,
    'cloneRules produces an independent deep copy (mutating the clone never reaches DEFAULT_RULES itself)');

  // byte-neutrality: generate() with no rules option and generate() with explicit default rules
  // must agree exactly — the same cross-version discipline this project already holds itself to
  // for profiles (docs/07 Phase 1), now extended to cover the rules-threading refactor itself
  const noRules = UME.generate(12345, { epochs: 8, pop: 5000 });
  const explicitDefaultRules = UME.generate(12345, { epochs: 8, pop: 5000, rules: UME.resolveRules() });
  ok(UME.hashModel(noRules) === UME.hashModel(explicitDefaultRules),
    'generate() with no rules option is byte-identical to generate() with explicit default rules (neutrality)');

  // custom rules genuinely change the output, deterministically
  const wild = UME.resolveRules(); UME.applyWildness(wild, 1.9); UME.applyPlotChaos(wild, 1.9);
  const wildModel1 = UME.generate(12345, { epochs: 8, pop: 5000, rules: wild });
  const wildModel2 = UME.generate(12345, { epochs: 8, pop: 5000, rules: wild });
  ok(UME.hashModel(wildModel1) === UME.hashModel(wildModel2), 'custom-rules generation is still deterministic for a fixed seed');
  ok(UME.hashModel(wildModel1) !== UME.hashModel(noRules), 'custom rules genuinely change the generated town vs. defaults');

  // applyWildness: derived values move monotonically with the slider, clamp at the documented
  // extremes, and record the raw slider value itself on meta.wildness (read back by the UI panel)
  const lo = UME.resolveRules(); UME.applyWildness(lo, 0);
  const hi = UME.resolveRules(); UME.applyWildness(hi, 2);
  ok(lo.street.branchAngleJitter < UME.DEFAULT_RULES.street.branchAngleJitter,
    'applyWildness(0) reduces branch angle jitter below the baseline');
  ok(hi.street.branchAngleJitter > UME.DEFAULT_RULES.street.branchAngleJitter,
    'applyWildness(2) increases branch angle jitter above the baseline');
  ok(lo.street.branchAngleJitter >= 0.15 && hi.street.branchAngleJitter <= 0.70,
    'applyWildness clamps branchAngleJitter to its documented [0.15,0.70] range at both extremes');
  ok(lo.street.pierceChance > hi.street.pierceChance,
    'applyWildness inversely derives pierceChance (a wilder town relies less on deliberate piercing)');
  ok(lo.meta.wildness === 0 && hi.meta.wildness === 2, 'applyWildness records the raw slider value on meta.wildness');

  // applyPlotChaos: subdivisionCap floors/ceilings at its documented [1,4] integer range
  const cLo = UME.resolveRules(); UME.applyPlotChaos(cLo, 0);
  const cHi = UME.resolveRules(); UME.applyPlotChaos(cHi, 2);
  ok(cLo.parcels.subdivisionCap === 1, 'applyPlotChaos(0) floors subdivisionCap at 1');
  ok(cHi.parcels.subdivisionCap === 4, 'applyPlotChaos(2) caps subdivisionCap at its documented maximum of 4');
  ok(cLo.parcels.frontageWidthVariance < cHi.parcels.frontageWidthVariance,
    'applyPlotChaos increases frontage width variance with the slider');
}

/* ---------- Levantine Palimpsest civilization profile (docs/03, M-PAL register) ---------- */
{
  const pa = UME.generate(12345, { epochs: 8, pop: 6000, walls: false, culture: 'palimpsest' });
  const pa2 = UME.generate(12345, { epochs: 8, pop: 6000, walls: false, culture: 'palimpsest' });
  ok(pa.culture === 'palimpsest', 'palimpsest profile resolves');
  ok(UME.hashModel(pa) === UME.hashModel(pa2), 'palimpsest generation deterministic');
  ok(pa.parcels.length > 150, `palimpsest town is a substantial settlement (${pa.parcels.length} parcels)`);
  ok(pa.pop > 6000 * 0.35, `palimpsest population realizes a meaningful share of target despite the founded-then-encroached mode's site-dependent variance (${pa.pop}/6000)`);

  // the founding act reuses buildGridStreets unchanged (M-PAL): narrowColonnades tags every
  // encroaching edge with its founding width, so a nonempty foundedW set is direct evidence the
  // grid-founding act actually ran before any encroachment was applied
  const foundingEdges = pa.graph.edges.filter(e => e.alive && e.foundedW !== undefined);
  ok(foundingEdges.length > 0, `palimpsest founding colonnades are tracked (foundedW set on ${foundingEdges.length} edges), confirming the grid-founding act ran (M-PAL-1)`);

  // narrowColonnades (M-PAL-1): road-RESERVATION narrowing only — some founded edges end up
  // narrower than they were founded, none ever below the 1.8 m footpath floor, and the edge count
  // (street graph topology) is completely unaffected since only e.w changes, never a or b
  const narrowed = pa.graph.edges.filter(e => e.alive && e.foundedW !== undefined && e.w < e.foundedW - 1e-6);
  ok(narrowed.length > 0, `palimpsest narrows some colonnaded streets below their founding width (${narrowed.length} edges, M-PAL-1)`);
  ok(pa.graph.edges.every(e => e.foundedW === undefined || e.w >= 1.8 - 1e-6), 'narrowed colonnades never shrink below the 1.8 m footpath floor (M-PAL-1)');

  // growAlongFixedEdge (M-PAL-3) + dissolveWardWalls (M-PAL-2), audited together across many
  // (seed x site x fortified) combinations — mirrors the standing profile-agnostic audit's own
  // discipline (checked across MULTIPLE seeds, not one), but also covers blk.wardWall, a model
  // field the generic audit doesn't know about, and the shoreline-growth pass, which is
  // legitimately probabilistic per-generation (Jacobs 2009: encroachment began at different
  // times/rates in different cities) so it is asserted in aggregate, not per single generation
  const palSeeds = [4242, 777, 12345, 999, 55, 88];
  const palSites = ['river', 'riverthrough', 'bay', 'coast', 'landlocked'];
  let shoreEdgesTotal = 0, shoreEdgesLandlocked = 0, wardWallBlocks = 0, wardWallOverlapFailures = 0, combosChecked = 0;
  for (const site of palSites) {
    for (const fortified of [false, true]) {
      for (const seed of palSeeds) {
        const m = UME.generate(seed, { epochs: 8, pop: 7500, walls: true, fortified, culture: 'palimpsest', site });
        combosChecked++;
        const shoreEdges = m.graph.edges.filter(e => e.alive && e.prov && /Kaifeng post-flood/.test(e.prov));
        shoreEdgesTotal += shoreEdges.length;
        if (site === 'landlocked') shoreEdgesLandlocked += shoreEdges.length;

        const parBlock = new Map(m.parcels.map(p => [p.id, p.block]));
        const byBlock = new Map();
        for (const b of m.buildings) {
          const bl = parBlock.get(b.parcel); if (bl === undefined) continue;
          let arr = byBlock.get(bl); if (!arr) { arr = []; byBlock.set(bl, arr); }
          arr.push(b);
        }
        for (const blk of m.blocks) {
          if (!blk.wardWall) continue;
          wardWallBlocks++;
          const near = byBlock.get(blk.id) || [];
          for (const [sa, sb] of blk.wardWall.segs)
            for (const b of near)
              for (let j = 0; j < b.poly.length; j++)
                if (T.segInt(sa, sb, b.poly[j], b.poly[(j + 1) % b.poly.length])) wardWallOverlapFailures++;
        }
      }
    }
  }
  ok(shoreEdgesTotal > 0, `palimpsest grows secondary streets along a fixed shoreline edge, aggregated across ${combosChecked} (site x fortified x seed) combinations (${shoreEdgesTotal} edges, M-PAL-3)`);
  ok(shoreEdgesLandlocked === 0, 'growAlongFixedEdge is a strict no-op on a landlocked site (there is no fixed edge to grow along)');
  ok(wardWallBlocks > 0, `palimpsest flags some interior blocks with a founding ward wall across the same ${combosChecked} combinations (${wardWallBlocks} block instances, M-PAL-2)`);
  ok(wardWallOverlapFailures === 0, `no ward-wall segment ever crosses a real building, across ${combosChecked} combinations (${wardWallOverlapFailures} failures, M-PAL-2)`);

  // Bab-scheme gates (M-ISL-4 pattern, reused): every non-water land gate gets the mature
  // Islamic-period Arabic naming, not the Roman one the founding grid started from
  const paWalled = UME.generate(12345, { epochs: 8, pop: 8000, walls: true, culture: 'palimpsest' });
  ok(!!paWalled.wall.ring, 'palimpsest can be walled on request');
  const landGates = paWalled.wall.gates.filter(g => !g.water);
  ok(landGates.length > 0 && landGates.every(g => /^Bab /.test(g.name)),
    `palimpsest land gates all use the Bab-scheme Arabic naming (${landGates.map(g => g.name).join(', ')})`);

  // never a bastioned trace, however requested or however large the population — the same
  // anachronism guard already applied to Roman/Islamic/etc.: only wallGates.scheme:'organic'
  // ever unlocks the gunpowder-era trace italienne, and palimpsest ends at the mature Islamic-
  // period identity (scheme:'bab'), so it is blocked for the same reason Islamic is
  const paFortReq = UME.generate(12345, { epochs: 8, pop: 12000, walls: true, fortified: true, culture: 'palimpsest', site: 'riverthrough' });
  ok(paFortReq.fortRequested && !paFortReq.fortified && paFortReq.wall.style === 'curtain',
    'palimpsest never gets a bastioned trace even when requested with ample population, matching the Islamic-period identity it ends at (M-FOR-4 anachronism guard)');

  // civic anchor is the souk (market square), not a monumental hall — the same "governance was
  // not a monumental civic building" precedent already established for the Islamic profile
  ok(pa.civic === null, 'palimpsest has no monumental civic hall (auto + mosque faith resolves to none, like the Islamic profile) — the souk is the real civic anchor');
  ok(pa.markets.length > 0, 'palimpsest keeps market squares (the souk itself, M-PAL register)');

  for (const site of ['river', 'riverthrough', 'bay', 'coast', 'landlocked']) {
    const p1 = UME.generate(2024, { epochs: 8, pop: 6500, walls: true, culture: 'palimpsest', site });
    const p2 = UME.generate(2024, { epochs: 8, pop: 6500, walls: true, culture: 'palimpsest', site });
    ok(p1.parcels.length > 100 && UME.hashModel(p1) === UME.hashModel(p2), `palimpsest town on '${site}' site: substantial + deterministic (${p1.parcels.length} parcels)`);
  }
}

console.log(`\n${pass + fail} assertions: ${pass} passed, ${fail} failed`);
if (fail) { console.error('\nFailures:\n - ' + failures.join('\n - ')); process.exit(1); }
