/** The files scripts/build-data.mjs writes to public/data */

export interface Storm {
  /** IBTrACS serial id, e.g. 2017260N12310 */
  id: string;
  /** Empty for unnamed storms */
  name: string;
  season: number;
  /** Every basin it was in, first one first */
  basins: string[];
  /** Hours since 1970 (UTC) */
  start: number;
  end: number;
  /** kt; null when no agency gave one */
  peakWind: number | null;
  /** mb */
  minPres: number | null;
  peakCat: number;
  /** Accumulated cyclone energy */
  ace: number;
  landfall: boolean;
  provisional?: boolean;
  /** [west, south, east, north]; longitudes can run past ±180 along the track */
  bbox: [number, number, number, number];
}

export interface TrackPoint {
  /** Hours since 1970 (UTC) */
  t: number;
  lat: number;
  lon: number;
  wind: number | null;
  pres: number | null;
  cat: number;
}

interface Index {
  source: string;
  decades: number[];
  storms: Storm[];
}

export const loadIndex = (): Promise<Index> => fetch('/data/storms.json').then((r) => r.json());

const decades = new Map<number, Promise<Record<string, number[]>>>();

/** One decade's tracks (flat arrays), fetched once */
export function loadDecade(decade: number): Promise<Record<string, number[]>> {
  let p = decades.get(decade);
  if (!p) {
    p = fetch(`/data/tracks/${decade}.json`).then((r) => r.json());
    decades.set(decade, p);
  }
  return p;
}

export const decadeOf = (storm: Storm) => Math.floor(new Date(storm.start * 3_600_000).getUTCFullYear() / 10) * 10;

/** Unpacks a flat track: [hours after start, lat, lon, wind, pressure, category] per point */
export function unpack(storm: Storm, flat: number[]): TrackPoint[] {
  const out: TrackPoint[] = [];
  for (let i = 0; i < flat.length; i += 6) {
    out.push({
      t: storm.start + flat[i],
      lat: flat[i + 1],
      lon: flat[i + 2],
      wind: flat[i + 3] || null,
      pres: flat[i + 4] || null,
      cat: flat[i + 5],
    });
  }
  return out;
}

export const displayName = (s: Storm) => (s.name ? titleCase(s.name) : 'Unnamed');

/** IBTrACS names are upper case, and a storm renamed on crossing basins is "A:B" */
const titleCase = (n: string) =>
  n
    .split(':')
    .map((part) => part.toLowerCase().replace(/(^|[\s-])\p{L}/gu, (m) => m.toUpperCase()))
    .join(' / ');

export const toDate = (hours: number) => new Date(hours * 3_600_000);

export const formatDate = (hours: number, withTime = false) =>
  toDate(hours).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    ...(withTime ? { hour: '2-digit', minute: '2-digit', hour12: false } : {}),
    timeZone: 'UTC',
  }) + (withTime ? ' UTC' : '');
