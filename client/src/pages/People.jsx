import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import { Icons, Spinner, Modal, useToast } from '../ui.jsx';
import { fmtDate, fmtDateTime, PAX_STATUS } from '../format.js';

const LIMIT = 50;

export default function People() {
  const toast = useToast();
  const [qtext, setQtext] = useState('');
  const [page, setPage] = useState(0);
  const [data, setData] = useState(null);
  const [detail, setDetail] = useState(null); // {person, flights}
  const [edit, setEdit] = useState(null);     // {phone, email}

  useEffect(() => {
    const t = setTimeout(() => {
      const params = new URLSearchParams({ limit: LIMIT, offset: page * LIMIT });
      if (qtext.trim().length >= 2) params.set('qtext', qtext.trim());
      api.get(`/api/people?${params}`).then(setData).catch((ex) => toast(ex.message, 'error'));
    }, 250);
    return () => clearTimeout(t);
  }, [qtext, page]);

  const open = (p) => {
    api.get(`/api/people/${p.id}`).then((d) => {
      setDetail(d);
      setEdit({ phone: d.person.phone || '', email: d.person.email || '' });
    }).catch((ex) => toast(ex.message, 'error'));
  };

  const save = async () => {
    try {
      const d = await api.put(`/api/people/${detail.person.id}`, { phone: edit.phone || null, email: edit.email || null });
      toast('Хадгалагдлаа', 'success');
      setDetail({ ...detail, person: d.person });
      setData((cur) => cur && { ...cur, people: cur.people.map((p) => (p.id === d.person.id ? d.person : p)) });
    } catch (ex) { toast(ex.message, 'error'); }
  };

  const pages = data ? Math.ceil(data.total / LIMIT) : 0;

  return (
    <>
      <div className="page-head">
        <h1>Зорчигчийн нэгдсэн сан</h1>
        {data && <span className="badge blue">{data.total} хүн</span>}
      </div>

      <p style={{ color: 'var(--muted)', fontSize: 12.5, margin: '0 0 14px' }}>
        Manifest импорт бүрээс автоматаар хуримтлагддаг мастер бүртгэл. Утас солигдоход түүх нь хадгалагдаж,
        SAP дугаараар баталгаажуулахад ашиглагдана. И-мэйл зэрэг холбоо барих мэдээлэл нь ирээдүйн нислэгийн
        сануулга, мэдэгдэл илгээх суурь болно.
      </p>

      <div className="card card-pad" style={{ marginBottom: 14 }}>
        <div className="search" style={{ maxWidth: 420 }}>
          <Icons.search size={16} style={{ color: 'var(--faint)' }} />
          <input placeholder="Нэр, SAP ID, утас, и-мэйлээр хайх…" value={qtext}
            onChange={(e) => { setPage(0); setQtext(e.target.value); }} />
        </div>
      </div>

      <div className="card">
        <div className="tablewrap">
          <table className="tbl">
            <thead><tr>
              <th>Нэр</th><th>SAP ID</th><th>Утас</th><th>И-мэйл</th><th>Компани / Алба</th><th>Нислэг</th><th>Сүүлд</th>
            </tr></thead>
            <tbody>
              {!data && <tr><td colSpan={7}><Spinner /></td></tr>}
              {data?.people.length === 0 && <tr><td colSpan={7}><div className="empty">Олдсонгүй</div></td></tr>}
              {data?.people.map((p) => (
                <tr key={p.id} style={{ cursor: 'pointer' }} onClick={() => open(p)}>
                  <td><b>{p.title ? `${p.title} ` : ''}{p.full_name}</b></td>
                  <td style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>{p.employee_id || '—'}</td>
                  <td>{p.phone || '—'}{(p.phone_history?.length || 0) > 0 && (
                    <span title="Утас өөрчлөгдсөн түүхтэй" style={{ fontSize: 11, color: 'var(--faint)' }}> ({p.phone_history.length} хуучин)</span>
                  )}</td>
                  <td style={{ fontSize: 12.5 }}>{p.email || '—'}</td>
                  <td style={{ fontSize: 12.5, color: 'var(--muted)' }}>{[p.company, p.department].filter(Boolean).join(' · ') || '—'}</td>
                  <td className="num">{p.flights_count}</td>
                  <td className="num" style={{ fontSize: 12 }}>{fmtDate(p.last_seen_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {pages > 1 && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'center', padding: 12 }}>
            <button className="btn ghost sm" disabled={page === 0} onClick={() => setPage(page - 1)}>← Өмнөх</button>
            <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>{page + 1} / {pages}</span>
            <button className="btn ghost sm" disabled={page + 1 >= pages} onClick={() => setPage(page + 1)}>Дараах →</button>
          </div>
        )}
      </div>

      {detail && (
        <Modal title={`${detail.person.title ? `${detail.person.title} ` : ''}${detail.person.full_name}`} onClose={() => setDetail(null)} wide>
          <div className="formgrid" style={{ marginBottom: 14 }}>
            <div className="field"><label>SAP ID</label>
              <input value={detail.person.employee_id || '—'} disabled /></div>
            <div className="field"><label>Компани / Алба</label>
              <input value={[detail.person.company, detail.person.department].filter(Boolean).join(' · ') || '—'} disabled /></div>
            <div className="field"><label>Утас</label>
              <input value={edit.phone} onChange={(e) => setEdit({ ...edit, phone: e.target.value })} /></div>
            <div className="field"><label>И-мэйл (мэдэгдэл илгээхэд ашиглана)</label>
              <input value={edit.email} onChange={(e) => setEdit({ ...edit, email: e.target.value })} placeholder="name@ot.mn" /></div>
          </div>
          {(detail.person.phone_history?.length || 0) > 0 && (
            <p style={{ fontSize: 12, color: 'var(--muted)', margin: '0 0 12px' }}>
              <b>Хуучин дугаарууд:</b>{' '}
              {detail.person.phone_history.map((h) => `${h.phone} (${fmtDate(h.replaced_at)} хүртэл)`).join(', ')}
            </p>
          )}
          <h3 style={{ fontSize: 14, margin: '0 0 8px' }}>Нислэгийн түүх ({detail.flights.length})</h3>
          <div className="tablewrap" style={{ maxHeight: 260, overflow: 'auto' }}>
            <table className="tbl">
              <thead><tr><th>Нислэг</th><th>Чиглэл</th><th>Огноо</th><th>Суудал</th><th>Төлөв</th></tr></thead>
              <tbody>
                {detail.flights.map((f) => (
                  <tr key={f.passenger_id} style={f.active === false ? { opacity: 0.5 } : undefined}>
                    <td><b>{f.flight_number}</b></td>
                    <td>{f.origin_code}→{f.dest_code}</td>
                    <td style={{ fontSize: 12.5 }}>{fmtDateTime(f.departure_ts)}</td>
                    <td>{f.seat || '—'}</td>
                    <td>{f.active === false
                      ? <span className="badge gray">MANIFEST-ЭЭС ХАСАГДСАН</span>
                      : <span className={`badge ${PAX_STATUS[f.status]?.color || 'blue'}`}>{PAX_STATUS[f.status]?.mn || f.status}</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="modal-actions">
            <button className="btn secondary" onClick={() => setDetail(null)}>Хаах</button>
            <button className="btn" onClick={save}>Хадгалах</button>
          </div>
        </Modal>
      )}
    </>
  );
}
