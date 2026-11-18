// Turns the IBTrACS CSV (data/raw, from npm run data:fetch) into the small files the site loads, in public/data/:
//
//   storms.json         one entry per storm: name, season, basins, dates, peak wind, lowest pressure, ACE, landfall
//   tracks/<decade>.json  each storm's track points, a decade per file, loaded when the timeline reaches it
//
// What's kept and how strength is decided (the site's About panel says the same):
// - Only each storm's main track: the "spur" tracks (alternate positions where agencies disagree on a split or
//   merge) are dropped. Provisional tracks of recent storms are kept.
// - Points every 6 hours, plus any off-hour report (landfalls, peaks). The 3-hourly points in between are mostly
//   interpolated by IBTrACS, so they add size without adding information.
// - Wind is the US agencies' 1-minute sustained wind (USA_WIND) where there is one, otherwise the WMO agency's
//   (often a 10-minute average, which reads lower). Pressure the same way.
// - Category is the Saffir-Simpson scale IBTrACS gives (USA_SSHS), or, where it has none, worked out from that wind.
//
//   npm run data:build
import { createReadStream, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';

const IN = 'data/raw/ibtracs.ALL.list.v04r01.csv';
const OUT = 'public/data';

/** Category codes, shared with src/data/categories.ts */
const CAT = { unknown: -9, disturbance: -3, postTropical: -4, subtropical: -2, depression: -1, storm: 0 };

/** Saffir-Simpson from a 1-minute wind in knots */
function catFromWind(kt) {
  if (kt >= 137) return 5;
  if (kt >= 113) return 4;
  if (kt >= 96) return 3;
  if (kt >= 83) return 2;
  if (kt >= 64) return 1;
  if (kt >= 34) return CAT.storm;
  return CAT.depression;
}

const num = (s) => {
  const t = s.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};

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
  const usaWind = num(c[ix.USA_WIND]);
  const wind = usaWind ?? num(c[ix.WMO_WIND]);
  const pres = num(c[ix.USA_PRES]) ?? num(c[ix.WMO_PRES]);
  const sshs = num(c[ix.USA_SSHS]);
  const nature = c[ix.NATURE];
  let cat;
  if (sshs !== null && sshs >= -1) cat = sshs;
  else if (sshs === -2) cat = CAT.subtropical;
  else if (sshs === -4 || nature === 'ET') cat = CAT.postTropical;
  else if (sshs === -3 || nature === 'DS') cat = CAT.disturbance;
  else if (wind !== null) cat = catFromWind(wind);
  else cat = CAT.unknown;

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
  });
}

/** Drop the in-between 3-hourly points, keeping the first and last */
const isFiller = (p) => p.minute === 0 && p.hour % 6 === 3;

const index = [];
const decades = new Map();
const r1 = (n) => Math.round(n * 10) / 10;

for (const s of storms.values()) {
  const pts = s.points.filter((p, i, all) => i === 0 || i === all.length - 1 || !isFiller(p));
  if (!pts.length) continue;
  const start = pts[0].t;
  const end = pts[pts.length - 1].t;

  let peakWind = null;
  let minPres = null;
  let peakCat = CAT.unknown;
  let ace = 0;
  let landfall = false;
  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLon = Infinity;
  let maxLon = -Infinity;
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
    if (p.land && i > 0 && !pts[i - 1].land) landfall = true;
    minLat = Math.min(minLat, p.lat);
    maxLat = Math.max(maxLat, p.lat);
    minLon = Math.min(minLon, p.lon);
    maxLon = Math.max(maxLon, p.lon);
  }

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
    provisional: s.provisional || undefined,
    bbox: [r1(minLon), r1(minLat), r1(maxLon), r1(maxLat)],
  });

  // Flat per storm: [hours after start, lat, lon, wind, pressure, category] for each point, 0 for unknown wind/pressure
  const flat = [];
  for (const p of pts) {
    flat.push(Math.round((p.t - start) * 10) / 10, r1(p.lat), r1(p.lon), p.wind ?? 0, p.pres ?? 0, p.cat);
  }
  const decade = Math.floor(new Date(start * 3_600_000).getUTCFullYear() / 10) * 10;
  if (!decades.has(decade)) decades.set(decade, {});
  decades.get(decade)[s.sid] = flat;
}

index.sort((a, b) => a.start - b.start);
rmSync(OUT, { recursive: true, force: true });
mkdirSync(`${OUT}/tracks`, { recursive: true });
writeFileSync(
  `${OUT}/storms.json`,
  JSON.stringify({
    source: 'IBTrACS v04r01, ALL (NOAA NCEI), files of 2026-10-27',
    decades: [...decades.keys()].sort((a, b) => a - b),
    storms: index,
  }),
);
for (const [decade, tracks] of decades) writeFileSync(`${OUT}/tracks/${decade}.json`, JSON.stringify(tracks));
console.log(`${index.length} storms, ${decades.size} decades → ${OUT}`);
