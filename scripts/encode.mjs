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

/** Each known value as the change from the last known one (the first as it is); null where unknown */
function knownChanges(values) {
  let before = 0;
  return values.map((v) => {
    if (v === null || v === undefined) return null;
    const d = v - before;
    before = v;
    return d;
  });
}

/**
 * A track, from its reports ({ hours after start, lat, lon, wind, pres, cat, regional, regionalWind, sst }, wind,
 * pressure and sea temperature null where unknown), as 9 columns:
 *   0 time       tenths of an hour since the report before (the first: since the start, so 0)
 *   1 latitude   tenths of a degree, change from the report before
 *   2 longitude  the same (longitudes run on past ±180 along the track, as the site keeps them)
 *   3 wind       kt, 0 where unknown
 *   4 pressure   mb, change from the last report that had one; null where unknown
 *   5 category, 6 regional class, 7 regional wind (kt, 0 for none)
 *   8 sea temperature under it  tenths of a °C, change from the last report that had one; null where unknown
 */
export function encodeTrack(points) {
  return trim([
    changes(points.map((p) => Math.round(p.hours * 10))),
    changes(points.map((p) => Math.round(p.lat * 10))),
    changes(points.map((p) => Math.round(p.lon * 10))),
    points.map((p) => p.wind ?? 0),
    knownChanges(points.map((p) => p.pres)),
    points.map((p) => p.cat),
    points.map((p) => p.regional ?? 0),
    points.map((p) => p.regionalWind ?? 0),
    knownChanges(points.map((p) => (p.sst === null || p.sst === undefined ? null : Math.round(p.sst * 10)))),
  ]);
}

/**
 * A storm's radii, from its reports that have them ([point index, radii in nautical miles] each: 12 for the winds,
 * 34 kt NE, SE, SW, NW, 50 kt…, 64 kt…; 4 for the seas), as columns: the point index, then each radius, each as the
 * change from the report before
 */
export function encodeRadii(entries) {
  const n = entries[0][1].length;
  return trim(Array.from({ length: n + 1 }, (_, k) => changes(entries.map((e) => (k === 0 ? e[0] : e[1][k - 1])))));
}
