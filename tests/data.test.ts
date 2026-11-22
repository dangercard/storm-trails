/**
 * The files in public/data as built, read through the site's own loaders (tests/files.ts serves them from disk):
 * that they hang together, and that well-known storms come out as the agencies and the record have them. When the
 * data is rebuilt from a newer IBTrACS, these should still pass; a failure means the build or the data changed in a
 * way worth looking at.
 */
import './files';
import { beforeAll, describe, expect, it } from 'vitest';
import { regional } from '../src/data/categories';
import { nearMeasure, loadPlaces, type Near, type Reach } from '../src/data/near';
import { reportRows, windsReached } from '../src/data/report';
import {
  decadeOf,
  loadCountries,
  loadDecade,
  loadIndex,
  loadRadii,
  radiiOf,
  unpack,
  type RadiiFile,
  type Storm,
  type TrackPoint,
} from '../src/data/storms';
import { countryName, setLanguage } from '../src/i18n';

let storms: Storm[];
let decades: number[];
let countries: GeoJSON.FeatureCollection;

beforeAll(async () => {
  const index = await loadIndex();
  storms = index.storms;
  decades = index.decades;
  countries = await loadCountries();
});

/** A storm by name and season (names as IBTrACS has them, in capitals) */
const find = (name: string, season: number) => {
  const s = storms.find((x) => x.name === name && x.season === season);
  if (!s) throw new Error(`${name} ${season} isn't in storms.json`);
  return s;
};
const track = async (s: Storm) => unpack(s, (await loadDecade(decadeOf(s)))[s.id]);
const radiiFor = async (s: Storm, pts: TrackPoint[]) => radiiOf(pts, await loadRadii(decadeOf(s)), s.id);

describe('the index', () => {
  it('lists each storm once, in order of start, ending after it starts', () => {
    expect(storms.length).toBeGreaterThan(13_000);
    expect(new Set(storms.map((s) => s.id)).size).toBe(storms.length);
    for (let i = 1; i < storms.length; i++) expect(storms[i].start).toBeGreaterThanOrEqual(storms[i - 1].start);
    for (const s of storms) expect(s.end, s.id).toBeGreaterThanOrEqual(s.start);
  });

  it('uses only known categories, basins and regional classes', () => {
    const cats = new Set([-9, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5]);
    const basins = new Set(['NA', 'EP', 'WP', 'NI', 'SI', 'SP', 'SA']);
    for (const s of storms) {
      expect(cats.has(s.peakCat), s.id).toBe(true);
      for (const b of s.basins) expect(basins.has(b), `${s.id} ${b}`).toBe(true);
      for (const [b] of s.moves ?? []) expect(s.basins.includes(b), `${s.id} moved to ${b}`).toBe(true);
      if (s.regional) expect(regional(s.regional), `${s.id} ${s.regional}`).not.toBeNull();
    }
  });

  it('names only countries there are shapes for', () => {
    const names = new Set(countries.features.map((f) => f.properties!.name));
    for (const s of storms) for (const c of [...(s.landfalls ?? []), ...(s.crossed ?? [])]) expect(names.has(c), `${s.id}: ${c}`).toBe(true);
    // A country is either where it made landfall or where it crossed over land, never both
    for (const s of storms) for (const c of s.crossed ?? []) expect(s.landfalls ?? [], `${s.id}: ${c}`).not.toContain(c);
  });

  it('has a track file for every decade', () => {
    expect(decades).toEqual([...new Set(storms.map(decadeOf))].sort((a, b) => a - b));
  });
});

describe('the tracks', () => {
  it('has every storm’s track, its reports between its start and end, in order', async () => {
    for (const d of [1850, 1990, 2020]) {
      const file = await loadDecade(d);
      for (const s of storms.filter((x) => decadeOf(x) === d)) {
        expect(file[s.id], s.id).toBeDefined();
        // Columns of one value per report each (up to 8; those left off the end are empty)
        expect(file[s.id].length, s.id).toBeLessThanOrEqual(8);
        expect(new Set(file[s.id].map((c) => c.length)).size, s.id).toBe(1);
        const pts = unpack(s, file[s.id]);
        expect(pts[0].t).toBeCloseTo(s.start, 1);
        expect(pts[pts.length - 1].t).toBeCloseTo(s.end, 1);
        for (let i = 1; i < pts.length; i++) expect(pts[i].t, s.id).toBeGreaterThan(pts[i - 1].t);
      }
    }
  });

  it('peaks at the index’s peak wind and category', async () => {
    for (const s of [find('IRMA', 2017), find('HAIYAN', 2013), find('PATRICIA', 2015)]) {
      const pts = await track(s);
      expect(Math.max(...pts.map((p) => p.wind ?? 0)), s.name).toBe(s.peakWind);
      expect(Math.max(...pts.map((p) => p.cat)), s.name).toBe(s.peakCat);
    }
  });

  it('lines radii up with the track: none before about 2000, most reports of a recent storm', async () => {
    const ian = find('IAN', 2022);
    const r = (await radiiFor(ian, await track(ian)))!;
    expect(r.filter(Boolean).length / r.length).toBeGreaterThan(0.7);
    const andrew = find('ANDREW', 1992);
    expect(await radiiFor(andrew, await track(andrew))).toBeNull();
  });
});

describe('well-known storms, as the record has them', () => {
  it.each([
    ['KATRINA', 2005, 5, 150, ['Bahamas', 'United States']],
    ['IRMA', 2017, 5, 155, ['Cuba', 'United States']],
    ['MARIA', 2017, 5, 150, ['Dominica', 'Puerto Rico']],
    ['ANDREW', 1992, 5, 150, ['Bahamas', 'United States']],
    ['HAIYAN', 2013, 5, 170, ['Philippines']],
  ] as const)('%s %i: category %i, %i kt, landfall in %j', (name, season, cat, wind, hit) => {
    const s = find(name, season);
    expect(s.peakCat).toBe(cat);
    expect(s.peakWind).toBe(wind);
    expect(s.landfalls).toEqual(expect.arrayContaining([...hit]));
  });

  // Countries reached over land from a neighbour, rather than from the sea, are listed as crossed
  it.each([
    ['GEORGES', 1998, 'Dominican Republic', ['Haiti']],
    ['LAURA', 2020, 'Dominican Republic', ['Haiti']],
    ['FRED', 2021, 'Dominican Republic', ['Haiti']],
    ['IDAI', 2019, 'Mozambique', ['Malawi', 'Zimbabwe']],
    ['FREDDY', 2023, 'Mozambique', ['Zimbabwe', 'Malawi']],
    ['HAIYAN', 2013, 'Vietnam', ['China']],
  ] as const)('%s %i: landfall in %s, then crossed %j', (name, season, landfall, crossed) => {
    const s = find(name, season);
    expect(s.landfalls).toContain(landfall);
    expect(s.crossed).toEqual([...crossed]);
  });

  it('lists a country as landfall, not crossed, when the storm came ashore there from the sea (Matthew 2016 in Haiti)', () => {
    const s = find('MATTHEW', 2016);
    expect(s.landfalls).toContain('Haiti');
    expect(s.crossed).toBeUndefined();
  });

  // The regional agency's class at its peak, and its own wind, as each agency's record has them
  it.each([
    ['HAIYAN', 2013, 'Violent typhoon', 'JMA', 125],
    ['HAGIBIS', 2019, 'Violent typhoon', 'JMA', 105],
    ['TIP', 1979, 'Violent typhoon', 'JMA', 140],
    ['GONU', 2007, 'Super cyclonic storm', 'IMD', 127],
    ['AMPHAN', 2020, 'Super cyclonic storm', 'IMD', 130],
    ['FANI', 2019, 'Extremely severe cyclonic storm', 'IMD', 115],
    ['MOCHA', 2023, 'Extremely severe cyclonic storm', 'IMD', 115],
    ['IDAI', 2019, 'Intense tropical cyclone', 'Météo-France', 105],
    ['BATSIRAI', 2022, 'Intense tropical cyclone', 'Météo-France', 110],
    ['FREDDY', 2023, 'Very intense tropical cyclone', 'Météo-France', 125],
    ['YASI', 2011, 'Category 5 severe tropical cyclone', 'BoM', 110],
    ['WINSTON', 2016, 'Category 5 severe tropical cyclone', 'FMS', 150],
  ] as const)('%s %i: %s (%s), %i kt', (name, season, cls, agency, wind) => {
    const s = find(name, season);
    const r = regional(s.regional ?? 0);
    expect(r?.name).toBe(cls);
    expect(r?.agency.short).toBe(agency);
    expect(s.regionalWind).toBe(wind);
  });

  it('has no regional class where Saffir-Simpson is the official scale', () => {
    for (const [name, season] of [['KATRINA', 2005], ['PATRICIA', 2015], ['IRMA', 2017]] as const) {
      expect(find(name, season).regional, name).toBeUndefined();
    }
  });

  it('knows when a storm moved between basins', () => {
    const tip = find('TIP', 1979);
    expect(tip.basins).toEqual(['WP', 'EP']);
    expect(tip.moves?.[0][0]).toBe('EP');
    expect(find('KATRINA', 2005).moves).toBeUndefined();
  });
});

describe('winds that reached places, for well-known storms', () => {
  const point = (lat: number, lon: number): Near => ({ kind: 'point', name: 'here', lat, lon });
  const country = (name: string): Near => ({ kind: 'country', name });
  const reachAt = async (near: Near, name: string, season: number): Promise<Reach> => {
    const s = find(name, season);
    const pts = await track(s);
    return nearMeasure(near, 100, countries)!.reach(pts, await radiiFor(s, pts));
  };

  it.each([
    ['Fort Myers', point(26.64, -81.87), 'IAN', 2022, 64],
    ['Tacloban', point(11.24, 125.0), 'HAIYAN', 2013, 64],
    ['New Orleans', point(29.95, -90.07), 'KATRINA', 2005, 64],
    // NHC's own swath agrees: 50 kt reached New York; hurricane-force winds stayed south and east of it
    ['New York', point(40.71, -74.0), 'SANDY', 2012, 50],
    ['Jamaica', country('Jamaica'), 'MELISSA', 2025, 64],
    ['the United States', country('United States'), 'IAN', 2022, 64],
    ['Japan', country('Japan'), 'HAGIBIS', 2019, 64],
    ['Miami', point(25.79, -80.22), 'HAIYAN', 2013, 0],
    ['Iceland', country('Iceland'), 'IAN', 2022, 0],
  ] as const)('at %s, %s %i: %s kt', async (_, near, name, season, kt) => {
    expect(await reachAt(near, name, season)).toBe(kt);
  });

  it('Irma and Frances brought tropical-storm-force winds, not hurricane-force, to Miami', async () => {
    for (const [name, season] of [['IRMA', 2017], ['FRANCES', 2004]] as const) {
      const r = await reachAt(point(25.79, -80.22), name, season);
      expect([34, 50], name).toContain(r);
    }
  });

  it('has no estimate for a storm from before the estimates began (Andrew, 1992)', async () => {
    expect(await reachAt(point(25.79, -80.22), 'ANDREW', 1992)).toBeNull();
  });
});

describe('wind footprints', () => {
  it('builds for the storms whose shapes once broke the merging (Ophelia 2017, Kirk 2024)', async () => {
    const { default: polygonClipping } = await import('polygon-clipping');
    const { buildFootprint } = await import('../src/data/footprintShapes');
    for (const [name, season] of [['OPHELIA', 2017], ['KIRK', 2024]] as const) {
      const s = find(name, season);
      const pts = await track(s);
      const fc = buildFootprint(pts, (await radiiFor(s, pts))!, polygonClipping.union as never);
      expect(fc?.features.map((f) => f.properties!.kt), name).toEqual([34, 64]);
    }
  });
});

describe('a place report: Miami, within 50 km, 2004–2026, tropical storms and up', () => {
  it('counts 4 storms whose centre came within 50 km, but 18 whose tropical-storm-force winds reached it', async () => {
    const picked = storms.filter((s) => s.season >= 2004 && s.season <= 2026 && s.peakCat >= 0);
    const nearby = await Promise.all(picked.map(async (storm) => ({ storm, points: await track(storm) })));
    const measure = nearMeasure({ kind: 'point', name: 'Miami', lat: 25.788, lon: -80.224 }, 50, null)!;
    const within = nearby.filter((t) => measure.test(t.points));
    const files = new Map<number, RadiiFile>();
    for (const d of new Set(picked.map(decadeOf))) files.set(d, await loadRadii(d));
    const { listed } = reportRows(within, nearby, measure, (s, pts) => radiiOf(pts, files.get(decadeOf(s)), s.id));

    expect(within.length).toBe(4);
    expect(windsReached(listed, 64, 2004)).toBe(2);
    expect(windsReached(listed, 34, 2004)).toBe(18);
    expect(listed.length).toBe(19);
    // Listed most recent first
    for (let i = 1; i < listed.length; i++) expect(listed[i].closest.t).toBeLessThanOrEqual(listed[i - 1].closest.t);
  });
});

describe('names in Spanish', () => {
  it('has names only for countries and rows that exist', async () => {
    const { readFile } = await import('node:fs/promises');
    const es = JSON.parse(await readFile(new URL('../public/data/names/es.json', import.meta.url), 'utf8'));
    const places = await loadPlaces();
    const known = new Set([...countries.features.map((f) => f.properties!.name), ...places.map((p) => p.country)]);
    for (const c of Object.keys(es.countries)) expect(known.has(c), c).toBe(true);
    for (const row of Object.keys(es.places)) expect(Number(row)).toBeLessThan(places.length);
  });

  it('loads with the language, and English comes back unchanged', async () => {
    await setLanguage('es', false);
    expect(countryName('Mexico')).toBe('México');
    expect(countryName('Cuba')).toBe('Cuba');
    expect(countryName('Spratly Islands')).toBe('Islas Spratly');
    await setLanguage('en', false);
    expect(countryName('Mexico')).toBe('Mexico');
  });
});
