// The sea surface temperature under a storm: which boxes of OISST to fetch for its track (scripts/fetch-sst.mjs), and
// the temperature at a report from them (scripts/build-data.mjs). OISST's grid points sit at x.125, x.375, x.625 and
// x.875 degrees; every other one is fetched (0.5°), on the x.125 and x.625 points (so the last ones east and north are
// 179.625 or 359.625 and 89.625).

export const SST_OUT = 'data/raw/sst';
/** Days in one box: a stretch of track this long, so a long-lived storm doesn't make one huge box */
const DAYS_PER_BOX = 6;
const STEP = 0.5;

/** The day (days since 1970) whose water a report at hour t is given: the day before, ahead of the storm's cold wake */
export const dayBefore = (t) => Math.floor(t / 24) - 1;

const wrapPM = (lon) => ((((lon + 180) % 360) + 360) % 360) - 180;
const wrap360 = (lon) => ((lon % 360) + 360) % 360;
/** A grid point at or below x (on the 0.5° subset, from x.125) */
const below = (x) => Math.floor((x - 0.125) / STEP) * STEP + 0.125;
const above = (x) => Math.ceil((x - 0.125) / STEP) * STEP + 0.125;

/**
 * The boxes to fetch for a track: each stretch of up to DAYS_PER_BOX days, 1° round the reports in it, from the day
 * before each, within the days OISST covers. Longitudes on -180…180 ("pm180") or, for a track across the date line,
 * 0…360 ("0360"), whichever keeps it in one piece.
 */
export function boxesFor(points, firstDay, lastDay) {
  const span = (wrap) => {
    const ls = points.map((p) => wrap(p.lon));
    return Math.max(...ls) - Math.min(...ls);
  };
  const grid = span(wrapPM) <= span(wrap360) ? 'pm180' : '0360';
  const wrap = grid === 'pm180' ? wrapPM : wrap360;
  const [lonMin, lonMax] = grid === 'pm180' ? [-179.875, 179.625] : [0.125, 359.625];
  const boxes = [];
  let chunk = [];
  const flush = () => {
    const days = chunk.map((p) => dayBefore(p.t)).filter((d) => d >= firstDay && d <= lastDay);
    if (days.length) {
      const lats = chunk.map((p) => p.lat);
      const lons = chunk.map((p) => wrap(p.lon));
      const lat0 = Math.max(-89.875, below(Math.min(...lats) - 1));
      const lat1 = Math.min(89.625, above(Math.max(...lats) + 1));
      const lon0 = Math.max(lonMin, below(Math.min(...lons) - 1));
      const lon1 = Math.min(lonMax, above(Math.max(...lons) + 1));
      const day0 = Math.min(...days);
      boxes.push({
        grid,
        day0,
        nt: Math.max(...days) - day0 + 1,
        lat0,
        nlat: Math.round((lat1 - lat0) / STEP) + 1,
        lon0,
        nlon: Math.round((lon1 - lon0) / STEP) + 1,
      });
    }
    chunk = [];
  };
  for (const p of points) {
    if (chunk.length && dayBefore(p.t) - dayBefore(chunk[0].t) >= DAYS_PER_BOX) flush();
    chunk.push(p);
  }
  flush();
  return boxes;
}

/**
 * The sea temperature (°C, to 0.1) at a report: the nearest fetched grid point (within 0.25°), on the day before.
 * Null where there's none: over land or sea ice (OISST has no value there), or outside the boxes and days fetched.
 */
export function sstAt(file, lat, lon, t) {
  const day = dayBefore(t);
  for (const b of file?.boxes ?? []) {
    if (day < b.day0 || day >= b.day0 + b.nt) continue;
    const i = Math.round((lat - b.lat0) / STEP);
    const j = Math.round(((b.grid === 'pm180' ? wrapPM(lon) : wrap360(lon)) - b.lon0) / STEP);
    if (i < 0 || i >= b.nlat || j < 0 || j >= b.nlon) continue;
    const v = b.v[(day - b.day0) * b.nlat * b.nlon + i * b.nlon + j];
    // Land and ice: no value (OISST marks them -9.99; sea water is never colder than about -2 °C)
    return v === null || v === undefined || v < -50 ? null : v / 10;
  }
  return null;
}
