import React, { useEffect, useState } from 'react';
import { Icons } from '../ui.jsx';
import { LogoMark } from '../components/Logo.jsx';
import BoardingPass from '../components/BoardingPass.jsx';
import PrintPortal from '../components/PrintPortal.jsx';
import { fmtDate, fmtTime, addMinutes } from '../format.js';

// Passenger self check-in — public, Mongolian-first, phone → OTP → flight →
// baggage declaration → e-boarding pass that looks and prints like the real thing.

async function pub(path, body) {
  const res = await fetch(path, {
    method: body ? 'POST' : 'GET',
    headers: { 'content-type': 'application/json', ...(pub.token ? { authorization: `Bearer ${pub.token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Алдаа гарлаа');
  return data;
}

const STEPS = ['Нэвтрэх', 'OTP', 'Нислэг', 'Бүртгэл'];

export default function SelfCheckin() {
  const [step, setStep] = useState(0);
  const [mode, setMode] = useState('phone'); // 'phone' | 'sap'
  const [phone, setPhone] = useState('');
  const [sap, setSap] = useState('');
  const [maskedName, setMaskedName] = useState('');
  const [maskedPhone, setMaskedPhone] = useState('');
  const [devCode, setDevCode] = useState(null);
  const [otp, setOtp] = useState('');
  const [flights, setFlights] = useState([]);
  const [chosen, setChosen] = useState(null);
  const [bagWeight, setBagWeight] = useState('0');
  const [pass, setPass] = useState(null);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [notice, setNotice] = useState(null);

  const run = async (fn) => {
    setBusy(true); setErr(null);
    try { await fn(); } catch (ex) { setErr(ex.message); } finally { setBusy(false); }
  };

  const authBody = () => (mode === 'sap' ? { employee_id: sap.trim() } : { phone });

  const requestOtp = () => run(async () => {
    const d = await pub('/api/public/otp/request', authBody());
    setMaskedName(d.maskedName);
    setMaskedPhone(d.maskedPhone || phone);
    setDevCode(d.devCode || null);
    setStep(1);
  });

  const verify = () => run(async () => {
    const d = await pub('/api/public/otp/verify', { ...authBody(), code: otp });
    pub.token = d.token;
    const f = await pub('/api/public/my-flights');
    setFlights(f.flights);
    setStep(2);
  });

  const choose = async (f) => {
    setChosen(f);
    if (f.status !== 'PENDING') {
      // already checked in — go straight to the pass
      run(async () => {
        const bp = await pub(`/api/public/boarding-pass/${f.passenger_id}`);
        setPass(bp);
        setStep(4);
      });
    } else {
      setStep(3);
    }
  };

  const doCheckin = () => run(async () => {
    const r = await pub('/api/public/checkin', { passenger_id: chosen.passenger_id, baggage_weight: Number(bagWeight) || 0 });
    const bp = await pub(`/api/public/boarding-pass/${chosen.passenger_id}`);
    setPass(bp);
    setNotice(r.baggagePending
      ? 'Та ачаатай тул нисэх буудал дээр Check-in лангуунд ачаагаа өгч, бирк наалгана уу.'
      : null);
    setStep(4);
  });

  const reset = () => {
    setStep(0); setPhone(''); setSap(''); setOtp(''); setDevCode(null); setPass(null);
    setChosen(null); setErr(null); setBagWeight('0'); pub.token = null; setNotice(null);
    setMaskedPhone('');
  };

  return (
    <div className="hero-page">
      <div className="hero-topbar">
        <LogoMark size={40} text={false} />
        <div>
          <div style={{ fontWeight: 800, letterSpacing: 0.5 }}>AERO MONGOLIA</div>
          <div style={{ fontSize: 10.5, color: '#7f9db8', letterSpacing: 1.2 }}>ОНЛАЙН CHECK-IN</div>
        </div>
        <a className="right" href="/staff" style={{ textDecoration: 'none' }}>АЖИЛТНЫ ХЭСЭГ →</a>
      </div>

      <div className="hero-body">
        {step < 4 && (
          <div className="hero-card">
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 4 }}>
              {step === 0 && <Icons.users size={20} style={{ color: 'var(--blue)' }} />}
              {step === 1 && <Icons.shield size={20} style={{ color: 'var(--blue)' }} />}
              {step === 2 && <Icons.plane size={20} style={{ color: 'var(--blue)' }} />}
              {step === 3 && <Icons.bag size={20} style={{ color: 'var(--blue)' }} />}
              <h2 style={{ fontSize: 18 }}>
                {[mode === 'sap' ? 'SAP дугаараа оруулна уу' : 'Утасны дугаараа оруулна уу', 'Баталгаажуулалт', 'Нислэгийн мэдээлэл', 'Check-in бүртгэл'][step]}
              </h2>
            </div>
            <p style={{ color: 'var(--muted)', fontSize: 12.5, margin: '0 0 6px' }}>
              {[
                'Manifest-д бүртгэлтэй утас эсвэл SAP дугаараар нэвтэрнэ',
                `${maskedPhone} дугаарт илгээсэн кодыг оруулна уу`,
                `${maskedName} — Таны нислэгүүд`,
                'Ачааны жинг оруулаад баталгаажуулна уу',
              ][step]}
            </p>

            <div className="steps">
              {STEPS.map((s, i) => (
                <div key={s} className={`step ${i < step ? 'done' : i === step ? 'now' : ''}`}>
                  <div className="bar" />{s}
                </div>
              ))}
            </div>

            {err && <div className="alert error" style={{ marginBottom: 14 }}><Icons.alert size={16} />{err}</div>}

            {step === 0 && (
              <form onSubmit={(e) => { e.preventDefault(); requestOtp(); }}>
                <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
                  <button type="button" className={`btn ${mode === 'phone' ? '' : 'secondary'}`} style={{ flex: 1 }}
                    onClick={() => { setMode('phone'); setErr(null); }}>
                    <Icons.users size={15} />Утсаар
                  </button>
                  <button type="button" className={`btn ${mode === 'sap' ? '' : 'secondary'}`} style={{ flex: 1 }}
                    onClick={() => { setMode('sap'); setErr(null); }}>
                    <Icons.shield size={15} />SAP дугаараар
                  </button>
                </div>
                {mode === 'phone' ? (
                  <div className="field">
                    <label>УТАСНЫ ДУГААР</label>
                    <input inputMode="tel" autoFocus placeholder="9911 2233" value={phone}
                      style={{ fontSize: 22, textAlign: 'center', fontFamily: 'var(--mono)', letterSpacing: 3 }}
                      onChange={(e) => setPhone(e.target.value)} />
                  </div>
                ) : (
                  <div className="field">
                    <label>SAP / АЖИЛТНЫ ДУГААР</label>
                    <input inputMode="numeric" autoFocus placeholder="9494615" value={sap}
                      style={{ fontSize: 22, textAlign: 'center', fontFamily: 'var(--mono)', letterSpacing: 2 }}
                      onChange={(e) => setSap(e.target.value.replace(/\s/g, ''))} />
                    <span className="hint">Баталгаажуулах код таны бүртгэлтэй утсанд илгээгдэнэ</span>
                  </div>
                )}
                <button className="btn lg block"
                  disabled={busy || (mode === 'phone' ? phone.replace(/\D/g, '').length < 8 : sap.trim().length < 3)}>
                  {busy ? 'Шалгаж байна…' : 'Код авах'}
                </button>
              </form>
            )}

            {step === 1 && (
              <form onSubmit={(e) => { e.preventDefault(); verify(); }}>
                <div className="alert info" style={{ marginBottom: 14 }}>
                  <Icons.check size={16} />{maskedName} нэртэй зорчигч олдлоо.
                </div>
                {devCode && (
                  <div className="alert warn" style={{ marginBottom: 14 }}>
                    <Icons.alert size={16} />Туршилтын горим — таны код: <b style={{ fontFamily: 'var(--mono)', fontSize: 16 }}>{devCode}</b>
                  </div>
                )}
                <div className="field">
                  <label>6 ОРОНТОЙ OTP КОД</label>
                  <input className="otp-input" inputMode="numeric" maxLength={6} autoFocus value={otp}
                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))} />
                </div>
                <button className="btn lg block" disabled={busy || otp.length !== 6}>
                  {busy ? 'Шалгаж байна…' : 'Баталгаажуулах'}
                </button>
                <button type="button" className="btn secondary block" style={{ marginTop: 10 }} onClick={() => { setStep(0); setErr(null); }}>← Буцах</button>
              </form>
            )}

            {step === 2 && (
              <div>
                {flights.length === 0 && <div className="empty">Ойрын нислэгийн бүртгэл олдсонгүй</div>}
                {flights.map((f) => (
                  <div key={f.passenger_id} className="card card-pad" style={{ marginBottom: 10, cursor: 'pointer', border: '1.5px solid var(--line)' }}
                    onClick={() => choose(f)}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <b style={{ fontSize: 15 }}>{f.flight_number}</b>
                      {f.charter_code && <span className="badge gray">{f.charter_code}</span>}
                      <span style={{ marginLeft: 'auto' }}>
                        {f.status === 'PENDING'
                          ? <span className="badge amber">Бүртгүүлээгүй</span>
                          : <span className="badge green">Бүртгэлтэй · {f.seat}</span>}
                      </span>
                    </div>
                    <div className="route-line" style={{ margin: '10px 0 6px' }}>
                      <b style={{ fontSize: 19, color: 'var(--navy)' }}>{f.origin_code}</b>
                      <div className="dash"><Icons.plane size={15} /></div>
                      <b style={{ fontSize: 19, color: 'var(--navy)' }}>{f.dest_code}</b>
                    </div>
                    <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>
                      📅 {fmtDate(f.departure_ts)} — {fmtTime(addMinutes(f.departure_ts, f.delay_minutes))}
                      {f.delay_minutes > 0 && <b style={{ color: 'var(--amber)' }}> ({f.delay_minutes} мин хойшилсон)</b>}
                      {f.gate && ` · Gate ${f.gate}`}
                    </div>
                    {f.flight_status === 'SCHEDULED' && f.status === 'PENDING' && (
                      <div style={{ fontSize: 11.5, color: 'var(--faint)', marginTop: 6 }}>Check-in хараахан нээгдээгүй</div>
                    )}
                  </div>
                ))}
                <button className="btn secondary block" onClick={reset}>← Буцах</button>
              </div>
            )}

            {step === 3 && chosen && (
              <form onSubmit={(e) => { e.preventDefault(); doCheckin(); }}>
                <div className="card card-pad" style={{ marginBottom: 14, border: '1.5px solid var(--line)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <b>{chosen.flight_number}</b>
                    <span style={{ fontSize: 12, color: 'var(--muted)' }}>{fmtDate(chosen.departure_ts)}</span>
                  </div>
                  <div className="route-line" style={{ marginTop: 8 }}>
                    <b style={{ fontSize: 17, color: 'var(--navy)' }}>{chosen.origin_code}</b>
                    <div className="dash"><Icons.plane size={14} /></div>
                    <b style={{ fontSize: 17, color: 'var(--navy)' }}>{chosen.dest_code}</b>
                  </div>
                </div>
                <div className="field">
                  <label>АЧААНЫ ЖИН (КГ)</label>
                  <input type="number" min="0" max="100" step="0.5" value={bagWeight}
                    style={{ fontSize: 24, textAlign: 'center', fontFamily: 'var(--mono)' }}
                    onChange={(e) => setBagWeight(e.target.value)} autoFocus />
                  <span className="hint">Ачаагүй бол 0 үлдээнэ үү. Ачаатай бол буудал дээр лангуунд өгч бирк наалгана.</span>
                </div>
                <button className="btn green lg block" disabled={busy}>
                  <Icons.check size={17} />{busy ? 'Бүртгэж байна…' : 'Check-in баталгаажуулах'}
                </button>
                <button type="button" className="btn secondary block" style={{ marginTop: 10 }} onClick={() => setStep(2)}>← Буцах</button>
              </form>
            )}
          </div>
        )}

        {step === 4 && pass && (
          <div style={{ width: '100%', maxWidth: 720 }}>
            <div className="alert success" style={{ maxWidth: 480, margin: '0 auto 18px' }}>
              <Icons.check size={18} />
              <div><b>Check-in амжилттай!</b> Таны суудал баталгаажлаа{notice ? '' : ' — нислэгт сайн аяллаарай.'}</div>
            </div>
            {notice && (
              <div className="alert warn" style={{ maxWidth: 480, margin: '0 auto 18px' }}>
                <Icons.bag size={18} /><div>{notice}</div>
              </div>
            )}
            <div style={{ overflowX: 'auto', paddingBottom: 8 }}>
              <div style={{ minWidth: 'fit-content', padding: '0 8px' }}>
                <BoardingPass passenger={pass.passenger} airline={pass.airline} qrDataUrl={pass.qrDataUrl} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 18, flexWrap: 'wrap' }}>
              <button className="btn lg" onClick={() => setPrinting(true)}><Icons.printer size={16} />Хэвлэх / PDF хадгалах</button>
              <button className="btn secondary lg" onClick={reset}><Icons.x size={15} />Дахин бүртгүүлэх</button>
            </div>
            <p style={{ textAlign: 'center', color: '#7f9db8', fontSize: 12.5, marginTop: 14 }}>
              <Icons.qr size={13} /> Нислэгт суухдаа энэ QR кодыг скан хийлгэнэ үү — утасны дэлгэцээс шууд уншина.
            </p>
          </div>
        )}
      </div>

      <div className="hero-foot">© {new Date().getFullYear()} Aero Mongolia — Voyage E-Boarding · Passenger Self Check-in</div>

      {printing && pass && (
        <PrintPortal pageSize="189mm 85mm" onDone={() => setPrinting(false)}>
          <BoardingPass passenger={pass.passenger} airline={pass.airline} qrDataUrl={pass.qrDataUrl} />
        </PrintPortal>
      )}
    </div>
  );
}
