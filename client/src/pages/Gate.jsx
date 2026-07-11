import React, { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { api } from '../api.js';
import { getSocket } from '../socket.js';
import { Icons, Spinner, useToast, PaxBadge } from '../ui.jsx';
import { fmtTime } from '../format.js';
import { C } from '../charts.jsx';

export default function Gate() {
  const toast = useToast();
  const [flights, setFlights] = useState([]);
  const [flightId, setFlightId] = useState('');
  const [point, setPoint] = useState('GATE');
  const [status, setStatus] = useState(null); // boarding status
  const [result, setResult] = useState(null); // last scan
  const [manual, setManual] = useState('');
  const [cameraOn, setCameraOn] = useState(false);
  const [cameraErr, setCameraErr] = useState(null);
  const scannerRef = useRef(null);
  const lockRef = useRef(false);

  const loadFlights = () => api.get('/api/flights').then((d) => {
    const active = d.flights.filter((f) => ['CHECKIN_OPEN', 'BOARDING'].includes(f.status));
    setFlights(active);
    if (!flightId && active[0]) setFlightId(active[0].id);
  });

  useEffect(() => { loadFlights(); }, []);

  const loadStatus = () => {
    if (!flightId) return;
    api.get(`/api/boarding/flights/${flightId}/status`).then(setStatus);
  };
  useEffect(() => {
    loadStatus();
    const s = getSocket();
    if (!s || !flightId) return;
    s.emit('watch-flight', flightId);
    const refresh = (p) => { if (p.flightId === flightId) loadStatus(); };
    s.on('scan:event', refresh); s.on('passenger:update', refresh);
    return () => { s.emit('unwatch-flight', flightId); s.off('scan:event', refresh); s.off('passenger:update', refresh); };
  }, [flightId]);

  const submitScan = async (code) => {
    if (lockRef.current) return;
    lockRef.current = true;
    try {
      const r = await api.post('/api/boarding/scan', { code, point, flight_id: flightId || null });
      setResult(r);
      if (navigator.vibrate) navigator.vibrate(r.ok ? 80 : [80, 60, 80]);
      loadStatus();
    } catch (ex) {
      toast(ex.message, 'error');
    } finally {
      setTimeout(() => { lockRef.current = false; }, 1200);
    }
  };

  const startCamera = async () => {
    setCameraErr(null);
    try {
      const scanner = new Html5Qrcode('qr-reader');
      scannerRef.current = scanner;
      await scanner.start(
        { facingMode: 'environment' },
        { fps: 8, qrbox: { width: 240, height: 240 } },
        (text) => submitScan(text),
        () => {}
      );
      setCameraOn(true);
    } catch (err) {
      setCameraErr('Камер нээж чадсангүй — HTTPS холболт болон камерын зөвшөөрөл шаардлагатай. Гар оруулалт ашиглана уу.');
    }
  };
  const stopCamera = async () => {
    try { await scannerRef.current?.stop(); scannerRef.current?.clear(); } catch { /* noop */ }
    setCameraOn(false);
  };
  useEffect(() => () => { scannerRef.current?.stop().catch(() => {}); }, []);

  const bs = status?.byStatus || {};
  const boarded = bs.BOARDED || 0;
  const security = bs.SECURITY_PASSED || 0;
  const checked = (bs.CHECKED_IN || 0) + security + boarded;
  const total = checked + (bs.PENDING || 0);

  return (
    <>
      <div className="page-head">
        <h1>Boarding хяналт — скан</h1>
        <div className="spacer" />
        <select className="btn secondary" value={flightId} onChange={(e) => { setFlightId(e.target.value); setResult(null); }}>
          <option value="">Нислэг сонгох…</option>
          {flights.map((f) => <option key={f.id} value={f.id}>{f.flight_number} · {f.origin_code}→{f.dest_code} · {fmtTime(f.departure_ts)}</option>)}
        </select>
      </div>

      <div className="grid" style={{ gridTemplateColumns: 'minmax(300px, 420px) 1fr' }}>
        <div>
          <div className="card card-pad" style={{ marginBottom: 14 }}>
            <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
              <button className={`btn ${point === 'SECURITY' ? '' : 'secondary'}`} style={{ flex: 1 }} onClick={() => setPoint('SECURITY')}>
                <Icons.shield size={16} />Security
              </button>
              <button className={`btn ${point === 'GATE' ? 'green' : 'secondary'}`} style={{ flex: 1 }} onClick={() => setPoint('GATE')}>
                <Icons.gate size={16} />Gate / Boarding
              </button>
            </div>

            <div id="qr-reader" style={{ display: cameraOn ? 'block' : 'none', marginBottom: 10 }} />
            {!cameraOn ? (
              <button className="btn block" onClick={startCamera}><Icons.scan size={16} />Камер асаах</button>
            ) : (
              <button className="btn secondary block" onClick={stopCamera}>Камер унтраах</button>
            )}
            {cameraErr && <div className="alert warn" style={{ marginTop: 10 }}><Icons.alert size={15} />{cameraErr}</div>}

            <form style={{ display: 'flex', gap: 8, marginTop: 12 }} onSubmit={(e) => { e.preventDefault(); if (manual.trim()) { submitScan(manual.trim()); setManual(''); } }}>
              <input placeholder="QR утга / гараар оруулах…" value={manual} onChange={(e) => setManual(e.target.value)}
                style={{ flex: 1, border: '1px solid var(--line)', borderRadius: 8, padding: '8px 12px', fontFamily: 'var(--mono)', fontSize: 12 }} />
              <button className="btn sm">Шалгах</button>
            </form>
          </div>

          {result && (
            <div className={`scan-result ${result.ok ? 'ok' : 'fail'}`}>
              {result.ok ? <Icons.check size={34} /> : <Icons.x size={34} />}
              <div className="big">{result.message}</div>
              {result.passenger && (
                <>
                  <div style={{ fontSize: 16, fontWeight: 700 }}>{result.passenger.title} {result.passenger.full_name}</div>
                  <div className="seat-big">{result.passenger.seat || '—'}</div>
                  <div style={{ fontSize: 12, opacity: 0.85 }}>PNR {result.passenger.pnr} · SEQ {String(result.passenger.checkin_seq || 0).padStart(3, '0')}</div>
                </>
              )}
              <div style={{ fontSize: 11, opacity: 0.7, marginTop: 8 }}>{result.result} · {point}</div>
            </div>
          )}
        </div>

        <div>
          <div className="stat-row" style={{ marginBottom: 14 }}>
            <div className="stat"><div className="label">Онгоцонд суусан</div><div className="value" style={{ color: C.green }}>{boarded}<small> / {total}</small></div></div>
            <div className="stat"><div className="label">Security өнгөрсөн</div><div className="value">{security}</div></div>
            <div className="stat"><div className="label">Бүртгүүлсэн (нийт)</div><div className="value">{checked}<small> / {total}</small></div></div>
          </div>
          <div className="card">
            <div className="card-pad" style={{ borderBottom: '1px solid var(--line)' }}><h3>Сүүлийн сканууд</h3></div>
            <div className="tablewrap">
              <table className="tbl">
                <thead><tr><th>Цаг</th><th>Цэг</th><th>Зорчигч</th><th>Суудал</th><th>Үр дүн</th></tr></thead>
                <tbody>
                  {(!status || status.recent.length === 0) && <tr><td colSpan={5}><div className="empty">Скан хийгдээгүй байна</div></td></tr>}
                  {status?.recent.map((s) => (
                    <tr key={s.id}>
                      <td className="num">{fmtTime(s.ts)}</td>
                      <td><span className={`badge ${s.point === 'GATE' ? 'green' : 'teal'}`}>{s.point}</span></td>
                      <td>{s.full_name || '—'}</td>
                      <td className="num">{s.seat || '—'}</td>
                      <td>{s.result === 'OK'
                        ? <span className="badge green">OK</span>
                        : <span className="badge red">{s.result}</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
