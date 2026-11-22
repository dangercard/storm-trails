// Country shapes (Natural Earth, via the world-atlas package) for working out where storms made landfall, and the
// lighter shapes the site draws to highlight them.
//
// Borders are today's: a storm in 1900 that hit what is now Bangladesh is listed under Bangladesh. Natural Earth
// draws some territories (Puerto Rico, Hong Kong, Guam…) as their own shapes, and they're listed as such.
import { readFileSync } from 'node:fs';
import { feature } from 'topojson-client';

/** Natural Earth's short names, written out for the site; and the US base at Guantánamo counted as Cuba */
const NAMES = {
  'United States of America': 'United States',
  'Antigua and Barb.': 'Antigua and Barbuda',
  'British Virgin Is.': 'British Virgin Islands',
  'Cayman Is.': 'Cayman Islands',
  'Cook Is.': 'Cook Islands',
  'Dominican Rep.': 'Dominican Republic',
  'Faeroe Is.': 'Faroe Islands',
  'Fr. Polynesia': 'French Polynesia',
  'Fr. S. Antarctic Lands': 'French Southern Lands',
  'Indian Ocean Ter.': 'Australian Indian Ocean Territories',
  'Marshall Is.': 'Marshall Islands',
  'N. Mariana Is.': 'Northern Mariana Islands',
  'Solomon Is.': 'Solomon Islands',
  'Spratly Is.': 'Spratly Islands',
  'St-Barthélemy': 'Saint Barthélemy',
  'St-Martin': 'Saint Martin',
  'St. Kitts and Nevis': 'Saint Kitts and Nevis',
  'St. Pierre and Miquelon': 'Saint Pierre and Miquelon',
  'St. Vin. and Gren.': 'Saint Vincent and the Grenadines',
  'Turks and Caicos Is.': 'Turks and Caicos Islands',
  'U.S. Virgin Is.': 'U.S. Virgin Islands',
  'USNB Guantanamo Bay': 'Cuba',
  'Wallis and Futuna Is.': 'Wallis and Futuna',
  'Falkland Is.': 'Falkland Islands',
  'Heard I. and McDonald Is.': 'Heard and McDonald Islands',
  'S. Geo. and the Is.': 'South Georgia',
  'Br. Indian Ocean Ter.': 'British Indian Ocean Territory',
  'Central African Rep.': 'Central African Republic',
  'Dem. Rep. Congo': 'DR Congo',
  'Eq. Guinea': 'Equatorial Guinea',
  'Bosnia and Herz.': 'Bosnia and Herzegovina',
  'Ashmore and Cartier Is.': 'Ashmore and Cartier Islands',
  'Pitcairn Is.': 'Pitcairn Islands',
};

const load = (res) => {
  const topo = JSON.parse(readFileSync(`node_modules/world-atlas/countries-${res}.json`, 'utf8'));
  return feature(topo, topo.objects.countries)
    .features.filter((f) => f.geometry && f.properties.name)
    .map((f) => ({ ...f, properties: { name: NAMES[f.properties.name] ?? f.properties.name } }));
};

/** Polygons as arrays of rings, each ring [[lon, lat], …] */
const polygonsOf = (g) => (g.type === 'Polygon' ? [g.coordinates] : g.coordinates);

function bboxOf(polygons) {
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
  for (const poly of polygons)
    for (const [x, y] of poly[0]) {
      if (x < w) w = x;
      if (x > e) e = x;
      if (y < s) s = y;
      if (y > n) n = y;
    }
  return [w, s, e, n];
}

/**
 * A polygon's edges (outer ring and holes alike), grouped by the 1° band of latitude each spans, so testing a point
 * only looks at the edges near its latitude rather than a whole coastline
 */
function edgeBands(poly) {
  const bands = new Map();
  for (const ring of poly)
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i];
      const [xj, yj] = ring[j];
      for (let row = Math.floor(Math.min(yi, yj)); row <= Math.floor(Math.max(yi, yj)); row++) {
        if (!bands.has(row)) bands.set(row, []);
        bands.get(row).push(xi, yi, xj, yj);
      }
    }
  return bands;
}

/** Even-odd ray test: inside the outer ring and outside its holes */
function inBands(x, y, bands) {
  const e = bands.get(Math.floor(y));
  if (!e) return false;
  let inside = false;
  for (let k = 0; k < e.length; k += 4) {
    const xi = e[k], yi = e[k + 1], xj = e[k + 2], yj = e[k + 3];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Rough distance in km from a point to a ring's edge (fine at the scale of a coastline) */
function kmToRing(x, y, ring) {
  const k = Math.cos((y * Math.PI) / 180);
  let best = Infinity;
  for (let i = 0; i < ring.length - 1; i++) {
    const ax = (ring[i][0] - x) * k, ay = ring[i][1] - y;
    const bx = (ring[i + 1][0] - x) * k, by = ring[i + 1][1] - y;
    const dx = bx - ax, dy = by - ay;
    const len = dx * dx + dy * dy;
    const t = len ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len)) : 0;
    const px = ax + t * dx, py = ay + t * dy;
    best = Math.min(best, px * px + py * py);
  }
  return Math.sqrt(best) * 111.2;
}

/**
 * IBTrACS marks a point as over land from its own coastline, which doesn't line up exactly with these shapes, and
 * points are 0.1° apart: a point just off a coast here is still that country, up to this far out.
 */
const COAST_KM = 60;
const PAD = COAST_KM / 111.2 / 0.3; // in degrees, generous enough for the cos(lat) stretch at high latitudes

/** Every 1:10m polygon, in a 1° grid of the cells its bounding box covers, so a lookup only tries a few */
const grid = new Map();
const cell = (x, y) => `${Math.floor(x)},${Math.floor(y)}`;
for (const f of load('10m')) {
  // No tropical cyclone reaches it, and its ring runs round the pole, which the point-in-polygon test can't take
  if (f.properties.name === 'Antarctica') continue;
  for (let poly of polygonsOf(f.geometry)) {
    // A ring across the date line (parts of Fiji and Russia) runs -180…180: move it onto 0…360, where it's whole
    if (bboxOf([poly])[2] - bboxOf([poly])[0] > 180) poly = poly.map((ring) => ring.map(([x, y]) => [x < 0 ? x + 360 : x, y]));
    const entry = { name: f.properties.name, poly, bbox: bboxOf([poly]), bands: edgeBands(poly) };
    const [w, s, e, n] = entry.bbox;
    for (let x = Math.floor(w); x <= Math.floor(e); x++)
      for (let y = Math.floor(s); y <= Math.floor(n); y++) {
        const k = cell(x, y);
        if (!grid.has(k)) grid.set(k, []);
        grid.get(k).push(entry);
      }
  }
}

const wrap = (lon) => ((((lon + 180) % 360) + 360) % 360) - 180;

/** Where to look for a longitude: as it is, and also on 0…360 for the rings moved there */
const frames = (lon) => {
  const x = wrap(lon);
  return x < 0 ? [x, x + 360] : [x];
};

/** The country a point is inside, or null at sea */
export function countryIn(lat, lon) {
  for (const x of frames(lon))
    for (const { name, bbox, bands } of grid.get(cell(x, lat)) ?? []) {
      if (x >= bbox[0] && x <= bbox[2] && lat >= bbox[1] && lat <= bbox[3] && inBands(x, lat, bands)) return name;
    }
  return null;
}

/** The country a point IBTrACS has over land is in, or the nearest one within COAST_KM, or null */
export function countryAt(lat, lon) {
  const inside = countryIn(lat, lon);
  if (inside) return inside;
  const r = Math.ceil(PAD);
  const seen = new Set();
  let near = null;
  let nearKm = COAST_KM;
  for (const x of frames(lon))
  for (let dx = -r; dx <= r; dx++)
    for (let dy = -r; dy <= r; dy++)
      for (const entry of grid.get(cell(x + dx, lat + dy)) ?? []) {
        if (seen.has(entry)) continue;
        seen.add(entry);
        const km = kmToRing(x, lat, entry.poly[0]);
        if (km < nearKm) {
          nearKm = km;
          near = entry.name;
        }
      }
  return near;
}

/**
 * Each time a track's centre comes onto a country: { country, t, fromSea } — from the sea (a landfall), or over land
 * from another country (fromSea false; also where the track starts over a country). Each stretch between reports is
 * followed in steps of under 0.05° (about 5 km), so a small island between two reports still counts.
 */
export function crossings(points) {
  const out = [];
  let prev = countryIn(points[0].lat, points[0].lon);
  if (prev) out.push({ country: prev, t: points[0].t, fromSea: false });
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(b.lat - a.lat), Math.abs(b.lon - a.lon)) / 0.05));
    for (let k = 1; k <= steps; k++) {
      const here = countryIn(a.lat + ((b.lat - a.lat) * k) / steps, a.lon + ((b.lon - a.lon) * k) / steps);
      if (here && here !== prev) out.push({ country: here, t: a.t + ((b.t - a.t) * k) / steps, fromSea: !prev });
      prev = here;
    }
  }
  return out;
}

const round = (g) => JSON.parse(JSON.stringify(g, (_, v) => (typeof v === 'number' ? Math.round(v * 1000) / 1000 : v)));

/** A Natural Earth country name as the site writes it */
export const countryName = (name) => NAMES[name] ?? name;

/**
 * Every country's shape, keyed by name, for the landfall highlight and the "Near" filter: the 1:50m shapes, plus
 * the 1:10m shape of any country a storm hit that is too small to be in the 1:50m set.
 */
export function countryShapes(hit) {
  const medium = load('50m').filter((f) => f.properties.name !== 'Antarctica');
  const have = new Set(medium.map((f) => f.properties.name));
  const extra = load('10m').filter((f) => hit.has(f.properties.name) && !have.has(f.properties.name));
  return {
    type: 'FeatureCollection',
    features: [...medium, ...extra].map((f) => ({
      type: 'Feature',
      properties: { name: f.properties.name },
      geometry: round(f.geometry),
    })),
  };
}
