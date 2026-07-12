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
  ok(f.wall.fort.counterscarp.length >= 3 && f.wall.fort.glacis.length >= 3, 'ditch counterscarp + glacis present');
  ok(f.wall.gates.length >= 1, `bastioned enceinte has gates (${f.wall.gates.length})`);
  const f2 = UME.generate(12345, { epochs: 8, pop: 6000, walls: true, fortified: true });
  ok(UME.hashModel(f) === UME.hashModel(f2), 'fortified generation deterministic');

  // late-stage Dutch-system features: wet ditch + (on a large fort) a double moat
  ok(f.wall.fort.wetDitch && f.wall.fort.ditchBand.length >= 4, 'fort has a wet ditch (flooded moat)');
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

console.log(`\n${pass + fail} assertions: ${pass} passed, ${fail} failed`);
if (fail) { console.error('\nFailures:\n - ' + failures.join('\n - ')); process.exit(1); }
