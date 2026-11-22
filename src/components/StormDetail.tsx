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
  /** Whether its wind footprint is shaded on the map */
  shaded: boolean;
  onClose: () => void;
}

/** One storm: what it peaked at, when, where, and its wind over its life */
const StormDetail: React.FC<StormDetailProps> = ({ storm, points, radii, shaded, onClose }) => {
  const { m, list } = useI18n();
  const peak = category(storm.peakCat);
  const days = (storm.end - storm.start) / 24;
  const notRecorded = <span className="muted">{m.storm.notRecorded}</span>;
  const ts = widest(radii, 0);
  const hurricane = widest(radii, 8);
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
            <dd>{m.storm.windFieldText(Math.round(ts), hurricane ? Math.round(hurricane) : null, term)}</dd>
          </>
        )}
      </dl>
      {shaded && (
        <div className="footprint-key small">
          <span className="muted">{m.storm.footprint}</span>
          <span>
            <i className="footprint-swatch ts" /> {m.storm.footprint34}
          </span>
          {hurricane ? (
            <span>
              <i className="footprint-swatch hurricane" /> {m.storm.footprint64(term)}
            </span>
          ) : null}
        </div>
      )}
      {points ? <WindChart points={points} /> : <p className="muted">{m.storm.loadingTrack}</p>}
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

const W = 300;
const H = 130;
const PAD = { left: 30, right: 6, top: 8, bottom: 20 };

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
  const totalDays = (t1 - t0) / 24;
  const tickEvery = totalDays > 20 ? 5 : totalDays > 8 ? 2 : 1;
  const ticks: number[] = [];
  for (let d = 0; d <= totalDays; d += tickEvery) ticks.push(d);

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
            <text x={PAD.left - 4} y={y(k) + 3} className="chart-label" textAnchor="end">
              {k}
            </text>
          </g>
        ))}
        {ticks.map((d) => (
          <text key={d} x={x(t0 + d * 24)} y={H - 6} className="chart-label" textAnchor="middle">
            {d === 0 ? m.storm.day0 : d}
          </text>
        ))}
        <polyline
          className="chart-line"
          points={winds.map((p) => `${x(p.t).toFixed(1)},${y(p.wind!).toFixed(1)}`).join(' ')}
        />
        {winds.map((p, i) => (
          <circle key={i} cx={x(p.t)} cy={y(p.wind!)} r={1.8} fill={category(p.cat).color} />
        ))}
      </svg>
    </figure>
  );
};

export default StormDetail;
