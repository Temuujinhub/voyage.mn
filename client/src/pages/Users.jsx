import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import { Icons, Modal, Spinner, useToast, Avatar } from '../ui.jsx';
import { fmtDate, ROLE_MN } from '../format.js';

const empty = { username: '', password: '', full_name: '', role: 'agent', email: '', phone: '', station: '' };
const STATION_MN = { UB: 'UB — Чингис хаан ОУНБ', OT: 'OT — Ханбумбат (Оюу Толгой)' };

export default function Users() {
  const toast = useToast();
  const [users, setUsers] = useState(null);
  const [form, setForm] = useState(empty);
  const [editing, setEditing] = useState(null);
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = () => api.get('/api/users').then((d) => setUsers(d.users));
  useEffect(() => { load(); }, []);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (editing) {
        const body = { full_name: form.full_name, role: form.role, email: form.email, phone: form.phone, station: form.station || '' };
        if (form.password) body.password = form.password;
        await api.put(`/api/users/${editing.id}`, body);
      } else {
        await api.post('/api/users', form);
      }
      toast('Хадгалагдлаа', 'success');
      setShow(false);
      load();
    } catch (ex) { toast(ex.message, 'error'); } finally { setBusy(false); }
  };

  const toggleActive = async (u) => {
    try {
      await api.put(`/api/users/${u.id}`, { active: !u.active });
      load();
    } catch (ex) { toast(ex.message, 'error'); }
  };

  if (!users) return <Spinner />;

  return (
    <>
      <div className="page-head">
        <h1>Хэрэглэгчийн удирдлага</h1>
        <div className="spacer" />
        <button className="btn" onClick={() => { setEditing(null); setForm(empty); setShow(true); }}>
          <Icons.users size={16} />Хэрэглэгч нэмэх
        </button>
      </div>

      <div className="alert info" style={{ marginBottom: 16 }}>
        <Icons.shield size={17} />
        <div>
          <b>Эрхийн түвшин:</b> Админ — бүрэн эрх · Менежер — нислэг, manifest, тайлан · Бүртгэлийн ажилтан — check-in,
          ачаа, boarding · ОТ аяллын ажилтан — зөвхөн manifest илгээх.
        </div>
      </div>

      <div className="card">
        <div className="tablewrap">
          <table className="tbl">
            <thead><tr><th>Хэрэглэгч</th><th>Нэвтрэх нэр</th><th>Эрх</th><th>Буудал</th><th>И-мэйл / Утас</th><th>Бүртгэсэн</th><th>Төлөв</th><th></th></tr></thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td><div className="pax-cell"><Avatar name={u.full_name} /><b>{u.full_name}</b></div></td>
                  <td className="num">{u.username}</td>
                  <td><span className={`badge ${u.role === 'admin' ? 'navy' : u.role === 'manager' ? 'blue' : u.role === 'ot_staff' ? 'amber' : 'gray'}`}>{ROLE_MN[u.role]}</span></td>
                  <td>{u.station ? <span className="badge teal">{u.station}</span> : <span style={{ color: 'var(--faint)' }}>Бүгд</span>}</td>
                  <td style={{ fontSize: 12.5, color: 'var(--muted)' }}>{u.email || '—'}{u.phone ? ` · ${u.phone}` : ''}</td>
                  <td className="num" style={{ fontSize: 12.5 }}>{fmtDate(u.created_at)}</td>
                  <td>{u.active ? <span className="badge green">Идэвхтэй</span> : <span className="badge red">Хаагдсан</span>}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <button className="btn ghost sm" onClick={() => { setEditing(u); setForm({ ...u, password: '' }); setShow(true); }}>Засах</button>
                    <button className="btn ghost sm" style={{ color: u.active ? 'var(--red)' : 'var(--green)' }} onClick={() => toggleActive(u)}>
                      {u.active ? 'Хаах' : 'Нээх'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {show && (
        <Modal title={editing ? `${editing.username} — засах` : 'Шинэ хэрэглэгч'} onClose={() => setShow(false)}>
          <form onSubmit={submit}>
            <div className="formgrid">
              {!editing && (
                <div className="field">
                  <label>Нэвтрэх нэр *</label>
                  <input required value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
                </div>
              )}
              <div className="field">
                <label>{editing ? 'Шинэ нууц үг (хоосон = хэвээр)' : 'Нууц үг * (мин 8)'}</label>
                <input type="password" value={form.password} minLength={form.password ? 8 : undefined} required={!editing}
                  onChange={(e) => setForm({ ...form, password: e.target.value })} />
              </div>
              <div className="field">
                <label>Бүтэн нэр *</label>
                <input required value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
              </div>
              <div className="field">
                <label>Эрх *</label>
                <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                  <option value="admin">Админ (Aero Mongolia IT)</option>
                  <option value="manager">Менежер (Үйл ажиллагаа)</option>
                  <option value="agent">Бүртгэлийн ажилтан (Check-in)</option>
                  <option value="ot_staff">ОТ аяллын ажилтан (Manifest)</option>
                </select>
              </div>
              <div className="field">
                <label>Ажиллах буудал (check-in/boarding автоматаар шүүгдэнэ)</label>
                <select value={form.station || ''} onChange={(e) => setForm({ ...form, station: e.target.value })}>
                  <option value="">Бүх буудал</option>
                  <option value="UB">{STATION_MN.UB}</option>
                  <option value="OT">{STATION_MN.OT}</option>
                </select>
              </div>
              <div className="field">
                <label>И-мэйл</label>
                <input type="email" value={form.email || ''} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </div>
              <div className="field">
                <label>Утас</label>
                <input value={form.phone || ''} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </div>
            </div>
            <div className="modal-actions">
              <button type="button" className="btn secondary" onClick={() => setShow(false)}>Болих</button>
              <button className="btn" disabled={busy}>Хадгалах</button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
