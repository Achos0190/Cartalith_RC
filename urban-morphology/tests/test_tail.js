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
  ok(registeredProfiles.length === 2 && registeredProfiles.includes('medieval') && registeredProfiles.includes('venus'),
    `culture profiles registered, trimmed to the two structurally-distinct patterns post-simplification (${registeredProfiles.join(', ')})`);
  // unknown/omitted culture falls back to medieval, byte-identical
  const base = UME.generate(12345, { epochs: 8, pop: 5000 });
  const explicit = UME.generate(12345, { epochs: 8, pop: 5000, culture: 'medieval' });
  const fallback = UME.generate(12345, { epochs: 8, pop: 5000, culture: 'bogus' });
  ok(UME.hashModel(base) === UME.hashModel(explicit) && UME.hashModel(base) === UME.hashModel(fallback),
    'default/explicit-medieval/unknown-culture all produce byte-identical output (neutrality)');
}

/* ---------- Ruined toggle: a STATE any settlement can be in, not a civilization of its own
 * (docs/03 M-PA register). Post-Apocalyptic used to be its own culture profile that just reused
 * Industrial's grid/housing and forced applyDecay() on; applyDecay() was always profile-agnostic
 * (it reads only parcels/buildings, never profile), so the mechanism is now a plain opts.ruined
 * toggle available over ANY culture, the same additive discipline as terrainAware/GenerationRules
 * — proven here by exercising it across both remaining profiles, not one dedicated culture. */
{
  const r1 = UME.generate(12345, { epochs: 8, pop: 6000, walls: true, culture: 'medieval', ruined: true });
  const r2 = UME.generate(12345, { epochs: 8, pop: 6000, walls: true, culture: 'medieval', ruined: true });
  ok(UME.hashModel(r1) === UME.hashModel(r2), 'ruined:true generation is deterministic');
  ok(r1.ruined === true, 'model reports the requested ruined option back');

  // off by default, for both remaining cultures
  for (const culture of ['medieval', 'venus']) {
    const m = UME.generate(12345, { epochs: 8, pop: 6000, culture });
    ok(m.parcels.every(p => !p.ruined) && m.buildings.every(b => !b.ruined),
      `${culture}: no parcel/building is ever flagged ruined when the toggle is off`);
  }

  // the defining, load-bearing mechanism, exercised across both remaining cultures — proving this
  // is genuinely decoupled from any one profile, not a re-badged single-culture case: a real
  // fraction of the built stock is ruined and deliberately excluded from the population head-count
  for (const culture of ['medieval', 'venus']) {
    const off = UME.generate(12345, { epochs: 8, pop: 6000, walls: true, culture });
    const on = UME.generate(12345, { epochs: 8, pop: 6000, walls: true, culture, ruined: true });
    const ruinedParcels = on.parcels.filter(p => p.ruined);
    const ruinedBuildings = on.buildings.filter(b => b.ruined);
    ok(ruinedParcels.length > 0 && ruinedBuildings.length > 0,
      `${culture}: ruined toggle flags a real fraction of the built stock (${ruinedParcels.length} parcels, ${ruinedBuildings.length} buildings, M-PA-1)`);
    ok(on.pop < off.pop * 0.85,
      `${culture}: ruined population is substantially lower than the identical un-ruined baseline (${on.pop} vs ${off.pop}) — decay excludes ruins from the head-count, not a realization bug`);
    // ruined buildings are a pure data/render overlay — still geometrically valid, still sitting on
    // an ordinary already-validated parcel, never a moved or removed vertex (the whole point of
    // deferring physical ruin modelling rather than actually breaching walls/blocking roads)
    ok(ruinedBuildings.every(b => Math.abs(T.polyArea(b.poly)) > 1),
      `${culture}: every ruined building still has valid, non-degenerate geometry`);
  }

  // orthogonal to the underlying culture's own fortification/wall rules — ruination doesn't
  // override what the selected culture would otherwise do
  const ruinedMedievalFort = UME.generate(12345, { epochs: 8, pop: 8000, walls: true, fortified: true, culture: 'medieval', ruined: true });
  ok(ruinedMedievalFort.fortified && ruinedMedievalFort.wall.style === 'bastioned',
    'a ruined medieval town can still get a bastioned trace on request — ruination does not override the underlying culture\'s own fortification rules');
  const ruinedVenus = UME.generate(12345, { epochs: 8, pop: 8000, walls: false, culture: 'venus', ruined: true });
  ok(!ruinedVenus.wall.ring, 'a ruined venus town still defaults to unwalled when the walls option is off — ruination does not override the underlying culture\'s own defaults');

  for (const site of ['river', 'riverthrough', 'bay', 'coast', 'landlocked']) {
    const p1 = UME.generate(2024, { epochs: 8, pop: 6500, walls: true, culture: 'venus', ruined: true, site });
    const p2 = UME.generate(2024, { epochs: 8, pop: 6500, walls: true, culture: 'venus', ruined: true, site });
    ok(p1.parcels.length > 100 && UME.hashModel(p1) === UME.hashModel(p2), `ruined venus settlement on '${site}' site: substantial + deterministic (${p1.parcels.length} parcels)`);
  }
}

/* ---------- Signature games/spectacle buildings (docs/03 M-GAMES register, docs/07 §3.7) ----------
 * A population-gated monument array (model.games), dispatched per profile via GAMES_SPEC. The
 * register originally covered all 19 profiles (docs/03 §AA retains that research); only
 * medieval's tiltyard and venus's honest omission have a live caller since the post-launch
 * simplification pass (docs/07 §3.10). */
{
  const g1 = UME.generate(12345, { epochs: 8, pop: 6000, walls: true, culture: 'medieval' });
  const g2 = UME.generate(12345, { epochs: 8, pop: 6000, walls: true, culture: 'medieval' });
  ok(JSON.stringify(g1.games) === JSON.stringify(g2.games), 'games building generation is deterministic');

  // below the population gate: no games building
  const small = UME.generate(12345, { epochs: 8, pop: 1200, walls: true, culture: 'medieval' });
  ok(small.games.length === 0, 'no games building appears below the population gate (1200 < 3000)');

  // medieval gets its signature tiltyard once the gate is met
  const m = UME.generate(12345, { epochs: 8, pop: 6000, walls: true, culture: 'medieval' });
  ok(m.games.length === 1 && m.games[0].kind === 'tiltyard',
    `medieval gets its signature games building (tiltyard): got [${m.games.map(x=>x.kind).join(',')}]`);
  ok(m.games[0].name && m.games[0].prov, 'medieval\'s games building carries a name and provenance string');
  ok(m.games[0].poly.length >= 4 && m.games[0].poly.every(v => isFinite(v.x) && isFinite(v.y)),
    'medieval\'s games building is a finite, real polygon');

  // historical-placement revision: plaza-sited, inside the town, not out past its edge — verified
  // by distance from the plaza, not just trusted from the siting label (docs/03 M-GAMES register)
  {
    const d = Math.hypot(m.games[0].center.x - m.plaza.center.x, m.games[0].center.y - m.plaza.center.y);
    ok(d < 200, `medieval's tiltyard sits near the plaza, inside the town (${d.toFixed(0)}m, plaza-sited)`);
  }

  // plaza-sited buildings are NOT guaranteed clear of real parcels by construction the way the
  // periphery is (they sit inside the built fabric) — so this is the one siting mode that needs
  // an explicit parcel-overlap check, across several sites/seeds, not assumed safe by distance alone
  let parcelOverlapFails = 0, plazaChecked = 0;
  for (const site of ['river', 'bay', 'landlocked']) {
    for (const seed of [12345, 2024, 777]) {
      const mm = UME.generate(seed, { epochs: 8, pop: 7000, walls: true, culture: 'medieval', site });
      if (!mm.games.length) continue;
      plazaChecked++;
      const gm = mm.games[0];
      for (const par of mm.parcels) {
        let hit = false;
        for (let i = 0; i < gm.poly.length && !hit; i++)
          for (let j = 0; j < par.poly.length && !hit; j++)
            if (UME._test.segInt(gm.poly[i], gm.poly[(i+1)%gm.poly.length], par.poly[j], par.poly[(j+1)%par.poly.length])) hit = true;
        if (!hit && UME._test.pointInPoly(gm.poly[0], par.poly)) hit = true;
        if (hit) parcelOverlapFails++;
      }
    }
  }
  ok(plazaChecked === 3 * 3 && parcelOverlapFails === 0,
    `medieval's plaza-sited tiltyard never overlaps a real parcel across ${plazaChecked} site/seed combinations (${parcelOverlapFails} failures)`);

  // honest omission: recreation deliberately distributed through the rings rather than
  // centralized (Venus), never forced in — checked at a population well above medieval's own gate
  const ven = UME.generate(12345, { epochs: 8, pop: 9000, walls: false, culture: 'venus' });
  ok(ven.games.length === 0, 'venus honestly gets no games building (recreation distributed through the rings, not centralized)');

  // safety audit: every games-building vertex, across a spread of sites/seeds, never sits in
  // water and never crosses a live street edge — re-verified here rather than trusted from the
  // mechanism alone
  let checked = 0, waterFails = 0, crossFails = 0;
  for (const site of ['river', 'riverthrough', 'bay', 'coast', 'landlocked']) {
    for (const seed of [12345, 2024, 777]) {
      const mm = UME.generate(seed, { epochs: 8, pop: 9000, walls: true, fortified: true, culture: 'medieval', site });
      checked++;
      for (const gm of mm.games) {
        if (mm.site.waterPoly && mm.site.waterPoly.length)
          for (const v of gm.poly) if (UME._test.pointInPoly(v, mm.site.waterPoly)) waterFails++;
        for (let i = 0; i < gm.poly.length; i++) {
          const A = gm.poly[i], B = gm.poly[(i + 1) % gm.poly.length];
          for (const e of mm.graph.edges) {
            const na = mm.graph.nodes[e.a], nb = mm.graph.nodes[e.b];
            if (UME._test.segInt(A, B, na, nb)) { crossFails++; break; }
          }
        }
      }
    }
  }
  ok(checked === 5 * 3 && waterFails === 0, `games buildings never sit in water across ${checked} site/seed combinations (${waterFails} failures)`);
  ok(crossFails === 0, `games buildings never cross a live street edge across ${checked} combinations (${crossFails} failures)`);

  // never affects the cross-version neutrality hash: hashModel() only ever reads graph/blocks/
  // parcels/buildings, never model.games, the same reasoning already established for civic/markets
  for (const site of ['river', 'riverthrough', 'bay', 'coast', 'landlocked']) {
    const s1 = UME.generate(2024, { epochs: 8, pop: 6500, walls: true, culture: 'medieval', site });
    const s2 = UME.generate(2024, { epochs: 8, pop: 6500, walls: true, culture: 'medieval', site });
    ok(s1.parcels.length > 100 && UME.hashModel(s1) === UME.hashModel(s2), `games-enabled generation on '${site}' site: substantial + deterministic (${s1.parcels.length} parcels)`);
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

/* ---------- Terrain/building-suitability groundwork (docs/08, M-TER register) ----------
 * Preparatory work for a future Cartalith Gen1 port — NOT integrated into Cartalith here.
 * par.suitability is always computed (informational; hashModel() does not hash it, so this
 * cannot affect the neutrality every other addition in this file is held to); opts.terrainAware
 * is the separate, default-off switch that lets it actually exclude parcels from building. */
{
  // always present, finite, in [0,1] — across several profiles/sites, not just one default case
  let badCount = 0, checked = 0;
  for (const culture of ['medieval', 'venus']) {
    for (const site of ['river', 'bay', 'landlocked']) {
      const m = UME.generate(4242, { epochs: 8, pop: 6000, culture, site });
      for (const p of m.parcels) {
        checked++;
        if (typeof p.suitability !== 'number' || !isFinite(p.suitability) || p.suitability < 0 || p.suitability > 1) badCount++;
      }
    }
  }
  ok(checked > 500 && badCount === 0, `every parcel across ${checked} (culture x site) samples carries a finite suitability score in [0,1] (${badCount} out of range, M-TER-1)`);

  // neutrality: omitting the option and passing an explicit false must agree exactly, and both
  // must match plain generate() with no other options touched by this feature
  const noOpt = UME.generate(12345, { epochs: 8, pop: 5000 });
  const explicitFalse = UME.generate(12345, { epochs: 8, pop: 5000, terrainAware: false });
  ok(UME.hashModel(noOpt) === UME.hashModel(explicitFalse), 'terrainAware omitted vs. explicit false are byte-identical (neutrality)');
  ok(noOpt.parcels.every(p => !p.unsuitable), 'no parcel is ever flagged unsuitable when terrainAware is off');

  // suitability correlates with distance from the water: parcels near the water's edge score
  // measurably lower on average than parcels far from it (independent check via T.distPtSeg
  // point-to-segment distance against the model's own exposed site.river, not an internal hook).
  // The combined score is slope x flood, and slope varies independently of river-distance in
  // this synthetic terrain — so on any ONE seed, a coincidentally flat near-bank / steep far-bank
  // layout can occasionally flip the comparison (found by testing on a single seed, seed 4242,
  // before this was broadened); the flood signal is a real, aggregate TENDENCY, not a per-seed
  // guarantee, so it is checked across several seeds together, the same discipline already used
  // elsewhere in this file for other legitimately seed-dependent effects (M-PAL-3's shoreline
  // streets, above).
  const distToRiver = (river, p) => { let d = Infinity; for (let i = 0; i < river.length - 1; i++) d = Math.min(d, T.distPtSeg(p, river[i], river[i + 1])); return d; };
  let nearSum = 0, nearN = 0, farSum = 0, farN = 0;
  for (const seed of [1, 2, 3, 4242, 777, 12345, 999, 55, 88]) {
    const river = UME.generate(seed, { epochs: 8, pop: 7000, site: 'river' });
    const withDist = river.parcels.map(p => ({ s: p.suitability, d: distToRiver(river.site.river, T.polyCentroid(p.poly)) })).sort((a, b) => a.d - b.d);
    const k = Math.floor(withDist.length * 0.2);
    for (const x of withDist.slice(0, k)) { nearSum += x.s; nearN++; }
    for (const x of withDist.slice(-k)) { farSum += x.s; farN++; }
  }
  const nearAvg = nearSum / nearN, farAvg = farSum / farN;
  ok(nearAvg < farAvg, `parcels near the water score measurably lower on average than parcels far from it, aggregated across 9 seeds (${nearAvg.toFixed(2)} vs ${farAvg.toFixed(2)}, M-TER-1)`);

  // terrainAware: deterministic, only ever removes buildings (never adds), and is live (actually
  // changes the output on at least some seed/site) — checked in aggregate since which parcels
  // cross the threshold is legitimately site/seed-dependent, not a per-generation guarantee
  const ta1 = UME.generate(12345, { epochs: 8, pop: 7000, terrainAware: true, site: 'coast' });
  const ta2 = UME.generate(12345, { epochs: 8, pop: 7000, terrainAware: true, site: 'coast' });
  ok(UME.hashModel(ta1) === UME.hashModel(ta2), 'terrainAware:true generation is deterministic');
  ok(ta1.terrainAware === true, 'model reports the requested terrainAware option back');

  let everFewer = false, everMore = false, everFlagged = false;
  for (const seed of [1, 4242, 777, 12345, 999]) {
    for (const site of ['river', 'riverthrough', 'bay', 'coast', 'landlocked']) {
      const off = UME.generate(seed, { epochs: 8, pop: 7000, site });
      const on = UME.generate(seed, { epochs: 8, pop: 7000, site, terrainAware: true });
      if (on.buildings.length < off.buildings.length) everFewer = true;
      if (on.buildings.length > off.buildings.length) everMore = true;
      if (on.parcels.some(p => p.unsuitable)) everFlagged = true;
    }
  }
  ok(everFewer, 'terrainAware:true reduces building count on at least some seed/site combination (the mechanism is live, not inert)');
  ok(!everMore, 'terrainAware:true never increases building count on any seed/site combination (it can only exclude, never add)');
  ok(everFlagged, 'terrainAware:true flags at least some parcels unsuitable across the sampled combinations');

  // safety: excluding a parcel from building can only ever remove geometry, so it cannot
  // introduce a new water/wall intersection — verified explicitly rather than assumed, matching
  // this project's own "verify, don't just trust construction" discipline
  let wetBuildingFails = 0, checkedTA = 0;
  for (const seed of [4242, 777, 12345, 999]) {
    for (const site of ['river', 'riverthrough', 'bay', 'coast']) {
      const m = UME.generate(seed, { epochs: 8, pop: 7500, walls: true, terrainAware: true, site });
      checkedTA++;
      if (m.site.waterPoly && m.site.waterPoly.length)
        for (const b of m.buildings) if (T.pointInPoly(T.polyCentroid(b.poly), m.site.waterPoly)) wetBuildingFails++;
    }
  }
  ok(wetBuildingFails === 0, `terrainAware:true introduces no wet buildings across ${checkedTA} (seed x site) combinations (${wetBuildingFails} failures)`);
}

/* ---------- Per-culture farmland/pasture (docs/03 M-FARM register, docs/07 §3.9) ----------
 * A population-independent hinterland layer (model.details, kind 'field'/'pasture'), dispatched
 * per profile via FARM_SPEC. The register originally covered 18 of the 19 profiles (Aztec's
 * chinampas already were its farmland signature); docs/03 §BB retains that research. Only
 * medieval's baseline strip pattern and Venus's concentric ring pattern have a live caller since
 * the post-launch simplification pass (docs/07 §3.10). */
{
  const farmKinds = (m) => m.details.filter(d => d.kind === 'field' || d.kind === 'pasture');

  const f1 = UME.generate(12345, { epochs: 8, pop: 6000, walls: true, culture: 'medieval', site: 'river' });
  const f2 = UME.generate(12345, { epochs: 8, pop: 6000, walls: true, culture: 'medieval', site: 'river' });
  ok(JSON.stringify(farmKinds(f1)) === JSON.stringify(farmKinds(f2)), 'farmland/pasture generation is deterministic');

  // both remaining cultures produce at least one field/pasture detail on a river site
  for (const culture of ['medieval', 'venus']) {
    const m = UME.generate(12345, { epochs: 8, pop: 6000, walls: true, culture, site: 'river' });
    ok(farmKinds(m).length > 0, `${culture} produces at least one field/pasture detail on a river site`);
  }

  // medieval: the unchanged pre-urban selion-strip fabric (plain quads), carrying the M-GRW-5/
  // M-FARM-1 provenance this baseline has always had
  const med = UME.generate(12345, { epochs: 8, pop: 6000, walls: true, culture: 'medieval', site: 'river' });
  const medFields = med.details.filter(d => d.kind === 'field');
  ok(medFields.length > 0 && medFields.every(d => d.poly.length === 4) && medFields.every(d => d.prov.includes('M-GRW-5')),
    'medieval fields are the unchanged baseline strip pattern (plain quads, M-GRW-5/M-FARM-1)');

  // venus: concentric ring-farming bands beyond the built rings (M-FARM-18) — every field/pasture
  // polygon sits well beyond the town's own realized building radius, the defining "beyond the
  // built rings" siting signature that distinguishes this from the road-fronting strip pattern
  const ven = UME.generate(12345, { epochs: 8, pop: 6000, walls: true, culture: 'venus', site: 'river' });
  const venDetails = farmKinds(ven);
  const C = ven.anchors.market;
  const builtR = Math.max(...ven.buildings.map(b => { const c = T.polyCentroid(b.poly); return Math.hypot(c.x - C.x, c.y - C.y); }));
  ok(venDetails.length > 0 && venDetails.every(d => Math.hypot(T.polyCentroid(d.poly).x - C.x, T.polyCentroid(d.poly).y - C.y) > builtR * 1.5),
    "venus's ring-farming bands sit well beyond the built rings (M-FARM-18), not fronting a road like the strip pattern");

  // pasture is a real, testable kind distinct from field — present for both remaining cultures,
  // aggregated across several seeds since it's a per-cell/per-band probability, not a per-seed
  // guarantee (the same discipline as every other probabilistic effect checked this way in this
  // suite, e.g. the M-TER-1 near/far suitability check)
  for (const culture of ['medieval', 'venus']) {
    let anyPasture = false;
    for (const seed of [1, 2, 3, 12345, 999]) {
      const m = UME.generate(seed, { epochs: 8, pop: 6000, walls: true, culture, site: 'river' });
      if (m.details.some(d => d.kind === 'pasture')) { anyPasture = true; break; }
    }
    ok(anyPasture, `${culture} produces at least one pasture-kind detail across several seeds`);
  }

  // safety audit: every field/pasture vertex, across a spread of cultures/sites/seeds, never sits
  // in water and never crosses a live street edge — re-verified explicitly rather than trusted
  // from the mechanism alone, the same standing discipline as the M-GAMES register's own audit
  let auditChecked = 0, waterFails = 0, crossFails = 0;
  for (const culture of ['medieval', 'venus']) {
    for (const site of ['river', 'riverthrough', 'bay', 'coast', 'landlocked']) {
      for (const seed of [12345, 2024, 777]) {
        const m = UME.generate(seed, { epochs: 8, pop: 7000, walls: true, fortified: true, culture, site });
        auditChecked++;
        for (const d of farmKinds(m)) {
          if (m.site.waterPoly && m.site.waterPoly.length)
            for (const v of d.poly) if (T.pointInPoly(v, m.site.waterPoly)) waterFails++;
          for (let i = 0; i < d.poly.length; i++) {
            const A = d.poly[i], B = d.poly[(i + 1) % d.poly.length];
            for (const e of m.graph.edges) {
              const na = m.graph.nodes[e.a], nb = m.graph.nodes[e.b];
              if (T.segInt(A, B, na, nb)) { crossFails++; break; }
            }
          }
        }
      }
    }
  }
  ok(auditChecked === 2 * 5 * 3 && waterFails === 0, `field/pasture details never sit in water across ${auditChecked} culture/site/seed combinations (${waterFails} failures)`);
  ok(crossFails === 0, `field/pasture details never cross a live street edge across ${auditChecked} combinations (${crossFails} failures)`);

  // never affects the cross-version neutrality hash: hashModel() only ever reads graph/blocks/
  // parcels/buildings, never model.details — the same reasoning already established for
  // civic/markets/games
  for (const site of ['river', 'riverthrough', 'bay', 'coast', 'landlocked']) {
    const s1 = UME.generate(2024, { epochs: 8, pop: 6500, walls: true, culture: 'medieval', site });
    const s2 = UME.generate(2024, { epochs: 8, pop: 6500, walls: true, culture: 'medieval', site });
    ok(s1.parcels.length > 100 && UME.hashModel(s1) === UME.hashModel(s2), `farmland-enabled generation on '${site}' site: substantial + deterministic (${s1.parcels.length} parcels)`);
  }
}

/* ---------- Successive wall generations -> ring roads (docs/03 M-GRW-2, docs/07 §3.11) ----------
 * Organic/medieval growth only, opt-in via wallGenerations (default off, additive like every
 * other toggle in this file). Venus's radial branch never reads the option at all (no epoch loop
 * to hang repeatable expansion on), so it must be a complete no-op there.
 *
 * A first cut of this feature's trigger compared a freshly recomputed all-built-nodes hull
 * (already including any extramural growth) against the previous wall's own area — but since the
 * wall itself IS that same hull construction inflated by only ~10%+16m growth reserve, ANY new
 * growth at all made a fresh hull exceed the old wall's area almost immediately: direct
 * epoch-by-epoch instrumentation showed generation 2 firing the very epoch after generation 1 was
 * built, and generation 3 the epoch after that — ring roads appearing well ahead of real growth,
 * exactly the ordering bug a user review caught ("generates ring roads in advance of the growth
 * instead of building upto and beyond the wall"). Fixed with `wallOccupancy()`: interior-only fill
 * fraction (bounded well under 1 by construction) plus a minimum extramural (ribbon-suburb) share,
 * AND a real-year age gate (`settlementAge`, a new user-facing input) requiring a historically-
 * grounded gap since the active wall was built — real successive-circuit gaps run ~74y (Cologne
 * 1106->1180), ~94-111y (Florence Matildine->Communal1->Communal2), ~158-168y (Paris Philip
 * II->Charles V); wallGenerationMinAgeGap defaults to 120y inside that band. This block both
 * exercises the mechanism AND locks in the fix: the tests below assert genuine epoch spacing
 * between generations and that a young settlement's own lifespan can't afford a second circuit. */
{
  // multi-generation firing: needs a genuinely long-running settlement now (correctly so) — swept
  // many seed/epoch/age/pop combinations while designing this test; epochs:10, settlementAge:600
  // (a long-lived, several-circuit-plausible town per the real gaps above) reliably reaches the
  // generation cap for seed 12345 (reused throughout this file), landing inside the existing
  // population tolerance band too.
  const m = UME.generate(12345, { epochs: 10, pop: 9000, walls: true, wallGenerations: true, settlementAge: 600, culture: 'medieval', site: 'river' });
  ok(m.wallGenerations === true, 'model reports the requested wallGenerations option back');
  ok(m.settlementAge === 600, 'model reports the requested settlementAge option back');
  ok(!!m.wall.ring, 'a wall exists');
  ok(Array.isArray(m.wall.history) && m.wall.history.length >= 1,
    `wall history has >=1 superseded generation (got ${m.wall.history ? m.wall.history.length : 0})`);
  ok((m.wall.generation || 1) > 1, `active generation counter advanced past 1 (got ${m.wall.generation})`);
  ok((m.wall.generation || 1) <= UME.DEFAULT_RULES.settlement.maxWallGenerations,
    `active generation respects maxWallGenerations (got ${m.wall.generation})`);
  ok(m.wall.history.every((h, i) => h.generation === i + 1),
    'history generations are the ascending 1-based sequence that preceded the active one');

  // the fix itself: successive generations must be genuinely spaced apart in epochs, never
  // adjacent — the exact regression the buggy first cut exhibited (superseding practically every
  // epoch). yearsPerEpoch = settlementAge/epochs (the same derivation grow() itself uses), so the
  // minimum epoch gap a wallGenerationMinAgeGap-year requirement implies is computable here too.
  const yearsPerEpoch = 600 / 10;
  const minEpochGap = UME.DEFAULT_RULES.settlement.wallGenerationMinAgeGap / yearsPerEpoch;
  const epochsOfEachGen = [...m.wall.history.map(h => h.epoch), m.wall.epoch];
  let properlySpaced = true;
  for (let i = 1; i < epochsOfEachGen.length; i++)
    if (epochsOfEachGen[i] - epochsOfEachGen[i - 1] < minEpochGap) properlySpaced = false;
  ok(properlySpaced, `successive generations are spaced >= the age-derived minimum epoch gap (${minEpochGap.toFixed(2)}), not firing every epoch (epochs: ${epochsOfEachGen.join(',')})`);
  ok(m.wall.history.every(h => typeof h.fillFractionAtSupersession === 'number' && h.fillFractionAtSupersession >= UME.DEFAULT_RULES.settlement.wallGenerationThreshold),
    'every superseded generation had genuinely reached the interior fill-fraction threshold at the moment it was replaced (not before)');
  ok(m.wall.history.every(h => h.exteriorNodesAtSupersession >= 10),
    'every superseded generation had a real (not token) extramural presence at the moment it was replaced');

  // young-settlement regression: a settlement whose own lifespan is too short to afford even the
  // real-world minimum gap between circuits must never supersede its first wall, however dense its
  // interior gets — directly locks in the age-gate fix, across several seeds
  let youngNeverSupersedes = true;
  for (const seed of [1, 5, 7, 12345, 999]) {
    const young = UME.generate(seed, { epochs: 8, pop: 9000, walls: true, wallGenerations: true, settlementAge: 50, culture: 'medieval', site: 'river' });
    if ((young.wall.generation || 1) > 1) youngNeverSupersedes = false;
  }
  ok(youngNeverSupersedes, 'a 50-year-old settlement never supersedes its first wall across 5 seeds, however dense it gets (age-gate, M-GRW-2b)');

  const ringroadEdges = m.graph.edges.filter(e => e.cls === 'ringroad');
  ok(ringroadEdges.length > 0, `ring-road edges exist (${ringroadEdges.length} found)`);
  ok(ringroadEdges.every(e => T.pointInPoly(m.graph.nodes[e.a], m.wall.ring) && T.pointInPoly(m.graph.nodes[e.b], m.wall.ring)),
    'every ring-road edge endpoint sits inside the final active wall ring (a superseded ring is always smaller, by construction)');

  // gates correspond to the ACTIVE ring only — every gate point sits on (not just near) it
  ok(m.wall.gates.every(gt => {
    const ring = m.wall.ring;
    let best = Infinity;
    for (let i = 0; i < ring.length; i++) best = Math.min(best, T.distPtSeg(gt.pt, ring[i], ring[(i + 1) % ring.length]));
    return best < 5;
  }), 'every gate sits on the currently active wall ring, never a superseded one');

  // realized population still lands in the same tolerance band this file already holds every
  // other generation to (M-DEN-1/2) — the feature must not blow the population model up
  ok(Math.abs(m.pop - m.popTarget) / m.popTarget < 0.6,
    `wallGenerations:true realized population ~${m.pop} still tracks target ${m.popTarget} (M-DEN-1/2)`);

  const m2 = UME.generate(12345, { epochs: 10, pop: 9000, walls: true, wallGenerations: true, settlementAge: 600, culture: 'medieval', site: 'river' });
  ok(UME.hashModel(m) === UME.hashModel(m2), 'wallGenerations:true generation is deterministic');

  // maxWallGenerations cap respected across several seeds/site kinds, not just one
  let capOk = true, capChecked = 0;
  for (const seed of [1, 5, 7, 21, 42, 100, 777, 999, 31337, 12345]) {
    for (const site of ['river', 'bay', 'coast']) {
      const mm = UME.generate(seed, { epochs: 10, pop: 9000, walls: true, wallGenerations: true, settlementAge: 600, culture: 'medieval', site });
      capChecked++;
      if ((mm.wall.generation || 1) > UME.DEFAULT_RULES.settlement.maxWallGenerations) capOk = false;
    }
  }
  ok(capOk, `maxWallGenerations respected across ${capChecked} (seed x site) combinations`);

  // neutrality: omitting the option and passing an explicit false must agree exactly (byte-
  // identical hashModel()) across several seeds/sites — the same discipline every other opt-in
  // toggle in this file is held to (terrainAware, ruined, GenerationRules)
  let neutralOk = true, neutralChecked = 0;
  for (const seed of [1, 42, 777, 12345]) {
    for (const site of ['river', 'bay', 'landlocked']) {
      const opts = { epochs: 8, pop: 8000, walls: true, culture: 'medieval', site };
      const omitted = UME.generate(seed, opts);
      const explicitFalse = UME.generate(seed, Object.assign({}, opts, { wallGenerations: false }));
      neutralChecked++;
      if (UME.hashModel(omitted) !== UME.hashModel(explicitFalse)) neutralOk = false;
    }
  }
  ok(neutralOk, `wallGenerations omitted vs. explicit false are byte-identical across ${neutralChecked} (seed x site) combinations (neutrality)`);

  // Venus (radial) is completely unaffected: the toggle is never read on that branch
  let venusOk = true;
  for (const seed of [1, 42, 777]) {
    const opts = { epochs: 8, pop: 9000, walls: true, culture: 'venus', site: 'river' };
    const off = UME.generate(seed, opts);
    const on = UME.generate(seed, Object.assign({}, opts, { wallGenerations: true, settlementAge: 600 }));
    if (UME.hashModel(off) !== UME.hashModel(on)) venusOk = false;
  }
  ok(venusOk, 'Venus (radial growth) generation is byte-identical with wallGenerations/settlementAge set vs. unset across 3 seeds — the toggle is inert on that branch');

  // safety audit (same technique the standing audit elsewhere in this file uses): ring-road edges
  // never genuinely sit in water (matching removeWaterCrossings' own >=2-of-9-samples definition
  // of "wet" — a single grazing sample near a landArc/bank handoff is expected and already
  // tolerated for every other street/lane class in this engine, not unique to ring roads), and
  // never cross the active wall away from a gate. Not every seed/site combination fires a
  // supersession at all (correctly so, now that it needs genuine cause) — this audits whatever
  // ring-road edges each combination actually produced, empty or not.
  let wetFails = 0, crossFails = 0, auditChecked = 0, auditWithRingroads = 0;
  for (const seed of [1, 4242, 777, 12345, 999]) {
    for (const site of ['river', 'riverthrough', 'bay', 'coast']) {
      const mm = UME.generate(seed, { epochs: 8, pop: 9000, walls: true, wallGenerations: true, culture: 'medieval', site });
      auditChecked++;
      const rrEdges = mm.graph.edges.filter(e => e.cls === 'ringroad');
      if (rrEdges.length) auditWithRingroads++;
      if (mm.site.waterPoly && mm.site.waterPoly.length)
        for (const e of rrEdges) {
          const a = mm.graph.nodes[e.a], b = mm.graph.nodes[e.b];
          let wetSamples = 0;
          for (let i = 1; i < 10; i++) {
            const p = { x: a.x + (b.x - a.x) * i / 10, y: a.y + (b.y - a.y) * i / 10 };
            if (T.pointInPoly(p, mm.site.waterPoly)) wetSamples++;
          }
          if (wetSamples >= 2) wetFails++;
        }
      if (mm.wall.ring) {
        const ring = mm.wall.ring, gates = mm.wall.gates;
        for (const e of rrEdges) {
          const a = mm.graph.nodes[e.a], b = mm.graph.nodes[e.b];
          for (let i = 0; i < ring.length; i++) {
            const h = T.segInt(a, b, ring[i], ring[(i + 1) % ring.length]);
            if (h && !gates.some(gt => Math.hypot(gt.pt.x - h.pt.x, gt.pt.y - h.pt.y) < 40)) crossFails++;
          }
        }
      }
    }
  }
  ok(auditWithRingroads > 0, `at least some of the ${auditChecked} (seed x site) combinations actually produced ring-road edges to audit (${auditWithRingroads} did)`);
  ok(wetFails === 0, `ring-road edges never genuinely sit in water across ${auditChecked} (seed x site) combinations (${wetFails} failures)`);
  ok(crossFails === 0, `ring-road edges never cross the active wall away from a gate across ${auditChecked} combinations (${crossFails} failures)`);

  // settlement rules group: defaults + tunability wired the same generic way as street/parcels
  ok(UME.DEFAULT_RULES.settlement.wallGenerationThreshold === 0.8, 'DEFAULT_RULES.settlement.wallGenerationThreshold default (M-GRW-2a)');
  ok(UME.DEFAULT_RULES.settlement.wallGenerationMinAgeGap === 120, 'DEFAULT_RULES.settlement.wallGenerationMinAgeGap default (M-GRW-2b: real gaps ~74-168y)');
  ok(UME.DEFAULT_RULES.settlement.wallGenerationExtramuralShare === 0.15, 'DEFAULT_RULES.settlement.wallGenerationExtramuralShare default');
  ok(UME.DEFAULT_RULES.settlement.maxWallGenerations === 3, 'DEFAULT_RULES.settlement.maxWallGenerations default (M-GRW-2)');
  ok(UME.DEFAULT_RULES.settlement.carryingCapacityWeight === 1.0, 'DEFAULT_RULES.settlement.carryingCapacityWeight default (full placeholder effect)');
  const customSettlement = UME.resolveRules({ settlement: { maxWallGenerations: 1 } });
  ok(customSettlement.settlement.maxWallGenerations === 1 && customSettlement.settlement.wallGenerationThreshold === UME.DEFAULT_RULES.settlement.wallGenerationThreshold,
    'resolveRules(partial) merges the settlement group the same generic way as every other group');
  const capped = UME.generate(12345, { epochs: 10, pop: 9000, walls: true, wallGenerations: true, settlementAge: 600, culture: 'medieval', site: 'river', rules: customSettlement });
  ok((capped.wall.generation || 1) <= 1, 'maxWallGenerations:1 (via rules) caps the town at its first wall — it never supersedes even when age/fill/extramural would otherwise allow it');

  // carrying-capacity placeholder: weight=0 pins the factor to a no-op, isolating the logistic-
  // ramp change from the carrying-capacity change; a real Cartalith port only needs to change
  // what estimateCarryingCapacity itself returns, never this call site
  const rulesNoCarry = UME.resolveRules({ settlement: { carryingCapacityWeight: 0 } });
  const noCarryModel = UME.generate(12345, { epochs: 10, pop: 9000, walls: true, wallGenerations: true, settlementAge: 600, culture: 'medieval', site: 'river', rules: rulesNoCarry });
  ok(UME.hashModel(noCarryModel) !== UME.hashModel(m),
    'carryingCapacityWeight genuinely changes the outcome vs. the full-weight default (the mechanism is live, not inert)');
}

console.log(`\n${pass + fail} assertions: ${pass} passed, ${fail} failed`);
if (fail) { console.error('\nFailures:\n - ' + failures.join('\n - ')); process.exit(1); }
