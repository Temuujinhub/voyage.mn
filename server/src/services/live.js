// Socket.IO singleton — routes/services emit real-time events without
// importing the server bootstrap (avoids circular imports).
let io = null;

export function setIo(instance) {
  io = instance;
}

export function socketCount() {
  return io ? io.engine.clientsCount : 0;
}

export function emitFlight(flightId, event, payload) {
  if (!io) return;
  io.to(`flight:${flightId}`).emit(event, payload);
  io.to('dashboard').emit(event, payload);
}

export function emitGlobal(event, payload) {
  if (!io) return;
  io.to('dashboard').emit(event, payload);
}
