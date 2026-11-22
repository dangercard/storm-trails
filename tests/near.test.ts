/**
 * "Near" and "winds reached" (src/data/near.ts) on made-up tracks round a point and a square country, where the
 * answers can be worked out by hand: 1° of latitude is 110.57 km in the site's reckoning.
 */
import { describe, expect, it } from 'vitest';
import { extentAt, formatLatLon, nearMeasure, type Near } from '../src/data/near';
import type { Radii, TrackPoint } from '../src/data/storms';

const KM_LAT = 110.57;

/** A report at hour t */
const pt = (t: number, lat: number, lon: number, wind: number | null = 60, cat = 0): TrackPoint => ({
  t, lat, lon, wind, pres: null, cat, regional: 0, regionalWind: null,
});
/** A track along a line of latitude, a report every 6 hours */
const along = (lat: number, lons: number[], wind: number | null = 60, cat = 0) => lons.map((lon, i) => pt(i * 6, lat, lon, wind, cat));
/** Radii (km) with these 34, 50 and 64 kt extents in each quarter [NE, SE, SW, NW] */
const radii = (r34: number[], r50 = [0, 0, 0, 0], r64 = [0, 0, 0, 0]): Radii => [...r34, ...r50, ...r64];
const all = (r: number) => [r, r, r, r];

const point = (lat: number, lon: number): Near => ({ kind: 'point', name: 'here', lat, lon });
const measureAt = (lat: number, lon: number, km: number) => nearMeasure(point(lat, lon), km, null)!;

describe('near a point', () => {
  it('measures to the line between reports, not just the reports', () => {
    // Reports 5° (550 km) either side; the line passes 0.5° (55 km) north
    const track = along(0.5, [-5, 5]);
    const m = measureAt(0, 0, 100);
    expect(m.test(track)).toBe(true);
    const c = m.closest(track)!;
    expect(c.km).toBeCloseTo(0.5 * KM_LAT, 0);
    expect(c.lon).toBeCloseTo(0, 5);
    expect(c.t).toBeCloseTo(3, 5);
  });

  it('leaves out a track that stays farther than the distance', () => {
    const track = along(2, [-5, 0, 5]); // 221 km north
    expect(measureAt(0, 0, 200).test(track)).toBe(false);
    expect(measureAt(0, 0, 250).test(track)).toBe(true);
  });

  it('blends the wind between the reports either side, and takes the nearer report’s category', () => {
    const track = [pt(0, 0.3, -1, 40, 0), pt(6, 0.3, 1, 60, 0), pt(12, 0.3, 3, 90, 1)];
    const c = measureAt(0, 0, 100).closest(track)!;
    expect(c.wind).toBe(50);
    expect(c.cat).toBe(0);
    const later = measureAt(0, 2.6, 100).closest(track)!;
    expect(later.cat).toBe(1);
  });

  it('works across the date line (tracks run on past 180°)', () => {
    const track = along(0.2, [178, 180, 182]);
    const c = measureAt(0, -179.5, 100).closest(track)!; // -179.5 is 180.5 on the track's reckoning
    expect(c.km).toBeCloseTo(0.2 * KM_LAT, 0);
    expect(measureAt(0, -179.5, 50).test(track)).toBe(true);
  });

  it('doesn’t count a track crossing the meridian opposite the place as passing over it', () => {
    const track = along(0, [170, 179, 181, 190]);
    expect(measureAt(0, 0, 400).test(track)).toBe(false);
    expect(measureAt(0, 0, 400).closest(track)!.km).toBeGreaterThan(10_000);
  });
});

describe('the extent of winds by bearing (as NHC draws its swaths)', () => {
  // 34 kt: NE 200, SE 100, SW 0, NW 300
  const r = radii([200, 100, 0, 300]);
  it('holds each quarter’s estimate at the middle of the quarter', () => {
    expect(extentAt(r, 0, 45)).toBeCloseTo(200);
    expect(extentAt(r, 0, 135)).toBeCloseTo(100);
    expect(extentAt(r, 0, 225)).toBeCloseTo(0);
    expect(extentAt(r, 0, 315)).toBeCloseTo(300);
  });
  it('blends in a straight line between quarters’ middles, all the way round', () => {
    expect(extentAt(r, 0, 90)).toBeCloseTo(150); // east: NE and SE
    expect(extentAt(r, 0, 0)).toBeCloseTo(250); // north: NW and NE
    expect(extentAt(r, 0, 360)).toBeCloseTo(250);
    expect(extentAt(r, 0, -45)).toBeCloseTo(300);
    expect(extentAt(r, 0, 67.5)).toBeCloseTo(175);
    expect(extentAt(r, 0, 270)).toBeCloseTo(150); // west: SW and NW
  });
  it('reads the 50 and 64 kt estimates from their place in the radii', () => {
    const all3 = radii(all(300), [80, 80, 80, 80], [10, 20, 30, 40]);
    expect(extentAt(all3, 4, 10)).toBeCloseTo(80);
    expect(extentAt(all3, 8, 180)).toBeCloseTo(25);
  });
});

describe('winds that reached a point', () => {
  // The centre passes 1° (111 km) north of the place: the place is in the southern quarters
  const north = (r: Radii | null, wind: number | null = 60, cat = 0) => {
    const track = along(1, [-3, -1, 1, 3], wind, cat);
    return { track, r: track.map(() => r) };
  };
  const m = measureAt(0, 0, 100);

  it('counts winds whose extent in that quarter reaches the place', () => {
    const { track, r } = north(radii([0, 150, 150, 0]));
    expect(m.reach(track, r)).toBe(34);
  });

  it('looks only at the place’s side of the storm', () => {
    const { track, r } = north(radii([300, 0, 0, 300]));
    expect(m.reach(track, r)).toBe(0);
  });

  it('blends quarters’ estimates towards where they meet, rather than taking either one all the way across', () => {
    // One report, 111 km due north of the place: due south of the centre is between SE and SW (0), so half SE's
    // estimate reaches there
    const once = (se: number) => m.reach([pt(0, 1, 0)], [radii([0, se, 0, 0])]);
    expect(once(200)).toBe(0); // 100 km
    expect(once(240)).toBe(34); // 120 km
  });

  it('gives the strongest winds that reached', () => {
    const { track, r } = north(radii(all(300), all(200), all(120)));
    expect(m.reach(track, r)).toBe(64);
    const fifty = north(radii(all(300), all(130), all(60)));
    expect(m.reach(fifty.track, fifty.r)).toBe(50);
  });

  it('is unknown when there are no estimates and the storm came near enough', () => {
    const { track } = north(null, 60);
    expect(m.reach(track, null)).toBeNull();
    expect(m.reach(track, track.map(() => null))).toBeNull();
  });

  it('is none, not unknown, for reports too weak to have 34 kt winds', () => {
    expect(m.reach(...Object.values(north(null, 30)) as [TrackPoint[], null])).toBe(0);
    // A depression with no wind recorded (JMA gives none for depressions)
    expect(m.reach(north(null, null, -1).track, null)).toBe(0);
  });

  it('is none for a storm with no estimates that stayed beyond what storms its strength reach', () => {
    // A 45 kt storm's 34 kt winds reach at most ~560 km; this one passes 10° (1,100 km) away
    const far = along(10, [-3, 0, 3], 45);
    expect(m.reach(far, null)).toBe(0);
  });

  it('judges a gap in the estimates by how wide this storm’s winds were elsewhere', () => {
    // Estimates of 200 km at the ends, none in the middle stretch near the place
    const at = (lat: number) => {
      const track = along(lat, [-20, -10, 0, 10, 20]);
      const r = [radii(all(200)), radii(all(200)), null, radii(all(200)), radii(all(200))];
      return measureAt(0, 0, 100).reach(track, r);
    };
    // 1.25 × 200 = 250 km: a gap passing 220 km away might have reached; 300 km away, it couldn't have
    expect(at(220 / KM_LAT)).toBeNull();
    expect(at(300 / KM_LAT)).toBe(0);
  });
});

describe('near a country', () => {
  // A 1° square: 0–1°E, 0–1°N
  const square: GeoJSON.FeatureCollection = {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: { name: 'Squareland' },
        geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]] },
      },
    ],
  };
  const country = (km: number) => nearMeasure({ kind: 'country', name: 'Squareland' }, km, square)!;
  // Distances to a country are on a 0.1° grid: within about a cell (11 km), and up to 8% long
  const close = (km: number, expected: number) => {
    expect(km).toBeGreaterThan(expected - 12);
    expect(km).toBeLessThan(expected * 1.09 + 12);
  };

  it('is 0 km for a track over the country', () => {
    const track = along(0.5, [-2, 0.5, 3]);
    expect(country(50).test(track)).toBe(true);
    expect(country(50).closest(track)!.km).toBe(0);
  });

  it('measures to the coast', () => {
    const track = along(1.3, [-2, 0.5, 3]); // 0.3° (33 km) north of it
    expect(country(50).test(track)).toBe(true);
    close(country(50).closest(track)!.km, 0.3 * KM_LAT);
    expect(country(25).test(track)).toBe(false);
  });

  it('leaves out a track that stays farther away', () => {
    expect(country(50).test(along(2, [-2, 0.5, 3]))).toBe(false); // 110 km north
  });

  it('counts winds that reach its coast from offshore, by quarter', () => {
    // 55 km north: the country is to the south. A new track each time: the site remembers each track's answer
    // (a track's radii never change once loaded), so the same track with other radii would get the first answer
    const offshore = (r: Radii) => {
      const track = along(1.5, [-2, 0.5, 3]);
      return country(50).reach(track, track.map(() => r));
    };
    expect(offshore(radii([0, 80, 80, 0]))).toBe(34);
    expect(offshore(radii([300, 0, 0, 300]))).toBe(0);
  });

  it('counts the strongest winds the storm had when its centre was over the country', () => {
    const track = along(0.5, [-2, 0.5, 3]);
    expect(country(50).reach(track, track.map(() => radii(all(150), all(60), all(20))))).toBe(64);
  });

  it('is nothing near a country it doesn’t know (an old or mistyped name in a link), rather than failing', () => {
    const m = nearMeasure({ kind: 'country', name: 'Narnia' }, 100, square)!;
    const track = along(0.5, [-2, 0.5, 3]);
    expect(m.test(track)).toBe(false);
    expect(m.closest(track)).toBeNull();
    expect(m.reach(track, null)).toBe(0);
  });

  it('waits for the country shapes', () => {
    expect(nearMeasure({ kind: 'country', name: 'Squareland' }, 100, null)).toBeNull();
  });
});

describe('coordinates', () => {
  it('reads as degrees north/south and east/west, wrapping longitudes past 180°', () => {
    expect(formatLatLon(25.8, -80.2)).toBe('25.8°N, 80.2°W');
    expect(formatLatLon(-12.3, 190)).toBe('12.3°S, 170.0°W');
  });
});
