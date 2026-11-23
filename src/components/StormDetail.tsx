import { basinName, category, categoryLabel, kt, regional, termOf, TROPICAL } from '../data/categories';
import { download, fileName, pointsCsv, tracksGeoJson } from '../data/exports';
import { widest } from '../data/footprint';
import { basinAt, displayName, formatDate, type Radii, type Storm, type TrackPoint } from '../data/storms';
import { countryName, useI18n } from '../i18n';

interface StormDetailProps {
  storm: Storm;
  points: TrackPoint[] | null;
  /** How far its winds reached at each report, or null when no agency estimated it */
  radii: (Radii | null)[] | null;
  /** How far its 12 ft seas reached at each report, or null when there are no estimates */
  seas: (Radii | null)[] | null;
  /** Whether its wind footprint is shaded on the map */
  shaded: boolean;
  onClose: () => void;
}

/** One storm: what it peaked at, when, where, and its wind over its life */
const StormDetail: React.FC<StormDetailProps> = ({ storm, points, radii, seas, shaded, onClose }) => {
  const { m, list } = useI18n();
  const peak = category(storm.peakCat);
  const days = (storm.end - storm.start) / 24;
  const notRecorded = <span className="muted">{m.storm.notRecorded}</span>;
  const ts = widest(radii, 0);
  const hurricane = widest(radii, 8);
  const roughSeas = widest(seas, 0);
  // A provisional record (IBTrACS's stand-in until the agency's final one, from real-time messages) often has only the
  // 34 kt extents, even for a storm that reached 64 kt
  const pending = Boolean(storm.provisional && ts && !hurricane && storm.peakWind !== null && storm.peakWind >= 64);
  const local = storm.regional ? regional(storm.regional) : null;
  // "Hurricane-force" or "typhoon-force", by the basin it was in at its strongest
  const strongest = points?.reduce<TrackPoint | null>((a, p) => (p.wind !== null && (!a || p.wind > a.wind!) ? p : a), null);
  const term = termOf(strongest ? basinAt(storm, strongest.t) : storm.basins[0]);
  return (
    <section className="detail" aria-label={`${displayName(storm)} (${storm.season})`}>
      <header className="detail-head">
        <button className="back" onClick={onClose} aria-label={m.storm.back}>
          ←
        </button>
        <div>
          <h2>
            {displayName(storm)} <span className="detail-season">{storm.season}</span>
          </h2>
          <span className="badge" style={{ background: peak.color }}>
            {categoryLabel(peak.code)}
          </span>
          {storm.provisional && <span className="provisional">{m.storm.provisional}</span>}
        </div>
      </header>
      <dl className="stats">
        <dt>{m.storm.dates}</dt>
        <dd>
          {formatDate(storm.start)} – {formatDate(storm.end)} <span className="muted">({m.storm.days(days)})</span>
        </dd>
        <dt>{m.storm.peakWind}</dt>
        <dd>{storm.peakWind ? m.units.wind(storm.peakWind, kt.mph(storm.peakWind), kt.kmh(storm.peakWind)) : notRecorded}</dd>
        {local && (
          <>
            <dt title={m.storm.regionalTitle}>{m.storm.regional}</dt>
            <dd title={local.agency.name}>
              {m.regional.withAgency(local.name, local.agency.short)}
              {storm.regionalWind ? (
                <span className="muted"> · {m.regional.wind(storm.regionalWind, local.minutes)}</span>
              ) : null}
            </dd>
          </>
        )}
        <dt>{m.storm.lowestPressure}</dt>
        <dd>{storm.minPres ? m.units.mb(storm.minPres) : notRecorded}</dd>
        <dt>{m.storm.ace}</dt>
        <dd>{storm.ace || <span className="muted">—</span>}</dd>
        <dt>{m.storm.basin}</dt>
        <dd>{storm.basins.map(basinName).join(', ')}</dd>
        <dt>{m.storm.overLand}</dt>
        <dd>
          {storm.landfalls?.length
            ? m.storm.landfallIn(list.format(storm.landfalls.map(countryName)))
            : storm.landfall
              ? m.storm.madeLandfall
              : storm.crossed
                ? null
                : m.storm.stayedAtSea}
          {/* Countries it reached over land, from a neighbour, rather than from the sea */}
          {storm.crossed && (
            <span className="crossed">
              {(storm.landfall ? m.storm.alsoCrossed : m.storm.crossed)(list.format(storm.crossed.map(countryName)))}
            </span>
          )}
        </dd>
        {ts !== null && (
          <>
            <dt>{m.storm.windField}</dt>
            <dd>
              {m.storm.windFieldText(Math.round(ts), hurricane ? Math.round(hurricane) : null, term)}
              {pending && <span className="muted pending-note">{m.storm.windFieldPending(term)}</span>}
            </dd>
          </>
        )}
        {roughSeas ? (
          <>
            <dt>{m.storm.seas}</dt>
            <dd>{m.storm.seasText(Math.round(roughSeas))}</dd>
          </>
        ) : null}
      </dl>
      {shaded && (
        <div className="footprint-key small">
          <span className="muted">{m.storm.footprint}</span>
          {ts ? (
            <span>
              <i className="footprint-swatch ts" /> {m.storm.footprint34}
            </span>
          ) : null}
          {hurricane ? (
            <span>
              <i className="footprint-swatch hurricane" /> {m.storm.footprint64(term)}
            </span>
          ) : null}
          {roughSeas ? (
            <span>
              <i className="footprint-swatch seas" /> {m.storm.footprintSeas}
            </span>
          ) : null}
        </div>
      )}
      {points ? <WindChart points={points} /> : <p className="muted">{m.storm.loadingTrack}</p>}
      {points && <SeaChart points={points} />}
      <p className="muted small">{m.storm.hint}</p>
      {points && (
        <p className="downloads small">
          <span className="muted">{m.storm.downloadTrack}</span>
          <button
            className="link-inline"
            onClick={() =>
              download(`${fileName(displayName(storm), storm.season, storm.id)}.csv`, pointsCsv([{ storm, points }]), 'text/csv')
            }
          >
            CSV
          </button>
          <button
            className="link-inline"
            onClick={() =>
              download(
                `${fileName(displayName(storm), storm.season, storm.id)}.geojson`,
                tracksGeoJson([{ storm, points }]),
                'application/geo+json',
              )
            }
          >
            GeoJSON
          </button>
        </p>
      )}
    </section>
  );
};

// The charts are drawn about as wide as they show in the panel (300 units ≈ 300 px), so text sizes in App.css
// (.chart-label) are close to their size on screen
const W = 300;
const H = 150;
const PAD = { left: 34, right: 8, top: 10, bottom: 24 };

/** Marks along the time axis: a mark every 1, 2 or 5 days, by how long the storm lasted */
function dayTicks(t0: number, t1: number) {
  const totalDays = (t1 - t0) / 24;
  const every = totalDays > 20 ? 5 : totalDays > 8 ? 2 : 1;
  const ticks: number[] = [];
  for (let d = 0; d <= totalDays; d += every) ticks.push(d);
  return ticks;
}

/** The days along the bottom of a chart h units tall */
const DayAxis: React.FC<{ t0: number; t1: number; h: number; x: (t: number) => number }> = ({ t0, t1, h, x }) => {
  const { m } = useI18n();
  return (
    <>
      {dayTicks(t0, t1).map((d) => (
        <text key={d} x={x(t0 + d * 24)} y={h - 7} className="chart-label" textAnchor={d === 0 ? 'start' : 'middle'}>
          {d === 0 ? m.storm.day0 : d}
        </text>
      ))}
    </>
  );
};

/** Wind over the storm's life, on the category bands */
const WindChart: React.FC<{ points: TrackPoint[] }> = ({ points }) => {
  const { m } = useI18n();
  const winds = points.filter((p) => p.wind !== null);
  if (winds.length < 2) return <p className="muted">{m.storm.noWind}</p>;
  const t0 = points[0].t;
  const t1 = points[points.length - 1].t;
  const top = Math.max(160, ...winds.map((p) => p.wind!));
  const x = (t: number) => PAD.left + ((t - t0) / Math.max(1, t1 - t0)) * (W - PAD.left - PAD.right);
  const y = (k: number) => PAD.top + (1 - k / top) * (H - PAD.top - PAD.bottom);
  const bands = TROPICAL.map((c, i) => ({ c, lo: c.fromKt!, hi: TROPICAL[i + 1]?.fromKt ?? top }));

  return (
    <figure className="chart">
      <figcaption>{m.storm.chart}</figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={m.storm.chartLabel}>
        {bands.map(({ c, lo, hi }) => (
          <rect
            key={c.code}
            x={PAD.left}
            width={W - PAD.left - PAD.right}
            y={y(hi)}
            height={y(lo) - y(hi)}
            fill={c.color}
            opacity={0.1}
          />
        ))}
        {[34, 64, 96, 137].map((k) => (
          <g key={k}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(k)} y2={y(k)} className="chart-grid" />
            <text x={PAD.left - 5} y={y(k) + 3.5} className="chart-label" textAnchor="end">
              {k}
            </text>
          </g>
        ))}
        <DayAxis t0={t0} t1={t1} h={H} x={x} />
        <polyline
          className="chart-line"
          points={winds.map((p) => `${x(p.t).toFixed(1)},${y(p.wind!).toFixed(1)}`).join(' ')}
        />
        {winds.map((p, i) => (
          <circle key={i} cx={x(p.t)} cy={y(p.wind!)} r={2.2} fill={category(p.cat).color} />
        ))}
      </svg>
    </figure>
  );
};

/** Storms usually need water at least this warm (°C) to strengthen */
const WARM_ENOUGH = 26;

/** The sea temperature under the centre over the storm's life, where there's a reading (from 1981, over water) */
const SeaChart: React.FC<{ points: TrackPoint[] }> = ({ points }) => {
  const { m } = useI18n();
  const known = points.filter((p) => p.sst !== null);
  if (known.length < 2) return null;
  const t0 = points[0].t;
  const t1 = points[points.length - 1].t;
  const low = Math.floor(Math.min(WARM_ENOUGH - 4, ...known.map((p) => p.sst!)));
  const high = Math.ceil(Math.max(WARM_ENOUGH + 4, ...known.map((p) => p.sst!)));
  const h = 110;
  const x = (t: number) => PAD.left + ((t - t0) / Math.max(1, t1 - t0)) * (W - PAD.left - PAD.right);
  const y = (c: number) => PAD.top + (1 - (c - low) / (high - low)) * (h - PAD.top - PAD.bottom);
  // A line for each run of reports with a reading (over land there's none)
  const runs: TrackPoint[][] = [];
  let run: TrackPoint[] = [];
  for (const p of points) {
    if (p.sst === null) {
      if (run.length) runs.push(run);
      run = [];
    } else run.push(p);
  }
  if (run.length) runs.push(run);
  return (
    <figure className="chart">
      <figcaption>{m.storm.seaChart}</figcaption>
      <svg viewBox={`0 0 ${W} ${h}`} role="img" aria-label={m.storm.seaChartLabel}>
        {[low, high].map((c) => (
          <g key={c}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(c)} y2={y(c)} className="chart-grid" />
            <text x={PAD.left - 5} y={y(c) + 3.5} className="chart-label" textAnchor="end">
              {c}
            </text>
          </g>
        ))}
        <line x1={PAD.left} x2={W - PAD.right} y1={y(WARM_ENOUGH)} y2={y(WARM_ENOUGH)} className="chart-threshold" />
        <text x={PAD.left - 5} y={y(WARM_ENOUGH) + 3.5} className="chart-label threshold" textAnchor="end">
          {WARM_ENOUGH}
        </text>
        <DayAxis t0={t0} t1={t1} h={h} x={x} />
        {runs.map((r, i) => (
          <polyline
            key={i}
            className="chart-line sea"
            points={r.map((p) => `${x(p.t).toFixed(1)},${y(p.sst!).toFixed(1)}`).join(' ')}
          />
        ))}
      </svg>
      <p className="muted small">{m.storm.seaChartNote}</p>
    </figure>
  );
};

export default StormDetail;
