import { useEffect, useMemo, useState } from 'react';
import StormDetail from './components/StormDetail';
import StormMap from './components/StormMap';
import YearRange from './components/YearRange';
import { BASINS, category, OTHER, TROPICAL } from './data/categories';
import { decadeOf, displayName, formatDate, loadDecade, loadIndex, type Storm, toDate, type TrackPoint, unpack } from './data/storms';
import './App.css';

const FIRST_SEASON = 1842;
/** Thresholds for "at least…", by category code */
const STRENGTHS = [
  { code: -9, label: 'Any' },
  { code: 0, label: 'Tropical storm +' },
  { code: 1, label: 'Hurricane +' },
  { code: 3, label: 'Major (3+)' },
  { code: 5, label: 'Category 5' },
];
/** The list stops after this many, strongest first (the map shows them all) */
const LIST_MAX = 150;

const useWide = () => {
  const query = '(min-width: 760px)';
  const [wide, setWide] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const m = window.matchMedia(query);
    const on = () => setWide(m.matches);
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, []);
  return wide;
};

const App: React.FC = () => {
  const [storms, setStorms] = useState<Storm[] | null>(null);
  const [source, setSource] = useState('');
  const [lastSeason, setLastSeason] = useState(2026);
  /** The calendar year of the newest data (southern seasons run July to June and are named for the year they end) */
  const [lastYear, setLastYear] = useState(2026);
  const [range, setRange] = useState<[number, number]>([2016, 2026]);
  const [basins, setBasins] = useState<string[]>([]);
  const [minCat, setMinCat] = useState(0);
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  /** Loaded decades of tracks, by decade */
  const [decades, setDecades] = useState<Record<number, Record<string, number[]>>>({});
  const [about, setAbout] = useState(false);
  const wide = useWide();

  useEffect(() => {
    loadIndex().then((index) => {
      setStorms(index.storms);
      setSource(index.source);
      const last = Math.max(...index.storms.map((s) => s.season));
      const year = toDate(Math.max(...index.storms.map((s) => s.start))).getUTCFullYear();
      setLastSeason(last);
      setLastYear(year);
      setRange([year - 9, last]);
    });
  }, []);

  const filtered = useMemo(() => {
    if (!storms) return [];
    const q = query.trim().toUpperCase();
    return storms.filter(
      (s) =>
        s.season >= range[0] &&
        s.season <= range[1] &&
        s.peakCat >= minCat &&
        (!basins.length || s.basins.some((b) => basins.includes(b))) &&
        (!q || s.name.includes(q) || s.id === q),
    );
  }, [storms, range, minCat, basins, query]);

  const selected = useMemo(() => storms?.find((s) => s.id === selectedId) ?? null, [storms, selectedId]);

  // Fetch the decades the shown storms (and the chosen one) start in
  const needed = useMemo(() => {
    const set = new Set(filtered.map(decadeOf));
    if (selected) set.add(decadeOf(selected));
    return [...set];
  }, [filtered, selected]);
  useEffect(() => {
    for (const d of needed) {
      if (decades[d]) continue;
      loadDecade(d).then((tracks) => setDecades((prev) => (prev[d] ? prev : { ...prev, [d]: tracks })));
    }
  }, [needed, decades]);
  const loading = needed.some((d) => !decades[d]);

  const tracks = useMemo(
    () =>
      filtered.flatMap((storm) => {
        const flat = decades[decadeOf(storm)]?.[storm.id];
        return flat ? [{ storm, points: unpack(storm, flat) }] : [];
      }),
    [filtered, decades],
  );
  const selectedPoints = useMemo<TrackPoint[] | null>(() => {
    if (!selected) return null;
    const flat = decades[decadeOf(selected)]?.[selected.id];
    return flat ? unpack(selected, flat) : null;
  }, [selected, decades]);

  const list = useMemo(
    () => [...filtered].sort((a, b) => (b.peakWind ?? -1) - (a.peakWind ?? -1) || a.start - b.start).slice(0, LIST_MAX),
    [filtered],
  );

  const toggleBasin = (b: string) => setBasins((prev) => (prev.includes(b) ? prev.filter((x) => x !== b) : [...prev, b]));
  const presets: { label: string; range: [number, number] }[] = [
    { label: 'This year', range: [lastYear, lastSeason] },
    { label: 'Last 10 years', range: [lastYear - 9, lastSeason] },
    { label: 'Since 1980', range: [1980, lastSeason] },
    { label: 'All', range: [FIRST_SEASON, lastSeason] },
  ];

  return (
    <div className="app">
      <StormMap
        tracks={tracks}
        selected={selected}
        selectedPoints={selectedPoints}
        onSelect={setSelectedId}
        padding={wide ? { left: 360, bottom: 0 } : { left: 0, bottom: window.innerHeight * 0.45 }}
      />

      <aside className="panel">
        {selected ? (
          <StormDetail storm={selected} points={selectedPoints} onClose={() => setSelectedId(null)} />
        ) : (
          <>
            <header className="panel-head">
              <h1>Storm Tracks</h1>
              <p className="muted">Every tropical cyclone on record, worldwide.</p>
            </header>

            <div className="field">
              <span className="field-label">Seasons</span>
              <YearRange min={FIRST_SEASON} max={lastSeason} value={range} onChange={setRange} />
              <div className="chips">
                {presets.map((p) => (
                  <button
                    key={p.label}
                    className={`chip${p.range[0] === range[0] && p.range[1] === range[1] ? ' on' : ''}`}
                    onClick={() => setRange(p.range)}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="field">
              <span className="field-label">Basins</span>
              <div className="chips">
                {Object.entries(BASINS).map(([code, name]) => (
                  <button
                    key={code}
                    className={`chip${basins.includes(code) ? ' on' : ''}`}
                    onClick={() => toggleBasin(code)}
                    aria-pressed={basins.includes(code)}
                  >
                    {name}
                  </button>
                ))}
              </div>
            </div>

            <div className="field">
              <span className="field-label">At least</span>
              <div className="chips">
                {STRENGTHS.map((s) => (
                  <button
                    key={s.code}
                    className={`chip${minCat === s.code ? ' on' : ''}`}
                    onClick={() => setMinCat(s.code)}
                    aria-pressed={minCat === s.code}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="field">
              <input
                className="search"
                type="search"
                placeholder="Search by name (e.g. Maria)"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>

            <div className="count">
              {storms ? (
                <>
                  <strong>{filtered.length.toLocaleString()}</strong> storms
                  {loading && <span className="muted"> · loading tracks…</span>}
                </>
              ) : (
                <span className="muted">Loading…</span>
              )}
            </div>

            <ol className="list">
              {list.map((s) => {
                const c = category(s.peakCat);
                return (
                  <li key={s.id}>
                    <button className="row" onClick={() => setSelectedId(s.id)}>
                      <span className="dot" style={{ background: c.color }} title={c.label}>
                        {c.short}
                      </span>
                      <span className="row-name">
                        {displayName(s)} <span className="muted">{s.season}</span>
                        <span className="row-sub">
                          {BASINS[s.basins[0]] ?? s.basins[0]} · {formatDate(s.start)}
                        </span>
                      </span>
                      <span className="row-wind">{s.peakWind ? `${s.peakWind} kt` : '—'}</span>
                    </button>
                  </li>
                );
              })}
            </ol>
            {filtered.length > LIST_MAX && (
              <p className="muted small">The {LIST_MAX} strongest are listed; the map shows them all.</p>
            )}

            <button className="link" onClick={() => setAbout((a) => !a)}>
              {about ? 'Hide' : 'About the data'}
            </button>
            {about && (
              <div className="about small">
                <p>
                  Tracks from {source}: Gahtan, J., et al. (2024), International Best Track Archive for Climate
                  Stewardship (IBTrACS) Project, Version 4r01, NOAA National Centers for Environmental Information,{' '}
                  <a href="https://doi.org/10.25921/82ty-9e16">doi:10.25921/82ty-9e16</a>; and Knapp, K. R., et al.
                  (2010), Bull. Amer. Meteor. Soc., 91, 363–376.
                </p>
                <p>
                  Wind is the 1-minute sustained wind from US agencies where there is one, otherwise the regional
                  agency's (often a 10-minute average, which reads lower). Category is the Saffir-Simpson scale. Older
                  storms often have no wind recorded at all. Points are every 6 hours. Recent storms may still be
                  provisional.
                </p>
                <p>Map © OpenFreeMap, OpenMapTiles, OpenStreetMap contributors.</p>
              </div>
            )}
          </>
        )}
      </aside>

      <div className="legend" aria-label="Legend">
        {TROPICAL.map((c) => (
          <span key={c.code} className="legend-item">
            <i style={{ background: c.color }} />
            {c.short}
          </span>
        ))}
        <span className="legend-item">
          <i className="dashed" style={{ color: OTHER[2].color }} />
          other
        </span>
      </div>
    </div>
  );
};

export default App;
