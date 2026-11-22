import { useI18n } from '../i18n';

interface YearRangeProps {
  min: number;
  max: number;
  value: [number, number];
  onChange: (value: [number, number]) => void;
}

/** Two thumbs on one track: the first and last season shown */
const YearRange: React.FC<YearRangeProps> = ({ min, max, value: [from, to], onChange }) => {
  const { m } = useI18n();
  const pct = (y: number) => ((y - min) / (max - min)) * 100;
  return (
    <div className="year-range">
      <div className="year-range-values">
        <span>{from}</span>
        <span className="year-range-dash">{m.years.to}</span>
        <span>{to}</span>
      </div>
      <div className="year-range-track">
        <div className="year-range-fill" style={{ left: `${pct(from)}%`, right: `${100 - pct(to)}%` }} />
        <input
          type="range"
          min={min}
          max={max}
          value={from}
          aria-label={m.years.first}
          onChange={(e) => onChange([Math.min(Number(e.target.value), to), to])}
        />
        <input
          type="range"
          min={min}
          max={max}
          value={to}
          aria-label={m.years.last}
          onChange={(e) => onChange([from, Math.max(Number(e.target.value), from)])}
        />
      </div>
      <div className="year-range-ends">
        <span>{min}</span>
        <span>{max}</span>
      </div>
    </div>
  );
};

export default YearRange;
