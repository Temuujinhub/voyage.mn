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
