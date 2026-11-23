/**
 * Sea temperature under a storm (scripts/sst.mjs): which boxes of OISST the fetch asks for, and the temperature the
 * build reads from them, on boxes made up by hand. ERDDAP's copy of OISST lacks some days, so a box records the days
 * it holds.
 */
import { describe, expect, it } from 'vitest';
import { boxesFor, sstAt } from '../scripts/sst.mjs';

/** Hour t of a report whose "day before" is this day (days since 1970) */
const reportOn = (dayBefore: number) => (dayBefore + 1) * 24 + 12;

/** A 1 × 1 box at 20.125°N 130.125°E with one value a day: 28.0, 28.1, … °C in the order of the days */
const box = (days: number[] | null, nt = days?.length ?? 0) => ({
  boxes: [
    {
      grid: 'pm180',
      day0: days?.[0] ?? 100,
      nt,
      lat0: 20.125,
      nlat: 1,
      lon0: 130.125,
      nlon: 1,
      ...(days ? { days } : {}),
      v: Array.from({ length: days?.length ?? nt }, (_, k) => 280 + k),
    },
  ],
});

describe('the sea temperature at a report', () => {
  it('reads the day before the report, by its date among the days the box holds', () => {
    const file = box([100, 101, 105, 106]);
    expect(sstAt(file, 20.1, 130.1, reportOn(105))).toBe(28.2);
    expect(sstAt(file, 20.1, 130.1, reportOn(106))).toBe(28.3);
  });

  it('uses the latest day within a week before when the day itself is missing, and nothing older', () => {
    const file = box([100, 101, 110]);
    expect(sstAt(file, 20.1, 130.1, reportOn(104))).toBe(28.1); // day 101
    expect(sstAt(file, 20.1, 130.1, reportOn(108))).toBe(28.1); // 7 days back
    expect(sstAt(file, 20.1, 130.1, reportOn(109))).toBeNull(); // 8 days back
  });

  it('reads a box saved without its days as one day each from the first', () => {
    const file = box(null, 3);
    expect(sstAt(file, 20.1, 130.1, reportOn(102))).toBe(28.2);
    expect(sstAt(file, 20.1, 130.1, reportOn(103))).toBe(28.2); // a day past the box: the day before it
  });

  it('gives none over land, rather than an older day’s', () => {
    const file = box([100, 101]);
    file.boxes[0].v[1] = -999; // OISST's land fill, in tenths
    expect(sstAt(file, 20.1, 130.1, reportOn(101))).toBeNull();
  });

  it('gives none outside the box', () => {
    expect(sstAt(box([100]), 25, 130.1, reportOn(100))).toBeNull();
  });
});

describe('the boxes to fetch', () => {
  it('stop at the last grid point fetched (179.625°E), short of the date line', () => {
    const track = [0, 6, 12].map((h, i) => ({ t: reportOn(100) + h, lat: 10, lon: 178.5 + i * 0.4 }));
    const [b] = boxesFor(track, 0, 1000);
    expect(b.grid).toBe('pm180');
    expect(b.lon0 + (b.nlon - 1) * 0.5).toBe(179.625);
  });

  it('cover the days OISST has, and nothing past them', () => {
    const track = [0, 24, 48, 72].map((h) => ({ t: reportOn(100) + h, lat: 10, lon: 130 }));
    const [b] = boxesFor(track, 0, 101);
    expect([b.day0, b.nt]).toEqual([100, 2]);
  });
});
