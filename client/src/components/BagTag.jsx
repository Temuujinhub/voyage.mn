import React from 'react';
import { fmtDate, fmtTime } from '../format.js';

// IATA Res.740 baggage tag laid out for the 470×51mm thermal stock
// (matches the physical Fujitsu tag roll): adhesive tail, vertical (ladder)
// barcode, main panel with destination code, airline band, horizontal
// (picket-fence) barcode, and a claim stub with a third barcode.
export default function BagTag({ tag, airline }) {
  const svg = { __html: tag.barcodeSvg };
  const name = `${(tag.title || '')} ${tag.full_name}`.trim().toUpperCase();
  return (
    <div className="tag">
      <div className="sec adhesive"><div className="lbl">PULL — ADHESIVE</div></div>

      <div className="sec barcode-v" dangerouslySetInnerHTML={svg} />

      <div className="sec main" style={{ flex: 1 }}>
        <div>
          <div className="dest-code">{tag.dest_code}</div>
          <div className="dest-name">{tag.dest_name || tag.dest_code}</div>
        </div>
        <div className="meta">
          <div><label>FLIGHT / НИСЛЭГ</label><b>{tag.flight_number}</b></div>
          <div><label>DATE / ОГНОО</label><b>{fmtDate(tag.departure_ts).toUpperCase()}</b></div>
          <div><label>NAME / НЭР</label><b style={{ fontSize: 10.5 }}>{name}</b></div>
          <div><label>ETD</label><b>{fmtTime(tag.departure_ts)}</b></div>
          <div><label>SEAT / PNR</label><b>{tag.seat || '—'} / {tag.pnr}</b></div>
          <div><label>WEIGHT / ЖИН</label><b>{Number(tag.weight_kg)} KG</b></div>
        </div>
      </div>

      <div className="airline-band">{airline?.logo_text || 'AERO MONGOLIA'} · VOYAGE</div>

      <div className="sec barcode-h">
        <div dangerouslySetInnerHTML={svg} />
        <div className="tagnum">{tag.tag_number}</div>
      </div>

      <div className="sec stub" style={{ borderRight: 'none' }}>
        <div className="t">BAGGAGE CLAIM / АЧАА ОЛГОХ ТАСАЛБАР</div>
        <div dangerouslySetInnerHTML={svg} />
        <div className="nm">{name}</div>
        <div className="t" style={{ marginTop: '1mm' }}>{tag.flight_number} · {tag.origin_code}→{tag.dest_code} · {Number(tag.weight_kg)}KG</div>
      </div>
    </div>
  );
}
