// How scripts/build-data.mjs packs each storm's track and wind radii into tracks/<decade>.json and radii/<decade>.json,
// for src/data/storms.ts (unpack, radiiOf) to read back. Each storm is a list of columns (one value per report in
// each), with values that change little from report to report stored as the change from the one before, in whole
// numbers: about half the size of the plain numbers, even compressed, and nothing lost. Trailing columns that are
// all zero are left out (a storm with no regional class, or no 64 kt winds), and read back as zeros.
// tests/encode.test.ts checks the round trip.

/** Leaves out the columns at the end that hold nothing but zeros (or nulls) */
function trim(cols) {
  while (cols.length && cols[cols.length - 1].every((v) => !v)) cols.pop();
  return cols;
}

/** Each value as the change from the one before (the first as it is) */
function changes(values) {
  let before = 0;
  return values.map((v) => {
    const d = v - before;
    before = v;
    return d;
  });
}

/**
 * A track, from its reports ({ hours after start, lat, lon, wind, pres, cat, regional, regionalWind }, wind and
 * pressure null where unknown), as 8 columns:
 *   0 time       tenths of an hour since the report before (the first: since the start, so 0)
 *   1 latitude   tenths of a degree, change from the report before
 *   2 longitude  the same (longitudes run on past ±180 along the track, as the site keeps them)
 *   3 wind       kt, 0 where unknown
 *   4 pressure   mb, change from the last report that had one; null where unknown
 *   5 category, 6 regional class, 7 regional wind (kt, 0 for none)
 */
export function encodeTrack(points) {
  let lastPres = 0;
  return trim([
    changes(points.map((p) => Math.round(p.hours * 10))),
    changes(points.map((p) => Math.round(p.lat * 10))),
    changes(points.map((p) => Math.round(p.lon * 10))),
    points.map((p) => p.wind ?? 0),
    points.map((p) => {
      if (p.pres === null || p.pres === undefined) return null;
      const d = p.pres - lastPres;
      lastPres = p.pres;
      return d;
    }),
    points.map((p) => p.cat),
    points.map((p) => p.regional ?? 0),
    points.map((p) => p.regionalWind ?? 0),
  ]);
}

/**
 * A storm's radii, from its reports that have them ([point index, 12 radii in nautical miles] each), as 13 columns:
 * the point index, then 34 kt NE, SE, SW, NW, 50 kt…, 64 kt…, each as the change from the report before
 */
export function encodeRadii(entries) {
  return trim(Array.from({ length: 13 }, (_, k) => changes(entries.map((e) => (k === 0 ? e[0] : e[1][k - 1])))));
}
