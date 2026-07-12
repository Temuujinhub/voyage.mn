import React from 'react';

// Official Aero Mongolia artwork lives in client/public:
//   /logo.png       — full horizontal lockup (roundel + wordmark + tagline)
//   /logo-mark.png  — square roundel only (cropped from the lockup)
//   /logo-full.png  — trimmed horizontal lockup for wide headers
// LogoMark renders the square roundel; FullLogo renders the horizontal lockup.

export function LogoMark({ size = 40 }) {
  return (
    <img
      src="/logo-mark.png"
      width={size}
      height={size}
      alt="Aero Mongolia"
      style={{ display: 'block', objectFit: 'contain', flex: `0 0 ${size}px` }}
    />
  );
}

// Horizontal lockup for login / self check-in headers where width allows.
export function FullLogo({ height = 48 }) {
  return (
    <img
      src="/logo-full.png"
      alt="Aero Mongolia — Mongolia Starts Here"
      style={{ display: 'block', height, width: 'auto', maxWidth: '100%' }}
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
