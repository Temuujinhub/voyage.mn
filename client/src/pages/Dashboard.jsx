import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { getSocket } from '../socket.js';
import { Icons, Stat, FlightBadge, Spinner } from '../ui.jsx';
import { Donut, FlightBars, C } from '../charts.jsx';
import { fmtTime, fmtDate, addMinutes } from '../format.js';

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);

  const load = () => api.get('/api/reports/overview').then(setData).catch((e) => setErr(e.message));

  useEffect(() => {
    load();
    const s = getSocket();
    if (!s) return;
    const refresh = () => load();
    s.on('passenger:update', refresh);
    s.on('flight:update', refresh);
    s.on('manifest:imported', refresh);
    s.on('scan:event', refresh);
    const t = setInterval(load, 60000);
    return () => {
      s.off('passenger:update', refresh); s.off('flight:update', refresh);
      s.off('manifest:imported', refresh); s.off('scan:event', refresh);
      clearInterval(t);
    };
  }, []);

  if (err) return <div className="alert error">{err}</div>;
  if (!data) return <Spinner />;
  const { totals, flights } = data;

  const active = flights.filter((f) => ['CHECKIN_OPEN', 'BOARDING'].includes(f.status));
  const delayed = flights.filter((f) => f.delay_minutes > 0 && !['DEPARTED', 'CANCELLED'].includes(f.status));
  const barRows = flights
    .filter((f) => f.status !== 'CANCELLED' && Number(f.pax_total) > 0)
    .map((f) => ({
      id: f.id, label: f.flight_number,
      total: Number(f.pax_total), checked: Number(f.pax_checked), boarded: Number(f.pax_boarded),
    }));

  return (
    <>
      <div className="page-head">
        <h1>Dashboard</h1>
        <span style={{ color: 'var(--faint)', fontSize: 13 }}>{fmtDate(new Date())} · Улаанбаатарын цагаар</span>
        <div className="spacer" />
        <Link to="/flights" className="btn secondary">Бүх нислэг</Link>
      </div>

      {delayed.map((f) => (
        <div key={f.id} className="alert warn" style={{ marginBottom: 14 }}>
          <Icons.alert size={17} />
          <div>
            <b>Нислэг хойшлолт: {f.flight_number}</b> — товлосон {fmtTime(f.departure_ts)},{' '}
            {f.delay_minutes} минут хойшилж {fmtTime(addMinutes(f.departure_ts, f.delay_minutes))} болов.
            {f.delay_reason ? ` Шалтгаан: ${f.delay_reason}` : ''}
          </div>
        </div>
      ))}

      <div className="stat-row" style={{ marginBottom: 16 }}>
        <Stat label="Өнөөдрийн нислэг" value={totals.flights} icon={<Icons.plane size={18} />} />
        <Stat label="Нийт зорчигч" value={totals.passengers} icon={<Icons.users size={18} />} />
        <Stat label="Бүртгүүлсэн" value={totals.checkedIn} sub={`/ ${totals.passengers}`} icon={<Icons.check size={18} />} />
        <Stat label="Онгоцонд суусан" value={totals.boarded} icon={<Icons.gate size={18} />} />
        <Stat label="Ачаа (ш / кг)" value={totals.bags} sub={`/ ${Math.round(totals.bagWeight)}кг`} icon={<Icons.bag size={18} />} />
      </div>

      <div className="grid" style={{ gridTemplateColumns: 'minmax(260px, 330px) 1fr', marginBottom: 16 }}>
        <div className="card card-pad">
          <h3>Өнөөдрийн нийт бүртгэл</h3>
          <p style={{ color: 'var(--faint)', fontSize: 12, margin: '2px 0 10px' }}>Checked-in / Boarded / Pending</p>
          <Donut
            total={totals.passengers || 1}
            centerLabel={totals.passengers ? `${Math.round((totals.checkedIn / totals.passengers) * 100)}%` : '0%'}
            centerSub="бүртгэгдсэн"
            segments={[
              { label: 'Онгоцонд', value: totals.boarded, color: C.green },
              { label: 'Бүртгүүлсэн', value: totals.checkedIn - totals.boarded, color: C.blue },
              { label: 'Хүлээгдэж буй', value: totals.pending, color: C.amber },
            ]}
          />
          <div className="legend-row" style={{ justifyContent: 'center', marginTop: 8 }}>
            <span><span className="sw" style={{ background: C.green }} />Онгоцонд {totals.boarded}</span>
            <span><span className="sw" style={{ background: C.blue }} />Бүртгүүлсэн {totals.checkedIn - totals.boarded}</span>
            <span><span className="sw" style={{ background: C.amber }} />Хүлээгдэж {totals.pending}</span>
          </div>
        </div>
        <div className="card card-pad">
          <h3>Нислэг тус бүрийн boarding явц</h3>
          <p style={{ color: 'var(--faint)', fontSize: 12, margin: '2px 0 10px' }}>Сүүлийн 24ц − ирэх 48ц</p>
          <FlightBars rows={barRows} />
        </div>
      </div>

      <div className="card">
        <div className="card-pad" style={{ display: 'flex', alignItems: 'center', borderBottom: '1px solid var(--line)' }}>
          <h3 style={{ flex: 1 }}>Идэвхтэй нислэгүүд</h3>
          <span className="badge blue">{active.length} идэвхтэй</span>
        </div>
        <div className="tablewrap">
          <table className="tbl">
            <thead><tr>
              <th>Нислэг</th><th>Чиглэл</th><th>Хөөрөх</th><th>Gate</th><th>Онгоц</th><th>Зорчигч</th><th>Boarding</th><th>Төлөв</th>
            </tr></thead>
            <tbody>
              {flights.length === 0 && <tr><td colSpan={8}><div className="empty">Нислэг алга. <Link to="/flights">Нислэг үүсгэх →</Link></div></td></tr>}
              {flights.map((f) => (
                <tr key={f.id} className="rowlink" onClick={() => (window.location.href = `/flights/${f.id}`)}>
                  <td><b>{f.flight_number}</b><div style={{ fontSize: 11, color: 'var(--faint)' }}>{f.charter_code}</div></td>
                  <td>{f.origin_code} → {f.dest_code}</td>
                  <td className="num">{fmtTime(f.departure_ts)}{f.delay_minutes > 0 && <span className="badge amber" style={{ marginLeft: 6 }}>+{f.delay_minutes}м</span>}</td>
                  <td>{f.gate || '—'}</td>
                  <td>{f.aircraft_code}</td>
                  <td className="num">{f.pax_checked}/{f.pax_total}</td>
                  <td className="num">{f.pax_boarded}/{f.pax_total}</td>
                  <td><FlightBadge status={f.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
