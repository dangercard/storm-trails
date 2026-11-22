/** Downloads of the storms in view: a storm list and track points as CSV, and tracks as GeoJSON for GIS tools */
import { en } from '../i18n/en';
import { REGIONAL } from './categories';
import type { Closest, Reach } from './near';
import type { Storm, TrackPoint } from './storms';

export const CITATION =
  'IBTrACS v04r01: Gahtan, J., et al. (2024), International Best Track Archive for Climate Stewardship (IBTrACS) ' +
  'Project, Version 4r01, NOAA National Centers for Environmental Information, doi:10.25921/82ty-9e16; ' +
  'Knapp, K. R., et al. (2010), Bull. Amer. Meteor. Soc., 91, 363-376.';

export type Track = { storm: Storm; points: TrackPoint[] };

// Downloads are in English whatever language the site is showing: spreadsheets, scripts and GIS tools rely on the
// column names, and a file passed on is read by whoever gets it
const basin = (code: string) => en.basins[code as keyof typeof en.basins] ?? code;
const label = (code: number) => (en.categories[code as keyof typeof en.categories] ?? en.categories[-9]).label;
/** A regional class and its agency, in English; blank where there's none */
const local = (code: number | undefined) => {
  const agency = code ? REGIONAL[Math.floor(code / 10) as keyof typeof REGIONAL] : undefined;
  if (!code || !agency) return ['', ''];
  return [en.regional.classes[agency.key][(code % 10) - 1] ?? '', en.regional.agencies[agency.key].short];
};

/** ISO 8601 in UTC, to the minute: 2017-09-10T13:00Z */
export const isoTime = (hours: number) => new Date(Math.round(hours * 3_600_000)).toISOString().slice(0, 16) + 'Z';

/** Longitude in -180…180, to 0.001° (the data is to 0.1°; this drops float noise from the wrapping) */
const wrapLon = (lon: number) => Math.round((((((lon + 180) % 360) + 360) % 360) - 180) * 1000) / 1000;

/**
 * CSV text. Lists inside a cell are joined with commas and the cell quoted, as CSV has it; a cell with a semicolon
 * or tab is quoted too, so a spreadsheet told to split on those as well (LibreOffice remembers that choice) still
 * keeps each cell whole. Starts with a byte-order mark, so Excel reads accented names as UTF-8.
 */
function csv(header: string[], rows: (string | number | null | undefined)[][]): string {
  const cell = (v: string | number | null | undefined) => {
    if (v === null || v === undefined) return '';
    const s = String(v);
    return /[",;\t\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return '\uFEFF' + [header, ...rows].map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n';
}

const stormColumns = [
  'id',
  'name',
  'season',
  'basins',
  'start_utc',
  'end_utc',
  'peak_wind_kt',
  'min_pressure_mb',
  'peak_category',
  'ace',
  'made_landfall',
  'landfall_countries',
  'crossed_countries',
  'provisional',
  'regional_peak_class',
  'regional_agency',
  'regional_peak_wind_kt',
];
const stormRow = (s: Storm) => [
  s.id,
  s.name,
  s.season,
  s.basins.map(basin).join(', '),
  isoTime(s.start),
  isoTime(s.end),
  s.peakWind,
  s.minPres,
  label(s.peakCat),
  s.ace,
  s.landfall ? 'yes' : 'no',
  (s.landfalls ?? []).join(', '),
  (s.crossed ?? []).join(', '),
  s.provisional ? 'yes' : 'no',
  ...local(s.regional),
  s.regionalWind,
];

/** One row per storm */
export const stormsCsv = (storms: Storm[]) => csv(stormColumns, storms.map(stormRow));

/**
 * One row per storm, with where it came closest to a place, the strongest winds that reached it (64, 50, 34 kt, 0
 * for none, blank where there's no estimate), and whether its centre came within the report's distance (for the
 * place report)
 */
export const nearCsv = (rows: { storm: Storm; closest: Closest; reach: Reach; within: boolean }[], what: string, km: number) =>
  csv(
    [
      ...stormColumns,
      `closest_km_to_${what.replace(/\W+/g, '_').toLowerCase()}`,
      'closest_time_utc',
      'closest_lat',
      'closest_lon',
      'wind_at_closest_kt',
      'category_at_closest',
      'regional_class_at_closest',
      'winds_reached_kt',
      `centre_within_${km}km`,
    ],
    rows.map(({ storm, closest: c, reach, within }) => [
      ...stormRow(storm),
      Math.round(c.km),
      isoTime(c.t),
      c.lat.toFixed(2),
      wrapLon(c.lon).toFixed(2),
      c.wind,
      label(c.cat),
      local(c.regional)[0],
      reach,
      within ? 'yes' : 'no',
    ]),
  );

/** One row per report (every 6 hours, plus landfalls and peaks) */
export const pointsCsv = (tracks: Track[]) =>
  csv(
    [
      'id',
      'name',
      'season',
      'time_utc',
      'lat',
      'lon',
      'wind_kt',
      'pressure_mb',
      'category',
      'regional_class',
      'regional_agency',
      'regional_wind_kt',
    ],
    tracks.flatMap(({ storm, points }) =>
      points.map((p) => [
        storm.id,
        storm.name,
        storm.season,
        isoTime(p.t),
        p.lat,
        wrapLon(p.lon),
        p.wind,
        p.pres,
        label(p.cat),
        ...local(p.regional),
        p.regionalWind,
      ]),
    ),
  );

/**
 * A track as lines within -180…180, split where it crosses the date line (the site keeps longitudes running on
 * past ±180 so a track draws unbroken, which GIS tools don't expect)
 */
function splitAtDateLine(points: TrackPoint[]): [number, number][][] {
  const lines: [number, number][][] = [];
  let line: [number, number][] = [];
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const lon = wrapLon(p.lon);
    if (i > 0) {
      const prev = points[i - 1];
      const prevLon = wrapLon(prev.lon);
      if (Math.abs(lon - prevLon) > 180) {
        // Crossing: end at the edge on this side, start again at the edge on the other
        // (the raw longitudes run on continuously, so the fraction of the way to the edge comes from them)
        const edge = prevLon > 0 ? 180 : -180;
        const f = Math.min(1, Math.max(0, (edge - prevLon) / (p.lon - prev.lon)));
        const lat = Math.round((prev.lat + (p.lat - prev.lat) * f) * 1000) / 1000;
        line.push([edge, lat]);
        if (line.length > 1) lines.push(line);
        line = [[-edge, lat]];
      }
    }
    line.push([lon, p.lat]);
  }
  if (line.length > 1) lines.push(line);
  return lines;
}

/** Each storm's track as a feature, with the storm's details as properties */
export const tracksGeoJson = (tracks: Track[]) =>
  JSON.stringify({
    type: 'FeatureCollection',
    source: CITATION,
    features: tracks.map(({ storm, points }) => {
      const row = stormRow(storm);
      return {
        type: 'Feature',
        properties: Object.fromEntries(stormColumns.map((c, i) => [c, row[i]])),
        geometry: { type: 'MultiLineString', coordinates: splitAtDateLine(points) },
      };
    }),
  });

/** Saves text as a file */
export function download(filename: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** A file name from parts: storms-near-miami-100km-1980-2026 */
export const fileName = (...parts: (string | number)[]) =>
  parts
    .map((p) => String(p).normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''))
    .filter(Boolean)
    .join('-');
