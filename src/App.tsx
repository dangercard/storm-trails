import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import NearField from './components/NearField';
import PlaceReport from './components/PlaceReport';
import Playbar from './components/Playbar';
import StormDetail from './components/StormDetail';
import StormMap, { type MapApi } from './components/StormMap';
import LanguagePicker from './components/LanguagePicker';
import YearRange from './components/YearRange';
import { BASINS, basinName, category, categoryLabel, categoryShort, OTHER, TROPICAL } from './data/categories';
import { download, fileName, pointsCsv, stormsCsv, tracksGeoJson } from './data/exports';
import { footprint } from './data/footprint';
import { fold, formatLatLon, type Near, nearMeasure, nearShape } from './data/near';
import {
  decadeOf,
  displayName,
  formatDate,
  hasRadii,
  loadCountries,
  loadDecade,
  loadIndex,
  loadRadii,
  radiiOf,
  type RadiiFile,
  seasOf,
  type Storm,
  toDate,
  type TrackFile,
  type TrackPoint,
  unpack,
} from './data/storms';
import { readUrl, toSearch } from './data/urlState';
import { rich, useI18n } from './i18n';
import './App.css';

/** The view the page was opened with (filters, chosen storm, "Near", report) */
const opened = readUrl();

const FIRST_SEASON = 1842;
/** Thresholds for "at least…", by category code (their names are in src/i18n) */
const STRENGTHS = [-9, 0, 1, 3, 5] as const;
type Strength = (typeof STRENGTHS)[number];
/** The first season with estimates of how far winds reached (scattered before 2004; see the report's method) */
const RADII_FROM = 2000;
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
  const [range, setRange] = useState<[number, number]>(opened.range ?? [2016, 2026]);
  const [basins, setBasins] = useState<string[]>(opened.basins.filter((b) => (BASINS as readonly string[]).includes(b)));
  const [minCat, setMinCat] = useState<Strength>(
    STRENGTHS.includes(opened.minCat as Strength) ? (opened.minCat as Strength) : 0,
  );
  const [query, setQuery] = useState(opened.query);
  const [selectedId, setSelectedId] = useState<string | null>(opened.storm);
  /** Loaded decades of tracks, by decade */
  const [decades, setDecades] = useState<Record<number, TrackFile>>({});
  const [about, setAbout] = useState(false);
  const [nearChoice, setNear] = useState<Near | null>(opened.near);
  const [radius, setRadius] = useState(opened.km !== null && opened.km > 0 && opened.km <= 1000 ? opened.km : 100);
  const [report, setReport] = useState(opened.report && Boolean(opened.near));
  const [picking, setPicking] = useState(false);
  const [countries, setCountries] = useState<GeoJSON.FeatureCollection | null>(null);
  const [playing, setPlaying] = useState(false);
  /** Loaded decades of radii (how far winds reached), by decade */
  const [radiiFiles, setRadiiFiles] = useState<Record<number, RadiiFile>>({});
  /** The chosen storm's wind footprint, with the track it was made for (so a stale one is never shown) */
  const [shaded, setShaded] = useState<{ points: TrackPoint[]; footprint: GeoJSON.FeatureCollection | null } | null>(null);
  const mapApi = useRef<MapApi | null>(null);
  const wide = useWide();
  const { m, number, lang, chosen } = useI18n();
  /** The language, in links, only when the reader chose it */
  const linkLang = chosen ? lang : null;

  const wantCountries = useCallback(() => {
    loadCountries().then(setCountries);
  }, []);
  const countryNames = useMemo(
    () => (countries ? [...new Set(countries.features.map((f) => f.properties!.name as string))].sort() : null),
    [countries],
  );

  useEffect(() => {
    loadIndex().then((index) => {
      setStorms(index.storms);
      setSource(index.source);
      const last = Math.max(...index.storms.map((s) => s.season));
      const year = toDate(Math.max(...index.storms.map((s) => s.start))).getUTCFullYear();
      setLastSeason(last);
      setLastYear(year);
      if (!opened.range) setRange([year - 9, last]);
    });
  }, []);

  /** The storms the filters other than "Near" pick (their tracks are needed to apply it) */
  const picked = useMemo(() => {
    if (!storms) return [];
    // Accent-blind (names are kept in plain capitals: MARIA, whether typed María or maria)
    const q = fold(query.trim()).toUpperCase();
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
    const set = new Set(picked.map(decadeOf));
    if (selected) set.add(decadeOf(selected));
    return [...set];
  }, [picked, selected]);
  useEffect(() => {
    for (const d of needed) {
      if (decades[d]) continue;
      loadDecade(d).then((tracks) => setDecades((prev) => (prev[d] ? prev : { ...prev, [d]: tracks })));
    }
  }, [needed, decades]);
  const loading = needed.some((d) => !decades[d]);

  /** Every storm whose decade has loaded, with its track: what the map holds, whatever the filters */
  const loadedTracks = useMemo(
    () =>
      (storms ?? []).flatMap((storm) => {
        const flat = decades[decadeOf(storm)]?.[storm.id];
        return flat ? [{ storm, points: unpack(storm, flat) }] : [];
      }),
    [storms, decades],
  );
  const trackOf = useMemo(() => new Map(loadedTracks.map((t) => [t.storm, t])), [loadedTracks]);
  const pickedTracks = useMemo(() => picked.flatMap((s) => trackOf.get(s) ?? []), [picked, trackOf]);

  // "Near": a country needs its shapes, which load the first time one is chosen (and the report's map needs them)
  useEffect(() => {
    if (nearChoice?.kind === 'country' || report) wantCountries();
  }, [nearChoice, report, wantCountries]);
  /** The "Near" choice, unless it names a country there are no shapes for (an old or mistyped link) */
  const near = useMemo(
    () =>
      nearChoice?.kind === 'country' && countryNames && !countryNames.includes(nearChoice.name) ? null : nearChoice,
    [nearChoice, countryNames],
  );
  const measure = useMemo(() => (near ? nearMeasure(near, radius, countries) : null), [near, radius, countries]);
  const nearWaiting = Boolean(near && !measure);
  const tracks = useMemo(
    () => (!near ? pickedTracks : measure ? pickedTracks.filter(({ points }) => measure.test(points)) : []),
    [pickedTracks, near, measure],
  );
  /** The storms shown: everything picked, or, with "Near" on, those whose tracks have loaded and pass it */
  const filtered = useMemo(() => (near ? tracks.map((x) => x.storm) : picked), [near, tracks, picked]);
  const nearOutline = useMemo(() => (near ? nearShape(near, radius, countries) : null), [near, radius, countries]);

  const onPick = useCallback((lat: number, lon: number) => {
    setNear({ kind: 'point', name: formatLatLon(lat, lon), lat, lon });
    setPicking(false);
    setReport(false);
  }, []);

  // Playback runs over the storms in view, from the first one forming to the last one ending
  const span = useMemo(() => {
    let from = Infinity;
    let to = -Infinity;
    for (const { storm } of tracks) {
      from = Math.min(from, storm.start);
      to = Math.max(to, storm.end);
    }
    return from <= to ? { from, to } : null;
  }, [tracks]);
  /** When any storm in view is under way, as merged [start, end] stretches in order, for playback's pace */
  const busy = useMemo(() => {
    const spans = tracks.map(({ storm }) => [storm.start, storm.end] as [number, number]).sort((a, b) => a[0] - b[0]);
    const out: [number, number][] = [];
    for (const [a, b] of spans) {
      const last = out[out.length - 1];
      if (last && a <= last[1]) last[1] = Math.max(last[1], b);
      else out.push([a, b]);
    }
    return out;
  }, [tracks]);
  const onTime = useCallback((t: number | null) => mapApi.current?.setTime(t), []);
  const selectedPoints = useMemo<TrackPoint[] | null>(() => {
    if (!selected) return null;
    const flat = decades[decadeOf(selected)]?.[selected.id];
    return flat ? unpack(selected, flat) : null;
  }, [selected, decades]);

  // How far winds reached: the radii for the chosen storm, and, for the place report, for every storm the other
  // filters pick (its winds can reach a place its centre never came near)
  const radiiNeeded = useMemo(() => {
    const set = new Set<number>();
    if (selected) set.add(decadeOf(selected));
    if (report && near) for (const { storm } of pickedTracks) if (storm.season >= RADII_FROM) set.add(decadeOf(storm));
    return [...set].filter(hasRadii);
    // storms: which decades have radii is known once the index has loaded
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, report, near, pickedTracks, storms]);
  useEffect(() => {
    for (const d of radiiNeeded) {
      if (radiiFiles[d]) continue;
      loadRadii(d).then((file) => setRadiiFiles((prev) => (prev[d] ? prev : { ...prev, [d]: file })));
    }
  }, [radiiNeeded, radiiFiles]);
  const radiiReady = radiiNeeded.every((d) => radiiFiles[d]);
  const radiiFor = useCallback(
    (storm: Storm, points: TrackPoint[]) => radiiOf(points, radiiFiles[decadeOf(storm)], storm.id),
    [radiiFiles],
  );
  const selectedRadii = useMemo(
    () => (selected && selectedPoints ? radiiFor(selected, selectedPoints) : null),
    [selected, selectedPoints, radiiFor],
  );
  /** How far 12 ft seas reached round the chosen storm (North Atlantic and East Pacific, from about 2004) */
  const selectedSeas = useMemo(
    () => (selected && selectedPoints ? seasOf(selectedPoints, radiiFiles[decadeOf(selected)], selected.id) : null),
    [selected, selectedPoints, radiiFiles],
  );
  useEffect(() => {
    if (!selectedPoints || (!selectedRadii && !selectedSeas)) return;
    let live = true;
    footprint(selectedPoints, selectedRadii, selectedSeas).then((fc) => live && setShaded({ points: selectedPoints, footprint: fc }));
    return () => {
      live = false;
    };
  }, [selectedPoints, selectedRadii, selectedSeas]);
  const selectedFootprint = shaded && shaded.points === selectedPoints ? shaded.footprint : null;

  /** Every storm, strongest first (then earliest): sorted once, so the list just takes the first that are shown */
  const byStrength = useMemo(
    () => (storms ? [...storms].sort((a, b) => (b.peakWind ?? -1) - (a.peakWind ?? -1) || a.start - b.start) : []),
    [storms],
  );
  const list = useMemo(() => {
    const shown = new Set(filtered);
    const out: Storm[] = [];
    for (const s of byStrength) {
      if (out.length >= LIST_MAX) break;
      if (shown.has(s)) out.push(s);
    }
    return out;
  }, [byStrength, filtered]);

  // Keep the address bar in step, so the view can be bookmarked or shared (once the default seasons are known)
  useEffect(() => {
    if (!storms) return;
    const search = toSearch({
      range,
      basins,
      minCat,
      query,
      storm: selectedId,
      near,
      km: radius,
      report: report && Boolean(near),
      lang: linkLang,
    });
    if (search !== window.location.search) {
      window.history.replaceState(null, '', `${window.location.pathname}${search}${window.location.hash}`);
    }
  }, [storms, range, basins, minCat, query, selectedId, near, radius, report, linkLang]);
  const reportHref = toSearch({ range, basins, minCat, query, storm: null, near, km: radius, report: true, lang: linkLang });

  /** Downloads of what's in view, named for it: storms-1980-2026-north-atlantic-near-miami-100km */
  const downloadName = fileName(
    'storms',
    range[0],
    range[1],
    basins.map(basinName).join('-'),
    near ? `near-${near.name}-${radius}km` : '',
  );
  const busyLoading = loading || nearWaiting;

  const toggleBasin = (b: string) => setBasins((prev) => (prev.includes(b) ? prev.filter((x) => x !== b) : [...prev, b]));
  const presets: { label: string; range: [number, number] }[] = [
    { label: m.app.presets.thisYear, range: [lastYear, lastSeason] },
    { label: m.app.presets.last10, range: [lastYear - 9, lastSeason] },
    { label: m.app.presets.since1980, range: [1980, lastSeason] },
    { label: m.app.presets.all, range: [FIRST_SEASON, lastSeason] },
  ];

  if (report && near) {
    return (
      <PlaceReport
        near={near}
        km={radius}
        tracks={tracks}
        nearby={pickedTracks}
        radiiFor={radiiFor}
        measure={measure}
        countries={countries}
        outline={nearOutline ?? { type: 'FeatureCollection', features: [] }}
        range={range}
        basins={basins}
        minCat={minCat}
        query={query}
        loading={!storms || busyLoading || (report && !countries) || !radiiReady}
        onBack={() => setReport(false)}
      />
    );
  }

  return (
    <div className={`app${playing && span ? ' is-playing' : ''}`}>
      <StormMap
        // MapLibre takes its controls' labels only when the map is made, so a new language means a new map (rare;
        // everything it shows comes from these props, so it comes back as it was)
        key={lang}
        all={loadedTracks}
        tracks={tracks}
        selected={selected}
        selectedPoints={selectedPoints}
        footprint={selectedFootprint}
        onSelect={setSelectedId}
        padding={wide ? { left: 360, bottom: 0 } : { left: 0, bottom: window.innerHeight * 0.45 }}
        near={nearOutline}
        picking={picking}
        onPick={onPick}
        apiRef={mapApi}
      />

      {playing && span && (
        <Playbar
          from={span.from}
          to={span.to}
          busy={busy}
          single={tracks.length === 1}
          onTime={onTime}
          paused={Boolean(selected)}
          onClose={() => setPlaying(false)}
        />
      )}

      <aside className="panel">
        {selected ? (
          <StormDetail
            storm={selected}
            points={selectedPoints}
            radii={selectedRadii}
            seas={selectedSeas}
            shaded={Boolean(selectedFootprint)}
            onClose={() => setSelectedId(null)}
          />
        ) : (
          <>
            <header className="panel-head">
              <h1>{import.meta.env.VITE_APP_NAME}</h1>
              <p className="muted">{m.app.tagline}</p>
              <LanguagePicker />
            </header>

            <div className="field">
              <span className="field-label">{m.app.seasons}</span>
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
              <span className="field-label">{m.app.basins}</span>
              <div className="chips">
                {BASINS.map((code) => (
                  <button
                    key={code}
                    className={`chip${basins.includes(code) ? ' on' : ''}`}
                    onClick={() => toggleBasin(code)}
                    aria-pressed={basins.includes(code)}
                  >
                    {basinName(code)}
                  </button>
                ))}
              </div>
            </div>

            <div className="field">
              <span className="field-label">{m.app.atLeast}</span>
              <div className="chips">
                {STRENGTHS.map((code) => (
                  <button
                    key={code}
                    className={`chip${minCat === code ? ' on' : ''}`}
                    onClick={() => setMinCat(code)}
                    aria-pressed={minCat === code}
                  >
                    {m.app.strengths[code]}
                  </button>
                ))}
              </div>
            </div>

            <NearField
              near={near}
              radius={radius}
              countries={countryNames}
              picking={picking}
              onNear={(n) => {
                setNear(n);
                setPicking(false);
                // A report asked for by a link whose country is gone shouldn't open on the next choice
                setReport(false);
              }}
              onRadius={setRadius}
              onPicking={setPicking}
              onWantCountries={wantCountries}
            />

            <div className="field">
              <input
                className="search"
                type="search"
                placeholder={m.app.search}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>

            <div className="count">
              {storms ? (
                <>
                  <span>
                    {rich(m.app.storms(filtered.length), { n: <strong>{number.format(filtered.length)}</strong> })}
                    {(loading || nearWaiting) && <span className="muted"> · {m.app.loadingTracks}</span>}
                  </span>
                  <button
                    className="play-start"
                    onClick={() => setPlaying((p) => !p)}
                    disabled={!span}
                    aria-pressed={playing}
                  >
                    {playing ? m.app.stopPlaying : m.app.play}
                  </button>
                  <span className="downloads">
                    <span className="muted">{m.app.download}</span>
                    <button
                      className="link-inline"
                      disabled={busyLoading || !tracks.length}
                      onClick={() => download(`${downloadName}.csv`, stormsCsv(tracks.map((x) => x.storm)), 'text/csv')}
                      title={m.app.stormListTitle}
                    >
                      {m.app.stormList}
                    </button>
                    <button
                      className="link-inline"
                      disabled={busyLoading || !tracks.length}
                      onClick={() => download(`${downloadName}-points.csv`, pointsCsv(tracks), 'text/csv')}
                      title={m.app.trackPointsTitle}
                    >
                      {m.app.trackPoints}
                    </button>
                    <button
                      className="link-inline"
                      disabled={busyLoading || !tracks.length}
                      onClick={() => download(`${downloadName}.geojson`, tracksGeoJson(tracks), 'application/geo+json')}
                      title={m.app.tracksGeoJsonTitle}
                    >
                      {m.app.tracksGeoJson}
                    </button>
                  </span>
                  {near && (
                    <a className="report-link-btn" href={reportHref} target="_blank" rel="noopener">
                      {m.app.placeReport}
                    </a>
                  )}
                </>
              ) : (
                <span className="muted">{m.app.loading}</span>
              )}
            </div>

            <ol className="list">
              {list.map((s) => {
                const c = category(s.peakCat);
                return (
                  <li key={s.id}>
                    <button className="row" onClick={() => setSelectedId(s.id)}>
                      <span className="dot" style={{ background: c.color }} title={categoryLabel(c.code)}>
                        {categoryShort(c.code)}
                      </span>
                      <span className="row-name">
                        {displayName(s)} <span className="muted">{s.season}</span>
                        <span className="row-sub">
                          {basinName(s.basins[0])} · {formatDate(s.start)}
                        </span>
                      </span>
                      <span className="row-wind">{s.peakWind ? m.units.kt(s.peakWind) : '—'}</span>
                    </button>
                  </li>
                );
              })}
            </ol>
            {filtered.length > LIST_MAX && (
              <p className="muted small">{m.app.listCapped(LIST_MAX)}</p>
            )}

            <button className="link" onClick={() => setAbout((a) => !a)}>
              {about ? m.app.hideAbout : m.app.about}
            </button>
            {about && (
              <div className="about small">
                <ul className="about-points">
                  {m.app.method.map((point) => (
                    <li key={point}>{point}</li>
                  ))}
                </ul>
                <p>
                  {/* The citation itself stays as published, in every language */}
                  {m.app.tracksFrom(source)} Gahtan, J., et al. (2024), International Best Track Archive for Climate
                  Stewardship (IBTrACS) Project, Version 4r01, NOAA National Centers for Environmental Information,{' '}
                  <a href="https://doi.org/10.25921/82ty-9e16">doi:10.25921/82ty-9e16</a>; {m.app.and} Knapp, K. R., et
                  al. (2010), Bull. Amer. Meteor. Soc., 91, 363–376.
                </p>
                <p>{m.app.mapCredit}</p>
              </div>
            )}
          </>
        )}
      </aside>

      <div className="legend" aria-label={m.app.legend}>
        {TROPICAL.map((c) => (
          <span key={c.code} className="legend-item">
            <i style={{ background: c.color }} />
            {categoryShort(c.code)}
          </span>
        ))}
        <span className="legend-item">
          <i className="dashed" style={{ color: OTHER[2].color }} />
          {m.app.other}
        </span>
      </div>
    </div>
  );
};

export default App;
