require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const http = require('http');
const fs = require('fs');
const path = require('path');
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const pinoHttp = require('pino-http');
const mongoSanitize = require('express-mongo-sanitize');
const hpp = require('hpp');
const logger = require('./config/logger');
const { assertRuntimeConfig, isLiveMode } = require('./config/runtime');
const { apiLimiter, authLimiter, errorHandler } = require('./middleware/security');
const { stripeRouter } = require('./routes/webhooks');

const app = express();
const server = http.createServer(app);
const io = require('./socket')(server);
const frontendDir = path.join(__dirname, '../frontend');
const reactAppIndex = path.join(frontendDir, 'app/index.html');
const legacyIndex = path.join(frontendDir, 'index.html');
const legacyRouteMap = {
  '/pages/dashboard-client.html': '/app/shipper',
  '/pages/dashboard-owner.html': '/app/owner',
  '/pages/book-truck.html': '/app/book',
  '/pages/tracking.html': '/app/tracking',
  '/pages/driver-contact.html': '/app/tracking',
  '/pages/listings.html': '/app/marketplace',
  '/pages/truck-profile.html': '/app/marketplace',
  '/pages/profile.html': '/app/profile',
  '/pages/admin/admin-dashboard.html': '/app/admin'
};

function sendReactApp(req, res, next) {
  if (!fs.existsSync(reactAppIndex)) return next();
  return res.sendFile(reactAppIndex);
}

function sendFrontendIndex(req, res) {
  if (fs.existsSync(reactAppIndex)) return res.sendFile(reactAppIndex);
  return res.sendFile(legacyIndex);
}

function corsOptions() {
  const rawOrigins = process.env.ALLOWED_ORIGINS || process.env.FRONTEND_URL || '*';
  const origins = rawOrigins.split(',').map(origin => origin.trim()).filter(Boolean);

  if (origins.includes('*')) {
    return { origin: '*', credentials: false };
  }

  return {
    origin(origin, callback) {
      if (!origin || origins.includes(origin)) return callback(null, true);
      callback(new Error('Origin is not allowed by CORS'));
    },
    credentials: true
  };
}

app.set('io', io);
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors(corsOptions()));
app.use(pinoHttp({
  logger,
  autoLogging: process.env.NODE_ENV === 'test' ? false : {
    ignore: req => req.url === '/api/health'
  }
}));
app.use('/api/webhooks/stripe', apiLimiter, express.raw({ type: 'application/json', limit: '2mb' }), stripeRouter);
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(mongoSanitize());
app.use(hpp());
app.use('/api', apiLimiter);

app.use('/api/auth', authLimiter, require('./routes/auth'));
app.use('/api/users', require('./routes/users'));
app.use('/api/trucks', require('./routes/trucks'));
app.use('/api/bookings', require('./routes/bookings'));
app.use('/api/payments', require('./routes/payments'));
app.use('/api/documents', require('./routes/documents'));
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/upload', require('./routes/upload'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/marketplace', require('./routes/marketplace'));
app.use('/api/workflow', require('./routes/workflow'));

app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    platform: 'iTruck Africa',
    version: '1.0.0',
    timestamp: new Date().toISOString()
  });
});

app.get(Object.keys(legacyRouteMap), (req, res) => {
  res.redirect(308, legacyRouteMap[req.path]);
});

app.use(express.static(frontendDir, { index: false }));
app.get('/', sendFrontendIndex);
app.get(['/app', '/app/*'], sendReactApp);
app.get('*', (req, res) => {
  sendFrontendIndex(req, res);
});

app.use(errorHandler);

const PORT = process.env.PORT || 5000;

mongoose.connection.on('connected', () => {
  logger.info('Mongoose default connection open.');
});

mongoose.connection.on('error', err => {
  logger.error({ err }, 'Mongoose default connection error');
});

mongoose.connection.on('disconnected', () => {
  logger.warn('Mongoose default connection disconnected.');
});

async function start() {
  let mode = 'demo';
  try {
    mode = assertRuntimeConfig();
    if (process.env.MONGODB_URI) {
      await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 3500 });
      logger.info('MongoDB connected');
    } else if (mode === 'live') {
      throw new Error('MONGODB_URI is required in live mode');
    }
  } catch (err) {
    if (mode === 'live' || err.code === 'RUNTIME_CONFIG' || isLiveMode()) {
      logger.error({ err }, 'Live startup failed');
      process.exit(1);
    }
    logger.warn({ err }, 'MongoDB unavailable, API will use limited in-memory fallbacks');
  }

  server.listen(PORT, () => logger.info({ port: PORT }, 'iTruck API running'));
}

if (require.main === module) start();

function shutdown() {
  server.close(() => mongoose.disconnect().finally(() => process.exit(0)));
  setTimeout(() => process.exit(1), 10000).unref();
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

module.exports = { app, server, io };
