import React, { useContext, useEffect, useState } from 'react';
import { api } from '../api.js';
import { AuthCtx } from '../App.jsx';
import { Icons, Spinner, useToast, FlightBadge, Stat } from '../ui.jsx';
import { FlightBars } from '../charts.jsx';
import { fmtDateTime } from '../format.js';

const today = () => new Date().toISOString().slice(0, 10);
const daysAgo = (n) => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);

export default function Reports() {
  const user = useContext(AuthCtx);
  const toast = useToast();
  const [range, setRange] = useState({ date_from: daysAgo(7), date_to: today() });
  const [data, setData] = useState(null);
  const [audit, setAudit] = useState(null);
  const [tab, setTab] = useState('ops');

  const load = () => {
    const p = new URLSearchParams(range);
    api.get(`/api/reports/overview?${p}`).then(setData).catch((e) => toast(e.message, 'error'));
  };
  useEffect(() => { load(); }, [range]);
  useEffect(() => {
    if (tab === 'audit' && user.role === 'admin') {
      api.get('/api/reports/audit?limit=300').then((d) => setAudit(d.audit));
    }
  }, [tab]);

  const download = async (url, filename) => {
    const res = await api.raw(url);
    if (!res.ok) return toast('Экспорт амжилтгүй', 'error');
    const blob = await res.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  if (!data) return <Spinner />;
  const { totals, flights } = data;
  const barRows = flights.filter((f) => Number(f.pax_total) > 0).slice(0, 20).map((f) => ({
    id: f.id, label: f.flight_number, total: Number(f.pax_total),
    checked: Number(f.pax_checked), boarded: Number(f.pax_boarded),
  }));

  return (
    <>
      <div className="page-head">
        <h1>Тайлан ба аналитик</h1>
        <div className="spacer" />
        <input type="date" className="btn secondary" style={{ padding: '7px 10px' }} value={range.date_from}
          onChange={(e) => setRange({ ...range, date_from: e.target.value })} />
        <input type="date" className="btn secondary" style={{ padding: '7px 10px' }} value={range.date_to}
          onChange={(e) => setRange({ ...range, date_to: e.target.value })} />
        <button className="btn secondary" onClick={() => download(`/api/reports/flights.xlsx?${new URLSearchParams(range)}`, 'voyage_flights_report.xlsx')}>
          <Icons.download size={15} />Excel
        </button>
        {user.role === 'admin' && (
          <div style={{ display: 'flex', gap: 4 }}>
            <button className={`btn sm ${tab === 'ops' ? '' : 'secondary'}`} onClick={() => setTab('ops')}>Үйл ажиллагаа</button>
            <button className={`btn sm ${tab === 'audit' ? '' : 'secondary'}`} onClick={() => setTab('audit')}>Аудит лог</button>
          </div>
        )}
      </div>

      {tab === 'ops' && (
        <>
          <div className="stat-row" style={{ marginBottom: 16 }}>
            <Stat label="Нислэг" value={totals.flights} icon={<Icons.plane size={18} />} />
            <Stat label="Хөөрсөн" value={totals.departed} icon={<Icons.check size={18} />} />
            <Stat label="Зорчигч" value={totals.passengers} icon={<Icons.users size={18} />} />
            <Stat label="Бүртгүүлсэн" value={totals.checkedIn} sub={totals.passengers ? `${Math.round((totals.checkedIn / totals.passengers) * 100)}%` : ''} icon={<Icons.check size={18} />} />
            <Stat label="Ачаа" value={totals.bags} sub={`${Math.round(totals.bagWeight)}кг`} icon={<Icons.bag size={18} />} />
          </div>

          <div className="card card-pad" style={{ marginBottom: 16 }}>
            <h3>Нислэг тус бүрийн ачаалал</h3>
            <p style={{ color: 'var(--faint)', fontSize: 12, margin: '2px 0 12px' }}>{range.date_from} — {range.date_to}</p>
            <FlightBars rows={barRows} />
          </div>

          <div className="card">
            <div className="tablewrap">
              <table className="tbl">
                <thead><tr>
                  <th>Нислэг</th><th>Хөөрөх</th><th>Төлөв</th><th>Хойшлолт</th><th>Manifest</th><th>Бүртгүүлсэн</th><th>Онгоцонд</th><th>Ачаа</th><th>Ачаалал</th>
                </tr></thead>
                <tbody>
                  {flights.map((f) => (
                    <tr key={f.id}>
                      <td><b>{f.flight_number}</b> <span style={{ color: 'var(--faint)', fontSize: 11 }}>{f.origin_code}→{f.dest_code}</span></td>
                      <td className="num" style={{ fontSize: 12.5 }}>{fmtDateTime(f.departure_ts)}</td>
                      <td><FlightBadge status={f.status} /></td>
                      <td className="num">{f.delay_minutes > 0 ? `${f.delay_minutes} мин` : '—'}</td>
                      <td className="num">{f.pax_total}</td>
                      <td className="num">{f.pax_checked}</td>
                      <td className="num">{f.pax_boarded}</td>
                      <td className="num">{f.bag_count}ш / {Math.round(f.bag_weight)}кг</td>
                      <td className="num">{f.total_seats ? Math.round((f.pax_total / f.total_seats) * 100) : 0}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {tab === 'audit' && (
        <div className="card">
          <div className="tablewrap">
            <table className="tbl">
              <thead><tr><th>Цаг</th><th>Хэрэглэгч</th><th>Үйлдэл</th><th>Объект</th><th>Дэлгэрэнгүй</th><th>IP</th></tr></thead>
              <tbody>
                {!audit && <tr><td colSpan={6}><Spinner /></td></tr>}
                {audit?.map((a) => (
                  <tr key={a.id}>
                    <td className="num" style={{ fontSize: 12 }}>{fmtDateTime(a.ts)}</td>
                    <td>{a.username}{a.role ? <span className="badge gray" style={{ marginLeft: 6 }}>{a.role}</span> : ''}</td>
                    <td><b style={{ fontSize: 12.5 }}>{a.action}</b></td>
                    <td style={{ fontSize: 12 }}>{a.entity}{a.entity_id ? ` · ${String(a.entity_id).slice(0, 8)}` : ''}</td>
                    <td style={{ fontSize: 11.5, color: 'var(--muted)', maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {JSON.stringify(a.details)}
                    </td>
                    <td style={{ fontSize: 11.5, color: 'var(--faint)' }}>{a.ip}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}
