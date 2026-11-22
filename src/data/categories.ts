/**
 * Strength categories, with the codes scripts/build-data.mjs writes: the Saffir-Simpson categories 1–5, tropical
 * storm 0, tropical depression -1, and the non-tropical stages below that. Higher codes are stronger.
 */
export const CAT = {
  unknown: -9,
  postTropical: -4,
  disturbance: -3,
  subtropical: -2,
  depression: -1,
  storm: 0,
} as const;

import { i18n } from '../i18n';

/** A strength category: its code and colour (its name, in each language, is in src/i18n) */
export interface Category {
  code: number;
  color: string;
  /** The 1-minute wind (kt) it starts at, for the tropical ones */
  fromKt?: number;
}

/** Tropical, weakest first */
export const TROPICAL: Category[] = [
  { code: -1, color: '#5ebaff', fromKt: 0 },
  { code: 0, color: '#00faf4', fromKt: 34 },
  { code: 1, color: '#ffffcc', fromKt: 64 },
  { code: 2, color: '#ffe775', fromKt: 83 },
  { code: 3, color: '#ffc140', fromKt: 96 },
  { code: 4, color: '#ff8f20', fromKt: 113 },
  { code: 5, color: '#ff6060', fromKt: 137 },
];

export const OTHER: Category[] = [
  { code: -2, color: '#b9a3ff' },
  { code: -3, color: '#9aa5b8' },
  { code: -4, color: '#c3cad6' },
  { code: -9, color: '#7d8799' },
];

type CategoryCode = keyof ReturnType<typeof i18n>['m']['categories'];
const text = (code: number) => {
  const all = i18n().m.categories;
  return all[(code in all ? code : -9) as CategoryCode];
};
/** A category's name in the language showing: "Category 4" */
export const categoryLabel = (code: number) => text(code).label;
/** Its abbreviation, for the legend and the list: "TS", "4" */
export const categoryShort = (code: number) => text(code).short;

const ALL = [...TROPICAL, ...OTHER];
const byCode = new Map(ALL.map((c) => [c.code, c]));

export const category = (code: number): Category => byCode.get(code) ?? OTHER[OTHER.length - 1];

/** A MapLibre expression picking each line's colour from its `cat` property */
export const colorExpression = [
  'match',
  ['get', 'cat'],
  ...ALL.flatMap((c) => [c.code, c.color]),
  OTHER[OTHER.length - 1].color,
];

/** The basins, as IBTrACS codes them */
export const BASINS = ['NA', 'EP', 'WP', 'NI', 'SI', 'SP', 'SA'] as const;

/** A basin's name in the language showing (an unknown code as it is) */
export const basinName = (code: string) => i18n().m.basins[code as (typeof BASINS)[number]] ?? code;

export const kt = {
  mph: (k: number) => Math.round(k * 1.15078),
  kmh: (k: number) => Math.round(k * 1.852),
};

/**
 * The regional agencies whose classes are shown alongside Saffir-Simpson (scripts/build-data.mjs, regionalOf), by the
 * number the build gives each: a class code is agency * 10 + class, the classes counted from 1, weakest first (their
 * names, in each language, are in src/i18n). `minutes` is the averaging time of the agency's wind.
 */
export const REGIONAL = {
  1: { key: 'jma', minutes: 10 },
  2: { key: 'imd', minutes: 3 },
  3: { key: 'mfr', minutes: 10 },
  4: { key: 'bom', minutes: 10 },
  5: { key: 'fms', minutes: 10 },
  6: { key: 'nz', minutes: 10 },
} as const;
export type RegionalAgency = (typeof REGIONAL)[keyof typeof REGIONAL]['key'];

/** A regional class, in the language showing: its name, the agency's short and full names, its wind's averaging time */
export function regional(code: number) {
  const agency = REGIONAL[Math.floor(code / 10) as keyof typeof REGIONAL];
  if (!agency) return null;
  const { regional: text } = i18n().m;
  const name = text.classes[agency.key][(code % 10) - 1];
  if (!name) return null;
  return { name, agency: text.agencies[agency.key], minutes: agency.minutes };
}

/**
 * What a basin calls a storm of 64 kt and more: a hurricane (North Atlantic, East and Central Pacific), a typhoon
 * (West Pacific); elsewhere each agency's own words, which don't line up with Saffir-Simpson, so the site says
 * "category 1+" there.
 */
export type Term = 'hurricane' | 'typhoon' | 'other';
export const termOf = (basin: string): Term => (basin === 'NA' || basin === 'EP' ? 'hurricane' : basin === 'WP' ? 'typhoon' : 'other');
/** The term several basins share, or 'other' when they differ */
export function termOfAll(basins: Iterable<string>): Term {
  let term: Term | null = null;
  for (const b of basins) {
    const t = termOf(b);
    if (term && t !== term) return 'other';
    term = t;
  }
  return term ?? 'other';
}
