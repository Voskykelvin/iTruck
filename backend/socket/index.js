module.exports = function attachSocket(server) {
  const { Server } = require('socket.io');
  const logger = require('../config/logger');

  const rawOrigins = process.env.ALLOWED_ORIGINS || process.env.FRONTEND_URL || '*';
  const origins = rawOrigins
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  const corsOrigin = origins.includes('*') ? '*' : origins;

  const io = new Server(server, { cors: { origin: corsOrigin } });

  if (process.env.REDIS_URL) {
    const { createAdapter } = require('@socket.io/redis-adapter');
    const { createClient } = require('redis');
    const pubClient = createClient({ url: process.env.REDIS_URL });
    const subClient = pubClient.duplicate();

    Promise.all([pubClient.connect(), subClient.connect()])
      .then(() => {
        io.adapter(createAdapter(pubClient, subClient));
        logger.info('Socket.io Redis adapter connected');
      })
      .catch((err) => {
        logger.error({ err }, 'Socket.io Redis adapter failed');
      });
  }

  io.on('connection', (socket) => {
    socket.emit('connected', { id: socket.id });
    socket.on('join-booking', (id) => socket.join('booking:' + id));
    socket.on('update-location', (data) => io.to('booking:' + data.bookingId).emit('location-update', data));
    socket.on('send-message', (data) => io.to('booking:' + data.bookingId).emit('new-message', data));
  });

  io.emitToUser = (userId, event, data) => io.emit(event, { userId, ...data });
  io.emitToBooking = (bookingId, event, data) => io.to('booking:' + bookingId).emit(event, data);

  return io;
};
