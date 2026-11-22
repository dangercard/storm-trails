import { useMemo, useState } from 'react';
import LanguagePicker from './LanguagePicker';
import { basinName, category, categoryLabel, OTHER, regional, termOfAll, TROPICAL } from '../data/categories';
import { CITATION, download, fileName, nearCsv, tracksGeoJson, type Track } from '../data/exports';
import { RADII_FROM, reportRows, WINDS_COMPLETE_FROM, windsReached } from '../data/report';
import { nearLabel, type Near, type NearMeasure } from '../data/near';
import { basinAt, displayName, formatDate, type Radii, type Storm, type TrackPoint } from '../data/storms';
import { countryName, rich, useI18n } from '../i18n';

interface PlaceReportProps {
  near: Near;
  km: number;
  /** The storms passing the filters and "Near", with their tracks */
  tracks: Track[];
  /** The storms passing the filters other than "Near": any of them may have had winds that reached the place */
  nearby: Track[];
  /** A track's radii (how far its winds reached), or null when there are none */
  radiiFor: (storm: Storm, points: TrackPoint[]) => (Radii | null)[] | null;
  measure: NearMeasure | null;
  countries: GeoJSON.FeatureCollection | null;
  /** The outline drawn for "Near": the country, or the circle round the point */
  outline: GeoJSON.FeatureCollection;
  range: [number, number];
  basins: string[];
  /** The strength filter: the lowest category code it lets through */
  minCat: -9 | 0 | 1 | 3 | 5;
  query: string;
  loading: boolean;
  onBack: () => void;
}

/** Satellites watched every basin from about here on: counts before it miss storms */
const SATELLITE_ERA = 1966;
const BAR = '#5b8fd6';

const isHurricane = (cat: number) => cat >= 1;
const isMajor = (cat: number) => cat >= 3;

/** The regional agency's class, under the Saffir-Simpson one in a table cell */
const RegionalLine: React.FC<{ code: number | undefined }> = ({ code }) => {
  const { m } = useI18n();
  const r = code ? regional(code) : null;
  if (!r) return null;
  return (
    <span className="regional" title={r.agency.name}>
      {m.regional.withAgency(r.name, r.agency.short)}
    </span>
  );
};

/** A place's storm history: how many, how often, how strong when nearest, when in the year, and each one */
const PlaceReport: React.FC<PlaceReportProps> = ({
  near,
  km,
  tracks,
  nearby,
  radiiFor,
  measure,
  countries,
  outline,
  range,
  basins,
  minCat,
  query,
  loading,
  onBack,
}) => {
  const { m, month, number } = useI18n();
  const howOften = m.report.howOften;
  /**
   * Every storm in the report: those whose centre came within the distance, and those whose winds reached the place
   * though their centre stayed farther away; and the storms that came near enough for their winds to have reached it
   * but had no estimate of how far they did
   */
  const { listed, unestimated } = useMemo(
    () => (measure ? reportRows(tracks, nearby, measure, radiiFor) : { listed: [], unestimated: [] }),
    [tracks, nearby, measure, radiiFor],
  );
  /** The storms whose centre came within the distance: what the counts and charts above the winds are of */
  const rows = useMemo(() => listed.filter((r) => r.within), [listed]);

  // How often winds reached: over the seasons with estimates throughout
  const windsFrom = Math.max(range[0], WINDS_COMPLETE_FROM);
  const windYears = range[1] - windsFrom + 1;
  const windRows = listed.filter((r) => r.storm.season >= windsFrom);
  const reached = (kt: 34 | 50 | 64) => windsReached(listed, kt, windsFrom);
  const unknownWinds = unestimated.filter((s) => s.season >= windsFrom).length;

  const years = range[1] - range[0] + 1;
  const hurricanes = rows.filter((r) => isHurricane(r.closest.cat));
  const majors = rows.filter((r) => isMajor(r.closest.cat));
  // "Hurricane", "typhoon" or neither, by the basins the storms were in when nearest
  const term = termOfAll(rows.map((r) => basinAt(r.storm, r.closest.t)));
  const windTerm = termOfAll(windRows.map((r) => basinAt(r.storm, r.closest.t)));
  const latest = rows[0];
  // When the report was made (once, not on every render)
  const [madeAt] = useState(() => Date.now());
  const nowYear = new Date(madeAt).getUTCFullYear();

  const byMonth = useMemo(() => {
    const counts = new Array(12).fill(0);
    for (const r of rows) counts[new Date(r.closest.t * 3_600_000).getUTCMonth()]++;
    // Month names in the language showing (any year will do)
    return counts.map((n, i) => ({ label: month.format(Date.UTC(2001, i, 15)), n }));
  }, [rows, month]);
  const byDecade = useMemo(() => {
    const first = Math.floor(range[0] / 10) * 10;
    const last = Math.floor(range[1] / 10) * 10;
    const counts = new Map<number, number>();
    for (let d = first; d <= last; d += 10) counts.set(d, 0);
    for (const r of rows) {
      const d = Math.floor(r.storm.season / 10) * 10;
      counts.set(d, (counts.get(d) ?? 0) + 1);
    }
    return [...counts].map(([d, n]) => ({ label: m.report.decade(d), n }));
  }, [rows, range, m]);

  const placeName = nearLabel(near);
  const scope = [
    m.report.seasons(range[0], range[1]),
    basins.length ? basins.map(basinName).join(', ') : m.report.allBasins,
    m.report.strength[minCat],
    query.trim() ? m.report.named(query.trim()) : '',
  ].filter(Boolean);
  const ready = !loading && measure;
  const base = fileName('storms-near', placeName, `${km}km`, range[0], range[1]);

  return (
    <main className="report">
      <nav className="report-actions" aria-label={m.report.actions}>
        <button className="chip" onClick={onBack}>
          {m.report.back}
        </button>
        <span className="report-actions-right">
          <LanguagePicker />
          <button className="chip" disabled={!ready} onClick={() => download(`${base}.csv`, nearCsv(listed, near.name, km), 'text/csv')}>
            {m.report.downloadCsv}
          </button>
          <button
            className="chip"
            disabled={!ready}
            onClick={() => download(`${base}.geojson`, tracksGeoJson(listed.map((r) => r.track)), 'application/geo+json')}
          >
            {m.report.downloadGeoJson}
          </button>
          <button className="chip on" disabled={!ready} onClick={() => window.print()}>
            {m.report.print}
          </button>
        </span>
      </nav>

      <header className="report-head">
        <p className="report-kicker">{m.report.kicker}</p>
        <h1>{m.report.title(km, placeName)}</h1>
        <p className="report-scope">{scope.join(' · ')}</p>
      </header>

      {!ready ? (
        <p className="muted">{m.report.preparing}</p>
      ) : (
        <>
          <section className="tiles" aria-label={m.report.summary}>
            <Tile label={m.report.storms} value={number.format(rows.length)} note={howOften(rows.length, years)} />
            <Tile label={m.report.hurricanes(term)} value={number.format(hurricanes.length)} note={howOften(hurricanes.length, years)} />
            <Tile label={m.report.majors(term)} value={number.format(majors.length)} note={howOften(majors.length, years)} />
            <Tile
              label={m.report.mostRecent}
              value={latest ? displayName(latest.storm) : '—'}
              note={
                latest
                  ? `${formatDate(latest.closest.t)}${m.report.yearsAgo(nowYear - new Date(latest.closest.t * 3_600_000).getUTCFullYear())}`
                  : m.report.noneInSeasons
              }
            />
          </section>
          {range[0] < SATELLITE_ERA && (
            <p className="report-note">{m.report.satellite(SATELLITE_ERA)}</p>
          )}

          <section className="report-winds" aria-label={m.report.winds.title(placeName)}>
            <h2>{m.report.winds.title(placeName)}</h2>
            {windYears > 0 ? (
              <>
                <p className="report-scope">{m.report.winds.scope(windsFrom, range[1])}</p>
                <div className="tiles">
                  {(
                    [
                      [64, m.report.winds.hurricane(windTerm)],
                      [50, m.report.winds.kt50],
                      [34, m.report.winds.tropical],
                    ] as const
                  ).map(([kt, label]) => (
                    <Tile key={kt} label={label} value={number.format(reached(kt))} note={howOften(reached(kt), windYears)} />
                  ))}
                </div>
                {unknownWinds > 0 && <p className="report-note">{m.report.winds.unknown(unknownWinds)}</p>}
              </>
            ) : (
              <p className="report-note">{m.report.winds.noData}</p>
            )}
          </section>

          <section className="report-grid">
            <figure className="report-figure report-map-figure">
              <figcaption>{m.report.map}</figcaption>
              <MiniMap rows={listed} near={near} outline={outline} countries={countries} km={km} />
              <div className="report-legend" aria-label={m.report.legend}>
                {[...TROPICAL, OTHER[0]].map((c) => (
                  <span key={c.code}>
                    <i style={{ background: c.color }} />
                    {categoryLabel(c.code)}
                  </span>
                ))}
              </div>
            </figure>
            <div className="report-charts">
              <Columns title={m.report.byMonth} data={byMonth} />
              <Columns title={m.report.byDecade} data={byDecade} />
            </div>
          </section>

          <section aria-label={m.report.everyStorm}>
            <h2>{m.report.everyStormTitle}</h2>
            {listed.length ? (
              <div className="report-table-wrap">
                <table className="report-table">
                  <thead>
                    <tr>
                      <th>{m.report.table.storm}</th>
                      <th>{m.report.table.closest}</th>
                      <th className="num">{m.report.table.distance}</th>
                      <th>{m.report.table.strengthThen}</th>
                      <th className="num">{m.report.table.windThen}</th>
                      <th>{m.report.winds.column}</th>
                      <th>{m.report.table.peak}</th>
                      <th>{m.report.table.landfall}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {listed.map(({ storm, closest, reach }) => {
                      const then = category(closest.cat);
                      const peak = category(storm.peakCat);
                      return (
                        <tr key={storm.id}>
                          <td>
                            {displayName(storm)} <span className="muted">{storm.season}</span>
                          </td>
                          <td>{formatDate(closest.t)}</td>
                          <td className="num">
                            {near.kind === 'country' && closest.km < 1 ? m.report.overLand : m.units.km(Math.round(closest.km))}
                          </td>
                          <td>
                            <i className="swatch" style={{ background: then.color }} />
                            {categoryLabel(then.code)}
                            <RegionalLine code={closest.regional} />
                          </td>
                          <td className="num">{closest.wind ? m.units.kt(closest.wind) : '—'}</td>
                          <td className={reach ? 'reach' : 'muted'}>
                            {storm.season < RADII_FROM || reach === null ? m.report.winds.noEstimate : m.report.winds.cell[reach]}
                          </td>
                          <td>
                            <i className="swatch" style={{ background: peak.color }} />
                            {categoryLabel(peak.code)}
                            <RegionalLine code={storm.regional} />
                          </td>
                          <td>
                            {storm.landfalls?.map(countryName).join(', ') ??
                              (storm.landfall ? m.report.yes : storm.crossed ? '' : '—')}
                            {storm.crossed && (
                              <span className="crossed">
                                {m.report.table.alsoCrossed(storm.crossed.map(countryName).join(', '))}
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="muted">{m.report.noStorms(km)}</p>
            )}
            {listed.some((r) => !r.within) && <p className="report-note">{m.report.alsoListed(km)}</p>}
          </section>
        </>
      )}

      <footer className="report-foot">
        {(
          [
            [m.report.howTitle, m.report.how(km, near.kind === 'country')],
            [m.report.windsHowTitle, m.report.windsHow(km, near.kind === 'country')],
          ] as const
        ).map(([title, points]) => (
          <section key={title} className="report-how">
            <h3>{title}</h3>
            <ul>
              {points.map((point) => (
                <li key={point}>{point}</li>
              ))}
            </ul>
          </section>
        ))}
        <p>{m.report.data(CITATION)}</p>
        <p className="report-link">
          {m.report.made(formatDate(madeAt / 3_600_000), window.location.href.replace(/^https?:\/\//, ''))}
        </p>
      </footer>
    </main>
  );
};

const Tile: React.FC<{ label: string; value: string; note: string }> = ({ label, value, note }) => (
  <div className="tile">
    <span className="tile-label">{label}</span>
    <span className="tile-value">{value}</span>
    <span className="tile-note">{note}</span>
  </div>
);

/** One series of counts as columns: hover (or focus) a column for its value; the axis carries the rest */
const Columns: React.FC<{ title: string; data: { label: string; n: number }[] }> = ({ title, data }) => {
  const { m } = useI18n();
  const [hover, setHover] = useState<number | null>(null);
  const W = 420;
  const H = 150;
  const pad = { left: 28, right: 4, top: 10, bottom: 20 };
  const max = Math.max(1, ...data.map((d) => d.n));
  // Clean ticks: 0, step, 2·step… past the max
  const step = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500].find((s) => max / s <= 4) ?? Math.ceil(max / 4);
  const top = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let v = 0; v <= top; v += step) ticks.push(v);
  const band = (W - pad.left - pad.right) / data.length;
  const bw = Math.min(24, band - 2);
  const y = (v: number) => pad.top + (1 - v / top) * (H - pad.top - pad.bottom);
  const labelEvery = data.length > 14 ? Math.ceil(data.length / 10) : 1;
  const h = hover !== null ? data[hover] : null;
  return (
    <figure className="report-figure">
      <figcaption>{title}</figcaption>
      <div className="columns">
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${title}: ${data.map((d) => `${d.label} ${d.n}`).join(', ')}`}>
          {ticks.map((v) => (
            <g key={v}>
              <line x1={pad.left} x2={W - pad.right} y1={y(v)} y2={y(v)} className="col-grid" />
              <text x={pad.left - 5} y={y(v) + 3} className="col-axis" textAnchor="end">
                {v}
              </text>
            </g>
          ))}
          {data.map((d, i) => {
            const x = pad.left + i * band + (band - bw) / 2;
            const yTop = y(d.n);
            const r = Math.min(4, (y(0) - yTop) / 2, bw / 2);
            return (
              <g key={d.label} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
                {/* Hit target: the whole band, taller than the column */}
                <rect x={pad.left + i * band} y={pad.top} width={band} height={H - pad.top - pad.bottom} fill="transparent" />
                {d.n > 0 && (
                  <path
                    d={`M${x},${y(0)} V${yTop + r} Q${x},${yTop} ${x + r},${yTop} H${x + bw - r} Q${x + bw},${yTop} ${x + bw},${yTop + r} V${y(0)} Z`}
                    fill={BAR}
                    opacity={hover === null || hover === i ? 1 : 0.45}
                  />
                )}
                {i % labelEvery === 0 && (
                  <text x={pad.left + i * band + band / 2} y={H - 6} className="col-axis" textAnchor="middle">
                    {d.label}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
        {h && hover !== null && (
          <div
            className="col-tip"
            style={{ left: `${((pad.left + (hover + 0.5) * band) / W) * 100}%`, top: `${(y(h.n) / H) * 100}%` }}
          >
            {rich(m.report.columnTip(h.n, h.label), { n: <strong>{h.n}</strong> })}
          </div>
        )}
      </div>
    </figure>
  );
};

/**
 * The tracks around the place on a plain map (Natural Earth land, equirectangular, centred on the place), drawn
 * in SVG so it prints sharp and needs no map tiles
 */
const MiniMap: React.FC<{
  rows: { track: Track }[];
  near: Near;
  outline: GeoJSON.FeatureCollection;
  countries: GeoJSON.FeatureCollection | null;
  km: number;
}> = ({ rows, near, outline, countries, km }) => {
  const { m } = useI18n();
  const W = 520;
  const H = 360;
  const view = useMemo(() => {
    // Frame the outline, with room around it for the tracks' approach
    let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
    const center = near.kind === 'point' ? near.lon : null;
    const walk = (c: unknown): void => {
      if (typeof (c as number[])[0] === 'number') {
        const [x, yy] = c as number[];
        w = Math.min(w, x);
        e = Math.max(e, x);
        s = Math.min(s, yy);
        n = Math.max(n, yy);
      } else (c as unknown[]).forEach(walk);
    };
    for (const f of outline.features) if ('coordinates' in f.geometry) walk(f.geometry.coordinates);
    if (e - w > 180) {
      // A country across the date line: frame it on 0…360
      w = Infinity;
      e = -Infinity;
      const walk360 = (c: unknown): void => {
        if (typeof (c as number[])[0] === 'number') {
          const x = (c as number[])[0] < 0 ? (c as number[])[0] + 360 : (c as number[])[0];
          w = Math.min(w, x);
          e = Math.max(e, x);
        } else (c as unknown[]).forEach(walk360);
      };
      for (const f of outline.features) if ('coordinates' in f.geometry) walk360(f.geometry.coordinates);
    }
    const lat0 = (s + n) / 2;
    const lon0 = center ?? (w + e) / 2;
    const k = Math.cos((lat0 * Math.PI) / 180);
    const margin = Math.max(2, (km / 111) * 1.5);
    let spanX = (e - w) * k + 2 * margin;
    let spanY = n - s + 2 * margin;
    // Fit the frame's shape
    if (spanX / spanY > W / H) spanY = (spanX * H) / W;
    else spanX = (spanY * W) / H;
    const scale = W / spanX;
    return { lat0, lon0, k, scale, spanX, spanY };
  }, [outline, near, km]);

  const { lat0, lon0, k, scale } = view;
  const wrap = (d: number) => ((((d + 180) % 360) + 360) % 360) - 180;
  const px = (lon: number) => W / 2 + wrap(lon - lon0) * k * scale;
  const py = (lat: number) => H / 2 - (lat - lat0) * scale;
  /** A line as an SVG path, broken where it wraps round the far side of the world */
  const path = (coords: number[][], close = false) => {
    let d = '';
    let prev: number | null = null;
    for (const [lon, lat] of coords) {
      const x = px(lon);
      const y = py(lat);
      d += `${prev === null || Math.abs(x - prev) > W ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
      prev = x;
    }
    return close ? `${d}Z` : d;
  };

  const land = useMemo(() => {
    if (!countries) return '';
    const lonSpan = view.spanX / view.k / 2 + 5;
    const latSpan = view.spanY / 2 + 5;
    let d = '';
    for (const f of countries.features) {
      const g = f.geometry;
      const polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
      for (const poly of polys) {
        const ring = poly[0];
        // Only shapes with a point near the frame
        if (!ring.some(([lon, lat]) => Math.abs(wrap(lon - lon0)) < lonSpan && Math.abs(lat - lat0) < latSpan)) continue;
        for (const r of poly) d += path(r, true);
      }
    }
    return d;
    // path reads only the view
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [countries, view]);

  const tracks = useMemo(() => {
    const out: { d: string; color: string; key: string }[] = [];
    for (const { track } of rows) {
      // Runs at one strength, each in its colour (as on the main map)
      let run: number[][] = [];
      let cat = track.points[0]?.cat;
      const flush = () => {
        if (run.length > 1) out.push({ d: path(run), color: category(cat).color, key: `${track.storm.id}-${out.length}` });
      };
      for (const p of track.points) {
        run.push([p.lon, p.lat]);
        if (p.cat !== cat) {
          flush();
          run = [[p.lon, p.lat]];
          cat = p.cat;
        }
      }
      flush();
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, view]);

  const outlinePath = outline.features
    .flatMap((f) => {
      const g = f.geometry;
      if (g.type === 'Polygon') return g.coordinates.map((r) => path(r, true));
      if (g.type === 'MultiPolygon') return g.coordinates.flatMap((p) => p.map((r) => path(r, true)));
      return [];
    })
    .join('');

  return (
    <svg className="minimap" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={m.report.mapLabel(rows.length, nearLabel(near))}>
      <defs>
        <clipPath id="minimap-clip">
          <rect width={W} height={H} rx="6" />
        </clipPath>
      </defs>
      <g clipPath="url(#minimap-clip)">
        <rect width={W} height={H} className="minimap-sea" />
        <path d={land} className="minimap-land" />
        {tracks.map((t) => (
          <path key={t.key} d={t.d} stroke={t.color} className="minimap-track" />
        ))}
        <path d={outlinePath} className="minimap-outline" />
        {near.kind === 'point' && <circle cx={px(near.lon)} cy={py(near.lat)} r="4" className="minimap-dot" />}
      </g>
    </svg>
  );
};

export default PlaceReport;
