import { i18n } from '../i18n';
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
  /** The countries it made landfall in, first hit first (names as in countries.topo.json) */
  landfalls?: string[];
  /** The countries its centre crossed without making landfall there (reached over land, or where it started) */
  crossed?: string[];
  provisional?: boolean;
  /** The regional agency's class at its peak (see regional() in categories.ts), and that agency's peak wind (kt) */
  regional?: number;
  regionalWind?: number | null;
  /** Where it moved to another basin: [basin, hours since 1970] for each move, in order */
  moves?: [string, number][];
}

export interface TrackPoint {
  /** Hours since 1970 (UTC) */
  t: number;
  lat: number;
  lon: number;
  wind: number | null;
  pres: number | null;
  cat: number;
  /** The regional agency's class (see regional() in categories.ts), 0 for none, and that agency's wind (kt) */
  regional: number;
  regionalWind: number | null;
  /** The sea surface temperature under it the day before (°C, NOAA OISST, from 1981), null where unknown or over land */
  sst: number | null;
}

interface Index {
  source: string;
  decades: number[];
  storms: Storm[];
}

/** storms.json as scripts/build-data.mjs writes it (see writeIndex there): one array per field */
interface IndexFile {
  source: string;
  decades: number[];
  /** The decades with a radii file */
  radii: number[];
  id: string[];
  name: string[];
  season: number[];
  /** Space-separated */
  basins: string[];
  /** Minutes since the storm before started (the first: since 1970) */
  start: number[];
  /** Minutes */
  duration: number[];
  /** 0 for none */
  peakWind: number[];
  minPres: number[];
  peakCat: number[];
  ace: number[];
  landfall: (0 | 1)[];
  /** "|"-separated, "" for none */
  landfalls: string[];
  /** "|"-separated, "" for none */
  crossed: string[];
  provisional: (0 | 1)[];
  /** 0 for none */
  regional: number[];
  regionalWind: number[];
  /** "BASIN:minutes after start", space-separated; "" for none */
  moves: string[];
}

/** The index, back into one object per storm */
function readIndex(f: IndexFile): Index {
  const storms: Storm[] = [];
  let minutes = 0;
  for (let i = 0; i < f.id.length; i++) {
    minutes += f.start[i];
    const storm: Storm = {
      id: f.id[i],
      name: f.name[i],
      season: f.season[i],
      basins: f.basins[i].split(' '),
      start: minutes / 60,
      end: (minutes + f.duration[i]) / 60,
      peakWind: f.peakWind[i] || null,
      minPres: f.minPres[i] || null,
      peakCat: f.peakCat[i],
      ace: f.ace[i],
      landfall: f.landfall[i] === 1,
    };
    if (f.landfalls[i]) storm.landfalls = f.landfalls[i].split('|');
    if (f.crossed[i]) storm.crossed = f.crossed[i].split('|');
    if (f.provisional[i]) storm.provisional = true;
    if (f.regional[i]) {
      storm.regional = f.regional[i];
      storm.regionalWind = f.regionalWind[i] || null;
    }
    if (f.moves[i]) {
      storm.moves = f.moves[i].split(' ').map((move) => {
        const [basin, after] = move.split(':');
        return [basin, storm.start + Number(after) / 60];
      });
    }
    storms.push(storm);
  }
  radiiDecades = new Set(f.radii);
  return { source: f.source, decades: f.decades, storms };
}

/**
 * Fetches a data file. index.html starts the first view's files downloading (with <link rel="preload">) before the
 * app's code has even arrived; a fetch of the same address made like this one picks that download up.
 */
const get = <T>(path: string): Promise<T> =>
  fetch(path).then((r) => {
    if (!r.ok) throw new Error(`${path}: ${r.status}`);
    return r.json() as Promise<T>;
  });

export const loadIndex = (): Promise<Index> => get<IndexFile>('/data/storms.json').then(readIndex);

let countries: Promise<GeoJSON.FeatureCollection> | null = null;

/**
 * The shapes of every country, keyed by properties.name; fetched once, when first needed. Stored as TopoJSON (shared
 * borders once), with its reader loaded alongside, so neither weighs on the first load.
 */
export const loadCountries = () =>
  (countries ??= Promise.all([
    get<TopoJSON.Topology<{ countries: TopoJSON.GeometryCollection<{ name: string }> }>>('/data/countries.topo.json'),
    import('topojson-client'),
  ]).then(([topo, { feature }]) => feature(topo, topo.objects.countries) as GeoJSON.FeatureCollection));

/**
 * A decade's tracks, by storm id: each track as columns, as scripts/encode.mjs writes them (see unpack). Not to be
 * changed: unpacked tracks are remembered by them.
 */
export type TrackFile = Record<string, (number | null)[][]>;
/** A decade's radii, by storm id: columns, as scripts/encode.mjs writes them (see radiiOf) */
export type RadiiFile = {
  /** How far 34, 50 and 64 kt winds reached: 13 columns (the point index, 12 radii) per storm */
  wind?: Record<string, number[][]>;
  /** How far 12 ft seas reached: 5 columns (the point index, 4 radii) per storm */
  seas?: Record<string, number[][]>;
};

const decades = new Map<number, Promise<TrackFile>>();

/** One decade's tracks, fetched once (or tried again, if it failed) */
export function loadDecade(decade: number): Promise<TrackFile> {
  let p = decades.get(decade);
  if (!p) {
    p = get<TrackFile>(`/data/tracks/${decade}.json`);
    p.catch(() => decades.delete(decade));
    decades.set(decade, p);
  }
  return p;
}

/**
 * How far out 34, 50 and 64 kt winds reached at a report, in km, in each quarter round the centre: 12 numbers,
 * [34 kt NE, SE, SW, NW, 50 kt NE…, 64 kt NE…]. A 0 is "none that strong in that quarter".
 */
export type Radii = number[];

/** The decades with a radii file (from the index) */
let radiiDecades = new Set<number>();
const radiiFiles = new Map<number, Promise<RadiiFile>>();

/** One decade's radii, fetched once; empty for a decade without any */
export function loadRadii(decade: number): Promise<RadiiFile> {
  if (!radiiDecades.has(decade)) return Promise.resolve({});
  let p = radiiFiles.get(decade);
  if (!p) {
    p = get<RadiiFile>(`/data/radii/${decade}.json`);
    p.catch(() => radiiFiles.delete(decade));
    radiiFiles.set(decade, p);
  }
  return p;
}

/** Whether any storm in a decade has radii, so there's a file to fetch */
export const hasRadii = (decade: number) => radiiDecades.has(decade);

const NMI = 1.852;
const radiiCache = new WeakMap<number[][], (Radii | null)[]>();

/**
 * Radii, one entry per point (null where there's no estimate), in km, from a storm's columns in a radii file (see
 * scripts/encode.mjs): the point index, then n radii in nautical miles, each as the change from the entry before;
 * columns left off the end are all zero
 */
function decodeRadii(points: TrackPoint[], cols: number[][], n: number): (Radii | null)[] {
  let out = radiiCache.get(cols);
  if (!out) {
    out = new Array<Radii | null>(points.length).fill(null);
    const sums = new Array<number>(n + 1).fill(0);
    for (let i = 0; i < cols[0].length; i++) {
      for (let k = 0; k <= n; k++) sums[k] += cols[k]?.[i] ?? 0;
      out[sums[0]] = sums.slice(1).map((nmi) => nmi * NMI);
    }
    radiiCache.set(cols, out);
  }
  return out;
}

/**
 * A track's wind radii, one entry per point (12 numbers in km; null where no agency estimated them), from its
 * decade's radii file; null when the storm has none at all
 */
export function radiiOf(points: TrackPoint[], file: RadiiFile | undefined, id: string): (Radii | null)[] | null {
  const cols = file?.wind?.[id];
  return cols ? decodeRadii(points, cols, 12) : null;
}

/**
 * How far seas of 12 feet (3.7 m) or more reached at each point, in km, in each quarter round the centre (NE, SE, SW,
 * NW; null where there's no estimate), from the decade's radii file; null when the storm has none (the US agencies
 * give it, in the North Atlantic and East Pacific, from about 2004)
 */
export function seasOf(points: TrackPoint[], file: RadiiFile | undefined, id: string): (Radii | null)[] | null {
  const cols = file?.seas?.[id];
  return cols ? decodeRadii(points, cols, 4) : null;
}

const decadeCache = new WeakMap<Storm, number>();

/** The decade a storm starts in (worked out once per storm: it's asked for every storm on every filter change) */
export function decadeOf(storm: Storm): number {
  let d = decadeCache.get(storm);
  if (d === undefined) {
    d = Math.floor(new Date(storm.start * 3_600_000).getUTCFullYear() / 10) * 10;
    decadeCache.set(storm, d);
  }
  return d;
}

/** The basin a storm was in at a time (hours since 1970) */
export function basinAt(storm: Storm, t: number): string {
  let basin = storm.basins[0];
  for (const [b, from] of storm.moves ?? []) if (from <= t) basin = b;
  return basin;
}

/** Tracks already unpacked, by their columns (which live as long as their decade is loaded) */
const unpacked = new WeakMap<(number | null)[][], TrackPoint[]>();

/**
 * Unpacks a track from its columns (see scripts/encode.mjs): time, latitude and longitude in tenths, each as the
 * change from the report before; wind (0 unknown); pressure as the change from the last report with one (null
 * unknown); category, regional class and regional wind; sea temperature in tenths of a °C, as the change from the last
 * report with one (null unknown). Columns left off the end are all zero (pressure, sea temperature: unknown).
 * Once per track, so changing a filter doesn't rebuild every point of every storm in view; the result is shared, so
 * not to be changed.
 */
export function unpack(storm: Storm, cols: (number | null)[][]): TrackPoint[] {
  const seen = unpacked.get(cols);
  if (seen) return seen;
  const at = (k: number, i: number) => cols[k]?.[i] ?? 0;
  const out: TrackPoint[] = [];
  let tenths = 0;
  let lat = 0;
  let lon = 0;
  let pres = 0;
  let sst = 0;
  for (let i = 0; i < cols[0].length; i++) {
    tenths += at(0, i);
    lat += at(1, i);
    lon += at(2, i);
    const dp = cols[4]?.[i];
    if (dp !== null && dp !== undefined) pres += dp;
    const ds = cols[8]?.[i];
    if (ds !== null && ds !== undefined) sst += ds;
    out.push({
      t: storm.start + tenths / 10,
      lat: lat / 10,
      lon: lon / 10,
      wind: at(3, i) || null,
      pres: dp === null || dp === undefined ? null : pres,
      cat: at(5, i),
      regional: at(6, i),
      regionalWind: at(7, i) || null,
      sst: ds === null || ds === undefined ? null : sst / 10,
    });
  }
  unpacked.set(cols, out);
  return out;
}

export const displayName = (s: Storm) => (s.name ? titleCase(s.name) : i18n().m.unnamed);

/** IBTrACS names are upper case, and a storm renamed on crossing basins is "A:B" */
const titleCase = (n: string) =>
  n
    .split(':')
    .map((part) => part.toLowerCase().replace(/(^|[\s-])\p{L}/gu, (m) => m.toUpperCase()))
    .join(' / ');

export const toDate = (hours: number) => new Date(hours * 3_600_000);

/** A date (hours since 1970) in the language showing, in UTC: "Sep 10, 2017", or with the time "Sep 10, 2017, 13:00 UTC" */
export const formatDate = (hours: number, withTime = false) => {
  const { date, dateTime, m } = i18n();
  return withTime ? m.utc(dateTime.format(toDate(hours))) : date.format(toDate(hours));
};
