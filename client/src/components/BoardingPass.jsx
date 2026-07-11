import React from 'react';
import { LogoMark } from './Logo.jsx';
import { fmtTime, fmtDate, addMinutes } from '../format.js';

// Realistic ATB-style boarding pass (~187×83mm, IATA ATB2 proportion).
// Renders identically on screen and in print; the QR carries the signed BCBP.
export default function BoardingPass({ passenger: p, airline, qrDataUrl, compact = false }) {
  const dep = addMinutes(p.departure_ts, p.delay_minutes || 0);
  const boardingTime = new Date(dep.getTime() - 30 * 60000);
  const name = `${(p.title || '').toUpperCase()} ${p.full_name.toUpperCase()}`;
  const flightDate = fmtDate(p.departure_ts).toUpperCase();

  return (
    <div className={`bp ${compact ? 'bp-compact' : ''}`}>
      {/* header band */}
      <div className="bp-head">
        <div className="bp-logo">
          <LogoMark size={30} text={false} />
          <b>{airline?.logo_text || 'AERO MONGOLIA'}</b>
        </div>
        <div className="bp-head-title">
          <span>BOARDING PASS</span>
          <small>СУУХ ТАЛОН</small>
        </div>
      </div>

      <div className="bp-body">
        {/* main coupon */}
        <div className="bp-main">
          <div className="bp-route">
            <div className="bp-airport">
              <div className="code">{p.origin_code}</div>
              <div className="city">{p.origin_name}</div>
            </div>
            <div className="bp-route-mid">
              <div className="bp-flightno">{p.flight_number}</div>
              <svg width="70" height="16" viewBox="0 0 70 16">
                <line x1="0" y1="8" x2="26" y2="8" stroke="#9fb4c6" strokeWidth="1.4" strokeDasharray="3 3"/>
                <path d="M30 13 33 8.5 39 4c1-.7 1.9-.8 2.3-.3.3.5 0 1.3-1 2L36 9.5 34.5 14z" fill="#1b84c4"/>
                <line x1="44" y1="8" x2="70" y2="8" stroke="#9fb4c6" strokeWidth="1.4" strokeDasharray="3 3"/>
              </svg>
              <div className="bp-date">{flightDate}</div>
            </div>
            <div className="bp-airport right">
              <div className="code">{p.dest_code}</div>
              <div className="city">{p.dest_name}</div>
            </div>
          </div>

          <div className="bp-row">
            <div className="bp-field grow">
              <label>PASSENGER / ЗОРЧИГЧ</label>
              <div className="val mono">{name}</div>
            </div>
            <div className="bp-field">
              <label>PNR</label>
              <div className="val mono">{p.pnr}</div>
            </div>
            {p.employee_id && (
              <div className="bp-field">
                <label>EMP ID</label>
                <div className="val mono">{p.employee_id}</div>
              </div>
            )}
          </div>

          <div className="bp-row bp-datarow">
            <div className="bp-field"><label>НИСЛЭГ</label><div className="val mono">{p.flight_number}</div></div>
            <div className="bp-field"><label>ОГНОО</label><div className="val mono">{flightDate.replace(/ 20(\d\d)$/, ' $1')}</div></div>
            <div className="bp-field"><label>СУУЛТ·BRD</label><div className="val mono">{fmtTime(boardingTime)}</div></div>
            <div className="bp-field"><label>ХӨӨРӨХ·DEP</label><div className="val mono">{fmtTime(dep)}{p.delay_minutes > 0 ? '*' : ''}</div></div>
            <div className="bp-field"><label>GATE</label><div className="val mono big">{p.gate || '—'}</div></div>
            <div className="bp-field seat"><label>СУУДАЛ</label><div className="val mono seat-val">{p.seat}</div></div>
          </div>

          <div className="bp-foot">
            <div className="bp-qr">
              {qrDataUrl && <img src={qrDataUrl} alt="BCBP QR" />}
            </div>
            <div className="bp-fine">
              <div className="bp-seqline">
                <span>SEQ {String(p.checkin_seq || 0).padStart(3, '0')}</span>
                <span>ETKT</span>
                <span>{p.aircraft_model || ''}</span>
              </div>
              {p.delay_minutes > 0 && (
                <div className="bp-delay">* Нислэг {p.delay_minutes} мин хойшилсон — шинэ цаг {fmtTime(dep)}</div>
              )}
              <p>
                Онгоцны хаалга хөөрөхөөс 15 минутын өмнө хаагдана. Gate closes 15 minutes before departure.
                Суудалдаа суухдаа энэ QR кодыг уншуулна уу.
              </p>
            </div>
          </div>
        </div>

        {/* perforation */}
        <div className="bp-perf" aria-hidden="true">
          <span className="notch top" /><span className="notch bottom" />
        </div>

        {/* stub */}
        <div className="bp-stub">
          <div className="bp-stub-head">СУУХ ТАЛОН · STUB</div>
          <div className="bp-field"><label>PASSENGER</label><div className="val mono sm">{name}</div></div>
          <div className="bp-stub-grid">
            <div className="bp-field"><label>FLIGHT</label><div className="val mono">{p.flight_number}</div></div>
            <div className="bp-field"><label>DATE</label><div className="val mono sm">{flightDate}</div></div>
            <div className="bp-field"><label>FROM/TO</label><div className="val mono">{p.origin_code}–{p.dest_code}</div></div>
            <div className="bp-field"><label>GATE</label><div className="val mono">{p.gate || '—'}</div></div>
            <div className="bp-field"><label>SEAT</label><div className="val mono seat-val" style={{ fontSize: 17 }}>{p.seat}</div></div>
            <div className="bp-field"><label>SEQ</label><div className="val mono">{String(p.checkin_seq || 0).padStart(3, '0')}</div></div>
          </div>
          <div className="bp-stub-qr">{qrDataUrl && <img src={qrDataUrl} alt="" />}</div>
          <div className="bp-stub-pnr mono">PNR {p.pnr}</div>
        </div>
      </div>
    </div>
  );
}
