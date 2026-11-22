/**
 * The track and radii files: what the data build writes (scripts/encode.mjs) the site reads back exactly
 * (unpack and radiiOf in src/data/storms.ts)
 */
import { describe, expect, it } from 'vitest';
import { encodeRadii, encodeTrack } from '../scripts/encode.mjs';
import { radiiOf, unpack, type Storm } from '../src/data/storms';

const storm = { id: 'X', start: 400_000 } as Storm;

/** A made-up track: reports every 6 hours (some off-hour), with gaps in wind and pressure, crossing the date line */
function track(n: number, seed: number) {
  let x = seed;
  const rand = () => ((x = (x * 16807) % 2147483647) / 2147483647);
  let hours = 0;
  return Array.from({ length: n }, (_, i) => {
    if (i) hours += rand() < 0.1 ? Math.round(rand() * 50) / 10 : 6;
    return {
      hours,
      lat: Math.round((10 + i * 0.4 + rand() * 0.3) * 10) / 10,
      lon: Math.round((175 + i * 0.7 - rand() * 0.2) * 10) / 10,
      wind: rand() < 0.2 ? null : 20 + Math.round(rand() * 140),
      pres: rand() < 0.3 ? null : 880 + Math.round(rand() * 130),
      cat: Math.floor(rand() * 11) - 5,
      regional: rand() < 0.5 ? 0 : 11 + Math.floor(rand() * 6),
      regionalWind: rand() < 0.5 ? 0 : Math.round(rand() * 120),
    };
  });
}

describe('tracks', () => {
  it.each([1, 2, 40, 120])('come back exactly (%i reports)', (n) => {
    for (const seed of [1, 7, 99]) {
      const reports = track(n, seed);
      const pts = unpack(storm, encodeTrack(reports));
      expect(pts.length).toBe(n);
      pts.forEach((p, i) => {
        const r = reports[i];
        expect(p.t).toBeCloseTo(storm.start + r.hours, 9);
        expect([p.lat, p.lon]).toEqual([r.lat, r.lon]);
        expect(p.wind).toBe(r.wind || null);
        expect(p.pres).toBe(r.pres);
        expect([p.cat, p.regional, p.regionalWind]).toEqual([r.cat, r.regional, r.regionalWind || null]);
      });
    }
  });

  it('leaves off the columns at the end that hold nothing', () => {
    const plain = track(10, 3).map((r) => ({ ...r, pres: null, cat: 0, regional: 0, regionalWind: 0 }));
    expect(encodeTrack(plain).length).toBe(4);
    expect(unpack(storm, encodeTrack(plain)).every((p) => p.pres === null && p.cat === 0)).toBe(true);
  });
});

describe('radii', () => {
  it('come back exactly, lined up with their reports', () => {
    const entries: [number, number[]][] = [
      [2, [100, 90, 80, 70, 50, 40, 0, 0, 20, 0, 0, 0]],
      [3, [100, 90, 80, 70, 50, 40, 0, 0, 20, 0, 0, 0]],
      [7, [150, 120, 60, 90, 0, 0, 0, 0, 0, 0, 0, 0]],
    ];
    const pts = unpack(storm, encodeTrack(track(9, 5)));
    const r = radiiOf(pts, { X: encodeRadii(entries) }, 'X')!;
    expect(r.map((x, i) => (x ? i : -1)).filter((i) => i >= 0)).toEqual([2, 3, 7]);
    for (const [i, nmi] of entries) r[i]!.forEach((km, k) => expect(km).toBeCloseTo(nmi[k] * 1.852, 9));
  });

  it('leaves off 64 kt columns for a storm that never had 64 kt winds', () => {
    expect(encodeRadii([[0, [60, 60, 60, 60, 0, 0, 0, 0, 0, 0, 0, 0]]]).length).toBe(5);
  });
});
