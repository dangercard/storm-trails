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

export interface Category {
  code: number;
  label: string;
  short: string;
  color: string;
  /** The 1-minute wind (kt) it starts at, for the tropical ones */
  fromKt?: number;
}

/** Tropical, weakest first */
export const TROPICAL: Category[] = [
  { code: -1, label: 'Tropical depression', short: 'TD', color: '#5ebaff', fromKt: 0 },
  { code: 0, label: 'Tropical storm', short: 'TS', color: '#00faf4', fromKt: 34 },
  { code: 1, label: 'Category 1', short: '1', color: '#ffffcc', fromKt: 64 },
  { code: 2, label: 'Category 2', short: '2', color: '#ffe775', fromKt: 83 },
  { code: 3, label: 'Category 3', short: '3', color: '#ffc140', fromKt: 96 },
  { code: 4, label: 'Category 4', short: '4', color: '#ff8f20', fromKt: 113 },
  { code: 5, label: 'Category 5', short: '5', color: '#ff6060', fromKt: 137 },
];

export const OTHER: Category[] = [
  { code: -2, label: 'Subtropical', short: 'SS', color: '#b9a3ff' },
  { code: -3, label: 'Disturbance', short: 'DS', color: '#9aa5b8' },
  { code: -4, label: 'Post-tropical', short: 'PT', color: '#c3cad6' },
  { code: -9, label: 'Strength unknown', short: '?', color: '#7d8799' },
];

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

export const BASINS: Record<string, string> = {
  NA: 'North Atlantic',
  EP: 'Eastern Pacific',
  WP: 'Western Pacific',
  NI: 'North Indian',
  SI: 'South Indian',
  SP: 'South Pacific',
  SA: 'South Atlantic',
};

export const kt = {
  mph: (k: number) => Math.round(k * 1.15078),
  kmh: (k: number) => Math.round(k * 1.852),
};
