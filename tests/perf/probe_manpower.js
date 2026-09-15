/* v2.19 military-manpower probe.
 *
 * The model is block 2 (civ layer), so tests/run.sh cannot reach it -- the Journey Planner's own
 * precedent. There is no reference implementation in this file to port from, so the calibration
 * target is the owner's specification itself: it supplies two worked examples with stated outputs,
 * and reproducing both is what makes this a port rather than an invention.
 *
 * Usage: node probe_manpower.js "Cartalith Gen1 v2.19.html"
 */
const path = require('path');
const { chromium } = require(process.env.PLAYWRIGHT_DIR || '/opt/node22/lib/node_modules/playwright');
const CHROME_BIN = process.env.CHROME_BIN || '/opt/pw-browsers/chromium';

(async () => {
  const file = process.argv[2];
  const browser = await chromium.launch({ executablePath: CHROME_BIN, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  page.on('dialog', d => d.dismiss());
  const errs = []; page.on('pageerror', e => errs.push(String(e).slice(0, 300)));
  await page.goto('file://' + path.resolve(file), { waitUntil: 'load', timeout: 120000 });
  await page.waitForTimeout(500);

  const out = await page.evaluate(async () => {
    const R = {};
    R.exists = typeof civManpowerModel === 'function';
    if (!R.exists) return R;
    const maxUrb = _civMaxUrbanShare();
    R.maxUrb = maxUrb;

    /* The specification's two worked examples, with its own stated driver mapping:
       75% agricultural -> f = 3; 55% -> f = 11/9; "weak taxation, poor roads" -> monarchy,
       reach 0.20, road 0.10; "strong taxation, good roads/rivers, professional bureaucracy"
       -> empire, reach 0.90, road 0.70, navigable 0.60, sea 0.50. */
    R.A = civManpowerModel({ totalPop: 1e6, farmersPerUrbanite: 3, maxUrbanShare: maxUrb,
      government: 'monarchy', capitalRoadReach: 0.20, roadDensityNorm: 0.10, navShare: 0.10, seaShare: 0 });
    R.B = civManpowerModel({ totalPop: 1e6, farmersPerUrbanite: 11 / 9, maxUrbanShare: maxUrb,
      government: 'empire', capitalRoadReach: 0.90, roadDensityNorm: 0.70, navShare: 0.60, seaShare: 0.50,
      ecologicalFactor: 1.05 });

    /* The era assignments the specification's verification section publishes for six factions on
       one differentiated world: alpha = 0.90 (traditionalAgrarian), full road reach. */
    R.eras = {};
    for (const g of ['chiefdom', 'monarchy', 'republic', 'oligarchy', 'theocracy', 'empire']) {
      const m = civManpowerModel({ totalPop: 4e5, farmersPerUrbanite: 9, maxUrbanShare: maxUrb,
        government: g, capitalRoadReach: 1.0, roadDensityNorm: 0.3, navShare: 0.3, seaShare: 0.1 });
      R.eras[g] = { era: m.era.label, s: m.drivers.stateCapacity, cf: m.citizenFraction };
    }
    /* ...and the sparser world of the same specification, where every faction reads Bronze Age. */
    R.sparseMonarchy = civManpowerModel({ totalPop: 3.4e5, farmersPerUrbanite: 9, maxUrbanShare: maxUrb,
      government: 'monarchy', capitalRoadReach: 0.5, roadDensityNorm: 0.15, navShare: 0.2, seaShare: 0.1 }).era.label;

    /* Structural claims the model must satisfy whatever the numbers are. */
    const sub = civManpowerModel({ totalPop: 1e6, farmersPerUrbanite: 19, maxUrbanShare: maxUrb,
      government: 'chiefdom', capitalRoadReach: 0.1, roadDensityNorm: 0, navShare: 0, seaShare: 0 });
    R.warriorSociety = { standing: sub.standingArmy, levy: sub.emergencyMobilization, alpha: sub.drivers.alpha };

    R.ordering = R.A.standingArmy < R.A.fieldArmy && R.A.fieldArmy < R.A.emergencyMobilization
              && R.B.standingArmy < R.B.fieldArmy && R.B.fieldArmy < R.B.emergencyMobilization;
    R.ladderDecreases = R.B.ladder.every((r, i) => i === 0 || r.force <= R.B.ladder[i - 1].force);
    R.ladderCapped30 = R.A.ladder[0].cappedByPool && R.A.ladder[0].force === R.A.emergencyMobilization;
    R.ladderNotCapped365 = !R.A.ladder[3].cappedByPool;

    /* The citizen fraction must be a real, government-driven subset -- not a constant. */
    const cf = {};
    for (const g of ['chiefdom', 'monarchy', 'republic', 'city_state', 'oligarchy', 'empire']) {
      cf[g] = civManpowerModel({ totalPop: 1e6, farmersPerUrbanite: 9, maxUrbanShare: maxUrb, government: g,
        capitalRoadReach: 0.5, roadDensityNorm: 0.2, navShare: 0.2, seaShare: 0.1 }).citizenFraction;
    }
    R.citizenSpread = cf;
    /* An unknown government must read as chiefdom -- the conservative direction for BOTH tables. */
    const unk = civManpowerModel({ totalPop: 1e6, farmersPerUrbanite: 9, maxUrbanShare: maxUrb,
      government: '__not_a_government__', capitalRoadReach: 0.5, roadDensityNorm: 0.2, navShare: 0.2, seaShare: 0.1 });
    const chf = civManpowerModel({ totalPop: 1e6, farmersPerUrbanite: 9, maxUrbanShare: maxUrb,
      government: 'chiefdom', capitalRoadReach: 0.5, roadDensityNorm: 0.2, navShare: 0.2, seaShare: 0.1 });
    R.unknownIsChiefdom = unk.standingArmy === chf.standingArmy && unk.citizenFraction === chf.citizenFraction;

    /* CITIZEN_MODERNISATION is derived from the table, not chosen: at full industrialisation the
       fraction must reach the ceiling whatever the government is. */
    const ind = civManpowerModel({ totalPop: 1e6, farmersPerUrbanite: 0.15, maxUrbanShare: maxUrb,
      government: 'empire', capitalRoadReach: 1, roadDensityNorm: 1, navShare: 1, seaShare: 1 });
    R.industrialCitizenCeiling = ind.citizenFraction;

    /* alpha must be exactly what each AG_TECH_LEVELS row's own hint string claims. */
    R.alphas = AG_TECH_LEVELS.map(r => +(r.farmersPerUrbanite / (1 + r.farmersPerUrbanite)).toFixed(4));

    /* --- live world: the model must differentiate on geography alone --------------------- */
    state.tect.seed = 12345; state.resW = 256; GW = 256; GH = gridH(GW); allocate();
    await generate();
    const ob = document.getElementById('onboard'); if (ob) ob.style.display = 'none';
    _civIterativeAutoWorld(3);
    if (typeof _civAutoPolity === 'function') _civAutoPolity();
    const live = _civFactionManpowerAll();
    R.live = live.map((m, i) => ({ f: i, pop: Math.round(m.totalPop), standing: Math.round(m.standingArmy),
      field: Math.round(m.fieldArmy), levy: Math.round(m.emergencyMobilization),
      log: +m.drivers.logistics.toFixed(3), eco: +m.drivers.ecologicalFactor.toFixed(3),
      era: m.era.label, sv: m.standingVerdict, mv: m.mobilizationVerdict }));
    const withPop = live.filter(m => m.totalPop > 0);
    R.liveCount = withPop.length;
    R.liveOrdering = withPop.every(m => m.standingArmy <= m.fieldArmy && m.fieldArmy <= m.emergencyMobilization);
    R.liveNoOverMobilise = withPop.every(m => m.emergencyMobilization <= m.totalPop * 0.30);
    R.liveDifferentiated = new Set(withPop.map(m => Math.round(m.standingArmy))).size > 1;

    /* Ag-tech and government must genuinely move the answer (both tables reached nothing before). */
    R.diag = { places: (state.places || []).length, settlements: (state.places || []).filter(p => p && p.category === 'settlement').length,
      aggPop: _civFactionAggregates().byFaction.map(a => a.pop), ways: (typeof civWays !== 'undefined' && civWays ? civWays.length : -1) };
    const f0 = live.findIndex(m => m.totalPop > 0);
    if (f0 < 0) return R;
    const baseStanding = live[f0].standingArmy;
    const g0 = civFactionGovernment[f0], t0 = civFactionAgTech[f0];
    civFactionAgTech[f0] = 'improvedAgrarian';
    R.agTechMoves = _civFactionManpower(f0).standingArmy !== baseStanding;
    R.agTechStanding = Math.round(_civFactionManpower(f0).standingArmy);
    civFactionAgTech[f0] = t0;
    civFactionGovernment[f0] = 'empire';
    const gEmpire = _civFactionManpower(f0).standingArmy;
    civFactionGovernment[f0] = 'chiefdom';
    const gChief = _civFactionManpower(f0).standingArmy;
    R.governmentMoves = gEmpire > gChief;
    R.govPair = [Math.round(gChief), Math.round(gEmpire)];
    civFactionGovernment[f0] = g0;
    R.restored = Math.round(_civFactionManpower(f0).standingArmy) === Math.round(baseStanding);

    /* Geography alone: identical institutions everywhere, answers must still spread. */
    const savedG = civFactionGovernment.slice(), savedT = civFactionAgTech.slice();
    for (let i = 0; i < civFactionGovernment.length; i++) { civFactionGovernment[i] = 'monarchy'; civFactionAgTech[i] = 'traditionalAgrarian'; }
    const flat = _civFactionManpowerAll().filter(m => m.totalPop > 0);
    R.geoSpread = flat.length > 1 && new Set(flat.map(m => Math.round(m.standingArmy))).size > 1;
    R.geoLogSpread = flat.length > 1 && new Set(flat.map(m => +m.drivers.logistics.toFixed(3))).size > 1;
    for (let i = 0; i < savedG.length; i++) { civFactionGovernment[i] = savedG[i]; civFactionAgTech[i] = savedT[i]; }

    /* The ecological factor is THE geography term -- if it collapsed to one value the model would
       be a technology lookup wearing five variables. */
    const eco = live.filter(m => m.totalPop > 0).map(m => +m.drivers.ecologicalFactor.toFixed(3));
    R.ecoSpread = new Set(eco).size > 1; R.eco = eco;

    /* --- the on-screen block, through the real renderer ---------------------------------- */
    const fid = live.findIndex(m => m.totalPop > 0);
    const html = _civFactionMilitaryHtml(fid);
    const host = document.createElement('div'); host.innerHTML = html; document.body.appendChild(host);
    const txt = host.textContent;
    R.ui = {
      hasHeading: /Military manpower/.test(txt),
      namesAllFour: /Standing army/.test(txt) && /field army/.test(txt) && /Emergency levy/.test(txt) && /stays out/.test(txt),
      hasLadder: /Largest force by duration/.test(txt) && /365 d/.test(txt),
      hasCitizenDenominator: /Citizen \/ free population/.test(txt) && /not against everyone/.test(txt),
      namesEra: txt.indexOf(live[fid].era.label) >= 0,
      showsBothBases: /Against total population instead/.test(txt),
      disclosesNotModelled: /Not modelled/.test(txt) && /garrisons/.test(txt),
      separatesPowerAxis: /separate axis/.test(txt),
      quotesRealStanding: txt.indexOf(Math.round(live[fid].standingArmy).toLocaleString()) >= 0,
      /* a hostile faction name must not be able to inject markup through the government label path */
      noRawAngle: host.querySelectorAll('script').length === 0
    };
    host.remove();
    /* A faction with no settlements must degrade, not throw or fabricate. */
    const emptyFid = live.findIndex(m => !(m.totalPop > 0));
    R.emptyBlock = emptyFid >= 0 ? /nothing to raise/i.test(_civFactionMilitaryHtml(emptyFid)) : null;

    /* Derived and stored nowhere: the save format must not have grown a manpower field. */
    R.notSerialized = JSON.stringify(serializeState()).indexOf('standingArmy') === -1;
    return R;
  });

  await browser.close();
  const fails = [];
  const ok = (n, c, extra) => { console.log((c ? 'ok   ' : 'FAIL ') + n + (extra != null ? '   [' + extra + ']' : '')); if (!c) fails.push(n); };
  const near = (a, b, pct) => Math.abs(a - b) <= Math.abs(b) * pct;

  ok('civManpowerModel exists in the page', out.exists);
  if (!out.exists) { console.log(errs.join('\n')); process.exit(1); }

  const A = out.A, B = out.B;
  ok('Kingdom A standing army reproduces the spec (5 846)', Math.round(A.standingArmy) === 5846, Math.round(A.standingArmy));
  ok('Kingdom A emergency levy reproduces the spec (41 221)', Math.round(A.emergencyMobilization) === 41221, Math.round(A.emergencyMobilization));
  ok('Kingdom A field army reproduces the spec (15 870)', Math.round(A.fieldArmy) === 15870, Math.round(A.fieldArmy));
  ok('Kingdom A citizen population reproduces the spec (745 500, monarchy)', Math.round(A.citizenPop) === 745500, Math.round(A.citizenPop));
  ok('Kingdom A era is High medieval', A.era.label === 'High medieval', A.era.label);
  ok('Kingdom A full levy sustains ~77 days (the feudal 2-month obligation)', near(A.levyDays, 77, 0.03), A.levyDays.toFixed(1));
  ok('Kingdom A field army sustains ~337 days', near(A.fieldDays, 337, 0.03), A.fieldDays.toFixed(1));
  ok('Kingdom A both era verdicts read within', A.standingVerdict === 'within' && A.mobilizationVerdict === 'within', A.standingVerdict + '/' + A.mobilizationVerdict);

  ok('Kingdom B standing army reproduces the spec (19 067)', Math.round(B.standingArmy) === 19067, Math.round(B.standingArmy));
  ok('Kingdom B emergency levy reproduces the spec (98 889)', Math.round(B.emergencyMobilization) === 98889, Math.round(B.emergencyMobilization));
  ok('Kingdom B field army reproduces the spec (47 368)', Math.round(B.fieldArmy) === 47368, Math.round(B.fieldArmy));
  ok('Kingdom B citizen population reproduces the spec (651 900, empire)', Math.round(B.citizenPop) === 651900, Math.round(B.citizenPop));
  ok('Kingdom B era is Military-fiscal state', B.era.label === 'Military-fiscal state', B.era.label);
  ok('Kingdom B full levy sustains ~41 days', near(B.levyDays, 41, 0.03), B.levyDays.toFixed(1));
  ok('Kingdom B field army sustains ~128 days', near(B.fieldDays, 128, 0.03), B.fieldDays.toFixed(1));
  ok('Kingdom B both era verdicts read within', B.standingVerdict === 'within' && B.mobilizationVerdict === 'within', B.standingVerdict + '/' + B.mobilizationVerdict);
  ok('Kingdom B 90d and 180d ladder rungs bracket the stated 40-60k field army',
     B.ladder[1].force > 40000 && B.ladder[2].force < 60000 && B.ladder[2].force > 30000,
     Math.round(B.ladder[1].force) + '/' + Math.round(B.ladder[2].force));

  ok('the six published era assignments reproduce (chiefdom Bronze)', out.eras.chiefdom.era === 'Bronze Age state', out.eras.chiefdom.era);
  ok('...monarchy Iron Age', out.eras.monarchy.era === 'Iron Age agrarian state', out.eras.monarchy.era);
  ok('...republic Iron Age', out.eras.republic.era === 'Iron Age agrarian state', out.eras.republic.era);
  ok('...oligarchy Iron Age', out.eras.oligarchy.era === 'Iron Age agrarian state', out.eras.oligarchy.era);
  ok('...theocracy Iron Age', out.eras.theocracy.era === 'Iron Age agrarian state', out.eras.theocracy.era);
  ok('...empire Classical', out.eras.empire.era === 'Classical agrarian state', out.eras.empire.era);
  ok('a sparser world with the same institutions reads Bronze Age, as published', out.sparseMonarchy === 'Bronze Age state', out.sparseMonarchy);

  ok('a subsistence polity keeps almost nobody standing but its levy stays demographic',
     out.warriorSociety.standing < 1500 && out.warriorSociety.levy > 20000,
     Math.round(out.warriorSociety.standing) + ' vs ' + Math.round(out.warriorSociety.levy));
  ok('standing < field < levy in both worked examples', out.ordering);
  ok('the ladder decreases with duration', out.ladderDecreases);
  ok('the 30-day rung is capped by the demographic pool', out.ladderCapped30);
  ok('the 365-day rung is not — the fiscal curve binds at the long end', out.ladderNotCapped365);

  const cfv = Object.values(out.citizenSpread);
  ok('the citizen fraction is government-driven, not a constant', new Set(cfv.map(v => v.toFixed(4))).size === cfv.length, JSON.stringify(out.citizenSpread));
  ok('an unknown government reads as chiefdom for BOTH tables', out.unknownIsChiefdom);
  ok('at full industrialisation the citizen fraction reaches the ceiling whatever the government',
     Math.abs(out.industrialCitizenCeiling - 0.98) < 1e-9, out.industrialCitizenCeiling);
  ok('alpha matches every AG_TECH_LEVELS hint string (95/90/80/50/31/13%)',
     JSON.stringify(out.alphas) === JSON.stringify([0.95, 0.9, 0.8, 0.5, 0.3103, 0.1304]), JSON.stringify(out.alphas));

  ok('a live world produces manpower for its factions', out.liveCount > 1, out.liveCount);
  ok('live: standing <= field <= levy for every faction', out.liveOrdering);
  ok('live: no faction mobilises more than 30% of itself', out.liveNoOverMobilise);
  ok('live: the answers are differentiated, not one number', out.liveDifferentiated);
  ok('ag technology genuinely moves the standing army', out.agTechMoves, out.agTechStanding);
  ok('government genuinely moves it, in the right direction', out.governmentMoves, out.govPair.join(' -> '));
  ok('restoring the roster restores the figure exactly', out.restored);
  ok('geography alone still spreads the answer under identical institutions', out.geoSpread);
  ok('...and spreads logistics capacity too', out.geoLogSpread);
  ok('the ecological factor spreads across factions — geography is live', out.ecoSpread, JSON.stringify(out.eco));
  ok('the inspector block renders with a heading', out.ui.hasHeading);
  ok('...and names all four outputs, not one "army size"', out.ui.namesAllFour);
  ok('...and the force-by-duration ladder', out.ui.hasLadder);
  ok('...and says the bands are measured against the citizen population', out.ui.hasCitizenDenominator);
  ok('...and names the derived era', out.ui.namesEra);
  ok('...and keeps the total-population basis legible rather than deleting it', out.ui.showsBothBases);
  ok('...and discloses what is not modelled, in its own words', out.ui.disclosesNotModelled);
  ok('...and separates the relative Power axis from the absolute headcounts', out.ui.separatesPowerAxis);
  ok('...quoting the model\'s real standing figure, not a placeholder', out.ui.quotesRealStanding);
  ok('...with no injected markup', out.ui.noRawAngle);
  ok('a faction with no settlements degrades honestly instead of fabricating', out.emptyBlock === true, String(out.emptyBlock));
  ok('nothing manpower-shaped reaches the save format', out.notSerialized);
  ok('no page errors', errs.length === 0);
  if (errs.length) console.log('  ' + errs.join('\n  '));
  console.log('\nlive: ' + JSON.stringify(out.live));
  console.log('\n' + (fails.length ? fails.length + ' FAILED' : 'all passed'));
  process.exit(fails.length ? 1 : 0);
})();
