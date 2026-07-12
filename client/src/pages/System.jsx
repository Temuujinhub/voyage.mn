import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';
import { Icons, Spinner, useToast } from '../ui.jsx';
import { fmtDateTime } from '../format.js';

const fmtBytes = (n) => {
  if (!Number.isFinite(n)) return '—';
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
  return `${Math.round(n * 10) / 10} ${units[i]}`;
};

const fmtUptime = (sec) => {
  if (!Number.isFinite(sec)) return '—';
  const d = Math.floor(sec / 86400), h = Math.floor((sec % 86400) / 3600), m = Math.floor((sec % 3600) / 60);
  return d ? `${d}ө ${h}ц ${m}м` : h ? `${h}ц ${m}м` : `${m}м`;
};

function HealthCard({ title, ok, icon, children }) {
  const Ico = Icons[icon] || Icons.settings;
  return (
    <div className="card card-pad" style={{ flex: '1 1 220px', minWidth: 220 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <Ico size={17} style={{ color: ok ? 'var(--green, #14a44d)' : 'var(--red)' }} />
        <h3 style={{ flex: 1, fontSize: 14 }}>{title}</h3>
        <span className={`badge ${ok ? 'green' : 'red'}`}>{ok ? 'OK' : 'АЛДАА'}</span>
      </div>
      <div style={{ fontSize: 12.5, display: 'grid', gap: 5 }}>{children}</div>
    </div>
  );
}

const Row = ({ k, v }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
    <span style={{ color: 'var(--muted)' }}>{k}</span>
    <b style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{v}</b>
  </div>
);

export default function System() {
  const toast = useToast();
  const [health, setHealth] = useState(null);
  const [healthErr, setHealthErr] = useState(null);

  const [actions, setActions] = useState([]);
  const [filters, setFilters] = useState({ action: '', username: '', qtext: '' });
  const [page, setPage] = useState(0);
  const [auditData, setAuditData] = useState(null);
  const [expanded, setExpanded] = useState(null);
  const LIMIT = 50;

  const loadHealth = () => {
    setHealthErr(null);
    api.get('/api/admin/health').then(setHealth).catch((ex) => setHealthErr(ex.message));
  };

  useEffect(() => {
    loadHealth();
    api.get('/api/admin/audit/actions').then((d) => setActions(d.actions)).catch(() => {});
    const t = setInterval(loadHealth, 30000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams({ limit: LIMIT, offset: page * LIMIT });
    for (const [k, v] of Object.entries(filters)) if (v) params.set(k, v);
    api.get(`/api/admin/audit?${params}`).then(setAuditData).catch((ex) => toast(ex.message, 'error'));
  }, [filters, page]);

  const pages = useMemo(() => (auditData ? Math.ceil(auditData.total / LIMIT) : 0), [auditData]);

  return (
    <>
      <div className="page-head">
        <h1>Систем · Health check</h1>
        <button className="btn ghost sm" onClick={loadHealth}><Icons.scan size={14} />Шинэчлэх</button>
      </div>

      {healthErr && <div className="alert error" style={{ marginBottom: 14 }}><Icons.alert size={16} />{healthErr}</div>}
      {!health && !healthErr && <Spinner />}

      {health && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, marginBottom: 22 }}>
          <HealthCard title="Өгөгдлийн сан (PostgreSQL)" ok={health.database?.ok} icon="file">
            <Row k="Хариу өгөх хугацаа" v={`${health.database.latency_ms} ms`} />
            <Row k="Хувилбар" v={health.database.version || '—'} />
            <Row k="Хэмжээ" v={fmtBytes(health.database.size_bytes)} />
            <Row k="Connection pool" v={`${health.database.pool?.total ?? 0} нээлттэй / ${health.database.pool?.idle ?? 0} сул`} />
            {health.database.counts && (
              <Row k="Нислэг / Зорчигч / Ачаа" v={`${health.database.counts.flights} / ${health.database.counts.passengers} / ${health.database.counts.baggage}`} />
            )}
            {health.database.error && <span style={{ color: 'var(--red)' }}>{health.database.error}</span>}
          </HealthCard>

          <HealthCard title="Аппликэйшн сервер" ok={health.server?.ok} icon="settings">
            <Row k="Ажилласан хугацаа" v={fmtUptime(health.server.uptime_seconds)} />
            <Row k="Орчин / Node" v={`${health.server.env} · ${health.server.node}`} />
            <Row k="Санах ой (RSS)" v={fmtBytes(health.server.memory?.rss)} />
            <Row k="Heap" v={`${fmtBytes(health.server.memory?.heap_used)} / ${fmtBytes(health.server.memory?.heap_total)}`} />
            <Row k="Load average" v={(health.server.load_avg || []).join(' · ')} />
          </HealthCard>

          <HealthCard title="Real-time (Socket.IO)" ok={health.realtime?.ok} icon="scan">
            <Row k="Холбогдсон төхөөрөмж" v={health.realtime.connected_clients} />
            <span className="hint">Check-in, gate скан дэлгэцүүдийн шууд холболт</span>
          </HealthCard>

          <HealthCard title="И-мэйл (Manifest IMAP)" ok={health.mail_ingest?.ok} icon="mail">
            <Row k="Төлөв" v={health.mail_ingest.enabled ? 'Идэвхтэй' : 'Унтраалттай'} />
            <Row k="Хост" v={health.mail_ingest.host || '—'} />
            {health.mail_ingest.last_event ? (
              <>
                <Row k="Сүүлийн үйлдэл" v={health.mail_ingest.last_event.status} />
                <Row k="Хэзээ" v={fmtDateTime(health.mail_ingest.last_event.created_at)} />
              </>
            ) : <span className="hint">Одоогоор бүртгэл алга</span>}
          </HealthCard>

          <HealthCard title="СМС (OTP)" ok={health.sms?.ok} icon="shield">
            <Row k="Горим" v={health.sms.mode === 'sms_gateway' ? 'CallPro gateway' : 'DEV (дэлгэцэнд)'} />
            <Row k="Gateway" v={health.sms.gateway_enabled ? 'Идэвхтэй' : 'Идэвхгүй'} />
          </HealthCard>
        </div>
      )}

      <div className="page-head" style={{ marginTop: 6 }}>
        <h1 style={{ fontSize: 20 }}>Audit log</h1>
        {auditData && <span className="badge blue">{auditData.total} бичлэг</span>}
      </div>

      <div className="card card-pad" style={{ marginBottom: 14 }}>
        <div className="formgrid">
          <div className="field"><label>Үйлдэл</label>
            <select value={filters.action} onChange={(e) => { setPage(0); setFilters({ ...filters, action: e.target.value }); }}>
              <option value="">— Бүгд —</option>
              {actions.map((a) => <option key={a} value={a}>{a}</option>)}
            </select></div>
          <div className="field"><label>Хэрэглэгч</label>
            <input placeholder="username" value={filters.username}
              onChange={(e) => { setPage(0); setFilters({ ...filters, username: e.target.value }); }} /></div>
          <div className="field"><label>Хайх (ID / дэлгэрэнгүй)</label>
            <input placeholder="entity id, PNR, тайлбар…" value={filters.qtext}
              onChange={(e) => { setPage(0); setFilters({ ...filters, qtext: e.target.value }); }} /></div>
        </div>
      </div>

      <div className="card">
        <div className="tablewrap">
          <table className="tbl">
            <thead><tr><th>Огноо</th><th>Хэрэглэгч</th><th>Үйлдэл</th><th>Объект</th><th>IP</th><th></th></tr></thead>
            <tbody>
              {!auditData && <tr><td colSpan={6}><Spinner /></td></tr>}
              {auditData?.rows.length === 0 && (
                <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--faint)', padding: 24 }}>Бичлэг олдсонгүй</td></tr>
              )}
              {auditData?.rows.map((r) => (
                <React.Fragment key={r.id}>
                  <tr style={{ cursor: 'pointer' }} onClick={() => setExpanded(expanded === r.id ? null : r.id)}>
                    <td style={{ whiteSpace: 'nowrap' }}>{fmtDateTime(r.ts)}</td>
                    <td><b>{r.username || '—'}</b>{r.role && <span style={{ color: 'var(--faint)', fontSize: 11 }}> · {r.role}</span>}</td>
                    <td><span className="badge blue">{r.action}</span></td>
                    <td style={{ fontFamily: 'var(--mono)', fontSize: 11.5 }}>{r.entity || '—'}{r.entity_id ? ` #${String(r.entity_id).slice(0, 8)}` : ''}</td>
                    <td style={{ fontSize: 11.5, color: 'var(--muted)' }}>{r.ip || '—'}</td>
                    <td style={{ color: 'var(--faint)' }}>{expanded === r.id ? '▲' : '▼'}</td>
                  </tr>
                  {expanded === r.id && (
                    <tr><td colSpan={6} style={{ background: 'var(--bg)', fontFamily: 'var(--mono)', fontSize: 11.5, whiteSpace: 'pre-wrap' }}>
                      {JSON.stringify(r.details, null, 2)}
                    </td></tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
        {pages > 1 && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'center', padding: 12 }}>
            <button className="btn ghost sm" disabled={page === 0} onClick={() => setPage(page - 1)}>← Өмнөх</button>
            <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>{page + 1} / {pages}</span>
            <button className="btn ghost sm" disabled={page + 1 >= pages} onClick={() => setPage(page + 1)}>Дараах →</button>
          </div>
        )}
      </div>
    </>
  );
}
