import { useEffect, useRef, useState } from 'react';
import { formatDate } from '../data/storms';
import { useI18n } from '../i18n';

interface PlaybarProps {
  /** First start and last end of the storms in view, hours since 1970 */
  from: number;
  to: number;
  /** When at least one storm in view is under way: [start, end] stretches, in order, not overlapping */
  busy: [number, number][];
  /** Just one storm in view: start at the slowest speed */
  single: boolean;
  /** Called with the time shown (every frame while playing), and with null on closing */
  onTime: (t: number | null) => void;
  /** Holds while a storm is chosen, and carries on after */
  paused: boolean;
  onClose: () => void;
}

/** Days per second while a storm is under way, whatever the speed chosen, so it doesn't zip by */
const STORM_SPEED = 7;
/**
 * Coming up to a storm from a quiet stretch, the speed drops to this many times the days left (per second), so it
 * eases in rather than jumping from years a second to a week; leaving one, it picks up over about half a second.
 */
const EASE_IN = 3;
const PICK_UP = 2;

/** The first busy stretch ending at or after t (binary search), and whether t is inside it */
function locate(busy: [number, number][], t: number): { next: [number, number] | undefined; inside: boolean } {
  let lo = 0;
  let hi = busy.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (busy[mid][1] < t) lo = mid + 1;
    else hi = mid;
  }
  const next = busy[lo];
  return { next, inside: Boolean(next && next[0] <= t) };
}

/** How much time passes each second between storms, in days (their names are in src/i18n) */
const SPEEDS = [7, 30, 182, 730] as const;

/** Plays the storms in view through time: each one appears as it forms and leaves its track behind */
const Playbar: React.FC<PlaybarProps> = ({ from, to, busy, single, onTime, paused, onClose }) => {
  const { m } = useI18n();
  const [t, setT] = useState(from);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(single ? STORM_SPEED : 30);

  // Keep inside the range when the filters change it
  const shown = Math.min(Math.max(t, from), to);

  const latest = useRef({ speed, from, to, busy, t: shown });
  /** The speed actually playing, in days per second (eased towards the one wanted) */
  const rate = useRef(STORM_SPEED);
  useEffect(() => {
    latest.current = { speed, from, to, busy, t: shown };
  });
  const running = playing && !paused;

  useEffect(() => onTime(shown), [shown, onTime]);
  useEffect(() => () => onTime(null), [onTime]);
  useEffect(() => {
    if (!running) return;
    let last = performance.now();
    let frame = requestAnimationFrame(function tick(now) {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const { speed, from, to, busy, t: prev } = latest.current;
      const t = Math.max(prev, from);
      // Slow while a storm is under way; between storms, the speed chosen, easing down ahead of the next one and
      // never jumping past its start
      const { next, inside } = locate(busy, t);
      let want = speed;
      let stop = to;
      if (inside) want = Math.min(speed, STORM_SPEED);
      else if (next) {
        want = Math.min(speed, Math.max(STORM_SPEED, ((next[0] - t) / 24) * EASE_IN));
        stop = next[0];
      }
      rate.current = want < rate.current ? want : rate.current + (want - rate.current) * Math.min(1, dt * PICK_UP);
      const moved = Math.min(t + dt * rate.current * 24, stop);
      latest.current.t = moved;
      setT(moved);
      if (moved >= to) {
        setPlaying(false);
        return;
      }
      frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  }, [running]);

  const slowed = speed > STORM_SPEED && locate(busy, shown).inside;

  const toggle = () => {
    if (!playing && shown >= to) setT(from);
    setPlaying((p) => !p);
  };

  return (
    <div className="playbar" role="region" aria-label={m.playbar.region}>
      <button className="play" onClick={toggle} aria-label={playing ? m.playbar.pause : m.playbar.play}>
        {playing ? (
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <rect x="3" y="2" width="3.5" height="12" rx="1" />
            <rect x="9.5" y="2" width="3.5" height="12" rx="1" />
          </svg>
        ) : (
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path d="M4 2.5v11a.8.8 0 0 0 1.2.7l9-5.5a.8.8 0 0 0 0-1.4l-9-5.5A.8.8 0 0 0 4 2.5Z" />
          </svg>
        )}
      </button>
      <div className="playbar-main">
        <div className="playbar-top">
          <span className="playbar-date" aria-live="off">
            {formatDate(shown)}
            {slowed && <span className="playbar-slowed"> · {m.playbar.slowed}</span>}
          </span>
          <span className="playbar-speeds" role="group" aria-label={m.playbar.speeds}>
            {SPEEDS.map((days) => (
              <button
                key={days}
                className={`chip small-chip${speed === days ? ' on' : ''}`}
                onClick={() => setSpeed(days)}
                aria-pressed={speed === days}
              >
                {m.playbar.speed[days]}
              </button>
            ))}
          </span>
        </div>
        <input
          className="playbar-scrub"
          type="range"
          min={from}
          max={to}
          step={1}
          value={shown}
          aria-label={m.playbar.date}
          aria-valuetext={formatDate(shown)}
          onChange={(e) => setT(Number(e.target.value))}
        />
      </div>
      <button className="playbar-close" onClick={onClose} aria-label={m.playbar.close}>
        ✕
      </button>
    </div>
  );
};

export default Playbar;
