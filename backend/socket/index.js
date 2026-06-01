module.exports = function attachSocket(server) {
  const { Server } = require('socket.io');
  const jwt = require('jsonwebtoken');
  const logger = require('../config/logger');
  const { isLiveMode } = require('../config/runtime');

  const rawOrigins = process.env.ALLOWED_ORIGINS || process.env.FRONTEND_URL || '*';
  const origins = rawOrigins
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  const corsOrigin = origins.includes('*') ? '*' : origins;

  const io = new Server(server, { cors: { origin: corsOrigin } });

  function tokenFromHandshake(socket) {
    const header = socket.handshake.headers.authorization || '';
    if (header.startsWith('Bearer ')) return header.slice(7);
    return socket.handshake.auth?.token || socket.handshake.query?.token || '';
  }

  function validRoomId(id) {
    return /^[A-Za-z0-9:_-]{3,80}$/.test(String(id || ''));
  }

  io.use((socket, next) => {
    const token = tokenFromHandshake(socket);
    if (!token) {
      if (isLiveMode()) return next(new Error('Authentication required'));
      return next();
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'dev-secret');
      socket.user = { _id: decoded.id, role: decoded.role };
      return next();
    } catch (err) {
      logger.warn({ err }, 'Socket authentication failed');
      return next(new Error('Invalid token'));
    }
  });

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
    if (socket.user?._id) socket.join('user:' + socket.user._id);

    socket.on('join-booking', (id) => {
      if (!validRoomId(id)) return;
      socket.join('booking:' + id);
    });

    socket.on('update-location', () => {
      logger.warn({ socketId: socket.id, userId: socket.user?._id }, 'Client socket location updates are disabled');
    });

    socket.on('send-message', () => {
      logger.warn({ socketId: socket.id, userId: socket.user?._id }, 'Client socket messages are disabled');
    });
  });

  io.emitToUser = (userId, event, data) => io.to('user:' + userId).emit(event, data);
  io.emitToBooking = (bookingId, event, data) => io.to('booking:' + bookingId).emit(event, data);

  return io;
};
