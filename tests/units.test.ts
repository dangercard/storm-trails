/**
 * The smaller pieces: unpacking tracks and radii (src/data/storms.ts), basin terms (categories.ts), downloads
 * (exports.ts) and the wind footprint's shapes (footprintShapes.ts)
 */
import polygonClipping from 'polygon-clipping';
import { describe, expect, it } from 'vitest';
import { termOf, termOfAll } from '../src/data/categories';
import { fileName, isoTime, nearCsv, pointsCsv, stormsCsv } from '../src/data/exports';
import { buildFootprint, type Union } from '../src/data/footprintShapes';
import { basinAt, displayName, radiiOf, unpack, type Storm, type TrackPoint } from '../src/data/storms';

const storm = (over: Partial<Storm> = {}): Storm => ({
  id: '2017260N12310',
  name: 'MARIA',
  season: 2017,
  basins: ['NA'],
  start: 1000,
  end: 1300,
  peakWind: 150,
  minPres: 908,
  peakCat: 5,
  ace: 44.8,
  landfall: true,
  ...over,
});

describe('tracks', () => {
  it('unpacks a track from its columns: changes in tenths for time and place, pressure from the last known', () => {
    const cols = [
      [0, 60], // tenths of an hour: 0, then 6 h later
      [121, 4], // tenths of a degree: 12.1, then 12.5
      [-502, -8], // -50.2, then -51.0
      [30, 0], // wind; 0 unknown
      [1008, null], // pressure; null unknown
      [-1, -9],
      [0, 16],
      [0, 125],
    ];
    const pts = unpack(storm(), cols);
    expect(pts).toEqual([
      { t: 1000, lat: 12.1, lon: -50.2, wind: 30, pres: 1008, cat: -1, regional: 0, regionalWind: null, sst: null },
      { t: 1006, lat: 12.5, lon: -51, wind: null, pres: null, cat: -9, regional: 16, regionalWind: 125, sst: null },
    ]);
    // Once per track: the same array back, so filters don't rebuild every point
    expect(unpack(storm(), cols)).toBe(pts);
  });

  it('reads columns left off the end as zeros, and a missing pressure column as unknown', () => {
    const pts = unpack(storm(), [[0, 60], [100, 5], [-500, -5]]);
    expect(pts.map((p) => [p.lat, p.lon, p.wind, p.pres, p.cat, p.regional])).toEqual([
      [10, -50, null, null, 0, 0],
      [10.5, -50.5, null, null, 0, 0],
    ]);
  });

  it('lines radii up with their reports, in km, null where there are none', () => {
    const pts = unpack(storm(), [[0, 60, 60], [100, 10, 10], [-500, -10, -10], [40, 50, 60]]);
    // One entry, for point 1: 34 kt 100/90/80/70 nmi, 50 kt NE 50 (the 64 kt columns left off)
    const r = radiiOf(pts, { wind: { [storm().id]: [[1], [100], [90], [80], [70], [50]] } }, storm().id)!;
    expect(r[0]).toBeNull();
    expect(r[2]).toBeNull();
    expect(r[1]![0]).toBeCloseTo(185.2);
    expect(r[1]![3]).toBeCloseTo(70 * 1.852);
    expect(r[1]![4]).toBeCloseTo(50 * 1.852);
    expect(r[1]![11]).toBe(0);
    expect(r[1]!.length).toBe(12);
    expect(radiiOf(pts, {}, storm().id)).toBeNull();
  });

  it('knows which basin a storm was in when', () => {
    const s = storm({ basins: ['EP', 'WP'], moves: [['WP', 1100], ['EP', 1200]] });
    expect(basinAt(s, 1000)).toBe('EP');
    expect(basinAt(s, 1100)).toBe('WP');
    expect(basinAt(s, 1150)).toBe('WP');
    expect(basinAt(s, 1250)).toBe('EP');
    expect(basinAt(storm(), 1250)).toBe('NA');
  });

  it('writes names in title case, a renamed storm as both, an unnamed one as such', () => {
    expect(displayName(storm())).toBe('Maria');
    expect(displayName(storm({ name: 'HECTOR-ISHA' }))).toBe('Hector-Isha');
    expect(displayName(storm({ name: 'IVA:KELI' }))).toBe('Iva / Keli');
    expect(displayName(storm({ name: '' }))).toBe('Unnamed');
  });
});

describe('basin terms', () => {
  it('says hurricane in the North Atlantic and East Pacific, typhoon in the West Pacific, neither elsewhere', () => {
    expect([termOf('NA'), termOf('EP'), termOf('WP'), termOf('NI'), termOf('SI'), termOf('SP'), termOf('SA')]).toEqual([
      'hurricane', 'hurricane', 'typhoon', 'other', 'other', 'other', 'other',
    ]);
  });
  it('uses a term for a set of storms only when they all share it', () => {
    expect(termOfAll(['NA', 'EP', 'NA'])).toBe('hurricane');
    expect(termOfAll(['EP', 'WP'])).toBe('other');
    expect(termOfAll([])).toBe('other');
  });
});

describe('downloads', () => {
  /** A CSV split into rows and cells (the cells here have no quoted commas, except where a test says) */
  const rows = (csv: string) => csv.replace(/^﻿/, '').trimEnd().split('\r\n');
  /** A CSV row's cells, quotes undone */
  const cellsOf = (row: string) => {
    const cells: string[] = [];
    let cell = '';
    let quoted = false;
    for (let i = 0; i < row.length; i++) {
      const ch = row[i];
      if (quoted && ch === '"' && row[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = !quoted;
      else if (ch === ',' && !quoted) {
        cells.push(cell);
        cell = '';
      } else cell += ch;
    }
    return [...cells, cell];
  };

  it('starts with a byte-order mark (Excel then reads accents) and ends rows with CRLF', () => {
    const csv = stormsCsv([storm()]);
    expect(csv.startsWith('﻿')).toBe(true);
    expect(csv.endsWith('\r\n')).toBe(true);
    expect(rows(csv).length).toBe(2);
  });

  it('gives every row as many cells as the header, with the regional class blank where there is none', () => {
    const [head, row] = rows(stormsCsv([storm({ landfalls: ['Dominica', 'Puerto Rico'] })]));
    expect(cellsOf(row).length).toBe(head.split(',').length);
    expect(cellsOf(row)[11]).toBe('Dominica, Puerto Rico');
    expect(head.split(',').slice(-3)).toEqual(['regional_peak_class', 'regional_agency', 'regional_peak_wind_kt']);
    expect(row).toContain('"Dominica, Puerto Rico"');
    expect(row.endsWith(',,,')).toBe(true);
  });

  it('writes the regional class in English, whatever language is showing', () => {
    const row = rows(stormsCsv([storm({ regional: 16, regionalWind: 125 })]))[1];
    expect(row.endsWith('Violent typhoon,JMA,125')).toBe(true);
  });

  it('quotes cells with commas, quotes, semicolons or tabs', () => {
    const row = rows(stormsCsv([storm({ name: 'A "B"; C' })]))[1];
    expect(row).toContain('"A ""B""; C"');
    expect(cellsOf(row)[1]).toBe('A "B"; C');
  });

  it('gives each report’s time in UTC to the minute, and longitudes within ±180°', () => {
    expect(isoTime(1000.5)).toBe('1970-02-11T16:30Z');
    const pts: TrackPoint[] = [{ t: 1000, lat: 10, lon: 190, wind: 60, pres: null, cat: 0, regional: 0, regionalWind: null, sst: 28.4 }];
    expect(rows(pointsCsv([{ storm: storm(), points: pts }]))[1]).toContain(',10,-170,60,,Tropical storm,,,');
  });

  it('names the place-report column after the place', () => {
    const head = rows(nearCsv([], 'Fort Myers', 50))[0];
    expect(head).toContain('closest_km_to_fort_myers');
    expect(head).toContain('centre_within_50km');
  });

  it('makes safe file names from any name', () => {
    expect(fileName('storms-near', 'Puerto Príncipe, Haití', '100km', 1980, 2026)).toBe('storms-near-puerto-principe-haiti-100km-1980-2026');
  });
});

describe('wind footprint shapes', () => {
  const union = polygonClipping.union as unknown as Union;
  const pts: TrackPoint[] = [0, 1, 2].map((i) => ({ t: i * 6, lat: 20, lon: -60 + i, wind: 100, pres: null, cat: 3, regional: 0, regionalWind: null, sst: null }));
  /** Whether a point is inside a (multi)polygon, by crossings */
  const inside = (g: GeoJSON.Geometry, lon: number, lat: number) => {
    const polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
    let n = 0;
    for (const poly of polys)
      for (const ring of poly)
        for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
          const [xa, ya] = ring[j];
          const [xb, yb] = ring[i];
          if (ya > lat !== yb > lat && lon < xa + ((lat - ya) * (xb - xa)) / (yb - ya)) n++;
        }
    return n % 2 === 1;
  };

  it('covers the track out to the 34 and 64 kt extents, and no farther', () => {
    const r = pts.map(() => [200, 200, 200, 200, 100, 100, 100, 100, 50, 50, 50, 50]);
    const fc = buildFootprint(pts, r, union)!;
    const band = (kt: number) => fc.features.find((f) => f.properties!.kt === kt)!.geometry;
    // Along the middle of the track, 150 km south (1.36°): inside 34 kt, outside 64 kt
    expect(inside(band(34), -59, 20 - 150 / 110.57)).toBe(true);
    expect(inside(band(64), -59, 20 - 150 / 110.57)).toBe(false);
    expect(inside(band(64), -59, 20 - 30 / 110.57)).toBe(true);
    // 250 km north: outside both
    expect(inside(band(34), -59, 20 + 250 / 110.57)).toBe(false);
  });

  it('draws only the strengths the storm had', () => {
    const fc = buildFootprint(pts, pts.map(() => [150, 150, 150, 150, 0, 0, 0, 0, 0, 0, 0, 0]), union)!;
    expect(fc.features.map((f) => f.properties!.kt)).toEqual([34]);
  });

  it('outlines where 12 ft seas reached, apart from the winds', () => {
    const fc = buildFootprint(pts, null, union, pts.map(() => [300, 300, 300, 300]))!;
    expect(fc.features.map((f) => f.properties)).toEqual([{ seas: 12 }]);
    const seasArea = fc.features[0].geometry;
    expect(inside(seasArea, -59, 20 - 250 / 110.57)).toBe(true);
    expect(inside(seasArea, -59, 20 - 350 / 110.57)).toBe(false);
  });

  it('is nothing without radii', () => {
    expect(buildFootprint(pts, pts.map(() => null), union)).toBeNull();
  });
});
