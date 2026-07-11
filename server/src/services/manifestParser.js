import ExcelJS from 'exceljs';

// Parser for the Oyu Tolgoi travel-desk manifest format, e.g.
// "OTUB_2240_JU_1199_TUE6_2026_03_03.xlsx":
//   header block  (Departure Date / Transport Number / Number Of Passengers /
//                  Wait List Passenger / Direction / ETD Of Transport / ...)
//   table         No | Passenger Name | Company | Department | Position |
//                 Cost Center | Signatures | C No | Pick-up Address
//                 [| Profile SAP | Profile Personal Mobile]

const UB_OFFSET = '+08:00'; // Asia/Ulaanbaatar (no DST)

function cellText(cell) {
  if (cell == null) return '';
  const v = cell.value ?? cell;
  if (v == null) return '';
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'object') {
    if (v.richText) return v.richText.map((t) => t.text).join('');
    if (v.text) return String(v.text);
    if (v.result != null) return String(v.result);
    return '';
  }
  return String(v).trim();
}

export function normalizeCharterCode(s) {
  return String(s || '').toUpperCase().replace(/[_\s-]+/g, ' ').replace(/JU (\d)/, 'JU-$1').trim();
}

function parseHeaderDate(raw) {
  // "03/03/2026" (DD/MM/YYYY) or a real Date cell
  if (raw instanceof Date) return raw.toISOString().slice(0, 10);
  const m = String(raw).match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  const iso = String(raw).match(/(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return iso[0];
  return null;
}

function parseEtd(raw) {
  const s = String(raw ?? '').replace(/\D/g, '');
  if (!s) return null;
  return s.padStart(4, '0').slice(-4);
}

export function parseName(raw) {
  const s = String(raw || '').trim();
  const m = s.match(/^(Mr|Ms|Mrs|Dr|Miss)\.?\s+(.*)$/i);
  if (m) {
    const title = m[1][0].toUpperCase() + m[1].slice(1).toLowerCase() + '.';
    return { title, fullName: m[2].trim() };
  }
  return { title: null, fullName: s };
}

export async function parseManifestXlsx(buffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const ws = wb.worksheets[0];
  if (!ws) throw new Error('Excel файлд ажлын хуудас олдсонгүй (no worksheet found)');

  const header = {};
  let tableHeaderRow = null;
  const colIndex = {};

  ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (tableHeaderRow) return;
    const values = [];
    row.eachCell({ includeEmpty: true }, (cell, col) => {
      values[col] = cellText(cell);
    });
    const joined = values.filter(Boolean).map((v) => v.toLowerCase());

    // header block: label in one cell, value in the next non-empty cell
    for (let c = 1; c < values.length; c++) {
      const label = (values[c] || '').toLowerCase().replace(/[:\s]+$/, '');
      const value = values[c + 1] ?? values[c + 2];
      if (!label) continue;
      if (label.startsWith('departure date')) header.departureDate = parseHeaderDate(row.getCell(c + 1).value ?? value);
      else if (label.startsWith('transport number')) header.transportNumber = normalizeCharterCode(value);
      else if (label.startsWith('number of passengers')) header.passengerCount = parseInt(value, 10) || 0;
      else if (label.startsWith('wait list')) header.waitlistCount = parseInt(value, 10) || 0;
      else if (label === 'direction') header.direction = String(value || '').toUpperCase().trim();
      else if (label.startsWith('etd')) header.etd = parseEtd(row.getCell(c + 1).value ?? value);
    }

    // detect the passenger table header row
    if (joined.includes('no') && joined.some((v) => v.includes('passenger name'))) {
      tableHeaderRow = rowNumber;
      row.eachCell({ includeEmpty: true }, (cell, col) => {
        const t = cellText(cell).toLowerCase();
        if (t === 'no') colIndex.no = col;
        else if (t.includes('passenger name')) colIndex.name = col;
        else if (t === 'company') colIndex.company = col;
        else if (t === 'department') colIndex.department = col;
        else if (t === 'position') colIndex.position = col;
        else if (t.includes('cost center')) colIndex.costCenter = col;
        else if (t.includes('pick-up') || t.includes('pickup')) colIndex.pickup = col;
        else if (t.includes('sap')) colIndex.sap = col;
        else if (t.includes('mobile') || t.includes('phone')) colIndex.mobile = col;
      });
    }
  });

  if (!tableHeaderRow) {
    throw new Error('Зорчигчийн хүснэгтийн толгой мөр олдсонгүй (passenger table header not found)');
  }
  if (!colIndex.name) throw new Error('"Passenger Name" багана олдсонгүй');

  const passengers = [];
  for (let r = tableHeaderRow + 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const rawName = cellText(row.getCell(colIndex.name));
    if (!rawName) continue;
    const seqText = colIndex.no ? cellText(row.getCell(colIndex.no)) : '';
    const seq = parseInt(seqText, 10);
    if (!Number.isFinite(seq)) continue; // skip footer/disclaimer rows
    const { title, fullName } = parseName(rawName);
    passengers.push({
      seq,
      title,
      fullName,
      company: colIndex.company ? cellText(row.getCell(colIndex.company)) || null : null,
      department: colIndex.department ? cellText(row.getCell(colIndex.department)) || null : null,
      position: colIndex.position ? cellText(row.getCell(colIndex.position)) || null : null,
      costCenter: colIndex.costCenter ? cellText(row.getCell(colIndex.costCenter)) || null : null,
      pickupAddress: colIndex.pickup ? cellText(row.getCell(colIndex.pickup)) || null : null,
      employeeId: colIndex.sap ? cellText(row.getCell(colIndex.sap)) || null : null,
      phone: colIndex.mobile ? cellText(row.getCell(colIndex.mobile)).replace(/\s/g, '') || null : null,
      waitlisted: header.passengerCount ? seq > header.passengerCount : false,
    });
  }

  if (passengers.length === 0) throw new Error('Manifest-д зорчигч олдсонгүй (no passengers found)');

  // local UB time of scheduled departure per the manifest header
  header.departureIso =
    header.departureDate && header.etd
      ? `${header.departureDate}T${header.etd.slice(0, 2)}:${header.etd.slice(2)}:00${UB_OFFSET}`
      : null;

  return { header, passengers };
}
