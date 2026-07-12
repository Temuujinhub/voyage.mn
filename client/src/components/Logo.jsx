import React from 'react';

// The brand mark is served from /logo.svg (client/public/logo.svg) so the
// OFFICIAL Aero Mongolia artwork can be dropped in without touching code —
// replace that one file and it updates the sidebar, login, self check-in,
// boarding pass and favicon everywhere. Provide an <img> with a fixed square
// box; the file itself is the roundel.
export function LogoMark({ size = 40, text = true }) {
  return (
    <img
      src="/logo.svg"
      width={size}
      height={size}
      alt="Aero Mongolia"
      style={{ display: 'block', objectFit: 'contain', flex: `0 0 ${size}px` }}
    />
  );
}

export function BrandBlock({ dark = false }) {
  return (
    <div className="brand">
      <LogoMark size={42} />
      <div>
        <div className="brand-name" style={dark ? { color: '#fff' } : undefined}>AERO MONGOLIA</div>
        <div className="brand-sub">VOYAGE E-BOARDING</div>
      </div>
    </div>
  );
}
