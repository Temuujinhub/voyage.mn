import React, { useContext, useEffect, useMemo, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { AuthCtx } from '../App.jsx';
import { getSocket } from '../socket.js';
import { Icons, Modal, FlightBadge, PaxBadge, Spinner, useToast, Avatar } from '../ui.jsx';
import SeatMap from '../components/SeatMap.jsx';
import { fmtDateTime, fmtTime, addMinutes, PAX_STATUS } from '../format.js';

const NEXT_STATUS = {
  SCHEDULED: [{ to: 'CHECKIN_OPEN', label: 'Check-in нээх', cls: 'btn' }],
  CHECKIN_OPEN: [{ to: 'BOARDING', label: 'Boarding эхлүүлэх', cls: 'btn green' }, { to: 'SCHEDULED', label: 'Check-in хаах', cls: 'btn secondary' }],
  BOARDING: [{ to: 'DEPARTED', label: 'Хөөрсөн гэж тэмдэглэх', cls: 'btn' }, { to: 'CHECKIN_OPEN', label: 'Check-in руу буцаах', cls: 'btn secondary' }],
  DEPARTED: [],
  CANCELLED: [{ to: 'SCHEDULED', label: 'Сэргээх', cls: 'btn secondary' }],
};

export default function FlightDetail() {
  const { id } = useParams();
  const user = useContext(AuthCtx);
  const toast = useToast();
  const navigate = useNavigate();
  const [flight, setFlight] = useState(null);
  const [pax, setPax] = useState([]);
  const [seatmap, setSeatmap] = useState(null);
  const [tab, setTab] = useState('pax');
  const [filter, setFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [delayModal, setDelayModal] = useState(false);
  const [delay, setDelay] = useState({ minutes: 30, reason: '' });

  const canManage = ['admin', 'manager'].includes(user.role);

  const load = () => {
    api.get(`/api/flights/${id}`).then((d) => setFlight(d.flight)).catch((e) => toast(e.message, 'error'));
    api.get(`/api/flights/${id}/passengers`).then((d) => setPax(d.passengers));
    api.get(`/api/flights/${id}/seatmap`).then(setSeatmap);
  };

  useEffect(() => {
    load();
    const s = getSocket();
    if (!s) return;
    s.emit('watch-flight', id);
    const refresh = (p) => { if (!p || p.flightId === id || p.flight?.id === id) load(); };
    s.on('passenger:update', refresh); s.on('flight:update', refresh);
    s.on('scan:event', refresh); s.on('manifest:imported', refresh);
    return () => {
      s.emit('unwatch-flight', id);
      s.off('passenger:update', refresh); s.off('flight:update', refresh);
      s.off('scan:event', refresh); s.off('manifest:imported', refresh);
    };
  }, [id]);

  const setStatus = async (to) => {
    try {
      await api.post(`/api/flights/${id}/status`, { status: to });
      toast(`Төлөв: ${to}`, 'success');
    } catch (ex) { toast(ex.message, 'error'); }
  };

  const cancel = async () => {
    if (!window.confirm('Нислэгийг цуцлах уу?')) return;
    try { await api.post(`/api/flights/${id}/status`, { status: 'CANCELLED' }); } catch (ex) { toast(ex.message, 'error'); }
  };

  const saveDelay = async (e) => {
    e.preventDefault();
    try {
      await api.post(`/api/flights/${id}/delay`, delay);
      toast('Хойшлолт бүртгэгдлээ', 'success');
      setDelayModal(false);
    } catch (ex) { toast(ex.message, 'error'); }
  };

  const filtered = useMemo(() => pax.filter((p) => {
    if (statusFilter && p.status !== statusFilter) return false;
    if (!filter) return true;
    const f = filter.toLowerCase();
    return p.full_name.toLowerCase().includes(f) || (p.employee_id || '').toLowerCase().includes(f)
      || (p.pnr || '').toLowerCase().includes(f) || (p.seat || '').toLowerCase().includes(f);
  }), [pax, filter, statusFilter]);

  if (!flight) return <Spinner />;

  const counts = {
    total: pax.filter((p) => !p.waitlisted && p.status !== 'OFFLOADED').length,
    checked: pax.filter((p) => ['CHECKED_IN', 'SECURITY_PASSED', 'BOARDED'].includes(p.status)).length,
    boarded: pax.filter((p) => p.status === 'BOARDED').length,
    wl: pax.filter((p) => p.waitlisted).length,
  };

  return (
    <>
      <div className="page-head">
        <Link to="/staff/flights" className="btn ghost sm">← Нислэгүүд</Link>
        <h1>{flight.flight_number}</h1>
        <FlightBadge status={flight.status} />
        {flight.delay_minutes > 0 && <span className="badge amber">+{flight.delay_minutes} мин хойшилсон</span>}
        <div className="spacer" />
        {canManage && NEXT_STATUS[flight.status]?.map((a) => (
          <button key={a.to} className={a.cls} onClick={() => setStatus(a.to)}>{a.label}</button>
        ))}
        {canManage && <button className="btn secondary" onClick={() => { setDelay({ minutes: flight.delay_minutes || 30, reason: flight.delay_reason || '' }); setDelayModal(true); }}>
          <Icons.clock size={15} />Хойшлолт
        </button>}
        {canManage && !['DEPARTED', 'CANCELLED'].includes(flight.status) &&
          <button className="btn danger" onClick={cancel}>Цуцлах</button>}
      </div>

      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', marginBottom: 16 }}>
        <div className="card card-pad">
          <div style={{ fontSize: 11, color: 'var(--faint)', fontWeight: 700, letterSpacing: 0.8 }}>ЧИГЛЭЛ</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--navy)', margin: '4px 0' }}>
            {flight.origin_code} → {flight.dest_code}
          </div>
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>{flight.charter_code || flight.direction || ''}</div>
        </div>
        <div className="card card-pad">
          <div style={{ fontSize: 11, color: 'var(--faint)', fontWeight: 700, letterSpacing: 0.8 }}>ХӨӨРӨХ (УБ)</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--navy)', margin: '4px 0' }}>
            {fmtTime(addMinutes(flight.departure_ts, flight.delay_minutes))}
          </div>
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>
            {fmtDateTime(flight.departure_ts)}{flight.delay_minutes > 0 && ' (товлосон)'}
          </div>
        </div>
        <div className="card card-pad">
          <div style={{ fontSize: 11, color: 'var(--faint)', fontWeight: 700, letterSpacing: 0.8 }}>GATE / ОНГОЦ</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--navy)', margin: '4px 0' }}>{flight.gate || '—'}</div>
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>{flight.aircraft_code} · {flight.aircraft_model} · {flight.total_seats} суудал</div>
        </div>
        <div className="card card-pad">
          <div style={{ fontSize: 11, color: 'var(--faint)', fontWeight: 700, letterSpacing: 0.8 }}>БҮРТГЭЛ</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--navy)', margin: '4px 0' }}>
            {counts.checked}<span style={{ fontSize: 14, color: 'var(--faint)' }}> / {counts.total}</span>
          </div>
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>Онгоцонд: {counts.boarded}{counts.wl > 0 && ` · WL: ${counts.wl}`}</div>
        </div>
      </div>

      <div className="card">
        <div style={{ display: 'flex', gap: 4, padding: '10px 14px 0', borderBottom: '1px solid var(--line)', flexWrap: 'wrap' }}>
          {[['pax', `Зорчигчид (${pax.length})`], ['seats', 'Суудлын зураглал'], ['export', 'Экспорт']].map(([k, label]) => (
            <button key={k} className="btn ghost sm" onClick={() => setTab(k)}
              style={tab === k ? { borderBottom: '2.5px solid var(--blue)', borderRadius: '7px 7px 0 0', color: 'var(--blue-dark)' } : {}}>
              {label}
            </button>
          ))}
          <div style={{ flex: 1 }} />
          {tab === 'pax' && (
            <div style={{ display: 'flex', gap: 8, paddingBottom: 8 }}>
              <select className="btn secondary sm" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                <option value="">Бүх төлөв</option>
                {Object.keys(PAX_STATUS).map((s) => <option key={s}>{s}</option>)}
              </select>
              <input placeholder="Шүүх…" value={filter} onChange={(e) => setFilter(e.target.value)}
                style={{ border: '1px solid var(--line)', borderRadius: 7, padding: '4px 10px', fontSize: 12.5 }} />
            </div>
          )}
        </div>

        {tab === 'pax' && (
          <div className="tablewrap">
            <table className="tbl">
              <thead><tr>
                <th>#</th><th>Зорчигч</th><th>Компани</th><th>SAP ID</th><th>Утас</th><th>Суудал</th><th>Ачаа</th><th>Төлөв</th><th></th>
              </tr></thead>
              <tbody>
                {filtered.length === 0 && <tr><td colSpan={9}><div className="empty">Зорчигч алга — manifest хүлээгдэж байна</div></td></tr>}
                {filtered.map((p) => (
                  <tr key={p.id}>
                    <td className="num" style={{ color: 'var(--faint)' }}>{p.seq || '—'}</td>
                    <td>
                      <div className="pax-cell">
                        <Avatar name={p.full_name} />
                        <div>
                          <div style={{ fontWeight: 600 }}>{p.title} {p.full_name}{p.waitlisted && <span className="badge amber" style={{ marginLeft: 6 }}>WL</span>}</div>
                          <div className="sub">PNR {p.pnr}{p.baggage_pending && ' · ачаа хүлээгдэж буй'}</div>
                        </div>
                      </div>
                    </td>
                    <td style={{ fontSize: 12.5, color: 'var(--muted)' }}>{p.company || '—'}</td>
                    <td className="num">{p.employee_id || '—'}</td>
                    <td className="num" style={{ fontSize: 12.5 }}>{p.phone || '—'}</td>
                    <td><b style={{ fontFamily: 'var(--mono)' }}>{p.seat || '—'}</b></td>
                    <td className="num">{Number(p.bag_count) > 0 ? `${p.bag_count}ш / ${Math.round(p.bag_weight)}кг` : '—'}</td>
                    <td><PaxBadge status={p.status} /></td>
                    <td>
                      <button className="btn ghost sm" onClick={() => navigate(`/staff/checkin?pax=${p.id}`)}>
                        {p.status === 'PENDING' ? 'Check-in' : 'Нээх'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {tab === 'seats' && (
          <div className="card-pad">
            {seatmap
              ? <SeatMap seatMap={seatmap.seat_map} occupied={seatmap.occupied} />
              : <Spinner />}
          </div>
        )}

        {tab === 'export' && (
          <div className="card-pad" style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <a className="btn secondary" href={`/api/flights/${id}/manifest.xlsx`} onClick={(e) => downloadAuth(e, `/api/flights/${id}/manifest.xlsx`, `${flight.flight_number}_manifest.xlsx`)}>
              <Icons.download size={16} />Manifest — Excel
            </a>
            <a className="btn secondary" href={`/api/flights/${id}/manifest.pdf`} onClick={(e) => downloadAuth(e, `/api/flights/${id}/manifest.pdf`, `${flight.flight_number}_manifest.pdf`)}>
              <Icons.download size={16} />Manifest — PDF
            </a>
          </div>
        )}
      </div>

      {delayModal && (
        <Modal title="Нислэгийн хойшлолт" onClose={() => setDelayModal(false)}>
          <form onSubmit={saveDelay}>
            <div className="field">
              <label>Хойшлуулах хугацаа (минут; 0 = хойшлолт цуцлах)</label>
              <input type="number" min="0" max="1440" value={delay.minutes}
                onChange={(e) => setDelay({ ...delay, minutes: parseInt(e.target.value, 10) || 0 })} />
            </div>
            <div className="field">
              <label>Шалтгаан</label>
              <input value={delay.reason} placeholder="Цаг агаарын нөхцөл…"
                onChange={(e) => setDelay({ ...delay, reason: e.target.value })} />
            </div>
            <div className="alert info" style={{ marginBottom: 8 }}>
              <Icons.alert size={15} />Хойшлолт бүртгэснээр шинэ хөөрөх цаг зорчигчийн boarding pass болон самбарт шууд харагдана.
            </div>
            <div className="modal-actions">
              <button type="button" className="btn secondary" onClick={() => setDelayModal(false)}>Болих</button>
              <button className="btn">Хадгалах</button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}

// exports need the Authorization header — fetch as blob and trigger download
async function downloadAuth(e, url, filename) {
  e.preventDefault();
  const res = await api.raw(url);
  if (!res.ok) return;
  const blob = await res.blob();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}
