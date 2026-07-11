import React from 'react';

// Renders the aircraft cabin. seatMap: {aisleAfter, rows:[{row, seats:[{c, reserved, blocked}]}]}
// occupied: [{seat, full_name, status}]
export default function SeatMap({ seatMap, occupied = [], selected, onPick }) {
  if (!seatMap?.rows) return null;
  const occ = new Map(occupied.map((o) => [o.seat, o]));
  return (
    <div>
      <div className="seatmap">
        {seatMap.rows.map((row) => (
          <div className="seatrow" key={row.row}>
            <div className="rownum">{row.row}</div>
            {row.seats.map((s, i) => {
              const code = `${row.row}${s.c}`;
              const o = occ.get(code);
              const cls = [
                'seat',
                i > 0 && row.seats[i - 1].c === seatMap.aisleAfter ? 'aisle-gap' : '',
                s.blocked ? 'blocked' : o ? (o.status === 'BOARDED' ? 'boarded' : 'occupied') : s.reserved ? 'reserved' : '',
                selected === code ? 'selected' : '',
              ].join(' ');
              return (
                <div key={code} className={cls}
                  title={o ? `${code} — ${o.full_name} (${o.status})` : s.blocked ? `${code} — хаалттай` : s.reserved ? `${code} — нөөц` : code}
                  onClick={() => { if (!s.blocked && !o && onPick) onPick(code); }}>
                  {s.c}
                </div>
              );
            })}
            <div className="rownum" style={{ marginLeft: 2 }}>{row.zone}</div>
          </div>
        ))}
      </div>
      <div className="seat-legend">
        <span><span className="sw" style={{ background: 'var(--sky)', border: '1.5px solid var(--sky-2)' }} />Сул</span>
        <span><span className="sw" style={{ background: 'var(--navy-2)' }} />Бүртгүүлсэн</span>
        <span><span className="sw" style={{ background: 'var(--green)' }} />Онгоцонд</span>
        <span><span className="sw" style={{ background: '#f6e9f3', border: '1.5px solid #e5c8de' }} />Нөөц</span>
        <span><span className="sw" style={{ background: '#eef1f4' }} />Хаалттай</span>
      </div>
    </div>
  );
}
