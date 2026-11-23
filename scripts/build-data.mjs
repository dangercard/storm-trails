// Turns the IBTrACS CSV (data/raw, from npm run data:fetch) into the small files the site loads, in public/data/:
//
//   storms.json         every storm: name, season, basins, dates, peak wind, lowest pressure, ACE, landfall and the
//                       countries it made landfall in; by column rather than one object per storm (see writeIndex),
//                       which is about 40% smaller even compressed. src/data/storms.ts turns it back into objects.
//   countries.topo.json every country's shape, to highlight the chosen storm's landfalls and for the "Near" filter, as
//                       TopoJSON (borders shared between neighbours are stored once), 2.4x smaller than GeoJSON
//   places.json         cities for the "Near" search (Natural Earth populated places), largest first
//   names/<lang>.json   countries' and cities' names in another language, where they differ from the English
//   tracks/<decade>.json  each storm's track points, a decade per file, loaded when the timeline reaches it
//   radii/<decade>.json   how far out 34, 50 and 64 kt winds reached around each report, where an agency estimated
//                       it (from about 2000), for "winds reached" in the place report and the chosen storm's footprint;
//                       and how far 12 ft seas reached (US agencies, from about 2004), for the footprint:
//                       { wind: { sid: columns }, seas: { sid: columns } }, columns as scripts/encode.mjs writes them
//
// What's kept and how strength is decided (the site's About panel says the same):
// - Only each storm's main track: the "spur" tracks (alternate positions where agencies disagree on a split or
//   merge) are dropped. Provisional tracks of recent storms are kept.
// - Points every 6 hours, plus any off-hour report (landfalls, peaks). The 3-hourly points in between are mostly
//   interpolated by IBTrACS, so they add size without adding information.
// - Wind is the US agencies' 1-minute sustained wind (USA_WIND) where there is one, otherwise the WMO agency's
//   (often a 10-minute average, which reads lower). Pressure the same way.
// - Category is the Saffir-Simpson scale IBTrACS gives (USA_SSHS), or, where it has none, worked out from that wind.
// - Alongside it, the regional agency's own class and wind, where the official scale isn't Saffir-Simpson (regionalOf).
// - The sea temperature under each report, the day before (NOAA OISST, from 1981), where npm run data:sst has fetched
//   it; see scripts/sst.mjs.
//
//   npm run data:build
import { topology } from 'topojson-server';
import { quantize } from 'topojson-client';
import { createReadStream, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { createInterface } from 'node:readline';
import { categoryOf, CAT, num, radiiOf, regionalOf, seasOf } from './classify.mjs';
import { encodeRadii, encodeTrack } from './encode.mjs';
import { SST_OUT, sstAt } from './sst.mjs';
import { countryAt, countryName, countryShapes, crossings } from './countries.mjs';

const IN = 'data/raw/ibtracs.ALL.list.v04r01.csv';
const PLACES = 'data/raw/ne_10m_populated_places.geojson';
const NE_COUNTRIES = 'data/raw/ne_10m_admin_0_countries.geojson';
/** The languages other than English to write names for (names/<lang>.json); a language's file in src/i18n uses it */
const NAME_LANGUAGES = ['es'];
const OUT = 'public/data';

const lines = createInterface({ input: createReadStream(IN), crlfDelay: Infinity });
let header = null;
let units = false;
const ix = {};
/** sid -> storm being built */
const storms = new Map();

for await (const line of lines) {
  if (!header) {
    header = line.split(',');
    header.forEach((h, i) => (ix[h] = i));
    continue;
  }
  if (!units) {
    units = true;
    continue;
  }
  const c = line.split(',');
  const trackType = c[ix.TRACK_TYPE];
  if (trackType.startsWith('spur') || trackType.endsWith('_spur')) continue;

  const sid = c[ix.SID];
  const time = c[ix.ISO_TIME]; // 1842-10-25 03:00:00, UTC
  const t = Date.parse(time.replace(' ', 'T') + 'Z') / 3_600_000; // hours since 1970
  /** A column of this row, by its name in the header */
  const get = (col) => c[ix[col]];
  const wind = num(get('USA_WIND')) ?? num(get('WMO_WIND'));
  const pres = num(get('USA_PRES')) ?? num(get('WMO_PRES'));
  const nature = get('NATURE');
  const cat = categoryOf(get);

  let s = storms.get(sid);
  if (!s) {
    const name = c[ix.NAME];
    s = {
      sid,
      name: name === 'NOT_NAMED' || name === 'UNNAMED' ? '' : name,
      season: num(c[ix.SEASON]),
      basins: [],
      points: [],
      provisional: false,
      lastLon: null,
    };
    storms.set(sid, s);
  }
  const basin = c[ix.BASIN];
  if (!s.basins.includes(basin)) s.basins.push(basin);
  if (trackType.includes('PROVISIONAL')) s.provisional = true;

  // Longitudes are kept continuous along the track (so one crossing the date line doesn't jump across the map)
  let lon = num(c[ix.LON]);
  if (s.lastLon === null) lon = ((((lon + 180) % 360) + 360) % 360) - 180;
  else {
    while (lon - s.lastLon > 180) lon -= 360;
    while (lon - s.lastLon < -180) lon += 360;
  }
  s.lastLon = lon;

  s.points.push({
    t,
    hour: Number(time.slice(11, 13)),
    minute: Number(time.slice(14, 16)),
    lat: num(c[ix.LAT]),
    lon,
    wind,
    pres,
    cat,
    nature,
    land: num(c[ix.DIST2LAND]) === 0,
    radii: radiiOf(get),
    seas: seasOf(get),
    regional: regionalOf(get),
    basin,
  });
}

/** Drop the in-between 3-hourly points, keeping the first and last */
const isFiller = (p) => p.minute === 0 && p.hour % 6 === 3;

const index = [];
const decades = new Map();
/** decade -> { wind: { sid: columns }, seas: { sid: columns } } for the storms with radii (see encode.mjs) */
const radiiByDecade = new Map();
/** How many storms have the sea temperature under them */
let withSst = 0;
const hit = new Set();

for (const s of storms.values()) {
  const pts = s.points.filter((p, i, all) => i === 0 || i === all.length - 1 || !isFiller(p));
  if (!pts.length) continue;
  const start = pts[0].t;
  const end = pts[pts.length - 1].t;

  let peakWind = null;
  let minPres = null;
  let peakCat = CAT.unknown;
  let ace = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    if (p.wind !== null && (peakWind === null || p.wind > peakWind)) peakWind = p.wind;
    if (p.pres !== null && (minPres === null || p.pres < minPres)) minPres = p.pres;
    // The codes rank strongest last: 5…0, depression, subtropical, disturbance, post-tropical, unknown
    peakCat = Math.max(peakCat, p.cat);
    // ACE: wind² / 10⁴ at each 6-hourly fix while tropical at tropical-storm strength or more
    if (p.minute === 0 && p.hour % 6 === 0 && p.wind !== null && p.wind >= 35 && p.nature === 'TS') {
      ace += (p.wind * p.wind) / 1e4;
    }
  }

  // The regional peak: the report with the agency's strongest wind (the strongest class where there's no wind)
  let regional = null;
  for (const p of pts) {
    const r = p.regional;
    if (!r) continue;
    if (!regional || (r.wind ?? 0) > (regional.wind ?? 0) || ((r.wind ?? 0) === (regional.wind ?? 0) && r.code % 10 > regional.code % 10)) {
      regional = r;
    }
  }

  // When it moved from one basin to another, over every report: [basin, hours after start] for each move
  const moves = [];
  for (let i = 1; i < s.points.length; i++) {
    if (s.points[i].basin !== s.points[i - 1].basin) moves.push([s.points[i].basin, s.points[i].t - start]);
  }

  // Landfall, over every report (a 3-hourly one can be the only one on a small island): wherever IBTrACS has the
  // storm move from sea to land, and wherever its centre crosses onto a country's shape between reports (IBTrACS's
  // land mask misses many small islands). Ordered by when each was first hit.
  const firstHit = new Map();
  let ibtracsLandfall = false;
  for (let i = 1; i < s.points.length; i++) {
    const p = s.points[i];
    if (!p.land || s.points[i - 1].land) continue;
    ibtracsLandfall = true;
    const country = countryAt(p.lat, p.lon);
    if (country && !firstHit.has(country)) firstHit.set(country, p.t);
  }
  const entered = crossings(s.points);
  for (const { country, t, fromSea } of entered) {
    if (fromSea && (!firstHit.has(country) || t < firstHit.get(country))) firstHit.set(country, t);
  }
  const landfalls = [...firstHit.keys()].sort((x, y) => firstHit.get(x) - firstHit.get(y));
  landfalls.forEach((c) => hit.add(c));
  const landfall = ibtracsLandfall || landfalls.length > 0;
  // The countries its centre crossed without making landfall there: reached over land from another country (Haiti
  // from the Dominican Republic, Zimbabwe from Mozambique), or where it started. In order, first reached first.
  const crossed = [];
  for (const { country } of entered) if (!firstHit.has(country) && !crossed.includes(country)) crossed.push(country);
  crossed.forEach((c) => hit.add(c));

  index.push({
    id: s.sid,
    name: s.name,
    season: s.season,
    basins: s.basins,
    start,
    end,
    peakWind,
    minPres,
    peakCat,
    ace: Math.round(ace * 10) / 10,
    landfall,
    landfalls: landfalls.length ? landfalls : undefined,
    crossed: crossed.length ? crossed : undefined,
    provisional: s.provisional || undefined,
    regional,
    moves,
  });

  // The sea temperature under each report, where npm run data:sst has fetched it (storms from 1981)
  const sstFile = `${SST_OUT}/${s.sid}.json.gz`;
  const sst = existsSync(sstFile) ? JSON.parse(gunzipSync(readFileSync(sstFile))) : null;
  if (sst) withSst++;

  // The track, by column (see encode.mjs)
  const decade = Math.floor(new Date(start * 3_600_000).getUTCFullYear() / 10) * 10;
  if (!decades.has(decade)) decades.set(decade, {});
  decades.get(decade)[s.sid] = encodeTrack(
    pts.map((p) => ({
      hours: p.t - start,
      lat: p.lat,
      lon: p.lon,
      wind: p.wind,
      pres: p.pres,
      cat: p.cat,
      regional: p.regional?.code ?? 0,
      regionalWind: p.regional?.wind ?? 0,
      sst: sst ? sstAt(sst, p.lat, p.lon, p.t) : null,
    })),
  );

  // Radii by the point's place in the track above, so the site lines the two up: the winds', and apart from them the
  // seas' (some reports have seas but no wind radii, as a storm weakens)
  const radii = pts.flatMap((p, i) => (p.radii ? [[i, p.radii]] : []));
  const seas = pts.flatMap((p, i) => (p.seas ? [[i, p.seas]] : []));
  if (radii.length || seas.length) {
    if (!radiiByDecade.has(decade)) radiiByDecade.set(decade, { wind: {}, seas: {} });
    if (radii.length) radiiByDecade.get(decade).wind[s.sid] = encodeRadii(radii);
    if (seas.length) radiiByDecade.get(decade).seas[s.sid] = encodeRadii(seas);
  }
}

index.sort((a, b) => a.start - b.start);

/**
 * The index by column, one array per field with the storms in order of start, rather than an object per storm
 * (whose field names would repeat 13,000 times). Read by src/data/storms.ts, which must match this.
 * - start: minutes since the storm before started (the first: since 1970); times are all whole minutes
 * - duration: minutes from start to end
 * - basins: space-separated; landfalls, crossed: "|"-separated, "" for none
 * - peakWind, minPres: 0 for none (no storm has either at 0); landfall, provisional: 0 or 1
 * - regional, regionalWind: the regional class at its peak (see regionalOf) and that agency's peak wind, 0 for none
 * - moves: where it moved to another basin, "BASIN:minutes after start" space-separated, "" for none
 */
function writeIndex(storms) {
  let before = 0;
  const minutes = (hours) => Math.round(hours * 60);
  return {
    source: 'IBTrACS v04r01, ALL (NOAA NCEI), files of 2026-10-27',
    decades: [...decades.keys()].sort((a, b) => a - b),
    /** The decades there's a radii file for */
    radii: [...radiiByDecade.keys()].sort((a, b) => a - b),
    id: storms.map((s) => s.id),
    name: storms.map((s) => s.name),
    season: storms.map((s) => s.season),
    basins: storms.map((s) => s.basins.join(' ')),
    start: storms.map((s) => {
      const d = minutes(s.start) - before;
      before = minutes(s.start);
      return d;
    }),
    duration: storms.map((s) => minutes(s.end) - minutes(s.start)),
    peakWind: storms.map((s) => s.peakWind ?? 0),
    minPres: storms.map((s) => s.minPres ?? 0),
    peakCat: storms.map((s) => s.peakCat),
    ace: storms.map((s) => s.ace),
    landfall: storms.map((s) => (s.landfall ? 1 : 0)),
    landfalls: storms.map((s) => (s.landfalls ?? []).join('|')),
    crossed: storms.map((s) => (s.crossed ?? []).join('|')),
    provisional: storms.map((s) => (s.provisional ? 1 : 0)),
    regional: storms.map((s) => s.regional?.code ?? 0),
    regionalWind: storms.map((s) => s.regional?.wind ?? 0),
    moves: storms.map((s) => s.moves.map(([b, h]) => `${b}:${minutes(h)}`).join(' ')),
  };
}
rmSync(OUT, { recursive: true, force: true });
mkdirSync(`${OUT}/tracks`, { recursive: true });
mkdirSync(`${OUT}/radii`, { recursive: true });
writeFileSync(`${OUT}/storms.json`, JSON.stringify(writeIndex(index)));
// Not simplified: the "Near" filter promises distances to within about 10 km, and even light simplification moves
// some coastlines (narrow inlets, spits) further than that. Quantized to 1/100,000 of the world's width (~0.4 km).
const shapes = countryShapes(hit);
writeFileSync(`${OUT}/countries.topo.json`, JSON.stringify(quantize(topology({ countries: shapes }), 1e5)));

// Cities, flat per place: [name, region, country, lat, lon, population], largest first
const placeRecords = JSON.parse(readFileSync(PLACES, 'utf8'))
  .features.map(({ properties: p, geometry: g }) => ({ p, row: [
    p.NAME,
    p.ADM1NAME ?? '',
    countryName(p.ADM0NAME ?? ''),
    Math.round(g.coordinates[1] * 1000) / 1000,
    Math.round(g.coordinates[0] * 1000) / 1000,
    p.POP_MAX ?? 0,
  ] }))
  .sort((a, b) => b.row[5] - a.row[5]);
writeFileSync(`${OUT}/places.json`, JSON.stringify(placeRecords.map((r) => r.row)));

/**
 * Names in another language, only where they differ from the English: { countries: { English: name },
 * places: { row in places.json: name } }. A country's name is the standard one for its ISO code (Unicode CLDR, as
 * browsers give them), else Natural Earth's (territories without a code); a city's is Natural Earth's.
 */
const neCountries = JSON.parse(readFileSync(NE_COUNTRIES, 'utf8')).features.map((f) => f.properties);
const neByName = new Map(neCountries.map((p) => [p.NAME, p]));
const neByA3 = new Map(neCountries.map((p) => [p.ADM0_A3, p]));
/**
 * Where Natural Earth's name is wrong (Spratly Islands as Wake Island) or takes a side in a dispute the English name
 * doesn't (Scarborough Reef by the Philippines' name): checked by the language's reviewers
 */
const NAME_FIXES = { es: { 'Spratly Islands': 'Islas Spratly', 'Scarborough Reef': 'Arrecife de Scarborough' } };
/** world-atlas's names that Natural Earth has since changed */
const NE_RENAMED = { Macedonia: 'North Macedonia' };
const atlas = JSON.parse(readFileSync('node_modules/world-atlas/countries-10m.json', 'utf8')).objects.countries.geometries;
mkdirSync(`${OUT}/names`, { recursive: true });
for (const lang of NAME_LANGUAGES) {
  const regions = new Intl.DisplayNames([lang], { type: 'region', fallback: 'none' });
  const field = `NAME_${lang.toUpperCase()}`;
  const local = (ne) => {
    const code = ne?.ISO_A2_EH;
    return (code && code !== '-99' && regions.of(code)) || ne?.[field] || null;
  };
  const countries = {};
  const done = new Set();
  // Only the countries the site names: those with a shape in countries.topo.json, and the cities' countries
  const named = new Set([...shapes.features.map((f) => f.properties.name), ...placeRecords.map((r) => r.row[2])]);
  const add = (english, ne) => {
    if (done.has(english) || !named.has(english)) return;
    done.add(english);
    const name = NAME_FIXES[lang]?.[english] ?? local(ne);
    if (name && name !== english) countries[english] = name;
  };
  // Each shape's own name first (so Cuba is Cuba's, not the base at Guantánamo's, which is listed as Cuba)
  const sorted = [...atlas].sort((a, b) => Number(countryName(a.properties.name) !== a.properties.name) - Number(countryName(b.properties.name) !== b.properties.name));
  for (const g of sorted) add(countryName(g.properties.name), neByName.get(NE_RENAMED[g.properties.name] ?? g.properties.name));
  for (const { row, p } of placeRecords) add(row[2], neByA3.get(p.ADM0_A3));
  const places = {};
  placeRecords.forEach(({ p, row }, i) => {
    const name = p[field];
    if (name && name !== row[0]) places[i] = name;
  });
  writeFileSync(`${OUT}/names/${lang}.json`, JSON.stringify({ countries, places }));
}

for (const [decade, tracks] of decades) writeFileSync(`${OUT}/tracks/${decade}.json`, JSON.stringify(tracks));
for (const [decade, radii] of radiiByDecade) writeFileSync(`${OUT}/radii/${decade}.json`, JSON.stringify(radii));
console.log(`${index.length} storms, ${decades.size} decades, ${hit.size} countries hit, ${withSst} with sea temperatures → ${OUT}`);
