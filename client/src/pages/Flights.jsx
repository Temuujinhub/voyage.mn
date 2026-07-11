import React, { useContext, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { AuthCtx } from '../App.jsx';
import { Icons, Modal, FlightBadge, Spinner, useToast, Stat } from '../ui.jsx';
import { fmtDateTime, fmtTime } from '../format.js';

const emptyForm = {
  flight_number: '', charter_code: '', aircraft_type_id: '', origin_code: 'OT',
  dest_code: 'UB', direction: 'OUT', departure_local: '', arrival_local: '', gate: '', notes: '',
};

// datetime-local (UB wall clock) -> ISO with +08:00
const toIso = (local) => (local ? `${local}:00+08:00` : null);
const toLocal = (ts) => {
  if (!ts) return '';
  const d = new Date(new Date(ts).getTime() + 8 * 3600e3);
  return d.toISOString().slice(0, 16);
};

export default function Flights() {
  const user = useContext(AuthCtx);
  const toast = useToast();
  const navigate = useNavigate();
  const [flights, setFlights] = useState(null);
  const [aircraft, setAircraft] = useState([]);
  const [airports, setAirports] = useState([{ code: 'UB' }, { code: 'OT' }]);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState({ date_from: '', date_to: '', status: '' });

  const canEdit = ['admin', 'manager'].includes(user.role);

  const load = () => {
    const params = new URLSearchParams();
    if (filter.date_from) params.set('date_from', filter.date_from);
    if (filter.date_to) params.set('date_to', filter.date_to);
    if (filter.status) params.set('status', filter.status);
    api.get(`/api/flights?${params}`).then((d) => setFlights(d.flights)).catch((e) => toast(e.message, 'error'));
  };

  useEffect(() => { load(); }, [filter]);
  useEffect(() => {
    api.get('/api/aircraft').then((d) => {
      setAircraft(d.aircraft);
      setForm((f) => ({ ...f, aircraft_type_id: d.aircraft[0]?.id || '' }));
    });
  }, []);

  const openCreate = () => { setEditing(null); setForm({ ...emptyForm, aircraft_type_id: aircraft[0]?.id || '' }); setShowForm(true); };
  const openEdit = (f) => {
    setEditing(f);
    setForm({
      flight_number: f.flight_number, charter_code: f.charter_code || '', aircraft_type_id: f.aircraft_type_id,
      origin_code: f.origin_code, dest_code: f.dest_code, direction: f.direction || '',
      departure_local: toLocal(f.departure_ts), arrival_local: toLocal(f.arrival_ts), gate: f.gate || '', notes: f.notes || '',
    });
    setShowForm(true);
  };

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    const body = {
      flight_number: form.flight_number, charter_code: form.charter_code || null,
      aircraft_type_id: form.aircraft_type_id,
      origin_code: form.origin_code, origin_name: form.origin_code === 'UB' ? 'Ulaanbaatar — Chinggis Khaan Intl' : 'Oyu Tolgoi — Khanbumbat',
      dest_code: form.dest_code, dest_name: form.dest_code === 'UB' ? 'Ulaanbaatar — Chinggis Khaan Intl' : 'Oyu Tolgoi — Khanbumbat',
      direction: form.direction || null,
      departure_ts: toIso(form.departure_local), arrival_ts: toIso(form.arrival_local),
      gate: form.gate || null, notes: form.notes || null,
    };
    try {
      if (editing) await api.put(`/api/flights/${editing.id}`, body);
      else await api.post('/api/flights', body);
      toast(editing ? 'Нислэг шинэчлэгдлээ' : 'Нислэг үүслээ', 'success');
      setShowForm(false);
      load();
    } catch (ex) {
      toast(ex.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const del = async (f) => {
    if (!window.confirm(`${f.flight_number} нислэгийг устгах уу?`)) return;
    try {
      await api.del(`/api/flights/${f.id}`);
      toast('Устгагдлаа', 'success');
      load();
    } catch (ex) { toast(ex.message, 'error'); }
  };

  if (!flights) return <Spinner />;
  const boarding = flights.filter((f) => f.status === 'BOARDING').length;
  const delayed = flights.filter((f) => f.delay_minutes > 0 && !['DEPARTED', 'CANCELLED'].includes(f.status)).length;

  return (
    <>
      <div className="page-head">
        <h1>Нислэгийн удирдлага</h1>
        <div className="spacer" />
        <input type="date" className="btn secondary" style={{ padding: '7px 10px' }} value={filter.date_from}
          onChange={(e) => setFilter({ ...filter, date_from: e.target.value })} />
        <input type="date" className="btn secondary" style={{ padding: '7px 10px' }} value={filter.date_to}
          onChange={(e) => setFilter({ ...filter, date_to: e.target.value })} />
        <select className="btn secondary" value={filter.status} onChange={(e) => setFilter({ ...filter, status: e.target.value })}>
          <option value="">Бүх төлөв</option>
          {['SCHEDULED', 'CHECKIN_OPEN', 'BOARDING', 'DEPARTED', 'CANCELLED'].map((s) => <option key={s}>{s}</option>)}
        </select>
        {canEdit && <button className="btn" onClick={openCreate}><Icons.plane size={16} />Нислэг нэмэх</button>}
      </div>

      <div className="stat-row" style={{ marginBottom: 16 }}>
        <Stat label="Нийт нислэг" value={flights.length} icon={<Icons.plane size={18} />} />
        <Stat label="Boarding" value={boarding} icon={<Icons.gate size={18} />} />
        <Stat label="Хойшилсон" value={delayed} icon={<Icons.clock size={18} />} />
      </div>

      <div className="card">
        <div className="tablewrap">
          <table className="tbl">
            <thead><tr>
              <th>Нислэг №</th><th>Charter</th><th>Чиглэл</th><th>Хөөрөх</th><th>Буух</th><th>Онгоц</th><th>Зорчигч</th><th>Төлөв</th>{canEdit && <th></th>}
            </tr></thead>
            <tbody>
              {flights.length === 0 && <tr><td colSpan={9}><div className="empty">Нислэг олдсонгүй</div></td></tr>}
              {flights.map((f) => (
                <tr key={f.id} className="rowlink" onClick={() => navigate(`/flights/${f.id}`)}>
                  <td><b>{f.flight_number}</b></td>
                  <td style={{ color: 'var(--muted)' }}>{f.charter_code || '—'}</td>
                  <td>{f.origin_code} → {f.dest_code}{f.direction && <span className="badge gray" style={{ marginLeft: 6 }}>{f.direction}</span>}</td>
                  <td className="num">{fmtDateTime(f.departure_ts)}{f.delay_minutes > 0 && <span className="badge amber" style={{ marginLeft: 6 }}>+{f.delay_minutes}м</span>}</td>
                  <td className="num">{f.arrival_ts ? fmtTime(f.arrival_ts) : '—'}</td>
                  <td>{f.aircraft_code} <span style={{ color: 'var(--faint)', fontSize: 11 }}>({f.total_seats})</span></td>
                  <td className="num">{f.pax_checked}/{f.pax_total}</td>
                  <td><FlightBadge status={f.status} /></td>
                  {canEdit && (
                    <td onClick={(e) => e.stopPropagation()}>
                      <button className="btn ghost sm" title="Засах" onClick={() => openEdit(f)}><Icons.settings size={15} /></button>
                      {user.role === 'admin' && <button className="btn ghost sm" style={{ color: 'var(--red)' }} title="Устгах" onClick={() => del(f)}><Icons.x size={15} /></button>}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showForm && (
        <Modal title={editing ? `${editing.flight_number} — засах` : 'Шинэ нислэг'} onClose={() => setShowForm(false)}>
          <form onSubmit={submit}>
            <div className="formgrid">
              <div className="field">
                <label>Нислэгийн дугаар *</label>
                <input required value={form.flight_number} placeholder="M0-9516"
                  onChange={(e) => setForm({ ...form, flight_number: e.target.value })} />
              </div>
              <div className="field">
                <label>Charter / Transport код</label>
                <input value={form.charter_code} placeholder="JU-1199 WED2"
                  onChange={(e) => setForm({ ...form, charter_code: e.target.value })} />
                <span className="hint">OT manifest-ийн Transport Number-тэй тохирно</span>
              </div>
              <div className="field">
                <label>Онгоц *</label>
                <select required value={form.aircraft_type_id} onChange={(e) => setForm({ ...form, aircraft_type_id: e.target.value })}>
                  {aircraft.map((a) => <option key={a.id} value={a.id}>{a.code} — {a.model} ({a.total_seats})</option>)}
                </select>
              </div>
              <div className="field">
                <label>Gate</label>
                <input value={form.gate} placeholder="4A" onChange={(e) => setForm({ ...form, gate: e.target.value })} />
              </div>
              <div className="field">
                <label>Хөөрөх буудал *</label>
                <select value={form.origin_code} onChange={(e) => {
                  const oc = e.target.value;
                  setForm({ ...form, origin_code: oc, dest_code: oc === 'UB' ? 'OT' : 'UB', direction: oc === 'UB' ? 'IN' : 'OUT' });
                }}>
                  <option value="OT">OT — Oyu Tolgoi (Khanbumbat)</option>
                  <option value="UB">UB — Ulaanbaatar</option>
                </select>
              </div>
              <div className="field">
                <label>Буух буудал *</label>
                <select value={form.dest_code} onChange={(e) => setForm({ ...form, dest_code: e.target.value })}>
                  <option value="UB">UB — Ulaanbaatar</option>
                  <option value="OT">OT — Oyu Tolgoi (Khanbumbat)</option>
                </select>
              </div>
              <div className="field">
                <label>Хөөрөх цаг (УБ цаг) *</label>
                <input type="datetime-local" required value={form.departure_local}
                  onChange={(e) => setForm({ ...form, departure_local: e.target.value })} />
              </div>
              <div className="field">
                <label>Буух цаг (УБ цаг)</label>
                <input type="datetime-local" value={form.arrival_local}
                  onChange={(e) => setForm({ ...form, arrival_local: e.target.value })} />
              </div>
              <div className="field full">
                <label>Тэмдэглэл</label>
                <textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              </div>
            </div>
            <div className="modal-actions">
              <button type="button" className="btn secondary" onClick={() => setShowForm(false)}>Болих</button>
              <button className="btn" disabled={busy}>{busy ? 'Хадгалж байна…' : 'Хадгалах'}</button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
