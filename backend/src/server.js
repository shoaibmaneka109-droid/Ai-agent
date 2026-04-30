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
const checkSubscription = require('./shared/middleware/checkSubscription');
const { blockWritesOnHibernation } = require('./shared/middleware/featureLock');
const { schedule } = require('./shared/utils/scheduler');
const { sweepExpiredTrials } = require('./modules/subscriptions/subscriptions.service');

// Route modules
const authRoutes = require('./modules/auth/auth.routes');
const usersRoutes = require('./modules/users/users.routes');
const organizationsRoutes = require('./modules/organizations/organizations.routes');
const apiKeysRoutes = require('./modules/api-keys/apiKeys.routes');
const paymentsRoutes = require('./modules/payments/payments.routes');
const subscriptionsRoutes = require('./modules/subscriptions/subscriptions.routes');

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

// ─── Subscription State (injected after authenticate in each router) ──────────
// Applied at the app level as a pass-through; it only activates when req.user
// exists (i.e. after authenticate has run in a given route's middleware chain).
// The blockWritesOnHibernation guard then enforces the hibernation policy.
app.use(checkSubscription);
app.use(blockWritesOnHibernation);

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
app.use(`${API}/organizations/:organizationId/subscription`, subscriptionsRoutes);

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

    // ── Background trial expiry sweep ────────────────────────────────────
    // Runs every hour; also executes once 5s after startup.
    // Lazy expiry in checkSubscription handles real-time precision;
    // this sweep catches orgs that haven't made a request yet.
    if (config.env !== 'test') {
      schedule('trial-expiry-sweep', 60 * 60 * 1000, sweepExpiredTrials, true);
    }
  } catch (err) {
    logger.error('Failed to start server', { error: err.message });
    process.exit(1);
  }
};

start();

module.exports = app;
