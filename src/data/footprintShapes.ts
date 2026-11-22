/**
 * Building a storm's wind footprint (see footprint.ts): the area its tropical-storm-force (34 kt) and hurricane-force
 * (64 kt) winds swept over, merged into one outline per strength. Runs in a worker (footprint.worker.ts), as merging
 * takes a moment.
 *
 * The winds of a strength round the centre reach as far as extentAt in near.ts says at each bearing: each quarter's
 * estimate at its middle, easing to the next quarter's between them, as NHC draws its swaths. Between two quarters'
 * middles that is a convex sector, and between two reports the centre moves in a straight line (as the site draws
 * tracks), so the area a sector sweeps from a report to the next is the convex hull of where it starts and ends:
 * exact for a steady extent, and close while it grows or shrinks. Sweeping each sector on its own follows the shape
 * without leaving teeth along the edge, as stamping the whole shape every few km would.
 */
import type { Radii, TrackPoint } from './storms';

const KM_LAT = 110.57;
const kmLon = (lat: number) => Math.max(1, 111.32 * Math.cos((lat * Math.PI) / 180));

/** Points on each quarter's arc (every 15°) */
const ARC = 6;

/**
 * Coordinates snapped to 1e-5° (about 1 m): the merging (polygon-clipping) can fail on points that nearly coincide,
 * as it did for Ophelia (2017) and Kirk (2024) before this
 */
const snap = (v: number) => Math.round(v * 1e5) / 1e5;

/** The winds the footprint shows: tropical-storm-force and hurricane-force, by where their radii sit in Radii */
export const BANDS = [
  { kt: 34, offset: 0 },
  { kt: 64, offset: 8 },
] as const;

type Point = [number, number];
type Ring = Point[];
/** Merges polygons (each a list of rings) into one multipolygon */
export type Union = (...polygons: Ring[][]) => [number, number][][][];

/**
 * The winds between the middles of two quarters (s: 0 from NE's middle at 45° to SE's at 135°, 1 SE to SW, 2 SW to
 * NW, 3 NW to NE) round a centre, their extent easing from one quarter's estimate (from, km) to the next's (to), as
 * extentAt in near.ts has it: the centre and the edge. A radius changing steadily with bearing makes a convex shape.
 */
function sector(lat: number, lon: number, s: number, from: number, to: number): Point[] {
  const kx = kmLon(lat);
  const out: Point[] = [[snap(lon), snap(lat)]];
  for (let k = 0; k <= ARC; k++) {
    const f = k / ARC;
    const r = from + (to - from) * f;
    const bearing = ((45 + s * 90 + f * 90) * Math.PI) / 180;
    out.push([snap(lon + (r * Math.sin(bearing)) / kx), snap(lat + (r * Math.cos(bearing)) / KM_LAT)]);
  }
  return out;
}

const cross = (o: Point, a: Point, b: Point) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);

/** The convex hull of some points (monotone chain), as a closed ring */
function hull(points: Point[]): Ring {
  const p = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const half = (list: Point[]) => {
    const h: Point[] = [];
    for (const pt of list) {
      while (h.length >= 2 && cross(h[h.length - 2], h[h.length - 1], pt) <= 0) h.pop();
      h.push(pt);
    }
    h.pop();
    return h;
  };
  const ring = [...half(p), ...half([...p].reverse())];
  ring.push(ring[0]);
  return ring;
}

/**
 * The footprint of a track: a feature per strength the storm had ({ kt: 34 } or { kt: 64 }), or null when it has no
 * radii. Stretches with no radii at either end are left out.
 */
export function buildFootprint(points: TrackPoint[], radii: (Radii | null)[], union: Union): GeoJSON.FeatureCollection | null {
  const swept: Ring[][] = BANDS.map(() => []);
  const last = points.length - 1;
  for (let i = 0; i < Math.max(1, last); i++) {
    const a = points[i];
    const b = points[Math.min(i + 1, last)];
    const ra = radii[i];
    const rb = radii[Math.min(i + 1, last)];
    if (!ra || !rb) continue;
    BANDS.forEach(({ offset }, n) => {
      for (let s = 0; s < 4; s++) {
        const [qa, qb] = [offset + s, offset + ((s + 1) % 4)];
        if (!ra[qa] && !ra[qb] && !rb[qa] && !rb[qb]) continue;
        const ring = hull([...sector(a.lat, a.lon, s, ra[qa], ra[qb]), ...sector(b.lat, b.lon, s, rb[qa], rb[qb])]);
        if (ring.length >= 4) swept[n].push(ring);
      }
    });
  }
  if (!swept[0].length) return null;

  const features: GeoJSON.Feature[] = [];
  BANDS.forEach(({ kt }, n) => {
    if (!swept[n].length) return;
    features.push({
      type: 'Feature',
      properties: { kt },
      geometry: { type: 'MultiPolygon', coordinates: union(...swept[n].map((ring) => [ring])) },
    });
  });
  return { type: 'FeatureCollection', features };
}
