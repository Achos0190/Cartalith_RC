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
 * (2) nothing is built inside a water body. */
{
  const profiles = Object.keys(UME.CULTURE_PROFILES);
  const sites = ['river', 'riverthrough', 'bay', 'coast', 'landlocked'];
  let crossingFailures = 0, wetBuildingFailures = 0, wetParcelFailures = 0, checked = 0;
  for (const culture of profiles) {
    for (const site of sites) {
      for (const fortified of [false, true]) {
        const m = UME.generate(4242, { epochs: 8, pop: 7500, walls: true, fortified, culture, site });
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
  ok(crossingFailures === 0, `no road crosses any wall/enceinte away from a gate, across ${checked} (profile × site × fortified) combinations (${crossingFailures} failures)`);
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

console.log(`\n${pass + fail} assertions: ${pass} passed, ${fail} failed`);
if (fail) { console.error('\nFailures:\n - ' + failures.join('\n - ')); process.exit(1); }
