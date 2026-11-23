// Downloads the sea surface temperature around each storm's track, for the "water under the storm" in the storm
// panel (scripts/build-data.mjs samples it at each report; see sstAt in scripts/sst.mjs).
//
// Source: NOAA's OISST v2.1 (daily, 0.25°, from September 1981; public domain), from the NOAA CoastWatch ERDDAP
// server, which can cut out a box of days and degrees. For each storm, a box round each stretch of up to 6 days of its
// track (1° beyond it), every other grid point (0.5°), from the day before it started: the build takes the water a day
// before the storm got there, so the storm's own cold wake doesn't count. About 4,800 storms; the first run takes a
// few hours, and is saved to data/raw/sst (one gzipped file per storm), so later runs only fetch new storms.
//
//   npm run data:sst              (after npm run data:build, whose tracks it reads)
//   npm run data:sst -- --force   fetch again
//   npm run data:sst -- <id> …     just these storms
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { createServer } from 'vite';
import { boxesFor, SST_OUT } from './sst.mjs';

const ERDDAP = 'https://coastwatch.pfeg.noaa.gov/erddap/griddap';
/** At once: a light load on a public server */
const PARALLEL = 3;
const force = process.argv.includes('--force');
/** Just these storms (by IBTrACS id), if any are named */
const only = process.argv.slice(2).filter((a) => !a.startsWith('--'));

// The tracks, through the site's own reader
const download = globalThis.fetch;
globalThis.fetch = async (path) => ({ ok: true, json: async () => JSON.parse(readFileSync(`public${path}`, 'utf8')) });
const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
const S = await vite.ssrLoadModule('/src/data/storms.ts');
const { storms } = await S.loadIndex();

// The days the data covers
const das = await (await download(`${ERDDAP}/ncdcOisst21Agg_LonPM180.das`)).text();
const coverage = ['start', 'end'].map((k) => Date.parse(das.match(new RegExp(`time_coverage_${k} "([^"]+)"`))[1]) / 86_400_000);
const [firstDay, lastDay] = coverage.map(Math.floor);
console.log(`OISST covers ${new Date(firstDay * 86_400_000).toISOString().slice(0, 10)} to ${new Date(lastDay * 86_400_000).toISOString().slice(0, 10)}`);

mkdirSync(SST_OUT, { recursive: true });
const todo = [];
for (const s of storms) {
  if (only.length && !only.includes(s.id)) continue;
  if (Math.floor(s.start / 24) - 1 < firstDay) continue;
  if (!force && existsSync(`${SST_OUT}/${s.id}.json.gz`)) continue;
  todo.push(s);
}
console.log(`${todo.length} storms to fetch`);

/** One box: { day0, lat0, lon0, ... } as boxesFor gives it, filled with tenths of a °C (null over land or ice) */
async function fetchBox(box) {
  const day = (d) => new Date((Math.min(d, lastDay) * 24 + 12) * 3_600_000).toISOString().slice(0, 19) + 'Z';
  const dataset = box.grid === '0360' ? 'ncdcOisst21Agg' : 'ncdcOisst21Agg_LonPM180';
  const q =
    `sst[(${day(box.day0)}):1:(${day(box.day0 + box.nt - 1)})][(0.0)]` +
    `[(${box.lat0}):2:(${box.lat0 + (box.nlat - 1) * 0.5})][(${box.lon0}):2:(${box.lon0 + (box.nlon - 1) * 0.5})]`;
  const url = `${ERDDAP}/${dataset}.ncoJson?${q.replace(/\[/g, '%5B').replace(/\]/g, '%5D')}`;
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await download(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const v = (await res.json()).variables;
      // Land and ice have no value (null, or OISST's -9.99): sea water is never colder than about -2 °C
      const values = v.sst.data.flat(3).map((x) => (x === null || Number.isNaN(x) || x < -5 ? null : Math.round(x * 10)));
      return { ...box, nt: v.time.data.length, nlat: v.latitude.data.length, nlon: v.longitude.data.length, v: values };
    } catch (err) {
      if (attempt >= 4) throw new Error(`${url}: ${err.message}`);
      await new Promise((r) => setTimeout(r, 5000 * attempt));
    }
  }
}

let done = 0;
let failed = 0;
const started = Date.now();
async function worker() {
  for (let s; (s = todo.shift()); ) {
    try {
      const pts = S.unpack(s, (await S.loadDecade(S.decadeOf(s)))[s.id]);
      const boxes = boxesFor(pts, firstDay, lastDay);
      const filled = [];
      for (const box of boxes) filled.push(await fetchBox(box));
      writeFileSync(`${SST_OUT}/${s.id}.json.gz`, gzipSync(JSON.stringify({ boxes: filled })));
    } catch (err) {
      failed++;
      console.log(`  ${s.id} ${s.name}: ${err.message}`);
    }
    if (++done % 100 === 0) {
      const perStorm = (Date.now() - started) / done;
      console.log(`${done} done, ${failed} failed, about ${Math.round((todo.length * perStorm) / 60_000)} min to go`);
    }
  }
}
await Promise.all(Array.from({ length: PARALLEL }, worker));
console.log(`Finished: ${done} storms, ${failed} failed${failed ? ' (run again to retry them)' : ''}`);
await vite.close();
