import React, { createContext, useCallback, useContext, useState } from 'react';
import { FLIGHT_STATUS, PAX_STATUS } from './format.js';

/* ─── Icons (inline, stroke style) ─────────────────────────── */
const I = (path, vb = '0 0 24 24') => ({ size = 18, ...p }) => (
  <svg width={size} height={size} viewBox={vb} fill="none" stroke="currentColor"
    strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" {...p}>{path}</svg>
);
export const Icons = {
  dashboard: I(<><rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/></>),
  plane: I(<path d="M10.5 20.5 13 14l5.5-5.5c1.2-1.2 1.7-2.9 1-3.9-1-.7-2.7-.2-3.9 1L10 11 3.5 13.5l1.8 1.8 4.2-1.3 2 2-1.3 4.2 0.3 0.3Z"/>),
  users: I(<><circle cx="9" cy="8" r="3.5"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M17.5 14.6c2 .8 3.5 2.9 3.5 5.4"/></>),
  scan: I(<><path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2"/><path d="M4 12h16"/></>),
  file: I(<><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z"/><path d="M14 3v5h5M9 13h6M9 17h6"/></>),
  chart: I(<><path d="M4 20V6M4 20h16"/><rect x="8" y="11" width="3" height="6" rx="0.8"/><rect x="13" y="7" width="3" height="10" rx="0.8"/></>),
  settings: I(<><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.55V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1-1.55 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.55-1H3a2 2 0 1 1 0-4h.09a1.7 1.7 0 0 0 1.55-1 1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34h.01a1.7 1.7 0 0 0 1-1.55V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 1.55 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87v.01a1.7 1.7 0 0 0 1.55 1H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.55 1Z"/></>),
  upload: I(<><path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/></>),
  download: I(<><path d="M12 4v12M7 11l5 5 5-5"/><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/></>),
  logout: I(<><path d="M9 21H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3M16 17l5-5-5-5M21 12H9"/></>),
  search: I(<><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></>),
  bag: I(<><rect x="5" y="8" width="14" height="12" rx="2"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/></>),
  printer: I(<><path d="M6 9V3h12v6"/><rect x="3" y="9" width="18" height="8" rx="2"/><path d="M6 14h12v7H6z"/></>),
  check: I(<path d="m4.5 12.5 5 5 10-11"/>),
  x: I(<path d="M6 6l12 12M18 6 6 18"/>),
  clock: I(<><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></>),
  gate: I(<><path d="M5 21V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16"/><path d="M3 21h18M12 3v6"/><circle cx="12" cy="13" r="2"/></>),
  mail: I(<><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m4 7 8 6 8-6"/></>),
  shield: I(<><path d="M12 3 5 6v5c0 4.5 3 8.4 7 10 4-1.6 7-5.5 7-10V6Z"/><path d="m9 11.5 2 2 4-4.5"/></>),
  qr: I(<><rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><path d="M14 14h2v2h-2zM18 14h2v2h-2zM14 18h2v2h-2zM18 18h2v2h-2z"/></>),
  seat: I(<><path d="M6 4v9a2 2 0 0 0 2 2h8"/><path d="M6 13h9a3 3 0 0 1 3 3v4"/><path d="M5 20h9"/></>),
  alert: I(<><path d="M12 3 2.5 19.5h19Z"/><path d="M12 9.5V14M12 16.8v.2"/></>),
};

/* ─── Badges ─────────────────────────────────────── */
export function StatusBadge({ status, map }) {
  const m = (map || FLIGHT_STATUS)[status] || { mn: status, color: 'gray' };
  return <span className={`badge ${m.color}`}>{status}{m.mn && m.mn !== status ? ` · ${m.mn}` : ''}</span>;
}
export const FlightBadge = ({ status }) => <StatusBadge status={status} map={FLIGHT_STATUS} />;
export const PaxBadge = ({ status }) => <StatusBadge status={status} map={PAX_STATUS} />;

export function Avatar({ name }) {
  const initials = (name || '?').split(/\s+/).map((s) => s[0]).slice(0, 2).join('').toUpperCase();
  return <div className="avatar-sm">{initials}</div>;
}

/* ─── Modal ──────────────────────────────────────── */
export function Modal({ title, onClose, children, wide }) {
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className={`modal ${wide ? 'wide' : ''}`}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
          <h2 style={{ marginBottom: 0, flex: 1 }}>{title}</h2>
          <button className="btn ghost sm" onClick={onClose}><Icons.x size={16} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

/* ─── Toasts ─────────────────────────────────────── */
const ToastCtx = createContext(null);
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const push = useCallback((msg, type = 'info') => {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t, { id, msg, type }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4200);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toast-wrap">
        {toasts.map((t) => <div key={t.id} className={`toast ${t.type}`}>{t.msg}</div>)}
      </div>
    </ToastCtx.Provider>
  );
}
export const useToast = () => useContext(ToastCtx);

export function Stat({ label, value, sub, icon }) {
  return (
    <div className="stat">
      <div className="label">{label}</div>
      <div className="value">{value}{sub && <small> {sub}</small>}</div>
      {icon && <div className="icon">{icon}</div>}
    </div>
  );
}

export const Spinner = () => <div className="spin" />;
