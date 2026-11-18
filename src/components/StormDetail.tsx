import { BASINS, category, kt, TROPICAL } from '../data/categories';
import { displayName, formatDate, type Storm, type TrackPoint } from '../data/storms';

interface StormDetailProps {
  storm: Storm;
  points: TrackPoint[] | null;
  onClose: () => void;
}

const windText = (k: number) => `${k} kt · ${kt.mph(k)} mph · ${kt.kmh(k)} km/h`;

/** One storm: what it peaked at, when, where, and its wind over its life */
const StormDetail: React.FC<StormDetailProps> = ({ storm, points, onClose }) => {
  const peak = category(storm.peakCat);
  const days = (storm.end - storm.start) / 24;
  return (
    <section className="detail" aria-label={`${displayName(storm)} (${storm.season})`}>
      <header className="detail-head">
        <button className="back" onClick={onClose} aria-label="Back to the list">
          ←
        </button>
        <div>
          <h2>
            {displayName(storm)} <span className="detail-season">{storm.season}</span>
          </h2>
          <span className="badge" style={{ background: peak.color }}>
            {peak.label}
          </span>
          {storm.provisional && <span className="provisional">provisional</span>}
        </div>
      </header>
      <dl className="stats">
        <dt>Dates</dt>
        <dd>
          {formatDate(storm.start)} – {formatDate(storm.end)}{' '}
          <span className="muted">({days < 1 ? 'under a day' : `${Math.round(days * 10) / 10} days`})</span>
        </dd>
        <dt>Peak wind</dt>
        <dd>{storm.peakWind ? windText(storm.peakWind) : <span className="muted">not recorded</span>}</dd>
        <dt>Lowest pressure</dt>
        <dd>{storm.minPres ? `${storm.minPres} mb` : <span className="muted">not recorded</span>}</dd>
        <dt>Energy (ACE)</dt>
        <dd>{storm.ace || <span className="muted">—</span>}</dd>
        <dt>Basin</dt>
        <dd>{storm.basins.map((b) => BASINS[b] ?? b).join(', ')}</dd>
        <dt>Over land</dt>
        <dd>{storm.landfall ? 'Made landfall' : 'Stayed at sea'}</dd>
      </dl>
      {points ? <WindChart points={points} /> : <p className="muted">Loading the track…</p>}
      <p className="muted small">Tap or hover the dots on the map for each report.</p>
    </section>
  );
};

const W = 300;
const H = 130;
const PAD = { left: 30, right: 6, top: 8, bottom: 20 };

/** Wind over the storm's life, on the category bands */
const WindChart: React.FC<{ points: TrackPoint[] }> = ({ points }) => {
  const winds = points.filter((p) => p.wind !== null);
  if (winds.length < 2) return <p className="muted">No wind readings for this storm.</p>;
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
      <figcaption>Wind (kt) over the storm's life</figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Wind speed over time">
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
            {d === 0 ? 'day 0' : d}
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
