import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';

const STATUS_MN = {
  PENDING: 'Хүлээгдэж буй',
  CHECKED_IN: 'Бүртгүүлсэн',
  SECURITY_PASSED: 'Шалгалт өнгөрсөн',
  BOARDED: 'Онгоцонд суусан',
  OFFLOADED: 'Offload',
};

function fmtUb(ts) {
  if (!ts) return '';
  return new Date(ts).toLocaleString('en-GB', {
    timeZone: 'Asia/Ulaanbaatar',
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

export async function flightManifestXlsx(flight, passengers) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Voyage E-Boarding';
  const ws = wb.addWorksheet('Manifest');
  ws.addRow([`${flight.flight_number}  ${flight.origin_code} → ${flight.dest_code}`]);
  ws.addRow(['Charter / Transport', flight.charter_code || '-']);
  ws.addRow(['Departure (UB time)', fmtUb(flight.departure_ts)]);
  ws.addRow(['Status', flight.status]);
  ws.addRow([]);
  const header = ws.addRow(['No', 'PNR', 'Passenger Name', 'Company', 'Employee ID', 'Seat', 'Status', 'Checked-in at', 'Bags', 'Bag kg']);
  header.font = { bold: true };
  header.eachCell((c) => {
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF12395B' } };
    c.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  });
  passengers.forEach((p, i) => {
    ws.addRow([
      i + 1, p.pnr, `${p.title ? p.title + ' ' : ''}${p.full_name}`, p.company || '', p.employee_id || '',
      p.seat || '', p.status, p.checkin_ts ? fmtUb(p.checkin_ts) : '', Number(p.bag_count) || 0, Number(p.bag_weight) || 0,
    ]);
  });
  ws.columns.forEach((col) => { col.width = 18; });
  ws.getColumn(3).width = 32;
  ws.getRow(1).font = { bold: true, size: 14 };
  return wb.xlsx.writeBuffer();
}

export function flightManifestPdf(flight, passengers, res) {
  const doc = new PDFDocument({ size: 'A4', margin: 40, bufferPages: true });
  doc.pipe(res);
  doc.fontSize(16).font('Helvetica-Bold').text(`AERO MONGOLIA — Passenger Manifest`);
  doc.moveDown(0.3);
  doc.fontSize(11).font('Helvetica')
    .text(`Flight: ${flight.flight_number}   Route: ${flight.origin_code} → ${flight.dest_code}   Charter: ${flight.charter_code || '-'}`)
    .text(`Departure (UB): ${fmtUb(flight.departure_ts)}   Status: ${flight.status}   Gate: ${flight.gate || '-'}`);
  doc.moveDown(0.8);

  const cols = [
    { key: 'no', label: '#', w: 24 },
    { key: 'pnr', label: 'PNR', w: 52 },
    { key: 'name', label: 'Passenger', w: 170 },
    { key: 'emp', label: 'Emp ID', w: 60 },
    { key: 'seat', label: 'Seat', w: 38 },
    { key: 'status', label: 'Status', w: 90 },
    { key: 'bags', label: 'Bags/kg', w: 60 },
  ];
  const x0 = doc.page.margins.left;
  let y = doc.y;
  const drawHeader = () => {
    doc.rect(x0, y - 2, cols.reduce((s, c) => s + c.w, 0), 16).fill('#12395B');
    let x = x0 + 3;
    doc.fillColor('#fff').fontSize(8.5).font('Helvetica-Bold');
    for (const c of cols) { doc.text(c.label, x, y + 1, { width: c.w - 6 }); x += c.w; }
    doc.fillColor('#000').font('Helvetica');
    y += 17;
  };
  drawHeader();
  passengers.forEach((p, i) => {
    if (y > doc.page.height - 60) { doc.addPage(); y = doc.page.margins.top; drawHeader(); }
    if (i % 2 === 0) doc.rect(x0, y - 2, cols.reduce((s, c) => s + c.w, 0), 14).fill('#F2F6FA').fillColor('#000');
    const cells = {
      no: String(i + 1), pnr: p.pnr, name: `${p.title ? p.title + ' ' : ''}${p.full_name}`,
      emp: p.employee_id || '-', seat: p.seat || '—', status: p.status,
      bags: `${Number(p.bag_count) || 0} / ${Number(p.bag_weight) || 0}kg`,
    };
    let x = x0 + 3;
    doc.fontSize(8.5);
    for (const c of cols) { doc.text(cells[c.key], x, y, { width: c.w - 6, lineBreak: false }); x += c.w; }
    y += 14;
  });

  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    doc.fontSize(7.5).fillColor('#666').text(
      `Voyage E-Boarding — generated ${fmtUb(new Date())} (UB) — page ${i + 1}/${range.count}`,
      x0, doc.page.height - 36, { lineBreak: false }
    );
  }
  doc.end();
}

export async function opsReportXlsx(rows) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Flights');
  const header = ws.addRow(['Flight', 'Charter', 'Route', 'Departure (UB)', 'Status', 'Delay min', 'Seats', 'Manifest', 'Checked-in', 'Boarded', 'Bags', 'Bag kg', 'Load %']);
  header.eachCell((c) => {
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF12395B' } };
    c.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  });
  for (const r of rows) {
    ws.addRow([
      r.flight_number, r.charter_code || '', `${r.origin_code}→${r.dest_code}`, fmtUb(r.departure_ts),
      r.status, r.delay_minutes, r.total_seats, Number(r.pax_total), Number(r.pax_checked), Number(r.pax_boarded),
      Number(r.bag_count), Number(r.bag_weight),
      r.total_seats ? Math.round((Number(r.pax_total) / r.total_seats) * 100) : 0,
    ]);
  }
  ws.columns.forEach((col) => { col.width = 16; });
  return wb.xlsx.writeBuffer();
}

export { STATUS_MN, fmtUb };
