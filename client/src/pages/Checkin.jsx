import React, { useContext, useEffect, useMemo, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { api } from '../api.js';
import { AuthCtx } from '../App.jsx';
import { Icons, Modal, PaxBadge, FlightBadge, Spinner, useToast, Avatar } from '../ui.jsx';
import SeatMap from '../components/SeatMap.jsx';
import BoardingPass from '../components/BoardingPass.jsx';
import BagTag from '../components/BagTag.jsx';
import PrintPortal from '../components/PrintPortal.jsx';
import { fmtDateTime, fmtTime } from '../format.js';

export default function Checkin() {
  const toast = useToast();
  const user = useContext(AuthCtx);
  const [params, setParams] = useSearchParams();
  const [flights, setFlights] = useState([]);
  const [flightId, setFlightId] = useState('');
  const [pax, setPax] = useState([]);
  const [query, setQuery] = useState(params.get('q') || '');
  const [selected, setSelected] = useState(null); // passenger being processed
  const [busy, setBusy] = useState(false);

  // check-in form state
  const [bags, setBags] = useState([]);
  const [seatPick, setSeatPick] = useState(null);
  const [seatmap, setSeatmap] = useState(null);
  const [showSeats, setShowSeats] = useState(false);
  const [settings, setSettings] = useState(null);

  // print state
  const [passData, setPassData] = useState(null);   // boarding pass json
  const [printPass, setPrintPass] = useState(false);
  const [tagData, setTagData] = useState(null);     // baggage tags
  const [printTags, setPrintTags] = useState(false);

  useEffect(() => {
    api.get('/api/flights').then((d) => {
      // the agent's station (set at login) picks their airport's flights first
      const atStation = (list) =>
        user?.station ? list.filter((f) => f.origin_code === user.station) : list;
      let active = d.flights.filter((f) => ['CHECKIN_OPEN', 'BOARDING'].includes(f.status));
      if (atStation(active).length) active = atStation(active);
      setFlights(active.length ? active : d.flights.slice(0, 10));
      if (active[0] && !params.get('pax') && !params.get('q')) setFlightId(active[0].id);
    });
  }, []);

  useEffect(() => {
    if (!flightId) return;
    api.get(`/api/flights/${flightId}/passengers`).then((d) => setPax(d.passengers));
    api.get(`/api/flights/${flightId}/seatmap`).then(setSeatmap);
  }, [flightId]);

  // deep-link ?pax=<id> from the flight page
  useEffect(() => {
    const paxId = params.get('pax');
    if (!paxId) return;
    api.get(`/api/passengers/${paxId}`).then((d) => {
      setFlightId(d.passenger.flight_id);
      if (d.passenger.status === 'PENDING' || d.passenger.status === 'OFFLOADED') openPax(d.passenger);
      else openPass(d.passenger);
      setParams({}, { replace: true });
    }).catch(() => {});
  }, []);

  // search across flights
  const [searchResults, setSearchResults] = useState(null);
  useEffect(() => {
    const t = setTimeout(() => {
      if (query.trim().length >= 2) {
        api.get(`/api/passengers/search?qtext=${encodeURIComponent(query.trim())}`)
          .then((d) => setSearchResults(d.passengers));
      } else setSearchResults(null);
    }, 250);
    return () => clearTimeout(t);
  }, [query]);

  const list = searchResults ?? pax;
  const flight = flights.find((f) => f.id === flightId);

  const openPax = async (p) => {
    setSelected(p);
    setBags([]);
    setSeatPick(null);
    setShowSeats(false);
    if (p.flight_id && p.flight_id !== flightId) {
      setFlightId(p.flight_id);
    }
    if (!settings) {
      // allowance shown next to bag rows
      api.get('/api/reports/overview').catch(() => {});
    }
  };

  const doCheckin = async () => {
    setBusy(true);
    try {
      const result = await api.post(`/api/passengers/${selected.id}/checkin`, {
        seat: seatPick,
        baggage: bags.filter((b) => Number(b) > 0).map((w) => ({ weight_kg: Number(w) })),
      });
      toast(`${result.passenger.full_name} — суудал ${result.passenger.seat}`, 'success');
      // refresh + fetch printables
      const bp = await api.get(`/api/passengers/${selected.id}/boarding-pass`);
      setPassData(bp);
      if (result.baggage?.length) {
        const t = await api.get(`/api/passengers/${selected.id}/baggage-tags`);
        setTagData(t.tags);
      } else setTagData(null);
      setSelected(null);
      api.get(`/api/flights/${flightId}/passengers`).then((d) => setPax(d.passengers));
      api.get(`/api/flights/${flightId}/seatmap`).then(setSeatmap);
      if (searchResults) setQuery('');
    } catch (ex) {
      toast(ex.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const openPass = async (p) => {
    try {
      const bp = await api.get(`/api/passengers/${p.id}/boarding-pass`);
      setPassData(bp);
      const t = await api.get(`/api/passengers/${p.id}/baggage-tags`);
      setTagData(t.tags.length ? t.tags : null);
    } catch (ex) { toast(ex.message, 'error'); }
  };

  const offload = async (p) => {
    if (!window.confirm(`${p.full_name}-г offload хийх үү? Суудал, ачааны бүртгэл цуцлагдана.`)) return;
    try {
      await api.post(`/api/passengers/${p.id}/offload`);
      toast('Offload хийгдлээ', 'success');
      api.get(`/api/flights/${flightId}/passengers`).then((d) => setPax(d.passengers));
    } catch (ex) { toast(ex.message, 'error'); }
  };

  const addBagToCheckedIn = async (p) => {
    const w = window.prompt('Ачааны жин (кг):');
    if (!w) return;
    try {
      await api.post(`/api/passengers/${p.id}/baggage`, { weight_kg: Number(w) });
      const t = await api.get(`/api/passengers/${p.id}/baggage-tags`);
      setTagData(t.tags);
      const bp = await api.get(`/api/passengers/${p.id}/boarding-pass`);
      setPassData(bp);
      toast('Ачаа бүртгэгдлээ — бирк хэвлэхэд бэлэн', 'success');
      api.get(`/api/flights/${flightId}/passengers`).then((d) => setPax(d.passengers));
    } catch (ex) { toast(ex.message, 'error'); }
  };

  return (
    <>
      <div className="page-head">
        <h1>Check-in бүртгэл</h1>
        <div className="spacer" />
        <select className="btn secondary" value={flightId} onChange={(e) => { setFlightId(e.target.value); setQuery(''); }}>
          <option value="">Нислэг сонгох…</option>
          {flights.map((f) => (
            <option key={f.id} value={f.id}>
              {f.flight_number} · {f.origin_code}→{f.dest_code} · {fmtTime(f.departure_ts)} ({f.status})
            </option>
          ))}
        </select>
      </div>

      {flight && !['CHECKIN_OPEN', 'BOARDING'].includes(flight.status) && (
        <div className="alert warn" style={{ marginBottom: 14 }}>
          <Icons.alert size={16} />Энэ нислэгийн check-in нээгдээгүй байна ({flight.status}). Нислэгийн хуудаснаас Check-in нээнэ үү.
        </div>
      )}

      <div className="card card-pad" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <Icons.search size={17} style={{ color: 'var(--faint)' }} />
          <input
            style={{ flex: 1, border: 'none', outline: 'none', fontSize: 15 }}
            placeholder="Зорчигч хайх — нэр, SAP ID, PNR, утасны дугаар (бүх нислэгээс)…"
            value={query} onChange={(e) => setQuery(e.target.value)} autoFocus
          />
          {query && <button className="btn ghost sm" onClick={() => setQuery('')}><Icons.x size={14} /></button>}
        </div>
      </div>

      <div className="card">
        <div className="tablewrap">
          <table className="tbl">
            <thead><tr>
              <th>Зорчигч</th><th>SAP ID</th>{searchResults && <th>Нислэг</th>}<th>Суудал</th><th>Ачаа</th><th>Төлөв</th><th style={{ width: 220 }}>Үйлдэл</th>
            </tr></thead>
            <tbody>
              {list.length === 0 && <tr><td colSpan={7}><div className="empty">{query ? 'Илэрц олдсонгүй' : 'Нислэг сонгоно уу эсвэл хайлт хийнэ үү'}</div></td></tr>}
              {list.map((p) => (
                <tr key={p.id}>
                  <td>
                    <div className="pax-cell">
                      <Avatar name={p.full_name} />
                      <div>
                        <div style={{ fontWeight: 600 }}>{p.title} {p.full_name}{p.waitlisted && <span className="badge amber" style={{ marginLeft: 6 }}>WL</span>}</div>
                        <div className="sub">PNR {p.pnr}{p.baggage_pending && <b style={{ color: 'var(--amber)' }}> · ачаа хүлээгдэж буй</b>}</div>
                      </div>
                    </div>
                  </td>
                  <td className="num">{p.employee_id || '—'}</td>
                  {searchResults && <td style={{ fontSize: 12.5 }}>{p.flight_number}<div className="sub" style={{ color: 'var(--faint)', fontSize: 11 }}>{fmtDateTime(p.departure_ts)}</div></td>}
                  <td><b style={{ fontFamily: 'var(--mono)' }}>{p.seat || '—'}</b></td>
                  <td className="num">{Number(p.bag_count) > 0 ? `${p.bag_count}ш` : '—'}</td>
                  <td><PaxBadge status={p.status} /></td>
                  <td>
                    {p.status === 'PENDING' || p.status === 'OFFLOADED' ? (
                      <button className="btn sm" onClick={() => openPax(p)}><Icons.check size={14} />Check-in</button>
                    ) : (
                      <span style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap' }}>
                        <button className="btn secondary sm" onClick={() => openPass(p)}><Icons.qr size={14} />Pass</button>
                        {p.baggage_pending && <button className="btn sm" onClick={() => addBagToCheckedIn(p)}><Icons.bag size={14} />Ачаа</button>}
                        {p.status !== 'BOARDED' && <button className="btn ghost sm" style={{ color: 'var(--red)' }} onClick={() => offload(p)}>Offload</button>}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Check-in modal ── */}
      {selected && (
        <Modal title={`Check-in — ${selected.title || ''} ${selected.full_name}`} onClose={() => setSelected(null)} wide={showSeats}>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
            <span className="badge navy">PNR {selected.pnr}</span>
            {selected.employee_id && <span className="badge gray">SAP {selected.employee_id}</span>}
            {selected.company && <span className="badge gray">{selected.company}</span>}
            {selected.waitlisted && <span className="badge amber">WAIT LIST</span>}
          </div>

          <div className="field">
            <label>Суудал</label>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <div style={{ fontFamily: 'var(--mono)', fontWeight: 800, fontSize: 20, color: 'var(--navy)', minWidth: 60 }}>
                {seatPick || 'АВТО'}
              </div>
              <button type="button" className="btn secondary sm" onClick={() => setShowSeats(!showSeats)}>
                <Icons.seat size={14} />{showSeats ? 'Хаах' : 'Суудал сонгох'}
              </button>
              {seatPick && <button type="button" className="btn ghost sm" onClick={() => setSeatPick(null)}>Авто болгох</button>}
            </div>
            <span className="hint">Хоосон орхивол дарааллын дагуу автоматаар олгоно</span>
          </div>

          {showSeats && seatmap && (
            <div style={{ border: '1px solid var(--line)', borderRadius: 10, marginBottom: 12, maxHeight: 380, overflow: 'auto' }}>
              <SeatMap seatMap={seatmap.seat_map} occupied={seatmap.occupied} selected={seatPick} onPick={setSeatPick} />
            </div>
          )}

          <div className="field">
            <label>Ачаа (кг) — бирк автоматаар хэвлэгдэнэ</label>
            {bags.map((w, i) => (
              <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
                <input type="number" min="0.5" max="200" step="0.5" value={w} placeholder="жин, кг"
                  onChange={(e) => setBags(bags.map((x, j) => (j === i ? e.target.value : x)))} autoFocus />
                <button type="button" className="btn ghost sm" onClick={() => setBags(bags.filter((_, j) => j !== i))}><Icons.x size={14} /></button>
              </div>
            ))}
            <button type="button" className="btn secondary sm" onClick={() => setBags([...bags, ''])}>
              <Icons.bag size={14} />Ачаа нэмэх
            </button>
            <span className="hint">Ачаагүй бол шууд баталгаажуулна — зорчигч e-boarding pass авна</span>
          </div>

          <div className="modal-actions">
            <button className="btn secondary" onClick={() => setSelected(null)}>Болих</button>
            <button className="btn green lg" disabled={busy} onClick={doCheckin}>
              {busy ? 'Бүртгэж байна…' : 'Check-in баталгаажуулах'}
            </button>
          </div>
        </Modal>
      )}

      {/* ── Boarding pass modal ── */}
      {passData && (
        <Modal title="E-Boarding Pass" onClose={() => { setPassData(null); setTagData(null); }} wide>
          <div style={{ overflowX: 'auto', paddingBottom: 6 }}>
            <BoardingPass passenger={passData.passenger} airline={passData.airline} qrDataUrl={passData.qrDataUrl} />
          </div>
          {tagData && (
            <div className="alert info" style={{ margin: '12px 0' }}>
              <Icons.bag size={16} />{tagData.length} ширхэг ачааны бирк бэлэн — Fujitsu принтер рүү хэвлэнэ үү.
            </div>
          )}
          <div className="modal-actions" style={{ justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', gap: 8 }}>
              {tagData && (
                <button className="btn" onClick={() => setPrintTags(true)}>
                  <Icons.printer size={15} />Бирк хэвлэх ({tagData.length})
                </button>
              )}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn secondary" onClick={() => { setPassData(null); setTagData(null); }}>Хaах</button>
              <button className="btn" onClick={() => setPrintPass(true)}>
                <Icons.printer size={15} />Boarding pass хэвлэх
              </button>
            </div>
          </div>
        </Modal>
      )}

      {printPass && passData && (
        <PrintPortal pageSize="189mm 85mm" onDone={() => setPrintPass(false)}>
          <BoardingPass passenger={passData.passenger} airline={passData.airline} qrDataUrl={passData.qrDataUrl} />
        </PrintPortal>
      )}
      {printTags && tagData && (
        <PrintPortal pageSize="470mm 51mm" onDone={async () => {
          setPrintTags(false);
          for (const t of tagData) await api.post(`/api/passengers/baggage/${t.id}/printed`).catch(() => {});
        }}>
          {tagData.map((t) => <BagTag key={t.id} tag={t} airline={passData?.airline} />)}
        </PrintPortal>
      )}
    </>
  );
}
