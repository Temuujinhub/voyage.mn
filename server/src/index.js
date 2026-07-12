import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import express from 'express';
import helmet from 'helmet';
import jwt from 'jsonwebtoken';
import { Server as SocketIO } from 'socket.io';

import cfg from './config.js';
import { migrate } from './db/migrate.js';
import { seed } from './db/seed.js';
import { setIo } from './services/live.js';
import { startMailIngest } from './services/mailIngest.js';

import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import flightRoutes from './routes/flights.js';
import passengerRoutes from './routes/passengers.js';
import manifestRoutes from './routes/manifests.js';
import boardingRoutes from './routes/boarding.js';
import reportRoutes from './routes/reports.js';
import settingsRoutes from './routes/settings.js';
import aircraftRoutes from './routes/aircraft.js';
import publicRoutes from './routes/public.js';

const app = express();
app.set('trust proxy', 1); // behind nginx

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        imgSrc: ["'self'", 'data:', 'blob:'],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        connectSrc: ["'self'", 'ws:', 'wss:'],
        mediaSrc: ["'self'", 'blob:'], // camera preview for the gate scanner
        // Do NOT force subresources onto https — the app is reachable over plain
        // http:// until TLS is set up, and helmet's default upgrade-insecure-requests
        // would rewrite every asset URL to https://…:443 (no listener) → blank page.
        // Once behind HTTPS (certbot) everything is https anyway.
        upgradeInsecureRequests: null,
      },
    },
  })
);
app.use(express.json({ limit: '2mb' }));

app.get('/api/health', (req, res) => res.json({ ok: true, ts: new Date().toISOString() }));

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/flights', flightRoutes);
app.use('/api/passengers', passengerRoutes);
app.use('/api/manifests', manifestRoutes);
app.use('/api/boarding', boardingRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/aircraft', aircraftRoutes);
app.use('/api/public', publicRoutes);

// serve the built SPA
const clientDist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../client/dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist, { maxAge: '1h', index: false }));
  app.use((req, res, next) => {
    if (req.method !== 'GET' || req.path.startsWith('/api/')) return next();
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

// error handler
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  const status = err.status || (err.message?.includes('Excel') ? 400 : 500);
  res.status(status).json({ error: err.expose || status < 500 ? err.message : 'Серверийн алдаа гарлаа' });
});

const server = http.createServer(app);

const io = new SocketIO(server, { cors: { origin: false } });
io.use((socket, next) => {
  try {
    const token = socket.handshake.auth?.token;
    const payload = jwt.verify(token, cfg.jwtSecret);
    if (payload.kind !== 'staff') throw new Error('staff only');
    socket.data.user = payload;
    next();
  } catch {
    next(new Error('unauthorized'));
  }
});
io.on('connection', (socket) => {
  socket.join('dashboard');
  socket.on('watch-flight', (flightId) => {
    if (typeof flightId === 'string' && flightId.length < 64) socket.join(`flight:${flightId}`);
  });
  socket.on('unwatch-flight', (flightId) => socket.leave(`flight:${flightId}`));
});
setIo(io);

async function main() {
  await migrate();
  await seed();
  startMailIngest();
  server.listen(cfg.port, () => {
    console.log(`Voyage e-boarding server listening on :${cfg.port} (${cfg.env})`);
  });
}

main().catch((err) => {
  console.error('fatal:', err);
  process.exit(1);
});
