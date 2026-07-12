import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import { Icons, Spinner, useToast } from '../ui.jsx';
import SeatMap from '../components/SeatMap.jsx';

function Section({ title, desc, children, onSave, busy }) {
  return (
    <div className="card card-pad" style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 10 }}>
        <div style={{ flex: 1 }}>
          <h3>{title}</h3>
          {desc && <p style={{ color: 'var(--muted)', fontSize: 12.5, margin: '2px 0 0' }}>{desc}</p>}
        </div>
        {onSave && <button className="btn sm" disabled={busy} onClick={onSave}>Хадгалах</button>}
      </div>
      {children}
    </div>
  );
}

const STATION_LABEL = { '': 'Бүх буудал', UB: 'UB — Чингис хаан', OT: 'OT — Ханбумбат' };

function TwoFactorSection({ toast }) {
  const [enabled, setEnabled] = useState(null);
  const [setup, setSetup] = useState(null); // {secret, qr}
  const [code, setCode] = useState('');
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get('/api/auth/me').then((d) => setEnabled(!!d.user.totp_enabled)).catch(() => setEnabled(false));
  }, []);

  const begin = async () => {
    setBusy(true);
    try { setSetup(await api.post('/api/auth/totp/setup', {})); setCode(''); }
    catch (ex) { toast(ex.message, 'error'); } finally { setBusy(false); }
  };
  const enable = async () => {
    setBusy(true);
    try {
      await api.post('/api/auth/totp/enable', { secret: setup.secret, code });
      toast('2FA идэвхжлээ', 'success'); setEnabled(true); setSetup(null);
    } catch (ex) { toast(ex.message, 'error'); } finally { setBusy(false); }
  };
  const disable = async () => {
    setBusy(true);
    try {
      await api.post('/api/auth/totp/disable', { password: pw });
      toast('2FA унтарлаа', 'success'); setEnabled(false); setPw('');
    } catch (ex) { toast(ex.message, 'error'); } finally { setBusy(false); }
  };

  if (enabled === null) return null;
  return (
    <Section title="Хоёр шатлалт баталгаажуулалт (2FA)" desc="Таны дансанд нэвтрэхэд нууц үгээс гадна authenticator аппын 6 оронтой код шаардана">
      {enabled ? (
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <span className="badge green">Идэвхтэй</span>
          <input type="password" placeholder="Нууц үгээ оруулж унтраана" value={pw}
            onChange={(e) => setPw(e.target.value)} style={{ maxWidth: 260 }} />
          <button className="btn ghost sm" style={{ color: 'var(--red)' }} disabled={!pw || busy} onClick={disable}>Унтраах</button>
        </div>
      ) : setup ? (
        <div style={{ display: 'flex', gap: 18, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <img src={setup.qr} alt="TOTP QR" width={180} height={180} style={{ borderRadius: 8, border: '1px solid var(--line)' }} />
          <div style={{ flex: 1, minWidth: 240 }}>
            <p style={{ fontSize: 13, margin: '0 0 8px' }}>
              1. Google Authenticator / Microsoft Authenticator аппаар QR-ийг уншуулна.<br />
              2. Аппын үзүүлж буй 6 оронтой кодыг доор оруулж баталгаажуулна.
            </p>
            <p style={{ fontSize: 11.5, color: 'var(--faint)', fontFamily: 'var(--mono)', margin: '0 0 10px', wordBreak: 'break-all' }}>
              Гар аргаар: {setup.secret}
            </p>
            <div style={{ display: 'flex', gap: 8 }}>
              <input inputMode="numeric" maxLength={6} placeholder="000000" value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} style={{ maxWidth: 140 }} />
              <button className="btn sm" disabled={code.length !== 6 || busy} onClick={enable}>Идэвхжүүлэх</button>
              <button className="btn ghost sm" onClick={() => setSetup(null)}>Болих</button>
            </div>
          </div>
        </div>
      ) : (
        <button className="btn sm" disabled={busy} onClick={begin}><Icons.shield size={14} />Тохируулж эхлэх</button>
      )}
    </Section>
  );
}

function PrinterSection({ toast }) {
  const [catalog, setCatalog] = useState([]);
  const [printers, setPrinters] = useState(null);
  const [installKey, setInstallKey] = useState('');
  const [installName, setInstallName] = useState('');
  const [installStation, setInstallStation] = useState('');
  const [busy, setBusy] = useState(false);

  const load = () => api.get('/api/printers').then((d) => setPrinters(d.printers)).catch((ex) => toast(ex.message, 'error'));
  useEffect(() => {
    api.get('/api/printers/catalog').then((d) => setCatalog(d.catalog)).catch(() => {});
    load();
  }, []);

  const chosen = catalog.find((c) => c.model_key === installKey);

  const install = async () => {
    if (!installKey) return;
    setBusy(true);
    try {
      await api.post('/api/printers/install', { model_key: installKey, name: installName, station: installStation || null });
      toast('Хэвлэгч суулгагдлаа', 'success');
      setInstallKey(''); setInstallName(''); setInstallStation('');
      load();
    } catch (ex) { toast(ex.message, 'error'); } finally { setBusy(false); }
  };

  const update = async (id, patch) => {
    try { await api.put(`/api/printers/${id}`, patch); load(); }
    catch (ex) { toast(ex.message, 'error'); }
  };

  const remove = async (p) => {
    if (!window.confirm(`"${p.name}" хэвлэгчийг устгах уу?`)) return;
    try { await api.del(`/api/printers/${p.id}`); toast('Устгагдлаа', 'success'); load(); }
    catch (ex) { toast(ex.message, 'error'); }
  };

  return (
    <Section title="Бирк / Boarding pass хэвлэгч" desc="Каталогоос хэвлэгчийн тохиргоо суулгаж, counter бүр суулгасан хэвлэгчээс сонгоно">
      {/* installed printers */}
      <div className="tablewrap" style={{ marginBottom: 16 }}>
        <table className="tbl">
          <thead><tr><th>Нэр</th><th>Загвар</th><th>Төрөл</th><th>Буудал</th><th>Media / DPI</th><th>Төлөв</th><th style={{ width: 220 }}></th></tr></thead>
          <tbody>
            {!printers && <tr><td colSpan={7}><Spinner /></td></tr>}
            {printers?.length === 0 && (
              <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--faint)', padding: 20 }}>
                Суулгасан хэвлэгч алга — доорх каталогоос суулгана уу
              </td></tr>
            )}
            {printers?.map((p) => (
              <tr key={p.id} style={p.active ? undefined : { opacity: 0.5 }}>
                <td><b>{p.name}</b>{p.is_default && <span className="badge green" style={{ marginLeft: 6 }}>үндсэн</span>}</td>
                <td style={{ fontFamily: 'var(--mono)', fontSize: 11.5 }}>{p.model_key}</td>
                <td>{p.kind === 'bagtag' ? 'Бирк' : p.kind === 'boarding' ? 'Boarding pass' : 'Бирк + BP'}</td>
                <td>{p.station || 'Бүгд'}</td>
                <td style={{ fontSize: 11.5 }}>{p.config?.media}{p.config?.dpi ? ` · ${p.config.dpi}dpi` : ''}</td>
                <td><span className={`badge ${p.active ? 'green' : 'gray'}`}>{p.active ? 'Идэвхтэй' : 'Идэвхгүй'}</span></td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  {!p.is_default && <button className="btn ghost sm" onClick={() => update(p.id, { is_default: true })}>Үндсэн</button>}{' '}
                  <button className="btn ghost sm" onClick={() => update(p.id, { active: !p.active })}>{p.active ? 'Унтраах' : 'Асаах'}</button>{' '}
                  <a className="btn ghost sm" href="#" onClick={(e) => {
                    e.preventDefault();
                    api.get(`/api/printers/${p.id}/config`).then((cfgJson) => {
                      const blob = new Blob([JSON.stringify(cfgJson, null, 2)], { type: 'application/json' });
                      const a = document.createElement('a');
                      a.href = URL.createObjectURL(blob);
                      a.download = `voyage-printer-${p.model_key}.json`;
                      a.click();
                      URL.revokeObjectURL(a.href);
                    }).catch((ex) => toast(ex.message, 'error'));
                  }}>Config татах</a>{' '}
                  <button className="btn ghost sm" style={{ color: 'var(--red)' }} onClick={() => remove(p)}>Устгах</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* install from catalog */}
      <div style={{ border: '1px dashed var(--line)', borderRadius: 10, padding: 14 }}>
        <div style={{ fontWeight: 650, fontSize: 13, marginBottom: 10 }}>Каталогоос суулгах</div>
        <div className="formgrid">
          <div className="field"><label>Хэвлэгчийн загвар</label>
            <select value={installKey} onChange={(e) => setInstallKey(e.target.value)}>
              <option value="">— Сонгох —</option>
              {catalog.map((c) => <option key={c.model_key} value={c.model_key}>{c.vendor} {c.model}</option>)}
            </select></div>
          <div className="field"><label>Нэр (counter)</label>
            <input placeholder={chosen ? `${chosen.vendor} ${chosen.model}` : 'Counter 1 — Fujitsu'} value={installName}
              onChange={(e) => setInstallName(e.target.value)} /></div>
          <div className="field"><label>Буудал</label>
            <select value={installStation} onChange={(e) => setInstallStation(e.target.value)}>
              {Object.entries(STATION_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select></div>
        </div>
        {chosen && (
          <p style={{ fontSize: 12.5, color: 'var(--muted)', margin: '8px 0' }}>
            {chosen.description} — media {chosen.config.media}, {chosen.config.dpi}dpi.
            {chosen.driver_url && <> Драйвер: <a href={chosen.driver_url} target="_blank" rel="noreferrer">үйлдвэрлэгчийн сайтаас татах ↗</a></>}
          </p>
        )}
        <button className="btn sm" disabled={!installKey || busy} onClick={install}>
          <Icons.printer size={14} />Суулгах
        </button>
      </div>
    </Section>
  );
}

export default function Settings() {
  const toast = useToast();
  const [settings, setSettings] = useState(null);
  const [aircraft, setAircraft] = useState([]);
  const [viewAc, setViewAc] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get('/api/settings').then((d) => setSettings(d.settings));
    api.get('/api/aircraft').then((d) => setAircraft(d.aircraft));
  }, []);

  const save = async (key) => {
    setBusy(true);
    try {
      await api.put(`/api/settings/${key}`, { value: settings[key] });
      toast('Хадгалагдлаа', 'success');
    } catch (ex) { toast(ex.message, 'error'); } finally { setBusy(false); }
  };

  const set = (key, patch) => setSettings({ ...settings, [key]: { ...settings[key], ...patch } });

  if (!settings) return <Spinner />;
  const s = settings;

  return (
    <>
      <div className="page-head"><h1>Системийн тохиргоо</h1></div>

      <Section title="Агаарын тээвэрлэгч" desc="Boarding pass болон биркэн дээр хэвлэгдэх мэдээлэл" onSave={() => save('airline')} busy={busy}>
        <div className="formgrid">
          <div className="field"><label>Нэр</label>
            <input value={s.airline.name} onChange={(e) => set('airline', { name: e.target.value })} /></div>
          <div className="field"><label>Лого текст</label>
            <input value={s.airline.logo_text} onChange={(e) => set('airline', { logo_text: e.target.value })} /></div>
          <div className="field"><label>IATA код (BCBP carrier)</label>
            <input value={s.airline.iata} maxLength={3} onChange={(e) => set('airline', { iata: e.target.value.toUpperCase() })} /></div>
          <div className="field"><label>Биркний 3 оронтой код (IATA 740 license plate)</label>
            <input value={s.airline.numeric_code} maxLength={3} onChange={(e) => set('airline', { numeric_code: e.target.value.replace(/\D/g, '') })} />
            <span className="hint">Захиалгат нислэгт өөрийн код ашиглана — албан ёсны кодоо энд оруулна уу</span></div>
        </div>
      </Section>

      <Section title="Manifest хүлээн авах цонх" desc="ОТ-оос ирэх зорчигчийн жагсаалтыг хүлээн авах хугацааны хязгаар" onSave={() => save('manifest_window')} busy={busy}>
        <div className="formgrid">
          <div className="field"><label>Дээд хязгаар (нислэгээс өмнөх цаг)</label>
            <input type="number" min="1" value={s.manifest_window.max_hours_before}
              onChange={(e) => set('manifest_window', { max_hours_before: Number(e.target.value) })} /></div>
          <div className="field"><label>Доод хязгаар (нислэгээс өмнөх цаг)</label>
            <input type="number" min="0" value={s.manifest_window.min_hours_before}
              onChange={(e) => set('manifest_window', { min_hours_before: Number(e.target.value) })} /></div>
        </div>
      </Section>

      <Section title="Ачааны норм" desc="Үнэгүй ачааны хэмжээ ба илүү кг-ийн төлбөр" onSave={() => save('baggage')} busy={busy}>
        <div className="formgrid">
          <div className="field"><label>Үнэгүй норм (кг)</label>
            <input type="number" min="0" value={s.baggage.free_allowance_kg}
              onChange={(e) => set('baggage', { free_allowance_kg: Number(e.target.value) })} /></div>
          <div className="field"><label>Илүү кг-ийн төлбөр ({s.baggage.currency})</label>
            <input type="number" min="0" value={s.baggage.excess_fee_per_kg}
              onChange={(e) => set('baggage', { excess_fee_per_kg: Number(e.target.value) })} /></div>
        </div>
      </Section>

      <Section title="И-мэйл авто-импорт (IMAP)" desc="Manifest хүлээн авах томилогдсон шуудангийн хайрцаг — 2 минут тутам шалгана" onSave={() => save('imap')} busy={busy}>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12, fontWeight: 600 }}>
          <input type="checkbox" checked={s.imap.enabled} onChange={(e) => set('imap', { enabled: e.target.checked })} />
          Идэвхжүүлэх
        </label>
        <div className="formgrid">
          <div className="field"><label>IMAP хост</label>
            <input placeholder="imap.gmail.com" value={s.imap.host} onChange={(e) => set('imap', { host: e.target.value })} /></div>
          <div className="field"><label>Порт</label>
            <input type="number" value={s.imap.port} onChange={(e) => set('imap', { port: Number(e.target.value) })} /></div>
          <div className="field"><label>Хэрэглэгч (и-мэйл)</label>
            <input placeholder="manifest@voyage.mn" value={s.imap.user} onChange={(e) => set('imap', { user: e.target.value })} /></div>
          <div className="field"><label>Нууц үг / App password</label>
            <input type="password" value={s.imap.pass} onChange={(e) => set('imap', { pass: e.target.value })} /></div>
          <div className="field"><label>Фолдер</label>
            <input value={s.imap.folder} onChange={(e) => set('imap', { folder: e.target.value })} /></div>
          <div className="field"><label>Зөвшөөрөгдсөн илгээгчид (таслалаар)</label>
            <input placeholder="@ot.mn, travel@ot.mn" value={(s.imap.allowed_senders || []).join(', ')}
              onChange={(e) => set('imap', { allowed_senders: e.target.value.split(',').map((x) => x.trim()).filter(Boolean) })} />
            <span className="hint">Хоосон бол бүх илгээгчийг зөвшөөрнө (санал болгохгүй)</span></div>
        </div>
      </Section>

      <Section title="OTP / СМС (CallPro Text API)" desc="Зорчигчийн онлайн check-in-ий баталгаажуулалт — api-text.callpro.mn" onSave={async () => { await save('otp'); await save('sms_gateway'); }} busy={busy}>
        <div className="formgrid">
          <div className="field"><label>Горим</label>
            <select value={s.otp.mode} onChange={(e) => set('otp', { mode: e.target.value })}>
              <option value="dev">DEV — кодыг дэлгэцэнд харуулна (туршилт)</option>
              <option value="sms_gateway">CallPro — бодит СМС илгээнэ</option>
            </select></div>
          <div className="field"><label>Кодын хүчинтэй хугацаа (мин)</label>
            <input type="number" min="1" value={s.otp.ttl_minutes} onChange={(e) => set('otp', { ttl_minutes: Number(e.target.value) })} /></div>
          <div className="field"><label>Base URL</label>
            <input value={s.sms_gateway.base_url || 'https://api-text.callpro.mn/v1/sms'}
              onChange={(e) => set('sms_gateway', { base_url: e.target.value })} /></div>
          <div className="field"><label>API түлхүүр (x-api-key)</label>
            <input type="password" value={s.sms_gateway.api_key} onChange={(e) => set('sms_gateway', { api_key: e.target.value })} /></div>
          <div className="field"><label>Илгээгч дугаар (from)</label>
            <input placeholder="72xxxxxx" value={s.sms_gateway.from || ''} onChange={(e) => set('sms_gateway', { from: e.target.value })} />
            <span className="hint">CallPro-оос олгосон lime дугаар</span></div>
          <div className="field"><label>Brand ID (заавал биш)</label>
            <input value={s.sms_gateway.brand || ''} onChange={(e) => set('sms_gateway', { brand: e.target.value })} /></div>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input type="checkbox" checked={s.sms_gateway.enabled} onChange={(e) => set('sms_gateway', { enabled: e.target.checked })} />
            Gateway идэвхтэй
          </label>
        </div>
      </Section>

      <TwoFactorSection toast={toast} />

      <PrinterSection toast={toast} />

      <Section title="Онгоцны тохиргоо" desc="Суудлын зураглал ба автомат хуваарилалтын дараалал">
        <div className="tablewrap">
          <table className="tbl">
            <thead><tr><th>Код</th><th>Загвар</th><th>Суудал</th><th>Дараалал</th><th></th></tr></thead>
            <tbody>
              {aircraft.map((a) => (
                <tr key={a.id}>
                  <td><b>{a.code}</b></td>
                  <td>{a.model}</td>
                  <td className="num">{a.total_seats}</td>
                  <td style={{ fontSize: 11.5, color: 'var(--muted)', fontFamily: 'var(--mono)' }}>
                    {a.assignment_sequence.slice(0, 6).join(', ')}… ({a.assignment_sequence.length})
                  </td>
                  <td><button className="btn ghost sm" onClick={() => setViewAc(viewAc?.id === a.id ? null : a)}>
                    {viewAc?.id === a.id ? 'Хаах' : 'Зураглал'}</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {viewAc && (
          <div style={{ border: '1px solid var(--line)', borderRadius: 10, marginTop: 12, maxHeight: 420, overflow: 'auto' }}>
            <SeatMap seatMap={viewAc.seat_map} />
          </div>
        )}
        <p style={{ fontSize: 12, color: 'var(--faint)', marginTop: 10 }}>
          Автомат хуваарилалт: урдаас хойш дарааллаар, нөөц суудлыг хамгийн сүүлд. Дараалал дуусвал санамсаргүй сул суудал олгоно.
        </p>
      </Section>
    </>
  );
}
