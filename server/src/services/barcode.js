// IATA Resolution 740 baggage tag barcode — Interleaved 2 of 5 (ITF).
// Generates a standalone SVG so tags render identically on screen and on the
// Fujitsu thermal printer (vector output, no rasterisation artifacts).

const PATTERNS = {
  0: 'nnwwn', 1: 'wnnnw', 2: 'nwnnw', 3: 'wwnnn', 4: 'nnwnw',
  5: 'wnwnn', 6: 'nwwnn', 7: 'nnnww', 8: 'wnnwn', 9: 'nwnwn',
};

export function itf2of5Svg(digits, { height = 60, narrow = 2, wideRatio = 2.5, quiet = 20, label = true } = {}) {
  const value = String(digits).replace(/\D/g, '');
  if (value.length % 2 !== 0) throw new Error('ITF requires an even number of digits');
  const wide = narrow * wideRatio;
  const bars = []; // {x, w}
  let x = quiet;
  const push = (isBar, w) => {
    if (isBar) bars.push({ x, w });
    x += w;
  };
  // start: narrow bar, narrow space, narrow bar, narrow space
  push(true, narrow); push(false, narrow); push(true, narrow); push(false, narrow);
  for (let i = 0; i < value.length; i += 2) {
    const p1 = PATTERNS[value[i]];
    const p2 = PATTERNS[value[i + 1]];
    for (let j = 0; j < 5; j++) {
      push(true, p1[j] === 'w' ? wide : narrow);   // bars from first digit
      push(false, p2[j] === 'w' ? wide : narrow);  // spaces from second digit
    }
  }
  // stop: wide bar, narrow space, narrow bar
  push(true, wide); push(false, narrow); push(true, narrow);
  const width = x + quiet;
  const textH = label ? 14 : 0;
  const rects = bars
    .map((b) => `<rect x="${b.x.toFixed(2)}" y="0" width="${b.w.toFixed(2)}" height="${height}" fill="#000"/>`)
    .join('');
  const text = label
    ? `<text x="${width / 2}" y="${height + 12}" text-anchor="middle" font-family="monospace" font-size="12" fill="#000">${value}</text>`
    : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height + textH}" width="${width}" height="${height + textH}">${rects}${text}</svg>`;
}

// IATA 740 "license plate": leading digit 0 (interline tag) + 3-digit airline
// numeric code + 6-digit serial.
export function licensePlate(airlineNumericCode, serial) {
  const code = String(airlineNumericCode).replace(/\D/g, '').padStart(3, '0').slice(0, 3);
  const ser = String(serial).replace(/\D/g, '').padStart(6, '0').slice(-6);
  return `0${code}${ser}`;
}
