import React, { useContext, useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { AuthCtx } from '../App.jsx';
import { Icons, Spinner, useToast } from '../ui.jsx';
import { fmtDateTime } from '../format.js';

export default function Manifests() {
  const user = useContext(AuthCtx);
  const toast = useToast();
  const fileRef = useRef(null);
  const [manifests, setManifests] = useState(null);
  const [emailLog, setEmailLog] = useState(null);
  const [tab, setTab] = useState('list');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [force, setForce] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const canForce = ['admin', 'manager'].includes(user.role);
  const canSeeEmailLog = ['admin', 'manager'].includes(user.role);

  const load = () => {
    api.get('/api/manifests').then((d) => setManifests(d.manifests));
    if (canSeeEmailLog) api.get('/api/manifests/email-log').then((d) => setEmailLog(d.log)).catch(() => {});
  };
  useEffect(() => { load(); }, []);

  const uploadFile = async (file) => {
    if (!file) return;
    setBusy(true); setResult(null);
    const fd = new FormData();
    fd.append('file', file);
    if (force) fd.append('force', 'true');
    try {
      const r = await api.upload('/api/manifests/upload', fd);
      setResult(r);
      toast(`Manifest амжилттай: ${r.flight.flight_number} (+${r.added} / ~${r.updated} / -${r.removed})`, 'success');
      load();
    } catch (ex) {
      setResult(ex.data || { ok: false, error: ex.message });
      toast(ex.data?.error || ex.message, 'error');
      load();
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <>
      <div className="page-head">
        <h1>Зорчигчийн Manifest</h1>
        <div className="spacer" />
        {canSeeEmailLog && (
          <div style={{ display: 'flex', gap: 4 }}>
            <button className={`btn ${tab === 'list' ? '' : 'secondary'} sm`} onClick={() => setTab('list')}>Импортын түүх</button>
            <button className={`btn ${tab === 'email' ? '' : 'secondary'} sm`} onClick={() => setTab('email')}>И-мэйл лог</button>
          </div>
        )}
      </div>

      <div
        className="card card-pad"
        style={{
          marginBottom: 16, textAlign: 'center', padding: '34px 20px',
          border: dragOver ? '2px dashed var(--blue)' : '2px dashed var(--line)',
          background: dragOver ? 'var(--sky)' : 'var(--card)', cursor: 'pointer',
        }}
        onClick={() => fileRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); uploadFile(e.dataTransfer.files[0]); }}
      >
        <Icons.upload size={30} style={{ color: 'var(--blue)' }} />
        <h3 style={{ margin: '10px 0 4px' }}>{busy ? 'Импортолж байна…' : 'Excel manifest оруулах'}</h3>
        <p style={{ color: 'var(--muted)', fontSize: 13, margin: 0 }}>
          OT форматын .xlsx файлыг чирж тавих эсвэл дарж сонгоно уу.<br />
          Файл нислэгийн кодтой автоматаар тулгагдана (Transport Number + огноо).
        </p>
        <input ref={fileRef} type="file" accept=".xlsx,.xls" hidden onChange={(e) => uploadFile(e.target.files[0])} />
        {canForce && (
          <label style={{ display: 'inline-flex', gap: 6, alignItems: 'center', marginTop: 12, fontSize: 12.5, color: 'var(--muted)' }}
            onClick={(e) => e.stopPropagation()}>
            <input type="checkbox" checked={force} onChange={(e) => setForce(e.target.checked)} />
            Хугацааны цонхыг (24ц–3ц) алгасах — зөвхөн онцгой тохиолдолд
          </label>
        )}
      </div>

      {result && (
        <div className={`alert ${result.ok ? 'success' : 'error'}`} style={{ marginBottom: 16 }}>
          {result.ok ? <Icons.check size={17} /> : <Icons.alert size={17} />}
          <div>
            {result.ok ? (
              <>
                <b>{result.flight.flight_number}</b> — {result.added} нэмэгдсэн, {result.updated} шинэчлэгдсэн, {result.removed} хасагдсан.
                {result.warnings?.length > 0 && (
                  <ul style={{ margin: '6px 0 0 16px' }}>{result.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
                )}
              </>
            ) : (
              <><b>Импорт амжилтгүй:</b> {result.error}</>
            )}
          </div>
        </div>
      )}

      <div className="alert info" style={{ marginBottom: 16 }}>
        <Icons.mail size={17} />
        <div>
          <b>И-мэйлээр авто-импорт:</b> ОТ аяллын ажилтнууд manifest-ээ томилогдсон шуудангийн хаяг руу илгээхэд систем
          2 минут тутам шалгаж, авто-импорт хийнэ. Хугацааны шаардлага: нислэгээс өмнөх <b>24 цагаас 3 цагийн</b> хооронд.
          (Шуудангийн тохиргоог Тохиргоо хэсэгт админ идэвхжүүлнэ.)
        </div>
      </div>

      {tab === 'list' && (
        <div className="card">
          <div className="tablewrap">
            <table className="tbl">
              <thead><tr>
                <th>Огноо</th><th>Файл</th><th>Эх үүсвэр</th><th>Нислэг</th><th>Зорчигч</th><th>Төлөв</th><th>Тайлбар</th>
              </tr></thead>
              <tbody>
                {!manifests && <tr><td colSpan={7}><Spinner /></td></tr>}
                {manifests?.length === 0 && <tr><td colSpan={7}><div className="empty">Manifest ирээгүй байна</div></td></tr>}
                {manifests?.map((m) => (
                  <tr key={m.id}>
                    <td className="num" style={{ fontSize: 12.5 }}>{fmtDateTime(m.created_at)}</td>
                    <td style={{ maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', fontSize: 12.5 }}>{m.filename}</td>
                    <td>{m.source === 'email'
                      ? <span className="badge teal">EMAIL{m.email_from ? ` · ${m.email_from}` : ''}</span>
                      : <span className="badge gray">UPLOAD{m.imported_by_name ? ` · ${m.imported_by_name}` : ''}</span>}</td>
                    <td>{m.flight_number ? <b>{m.flight_number}</b> : '—'}</td>
                    <td className="num">{m.passenger_count || '—'}</td>
                    <td>{m.status === 'ACCEPTED' ? <span className="badge green">ACCEPTED</span> : <span className="badge red">REJECTED</span>}</td>
                    <td style={{ fontSize: 12, color: 'var(--muted)', maxWidth: 300 }}>
                      {m.error || (m.warnings?.length ? m.warnings.join('; ') : '—')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'email' && (
        <div className="card">
          <div className="tablewrap">
            <table className="tbl">
              <thead><tr><th>Огноо</th><th>Илгээгч</th><th>Гарчиг</th><th>Төлөв</th><th>Тайлбар</th></tr></thead>
              <tbody>
                {!emailLog && <tr><td colSpan={5}><Spinner /></td></tr>}
                {emailLog?.length === 0 && <tr><td colSpan={5}><div className="empty">И-мэйл ирээгүй байна — IMAP тохиргоог Тохиргоо хэсэгт идэвхжүүлнэ үү</div></td></tr>}
                {emailLog?.map((e) => (
                  <tr key={e.id}>
                    <td className="num" style={{ fontSize: 12.5 }}>{fmtDateTime(e.created_at)}</td>
                    <td style={{ fontSize: 12.5 }}>{e.from_addr}</td>
                    <td style={{ fontSize: 12.5, maxWidth: 260, overflow: 'hidden', textOverflowe: 'ellipsis' }}>{e.subject}</td>
                    <td>{e.status === 'PROCESSED' ? <span className="badge green">PROCESSED</span>
                      : e.status === 'SKIPPED' ? <span className="badge gray">SKIPPED</span>
                      : <span className="badge red">ERROR</span>}</td>
                    <td style={{ fontSize: 12, color: 'var(--muted)' }}>{e.detail}</td>
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
