/**
 * The view in the address bar, so it can be bookmarked, shared and reopened as it was:
 *
 *   ?from=1980&to=2026&basins=NA,EP&min=1&q=maria&storm=2017260N12310
 *   &country=Jamaica  or  &lat=25.788&lon=-80.224&place=Miami, United States   (with &km=100)
 *   &view=report      the place report instead of the map
 *   &lang=es          the language (only when the reader chose one; otherwise each reader gets their own)
 *
 * Anything missing takes its default.
 */
import type { Near } from './near';

export interface UrlState {
  range: [number, number] | null;
  basins: string[];
  minCat: number | null;
  query: string;
  storm: string | null;
  near: Near | null;
  km: number | null;
  report: boolean;
  /** A language code, or null to follow the reader's */
  lang: string | null;
}

const int = (s: string | null) => {
  if (s === null || s.trim() === '') return null;
  const n = Number(s);
  return Number.isInteger(n) ? n : null;
};
const real = (s: string | null) => {
  if (s === null || s.trim() === '') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

export function readUrl(search = window.location.search): UrlState {
  const p = new URLSearchParams(search);
  const from = int(p.get('from'));
  const to = int(p.get('to'));
  const lat = real(p.get('lat'));
  const lon = real(p.get('lon'));
  const country = p.get('country');
  let near: Near | null = null;
  if (country) near = { kind: 'country', name: country };
  else if (lat !== null && lon !== null && Math.abs(lat) <= 90) {
    near = { kind: 'point', name: p.get('place') || `${lat}, ${lon}`, lat, lon };
  }
  return {
    range: from !== null && to !== null && from <= to ? [from, to] : null,
    basins: (p.get('basins') ?? '').split(',').filter(Boolean),
    minCat: int(p.get('min')),
    query: p.get('q') ?? '',
    storm: p.get('storm'),
    near,
    km: int(p.get('km')),
    report: p.get('view') === 'report',
    lang: p.get('lang'),
  };
}

/** The query string for a state ('' for none) */
export function toSearch(s: UrlState): string {
  const p = new URLSearchParams();
  if (s.range) {
    p.set('from', String(s.range[0]));
    p.set('to', String(s.range[1]));
  }
  if (s.basins.length) p.set('basins', s.basins.join(','));
  if (s.minCat !== null) p.set('min', String(s.minCat));
  if (s.query.trim()) p.set('q', s.query.trim());
  if (s.storm) p.set('storm', s.storm);
  if (s.near?.kind === 'country') p.set('country', s.near.name);
  else if (s.near) {
    p.set('lat', s.near.lat.toFixed(3));
    p.set('lon', s.near.lon.toFixed(3));
    p.set('place', s.near.name);
  }
  if (s.near && s.km !== null) p.set('km', String(s.km));
  if (s.report) p.set('view', 'report');
  if (s.lang) p.set('lang', s.lang);
  const q = p.toString();
  return q ? `?${q}` : '';
}
