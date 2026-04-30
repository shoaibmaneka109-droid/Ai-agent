require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const morgan = require('morgan');

const config = require('./config');
const logger = require('./shared/utils/logger');
const { testConnection } = require('./config/database');
const { defaultLimiter } = require('./shared/middleware/rateLimiter');
const errorHandler = require('./shared/middleware/errorHandler');

// Route modules
const authRoutes = require('./modules/auth/auth.routes');
const usersRoutes = require('./modules/users/users.routes');
const organizationsRoutes = require('./modules/organizations/organizations.routes');
const apiKeysRoutes = require('./modules/api-keys/apiKeys.routes');
const paymentsRoutes = require('./modules/payments/payments.routes');

const app = express();

// ─── Security & Parsing ───────────────────────────────────────────────────────
app.use(helmet());
app.use(cors({ origin: config.cors.origin, credentials: config.cors.credentials }));
app.use(compression());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// ─── Logging ──────────────────────────────────────────────────────────────────
if (config.env !== 'test') {
  app.use(morgan('combined', { stream: { write: (msg) => logger.info(msg.trim()) } }));
}

// ─── Global Rate Limiting ─────────────────────────────────────────────────────
app.use('/api', defaultLimiter);

// ─── Health Check ─────────────────────────────────────────────────────────────
app.get('/health', async (req, res) => {
  try {
    const db = await testConnection();
    res.json({
      status: 'ok',
      env: config.env,
      timestamp: new Date().toISOString(),
      db: { connected: true, serverTime: db.now },
    });
  } catch {
    res.status(503).json({ status: 'error', db: { connected: false } });
  }
});

// ─── API Routes ───────────────────────────────────────────────────────────────
const API = '/api/v1';

app.use(`${API}/auth`, authRoutes);
app.use(`${API}/users`, usersRoutes);
app.use(`${API}/organizations`, organizationsRoutes);
app.use(`${API}/organizations/:organizationId/api-keys`, apiKeysRoutes);
app.use(`${API}/organizations/:organizationId/payments`, paymentsRoutes);

// ─── 404 Handler ──────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: { code: 'NOT_FOUND', message: `Route ${req.method} ${req.path} not found` },
  });
});

// ─── Global Error Handler ─────────────────────────────────────────────────────
app.use(errorHandler);

// ─── Start ────────────────────────────────────────────────────────────────────
const start = async () => {
  try {
    await testConnection();
    logger.info('Database connection verified');

    app.listen(config.port, () => {
      logger.info(`SecurePay API running on port ${config.port} [${config.env}]`);
    });
  } catch (err) {
    logger.error('Failed to start server', { error: err.message });
    process.exit(1);
  }
};

start();

module.exports = app;
