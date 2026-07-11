import React, { useState } from 'react';

// Chart palette — validated (dataviz six checks, light surface):
// blue = checked-in, amber = pending, green = boarded.
export const C = { blue: '#1b84c4', amber: '#d98a25', green: '#2e8f5b', track: '#e8eef4', ink: '#12395b' };

/* Progress donut: boarded+checked vs remaining. Center shows the headline. */
export function Donut({ segments, total, centerLabel, centerSub, size = 168 }) {
  const [tip, setTip] = useState(null);
  const r = size / 2 - 13;
  const cx = size / 2;
  const circ = 2 * Math.PI * r;
  let offset = 0;
  const parts = segments.filter((s) => s.value > 0);
  return (
    <div style={{ position: 'relative', width: size, margin: '0 auto' }}>
      <svg width={size} height={size}>
        <circle cx={cx} cy={cx} r={r} fill="none" stroke={C.track} strokeWidth="15" />
        {parts.map((s) => {
          const frac = total > 0 ? s.value / total : 0;
          const el = (
            <circle key={s.label} cx={cx} cy={cx} r={r} fill="none" stroke={s.color} strokeWidth="15"
              strokeDasharray={`${Math.max(frac * circ - 2.5, 0.01)} ${circ}`}
              strokeDashoffset={-offset * circ}
              strokeLinecap="butt"
              transform={`rotate(-90 ${cx} ${cx})`}
              style={{ transition: 'stroke-dasharray .4s' }}
              onMouseEnter={(e) => setTip({ x: e.nativeEvent.offsetX, y: e.nativeEvent.offsetY, text: `${s.label}: ${s.value}` })}
              onMouseLeave={() => setTip(null)}
            />
          );
          offset += frac;
          return el;
        })}
        <text x={cx} y={cx - 2} textAnchor="middle" fontSize="26" fontWeight="750" fill={C.ink}>{centerLabel}</text>
        <text x={cx} y={cx + 18} textAnchor="middle" fontSize="11" fill="#8fa1af">{centerSub}</text>
      </svg>
      {tip && <div className="chart-tip" style={{ left: tip.x, top: tip.y }}>{tip.text}</div>}
    </div>
  );
}

/* Horizontal stacked bars: one row per flight, checked-in vs pending. */
export function FlightBars({ rows }) {
  const [tip, setTip] = useState(null);
  if (!rows.length) return <div className="empty">Өнөөдөр идэвхтэй нислэг алга</div>;
  const max = Math.max(...rows.map((r) => r.total), 1);
  return (
    <div style={{ position: 'relative' }}>
      {rows.map((r) => {
        const wBoard = (r.boarded / max) * 100;
        const wCheck = ((r.checked - r.boarded) / max) * 100;
        const wPend = ((r.total - r.checked) / max) * 100;
        return (
          <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '9px 0' }}>
            <div style={{ width: 76, fontSize: 12, fontWeight: 700, color: C.ink, fontVariantNumeric: 'tabular-nums' }}>{r.label}</div>
            <div style={{ flex: 1, display: 'flex', height: 18, borderRadius: 4, overflow: 'hidden', background: C.track, gap: 2 }}
              onMouseLeave={() => setTip(null)}>
              {r.boarded > 0 && <div style={{ width: `${wBoard}%`, background: C.green, borderRadius: '4px 0 0 4px' }}
                onMouseEnter={(e) => setTip({ x: e.clientX, y: e.clientY, text: `Онгоцонд: ${r.boarded}` })} />}
              {r.checked - r.boarded > 0 && <div style={{ width: `${wCheck}%`, background: C.blue }}
                onMouseEnter={(e) => setTip({ x: e.clientX, y: e.clientY, text: `Бүртгүүлсэн: ${r.checked - r.boarded}` })} />}
              {r.total - r.checked > 0 && <div style={{ width: `${wPend}%`, background: C.amber, opacity: 0.85 }}
                onMouseEnter={(e) => setTip({ x: e.clientX, y: e.clientY, text: `Хүлээгдэж буй: ${r.total - r.checked}` })} />}
            </div>
            <div style={{ width: 64, fontSize: 12, color: '#5b6b78', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
              {r.checked}/{r.total}
            </div>
          </div>
        );
      })}
      <div className="legend-row" style={{ marginTop: 12 }}>
        <span><span className="sw" style={{ background: C.green }} />Онгоцонд суусан</span>
        <span><span className="sw" style={{ background: C.blue }} />Бүртгүүлсэн</span>
        <span><span className="sw" style={{ background: C.amber, opacity: 0.85 }} />Хүлээгдэж буй</span>
      </div>
      {tip && <div className="chart-tip" style={{ position: 'fixed', left: tip.x, top: tip.y - 6 }}>{tip.text}</div>}
    </div>
  );
}
