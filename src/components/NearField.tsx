import { useEffect, useMemo, useState } from 'react';
import { fold, loadPlaces, nearLabel, type Near, type Place } from '../data/near';
import { countryName, placeName, useI18n } from '../i18n';

interface NearFieldProps {
  near: Near | null;
  radius: number;
  /** Every country's name, once the shapes have loaded */
  countries: string[] | null;
  picking: boolean;
  onNear: (near: Near | null) => void;
  onRadius: (km: number) => void;
  onPicking: (picking: boolean) => void;
  /** Asks for the country shapes, the first time the search is used */
  onWantCountries: () => void;
}

const RADII = [50, 100, 200, 400];

type Suggestion = { key: string; label: string; sub: string; near: Near };

const SHOWN = 8;

/** Storms that passed near a country, a city or a spot on the map, within a chosen distance */
const NearField: React.FC<NearFieldProps> = ({
  near,
  radius,
  countries,
  picking,
  onNear,
  onRadius,
  onPicking,
  onWantCountries,
}) => {
  const { m, lang, names } = useI18n();
  const [text, setText] = useState('');
  const [places, setPlaces] = useState<Place[] | null>(null);
  const [active, setActive] = useState(0);
  const [wanted, setWanted] = useState(false);

  useEffect(() => {
    if (!wanted) return;
    onWantCountries();
    let live = true;
    loadPlaces().then((p) => live && setPlaces(p));
    return () => {
      live = false;
    };
  }, [wanted, onWantCountries]);

  // Countries by their name in the language showing, which is also matched along with the English
  const countryList = useMemo(
    () =>
      (countries ?? [])
        .map((en) => {
          const label = names.countries[en] ?? en;
          return { en, label, keys: [fold(label), fold(en)] };
        })
        .sort((a, b) => a.label.localeCompare(b.label, lang)),
    [countries, lang, names],
  );
  // Cities' names in the language showing, where they differ, folded for matching (the English is matched too)
  const placeKeys = useMemo(() => {
    const keys = new Map<number, string>();
    for (const row of Object.keys(names.places)) keys.set(Number(row), fold(names.places[row]));
    return keys;
  }, [names]);

  const suggestions = useMemo<Suggestion[]>(() => {
    const q = fold(text.trim());
    if (q.length < 2) return [];
    const out: Suggestion[] = [];
    // Countries: names starting with what's typed first, then names containing it
    const starts = (c: (typeof countryList)[number]) => c.keys.some((k) => k.startsWith(q));
    const cs = countryList.filter((c) => c.keys.some((k) => k.includes(q)));
    cs.sort((a, b) => Number(!starts(a)) - Number(!starts(b)));
    for (const c of cs.slice(0, 3)) {
      out.push({ key: `c:${c.en}`, label: c.label, sub: m.near.country, near: { kind: 'country', name: c.en } });
    }
    // Cities starting with it, largest first (the file is in that order)
    for (const p of places ?? []) {
      if (out.length >= SHOWN) break;
      if (!p.key.startsWith(q) && !placeKeys.get(p.row)?.startsWith(q)) continue;
      const name = placeName(p.row, p.name);
      const country = countryName(p.country);
      const sub = [p.region !== p.name ? p.region : '', country].filter(Boolean).join(', ');
      out.push({
        key: `p:${p.row}`,
        label: name,
        sub,
        near: { kind: 'point', name: `${name}, ${country}`, lat: p.lat, lon: p.lon },
      });
    }
    return out;
  }, [text, countryList, places, placeKeys, m]);

  const choose = (n: Near) => {
    onNear(n);
    setText('');
    setActive(0);
  };

  if (near) {
    return (
      <div className="field">
        <span className="field-label">{m.near.label}</span>
        <div className="near-chosen">
          <span className="near-name">{nearLabel(near)}</span>
          <button className="near-clear" onClick={() => onNear(null)} aria-label={m.near.clear(nearLabel(near))}>
            ✕
          </button>
        </div>
        <div className="chips" role="group" aria-label={m.near.within}>
          {RADII.map((km) => (
            <button
              key={km}
              className={`chip${radius === km ? ' on' : ''}`}
              onClick={() => onRadius(km)}
              aria-pressed={radius === km}
            >
              {m.units.km(km)}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="field near">
      <span className="field-label">{m.near.label}</span>
      <input
        className="search"
        type="search"
        placeholder={m.near.placeholder}
        value={text}
        role="combobox"
        aria-expanded={suggestions.length > 0}
        aria-controls="near-suggestions"
        aria-activedescendant={suggestions[active] ? `near-${active}` : undefined}
        onFocus={() => setWanted(true)}
        onChange={(e) => {
          setText(e.target.value);
          setActive(0);
          setWanted(true);
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') setActive((a) => Math.min(a + 1, suggestions.length - 1));
          else if (e.key === 'ArrowUp') setActive((a) => Math.max(a - 1, 0));
          else if (e.key === 'Enter' && suggestions[active]) choose(suggestions[active].near);
          else return;
          e.preventDefault();
        }}
      />
      {suggestions.length > 0 && (
        <ul className="near-suggestions" id="near-suggestions" role="listbox">
          {suggestions.map((s, i) => (
            <li
              key={s.key}
              id={`near-${i}`}
              role="option"
              aria-selected={i === active}
              className={i === active ? 'on' : ''}
              onMouseEnter={() => setActive(i)}
              // Before the input's blur, so the choice lands
              onMouseDown={(e) => {
                e.preventDefault();
                choose(s.near);
              }}
            >
              {s.label} <span className="muted">{s.sub}</span>
            </li>
          ))}
        </ul>
      )}
      {text.trim().length >= 2 && !suggestions.length && (
        <p className="muted small near-none">{places && countries ? m.near.noMatch : m.near.loadingPlaces}</p>
      )}
      <button className="link near-pick" onClick={() => onPicking(!picking)}>
        {picking ? m.near.cancelPick : m.near.pick}
      </button>
    </div>
  );
};

export default NearField;
