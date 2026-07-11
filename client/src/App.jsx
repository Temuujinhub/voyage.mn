import React, { useEffect, useMemo, useState } from 'react';
import { BrowserRouter, Routes, Route, NavLink, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { api, setToken, getToken, setUnauthorizedHandler } from './api.js';
import { resetSocket, getSocket } from './socket.js';
import { Icons, ToastProvider } from './ui.jsx';
import { BrandBlock } from './components/Logo.jsx';
import { ROLE_MN } from './format.js';

import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Flights from './pages/Flights.jsx';
import FlightDetail from './pages/FlightDetail.jsx';
import Checkin from './pages/Checkin.jsx';
import Gate from './pages/Gate.jsx';
import Manifests from './pages/Manifests.jsx';
import Reports from './pages/Reports.jsx';
import Users from './pages/Users.jsx';
import Settings from './pages/Settings.jsx';
import SelfCheckin from './pages/SelfCheckin.jsx';

export const AuthCtx = React.createContext(null);

const STATION_NAME = { UB: 'Чингис хаан ОУНБ', OT: 'Ханбумбат (Оюу Толгой)' };

const NAV = [
  { to: '/', label: 'Dashboard', icon: 'dashboard', roles: ['admin', 'manager', 'agent'] },
  { to: '/flights', label: 'Нислэгүүд', icon: 'plane', roles: ['admin', 'manager', 'agent'] },
  { to: '/checkin', label: 'Check-in бүртгэл', icon: 'users', roles: ['admin', 'manager', 'agent'] },
  { to: '/gate', label: 'Gate / Скан', icon: 'scan', roles: ['admin', 'manager', 'agent'] },
  { to: '/manifests', label: 'Manifest', icon: 'upload', roles: ['admin', 'manager', 'ot_staff'] },
  { to: '/reports', label: 'Тайлан', icon: 'chart', roles: ['admin', 'manager'] },
  { to: '/users', label: 'Хэрэглэгчид', icon: 'users', roles: ['admin'], section: 'СИСТЕМ' },
  { to: '/settings', label: 'Тохиргоо', icon: 'settings', roles: ['admin'] },
];

function Shell({ user, onLogout, children }) {
  const [online, setOnline] = useState(true);
  const location = useLocation();
  const navigate = useNavigate();
  const [q, setQ] = useState('');

  useEffect(() => {
    const s = getSocket();
    if (!s) return;
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    s.on('connect', up); s.on('disconnect', down);
    return () => { s.off('connect', up); s.off('disconnect', down); };
  }, []);

  const items = NAV.filter((n) => n.roles.includes(user.role));
  return (
    <div className="shell">
      <aside className="sidebar no-print">
        <BrandBlock />
        <div className="nav-section">ҮЙЛ АЖИЛЛАГАА</div>
        {items.map((n) => (
          <React.Fragment key={n.to}>
            {n.section && <div className="nav-section">{n.section}</div>}
            <NavLink to={n.to} end={n.to === '/'} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
              {React.createElement(Icons[n.icon])}{n.label}
            </NavLink>
          </React.Fragment>
        ))}
        <div className="sidebar-footer">
          <div style={{ fontWeight: 650, fontSize: 13 }}>{user.full_name}</div>
          <div style={{ fontSize: 11.5, color: 'var(--faint)', margin: '2px 0 8px' }}>{ROLE_MN[user.role] || user.role}</div>
          <button className="nav-item" style={{ color: 'var(--red)' }} onClick={onLogout}>
            <Icons.logout />Гарах
          </button>
          <div style={{ fontSize: 11, color: 'var(--faint)', marginTop: 6 }}>
            <span className={`online-dot ${online ? '' : 'off'}`} />{online ? 'SERVER ONLINE' : 'OFFLINE'}
          </div>
        </div>
      </aside>
      <div className="main">
        <div className="topbar no-print">
          <form className="search" onSubmit={(e) => { e.preventDefault(); if (q.trim()) navigate(`/checkin?q=${encodeURIComponent(q.trim())}`); }}>
            <Icons.search size={16} style={{ color: 'var(--faint)' }} />
            <input placeholder="Зорчигч хайх — нэр, SAP ID, PNR, утас…" value={q} onChange={(e) => setQ(e.target.value)} />
          </form>
          <div className="userchip">
            {user.station && (
              <span className="badge blue" title="Таны ажиллаж буй буудал">
                {user.station} · {STATION_NAME[user.station] || user.station}
              </span>
            )}
            <div>
              <div style={{ fontWeight: 650, fontSize: 13 }}>{user.full_name}</div>
              <div style={{ fontSize: 11, color: 'var(--faint)', letterSpacing: 1 }}>{(user.role || '').toUpperCase()}</div>
            </div>
            <div className="avatar">{(user.full_name || '?').split(/\s+/).map((s) => s[0]).slice(0, 2).join('').toUpperCase()}</div>
          </div>
        </div>
        <div className="content" key={location.pathname}>{children}</div>
      </div>
    </div>
  );
}

function StaffApp() {
  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(!!getToken());
  const navigate = useNavigate();

  useEffect(() => {
    setUnauthorizedHandler(() => {
      setToken(null); resetSocket(); setUser(null);
    });
    if (getToken()) {
      api.get('/api/auth/me')
        .then((d) => setUser(d.user))
        .catch(() => setToken(null))
        .finally(() => setChecking(false));
    }
  }, []);

  const logout = () => { setToken(null); resetSocket(); setUser(null); navigate('/'); };

  if (checking) return <div className="spin" style={{ marginTop: 120 }} />;
  if (!user) return <Login onLogin={(u) => { setUser(u); resetSocket(); }} />;

  const home = user.role === 'ot_staff' ? '/manifests' : '/';
  return (
    <AuthCtx.Provider value={user}>
      <Shell user={user} onLogout={logout}>
        <Routes>
          <Route path="/" element={user.role === 'ot_staff' ? <Navigate to="/manifests" /> : <Dashboard />} />
          <Route path="/flights" element={<Flights />} />
          <Route path="/flights/:id" element={<FlightDetail />} />
          <Route path="/checkin" element={<Checkin />} />
          <Route path="/gate" element={<Gate />} />
          <Route path="/manifests" element={<Manifests />} />
          <Route path="/reports" element={<Reports />} />
          <Route path="/users" element={<Users />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<Navigate to={home} />} />
        </Routes>
      </Shell>
    </AuthCtx.Provider>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/checkin-online/*" element={<SelfCheckin />} />
          <Route path="*" element={<StaffApp />} />
        </Routes>
      </BrowserRouter>
    </ToastProvider>
  );
}
