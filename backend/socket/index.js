const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const Booking = require('../models/Booking');
const User = require('../models/User');
const logger = require('../config/logger');
const { mongoReady } = require('../config/runtime');
const { ACCESS_COOKIE } = require('../services/authCookies');
const socketRoles = new Set(['admin', 'client', 'owner', 'driver']);

function socketUserFromToken(token) {
  if (!token) throw new Error('Authentication required');

  const decoded = jwt.verify(token, process.env.JWT_SECRET || 'dev-secret');
  if (!decoded.id || !socketRoles.has(decoded.role)) throw new Error('Invalid token claims');

  return { _id: decoded.id, role: decoded.role };
}

function bookingRoomQuery(user, bookingId) {
  if (!user?._id) return null;
  if (user.role === 'admin') return { _id: bookingId };
  if (user.role === 'client') return { _id: bookingId, client: user._id };
  if (user.role === 'owner') {
    return {
      _id: bookingId,
      $or: [{ owner: user._id }, { 'bids.owner': user._id }]
    };
  }
  if (user.role === 'driver') return { _id: bookingId, driver: user._id };
  return null;
}

async function canJoinBookingRoom(user, bookingId) {
  if (!user?._id) return false;
  if (!mongoReady()) return true;
  if (!mongoose.Types.ObjectId.isValid(bookingId)) return false;

  const query = bookingRoomQuery(user, bookingId);
  return query ? Boolean(await Booking.exists(query)) : false;
}

function attachSocket(server) {
  const { Server } = require('socket.io');

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
    const cookieHeader = socket.handshake.headers.cookie || '';
    const cookieToken = cookieHeader
      .split(';')
      .map((part) => part.trim().split('='))
      .find(([name]) => name === ACCESS_COOKIE)?.[1];
    return socket.handshake.auth?.token || socket.handshake.query?.token || decodeURIComponent(cookieToken || '');
  }

  function validRoomId(id) {
    return /^[A-Za-z0-9:_-]{3,80}$/.test(String(id || ''));
  }

  io.use((socket, next) => {
    const token = tokenFromHandshake(socket);

    try {
      socket.user = socketUserFromToken(token);
    } catch (err) {
      logger.warn({ err }, 'Socket authentication failed');
      return next(new Error(err.message === 'Authentication required' ? err.message : 'Invalid token'));
    }

    if (!mongoReady()) return next();

    return User.findById(socket.user._id)
      .select('_id role isActive')
      .then((user) => {
        if (!user || user.isActive === false) return next(new Error('Account unavailable'));
        socket.user = { _id: user._id, role: user.role };
        return next();
      })
      .catch((err) => {
        logger.error({ err, userId: socket.user?._id }, 'Socket user lookup failed');
        return next(new Error('Authentication unavailable'));
      });
  });

  if (process.env.REDIS_URL) {
    const { createAdapter } = require('@socket.io/redis-adapter');
    const { createClient } = require('redis');
    const pubClient = createClient({ url: process.env.REDIS_URL });
    const subClient = pubClient.duplicate();
    io.redisClients = [pubClient, subClient];

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

    socket.on('join-booking', async (id, acknowledge = () => {}) => {
      if (!validRoomId(id)) return acknowledge({ ok: false, error: 'Invalid booking id' });

      try {
        if (!(await canJoinBookingRoom(socket.user, id))) {
          logger.warn({ socketId: socket.id, userId: socket.user?._id, bookingId: id }, 'Socket room access denied');
          return acknowledge({ ok: false, error: 'Forbidden' });
        }

        await socket.join('booking:' + id);
        return acknowledge({ ok: true });
      } catch (err) {
        logger.error({ err, socketId: socket.id, userId: socket.user?._id, bookingId: id }, 'Socket room join failed');
        return acknowledge({ ok: false, error: 'Unable to join booking room' });
      }
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
  io.closeRedis = async () => {
    const clients = io.redisClients || [];
    await Promise.all(
      clients.map((client) => {
        if (!client?.isOpen) return Promise.resolve();
        return client.quit().catch((err) => {
          logger.error({ err }, 'Socket.io Redis client shutdown failed');
        });
      })
    );
  };

  return io;
}

module.exports = attachSocket;
module.exports.bookingRoomQuery = bookingRoomQuery;
module.exports.canJoinBookingRoom = canJoinBookingRoom;
module.exports.socketUserFromToken = socketUserFromToken;
