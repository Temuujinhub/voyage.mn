import React from 'react';

// Aero Mongolia roundel (falcon mark). To swap in the official artwork later,
// replace client/public/logo.svg and this component's paths — every usage
// (sidebar, login, self check-in, boarding pass, favicon) picks it up.
export function LogoMark({ size = 40, text = true }) {
  return (
    <svg viewBox="0 0 200 200" width={size} height={size} aria-label="Aero Mongolia">
      <defs>
        <clipPath id="lgc"><circle cx="100" cy="100" r="96" /></clipPath>
        <path id="lga" d="M 18 100 A 84 84 0 0 0 178 136" fill="none" />
      </defs>
      <circle cx="100" cy="100" r="96" fill="#39b7e9" />
      <g clipPath="url(#lgc)">
        <path fill="#ffffff" d="M 78 16 C 112 4 144 22 152 52 C 158 76 152 100 148 124 C 145 148 147 174 151 200 L 62 200 C 68 172 66 148 58 130 C 52 116 42 108 34 99 C 28 92 26 86 29 80 C 24 72 27 63 36 61 C 40 48 50 36 62 27 C 67 22 72 18 78 16 Z" />
        <path fill="#ffffff" stroke="#243a8f" strokeWidth="6" strokeLinejoin="round" d="M 44 60 C 32 54 20 58 16 68 C 13 78 20 87 30 88 C 27 94 30 101 38 101 C 46 101 51 93 52 86" />
        <path fill="none" stroke="#243a8f" strokeWidth="4.5" strokeLinecap="round" d="M 20 82 C 34 84 48 88 58 96" />
        <path fill="none" stroke="#243a8f" strokeWidth="10" strokeLinecap="round" d="M 42 60 C 62 50 88 48 104 56" />
        <circle cx="80" cy="70" r="14" fill="#243a8f" />
        <circle cx="80" cy="70" r="8" fill="#ffffff" />
        <circle cx="77" cy="67" r="4.2" fill="#243a8f" />
        <path fill="none" stroke="#243a8f" strokeWidth="7" strokeLinecap="round" d="M 78 16 C 112 4 144 22 152 52 C 158 76 152 100 148 124 C 145 148 147 174 151 200" />
      </g>
      {text && (
        <text fontFamily="Arial, Helvetica, sans-serif" fontSize="19" fontWeight="bold" fill="#243a8f" letterSpacing="2">
          <textPath href="#lga" startOffset="8">AERO MONGOLIA</textPath>
        </text>
      )}
    </svg>
  );
}

export function BrandBlock({ dark = false }) {
  return (
    <div className="brand">
      <LogoMark size={42} text={false} />
      <div>
        <div className="brand-name" style={dark ? { color: '#fff' } : undefined}>AERO MONGOLIA</div>
        <div className="brand-sub">VOYAGE E-BOARDING</div>
      </div>
    </div>
  );
}
