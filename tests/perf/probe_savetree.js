#!/usr/bin/env node
/* v2.26 — the project TREE writer (SAVEFILE_COMPAT.md).
 *
 *   node tests/perf/probe_savetree.js "Cartalith v2.26 DCC test.html" ["<older build>"]
 *
 * Why this is a probe and not a smoke block: every assertion here needs a REAL
 * exportZip() -> loadZip() round trip on a REAL populated world, and the second
 * half needs two builds open at once to prove a pre-v2.26 flat save still opens.
 * smoke_gen1.js runs one page against one file and, in this environment, crashes
 * near its own end (disclosed since v1.100), so these would never run there.
 *
 * The export Blob is captured by monkeypatching URL.createObjectURL — the v1.90
 * technique — so this drives the SHIPPED exportZip(), never a reimplementation
 * of it. Take the LAST blob: the bake path creates its own earlier.
 */
const { chromium } = require(process.env.PLAYWRIGHT_DIR || '/opt/node22/lib/node_modules/playwright');
const path = require('path'), fs = require('fs');

let ok = 0, fail = 0;
const A = (name, cond) => { if (cond) { ok++; console.log('ok   - ' + name); }
  else { fail++; console.log('FAIL - ' + name); } };


async function build(page, seed, withPois) {
  return await page.evaluate(async (o) => {
    state.tect.seed = o.seed; state.resW = 256;
    if (typeof _setupSkipped !== 'undefined') _setupSkipped = true;
    GW = state.resW; GH = gridH(GW); allocate(); await generate();
    if (typeof _civIterativeAutoWorld === 'function') await _civIterativeAutoWorld(3);
    if (typeof _civAutoPolity === 'function') _civAutoPolity();          /* paint territory, so rasters/territory.i32 is real */
    state.labels.push({ x: 10.5, y: 20.25, name: 'The Broken Coast', angle: 0.3, arc: 0, size: 18, sizeMode: 'fixed' });
    state.mapIcons.push({ x: 40, y: 12, fam: 'feature', slot: 'mountain', scale: 1.5 });
    if (typeof regionSel !== 'undefined') regionSel = { x: 5, y: 6, w: 40, h: 30 };
    if (o.withPois) {
      /* Force the two index bases apart, the v1.75 way: POIs INSERTED AHEAD of
         the settlements, so state.places index != settlements-array index. */
      state.places.unshift({ x: 3, y: 3, kind: 'ruin', category: 'poi', name: 'Old Ruin', faction: 0, pop: 0 },
                           { x: 4, y: 4, kind: 'ruin', category: 'poi', name: 'Second Ruin', faction: 0, pop: 0 });
      for (const w of civWays) { if (typeof w.aIdx === 'number') w.aIdx += 2; if (typeof w.bIdx === 'number') w.bIdx += 2; }
    }
    const pairs = civWays.filter(w => !w.sea && !w.manual && typeof w.aIdx === 'number')
      .map(w => [state.places[w.aIdx] && state.places[w.aIdx].name, state.places[w.bIdx] && state.places[w.bIdx].name]);
    const fnv = a => { let h = 2166136261 >>> 0; for (let i = 0; i < a.length; i++) { h ^= a[i]; h = Math.imul(h, 16777619) >>> 0; } return h >>> 0; };
    return { places: state.places.length,
      settlements: state.places.filter(q => CIV_SETTLE_KEYS.has(q.kind)).length,
      pois: state.places.filter(q => !CIV_SETTLE_KEYS.has(q.kind)).length,
      ways: civWays.length, labels: state.labels.length, icons: state.mapIcons.length,
      factions: civFactionNames.length, seed: state.tect.seed, sea: state.seaLevel, mapKm: state.mapWidthKm,
      terrCells: (() => { let c = 0; if (civTerritory) for (let i = 0; i < civTerritory.length; i++) if (civTerritory[i]) c++; return c; })(),
      terrHash: civTerritory ? fnv(civTerritory) : 0,
      fieldHash: fnv(new Uint8Array(field.buffer)),
      wayPairs: pairs.length, wayPairSample: pairs.slice(0, 5) };
  }, { seed, withPois });
}

async function exportBytes(page) {
  return await page.evaluate(async () => {
    /* v1.90's technique: drive the SHIPPED exportZip() and capture the Blob it
       hands to URL.createObjectURL, rather than reimplementing the zip writer.
       Take the LAST blob — the bake path creates its own, earlier. */
    let blob = null; const o = URL.createObjectURL;
    URL.createObjectURL = function (x) { if (x instanceof Blob) blob = x; return o.apply(this, arguments); };
    const oc = HTMLAnchorElement.prototype.click; HTMLAnchorElement.prototype.click = function () {};
    document.getElementById('bakeRes').value = '1024';
    const tl = document.getElementById('bakeTiles'); if (tl) tl.checked = false;
    try { await exportZip(); }
    finally { URL.createObjectURL = o; HTMLAnchorElement.prototype.click = oc; }
    if (!blob) throw new Error('exportZip() produced no Blob');
    return Array.from(new Uint8Array(await blob.arrayBuffer()));
  });
}

(async () => {
  const target = process.argv[2], older = process.argv[3];
  if (!target) { console.error('usage: probe_savetree.js <target.html> [older.html]'); process.exit(2); }
  const br = await chromium.launch({ executablePath: process.env.CHROME_BIN });
  const errs = [];

  // ================= PART 1 — the tree the writer produces =================
  const p = await br.newPage();
  p.on('pageerror', e => errs.push(String(e)));
  await p.goto('file://' + path.resolve(target));
  await p.waitForFunction(() => typeof window.generate === 'function', { timeout: 60000 });
  const before = await build(p, 12345, true);
  const bytes = await exportBytes(p);

  const S = await p.evaluate(async (bytes) => {
    const ab = new Uint8Array(bytes).buffer, z = await unzipAny(ab), D = n => JSON.parse(new TextDecoder().decode(z[n]));
    const R = { names: Object.keys(z).sort() };
    R.hasProject = !!z['project.json'];
    R.hasRg16 = !!z['heightmap_rg16.bin'];
    R.flatRoots = ['heightmap.f32','temperature.f32','rainfall.f32','volcanic_field.f32','impact_field.f32','strahler_order.bin'].filter(k => !!z[k]);
    R.man = D('project.json');
    R.rasterBad = [];
    for (const k of R.names) if (k.indexOf('rasters/') === 0) {
      const es = (k.slice(-4) === '.f32' || k.slice(-4) === '.i32') ? 4 : 1;
      if (z[k].length !== GW * GH * es) R.rasterBad.push(k + ':' + z[k].length + '!=' + (GW * GH * es));
    }
    R.hasTerritory = !!z['rasters/territory.i32'];
    const pj = D('params.json').reference || {};
    R.pRepeatsGrid = pj.seaLevel !== undefined || pj.mapWidthKm !== undefined || pj.world !== undefined || (pj.tect && pj.tect.seed !== undefined);
    R.pRepeatsEntities = pj.places !== undefined || pj.civ !== undefined || pj.labels !== undefined || pj.mapIcons !== undefined;
    R.pKeepsPois = Array.isArray(pj.pois) && pj.pois.length === 2;
    const sd = D('entities/settlements.json'), wd = D('entities/ways.json'), fd = D('entities/factions.json');
    R.nSettle = sd.settlements.length;
    R.nextIdOk = sd.next_id > Math.max.apply(null, sd.settlements.map(s => s.id));
    R.noPoiLeaked = sd.settlements.every(s => s.name !== 'Old Ruin' && s.name !== 'Second Ruin');
    R.kindsClosed = sd.settlements.every(s => ['metropolis','capital','city','town','village','hamlet'].indexOf(s.kind) >= 0 || CIV_SETTLE_KEYS.has(s.kind));
    R.bothCapitalAndKind = sd.settlements.every(s => typeof s.capital === 'boolean' && typeof s.kind === 'string');
    R.roads = (wd.roads || []).length;
    R.roadsInRange = (wd.roads || []).every(r => r.from >= 0 && r.from < R.nSettle && r.to >= 0 && r.to < R.nSettle);
    R.roadPairs = (wd.roads || []).map(r => [sd.settlements[r.from].name, sd.settlements[r.to].name]);
    R.noHyphenLane = (wd.manual || []).every(m => m.kind !== 'sea-lane');
    R.factionsDense = fd.factions.every((f, i) => f.id === i);
    R.everyColor = fd.factions.every(f => Array.isArray(f.color) && f.color.length === 3);
    R.hasUserColorMember = fd.factions.every(f => 'user_color' in f);
    return R;
  }, bytes);

  A('§4: exportZip writes project.json at the root — the whole layout test', S.hasProject);
  A('§4: ...and no longer writes the flat layout\'s root rasters', S.flatRoots.length === 0);
  A('§15.2: heightmap_rg16.bin is NOT written into a tree', !S.hasRg16);
  A('§7: project.json declares format/format_version and the real grid',
    S.man.format === 'cartalith-project' && S.man.format_version === 1 &&
    S.man.world.grid_width > 0 && S.man.world.grid_height > 0 &&
    S.man.world.seed === before.seed && S.man.world.sea_level === before.sea &&
    S.man.world.map_width_km === before.mapKm && typeof S.man.world.wrap_x === 'boolean');
  A('§8: every rasters/ entry is exactly GW*GH*element bytes' + (S.rasterBad.length ? ' — ' + S.rasterBad.join(', ') : ''), S.rasterBad.length === 0);
  A('§8.1: a painted world writes rasters/territory.i32', S.hasTerritory && before.terrCells > 0);
  A('§13.1: params.json does not repeat the grid', !S.pRepeatsGrid);
  A('§13.1: ...nor the entities that now have their own entries', !S.pRepeatsEntities);
  A('§13.1: ...but DOES keep the POIs the tree has no slot for', S.pKeepsPois);
  A('§9.1/§15.1: no POI is invented into entities/settlements.json', S.noPoiLeaked && S.nSettle === before.settlements);
  A('§9.1: every written kind is in the closed set (or this app\'s superset)', S.kindsClosed);
  A('§9.1: capital and kind are BOTH written — they are two facts', S.bothCapitalAndKind);
  A('§9.1: next_id is above max(id), so no reader has to repair it', S.nextIdOk);
  A('§9.3: every road from/to indexes the SETTLEMENTS array, in range', S.roadsInRange && S.roads > 0);
  A('§9.3: ...and names the same settlement pairs the live world had (the index-base remap)',
    before.wayPairSample.every(pr => S.roadPairs.some(q => q[0] === pr[0] && q[1] === pr[1])));
  A('§14.4: a manual sea lane is written sea_lane, never the app\'s own sea-lane', S.noHyphenLane);
  A('§9.2: factions are dense and index-addressed', S.factionsDense);
  A('§9.2: every faction carries a stored colour, index 0 included', S.everyColor);
  A('§9.2: ...and user_color is always present, null for "use the stored colour"', S.hasUserColorMember);

  // ================= PART 2 — the round trip =================
  const after = await p.evaluate(async (bytes) => {
    const R = { warn: [] };
    const blob = new Blob([new Uint8Array(bytes)], { type: 'application/zip' });
    const ow = window.alert; window.alert = m => R.warn.push(String(m));
    await loadZip(blob); window.alert = ow;
    const fnv = a => { let h = 2166136261 >>> 0; for (let i = 0; i < a.length; i++) { h ^= a[i]; h = Math.imul(h, 16777619) >>> 0; } return h >>> 0; };
    const pairs = civWays.filter(w => !w.sea && !w.manual && typeof w.aIdx === 'number')
      .map(w => [state.places[w.aIdx] && state.places[w.aIdx].name, state.places[w.bIdx] && state.places[w.bIdx].name]);
    Object.assign(R, { places: state.places.length,
      settlements: state.places.filter(q => CIV_SETTLE_KEYS.has(q.kind)).length,
      pois: state.places.filter(q => !CIV_SETTLE_KEYS.has(q.kind)).length,
      ways: civWays.length, labels: state.labels.length, icons: state.mapIcons.length,
      factions: civFactionNames.length, seed: state.tect.seed, sea: state.seaLevel, mapKm: state.mapWidthKm,
      terrCells: (() => { let c = 0; if (civTerritory) for (let i = 0; i < civTerritory.length; i++) if (civTerritory[i]) c++; return c; })(),
      terrHash: civTerritory ? fnv(civTerritory) : 0,
      fieldHash: fnv(new Uint8Array(field.buffer)),
      wayPairSample: pairs.slice(0, 5),
      label0: state.labels[0] || null, icon0: state.mapIcons[0] || null,
      region: (typeof regionSel !== 'undefined' && regionSel) ? regionSel : null });
    return R;
  }, bytes);

  A('round trip: the load reports no damage at all', after.warn.length === 0);
  A('round trip: heightmap is bit-identical', after.fieldHash === before.fieldHash);
  A('round trip: settlement count survives', after.settlements === before.settlements);
  A('round trip: POIs survive — the tree has no slot, so they must ride in params.json',
    after.pois === before.pois && after.places === before.places);
  A('round trip: way count survives', after.ways === before.ways);
  A('round trip: each road still joins the SAME two settlements',
    before.wayPairSample.every((pr, k) => after.wayPairSample[k] && after.wayPairSample[k][0] === pr[0] && after.wayPairSample[k][1] === pr[1]));
  A('round trip: territory is bit-identical through the sparse<->i32 conversion',
    before.terrCells > 0 && after.terrCells === before.terrCells && after.terrHash === before.terrHash);
  A('round trip: factions survive', after.factions === before.factions);
  A('round trip: seed, sea level and map width survive',
    after.seed === before.seed && after.sea === before.sea && after.mapKm === before.mapKm);
  A('round trip: a label keeps every member, size_mode included',
    !!after.label0 && after.label0.name === 'The Broken Coast' && after.label0.size === 18 && after.label0.sizeMode === 'fixed');
  A('round trip: an icon keeps family, slot and scale',
    !!after.icon0 && after.icon0.fam === 'feature' && after.icon0.slot === 'mountain' && after.icon0.scale === 1.5);
  A('§11.3: the region marquee survives, clamped to the grid',
    !!after.region && after.region.w > 0 && after.region.h > 0);
  await p.close();

  // ============ PART 3 — a pre-v2.26 FLAT save must still open ============
  if (older && fs.existsSync(older)) {
    const q = await br.newPage();
    q.on('pageerror', e => errs.push(String(e)));
    await q.goto('file://' + path.resolve(older));
    await q.waitForFunction(() => typeof window.generate === 'function', { timeout: 60000 });
    const oldWorld = await build(q, 4242, false);
    const oldBytes = await exportBytes(q);
    const wasFlat = await q.evaluate(async b => { const z = await unzipAny(new Uint8Array(b).buffer);
      return !z['project.json'] && !!z['params.json']; }, oldBytes);
    await q.close();
    A('the older build really does write the FLAT layout (so this tests what it claims)', wasFlat);

    const r = await br.newPage();
    r.on('pageerror', e => errs.push(String(e)));
    await r.goto('file://' + path.resolve(target));
    await r.waitForFunction(() => typeof window.generate === 'function', { timeout: 60000 });
    const back = await r.evaluate(async (b) => {
      const R = { warn: [] };
      if (typeof _setupSkipped !== 'undefined') _setupSkipped = true;
      const ow = window.alert; window.alert = m => R.warn.push(String(m));
      await loadZip(new Blob([new Uint8Array(b)], { type: 'application/zip' })); window.alert = ow;
      const fnv = a => { let h = 2166136261 >>> 0; for (let i = 0; i < a.length; i++) { h ^= a[i]; h = Math.imul(h, 16777619) >>> 0; } return h >>> 0; };
      Object.assign(R, { settlements: state.places.filter(x => CIV_SETTLE_KEYS.has(x.kind)).length,
        ways: civWays.length, labels: state.labels.length, seed: state.tect.seed,
        fieldHash: fnv(new Uint8Array(field.buffer)) });
      return R;
    }, oldBytes);
    await r.close();
    A('§4: the new build still opens a pre-v2.26 flat save, without complaint', back.warn.length === 0);
    A('§4: ...with its settlements, ways and labels intact',
      back.settlements === oldWorld.settlements && back.ways === oldWorld.ways && back.labels === oldWorld.labels);
    A('§4: ...and a bit-identical heightmap', back.fieldHash === oldWorld.fieldHash && back.seed === oldWorld.seed);
  } else {
    console.log('note - no older build given; skipping the flat-compatibility half');
  }

  await br.close();
  if (errs.length) { console.log('\npage errors: ' + errs.slice(0, 5).join(' | ')); }
  console.log('\n' + ok + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
