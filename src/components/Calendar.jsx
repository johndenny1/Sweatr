import { useEffect, useMemo, useRef, useState } from 'react';
import { useMyParlays } from '../lib/myParlays.js';
import { pnlEntries, byDay, cumulative, dayKey } from '../lib/pnl.js';
import { fmtMoney } from '../lib/money.js';

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const RANGES = [
  { id: '7d', label: '7D', days: 7 },
  { id: '30d', label: '30D', days: 30 },
  { id: '90d', label: '90D', days: 90 },
  { id: 'all', label: 'All', days: null },
];

function short(v) {
  const a = Math.abs(v);
  const sign = v > 0 ? '+' : v < 0 ? '−' : '';
  if (a >= 1000) return `${sign}$${(a / 1000).toFixed(a >= 10000 ? 0 : 1)}k`;
  if (a > 0 && a < 1) return `${sign}<$1`;
  return `${sign}$${Math.round(a)}`;
}

export default function Calendar({ user, onOpen }) {
  const { parlays, statuses } = useMyParlays(user.id);
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [selected, setSelected] = useState(null);
  const [range, setRange] = useState('30d');



  const entries = useMemo(() => pnlEntries(parlays || [], statuses), [parlays, statuses]);
  const days = useMemo(() => byDay(entries), [entries]);

  // month grid
  const first = month;
  const daysInMonth = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < first.getDay(); i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(first.getFullYear(), first.getMonth(), d));
  while (cells.length % 7) cells.push(null);

  const monthDays = cells.filter(Boolean).map((d) => days[dayKey(d)]).filter(Boolean);
  const monthProfit = Math.round(monthDays.reduce((s, d) => s + d.profit, 0) * 100) / 100;
  const monthW = monthDays.reduce((s, d) => s + d.wins, 0);
  const monthL = monthDays.reduce((s, d) => s + d.losses, 0);
  const maxAbs = Math.max(1, ...monthDays.map((d) => Math.abs(d.profit)));
  const greenDays = monthDays.filter((d) => d.profit > 0).length;
  const redDays = monthDays.filter((d) => d.profit < 0).length;
  const todayKey = dayKey(new Date());
  const thisMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const canNext = month < thisMonth;

  const shift = (n) => {
    setMonth(new Date(month.getFullYear(), month.getMonth() + n, 1));
    setSelected(null);
  };

  const sel = selected ? days[selected] : null;

  return (
    <div className="stack calendar-page">
      <div className="rooms-hero">
        <div className="rooms-kicker">Profit &amp; loss</div>
        <h1>Calendar</h1>
      </div>

      <div className="card cal-card">
        <div className="cal-head">
          <button className="cal-nav" onClick={() => shift(-1)} aria-label="Previous month">
            ‹
          </button>
          <div className="cal-month">{month.toLocaleDateString([], { month: 'long', year: 'numeric' })}</div>
          <button className="cal-nav" onClick={() => shift(1)} disabled={!canNext} aria-label="Next month">
            ›
          </button>
        </div>
        <div className="cal-total">
          <span className={`cal-total-num ${monthProfit > 0 ? 'pos' : monthProfit < 0 ? 'neg' : ''}`}>
            {fmtMoney(monthProfit, { sign: true })}
          </span>
          <span className="muted small">
            {monthW}-{monthL} · {greenDays} green {greenDays === 1 ? 'day' : 'days'} · {redDays} red
          </span>
        </div>

        <div className="cal-grid">
          {WEEKDAYS.map((w, i) => (
            <div key={i} className="cal-wd">
              {w}
            </div>
          ))}
          {cells.map((d, i) => {
            if (!d) return <div key={i} className="cal-cell empty" />;
            const k = dayKey(d);
            const info = days[k];
            const strength = info ? 0.18 + 0.5 * Math.min(1, Math.abs(info.profit) / maxAbs) : 0;
            const style = info
              ? {
                  background: info.profit >= 0 ? `rgba(47, 227, 154, ${strength})` : `rgba(255, 77, 109, ${strength})`,
                  borderColor: info.profit >= 0 ? 'rgba(47, 227, 154, 0.55)' : 'rgba(255, 77, 109, 0.5)',
                }
              : undefined;
            return (
              <button
                key={i}
                className={`cal-cell ${info ? 'has' : ''} ${k === todayKey ? 'today' : ''} ${selected === k ? 'sel' : ''}`}
                style={style}
                onClick={() => setSelected(selected === k ? null : k)}
                disabled={!info}
              >
                <span className="cal-date">{d.getDate()}</span>
                {info && <span className="cal-amt">{short(info.profit)}</span>}
              </button>
            );
          })}
        </div>

        {sel && (
          <div className="cal-day">
            <div className="row between">
              <b>
                {new Date(`${selected}T12:00:00`).toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' })}
              </b>
              <span className={sel.profit >= 0 ? 'pos-text' : 'neg-text'}>{fmtMoney(sel.profit, { sign: true })}</span>
            </div>
            {sel.entries.map((e) => (
              <button key={e.parlay.id} className="cal-slip" onClick={() => onOpen(e.parlay.id)}>
                <span className={`dot-${e.parlay.status}`} />
                <span className="cal-slip-name">{e.parlay.name}</span>
                <span className={e.profit >= 0 ? 'pos-text' : 'neg-text'}>{fmtMoney(e.profit, { sign: true })}</span>
                <span className="watch">›</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <ProfitChart entries={entries} range={range} setRange={setRange} />

      <p className="muted small center">Verified slips only · days use the time each slip settled</p>
    </div>
  );
}

function ProfitChart({ entries, range, setRange }) {
  const r = RANGES.find((x) => x.id === range);
  const since = r.days ? new Date(Date.now() - r.days * 86400000) : null;
  const points = useMemo(() => cumulative(entries, since), [entries, range]); // eslint-disable-line react-hooks/exhaustive-deps
  const [hover, setHover] = useState(null);
  const svgRef = useRef(null);

  const W = 340;
  const H = 180;
  const P = { l: 6, r: 6, t: 14, b: 14 };
  const vals = points.map((p) => p.value);
  let lo = Math.min(0, ...vals);
  let hi = Math.max(0, ...vals);
  if (hi === lo) hi = lo + 1;
  const n = points.length;
  const X = (i) => P.l + (n > 1 ? i / (n - 1) : 0.5) * (W - P.l - P.r);
  const Y = (v) => P.t + (1 - (v - lo) / (hi - lo)) * (H - P.t - P.b);
  const last = vals[n - 1] ?? 0;
  const startVal = vals[0] ?? 0;
  const change = Math.round((last - startVal) * 100) / 100;
  const up = (hover != null ? vals[hover] : last) >= 0;
  const color = up ? 'var(--won)' : 'var(--lost)';
  const line = points.map((p, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)},${Y(p.value).toFixed(1)}`).join(' ');
  const area = n > 1 ? `${line} L${X(n - 1).toFixed(1)},${Y(0).toFixed(1)} L${X(0).toFixed(1)},${Y(0).toFixed(1)} Z` : '';

  function onMove(e) {
    const box = svgRef.current?.getBoundingClientRect();
    if (!box || n < 2) return;
    const x = ((e.clientX - box.left) / box.width) * W;
    const i = Math.round(((x - P.l) / (W - P.l - P.r)) * (n - 1));
    setHover(Math.max(0, Math.min(n - 1, i)));
  }

  const shownVal = hover != null ? vals[hover] : last;
  const shownDate = hover != null && hover > 0 ? points[hover].date : null;

  return (
    <div className="card chart-card">
      <div className="row between">
        <div>
          <div className="label">Profit progression</div>
          <div className={`chart-big ${shownVal > 0 ? 'pos' : shownVal < 0 ? 'neg' : ''}`}>{fmtMoney(shownVal, { sign: true })}</div>
          <div className="muted small">
            {shownDate
              ? shownDate.toLocaleDateString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
              : n > 1
                ? `${fmtMoney(change, { sign: true })} ${r.days ? `in the last ${r.days} days` : 'all time'}`
                : 'No settled slips in this range'}
          </div>
        </div>
      </div>

      <div className="chart-wrap">
      <svg
        ref={svgRef}
        className="chart-svg"
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        onPointerMove={onMove}
        onPointerDown={onMove}
        onPointerLeave={() => setHover(null)}
        onPointerUp={() => setHover(null)}
      >
        <defs>
          <linearGradient id="pnlFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={up ? '#2fe39a' : '#ff4d6d'} stopOpacity="0.35" />
            <stop offset="1" stopColor={up ? '#2fe39a' : '#ff4d6d'} stopOpacity="0" />
          </linearGradient>
        </defs>
        <line x1={P.l} x2={W - P.r} y1={Y(0)} y2={Y(0)} className="chart-zero" />
        {n > 1 && <path d={area} fill="url(#pnlFill)" />}
        {n > 1 && <path d={line} className="chart-line" style={{ stroke: color }} vectorEffect="non-scaling-stroke" />}
        {n > 1 && hover != null && <line x1={X(hover)} x2={X(hover)} y1={P.t} y2={H - P.b} className="chart-cursor" vectorEffect="non-scaling-stroke" />}
      </svg>
      {n > 1 && (
        <span
          className="chart-dot"
          style={{
            left: `${(X(hover ?? n - 1) / W) * 100}%`,
            top: `${(Y(vals[hover ?? n - 1]) / H) * 100}%`,
            background: color,
          }}
        />
      )}
      </div>
      <div className="chart-axis muted small">
        <span>{n > 1 ? points[1].date.toLocaleDateString([], { month: 'short', day: 'numeric' }) : ''}</span>
        <span>{n > 1 ? 'Now' : ''}</span>
      </div>

      <div className="chart-ranges">
        {RANGES.map((x) => (
          <button key={x.id} className={x.id === range ? 'on' : ''} onClick={() => setRange(x.id)}>
            {x.label}
          </button>
        ))}
      </div>
    </div>
  );
}
