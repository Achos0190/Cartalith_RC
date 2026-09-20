/* Journey-Planner speed calibration probe.
   Calls jpCalcLand / jpCalcWater directly with synthetic stages representing the
   reference cases in docs/research/travel-speeds.md §8, and prints the composed
   km/day next to the report's calendar-average band. No world generation needed —
   the calculators are pure over their (stage, plan) arguments. */
const path = require('path');
const PW = process.env.PLAYWRIGHT_DIR || '/opt/node22/lib/node_modules/playwright';
const CHROME_BIN = process.env.CHROME_BIN || '/opt/pw-browsers/chromium';
const { chromium } = require(PW);

/* [label, band_lo, band_hi] — report §8 calendar-average column */
const CASES = [
  ['foot / paved road',            30, 45],
  ['foot / dirt track',            20, 30],
  ['foot / open plains (steppe)',  20, 30],
  ['foot / forest path',           16, 22],
  ['foot / rocky terrain',          8, 14],
  ['foot / mountain pass',         12, 20],
  ['foot / swamp',                  6, 13],
  ['porter caravan / dirt track',  12, 22],
  ['merchant caravan / dirt track',20, 30],
  ['ox-ish wagon train / dirt',    14, 19],
  ['mounted horse / paved road',   40, 60],
  ['mounted horse / dirt track',   40, 60],
  ['camel caravan / desert',       20, 40],
  ['river barge / calm downstream',25, 38],
  ['river barge / calm upstream',  12, 18],
  ['sea cog / sheltered bay',      25, 40],
  ['sea cog / coastal waters',     45, 65],
  ['sea cog / open sea',          100,180],
  ['sea dhow / open sea',         100,180],
  ['sea fishing / coastal',        35, 65],
];

async function run(file) {
  const browser = await chromium.launch({ executablePath: CHROME_BIN, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  const errs = []; page.on('pageerror', e => errs.push(String(e)));
  page.on('dialog', async d => { await d.dismiss(); });
  await page.goto('file://' + path.resolve(file), { waitUntil: 'load', timeout: 120000 });
  await page.waitForTimeout(300);
  const out = await page.evaluate(() => {
    const basePlan = {
      groupSize: 1, transport: 'Walking', pace: 'Standard Pace', hours: 8,
      cargoKg: 10, supplyDays: 4, season: 'Spring',
      grazing: 'None — carry all fodder', foraging: 'None', carryFood: true,
      desertWater: 'Established Caravan Route',
      animals: { donkey: 0, mule: 0, camel: 0, horse: 0 },
      carts: 0, wagons: 0, travois: 0, sleds: 0
    };
    const P = o => Object.assign({}, basePlan, o, { animals: Object.assign({}, basePlan.animals, o.animals || {}) });
    const S = o => Object.assign({ km: 500, cat: 'land', terrain: 'Dirt Track', routeCond: 'Standard',
      infra: 'Stable Settlements', biome: 'Temperate Forest' }, o);

    const R = [];
    const land = (st, pl) => { const r = jpCalcLand(S(st), P(pl)); R.push(r.blocked ? { blocked: r.blocked } : { km: r.dailyKm }); };
    const water = (st, pl) => { const r = jpCalcWater(S(st), P(pl)); R.push(r.blocked ? { blocked: r.blocked } : { km: r.dailyKm }); };

    land({ terrain: 'Paved Road' }, {});
    land({ terrain: 'Dirt Track' }, {});
    land({ terrain: 'Open Plains', biome: 'Steppe / Grassland' }, {});
    land({ terrain: 'Forest Path' }, {});
    land({ terrain: 'Rocky Terrain', biome: 'Mountain Highland' }, {});
    land({ terrain: 'Mountain Pass', biome: 'Mountain Highland' }, {});
    land({ terrain: 'Swamp / Marsh', biome: 'Wetlands / Marshes' }, {});
    /* burdened porter: 6 people, heavy cargo, no animals */
    land({}, { groupSize: 6, cargoKg: 160, supplyDays: 6 });
    /* merchant caravan preset */
    land({}, { groupSize: 12, transport: 'Baggage Train', cargoKg: 900, supplyDays: 7,
      grazing: 'Partial — graze at camp', animals: { mule: 8, horse: 2 }, carts: 2 });
    /* wagon-freight train */
    land({}, { groupSize: 8, transport: 'Baggage Train', cargoKg: 3000, supplyDays: 7,
      grazing: 'Partial — graze at camp', animals: { mule: 12 }, wagons: 4 });
    land({ terrain: 'Paved Road' }, { transport: 'Mounted Rider', animals: { horse: 1 } });
    land({ terrain: 'Dirt Track' }, { transport: 'Mounted Rider', animals: { horse: 1 } });
    land({ terrain: 'Desert Hardpack', biome: 'Hot Desert' }, { groupSize: 20, transport: 'Baggage Train',
      cargoKg: 3000, supplyDays: 10, animals: { camel: 24 } });

    water({ cat: 'river', terrain: 'Calm River', routeCond: 'Mild Downstream', biome: 'Temperate Forest' },
      { transport: 'River Transport', vessel: 'River Barge', groupSize: 4, cargoKg: 15000, hours: 10 });
    water({ cat: 'river', terrain: 'Calm River', routeCond: 'Mild Upstream', biome: 'Temperate Forest' },
      { transport: 'River Transport', vessel: 'River Barge', groupSize: 4, cargoKg: 15000, hours: 10 });
    const sea = { cat: 'sea', biome: 'Coastal Lowland', routeCond: 'Neutral' };
    const seaPlan = { transport: 'Sea Faring', vessel: 'Cog', groupSize: 6, cargoKg: 40000, hours: 14 };
    water(Object.assign({}, sea, { terrain: 'Sheltered Bay' }), seaPlan);
    water(Object.assign({}, sea, { terrain: 'Coastal Waters' }), seaPlan);
    water(Object.assign({}, sea, { terrain: 'Open Sea' }), seaPlan);
    water(Object.assign({}, sea, { terrain: 'Open Sea' }), Object.assign({}, seaPlan, { vessel: 'Dhow', cargoKg: 8000 }));
    water(Object.assign({}, sea, { terrain: 'Coastal Waters' }), Object.assign({}, seaPlan, { vessel: 'Fishing Vessel', cargoKg: 800, hours: 10 }));

    /* the report's §9 sample journey: 8423 km, 45% sea (dhow), 55% overland mixed */
    const seaKm = 8423 * 0.45, landKm = 8423 * 0.55;
    const mix = [['Dirt Track', 'Steppe / Grassland', .40], ['Desert Hardpack', 'Hot Desert', .25],
                 ['Open Plains', 'Steppe / Grassland', .20], ['Rocky Terrain', 'Mountain Highland', .10],
                 ['Mountain Pass', 'Mountain Highland', .05]];
    let landDays = 0;
    for (const [t, b, f] of mix) {
      const r = jpCalcLand(S({ km: landKm * f, terrain: t, biome: b, infra: 'Sparse Settlements' }),
        P({ groupSize: 6, transport: 'Baggage Train', cargoKg: 600, supplyDays: 8,
            grazing: 'Partial — graze at camp', animals: { camel: 10, mule: 2 } }));
      if (!r.blocked) landDays += r.days;
    }
    let seaDays = 0;
    for (const [t, f] of [['Open Sea', .70], ['Coastal Waters', .30]]) {
      const r = jpCalcWater(S({ km: seaKm * f, cat: 'sea', terrain: t, biome: 'Coastal Lowland', routeCond: 'Neutral', infra: 'Sparse Settlements' }),
        P({ transport: 'Sea Faring', vessel: 'Dhow', groupSize: 6, cargoKg: 6000, hours: 14 }));
      if (!r.blocked) seaDays += r.days;
    }
    return { rows: R, sample: { landDays, seaDays, total: landDays + seaDays } };
  });
  await browser.close();
  return { out, errs: errs.slice(0, 3) };
}

(async () => {
  for (const f of process.argv.slice(2)) {
    const { out, errs } = await run(f);
    console.log('=== ' + path.basename(f) + ' ===');
    console.log('  case                             km/day    target band   verdict');
    out.rows.forEach((r, i) => {
      const [label, lo, hi] = CASES[i];
      if (r.blocked) { console.log('  ' + label.padEnd(32) + ' BLOCKED: ' + r.blocked); return; }
      const v = r.km;
      const verdict = v < lo ? ((lo / v).toFixed(2) + '× too slow') : v > hi ? ((v / hi).toFixed(2) + '× too fast') : 'ok';
      console.log('  ' + label.padEnd(32) + String(v.toFixed(1)).padStart(7) + '   ' + (lo + '-' + hi).padStart(9) + '   ' + verdict);
    });
    const s = out.sample;
    console.log('  §9 sample journey (8423 km): overland ' + s.landDays.toFixed(0) + ' d + sea ' + s.seaDays.toFixed(0)
      + ' d = ' + s.total.toFixed(0) + ' d   [report: 244 d realistic; +' + (100 * (s.total / 244 - 1)).toFixed(0) + '%]');
    if (errs.length) console.log('  ERRORS ' + JSON.stringify(errs));
  }
})();
