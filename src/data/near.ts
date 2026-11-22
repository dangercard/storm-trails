/**
 * The "Near" filter: storms whose centre passed within some distance of a country, a city or a spot on the map.
 * Distances are along the track's line, not just at its reports, so a storm that crossed between two reports counts.
 *
 * And, for the place report, whether a storm's winds reached the place (see reach below).
 */
import { countryName, i18n } from '../i18n';
import type { Radii, TrackPoint } from './storms';

/** A country (by its name in countries.topo.json) or a point (a city, or a spot picked on the map) */
export type Near = { kind: 'country'; name: string } | { kind: 'point'; name: string; lat: number; lon: number };

export interface Place {
  /** Its row in places.json (names in other languages are by row) */
  row: number;
  /** In English (Natural Earth's) */
  name: string;
  /** The name folded for matching (see fold) */
  key: string;
  region: string;
  country: string;
  lat: number;
  lon: number;
  pop: number;
}

let places: Promise<Place[]> | null = null;

/** Cities, largest first; fetched once, when the search is first used */
export const loadPlaces = () =>
  (places ??= fetch('/data/places.json')
    .then((r) => r.json())
    .then((rows: [string, string, string, number, number, number][]) =>
      rows.map(([name, region, country, lat, lon, pop], row) => ({ row, name, key: fold(name), region, country, lat, lon, pop })),
    ));

const KM_LAT = 110.57;
const kmLon = (lat: number) => 111.32 * Math.cos((lat * Math.PI) / 180);
const wrap = (lon: number) => (lon >= -180 && lon < 180 ? lon : ((((lon + 180) % 360) + 360) % 360) - 180);

export type TrackTest = (points: TrackPoint[]) => boolean;

/** Where and when a track came closest, and how strong it was then */
export interface Closest {
  /** Distance from the place, or from the country (0 over it) */
  km: number;
  /** Hours since 1970 */
  t: number;
  lat: number;
  lon: number;
  /** kt, between the two reports either side; null when neither has one */
  wind: number | null;
  /** Category of the nearer report */
  cat: number;
  /** The regional agency's class at the nearer report (0 for none) */
  regional: number;
}

/**
 * The strongest winds that reached a place: 64, 50 or 34 (kt), 0 for none of those, or null when it can't be told
 * (no agency estimated how far the winds reached while the storm was near enough)
 */
export type Reach = 64 | 50 | 34 | 0 | null;

/** A "Near" choice at a distance: whether a track passes within it, and where a track came closest */
export interface NearMeasure {
  test: TrackTest;
  closest: (points: TrackPoint[]) => Closest | null;
  /** The strongest winds that reached the place (the country's land, or the point), from the track's radii */
  reach: (points: TrackPoint[], radii: (Radii | null)[] | null) => Reach;
}

/**
 * Which winds reached a target, with the storm's centre at lat/lon and its radii r (km) then: 64, 50, 34 or 0, by
 * how far each reaches at the target's bearing (extentAt). Each estimate is the farthest those winds reached in its
 * quarter, so a place inside the extent may not have felt them everywhere.
 */
type WindsAt = (lat: number, lon: number, r: Radii) => 64 | 50 | 34 | 0;

/**
 * How far winds of a strength reach at a bearing (degrees clockwise from north), from its four quarter estimates
 * (`at`: where they sit in Radii): blended in a straight line between the middles of the quarters (45°, 135°, 225°,
 * 315°), as the National Hurricane Center draws its wind swaths. A quarter's estimate holds at its middle; towards its
 * edges it eases to its neighbour's. (Reading each quarter as a quarter circle instead, its estimate all the way
 * across, made areas 13–16% larger than NHC's; see docs/wind-swath-check.md.)
 */
export function extentAt(r: Radii, at: number, bearing: number): number {
  const x = (((bearing - 45) % 360) + 360) % 360 / 90;
  const q = Math.floor(x) % 4;
  const f = x - Math.floor(x);
  return r[at + q] * (1 - f) + r[at + ((q + 1) % 4)] * f;
}

/** Which winds reach an offset (km east and north of the centre), given the radii */
function windsAtOffset(east: number, north: number, r: Radii): 64 | 50 | 34 | 0 {
  const d = Math.hypot(east, north);
  const bearing = (Math.atan2(east, north) * 180) / Math.PI;
  for (const [kt, at] of [[64, 8], [50, 4], [34, 0]] as const) {
    const reach = extentAt(r, at, bearing);
    if (reach > 0 && d <= reach) return kt;
  }
  return 0;
}

/** The widest 34 kt radius on record (Oscar, 2018, 780 nmi): no storm's winds have reached farther from its centre */
const MAX_REACH_KM = 1450;
/** Category codes of a depression and a disturbance (see categories.ts), which have no 34 kt winds */
const CAT_DEPRESSION = -1;
const CAT_DISTURBANCE = -3;
/**
 * How far 34 kt winds can reach, for a storm with no estimates, by its peak wind: the 99th percentile of the widest
 * each storm's 34 kt winds were, among the storms since 2004 that have estimates (rounded up, and never less than a
 * weaker storm's): under 50 kt 556 km, 50–63 kt 741, 64 kt and up 1,185 (96 kt and up: 870)
 */
const noEstimateReach = (peakKt: number) =>
  peakKt < 0 ? MAX_REACH_KM : peakKt < 50 ? 560 : peakKt < 64 ? 740 : 1190;
/** The radii of a report with no 34 kt winds */
const NO_WINDS: Radii = new Array(12).fill(0);
/** Steps along a track for "winds reached": the centre moves at most this far (km) between looks */
const REACH_STEP_KM = 10;

/**
 * The strongest winds that reached a target along a track: the track followed in short steps, the centre and its
 * radii blended between each two reports. `kmTo` gives a lower bound on the distance from a point to the target, to
 * skip the stretches too far away for any winds to reach.
 *
 * A report with no radii whose wind was under 34 kt has none to give (agencies give radii only for winds the storm
 * has), so it counts as radii of 0; so does one with no wind recorded that was a depression or a disturbance (Japan's
 * agency gives no wind for depressions). A stretch with no radii at one end otherwise is a gap. It leaves the answer
 * unknown (null) unless winds are seen to reach the target elsewhere, if the target was within reach of it: 1.25
 * times the widest the storm's 34 kt winds ever were where they were estimated, or, for a storm with no estimates at
 * all, the widest that storms of its peak strength reach (see NO_ESTIMATE_REACH).
 */
function reachAlong(pts: TrackPoint[], radii: (Radii | null)[] | null, kmTo: (lat: number, lon: number) => number, windsAt: WindsAt): Reach {
  if (!pts.length) return null;
  let best: 64 | 50 | 34 | 0 = 0;
  let unknown = false;
  let widestEver = 0;
  for (const x of radii ?? []) if (x) widestEver = Math.max(widestEver, x[0], x[1], x[2], x[3]);
  let peak = -1;
  for (const p of pts) if (p.wind !== null) peak = Math.max(peak, p.wind);
  const gapReach = widestEver ? Math.min(MAX_REACH_KM, widestEver * 1.25) : noEstimateReach(peak);
  const r: Radii = new Array(12).fill(0);
  const weak = (p: TrackPoint) => (p.wind !== null ? p.wind < 34 : p.cat === CAT_DEPRESSION || p.cat === CAT_DISTURBANCE);
  const radiiAt = (i: number) => radii?.[i] ?? (weak(pts[i]) ? NO_WINDS : null);
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[Math.min(i + 1, pts.length - 1)];
    const ra = radiiAt(i);
    const rb = radiiAt(Math.min(i + 1, pts.length - 1));
    if (i > 0 && i === pts.length - 1) break; // the last point was covered as the end of the stretch before
    const segKm = Math.hypot((b.lat - a.lat) * KM_LAT, (b.lon - a.lon) * kmLon((a.lat + b.lat) / 2));
    const near = Math.min(kmTo(a.lat, a.lon), kmTo(b.lat, b.lon)) - segKm / 2;
    if (!ra || !rb) {
      // Only a gap that came within reach leaves the answer unknown: measured along the stretch, not by its ends alone
      if (near <= gapReach && nearestAlong(a, b, segKm, kmTo) <= gapReach) unknown = true;
      continue;
    }
    const widest = Math.max(ra[0], ra[1], ra[2], ra[3], rb[0], rb[1], rb[2], rb[3]);
    if (near > widest) continue;
    const steps = Math.max(1, Math.ceil(segKm / REACH_STEP_KM));
    for (let k = 0; k <= steps; k++) {
      const f = k / steps;
      for (let j = 0; j < 12; j++) r[j] = ra[j] + (rb[j] - ra[j]) * f;
      const w = windsAt(a.lat + (b.lat - a.lat) * f, a.lon + (b.lon - a.lon) * f, r);
      if (w > best) {
        best = w;
        if (best === 64) return 64;
      }
    }
  }
  return best > 0 ? best : unknown ? null : 0;
}

/** How close a stretch of track comes to the target: looked at every 25 km or less (to within half a step) */
const GAP_STEP_KM = 25;
function nearestAlong(a: TrackPoint, b: TrackPoint, segKm: number, kmTo: (lat: number, lon: number) => number): number {
  const steps = Math.max(1, Math.ceil(segKm / GAP_STEP_KM));
  let best = Infinity;
  for (let k = 0; k <= steps; k++) {
    const f = k / steps;
    best = Math.min(best, kmTo(a.lat + (b.lat - a.lat) * f, a.lon + (b.lon - a.lon) * f));
  }
  return best - segKm / steps / 2;
}

/** The moment a fraction f of the way from report a to report b */
function between(a: TrackPoint, b: TrackPoint, f: number, km: number): Closest {
  const wind = a.wind !== null && b.wind !== null ? Math.round(a.wind + (b.wind - a.wind) * f) : (a.wind ?? b.wind);
  return {
    km,
    t: a.t + (b.t - a.t) * f,
    lat: a.lat + (b.lat - a.lat) * f,
    lon: a.lon + (b.lon - a.lon) * f,
    wind,
    cat: f < 0.5 ? a.cat : b.cat,
    regional: f < 0.5 ? a.regional : b.regional,
  };
}

/** Within `km` of a point: the distance from the point to each stretch of track, flat at that scale */
function pointMeasure(lat0: number, lon0: number, km: number): NearMeasure {
  const kx = kmLon(lat0);
  const latPad = km / KM_LAT;
  const closest = (pts: TrackPoint[]): Closest | null => {
    if (!pts.length) return null;
    let ax = wrap(pts[0].lon - lon0) * kx;
    let ay = (pts[0].lat - lat0) * KM_LAT;
    let best = between(pts[0], pts[0], 0, Math.hypot(ax, ay));
    for (let i = 1; i < pts.length; i++) {
      const bx = ax + wrap(pts[i].lon - pts[i - 1].lon) * kx;
      const by = (pts[i].lat - lat0) * KM_LAT;
      const dx = bx - ax;
      const dy = by - ay;
      const len = dx * dx + dy * dy;
      const f = len ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len)) : 0;
      const d = Math.hypot(ax + f * dx, ay + f * dy);
      if (d < best.km) best = between(pts[i - 1], pts[i], f, d);
      ax = bx;
      ay = by;
    }
    return best;
  };
  const test: TrackTest = (pts) => {
    let ax = 0;
    let ay = 0;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      // Each stretch measured on from its start, not wrapped at both ends: a track crossing the meridian opposite
      // the point would otherwise jump from +180° to -180° and seem to pass right over it
      const bx = i === 0 ? wrap(p.lon - lon0) * kx : ax + wrap(p.lon - pts[i - 1].lon) * kx;
      const by = (p.lat - lat0) * KM_LAT;
      if (i === 0) {
        if (bx * bx + by * by <= km * km) return true;
      } else if (Math.abs(p.lat - lat0) <= latPad + 15 || Math.abs(pts[i - 1].lat - lat0) <= latPad + 15) {
        const dx = bx - ax;
        const dy = by - ay;
        const len = dx * dx + dy * dy;
        const t = len ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len)) : 0;
        const px = ax + t * dx;
        const py = ay + t * dy;
        if (px * px + py * py <= km * km) return true;
      }
      ax = bx;
      ay = by;
    }
    return false;
  };
  const kmTo = (lat: number, lon: number) => Math.hypot((lat - lat0) * KM_LAT, wrap(lon - lon0) * kmLon((lat + lat0) / 2));
  // The point's offset from the centre, measured at the centre's latitude
  const windsAt: WindsAt = (lat, lon, r) => windsAtOffset(wrap(lon0 - lon) * kmLon(lat), (lat0 - lat) * KM_LAT, r);
  const reach = (pts: TrackPoint[], radii: (Radii | null)[] | null) => reachAlong(pts, radii, kmTo, windsAt);
  return { test, closest, reach };
}

/** Grid cell size for a country's distance map, in degrees (about 11 km north–south) */
const RES = 0.1;

/**
 * Within `km` of a country: a grid over the country and `km` around it, holding each cell's distance to the
 * country (0 inside it), worked out once; then each track is followed in steps under a cell, looking each step up.
 */
function countryMeasure(shapes: GeoJSON.Feature[], km: number): NearMeasure {
  let polygons: number[][][][] = [];
  for (const f of shapes) {
    const g = f.geometry;
    if (g.type === 'Polygon') polygons.push(g.coordinates);
    else if (g.type === 'MultiPolygon') polygons.push(...g.coordinates);
  }
  // No shapes (a name not in countries.topo.json): nothing is near it, rather than a grid of infinite size
  if (!polygons.length) return { test: () => false, closest: () => null, reach: () => 0 };
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
  const each = (fn: (x: number, y: number) => void) => {
    for (const poly of polygons) for (const ring of poly) for (const [x, y] of ring) fn(x, y);
  };
  each((x, y) => ((w = Math.min(w, x)), (e = Math.max(e, x)), (s = Math.min(s, y)), (n = Math.max(n, y))));
  // A country across the date line (Russia, Fiji, the US with the Aleutians): work on 0…360 instead
  if (e - w > 180) {
    polygons = polygons.map((poly) => poly.map((ring) => ring.map(([x, y]) => [x < 0 ? x + 360 : x, y])));
    w = Infinity;
    e = -Infinity;
    each((x) => ((w = Math.min(w, x)), (e = Math.max(e, x))));
  }

  const padLat = km / KM_LAT;
  const padLon = km / kmLon(Math.min(80, Math.max(Math.abs(s), Math.abs(n)) + padLat));
  const x0 = w - padLon;
  const y0 = Math.max(-90, s - padLat);
  const cols = Math.ceil((e + padLon - x0) / RES) + 1;
  const rows = Math.ceil((Math.min(90, n + padLat) - y0) / RES) + 1;
  const dist = new Float32Array(cols * rows).fill(Infinity);

  // The country's cells: inside it at the cell's centre line (even-odd across its edges), or touched by an edge
  const crossings: number[][] = Array.from({ length: rows }, () => []);
  for (const poly of polygons)
    for (const ring of poly)
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [xa, ya] = ring[j];
        const [xb, yb] = ring[i];
        const r0 = Math.ceil((Math.min(ya, yb) - y0) / RES - 0.5);
        const r1 = Math.floor((Math.max(ya, yb) - y0) / RES - 0.5);
        for (let r = Math.max(0, r0); r <= Math.min(rows - 1, r1); r++) {
          const y = y0 + (r + 0.5) * RES;
          if (ya > y !== yb > y) crossings[r].push(xa + ((y - ya) * (xb - xa)) / (yb - ya));
        }
        const steps = Math.max(1, Math.ceil(Math.max(Math.abs(xb - xa), Math.abs(yb - ya)) / (RES / 2)));
        for (let k = 0; k <= steps; k++) {
          const c = Math.floor((xa + ((xb - xa) * k) / steps - x0) / RES);
          const r = Math.floor((ya + ((yb - ya) * k) / steps - y0) / RES);
          if (c >= 0 && c < cols && r >= 0 && r < rows) dist[r * cols + c] = 0;
        }
      }
  for (let r = 0; r < rows; r++) {
    const xs = crossings[r].sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const c0 = Math.max(0, Math.round((xs[k] - x0) / RES));
      const c1 = Math.min(cols - 1, Math.round((xs[k + 1] - x0) / RES) - 1);
      for (let c = c0; c <= c1; c++) dist[r * cols + c] = 0;
    }
  }

  // Distance out from the country: two sweeps passing each cell's distance to its neighbours (a chamfer transform;
  // within a few percent of the true distance). East–west steps shrink towards the poles.
  const dy = RES * KM_LAT;
  const dxOf = new Float32Array(rows);
  for (let r = 0; r < rows; r++) dxOf[r] = RES * kmLon(y0 + (r + 0.5) * RES);
  const relax = (i: number, j: number, step: number) => {
    const d = dist[j] + step;
    if (d < dist[i]) dist[i] = d;
  };
  for (let r = 0; r < rows; r++) {
    const dx = dxOf[r];
    const diag = Math.hypot(dx, dy);
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      if (c > 0) relax(i, i - 1, dx);
      if (r > 0) {
        relax(i, i - cols, dy);
        if (c > 0) relax(i, i - cols - 1, diag);
        if (c < cols - 1) relax(i, i - cols + 1, diag);
      }
    }
  }
  for (let r = rows - 1; r >= 0; r--) {
    const dx = dxOf[r];
    const diag = Math.hypot(dx, dy);
    for (let c = cols - 1; c >= 0; c--) {
      const i = r * cols + c;
      if (c < cols - 1) relax(i, i + 1, dx);
      if (r < rows - 1) {
        relax(i, i + cols, dy);
        if (c < cols - 1) relax(i, i + cols + 1, diag);
        if (c > 0) relax(i, i + cols - 1, diag);
      }
    }
  }

  const yMax = y0 + rows * RES;
  const xMax = x0 + cols * RES;
  /** The narrowest a degree of longitude gets on the grid, so distances worked out with it are never too long */
  const kxMin = kmLon(Math.min(89, Math.max(Math.abs(y0), Math.abs(yMax))));
  /** Distance (km) from a point to the country: from the grid, or, off it, at least the distance to its edge */
  const distAt = (lat: number, lon: number) => {
    let x = wrap(lon);
    if (x < x0) x += 360;
    if (lat >= y0 && lat < yMax && x >= x0 && x < xMax) {
      return dist[Math.floor((lat - y0) / RES) * cols + Math.floor((x - x0) / RES)];
    }
    // Off the grid (which reaches km past the country): how far to its nearest side, as a lower bound
    const dLat = lat < y0 ? y0 - lat : lat >= yMax ? lat - yMax : 0;
    const dLon = x < x0 ? Math.min(x0 - x, x + 360 - xMax) : x >= xMax ? Math.min(x - xMax, x0 + 360 - x) : 0;
    return km + Math.hypot(dLat * KM_LAT, Math.max(0, dLon) * kxMin);
  };
  /**
   * How far along a track is surely still out of reach from a point `d` km from the country: the grid's distances
   * can read up to 8% long (the chamfer sweep) and are per cell, so allow for both
   */
  const cellKm = Math.hypot(RES * KM_LAT, RES * kmLon(Math.max(-89, Math.min(89, (y0 + yMax) / 2))));
  const safeSkip = (d: number) => d / 1.09 - km - cellKm;
  /** Every step of under a cell along the track, keeping the nearest (distances are the grid's, to about a cell) */
  const closest = (pts: TrackPoint[]): Closest | null => {
    if (!pts.length) return null;
    let best = between(pts[0], pts[0], 0, distAt(pts[0].lat, pts[0].lon));
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1];
      const b = pts[i];
      const steps = Math.max(1, Math.ceil(Math.max(Math.abs(b.lat - a.lat), Math.abs(b.lon - a.lon)) / RES));
      for (let k = 1; k <= steps; k++) {
        const f = k / steps;
        const d = distAt(a.lat + (b.lat - a.lat) * f, a.lon + (b.lon - a.lon) * f);
        if (d < best.km) best = between(a, b, f, d);
      }
    }
    return best;
  };
  const test: TrackTest = (pts) => {
    if (!pts.length) return false;
    let d = distAt(pts[0].lat, pts[0].lon);
    if (d <= km) return true;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1];
      const b = pts[i];
      // Follow the stretch in steps of under a cell, but jump ahead by however far it's sure to stay out of reach
      const segKm = Math.hypot((b.lat - a.lat) * KM_LAT, (b.lon - a.lon) * kmLon((a.lat + b.lat) / 2));
      const minStep = 1 / Math.max(1, Math.ceil(Math.max(Math.abs(b.lat - a.lat), Math.abs(b.lon - a.lon)) / RES));
      let f = 0;
      while (f < 1) {
        f = Math.min(1, f + Math.max(minStep, segKm ? safeSkip(d) / segKm : 1));
        d = distAt(a.lat + (b.lat - a.lat) * f, a.lon + (b.lon - a.lon) * f);
        if (d <= km) return true;
      }
    }
    return false;
  };

  /**
   * For "winds reached": the cells on the country's edge (coast or border), by the 1° square they're in. Winds reach
   * the country if its centre is over it, or else if they reach one of these: the winds' area is all in view from the
   * centre (its extent is a distance by bearing), so if it takes in some of the country while the centre is outside
   * it, the line from the centre to that land crosses the country's edge inside the area.
   */
  const edges = new Map<number, number[]>();
  const bucket = (row: number, col: number) => row * 1000 + col;
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      if (dist[i] !== 0) continue;
      const edge =
        r === 0 || r === rows - 1 || c === 0 || c === cols - 1 || dist[i - 1] > 0 || dist[i + 1] > 0 || dist[i - cols] > 0 || dist[i + cols] > 0;
      if (!edge) continue;
      const lat = y0 + (r + 0.5) * RES;
      const x = x0 + (c + 0.5) * RES;
      const key = bucket(Math.floor(lat) + 90, Math.floor(x) + 360);
      const list = edges.get(key);
      if (list) list.push(lat, x);
      else edges.set(key, [lat, x]);
    }
  const windsAt: WindsAt = (lat, lon, r) => {
    const d = distAt(lat, lon);
    const widest = Math.max(r[0], r[1], r[2], r[3]);
    // The grid's distances can read up to 9% long, and are per cell (as in safeSkip): only skip what's surely out of reach
    if (d / 1.09 - cellKm > widest) return 0;
    // Centre over the country: the land right round it is in every quarter, so the strongest winds there reach it
    if (d === 0) return r[8] || r[9] || r[10] || r[11] ? 64 : r[4] || r[5] || r[6] || r[7] ? 50 : widest > 0 ? 34 : 0;
    let x = wrap(lon);
    if (x < x0) x += 360;
    const kx = kmLon(lat);
    const dLat = widest / KM_LAT;
    const dLon = widest / Math.max(1, kx);
    let best: 64 | 50 | 34 | 0 = 0;
    for (let row = Math.floor(lat - dLat); row <= Math.floor(lat + dLat); row++)
      for (let col = Math.floor(x - dLon); col <= Math.floor(x + dLon); col++) {
        const cells = edges.get(bucket(row + 90, col + 360));
        if (!cells) continue;
        for (let k = 0; k < cells.length; k += 2) {
          const w = windsAtOffset((cells[k + 1] - x) * kx, (cells[k] - lat) * KM_LAT, r);
          if (w > best) {
            best = w;
            if (best === 64) return 64;
          }
        }
      }
    return best;
  };
  const kmTo = (lat: number, lon: number) => distAt(lat, lon) / 1.09 - cellKm;
  const reach = (pts: TrackPoint[], radii: (Radii | null)[] | null) => reachAlong(pts, radii, kmTo, windsAt);
  return { test, closest, reach };
}

/** The measure for a choice, or null while the country shapes it needs are still loading */
export function nearMeasure(near: Near, km: number, countries: GeoJSON.FeatureCollection | null): NearMeasure | null {
  if (near.kind === 'point') return remembered(pointMeasure(near.lat, near.lon, km));
  if (!countries) return null;
  const key = `${near.name}|${km}`;
  let measure = grids.get(key);
  if (!measure) {
    measure = remembered(
      countryMeasure(
        countries.features.filter((f) => f.properties?.name === near.name),
        km,
      ),
    );
    grids.set(key, measure);
    // Keep the last few (a country's grid is a few MB)
    if (grids.size > 6) grids.delete(grids.keys().next().value!);
  }
  return measure;
}

/**
 * A measure that remembers each track's answer (tracks are unpacked once and shared, so they key it): changing
 * another filter with "Near" on then tests only the tracks it hasn't seen
 */
function remembered(m: NearMeasure): NearMeasure {
  const seen = new WeakMap<TrackPoint[], boolean>();
  const reached = new WeakMap<TrackPoint[], Reach>();
  return {
    closest: m.closest,
    reach: (pts, radii) => {
      // Keyed by the track: its radii never change once loaded (a track without them yet isn't kept)
      let w = reached.get(pts);
      if (w === undefined) {
        w = m.reach(pts, radii);
        if (radii) reached.set(pts, w);
      }
      return w;
    },
    test: (pts) => {
      let hit = seen.get(pts);
      if (hit === undefined) {
        hit = m.test(pts);
        seen.set(pts, hit);
      }
      return hit;
    },
  };
}

/** Country measures already built, by "name|km": going back to a distance is then instant */
const grids = new Map<string, NearMeasure>();

/** What to draw for a choice: the country's shapes, or a circle of the radius around the point */
export function nearShape(near: Near, km: number, countries: GeoJSON.FeatureCollection | null): GeoJSON.FeatureCollection {
  if (near.kind === 'country') {
    return { type: 'FeatureCollection', features: countries?.features.filter((f) => f.properties?.name === near.name) ?? [] };
  }
  const ring: [number, number][] = [];
  for (let k = 0; k <= 96; k++) {
    const a = (k / 96) * 2 * Math.PI;
    // A geodesic circle: the destination point at distance km, bearing a
    const d = km / 6371;
    const la = (near.lat * Math.PI) / 180;
    const lat2 = Math.asin(Math.sin(la) * Math.cos(d) + Math.cos(la) * Math.sin(d) * Math.cos(a));
    const lon2 = near.lon + (Math.atan2(Math.sin(a) * Math.sin(d) * Math.cos(la), Math.cos(d) - Math.sin(la) * Math.sin(lat2)) * 180) / Math.PI;
    ring.push([lon2, (lat2 * 180) / Math.PI]);
  }
  return {
    type: 'FeatureCollection',
    features: [
      { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [ring] } },
      { type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [near.lon, near.lat] } },
    ],
  };
}

/** Accent- and case-blind, for matching what's typed */
export const fold = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

/** What a "Near" choice is called, in the language showing (a country's name is kept in English in links and data) */
export const nearLabel = (near: Near) => (near.kind === 'country' ? countryName(near.name) : near.name);

/** "25.8°N, 80.2°W", with the compass letters of the language showing */
export const formatLatLon = (lat: number, lon: number) => {
  const { N, S, E, W } = i18n().m.compass;
  return `${Math.abs(lat).toFixed(1)}°${lat >= 0 ? N : S}, ${Math.abs(wrap(lon)).toFixed(1)}°${wrap(lon) >= 0 ? E : W}`;
};
