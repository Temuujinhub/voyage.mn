// Catalog of printers the airport counters can install. "Installing" copies
// the model's default config into the printers table where it can be tuned
// (darkness, speed, station binding) without touching the catalog.
//
// media is the CSS @page size the print portal uses — the OS driver maps it
// to the physical stock, so it must match the loaded roll exactly.
export const PRINTER_CATALOG = [
  {
    model_key: 'fujitsu-f9870',
    vendor: 'Fujitsu',
    model: 'F9870 ATB/BTP',
    kind: 'both',
    description: 'Fujitsu нисэх буудлын ATB2/BTP хэвлэгч — boarding pass + бирк (одоо ашиглаж буй загвар)',
    driver_url: 'https://www.fujitsu.com/global/support/products/computing/peripheral/printers/',
    config: { media: '470mm 51mm', boarding_media: '189mm 85mm', dpi: 203, darkness: 8, speed: 6, cutter: true },
  },
  {
    model_key: 'fujitsu-f9840',
    vendor: 'Fujitsu',
    model: 'F9840 BTP',
    kind: 'bagtag',
    description: 'Fujitsu биркний зориулалтын хэвлэгч (өмнөх үеийн загвар)',
    driver_url: 'https://www.fujitsu.com/global/support/products/computing/peripheral/printers/',
    config: { media: '470mm 51mm', dpi: 203, darkness: 7, speed: 5, cutter: true },
  },
  {
    model_key: 'zebra-zd621',
    vendor: 'Zebra',
    model: 'ZD621 (203dpi)',
    kind: 'bagtag',
    description: 'Zebra десктоп термо хэвлэгч — 470×51мм биркний roll-той ажиллана',
    driver_url: 'https://www.zebra.com/us/en/support-downloads/printers/desktop/zd621.html',
    config: { media: '470mm 51mm', dpi: 203, darkness: 10, speed: 4, cutter: false },
  },
  {
    model_key: 'ier-512c',
    vendor: 'IER',
    model: '512C BTP',
    kind: 'bagtag',
    description: 'IER нисэх буудлын биркний хэвлэгч (олон улсын буудлуудад түгээмэл)',
    driver_url: 'https://www.ier.com/en/products/airport-printers/',
    config: { media: '470mm 51mm', dpi: 300, darkness: 8, speed: 6, cutter: true },
  },
  {
    model_key: 'custom-tk306',
    vendor: 'Custom',
    model: 'TK306 BTP',
    kind: 'both',
    description: 'Custom S.p.A. boarding pass / бирк хэвлэгч',
    driver_url: 'https://www.custom.biz/en/products/aviation',
    config: { media: '470mm 51mm', boarding_media: '189mm 85mm', dpi: 203, darkness: 8, speed: 5, cutter: true },
  },
  {
    model_key: 'generic-a4',
    vendor: 'Generic',
    model: 'Оффис A4 хэвлэгч',
    kind: 'boarding',
    description: 'Түр хэрэглээ — boarding pass-ийг энгийн A4 хэвлэгчээр хэвлэх',
    driver_url: '',
    config: { media: 'A4', boarding_media: 'A4', dpi: 300, cutter: false },
  },
];

export function catalogEntry(modelKey) {
  return PRINTER_CATALOG.find((p) => p.model_key === modelKey) || null;
}
