// Compares the site's "winds reached" with the National Hurricane Center's own wind swaths, for every Atlantic and
// East Pacific hurricane that made landfall from 2005 (NHC's GIS archive starts then).
//
// NHC builds its swaths from the same kind of estimates the site uses (the best track's wind radii, "the maximum
// possible extent of a given wind speed within particular quadrants"), so this checks how the site turns those
// estimates into areas (the shape by bearing, blending between reports, the swept outlines), against the official
// rendering. It doesn't check whether those winds were actually felt at a place: that would need station records.
//
// Compared over the time NHC's swath covers (its pieces' earliest STARTDTG to latest ENDDTG); the site also shows winds from before and after
// that, where the agencies estimated them (as a low, or after the storm became post-tropical).
//
// For each storm: a grid of points every 0.25° over the area NHC's 34 kt swath covers (and 1° round it), and the
// cities in it; at each, the strongest winds that reached by NHC's swath (64, 50, 34 kt or none) and by the site's
// reach (src/data/near.ts) and drawn footprint (src/data/footprintShapes.ts). Grid points count by the area they
// stand for (shrinking towards the poles).
//
//   npm run check:swaths              (needs data/raw from npm run data:fetch; NHC's files are saved to data/raw/nhc)
//   npm run check:swaths -- al092022  just these storms
import { createReadStream, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { execFileSync } from 'node:child_process';
import { open } from 'shapefile';
import polygonClipping from 'polygon-clipping';
import { createServer } from 'vite';

const RAW = 'data/raw/ibtracs.ALL.list.v04r01.csv';
const NHC = 'data/raw/nhc';
const OUT = 'docs/wind-swath-check.json';
const FIRST = 2005;
const STEP = 0.25;
const only = process.argv.slice(2).map((s) => s.toLowerCase());

// The site's own code, as the site runs it; its loaders read public/data from disk (NHC's files come by the real fetch)
const download = globalThis.fetch;
globalThis.fetch = async (path) => {
  const file = `public${path}`;
  if (!existsSync(file)) return { ok: false, status: 404, json: async () => null };
  const text = readFileSync(file, 'utf8');
  return { ok: true, status: 200, json: async () => JSON.parse(text) };
};
const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
const { loadIndex, loadDecade, loadRadii, unpack, radiiOf, decadeOf } = await vite.ssrLoadModule('/src/data/storms.ts');
const { nearMeasure } = await vite.ssrLoadModule('/src/data/near.ts');
const { buildFootprint } = await vite.ssrLoadModule('/src/data/footprintShapes.ts');
const { storms } = await loadIndex();

// The hurricanes to check, and NHC's id for each (IBTrACS's USA_ATCF_ID)
const wanted = new Map(
  storms
    .filter((s) => s.season >= FIRST && s.landfall && (s.peakWind ?? 0) >= 64 && s.basins.some((b) => b === 'NA' || b === 'EP'))
    .map((s) => [s.id, s]),
);
const atcf = new Map();
{
  const lines = createInterface({ input: createReadStream(RAW), crlfDelay: Infinity });
  let ix = null;
  for await (const line of lines) {
    const c = line.split(',');
    if (!ix) {
      ix = Object.fromEntries(c.map((h, i) => [h, i]));
      continue;
    }
    const sid = c[ix.SID];
    if (!wanted.has(sid) || atcf.has(sid)) continue;
    const id = c[ix.USA_ATCF_ID].trim().toLowerCase();
    if (/^(al|ep|cp)\d{6}$/.test(id)) atcf.set(sid, id);
  }
}

/** NHC's swath for a storm: { 34: polygons, 50: …, 64: … }, or null when NHC has none */
async function nhcSwath(id) {
  mkdirSync(NHC, { recursive: true });
  const zip = `${NHC}/${id}_best_track.zip`;
  if (!existsSync(zip)) {
    let res;
    try {
      res = await download(`https://www.nhc.noaa.gov/gis/best_track/${id}_best_track.zip`);
    } catch {
      return { unreachable: true };
    }
    if (!res.ok) return null;
    writeFileSync(zip, Buffer.from(await res.arrayBuffer()));
    await new Promise((r) => setTimeout(r, 1000)); // gently
  }
  const dir = `${NHC}/${id}`;
  if (!existsSync(dir)) execFileSync('unzip', ['-oq', zip, '-d', dir]);
  const shp = readdirSync(dir).find((f) => /_windswath\.shp$/i.test(f));
  if (!shp) return null;
  const out = { 34: [], 50: [], 64: [], from: null, to: null };
  const src = await open(`${dir}/${shp}`);
  /** "2022092218" as hours since 1970 */
  const hours = (dtg) => Date.UTC(+dtg.slice(0, 4), +dtg.slice(4, 6) - 1, +dtg.slice(6, 8), +dtg.slice(8, 10)) / 3_600_000;
  for (let r = await src.read(); !r.done; r = await src.read()) {
    // Each piece has its own times (while that strength lasted): the swath's are the earliest and latest
    out.from = Math.min(out.from ?? Infinity, hours(r.value.properties.STARTDTG));
    out.to = Math.max(out.to ?? -Infinity, hours(r.value.properties.ENDDTG));
    const g = r.value.geometry;
    const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
    out[r.value.properties.RADII]?.push(...polys);
  }
  // NHC's own radii at each report (nautical miles, by "2022092218"), to tell a difference in method from a
  // difference in the estimates themselves
  out.radii = new Map();
  const radiiShp = readdirSync(dir).find((f) => /_radii\.shp$/i.test(f));
  if (radiiShp) {
    const rs = await open(`${dir}/${radiiShp}`);
    for (let r = await rs.read(); !r.done; r = await rs.read()) {
      const p = r.value.properties;
      const at = { 34: 0, 50: 4, 64: 8 }[p.RADII];
      if (at === undefined) continue;
      const row = out.radii.get(p.SYNOPTIME) ?? new Array(12).fill(0);
      [p.NE, p.SE, p.SW, p.NW].forEach((v, q) => (row[at + q] = v ?? 0));
      out.radii.set(p.SYNOPTIME, row);
    }
  }
  // When NHC made the file: older ones are its "working" best track, from before the storm's final review
  const xml = readdirSync(dir).find((f) => /_windswath\.shp\.xml$/i.test(f));
  out.made = xml ? (readFileSync(`${dir}/${xml}`, 'utf8').match(/[A-Z][a-z]+ \d{1,2}, \d{4}/)?.[0] ?? null) : null;
  return out;
}

/** km between two points, flat at their latitude (enough to tell near from far) */
const kmBetween = (lat1, lon1, lat2, lon2) =>
  Math.hypot((lat1 - lat2) * 110.57, ((((lon1 - lon2 + 540) % 360) - 180) * 111.32 * Math.cos((((lat1 + lat2) / 2) * Math.PI) / 180)));

/**
 * NHC's pieces that are nowhere near the storm: farther from every report than its widest winds ever reached (plus
 * 300 km, for the stretch between reports). Some of NHC's files have them (Kirk 2024: copies of a shape every ~31° of
 * longitude across Europe and Asia, cut off at 51°N); they're dropped, and counted.
 */
function dropStray(sw, pts, widestKm) {
  let dropped = 0;
  for (const kt of [34, 50, 64]) {
    sw[kt] = sw[kt].filter((poly) => {
      const near = poly[0].some(([x, y]) => pts.some((p) => kmBetween(y, x, p.lat, p.lon) <= widestKm + 300));
      if (!near) dropped++;
      return near;
    });
  }
  return dropped;
}
/** Whether a point is in any of the polygons (even-odd over each polygon's rings) */
function inAny(polys, lon, lat) {
  for (const poly of polys) {
    let inside = false;
    for (const ring of poly)
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [xa, ya] = ring[j];
        const [xb, yb] = ring[i];
        if (ya > lat !== yb > lat && lon < xa + ((lat - ya) * (xb - xa)) / (yb - ya)) inside = !inside;
      }
    if (inside) return true;
  }
  return false;
}
const bboxOf = (polys) => {
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
  for (const p of polys)
    for (const [x, y] of p[0]) {
      w = Math.min(w, x);
      e = Math.max(e, x);
      s = Math.min(s, y);
      n = Math.max(n, y);
    }
  return [w, s, e, n];
};
const classOf = (sw, lon, lat) => (inAny(sw[64], lon, lat) ? 64 : inAny(sw[50], lon, lat) ? 50 : inAny(sw[34], lon, lat) ? 34 : 0);

const places = JSON.parse(readFileSync('public/data/places.json', 'utf8')).filter((p) => p[5] >= 100_000);
const BANDS = [34, 50, 64];
const blank = () => Object.fromEntries(BANDS.map((b) => [b, { both: 0, nhcOnly: 0, oursOnly: 0 }]));
const total = { reach: blank(), drawn: blank(), cells: 0, unknown: 0, cities: { same: 0, n: 0, off: [] } };
/** The storms whose estimates are the same in NHC's file and IBTrACS: these differ only by method */
const same = { reach: blank(), storms: 0 };
const results = [];

const ids = [...atcf].filter(([, id]) => !only.length || only.includes(id));
console.log(`${ids.length} hurricanes that made landfall, ${FIRST}–${Math.max(...storms.map((s) => s.season))}`);
for (const [sid, id] of ids) {
  const storm = wanted.get(sid);
  const sw = await nhcSwath(id);
  if (!sw || sw.unreachable || !sw[34].length) {
    results.push({ id, name: storm.name, season: storm.season, skipped: sw?.unreachable ? 'NHC unreachable' : 'no NHC swath' });
    continue;
  }
  const decade = decadeOf(storm);
  const whole = unpack(storm, (await loadDecade(decade))[storm.id]);
  const allRadii = radiiOf(whole, await loadRadii(decade), storm.id);
  // NHC's swath covers the time it was advising on the storm; the site's estimates can run before and after (as a
  // low, or post-tropical). Compared over NHC's time only, so this checks the method, not the span.
  const keep = whole.map((p) => p.t >= sw.from - 1e-6 && p.t <= sw.to + 1e-6);
  const pts = whole.filter((_, i) => keep[i]);
  const radii = allRadii?.filter((_, i) => keep[i]);
  if (!radii || !radii.some(Boolean)) {
    results.push({ id, name: storm.name, season: storm.season, skipped: 'no radii in IBTrACS' });
    continue;
  }
  let widestKm = 0;
  for (const r of allRadii) if (r) widestKm = Math.max(widestKm, r[0], r[1], r[2], r[3]);
  const stray = dropStray(sw, whole, widestKm);
  // Reports whose estimates differ between NHC's file and IBTrACS (or that only one of them has)
  const dtg = (t) => new Date(t * 3_600_000).toISOString().slice(0, 13).replace(/[-T]/g, '');
  let differing = 0;
  let compared = 0;
  pts.forEach((p, i) => {
    const site = radii[i] ? radii[i].map((km) => Math.round(km / 1.852)) : new Array(12).fill(0);
    const nhc = sw.radii.get(dtg(p.t)) ?? new Array(12).fill(0);
    if (!site.some(Boolean) && !nhc.some(Boolean)) return;
    compared++;
    if (site.some((v, k) => Math.abs(v - nhc[k]) > 1)) differing++;
  });

  const fc = buildFootprint(pts, radii, polygonClipping.union);
  const drawn = { 34: [], 50: null, 64: [] };
  for (const f of fc?.features ?? []) drawn[f.properties.kt] = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;

  const [w, s, e, n] = bboxOf(sw[34]);
  const stat = { reach: blank(), drawn: blank(), cells: 0, unknown: 0 };
  for (let lat = Math.floor(s) - 1; lat <= n + 1; lat += STEP)
    for (let lon = Math.floor(w) - 1; lon <= e + 1; lon += STEP) {
      const weight = Math.cos((lat * Math.PI) / 180);
      const theirs = classOf(sw, lon, lat);
      const reach = nearMeasure({ kind: 'point', name: '', lat, lon }, 1, null).reach(pts, radii);
      if (reach === null) stat.unknown += weight;
      const ours = reach ?? 0;
      const pic = inAny(drawn[64], lon, lat) ? 64 : inAny(drawn[34], lon, lat) ? 34 : 0;
      if (!theirs && !ours && !pic) continue;
      stat.cells += weight;
      for (const b of BANDS) {
        const add = (t, kt) => {
          const a = theirs >= b, o = kt >= b;
          if (a && o) t[b].both += weight;
          else if (a) t[b].nhcOnly += weight;
          else if (o) t[b].oursOnly += weight;
        };
        add(stat.reach, ours);
        if (b !== 50) add(stat.drawn, pic);
      }
    }
  // Cities of 100,000+ in the area
  const cities = [];
  for (const [name, , country, lat, lon] of places) {
    if (lat < s - 1 || lat > n + 1 || lon < w - 1 || lon > e + 1) continue;
    const theirs = classOf(sw, lon, lat);
    const ours = nearMeasure({ kind: 'point', name: '', lat, lon }, 1, null).reach(pts, radii) ?? 0;
    if (!theirs && !ours) continue;
    cities.push({ name: `${name}, ${country}`, nhc: theirs, site: ours });
  }
  for (const k of ['reach', 'drawn'])
    for (const b of BANDS) for (const f of ['both', 'nhcOnly', 'oursOnly']) total[k][b][f] += stat[k][b][f];
  total.cells += stat.cells;
  total.unknown += stat.unknown;
  total.cities.n += cities.length;
  total.cities.same += cities.filter((c) => c.nhc === c.site).length;
  total.cities.off.push(...cities.filter((c) => c.nhc !== c.site).map((c) => ({ storm: `${storm.name} ${storm.season}`, ...c })));
  const iou = (t, b) => t[b].both / (t[b].both + t[b].nhcOnly + t[b].oursOnly || 1);
  const r = {
    id,
    name: storm.name,
    season: storm.season,
    overlap: Object.fromEntries(BANDS.map((b) => [b, +iou(stat.reach, b).toFixed(3)])),
    over: Object.fromEntries(BANDS.map((b) => [b, +(stat.reach[b].oursOnly / (stat.reach[b].both + stat.reach[b].nhcOnly || 1)).toFixed(3)])),
    under: Object.fromEntries(BANDS.map((b) => [b, +(stat.reach[b].nhcOnly / (stat.reach[b].both + stat.reach[b].nhcOnly || 1)).toFixed(3)])),
    drawnOverlap: { 34: +iou(stat.drawn, 34).toFixed(3), 64: +iou(stat.drawn, 64).toFixed(3) },
    cities: cities.length,
    citiesSame: cities.filter((c) => c.nhc === c.site).length,
    nhcFile: sw.made,
    reportsDiffering: `${differing} of ${compared}`,
    strayPiecesDropped: stray,
  };
  if (!differing) {
    same.storms++;
    for (const b of BANDS) for (const f of ['both', 'nhcOnly', 'oursOnly']) same.reach[b][f] += stat.reach[b][f];
  }
  results.push(r);
  console.log(
    `${id} ${storm.name.padEnd(10)} ${storm.season}  overlap 34/50/64: ${BANDS.map((b) => r.overlap[b].toFixed(2)).join(' ')}` +
      `  drawn 34/64: ${r.drawnOverlap[34].toFixed(2)} ${r.drawnOverlap[64].toFixed(2)}  cities ${r.citiesSame}/${r.cities}` +
      `  reports differing ${r.reportsDiffering}${stray ? `  stray NHC pieces ${stray}` : ''}`,
  );
}

const pct = (x) => `${(100 * x).toFixed(1)}%`;
const summary = Object.fromEntries(
  ['reach', 'drawn'].map((k) => [
    k,
    Object.fromEntries(
      BANDS.filter((b) => k === 'reach' || b !== 50).map((b) => {
        const t = total[k][b];
        const nhc = t.both + t.nhcOnly;
        return [b, { overlap: t.both / (t.both + t.nhcOnly + t.oursOnly), over: t.oursOnly / nhc, under: t.nhcOnly / nhc }];
      }),
    ),
  ]),
);
console.log('\nAll storms, by area:');
for (const k of ['reach', 'drawn'])
  for (const [b, v] of Object.entries(summary[k]))
    console.log(`  ${k === 'reach' ? 'winds reached' : 'drawn footprint'} ${b} kt: overlap ${pct(v.overlap)}, beyond NHC's ${pct(v.over)}, short of it ${pct(v.under)}`);
console.log(`  no estimate: ${pct(total.unknown / total.cells)} of the area`);
console.log(`Cities of 100,000+: the same strongest winds as NHC's swath at ${total.cities.same} of ${total.cities.n} (${pct(total.cities.same / total.cities.n)})`);
mkdirSync('docs', { recursive: true });
const sameInputs = Object.fromEntries(
  BANDS.map((b) => {
    const t = same.reach[b];
    const nhc = t.both + t.nhcOnly;
    return [b, { overlap: t.both / (t.both + t.nhcOnly + t.oursOnly), over: t.oursOnly / nhc, under: t.nhcOnly / nhc }];
  }),
);
console.log(`The ${same.storms} storms whose estimates are the same in NHC's file and IBTrACS (method only):`);
for (const [b, v] of Object.entries(sameInputs))
  console.log(`  winds reached ${b} kt: overlap ${pct(v.overlap)}, beyond NHC's ${pct(v.over)}, short of it ${pct(v.under)}`);
const strays = results.filter((r) => r.strayPiecesDropped);
if (strays.length) console.log(`Stray pieces dropped from NHC's swaths of: ${strays.map((r) => `${r.name} ${r.season} (${r.strayPiecesDropped})`).join(', ')}`);
writeFileSync(
  OUT,
  JSON.stringify({ made: new Date().toISOString().slice(0, 10), summary, sameInputs: { storms: same.storms, ...sameInputs }, cities: total.cities, storms: results }, null, 1),
);
console.log(`→ ${OUT}`);
await vite.close();
