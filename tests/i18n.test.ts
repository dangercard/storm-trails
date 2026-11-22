/**
 * The languages: every one has everything English has (TypeScript checks the shape; this checks what it can't, like
 * the lengths of lists and that every piece of text with a number in it gives sensible text), and the plural rules.
 */
import { describe, expect, it } from 'vitest';
import { REGIONAL } from '../src/data/categories';
import { en, type Messages } from '../src/i18n/en';
import { es } from '../src/i18n/es';

const LANGUAGES: Record<string, Messages> = { es };

/** Every leaf of a catalog, by its path: strings, functions and arrays */
function leaves(o: unknown, path = ''): [string, unknown][] {
  if (typeof o === 'string' || typeof o === 'function' || Array.isArray(o)) return [[path, o]];
  return Object.entries(o as object).flatMap(([k, v]) => leaves(v, path ? `${path}.${k}` : k));
}

/** Sample arguments for a message function, by the English function's parameter names */
const SAMPLES: Record<string, unknown[]> = {
  n: [0, 1, 2, 21],
  days: [0.5, 1, 1.5, 14],
  count: [0, 1, 3, 47],
  years: [10, 47],
  term: ['hurricane', 'typhoon', 'other'],
  strongest: [null, 130],
  country: [true, false],
  hurricane: [null, 130],
};
const sample = (name: string) => SAMPLES[name] ?? [name === 'from' ? 2004 : name === 'to' ? 2026 : name.length > 3 ? `‹${name}›` : 42];

/** Calls a function with every combination of sample arguments (its parameters named as in English) */
function calls(fn: (...a: unknown[]) => unknown, names: string[]): unknown[] {
  const combos = names.reduce<unknown[][]>((acc, name) => acc.flatMap((args) => sample(name).map((v) => [...args, v])), [[]]);
  return combos.map((args) => fn(...args));
}
const params = (fn: Function) =>
  fn
    .toString()
    .match(/^\(?([^)=]*)\)?\s*=>/)![1]
    .split(',')
    .map((p) => p.trim().split(/[:=\s]/)[0])
    .filter(Boolean);

describe.each(Object.entries(LANGUAGES))('%s', (lang, m) => {
  const ours = new Map(leaves(m));

  it('has every piece of text English has, of the same kind, and nothing else', () => {
    const theirs = leaves(en);
    expect([...ours.keys()].sort()).toEqual(theirs.map(([k]) => k).sort());
    for (const [k, v] of theirs) {
      expect(typeof ours.get(k), k).toBe(typeof v);
      if (Array.isArray(v)) expect((ours.get(k) as unknown[]).length, k).toBe(v.length);
      if (typeof v === 'function') expect((ours.get(k) as Function).length, k).toBe(v.length);
    }
  });

  it('names every class of every regional scale', () => {
    for (const { key } of Object.values(REGIONAL)) {
      expect(m.regional.classes[key].every((c) => c.trim().length > 0), key).toBe(true);
    }
  });

  it('gives sensible text from every message with a number or name in it', () => {
    for (const [k, v] of leaves(en)) {
      if (typeof v !== 'function') continue;
      const fn = ours.get(k) as (...a: unknown[]) => unknown;
      for (const out of calls(fn, params(v))) {
        // Text, or a list of points of text
        for (const piece of Array.isArray(out) ? out : [out]) {
          expect(typeof piece, k).toBe('string');
          expect(piece as string, k).not.toMatch(/undefined|NaN|null|\[object/);
        }
      }
    }
  });

  it('formats dates and numbers for its locale', () => {
    expect(() => new Intl.NumberFormat(m.locale)).not.toThrow();
    expect(Intl.getCanonicalLocales(m.locale)[0].startsWith(lang)).toBe(true);
  });
});

describe('plurals and numbers', () => {
  it('English', () => {
    expect(en.app.storms(1)).toBe('{n} storm');
    expect(en.app.storms(2)).toBe('{n} storms');
    expect(en.storm.days(1)).toBe('1 day');
    expect(en.storm.days(1.5)).toBe('1.5 days');
    expect(en.report.howOften(0, 10)).toBe('none');
    expect(en.report.howOften(1, 10)).toBe('about once every 10 years');
    expect(en.report.howOften(30, 10)).toBe('about 3.0 a year');
  });
  it('Spanish', () => {
    expect(es.app.storms(1)).toBe('{n} tormenta');
    expect(es.app.storms(2)).toBe('{n} tormentas');
    expect(es.storm.days(1)).toBe('1 día');
    expect(es.storm.days(1.5)).toBe('1.5 días');
    expect(es.report.winds.unknown(1)).toContain('1 tormenta de estas temporadas pasó');
    expect(es.report.winds.unknown(3)).toContain('3 tormentas de estas temporadas pasaron');
    expect(es.report.hurricanes('typhoon')).toContain('tifón');
  });
});
