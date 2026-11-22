/**
 * The site's language: which one is showing, its text (see en.ts) and its date and number formats.
 *
 * Chosen from, in order: ?lang= in the address, the reader's last choice (remembered in this browser), the browser's
 * own languages, then English. Only the languages listed in VITE_LANGUAGES are offered in the picker or picked from
 * the browser; any language with a file here still opens with ?lang=, so a translation can be reviewed before it's
 * offered to everyone.
 *
 * React components read it with useI18n() (and re-render when it changes); other code, such as the map's popups and
 * the date helpers, reads the same thing with i18n().
 */
import { Fragment, type ReactNode, useSyncExternalStore } from 'react';
import { en, type Messages } from './en';

/**
 * Countries' and cities' names in a language, where they differ from the English (public/data/names/<lang>.json,
 * written by scripts/build-data.mjs): countries by their English name, cities by their row in places.json
 */
export interface Names {
  countries: Record<string, string>;
  places: Record<string, string>;
}
const NO_NAMES: Names = { countries: {}, places: {} };

const names = (lang: string) =>
  fetch(`/data/names/${lang}.json`).then((r) => {
    if (!r.ok) throw new Error(`names/${lang}.json: ${r.status}`);
    return r.json() as Promise<Names>;
  });

/** Every language there's a file for, by its code, loaded only when chosen (English is always loaded) */
const CATALOGS: Record<string, () => Promise<[Messages, Names]>> = {
  en: async () => [en, NO_NAMES],
  es: () => Promise.all([import('./es').then((f) => f.es), names('es')]),
};

/** The languages offered to everyone (the rest open only with ?lang=) */
export const OFFERED = (import.meta.env.VITE_LANGUAGES ?? 'en')
  .split(',')
  .map((l) => l.trim())
  .filter((l) => l in CATALOGS);

export interface Active {
  lang: string;
  m: Messages;
  names: Names;
  /** Whether the reader chose it (by link or picker), rather than it following their browser: only then do
   *  links carry it, so a link shared on opens in the next reader's own language */
  chosen: boolean;
  date: Intl.DateTimeFormat;
  dateTime: Intl.DateTimeFormat;
  month: Intl.DateTimeFormat;
  number: Intl.NumberFormat;
  /** Joins a list the language's way: "Cuba, Haiti and Jamaica" */
  list: Intl.ListFormat;
}

function make(lang: string, m: Messages, names: Names, chosen: boolean): Active {
  const utc = { timeZone: 'UTC' } as const;
  return {
    lang,
    m,
    names,
    chosen,
    // Built once per language: formatting with options builds a new formatter on every call, which adds up over a
    // list and every frame of playback
    date: new Intl.DateTimeFormat(m.locale, { month: 'short', day: 'numeric', year: 'numeric', ...utc }),
    dateTime: new Intl.DateTimeFormat(m.locale, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      ...utc,
    }),
    month: new Intl.DateTimeFormat(m.locale, { month: 'short', ...utc }),
    number: new Intl.NumberFormat(m.locale),
    list: new Intl.ListFormat(m.locale, { type: 'conjunction' }),
  };
}

let active = make('en', en, NO_NAMES, false);
const listeners = new Set<() => void>();

/** The language showing, for code outside React components */
export const i18n = () => active;

/** The language showing, in a component (which re-renders when it changes) */
export const useI18n = () =>
  useSyncExternalStore(
    (on) => {
      listeners.add(on);
      return () => listeners.delete(on);
    },
    () => active,
  );

const KEY = 'lang';
const remembered = () => {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
};

/** Switches language (loading its text first), and remembers it if the reader chose it */
export async function setLanguage(lang: string, chosen = true) {
  const load = CATALOGS[lang];
  if (!load) return;
  let loaded: [Messages, Names];
  try {
    loaded = await load();
  } catch {
    // Offline or a failed download: stay in the language showing
    return;
  }
  active = make(lang, loaded[0], loaded[1], chosen);
  if (typeof document !== 'undefined') document.documentElement.lang = lang;
  if (chosen) {
    try {
      localStorage.setItem(KEY, lang);
    } catch {
      // Storage blocked: the choice lasts for this visit only
    }
  }
  listeners.forEach((on) => on());
}

/** Picks the first language before the site first draws, from the address, a past choice or the browser */
export function startLanguage(fromLink: string | null): Promise<void> {
  if (fromLink && fromLink in CATALOGS) return setLanguage(fromLink);
  const past = remembered();
  if (past && OFFERED.includes(past)) return setLanguage(past);
  const browser = navigator.languages
    .map((l) => l.toLowerCase().split('-')[0])
    .find((l) => OFFERED.includes(l));
  return setLanguage(browser ?? 'en', false);
}

/** A country's name (as the data has it, in English) in the language showing */
export const countryName = (english: string) => active.names.countries[english] ?? english;

/** A city's name in the language showing, by its row in places.json */
export const placeName = (row: number, english: string) => active.names.places[row] ?? english;

/** A language's name in itself, from the browser (so the picker needn't load every language): "Español" */
export function languageName(lang: string): string {
  try {
    const name = new Intl.DisplayNames([lang], { type: 'language' }).of(lang) ?? lang;
    return name.charAt(0).toLocaleUpperCase(lang) + name.slice(1);
  } catch {
    return lang;
  }
}

/**
 * Text with markup in it: each "{key}" in the text replaced by parts[key], e.g.
 * rich(m.app.storms(n), { n: <strong>{n}</strong> })
 */
export function rich(text: string, parts: Record<string, ReactNode>): ReactNode {
  return text.split(/\{(\w+)\}/).map((piece, i) => <Fragment key={i}>{i % 2 ? parts[piece] : piece}</Fragment>);
}
