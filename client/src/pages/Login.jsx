import React, { useState } from 'react';
import { api, setToken } from '../api.js';
import { Icons } from '../ui.jsx';
import { LogoMark } from '../components/Logo.jsx';

export default function Login({ onLogin }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      const d = await api.post('/api/auth/login', { username, password });
      setToken(d.token);
      onLogin(d.user);
    } catch (ex) {
      setErr(ex.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="hero-page">
      <div className="hero-topbar">
        <LogoMark size={40} text={false} />
        <div>
          <div style={{ fontWeight: 800, letterSpacing: 0.5 }}>AERO MONGOLIA</div>
          <div style={{ fontSize: 10.5, color: '#7f9db8', letterSpacing: 1.2 }}>VOYAGE E-BOARDING SYSTEM</div>
        </div>
        <div className="right">STAFF PORTAL</div>
      </div>
      <div className="hero-body" style={{ justifyContent: 'center' }}>
        <form className="hero-card" onSubmit={submit}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 14 }}>
            <LogoMark size={84} />
          </div>
          <h2 style={{ fontSize: 19, marginBottom: 4, textAlign: 'center' }}>Ажилтны нэвтрэлт</h2>
          <p style={{ color: 'var(--muted)', margin: '0 0 18px', fontSize: 13 }}>
            Voyage системд нэвтрэхийн тулд бүртгэлтэй нэр, нууц үгээ оруулна уу.
          </p>
          {err && <div className="alert error" style={{ marginBottom: 14 }}><Icons.alert size={16} />{err}</div>}
          <div className="field">
            <label>Нэвтрэх нэр</label>
            <input value={username} onChange={(e) => setUsername(e.target.value)} autoFocus autoComplete="username" />
          </div>
          <div className="field">
            <label>Нууц үг</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
          </div>
          <button className="btn lg block" disabled={busy || !username || !password}>
            {busy ? 'Нэвтэрч байна…' : 'Нэвтрэх'}
          </button>
          <div style={{ marginTop: 16, fontSize: 12, color: 'var(--faint)', textAlign: 'center' }}>
            Зорчигч уу? <a href="/checkin-online">Онлайн check-in →</a>
          </div>
        </form>
        <div className="hero-foot">© {new Date().getFullYear()} Aero Mongolia — Voyage E-Boarding · voyage.mn</div>
      </div>
    </div>
  );
}
