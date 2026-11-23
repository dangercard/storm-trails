// How scripts/build-data.mjs reads each IBTrACS report: its Saffir-Simpson category, how far its winds reached, and
// the regional agency's class. Kept apart from the build so tests (tests/classify.test.ts) can check them on rows made
// up for the purpose. Each takes `get`, which gives a column of the report (as text) by its name in IBTrACS's header.

/** Category codes, shared with src/data/categories.ts */
export const CAT = { unknown: -9, disturbance: -3, postTropical: -4, subtropical: -2, depression: -1, storm: 0 };

/** A number from a CSV cell, or null for a blank or anything not a number */
export const num = (s) => {
  const t = s.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};

/** Saffir-Simpson from a 1-minute wind in knots */
export function catFromWind(kt) {
  if (kt >= 137) return 5;
  if (kt >= 113) return 4;
  if (kt >= 96) return 3;
  if (kt >= 83) return 2;
  if (kt >= 64) return 1;
  if (kt >= 34) return CAT.storm;
  return CAT.depression;
}

/**
 * A report's category: the Saffir-Simpson category IBTrACS gives (USA_SSHS); else its stage where it isn't tropical
 * (subtropical, post-tropical, a disturbance); else from its wind (the US agencies', else the WMO agency's)
 */
export function categoryOf(get) {
  const wind = num(get('USA_WIND')) ?? num(get('WMO_WIND'));
  const sshs = num(get('USA_SSHS'));
  const nature = get('NATURE');
  if (sshs !== null && sshs >= -1) return sshs;
  if (sshs === -2) return CAT.subtropical;
  if (sshs === -4 || nature === 'ET') return CAT.postTropical;
  if (sshs === -3 || nature === 'DS') return CAT.disturbance;
  if (wind !== null) return catFromWind(wind);
  return CAT.unknown;
}

/**
 * How far out 34, 50 and 64 kt winds reached in each quarter round the centre (NE, SE, SW, NW), in nautical miles:
 * 12 numbers, or null where no agency estimated it. From the US agencies (NHC, CPHC, JTWC), else Météo-France La
 * Réunion, else Australia's Bureau of Meteorology: one agency's set per report, not mixed. A 0 is "none that strong in
 * that quarter"; a blank among filled quarters is taken as 0 (it happens on 111 of some 90,000 US reports).
 */
const RADII_FROM = ['USA', 'REUNION', 'BOM'];
const QUARTERS = ['NE', 'SE', 'SW', 'NW'];
export function radiiOf(get) {
  for (const agency of RADII_FROM) {
    const r34 = QUARTERS.map((q) => num(get(`${agency}_R34_${q}`)));
    if (r34.every((v) => v === null)) continue;
    const rest = (kt) => QUARTERS.map((q) => num(get(`${agency}_R${kt}_${q}`)) ?? 0);
    return [...r34.map((v) => v ?? 0), ...rest(50), ...rest(64)];
  }
  return null;
}

/**
 * How far seas of 12 feet (3.7 m) or more reached in each quarter round the centre (NE, SE, SW, NW), in nautical
 * miles, or null where there's no estimate. Only the US agencies give it, in the North Atlantic and East Pacific, from
 * about 2004; a blank among filled quarters is taken as 0, as for the wind radii. Any other wave height is ignored
 * (IBTrACS has only 12 ft).
 */
export function seasOf(get) {
  const height = get('USA_SEAHGT').trim();
  if (height && height !== '12') return null;
  const r = QUARTERS.map((q) => num(get(`USA_SEARAD_${q}`)));
  if (r.every((v) => v === null)) return null;
  return r.map((v) => v ?? 0);
}

/**
 * The class the region's official agency (the WMO's regional centre or warning centre, IBTrACS's WMO_AGENCY) gives a
 * report on its own scale, alongside Saffir-Simpson: { code: agency * 10 + class, wind: that agency's wind in kt }, or
 * null where there's none (the North Atlantic and East Pacific, whose official scale is Saffir-Simpson itself; the
 * South Atlantic, with no regional centre; before the agency kept records; not tropical by the agency's own reading).
 * The agencies and classes are listed in src/data/categories.ts (REGIONAL), which must match.
 *
 * The class comes from the agency's own wind (10-minute, IMD's 3-minute) on today's thresholds for its scale, as
 * Saffir-Simpson is applied to old storms: the grades the agencies recorded don't always agree with their own winds
 * (IMD's older "severe cyclonic storm" runs up to 115 kt, from before it had higher grades). JMA's grades are kept as
 * recorded, with wind only to split typhoons into JMA's three strengths. Without a wind, the grade where there is one.
 */
export const AGENCY = { tokyo: 1, newdelhi: 2, reunion: 3, bom: 4, nadi: 5, wellington: 6 };
/** The wind (kt) each class above the first starts at: class = 1 + how many of these the wind reaches */
const STARTS = {
  newdelhi: [28, 34, 48, 64, 90, 120], // depression, deep depression, cyclonic storm, severe, very severe, extremely severe, super
  reunion: [28, 34, 48, 64, 90, 116], // disturbance, depression, moderate storm, severe storm, cyclone, intense, very intense
  australian: [34, 48, 64, 86, 108], // tropical low, categories 1–5 (BoM, and Fiji and New Zealand)
};
const classOf = (kt, starts) => 1 + starts.filter((s) => kt >= s).length;
const IMD_GRADE = { D: 1, DD: 2, CS: 3, SCS: 4, 'SCS(H)': 5, VSCS: 5, ESCS: 6, SuCS: 7, SUCS: 7 };

export function regionalOf(get) {
  const agency = get('WMO_AGENCY').trim();
  const at = (col) => get(col).trim();
  let cls = null;
  let wind = null;
  if (agency === 'tokyo') {
    // 2 depression, 3 tropical storm, 4 severe tropical storm, 5 typhoon (then 6 extratropical, 9 "storm or stronger")
    const grade = num(at('TOKYO_GRADE'));
    wind = num(at('TOKYO_WIND'));
    if (grade >= 2 && grade <= 5) cls = grade === 5 && wind !== null ? classOf(wind, [0, 0, 0, 85, 105]) : grade - 1;
  } else if (agency === 'newdelhi') {
    wind = num(at('NEWDELHI_WIND'));
    const grade = IMD_GRADE[at('NEWDELHI_GRADE')];
    if (grade) cls = wind !== null && wind >= 17 ? classOf(wind, STARTS.newdelhi) : grade;
  } else if (agency === 'reunion') {
    // Types 1–4 are tropical (disturbance, depression, 34–63 kt, 64 kt+); then extratropical, dissipating, subtropical…
    const type = num(at('REUNION_TYPE'));
    wind = num(at('REUNION_WIND'));
    if (type >= 1 && type <= 4) cls = wind !== null ? classOf(wind, STARTS.reunion) : type === 1 ? 1 : null;
  } else if (agency === 'bom') {
    // Types 10–40 are tropical; 50s extratropical, 60 dissipating, 70s subtropical, 80s over land
    const type = num(at('BOM_TYPE'));
    wind = num(at('BOM_WIND'));
    if (type >= 10 && type < 50 && wind !== null) cls = classOf(wind, STARTS.australian);
  } else if (agency === 'nadi' || agency === 'wellington') {
    wind = num(at(agency === 'nadi' ? 'NADI_WIND' : 'WELLINGTON_WIND'));
    if (get('NATURE') === 'TS' && wind !== null) cls = classOf(wind, STARTS.australian);
  }
  return cls === null ? null : { code: AGENCY[agency] * 10 + cls, wind };
}
